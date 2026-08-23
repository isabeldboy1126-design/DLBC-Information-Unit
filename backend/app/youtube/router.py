"""
YouTube Session Router

Provides REST API endpoints for:
- Validating and analyzing YouTube URLs (recorded videos & live streams).
- Initiating resilient background transcription jobs for recorded YouTube videos.
- Starting, monitoring, and stopping server-side YouTube Live stream transcription sessions.
"""

import asyncio
import os
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, HttpUrl

from app.config import STORAGE_AUDIO_DIR, STORAGE_UPLOADS_DIR
from app.transcription.audio_extractor import probe_media_duration
from app.transcription.transcription_manager import (
    TranscriptionJob,
    transcription_manager,
)
from app.youtube.youtube_service import (
    download_recorded_youtube_audio,
    extract_youtube_metadata,
    validate_youtube_url,
    youtube_live_manager,
)

router = APIRouter(prefix="/api/youtube", tags=["YouTube Sessions"])


class YouTubeAnalyzeRequest(BaseModel):
    url: str


class YouTubeRecordedTranscribeRequest(BaseModel):
    url: str
    title: Optional[str] = None
    programme: Optional[str] = None
    programme_session: Optional[str] = None
    minister: Optional[str] = None
    message_title: Optional[str] = None
    language_code: str = "en-NG"
    provider_id: Optional[str] = None


class YouTubeLiveStartRequest(BaseModel):
    url: str
    title: Optional[str] = None
    programme: Optional[str] = None
    programme_session: Optional[str] = None
    minister: Optional[str] = None
    message_title: Optional[str] = None


@router.post("/analyze")
async def analyze_youtube_url(req: YouTubeAnalyzeRequest):
    """
    Validates a YouTube URL and inspects media metadata without downloading the full video.
    Returns: title, channel, duration_seconds, thumbnail, is_live, is_upcoming.
    """
    url = req.url.strip()
    if not validate_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.",
        )

    try:
        # Run blocking yt-dlp metadata extraction in a thread pool
        metadata = await asyncio.to_thread(extract_youtube_metadata, url)
        return {"status": "ok", "metadata": metadata}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to analyze YouTube stream: {str(e)}",
        )


@router.post("/transcribe-recorded")
async def start_recorded_youtube_transcription(req: YouTubeRecordedTranscribeRequest):
    """
    Initiates a background audio download and transcription job for a recorded YouTube video.
    Returns a standard job_id that can be polled via GET /api/transcription/jobs/{job_id}.
    """
    url = req.url.strip()
    if not validate_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    # 1. Inspect metadata
    try:
        metadata = await asyncio.to_thread(extract_youtube_metadata, url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not inspect YouTube video: {str(e)}")

    if metadata.get("is_live"):
        raise HTTPException(
            status_code=400,
            detail="This YouTube stream is currently LIVE. Please use the Live YouTube option instead.",
        )

    # 2. Prepare upload ID and master audio destination
    upload_id = f"yt_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    saved_filename = f"{upload_id}.wav"
    master_audio_path = os.path.join(STORAGE_AUDIO_DIR, saved_filename)
    upload_audio_path = os.path.join(STORAGE_UPLOADS_DIR, saved_filename)

    session_title = req.title or metadata.get("title") or "YouTube Worship Session"

    # 3. Create job
    job_id = f"job_yt_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    job = TranscriptionJob(
        job_id=job_id,
        upload_id=upload_id,
        original_filename=f"YouTube — {session_title}",
    )
    transcription_manager.jobs[job_id] = job

    # 4. Launch background download & transcription task
    asyncio.create_task(
        _execute_recorded_youtube_pipeline(
            job=job,
            url=url,
            upload_id=upload_id,
            saved_filename=saved_filename,
            master_audio_path=master_audio_path,
            upload_audio_path=upload_audio_path,
            metadata=metadata,
            req=req,
        )
    )

    return {
        "status": "job_started",
        "job": job.to_dict(),
        "upload_id": upload_id,
        "metadata": metadata,
    }


