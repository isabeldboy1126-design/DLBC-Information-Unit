import json
import os
import re
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account
from app.audio.router import sanitize_recording_filename
from app.config import STORAGE_AUDIO_DIR, STORAGE_TRANSCRIPTS_DIR
from app.database.connection import get_db_connection
from app.database.session_repo import session_repo
from app.transcription.router import find_media_file

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


def resolve_session_audio_path(session: dict, session_id: str) -> Optional[str]:
    """Locates the physical WAV/media audio file for a session."""
    # 1. Direct audio_file_path if stored and exists
    stored_path = session.get("audio_file_path")
    if stored_path and os.path.exists(stored_path) and os.path.isfile(stored_path):
        return stored_path

    # 2. Check audio_filename or recording_id or session_id in STORAGE_AUDIO_DIR
    rec_id = session.get("recording_id")
    candidates = []
    if rec_id:
        candidates.append(os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav"))
        candidates.append(os.path.join(STORAGE_AUDIO_DIR, rec_id))
    candidates.append(os.path.join(STORAGE_AUDIO_DIR, f"{session_id}.wav"))
    candidates.append(os.path.join(STORAGE_AUDIO_DIR, session_id))
    if session.get("audio_filename"):
        candidates.append(os.path.join(STORAGE_AUDIO_DIR, session["audio_filename"]))

    for p in candidates:
        if os.path.exists(p) and os.path.isfile(p):
            return p

    # 3. Fallback to find_media_file resolver
    for target in [rec_id, session_id]:
        if target:
            found = find_media_file(target)
            if found and os.path.exists(found):
                return found

    return None


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None
    provider_name: Optional[str] = "azure_speech"
    language_code: Optional[str] = "en-NG"
    raw_text: Optional[str] = None
    verified_text: Optional[str] = None
    metadata: Optional[dict] = None
    day_number: Optional[int] = None


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    programme: Optional[str] = None
    session_title: Optional[str] = None
    session_name: Optional[str] = None
    minister: Optional[str] = None
    day_number: Optional[int] = None


class ImportTranscriptRequest(BaseModel):
    raw_text: Optional[str] = None
    segments: Optional[List[dict]] = None
    provider_name: Optional[str] = "manual_import"
    language_code: Optional[str] = "en-NG"


@router.get("")
async def list_sessions(auth: AuthContext = Depends(require_account)):
    """Lists all saved sessions for the authenticated account ordered by creation date descending."""
    sessions = await session_repo.list_sessions(account_id=auth.account_id)
    return {"sessions": sessions}


@router.post("")
async def create_session(payload: CreateSessionRequest, auth: AuthContext = Depends(require_account)):
    """Explicitly initializes a new session prior to recording."""
    import uuid
    session_id = f"session_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    session = await session_repo.create_session(
        session_id=session_id,
        title=payload.title,
        provider_name=payload.provider_name or "azure_speech",
        language_code=payload.language_code or "en-NG",
        raw_text=payload.raw_text,
        verified_text=payload.verified_text,
        metadata=payload.metadata,
        day_number=payload.day_number,
        account_id=auth.account_id,
    )
    return {"session": session}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    include_segments: bool = Query(True, description="Whether to include granular transcript segments"),
    auth: AuthContext = Depends(require_account),
):
    """Retrieves full or lightweight details of a session with linked audio and flags."""
    session = await session_repo.get_session(
        session_id,
        account_id=auth.account_id,
        include_segments=include_segments,
    )
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"session": session}


@router.get("/{session_id}/audio")
async def get_session_audio(
    session_id: str,
    request: Request,
):
    """
    Streams the session WAV audio file supporting HTTP Range requests
    for seamless seeking in HTML5 audio players.
    Publicly accessible without authorization requirements, strictly bounded to session audio.
    """
    session = await session_repo.get_session(session_id, account_id=None, include_segments=False)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    file_path = resolve_session_audio_path(session, session_id)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio recording file not found for this session.")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header:
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

    return FileResponse(file_path, media_type="audio/wav", filename=f"{session_id}.wav")


