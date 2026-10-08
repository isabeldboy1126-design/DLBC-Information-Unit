"""
Media Receiver & Upload API Router
Provides:
1. Authenticated endpoints for Information Unit staff to manage their account's
   unique secure Media Upload Link, view the Media Inbox, and process received recordings.
2. Public lightweight upload endpoints for Media team members to submit audio recordings
   WITHOUT logging into the application.
"""

import asyncio
import os
import shutil
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account
from app.config import STORAGE_UPLOADS_DIR
from app.database.account_repo import account_repo
from app.database.media_repo import extract_image_metadata, media_repo
from app.database.programmes_repo import programmes_repo
from app.database.session_repo import session_repo
from app.transcription.audio_extractor import probe_media_duration
from app.transcription.transcription_manager import transcription_manager

router = APIRouter(prefix="/api/media", tags=["Media Receiver"])

ALLOWED_AUDIO_EXTENSIONS = {
    ".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".webm", ".wma", ".opus"
}
ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp"
}
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB


class RegenerateTokenRequest(BaseModel):
    pin_code: Optional[str] = None


class UpdateRecordingRequest(BaseModel):
    title: Optional[str] = None
    event: Optional[str] = None
    programme: Optional[str] = None
    day_number: Optional[int] = None
    pastor_name: Optional[str] = None


class ProcessRecordingRequest(BaseModel):
    title: Optional[str] = None
    event: Optional[str] = None
    programme: Optional[str] = None
    day_number: Optional[int] = None
    pastor_name: Optional[str] = None


# -------------------------------------------------------------------------
# AUTHENTICATED ENDPOINTS (For Information Unit Staff inside the App)
# -------------------------------------------------------------------------

@router.get("/token")
async def get_media_token(auth: AuthContext = Depends(require_account)):
    """Gets the active secure Media Upload token for the current account."""
    token_data = await media_repo.get_or_create_token(auth.account_id)
    return {
        "status": "success",
        "token": token_data["token"],
        "label": token_data["label"],
        "has_pin": bool(token_data.get("pin_code")),
        "created_at": token_data["created_at"],
    }


@router.post("/token/regenerate")
async def regenerate_media_token(
    payload: RegenerateTokenRequest = RegenerateTokenRequest(),
    auth: AuthContext = Depends(require_account),
):
    """Revokes the current media upload link and generates a fresh one."""
    token_data = await media_repo.regenerate_token(auth.account_id, pin_code=payload.pin_code)
    return {
        "status": "success",
        "token": token_data["token"],
        "label": token_data["label"],
        "has_pin": bool(token_data.get("pin_code")),
        "created_at": token_data["created_at"],
    }


@router.post("/token/revoke")
async def revoke_media_token(auth: AuthContext = Depends(require_account)):
    """Revokes the active media upload link for the account."""
    await media_repo.revoke_token(auth.account_id)
    return {"status": "success", "message": "Upload link has been revoked."}


# -------------------------------------------------------------------------
# PHOTO ASSETS ENDPOINTS
# -------------------------------------------------------------------------

@router.get("/assets")
async def list_media_assets(
    asset_type: Optional[str] = Query(default="photo"),
    search: Optional[str] = Query(default=None),
    auth: AuthContext = Depends(require_account),
):
    """Lists media assets (photos by default) for the authenticated account."""
    assets = await media_repo.list_assets(
        account_id=auth.account_id,
        asset_type=asset_type,
        search_query=search,
    )
    return {
        "status": "success",
        "total": len(assets),
        "assets": assets,
    }