async def _execute_recorded_youtube_pipeline(
    job: TranscriptionJob,
    url: str,
    upload_id: str,
    saved_filename: str,
    master_audio_path: str,
    upload_audio_path: str,
    metadata: Dict[str, Any],
    req: YouTubeRecordedTranscribeRequest,
):
    """
    Asynchronous worker task:
    1. Downloads audio stream from YouTube directly to 16kHz mono WAV.
    2. Duplicates to storage/audio/ for master playback during verification.
    3. Triggers standard Azure Speech transcription.
    4. Registers complete Session record in database.
    """
    try:
        job.status = "preparing"
        job.progress_percent = 5.0
        job.status_message = "Connecting to YouTube and preparing audio extraction..."

        def download_progress(msg: str, pct: float):
            job.status = "preparing"
            job.status_message = msg
            job.progress_percent = pct

        # Download audio via yt-dlp
        await asyncio.to_thread(
            download_recorded_youtube_audio,
            url,
            master_audio_path,
            download_progress,
        )

        # Copy to uploads dir so finding media functions work across all views
        try:
            import shutil
            shutil.copyfile(master_audio_path, upload_audio_path)
        except Exception:
            pass

        file_size = os.path.getsize(master_audio_path) if os.path.exists(master_audio_path) else 0
        duration = metadata.get("duration_seconds") or probe_media_duration(master_audio_path) or 0.0

        upload_meta = {
            "upload_id": upload_id,
            "original_filename": f"YouTube — {metadata.get('title') or 'Sermon'}",
            "saved_filename": saved_filename,
            "file_path": master_audio_path,
            "processing_audio_path": master_audio_path,
            "file_size": file_size,
            "media_type": "audio/wav",
            "is_video": False,
            "duration_seconds": duration,
            "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        # Select provider (Azure Speech is primary)
        provider = transcription_manager.get_active_provider(req.provider_id)

        # Execute speech-to-text
        await transcription_manager._execute_transcription_task(
            job=job,
            upload_meta=upload_meta,
            language_code=req.language_code,
            provider=provider,
        )

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.status_message = f"YouTube processing failed: {str(e)}"
        job.completed_at = time.time()


@router.post("/live/start")
async def start_youtube_live_session(req: YouTubeLiveStartRequest):
    """
    Starts a server-side live YouTube stream transcription session.
    Audio is ingested directly on the backend and fed to Azure Speech in real-time.
    """
    url = req.url.strip()
    if not validate_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    try:
        session_info = await youtube_live_manager.start_live_session(
            url=url,
            title=req.title,
            programme=req.programme,
            programme_session=req.programme_session,
            minister=req.minister,
            message_title=req.message_title,
        )
        return {"status": "started", **session_info}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start YouTube Live session: {str(e)}")


@router.post("/live/stop/{session_id}")
async def stop_youtube_live_session(session_id: str):
    """
    Stops an active server-side YouTube Live stream session cleanly,
    finalizes Azure Speech, and creates the session workspace.
    """
    try:
        result = await youtube_live_manager.stop_live_session(session_id)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop live session: {str(e)}")


@router.get("/live/status/{session_id}")
async def get_youtube_live_status(session_id: str):
    """
    Returns the real-time status, elapsed time, and transcript segments for a live YouTube session.
    """
    session_state = youtube_live_manager.get_session(session_id)
    if not session_state:
        # Check database if already finalized
        from app.database.session_repo import session_repo
        db_session = await session_repo.get_session_by_id(session_id)
        if db_session:
            return {
                "session_id": session_id,
                "status": db_session.get("status", "completed"),
                "elapsed_seconds": db_session.get("duration_seconds", 0.0),
                "segments": [],
                "is_finalized": True,
            }
        raise HTTPException(status_code=404, detail=f"Live session '{session_id}' not found.")

    live_transcription: LiveTranscriptionSession = session_state.get("live_transcription")
    segments = []
    interim_text = ""
    if live_transcription:
        segments = [s.model_dump() if hasattr(s, "model_dump") else s for s in live_transcription.segments]
        interim_text = live_transcription.current_interim_text

    return {
        "session_id": session_id,
        "status": session_state.get("status", "live"),
        "title": session_state.get("title"),
        "elapsed_seconds": session_state.get("elapsed_seconds", 0.0),
        "segments": segments,
        "interim_text": interim_text,
        "error": session_state.get("error"),
    }