@router.get("/{session_id}/audio/download")
async def download_session_audio(
    session_id: str,
):
    """
    Provides a direct streaming file download for the session WAV audio,
    formatted with the DLBC_YYYY-MM-DD_<Title>_<recording-id>.wav filename.
    Publicly accessible without authorization requirements, strictly bounded to session audio.
    """
    session = await session_repo.get_session(session_id, account_id=None, include_segments=False)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    file_path = resolve_session_audio_path(session, session_id)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio recording file not found for this session.")

    rec_id = session.get("recording_id") or session_id
    safe_filename = sanitize_recording_filename(
        session.get("title"),
        session.get("date_created"),
        rec_id,
    )

    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=safe_filename,
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.post("/{session_id}/import-transcript")
async def import_session_transcript(
    session_id: str,
    payload: ImportTranscriptRequest,
    auth: AuthContext = Depends(require_account),
):
    """
    Imports an external transcript (e.g. from YouTube subtitles, Whisper offline, or human typist)
    into an existing session, enabling Verification and AI Reporting workflows.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id, include_segments=False)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    raw_text = (payload.raw_text or "").strip()
    segments = payload.segments or []

    if not raw_text and not segments:
        raise HTTPException(status_code=400, detail="Either 'raw_text' or 'segments' must be provided.")

    has_real_timestamps = False
    if segments:
        validated_segments = []
        for idx, seg in enumerate(segments):
            s_time_raw = seg.get("start_time")
            e_time_raw = seg.get("end_time")
            valid_times = False
            s_time = None
            e_time = None
            if s_time_raw is not None and e_time_raw is not None:
                try:
                    st_val = float(s_time_raw)
                    et_val = float(e_time_raw)
                    if et_val > st_val and st_val >= 0.0:
                        s_time = round(st_val, 2)
                        e_time = round(et_val, 2)
                        valid_times = True
                        has_real_timestamps = True
                except (ValueError, TypeError):
                    valid_times = False

            conf_raw = seg.get("confidence")
            conf = float(conf_raw) if conf_raw is not None else (0.8 if valid_times else 0.0)
            is_low = bool(seg.get("is_low_confidence")) or (not valid_times)
            flags = list(seg.get("flags") or [])
            if not valid_times:
                if "unaligned_external_import" not in flags:
                    flags.append("unaligned_external_import")
                if "timestamps_unknown" not in flags:
                    flags.append("timestamps_unknown")

            validated_segments.append({
                "segment_id": seg.get("segment_id") or f"seg_{session_id}_{idx}",
                "segment_index": idx,
                "start_time": s_time,
                "end_time": e_time,
                "text": seg.get("text", "").strip(),
                "confidence": conf,
                "is_low_confidence": is_low,
                "flags": flags,
                "words": seg.get("words", []),
            })
        segments = validated_segments

    if not segments and raw_text:
        # Split text into logical sentences/paragraphs WITHOUT fabricating fake timing or 150 wpm
        lines = [line.strip() for line in re.split(r'\n+|\.\s+', raw_text) if line.strip()]
        segments = []
        for idx, line in enumerate(lines):
            segments.append({
                "segment_id": f"seg_{session_id}_{idx}",
                "segment_index": idx,
                "start_time": None,
                "end_time": None,
                "text": line if line.endswith(('.', '!', '?')) else f"{line}.",
                "confidence": 0.0,
                "is_low_confidence": True,
                "flags": ["unaligned_external_import", "provisional_import", "timestamps_unknown"],
                "words": [],
            })
        has_real_timestamps = False

    if not raw_text and segments:
        raw_text = " ".join(seg.get("text", "") for seg in segments).strip()

    transcript_id = f"tr_{session_id}"
    transcript_file_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"{transcript_id}.json")
    transcript_data = {
        "transcript_id": transcript_id,
        "session_id": session_id,
        "recording_id": session.get("recording_id"),
        "provider_name": payload.provider_name or "manual_import",
        "language_code": payload.language_code or "en-NG",
        "raw_text": raw_text,
        "segments": segments,
        "imported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(transcript_file_path, "w", encoding="utf-8") as f:
        json.dump(transcript_data, f, indent=2)

    # Persist segments to database (using 0.0 for start_time/end_time in DB when unaligned to satisfy NOT NULL constraints)
    async with get_db_connection() as conn:
        await conn.execute("DELETE FROM session_segments WHERE session_id = ?", (session_id,))
        for idx, seg in enumerate(segments):
            seg_id = seg.get("segment_id") or f"seg_{session_id}_{idx}"
            s_time = float(seg.get("start_time") or 0.0)
            e_time = float(seg.get("end_time") or 0.0)
            txt = str(seg.get("text", ""))
            conf = float(seg.get("confidence") or 0.0)
            is_low = 1 if seg.get("is_low_confidence") else 0
            flags_j = json.dumps(seg.get("flags", []))
            words_j = json.dumps(seg.get("words", []))
            await conn.execute(
                """
                INSERT INTO session_segments 
                (segment_id, session_id, segment_index, start_time, end_time, text, confidence, is_low_confidence, flags_json, words_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (seg_id, session_id, idx, s_time, e_time, txt, conf, is_low, flags_j, words_j),
            )

        await conn.execute(
            """
            UPDATE sessions 
            SET raw_text = ?,
                transcript_id = ?,
                provider_name = ?,
                language_code = ?,
                segment_count = ?,
                flag_count = 0
            WHERE session_id = ?
            """,
            (raw_text, transcript_id, payload.provider_name or "manual_import", payload.language_code or "en-NG", len(segments), session_id),
        )
        await conn.commit()

    # Stage 6: Automatic verification check if enabled in settings and usable timestamps exist
    try:
        from app.database.report_processing_repo import report_processing_repo
        session_unit = await report_processing_repo.resolve_session_unit(session_id)
        auto_veri = await report_processing_repo.get_unit_setting(session_unit, "auto_verification_enabled", default="true")
        is_auto_on = str(auto_veri).strip().lower() in ("true", "1", "yes", "on")
        if is_auto_on and has_real_timestamps:
            usable_timed_segments = [
                s for s in segments
                if s.get("start_time") is not None
                and s.get("end_time") is not None
                and float(s["end_time"]) > float(s["start_time"])
                and "unaligned_external_import" not in s.get("flags", [])
            ]
            if usable_timed_segments:
                audio_path = resolve_session_audio_path(session, session_id)
                if audio_path and os.path.exists(audio_path):
                    import asyncio
                    from app.verification.decision_engine import verification_decision_engine
                    await session_repo.set_ai_verification_status(session_id, "compiling")
                    asyncio.create_task(
                        verification_decision_engine.verify_session(session_id, auto_resolve=True)
                    )
    except Exception as e:
        print(f"Notice: Automatic verification trigger notice on import: {e}")

    updated = await session_repo.get_session(session_id, account_id=auth.account_id, include_segments=True)
    return {"status": "transcript_imported", "session": updated}


@router.patch("/{session_id}")
async def update_session(session_id: str, payload: UpdateSessionRequest, auth: AuthContext = Depends(require_account)):
    """Updates session metadata (programme, session title, minister, day_number) or title cleanly."""
    if (
        not payload.title
        and not payload.programme
        and not payload.session_title
        and not payload.session_name
        and payload.minister is None
        and payload.day_number is None
    ):
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    sess_title = payload.session_title or payload.session_name
    session = await session_repo.update_session_details(
        session_id=session_id,
        title=payload.title,
        programme=payload.programme,
        session_name=sess_title,
        minister=payload.minister,
        day_number=payload.day_number,
        account_id=auth.account_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"session": session}


@router.delete("/{session_id}")
async def delete_session(session_id: str, auth: AuthContext = Depends(require_account)):
    """Deletes a session record upon explicit user confirmation (permanently deleted within account scope)."""
    success = await session_repo.delete_session(session_id, account_id=auth.account_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"status": "deleted", "session_id": session_id}

