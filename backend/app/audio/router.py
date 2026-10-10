"""
Audio Capture & Streaming Endpoints

Provides:
- WebSocket endpoint `/api/audio/stream` for low-latency, progressive PCM chunk streaming
- REST endpoints for listing, retrieving (with Range support for in-browser seeking), and downloading WAV recordings
"""

import asyncio
import json
import os
import re
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account
from app.audio.stream_manager import (
    MANIFEST_FILE,
    STORAGE_AUDIO_DIR,
    load_manifest,
    save_manifest,
    stream_manager,
)
from app.config import TRANSCRIPTION_PROVIDER
from app.database.session_repo import session_repo
from app.transcription.live_transcription import LiveTranscriptionSession
from app.verification.decision_engine import verification_decision_engine
from app.auth.token_verifier import token_verifier
from app.database.account_repo import account_repo
from app.database.connection import get_db_connection

router = APIRouter(prefix="/api/audio", tags=["Audio Capture"])


def sanitize_recording_filename(title: Optional[str], date_str: Optional[str], identifier: str) -> str:
    """
    Builds the standardized DLBC filename:
    DLBC_YYYY-MM-DD_<SanitizedTitle>_<identifier>.wav
    """
    date_part = ""
    if date_str:
        m = re.match(r"^(\d{4}-\d{2}-\d{2})", str(date_str).strip())
        if m:
            date_part = m.group(1)
    if not date_part and identifier:
        m = re.match(r"rec_(\d{4})(\d{2})(\d{2})", identifier)
        if m:
            date_part = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    if not date_part:
        date_part = time.strftime("%Y-%m-%d")

    clean_title = ""
    if title:
        raw = str(title).strip()
        # First convert colons, slashes, backslashes, hyphens, and whitespace to underscores
        subbed = re.sub(r'[:/\\—–\-\s]+', '_', raw)
        # Remove remaining forbidden characters
        clean = re.sub(r'[<>:"|?*\'`]', '', subbed)
        # Collapse multiple underscores and dots
        clean = re.sub(r'[\s.]+', '_', clean)
        clean = re.sub(r'_+', '_', clean).strip('_')
        if clean:
            clean_title = clean[:50]

    if not clean_title:
        clean_title = "Recording"

    clean_id = re.sub(r'[^\w\-]', '_', identifier)
    return f"DLBC_{date_part}_{clean_title}_{clean_id}.wav"


async def resolve_ws_account_id(
    token_str: Optional[str],
    is_demo: bool = False,
    visitor_id: Optional[str] = None,
) -> str:
    if is_demo or (token_str and str(token_str).strip().lower() == "demo"):
        return account_repo.LEGACY_DEFAULT_ACCOUNT_ID
    if not token_str:
        return "legacy_default_account"
    try:
        payload = token_verifier.verify_token(token_str)
        sub = payload.get("sub")
        if sub:
            resolved = await account_repo.get_user_and_account_by_supabase_id(sub)
            if resolved:
                _, account, _ = resolved
                if account and account.get("id"):
                    return account["id"]
            email = payload.get("email") or f"{sub}@dlbc.org"
            user = await account_repo.create_or_update_user(sub, email)
            account, _ = await account_repo.get_user_account(user["id"])
            if account and account.get("id"):
                return account["id"]
    except Exception:
        pass
    return "legacy_default_account"


