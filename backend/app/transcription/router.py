"""
Transcription API Router

Provides REST endpoints for:
- Uploading recorded audio/video files (WAV, MP3, M4A, MP4)
- Triggering background transcription jobs
- Polling transcription progress
- Retrieving and listing raw transcripts
- Streaming original uploaded media with Range support for seeking
- Inspecting provider configuration status
"""

import os
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from app.audio.stream_manager import STORAGE_AUDIO_DIR
from app.transcription.transcription_manager import (
    STORAGE_UPLOADS_DIR,
    transcription_manager,
)

router = APIRouter(prefix="/api/transcription", tags=["Recorded File Transcription"])

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".mp4", ".mov", ".webm", ".flac", ".ogg"}


def find_media_file(media_id: str) -> Optional[str]:
    """
    Locates the original media file corresponding to a transcript or upload.
    Checks both storage/audio/ (for live recorded WAVs) and storage/uploads/ (for uploaded files).
    """
    if not media_id:
        return None

    base_id = os.path.splitext(media_id)[0]

    # 1. Check storage/audio/ (live recorded WAVs)
    candidates_audio = [
        os.path.join(STORAGE_AUDIO_DIR, f"{base_id}.wav"),
        os.path.join(STORAGE_AUDIO_DIR, media_id),
    ]
    for p in candidates_audio:
        if os.path.exists(p) and os.path.isfile(p):
            return p

    if os.path.exists(STORAGE_AUDIO_DIR):
        for f in os.listdir(STORAGE_AUDIO_DIR):
            if (f.startswith(base_id) or base_id.startswith(os.path.splitext(f)[0])) and f.endswith(".wav"):
                return os.path.join(STORAGE_AUDIO_DIR, f)

    # 2. Check storage/uploads/ (uploaded audio / video files)
    candidates_uploads = [
        os.path.join(STORAGE_UPLOADS_DIR, media_id),
        os.path.join(STORAGE_UPLOADS_DIR, f"{base_id}.wav"),
        os.path.join(STORAGE_UPLOADS_DIR, f"{base_id}.mp3"),
        os.path.join(STORAGE_UPLOADS_DIR, f"{base_id}.mp4"),
        os.path.join(STORAGE_UPLOADS_DIR, f"{base_id}.m4a"),
    ]
    for p in candidates_uploads:
        if os.path.exists(p) and os.path.isfile(p):
            return p

    if os.path.exists(STORAGE_UPLOADS_DIR):
        matching_files = [
            f for f in os.listdir(STORAGE_UPLOADS_DIR)
            if f.startswith(base_id) and not f.startswith("proc_")
        ]
        if matching_files:
            return os.path.join(STORAGE_UPLOADS_DIR, matching_files[0])

        matching_proc = [
            f for f in os.listdir(STORAGE_UPLOADS_DIR)
            if f.startswith(f"proc_{base_id}")
        ]
        if matching_proc:
            return os.path.join(STORAGE_UPLOADS_DIR, matching_proc[0])

    return None



@router.get("/config-status")
async def get_config_status():
    """Returns configuration status for all transcription providers."""
    active_provider = transcription_manager.get_active_provider()
    azure_p = transcription_manager.providers.get("azure_speech")
    google_p = transcription_manager.providers.get("google_speech_to_text")
    whisper_p = transcription_manager.providers.get("faster_whisper")

    azure_ready = azure_p.is_configured() if azure_p else False
    google_ready = google_p.is_configured() if google_p else False
    gcs_bucket = getattr(google_p, "get_gcs_bucket", lambda: None)() if google_p else None

    return {
        "active_provider": active_provider.provider_id,
        "is_configured": True,  # Always ready (via Whisper fallback or Azure/Google)
        "providers": {
            "azure_speech": {
                "id": "azure_speech",
                "name": "Azure Speech — English (Nigeria)",
                "is_configured": azure_ready,
                "is_active": active_provider.provider_id == "azure_speech",
                "region": getattr(azure_p, "region", "southafricanorth"),
                "language": getattr(azure_p, "default_language", "en-NG"),
                "instructions": azure_p.get_configuration_instructions() if not azure_ready else None,
            },
            "faster_whisper": {
                "id": "faster_whisper",
                "name": "Local Faster-Whisper (Offline CPU)",
                "is_configured": True,
                "is_active": active_provider.provider_id == "faster_whisper",
                "model_size": getattr(whisper_p, "model_size", "small"),
                "device": getattr(whisper_p, "device", "cpu"),
                "compute_type": getattr(whisper_p, "compute_type", "int8"),
            },
            "google_speech_to_text": {
                "id": "google_speech_to_text",
                "name": "Google Cloud Speech-to-Text",
                "is_configured": google_ready,
                "is_active": active_provider.provider_id == "google_speech_to_text",
                "gcs_bucket_configured": bool(gcs_bucket),
                "instructions": google_p.get_configuration_instructions() if not google_ready else None,
            },
        },
    }