@router.get("/assets/{asset_id}")
async def get_media_asset(
    asset_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Gets details of a single media asset."""
    asset = await media_repo.get_asset(auth.account_id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return asset


@router.get("/assets/{asset_id}/view")
async def view_media_asset(
    asset_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Streams the media asset image for in-app viewing."""
    asset = await media_repo.get_asset(auth.account_id, asset_id)
    if not asset or not asset.get("file_path") or not os.path.exists(asset["file_path"]):
        raise HTTPException(status_code=404, detail="Media asset file not found on disk.")

    mime = asset.get("mime_type") or "image/jpeg"
    return FileResponse(
        asset["file_path"],
        media_type=mime,
        filename=asset.get("original_filename") or f"{asset_id}.jpg",
    )


@router.delete("/assets/{asset_id}")
async def delete_media_asset(
    asset_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Deletes a media asset and its physical file from disk."""
    success = await media_repo.delete_asset(auth.account_id, asset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return {"status": "success", "deleted_id": asset_id}


@router.post("/assets/upload")
async def in_app_upload_photo(
    files: List[UploadFile] = File(...),
    caption: Optional[str] = Form(default=None),
    auth: AuthContext = Depends(require_account),
):
    """Direct in-app photo upload for Information Unit staff."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    os.makedirs(STORAGE_UPLOADS_DIR, exist_ok=True)
    saved = []
    for f in files:
        if not f or not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
            )
        f_path = os.path.join(STORAGE_UPLOADS_DIR, f"photo_{uuid.uuid4().hex[:10]}_{f.filename}")
        file_size = 0
        with open(f_path, "wb") as f_out:
            while chunk := await f.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > MAX_UPLOAD_SIZE:
                    f_out.close()
                    if os.path.exists(f_path):
                        os.remove(f_path)
                    raise HTTPException(status_code=413, detail="File exceeds 500MB limit.")
                f_out.write(chunk)

        meta = extract_image_metadata(f_path)
        asset = await media_repo.create_asset(
            account_id=auth.account_id,
            file_path=f_path,
            original_filename=f.filename,
            file_size=file_size,
            mime_type=meta.get("mime_type") or "image/jpeg",
            asset_type="photo",
            submission_id=None,
            width=meta.get("width") or 0,
            height=meta.get("height") or 0,
            title=f.filename,
            caption=caption,
        )
        saved.append(asset)

    return {
        "status": "success",
        "total": len(saved),
        "assets": saved,
    }


@router.get("/recordings")
async def list_media_recordings(
    status_filter: Optional[str] = Query(default="all"),
    search: Optional[str] = Query(default=None),
    auth: AuthContext = Depends(require_account),
):
    """Lists received recordings in the Media inbox for the authenticated account."""
    recordings = await media_repo.list_recordings(
        account_id=auth.account_id,
        status_filter=status_filter,
        search_query=search,
    )
    return {
        "status": "success",
        "total": len(recordings),
        "recordings": recordings,
    }


@router.get("/recordings/{recording_id}")
async def get_media_recording(
    recording_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Gets details of a single received recording."""
    rec = await media_repo.get_recording(auth.account_id, recording_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    return rec


@router.patch("/recordings/{recording_id}")
async def update_media_recording(
    recording_id: str,
    payload: UpdateRecordingRequest,
    auth: AuthContext = Depends(require_account),
):
    """Updates metadata (programme, pastor, day, etc.) for a received recording."""
    rec = await media_repo.get_recording(auth.account_id, recording_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        # If filling missing metadata and status was needs_details, mark as new/ready
        if rec["status"] == "needs_details" and (updates.get("programme") or rec.get("programme")):
            updates["status"] = "new"
        rec = await media_repo.update_recording(auth.account_id, recording_id, updates)
    return rec


@router.post("/recordings/{recording_id}/process")
async def process_media_recording(
    recording_id: str,
    payload: ProcessRecordingRequest = ProcessRecordingRequest(),
    auth: AuthContext = Depends(require_account),
):
    """
    Triggers the standard Information Unit pipeline for a received recording:
    Creates a Session -> Starts background transcription -> Verifies -> Generates report.
    """
    rec = await media_repo.get_recording(auth.account_id, recording_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Merge any provided overrides
    event = payload.event or rec.get("event") or "Sunday Worship Service"
    programme = payload.programme or rec.get("programme") or rec.get("title") or "Worship Service"
    day_number = payload.day_number if payload.day_number is not None else rec.get("day_number")
    pastor_name = payload.pastor_name or rec.get("pastor_name") or ""
    session_title = payload.title or rec.get("title") or f"{programme}{f' - Day {day_number}' if day_number else ''}"

    session_id = f"session_media_{uuid.uuid4().hex[:10]}"
    now_ts = time.time()

    # 1. Create Session record in session_repo
    await session_repo.create_session(
        session_id=session_id,
        title=session_title,
        recording_id=recording_id,
        status="processing",
        provider_name="faster_whisper",
        language_code="en-NG",
        start_time=now_ts,
        metadata={
            "source": "media_link",
            "recording_id": recording_id,
            "event": event,
            "programme": programme,
            "minister": pastor_name,
            "day_number": day_number,
            "audio_file": rec["file_path"],
            "original_filename": rec["original_filename"],
        },
        account_id=auth.account_id,
        day_number=day_number,
    )

    # 2. Update media recording status
    await media_repo.update_recording(auth.account_id, recording_id, {
        "status": "processing",
        "session_id": session_id,
        "event": event,
        "programme": programme,
        "day_number": day_number,
        "pastor_name": pastor_name,
        "title": session_title,
    })

    # 3. Launch background transcription via transcription_manager
    try:
        upload_meta = {
            "upload_id": recording_id,
            "original_filename": rec["original_filename"],
            "saved_filename": os.path.basename(rec["file_path"]),
            "file_path": rec["file_path"],
            "is_video": False,
            "title": session_title,
            "programme": programme,
            "session_name": programme,
            "minister": pastor_name,
            "day_number": day_number,
            "account_id": auth.account_id,
        }
        job = transcription_manager.create_job(
            upload_id=recording_id,
            original_filename=rec["original_filename"],
            language_code="en-NG",
        )
        asyncio.create_task(
            transcription_manager.start_transcription_task(
                job_id=job.job_id,
                upload_meta=upload_meta,
                provider_name="faster_whisper",
                language_code="en-NG",
            )
        )
    except Exception as e:
        await media_repo.update_recording(auth.account_id, recording_id, {
            "status": "failed",
            "error_message": str(e),
        })
        raise HTTPException(status_code=500, detail=f"Failed to start transcription: {str(e)}")

    return {
        "status": "processing",
        "session_id": session_id,
        "recording_id": recording_id,
        "message": "Recording queued for transcription and report generation.",
    }


@router.delete("/recordings/{recording_id}")
async def delete_media_recording(
    recording_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Deletes a received recording from the Media inbox."""
    success = await media_repo.delete_recording(auth.account_id, recording_id)
    if not success:
        raise HTTPException(status_code=404, detail="Recording not found")
    return {"status": "success", "deleted_id": recording_id}


@router.get("/recordings/{recording_id}/stream")
async def stream_media_recording(
    recording_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Streams the audio of a received media recording for in-app preview."""
    rec = await media_repo.get_recording(auth.account_id, recording_id)
    if not rec or not rec.get("file_path") or not os.path.exists(rec["file_path"]):
        raise HTTPException(status_code=404, detail="Recording audio file not found on disk.")

    media_type = "audio/wav"
    fmt = (rec.get("file_format") or "WAV").lower()
    if fmt == "mp3":
        media_type = "audio/mpeg"
    elif fmt in ("m4a", "aac"):
        media_type = "audio/mp4"
    elif fmt == "flac":
        media_type = "audio/flac"

    return FileResponse(
        rec["file_path"],
        media_type=media_type,
        filename=rec.get("original_filename") or f"{recording_id}.wav",
    )


@router.post("/recordings/upload")
async def in_app_upload_recording(
    file: UploadFile = File(...),
    event: Optional[str] = Form(default=None),
    programme: Optional[str] = Form(default=None),
    day_number: Optional[int] = Form(default=None),
    pastor_name: Optional[str] = Form(default=None),
    auth: AuthContext = Depends(require_account),
):
    """
    Direct in-app audio upload for Information Unit staff on Desktop or Mobile.
    Adds recording directly into the Media inbox with immediate processing option.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    rec_id = f"med_{uuid.uuid4().hex[:12]}"
    saved_filename = f"{rec_id}_{file.filename}"
    file_path = os.path.join(STORAGE_UPLOADS_DIR, saved_filename)
    os.makedirs(STORAGE_UPLOADS_DIR, exist_ok=True)

    file_size = 0
    with open(file_path, "wb") as f_out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > MAX_UPLOAD_SIZE:
                f_out.close()
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(status_code=413, detail="File exceeds maximum allowed size (500MB).")
            f_out.write(chunk)

    duration = probe_media_duration(file_path) or 0

    clean_event = event.strip() if event else "Sunday Worship Service"
    clean_prog = programme.strip() if programme else "Sunday Worship Service"
    clean_pastor = pastor_name.strip() if pastor_name else ""

    title_parts = [clean_prog]
    if day_number:
        title_parts.append(f"Day {day_number}")
    title = " - ".join(title_parts)

    is_complete = bool(clean_prog and clean_pastor)
    status_label = "new" if is_complete else "needs_details"

    recording = await media_repo.create_recording(
        account_id=auth.account_id,
        token_id=None,
        title=title,
        file_path=file_path,
        original_filename=file.filename,
        file_size=file_size,
        file_format=ext.replace(".", "").upper(),
        duration_seconds=duration,
        source="direct_upload",
        event=clean_event,
        programme=clean_prog,
        day_number=day_number,
        pastor_name=clean_pastor,
        status=status_label,
        uploaded_by=auth.user_email or "Staff In-App",
    )

    return {
        "status": "success",
        "recording": recording,
        "message": "Recording uploaded to Media inbox successfully.",
    }



# -------------------------------------------------------------------------
# PUBLIC STANDALONE UPLOAD ENDPOINTS (For Media Team — NO Login Required)
# -------------------------------------------------------------------------

@router.get("/public/info/{token}")
async def get_public_upload_info(token: str):
    """
    Public metadata endpoint for the lightweight Media Upload page.
    Returns church name and active programme choices.
    Never reveals sensitive account information, users, transcripts, or recordings.
    """
    token_data = await media_repo.get_token_by_value(token)
    if not token_data or not token_data.get("is_active"):
        raise HTTPException(status_code=404, detail="Upload link is invalid or has expired.")

    account_id = token_data["account_id"]
    account = await account_repo.get_account_by_id(account_id)
    church_name = account.get("name") if account else "DLBC Information Unit"

    # Fetch active configured programmes for easy selection
    programmes = await programmes_repo.list_programmes(account_id=account_id, include_archived=False)
    programme_list = [p["name"] for p in programmes] if programmes else [
        "Sunday Worship Service", "Bible Study", "Revival & Evangelism Training", "Youth Fellowship", "Faith Clinic"
    ]

    return {
        "status": "active",
        "church_name": church_name,
        "label": token_data.get("label") or "Media Team Upload",
        "has_pin": bool(token_data.get("pin_code")),
        "programmes": programme_list,
        "events": [
            "Sunday Worship Service", "Monday Bible Study", "Thursday Revival Hour",
            "Special Programme", "Workers Meeting", "Retreat / Camp"
        ],
    }


@router.post("/public/upload/{token}")
async def upload_via_public_link(
    token: str,
    photos: List[UploadFile] = File(default=[]),
    files: List[UploadFile] = File(default=[]),
    file: Optional[UploadFile] = File(default=None),
    audio: Optional[UploadFile] = File(default=None),
    sender_name: Optional[str] = Form(default=None),
    note: Optional[str] = Form(default=None),
    caption: Optional[str] = Form(default=None),
    event: Optional[str] = Form(default=None),
    programme: Optional[str] = Form(default=None),
    day_number: Optional[int] = Form(default=None),
    pastor_name: Optional[str] = Form(default=None),
    pin_code: Optional[str] = Form(default=None),
):
    """
    Public file upload handler for the secure Media Upload link.
    Photo-First: Accepts multiple photos (.jpg, .jpeg, .png, .webp) and/or optional audio recordings.
    - Photos are registered as visual assets in media_assets (no session/transcription pipeline!).
    - Audio recordings are registered in media_recordings (and auto-processed if metadata is complete).
    """
    token_data = await media_repo.get_token_by_value(token)
    if not token_data or not token_data.get("is_active"):
        raise HTTPException(status_code=404, detail="Upload link is invalid or has expired.")

    # Validate optional PIN
    if token_data.get("pin_code") and token_data["pin_code"] != (pin_code or "").strip():
        raise HTTPException(status_code=401, detail="Invalid PIN for this upload link.")

    account_id = token_data["account_id"]

    # Collect all uploaded files across potential field names
    all_uploads: List[UploadFile] = []
    for item in photos:
        if item and item.filename:
            all_uploads.append(item)
    for item in files:
        if item and item.filename:
            all_uploads.append(item)
    if file and file.filename:
        all_uploads.append(file)
    if audio and audio.filename:
        all_uploads.append(audio)

    if not all_uploads:
        raise HTTPException(status_code=400, detail="No files provided for upload.")

    # Classify files
    image_files: List[UploadFile] = []
    audio_files: List[UploadFile] = []
    for f in all_uploads:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            image_files.append(f)
        elif ext in ALLOWED_AUDIO_EXTENSIONS:
            audio_files.append(f)
        else:
            allowed_all = sorted(list(ALLOWED_IMAGE_EXTENSIONS) + list(ALLOWED_AUDIO_EXTENSIONS))
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format '{ext}' on '{f.filename}'. Supported formats: {', '.join(allowed_all)}",
            )

    os.makedirs(STORAGE_UPLOADS_DIR, exist_ok=True)

    clean_sender = (sender_name or "").strip() or None
    clean_note = (note or caption or "").strip() or None
    clean_event = (event or "").strip() or None
    clean_prog = (programme or "").strip() or None
    clean_pastor = (pastor_name or "").strip() or None

    # 1. Create submission record if we have photos or metadata
    submission = None
    if image_files or clean_sender or clean_note:
        submission = await media_repo.create_submission(
            account_id=account_id,
            token_id=token_data["token_id"],
            sender_name=clean_sender,
            note=clean_note,
            programme=clean_prog,
            event=clean_event,
            day_number=day_number,
        )

    # 2. Process photo assets (NO audio/session pipeline for photos!)
    saved_assets = []
    for img_file in image_files:
        ext = os.path.splitext(img_file.filename)[1].lower()
        saved_name = f"photo_{uuid.uuid4().hex[:10]}_{img_file.filename}"
        f_path = os.path.join(STORAGE_UPLOADS_DIR, saved_name)
        file_size = 0
        try:
            with open(f_path, "wb") as f_out:
                while chunk := await img_file.read(1024 * 1024):
                    file_size += len(chunk)
                    if file_size > MAX_UPLOAD_SIZE:
                        f_out.close()
                        if os.path.exists(f_path):
                            os.remove(f_path)
                        raise HTTPException(status_code=413, detail=f"Photo '{img_file.filename}' exceeds maximum 500MB limit.")
                    f_out.write(chunk)
        except HTTPException:
            raise
        except Exception as e:
            if os.path.exists(f_path):
                os.remove(f_path)
            raise HTTPException(status_code=500, detail=f"Failed to save photo: {str(e)}")

        meta = extract_image_metadata(f_path)
        asset = await media_repo.create_asset(
            account_id=account_id,
            file_path=f_path,
            original_filename=img_file.filename,
            file_size=file_size,
            mime_type=meta.get("mime_type") or "image/jpeg",
            asset_type="photo",
            submission_id=submission["submission_id"] if submission else None,
            width=meta.get("width") or 0,
            height=meta.get("height") or 0,
            title=img_file.filename,
            caption=clean_note,
        )
        saved_assets.append(asset)

    # 3. Process audio recordings (retaining existing pipeline)
    saved_recordings = []
    for aud_file in audio_files:
        ext = os.path.splitext(aud_file.filename)[1].lower()
        saved_filename = f"media_{uuid.uuid4().hex[:10]}_{aud_file.filename}"
        f_path = os.path.join(STORAGE_UPLOADS_DIR, saved_filename)
        file_size = 0
        try:
            with open(f_path, "wb") as f_dest:
                while chunk := await aud_file.read(1024 * 1024):
                    file_size += len(chunk)
                    if file_size > MAX_UPLOAD_SIZE:
                        f_dest.close()
                        if os.path.exists(f_path):
                            os.remove(f_path)
                        raise HTTPException(status_code=413, detail="File exceeds maximum 500 MB limit.")
                    f_dest.write(chunk)
        except HTTPException:
            raise
        except Exception as e:
            if os.path.exists(f_path):
                os.remove(f_path)
            raise HTTPException(status_code=500, detail=f"Failed to save audio file: {str(e)}")

        duration = 0.0
        try:
            duration = probe_media_duration(f_path) or 0.0
        except Exception:
            pass

        title_parts = [clean_prog or clean_event or os.path.splitext(aud_file.filename)[0]]
        if day_number:
            title_parts.append(f"Day {day_number}")
        title = " - ".join(title_parts)

        is_metadata_complete = bool(clean_prog and clean_pastor)
        initial_status = "new" if is_metadata_complete else "needs_details"

        recording = await media_repo.create_recording(
            account_id=account_id,
            token_id=token_data["token_id"],
            title=title,
            file_path=f_path,
            original_filename=aud_file.filename or "media_upload.wav",
            file_size=file_size,
            file_format=ext.replace(".", "").upper(),
            duration_seconds=duration,
            source="media_link",
            event=clean_event,
            programme=clean_prog,
            day_number=day_number,
            pastor_name=clean_pastor,
            status=initial_status,
            uploaded_by=clean_sender or "Media Team (Link)",
        )
        saved_recordings.append(recording)

        # Auto-process if metadata is complete
        if is_metadata_complete:
            try:
                session_id = f"session_media_{uuid.uuid4().hex[:10]}"
                now_ts = time.time()
                await session_repo.create_session(
                    session_id=session_id,
                    title=title,
                    recording_id=recording["recording_id"],
                    status="processing",
                    provider_name="faster_whisper",
                    language_code="en-NG",
                    start_time=now_ts,
                    metadata={
                        "source": "media_link",
                        "recording_id": recording["recording_id"],
                        "event": clean_event,
                        "programme": clean_prog,
                        "minister": clean_pastor,
                        "day_number": day_number,
                        "audio_file": f_path,
                        "original_filename": aud_file.filename,
                    },
                    account_id=account_id,
                    day_number=day_number,
                )

                await media_repo.update_recording(account_id, recording["recording_id"], {
                    "status": "processing",
                    "session_id": session_id,
                })

                upload_meta = {
                    "upload_id": recording["recording_id"],
                    "original_filename": aud_file.filename,
                    "saved_filename": saved_filename,
                    "file_path": f_path,
                    "is_video": False,
                    "title": title,
                    "programme": clean_prog,
                    "session_name": clean_prog,
                    "minister": clean_pastor,
                    "day_number": day_number,
                    "account_id": account_id,
                }
                job = transcription_manager.create_job(
                    upload_id=recording["recording_id"],
                    original_filename=aud_file.filename or "upload.wav",
                    language_code="en-NG",
                )
                asyncio.create_task(
                    transcription_manager.start_transcription_task(
                        job_id=job.job_id,
                        upload_meta=upload_meta,
                        provider_name="faster_whisper",
                        language_code="en-NG",
                    )
                )
            except Exception as e:
                print(f"Auto-process startup notice: {e}")

    summary_parts = []
    if saved_assets:
        summary_parts.append(f"{len(saved_assets)} photo(s)")
    if saved_recordings:
        summary_parts.append(f"{len(saved_recordings)} audio recording(s)")

    msg = f"Successfully uploaded {', and '.join(summary_parts)} to the Information Unit." if summary_parts else "Upload complete."

    return {
        "status": "success",
        "photos_count": len(saved_assets),
        "recordings_count": len(saved_recordings),
        "submission_id": submission["submission_id"] if submission else None,
        "recording_id": saved_recordings[0]["recording_id"] if saved_recordings else None,
        "message": msg,
    }