@router.websocket("/stream")
async def audio_stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for progressive audio capture & live transcription (Phase 4 Session).
...
    """
    await websocket.accept()
    current_session = None
    current_session_id = None
    live_transcription: Optional[LiveTranscriptionSession] = None
    loop = asyncio.get_event_loop()
    ws_lock = asyncio.Lock()

    async def safe_send_json(payload: dict):
        try:
            async with ws_lock:
                await websocket.send_json(payload)
        except Exception as ws_err:
            pass

    try:
        while True:
            message = await websocket.receive()

            # Handle text/JSON control messages
            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    await safe_send_json({"status": "error", "message": "Invalid JSON control payload"})
                    continue

                msg_type = payload.get("type")

                if msg_type == "init":
                    sample_rate = int(payload.get("sampleRate", 48000))
                    channels = int(payload.get("channels", 1))
                    device_name = str(payload.get("deviceName", "Default Microphone"))
                    custom_session_id = payload.get("sessionId")
                    session_title = payload.get("sessionTitle")

                    is_demo_client = bool(
                        payload.get("is_demo")
                        or websocket.query_params.get("demo") == "1"
                        or websocket.headers.get("x-dlbc-demo") == "1"
                        or (payload.get("token") and str(payload.get("token")).strip().lower() == "demo")
                    )
                    vid = (
                        payload.get("visitor_id")
                        or websocket.query_params.get("visitor_id")
                        or websocket.headers.get("x-dlbc-visitor-id")
                        or websocket.headers.get("x-dlbc-device-uid")
                    )
                    ws_token = payload.get("token") or websocket.query_params.get("token")
                    ws_account_id = await resolve_ws_account_id(ws_token, is_demo=is_demo_client, visitor_id=vid)

                    current_session = stream_manager.create_session(
                        sample_rate=sample_rate,
                        channels=channels,
                        device_name=device_name,
                        account_id=ws_account_id,
                    )
                    current_session_id = custom_session_id or f"session_{current_session.session_id}"

                    custom_metadata = payload.get("metadata") or {}
                    metadata_to_store = {
                        "sample_rate": sample_rate,
                        "channels": channels,
                        "device_name": device_name,
                        **custom_metadata,
                    }

                    day_num = payload.get("day_number") or custom_metadata.get("day_number")
                    if day_num is not None:
                        try:
                            day_num = int(day_num)
                        except (ValueError, TypeError):
                            day_num = None

                    # Determine if live transcription should be active
                    is_live_transcription_enabled = TRANSCRIPTION_PROVIDER not in ("disabled", "none", "off")
                    provider_name_to_record = "azure_speech" if is_live_transcription_enabled else "recording_only"

                    # Initialize durable session in database with a 5.0s safety timeout
                    try:
                        await asyncio.wait_for(
                            session_repo.create_session(
                                session_id=current_session_id,
                                title=session_title,
                                recording_id=current_session.session_id,
                                status="recording",
                                provider_name=provider_name_to_record,
                                language_code="en-NG",
                                start_time=current_session.start_time,
                                metadata=metadata_to_store,
                                account_id=ws_account_id,
                                day_number=day_num,
                            ),
                            timeout=5.0,
                        )
                    except Exception as s_err:
                        print(f"Notice: Failed to initialize session in database: {s_err}")
                        if current_session:
                            try:
                                if current_session.file_handle:
                                    current_session.file_handle.close()
                                if os.path.exists(current_session.wav_path):
                                    os.remove(current_session.wav_path)
                            except Exception:
                                pass
                            current_session = None
                        current_session_id = None
                        await safe_send_json({
                            "status": "error",
                            "message": f"Database initialization failed: {s_err}",
                        })
                        continue

                    # Initialize isolated live transcription session if enabled
                    if is_live_transcription_enabled:
                        try:
                            live_transcription = LiveTranscriptionSession(
                                recording_id=current_session.session_id,
                                session_id=current_session_id,
                                sample_rate=sample_rate,
                                channels=channels,
                                language_code="en-NG",
                                ws_send_callback=safe_send_json,
                                event_loop=loop,
                            )
                            live_transcription.start()
                        except Exception as lt_err:
                            print(f"Notice: Failed to initialize live transcription: {lt_err}")
                            live_transcription = None
                    else:
                        live_transcription = None

                    await safe_send_json({
                        "status": "ready",
                        "recordingId": current_session.session_id,
                        "sessionId": current_session_id,
                        "sampleRate": sample_rate,
                        "channels": channels,
                        "transcription": "enabled" if is_live_transcription_enabled else "paused",
                        "message": "Live transcription active" if is_live_transcription_enabled else "Recording audio — live transcription paused",
                    })

                elif msg_type == "toggle_flag":
                    if live_transcription:
                        seg_idx = int(payload.get("segment_idx", -1))
                        live_transcription.toggle_manual_flag(seg_idx)

                elif msg_type == "stop":
                    if current_session:
                        summary = stream_manager.finalize_session(current_session.session_id)
                        transcript_summary = None
                        if live_transcription:
                            try:
                                transcript_summary = live_transcription.finalize(wav_summary=summary)
                            except Exception as trans_err:
                                print(f"Notice: Live transcription finalize error: {trans_err}")

                        # Finalize SQLite Session record
                        final_session = None
                        if current_session_id:
                            try:
                                final_session = await session_repo.finalize_session(
                                    session_id=current_session_id,
                                    audio_summary=summary,
                                    transcript_summary=transcript_summary,
                                )
                                if transcript_summary and transcript_summary.get("segments"):
                                    from app.database.report_processing_repo import report_processing_repo
                                    session_unit = await report_processing_repo.resolve_session_unit(current_session_id)
                                    auto_veri = await report_processing_repo.get_unit_setting(session_unit, "auto_verification_enabled", default="true")
                                    if str(auto_veri).strip().lower() in ("true", "1", "yes", "on"):
                                        await session_repo.set_ai_verification_status(current_session_id, "compiling")
                                        asyncio.create_task(
                                            verification_decision_engine.verify_session(current_session_id, auto_resolve=True)
                                        )
                            except Exception as db_err:
                                print(f"Notice: Error finalizing session in DB: {db_err}")

                        await safe_send_json({
                            "status": "finalized",
                            "recording": summary,
                            "transcript": transcript_summary,
                            "session": final_session,
                        })
                        current_session = None
                        current_session_id = None
                        live_transcription = None
                        break
                    else:
                        await safe_send_json({"status": "error", "message": "No active session to stop"})

                elif msg_type == "ping":
                    await safe_send_json({"type": "pong"})

            # Handle binary PCM chunks
            elif "bytes" in message:
                pcm_data = message["bytes"]
                if current_session and pcm_data:
                    # 1. Immediate primary disk append (NEVER blocked)
                    current_session.append_chunk(pcm_data)

                    # 2. Non-blocking push to live transcription worker
                    if live_transcription:
                        live_transcription.push_pcm(pcm_data)

                    # Periodically send progress or ack
                    if current_session.chunk_count % 20 == 0:
                        await safe_send_json({
                            "type": "progress",
                            "totalBytes": current_session.total_bytes,
                            "chunkCount": current_session.chunk_count,
                        })


    except WebSocketDisconnect:
        # If the browser closes or crashes abruptly, auto-finalize to save captured audio and transcript!
        if current_session:
            if current_session.total_bytes == 0 and current_session.chunk_count == 0:
                print(f"Client disconnected before streaming audio. Cleaning up placeholder: {current_session.session_id}")
                try:
                    if current_session.file_handle:
                        current_session.file_handle.close()
                    if os.path.exists(current_session.wav_path):
                        os.remove(current_session.wav_path)
                except Exception:
                    pass
                if current_session_id:
                    try:
                        await session_repo.delete_session(current_session_id, account_id=ws_account_id)
                    except Exception:
                        pass
            else:
                print(f"Client disconnected abruptly. Auto-finalizing audio session: {current_session.session_id}")
                summary = stream_manager.finalize_session(current_session.session_id)
                transcript_summary = None
                if live_transcription:
                    try:
                        transcript_summary = live_transcription.finalize(wav_summary=summary)
                    except Exception:
                        pass
                if current_session_id:
                    try:
                        await session_repo.finalize_session(
                            session_id=current_session_id,
                            audio_summary=summary,
                            transcript_summary=transcript_summary,
                        )
                        if transcript_summary and transcript_summary.get("segments"):
                            from app.database.report_processing_repo import report_processing_repo
                            session_unit = await report_processing_repo.resolve_session_unit(current_session_id)
                            auto_veri = await report_processing_repo.get_unit_setting(session_unit, "auto_verification_enabled", default="true")
                            if str(auto_veri).strip().lower() in ("true", "1", "yes", "on"):
                                await session_repo.set_ai_verification_status(current_session_id, "compiling")
                                asyncio.create_task(
                                    verification_decision_engine.verify_session(current_session_id, auto_resolve=True)
                                )
                    except Exception:
                        pass
    except Exception as e:
        print(f"WebSocket audio streaming error: {e}")
        if current_session:
            if current_session.total_bytes == 0 and current_session.chunk_count == 0:
                try:
                    if current_session.file_handle:
                        current_session.file_handle.close()
                    if os.path.exists(current_session.wav_path):
                        os.remove(current_session.wav_path)
                except Exception:
                    pass
                if current_session_id:
                    try:
                        await session_repo.delete_session(current_session_id, account_id=ws_account_id)
                    except Exception:
                        pass
            else:
                summary = stream_manager.finalize_session(current_session.session_id)
                transcript_summary = None
                if live_transcription:
                    try:
                        transcript_summary = live_transcription.finalize(wav_summary=summary)
                    except Exception:
                        pass
                if current_session_id:
                    try:
                        await session_repo.finalize_session(
                            session_id=current_session_id,
                            audio_summary=summary,
                            transcript_summary=transcript_summary,
                        )
                    except Exception:
                        pass




@router.get("/recordings")
async def list_recordings():
    """Returns a list of all saved audio recordings from the local storage manifest."""
    manifest = load_manifest()
    # Filter out any files that might have been manually deleted from disk
    valid_recordings = []
    for item in manifest:
        file_path = item.get("file_path", "")
        if os.path.exists(file_path):
            # Ensure URL paths are included
            rec_id = item.get("recording_id")
            item["play_url"] = f"/api/audio/recordings/{rec_id}"
            item["download_url"] = f"/api/audio/recordings/{rec_id}/download"
            valid_recordings.append(item)
    return {"recordings": valid_recordings}


@router.get("/recordings/{recording_id}")
async def get_recording_audio(recording_id: str, request: Request):
    """
    Streams a saved WAV file supporting HTTP Range requests
    for seamless seeking in browser HTML5 audio player.
    """
    file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    if not os.path.exists(file_path):
        from app.transcription.router import find_media_file
        media_path = find_media_file(recording_id)
        if media_path and os.path.exists(media_path):
            file_path = media_path
        else:
            raise HTTPException(status_code=404, detail="Recording not found")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header:
        # Parse byte range header
        try:
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0])
            end = int(byte_range[1]) if byte_range[1] else file_size - 1
        except Exception:
            start = 0
            end = file_size - 1

        chunk_size = (end - start) + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(start)
                bytes_left = chunk_size
                while bytes_left > 0:
                    read_len = min(65536, bytes_left)
                    data = f.read(read_len)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": "audio/wav",
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    return FileResponse(file_path, media_type="audio/wav", filename=f"{recording_id}.wav")


@router.get("/recordings/{recording_id}/download")
async def download_recording(recording_id: str):
    """Provides a direct streaming file download for the saved WAV recording."""
    file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    if not os.path.exists(file_path):
        from app.transcription.router import find_media_file
        media_path = find_media_file(recording_id)
        if media_path and os.path.exists(media_path):
            file_path = media_path
        else:
            raise HTTPException(status_code=404, detail="Recording not found")

    title = None
    date_created = None
    try:
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT title, date_created FROM sessions WHERE recording_id = ? OR session_id = ? LIMIT 1",
                (recording_id, recording_id),
            )
            row = await cursor.fetchone()
            if row:
                title = row["title"]
                date_created = row["date_created"]
    except Exception:
        pass

    if not title:
        try:
            manifest = load_manifest()
            for item in manifest:
                if item.get("recording_id") == recording_id:
                    title = item.get("title") or item.get("session_title")
                    date_created = item.get("timestamp") or item.get("created_at")
                    break
        except Exception:
            pass

    safe_filename = sanitize_recording_filename(title, date_created, recording_id)

    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=safe_filename,
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.delete("/recordings/{recording_id}")
async def delete_recording(recording_id: str, auth: AuthContext = Depends(require_account)):
    """Deletes a recording from disk and updates the manifest."""
    async with get_db_connection() as conn:
        cursor = await conn.execute(
            "SELECT account_id FROM sessions WHERE recording_id = ?",
            (recording_id,)
        )
        row = await cursor.fetchone()
        if row and row["account_id"]:
            if row["account_id"] != auth.account_id:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to delete recording belonging to another church account.",
                )
        elif getattr(auth, "is_demo", False):
            # For demo users, also check the recording manifest to verify ownership
            manifest = load_manifest()
            matching = [item for item in manifest if item.get("recording_id") == recording_id]
            if matching and matching[0].get("account_id") and matching[0]["account_id"] != auth.account_id:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to delete recording belonging to another account.",
                )
            elif not matching and not row:
                file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
                if not os.path.exists(file_path):
                    raise HTTPException(status_code=404, detail="Recording not found")
                # Legacy or unowned system recordings cannot be deleted by demo users
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to delete unowned system recording in Demo mode.",
                )

    file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

    manifest = load_manifest()
    manifest = [item for item in manifest if item.get("recording_id") != recording_id]
    save_manifest(manifest)

    return {"status": "deleted", "recordingId": recording_id}