@router.post("/upload")
async def upload_recorded_file(file: UploadFile = File(...)):
    """
    Uploads a recorded audio or video file.
    Preserves the original source file unchanged in local storage.
    If the file is a video, extracts the audio track to a processing copy.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided in upload")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed formats: WAV, MP3, M4A, MP4",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    media_type = file.content_type or ("video/mp4" if ext == ".mp4" else "audio/mpeg")

    upload_meta = transcription_manager.save_uploaded_file(
        file_bytes=file_bytes,
        original_filename=file.filename,
        media_type=media_type,
    )

    return {
        "status": "uploaded",
        "upload": {
            "upload_id": upload_meta["upload_id"],
            "original_filename": upload_meta["original_filename"],
            "file_size": upload_meta["file_size"],
            "media_type": upload_meta["media_type"],
            "is_video": upload_meta["is_video"],
            "duration_seconds": upload_meta["duration_seconds"],
            "uploaded_at": upload_meta["uploaded_at"],
        },
    }


@router.post("/transcribe/{upload_id}")
async def start_transcription(
    upload_id: str,
    language_code: str = Query("en-US", description="Language code"),
    provider_id: Optional[str] = Query(None, description="Optional provider identifier"),
):
    """Initiates a background transcription job for an uploaded file."""
    # Find uploaded file in storage/uploads/
    matching_files = [
        f for f in os.listdir(STORAGE_UPLOADS_DIR) if f.startswith(upload_id) and not f.startswith("proc_")
    ]
    if not matching_files:
        raise HTTPException(status_code=404, detail="Uploaded file not found.")

    saved_filename = matching_files[0]
    saved_path = os.path.join(STORAGE_UPLOADS_DIR, saved_filename)
    proc_wav_path = os.path.join(STORAGE_UPLOADS_DIR, f"proc_{upload_id}.wav")

    processing_audio_path = proc_wav_path if os.path.exists(proc_wav_path) else saved_path
    is_video = os.path.splitext(saved_filename)[1].lower() == ".mp4"

    upload_meta = {
        "upload_id": upload_id,
        "original_filename": saved_filename,
        "saved_filename": saved_filename,
        "file_path": saved_path,
        "processing_audio_path": processing_audio_path,
        "is_video": is_video,
    }

    job = transcription_manager.create_job(
        upload_meta=upload_meta,
        language_code=language_code,
        provider_id=provider_id,
    )
    return {"status": "job_started", "job": job.to_dict()}


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Retrieves current status and progress of a transcription job."""
    job = transcription_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"job": job.to_dict()}


@router.get("/transcripts")
async def list_transcripts():
    """Lists all saved raw transcripts."""
    return {"transcripts": transcription_manager.list_transcripts()}


@router.get("/transcripts/{transcript_id}")
async def get_transcript(transcript_id: str):
    """Retrieves full details of a saved raw transcript."""
    transcript = transcription_manager.get_transcript(transcript_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found.")
    return {"transcript": transcript}


@router.get("/media/{upload_id}")
async def get_media_stream(upload_id: str, request: Request):
    """
    Streams the original uploaded audio or live-recorded WAV file with full HTTP Range support
    for in-browser HTML5 player playback and seamless seeking.
    """
    file_path = find_media_file(upload_id)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Media file '{upload_id}' not found.")

    file_size = os.path.getsize(file_path)
    ext = os.path.splitext(file_path)[1].lower()

    media_type = (
        "video/mp4" if ext == ".mp4"
        else "audio/wav" if ext == ".wav"
        else "audio/mpeg" if ext == ".mp3"
        else "audio/mp4" if ext == ".m4a"
        else "audio/ogg" if ext == ".ogg"
        else "application/octet-stream"
    )

    range_header = request.headers.get("range")
    if range_header:
        try:
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0])
            end = int(byte_range[1]) if byte_range[1] else file_size - 1
        except Exception:
            start = 0
            end = file_size - 1

        start = max(0, min(start, file_size - 1))
        end = max(start, min(end, file_size - 1))
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
            "Content-Type": media_type,
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": media_type,
    }
    return FileResponse(file_path, media_type=media_type, headers=headers)

