"""
Transcription Job & Storage Manager

Coordinates:
- Saving original uploaded audio/video files to storage/uploads/
- Audio track preparation for video files
- Background transcription execution via TranscriptionProvider
- Persisting raw transcripts to storage/transcripts/
- Managing manifest and job progress states
"""

import asyncio
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from app.services.azure_speech_provider import AzureSpeechToTextProvider
from app.services.faster_whisper_provider import FasterWhisperProvider
from app.services.google_speech_provider import GoogleSpeechToTextProvider
from app.services.transcription_provider import TranscriptionProvider, TranscriptionResult
from app.transcription.audio_extractor import extract_audio_from_video, is_video_file, probe_media_duration

# Storage paths from central config
from app.config import STORAGE_UPLOADS_DIR, STORAGE_TRANSCRIPTS_DIR

TRANSCRIPTS_MANIFEST_FILE = os.path.join(STORAGE_TRANSCRIPTS_DIR, "transcripts_manifest.json")


def load_transcripts_manifest() -> List[Dict[str, Any]]:
    if os.path.exists(TRANSCRIPTS_MANIFEST_FILE):
        try:
            with open(TRANSCRIPTS_MANIFEST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_transcripts_manifest(manifest: List[Dict[str, Any]]) -> None:
    try:
        with open(TRANSCRIPTS_MANIFEST_FILE, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
    except Exception as e:
        print(f"Error saving transcripts manifest: {e}")


class TranscriptionJob:
    def __init__(self, job_id: str, upload_id: str, original_filename: str):
        self.job_id = job_id
        self.upload_id = upload_id
        self.original_filename = original_filename
        self.status = "queued"  # queued | preparing | transcribing | completed | failed
        self.progress_percent = 0.0
        self.status_message = "Job queued..."
        self.error: Optional[str] = None
        self.transcript_id: Optional[str] = None
        self.result: Optional[TranscriptionResult] = None
        self.created_at = time.time()
        self.completed_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "upload_id": self.upload_id,
            "original_filename": self.original_filename,
            "status": self.status,
            "progress_percent": self.progress_percent,
            "status_message": self.status_message,
            "error": self.error,
            "transcript_id": self.transcript_id,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.created_at)),
            "completed_at": (
                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.completed_at))
                if self.completed_at
                else None
            ),
        }


class TranscriptionManager:
    def __init__(self):
        # Register all available transcription providers
        self.providers: Dict[str, TranscriptionProvider] = {
            "azure_speech": AzureSpeechToTextProvider(),
            "faster_whisper": FasterWhisperProvider(),
            "google_speech_to_text": GoogleSpeechToTextProvider(),
        }
        self.jobs: Dict[str, TranscriptionJob] = {}

    def get_active_provider(self, requested_provider_id: Optional[str] = None) -> TranscriptionProvider:
        """
        Returns the active transcription provider.
        If requested_provider_id is passed and exists, uses it.
        Precedence when not explicitly requested:
        1. Azure Speech (if AZURE_SPEECH_KEY is configured)
        2. Google Speech-to-Text (if Google credentials are configured)
        3. Local Faster-Whisper (offline fallback)
        """
        if requested_provider_id and requested_provider_id in self.providers:
            return self.providers[requested_provider_id]

        azure_p = self.providers.get("azure_speech")
        if azure_p and azure_p.is_configured():
            return azure_p

        google_p = self.providers.get("google_speech_to_text")
        if google_p and google_p.is_configured():
            return google_p

        return self.providers.get("faster_whisper")

    def save_uploaded_file(
        self,
        file_bytes: bytes,
        original_filename: str,
        media_type: str,
    ) -> Dict[str, Any]:
        """
        Saves the uploaded file unchanged to storage/uploads/.
        If it is a video, prepares a separate WAV processing copy.
        """
        ext = os.path.splitext(original_filename)[1].lower()
        if not ext:
            ext = ".mp4" if "video" in media_type else ".mp3"

        upload_id = f"upl_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        saved_filename = f"{upload_id}{ext}"
        saved_file_path = os.path.join(STORAGE_UPLOADS_DIR, saved_filename)

        with open(saved_file_path, "wb") as f:
            f.write(file_bytes)

        file_size = len(file_bytes)
        duration = probe_media_duration(saved_file_path)
        is_video = is_video_file(saved_file_path)

        processing_audio_path = saved_file_path
        if is_video:
            # Extract audio to a separate processing WAV copy
            proc_wav_name = f"proc_{upload_id}.wav"
            proc_wav_path = os.path.join(STORAGE_UPLOADS_DIR, proc_wav_name)
            try:
                extract_audio_from_video(saved_file_path, proc_wav_path)
                processing_audio_path = proc_wav_path
            except Exception as e:
                print(f"Error extracting audio from video {saved_file_path}: {e}")

        upload_meta = {
            "upload_id": upload_id,
            "original_filename": original_filename,
            "saved_filename": saved_filename,
            "file_path": saved_file_path,
            "processing_audio_path": processing_audio_path,
            "file_size": file_size,
            "media_type": media_type,
            "is_video": is_video,
            "duration_seconds": duration,
            "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        return upload_meta

    def create_job(
        self,
        upload_meta: Dict[str, Any],
        language_code: str = "en-US",
        provider_id: Optional[str] = None,
    ) -> TranscriptionJob:
        job_id = f"job_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        job = TranscriptionJob(
            job_id=job_id,
            upload_id=upload_meta["upload_id"],
            original_filename=upload_meta["original_filename"],
        )
        self.jobs[job_id] = job

        provider = self.get_active_provider(provider_id)

        # Start asynchronous transcription task
        asyncio.create_task(self._execute_transcription_task(job, upload_meta, language_code, provider))
        return job

    async def _execute_transcription_task(
        self,
        job: TranscriptionJob,
        upload_meta: Dict[str, Any],
        language_code: str,
        provider: TranscriptionProvider,
    ):
        try:
            job.status = "preparing"
            job.progress_percent = 10.0
            job.status_message = "Preparing audio for transcription..."

            audio_path = upload_meta.get("processing_audio_path", upload_meta["file_path"])

            def progress_callback(stage_name: str, percent: float):
                job.status = "transcribing"
                job.status_message = stage_name
                job.progress_percent = percent

            job.status = "transcribing"
            job.status_message = f"Calling transcription engine ({provider.provider_id})..."
            job.progress_percent = 25.0

            result = await provider.transcribe_audio(
                audio_file_path=audio_path,
                language_code=language_code,
                progress_callback=progress_callback,
            )

            # Persist raw transcript to storage/transcripts/
            transcript_id = f"tr_{upload_meta['upload_id']}"
            transcript_file_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"{transcript_id}.json")

            transcript_data = {
                "transcript_id": transcript_id,
                "upload_id": upload_meta["upload_id"],
                "original_filename": upload_meta["original_filename"],
                "saved_filename": upload_meta["saved_filename"],
                "is_video": upload_meta.get("is_video", False),
                "duration_seconds": result.duration_seconds or upload_meta.get("duration_seconds", 0.0),
                "provider_name": result.provider_name,
                "language_code": result.language_code,
                "raw_text": result.raw_text,
                "segments": [seg.model_dump() for seg in result.segments],
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "metadata": result.metadata,
            }

            with open(transcript_file_path, "w", encoding="utf-8") as f:
                json.dump(transcript_data, f, indent=2)

            # Update manifest
            manifest = load_transcripts_manifest()
            manifest = [m for m in manifest if m.get("transcript_id") != transcript_id]
            summary_entry = {
                "transcript_id": transcript_id,
                "upload_id": upload_meta["upload_id"],
                "original_filename": upload_meta["original_filename"],
                "is_video": upload_meta.get("is_video", False),
                "duration_seconds": transcript_data["duration_seconds"],
                "provider_name": result.provider_name,
                "segments_count": len(result.segments),
                "flagged_segments_count": sum(1 for seg in result.segments if getattr(seg, "is_low_confidence", False) or getattr(seg, "flags", None)),
                "preview_text": (result.raw_text[:120] + "...") if len(result.raw_text) > 120 else result.raw_text,
                "created_at": transcript_data["created_at"],
            }
            manifest.insert(0, summary_entry)
            save_transcripts_manifest(manifest)

            # Sync with SQLite Session Repository (Phase 4)
            try:
                from app.database.session_repo import session_repo
                s_id = f"session_{upload_meta['upload_id']}"
                s_title = upload_meta.get("title") or (
                    upload_meta.get("session_name")
                    if upload_meta.get("session_name")
                    else f"Uploaded — {upload_meta['original_filename']}"
                )
                session_meta = {
                    "is_video": upload_meta.get("is_video", False),
                    "programme": upload_meta.get("programme"),
                    "session_name": upload_meta.get("session_name"),
                    "minister": upload_meta.get("minister"),
                    "day_number": upload_meta.get("day_number"),
                }
                session_meta = {k: v for k, v in session_meta.items() if v is not None}

                await session_repo.create_session(
                    session_id=s_id,
                    title=s_title,
                    recording_id=upload_meta["upload_id"],
                    status="completed",
                    provider_name=result.provider_name,
                    language_code=language_code,
                    start_time=time.time(),
                    metadata=session_meta,
                    account_id=upload_meta.get("account_id"),
                    day_number=upload_meta.get("day_number"),
                )
                for s_idx, seg in enumerate(result.segments):
                    flags_data = [f.model_dump() if hasattr(f, "model_dump") else f for f in (seg.flags or [])]
                    words_data = [w.model_dump() if hasattr(w, "model_dump") else w for w in (seg.words or [])]
                    await session_repo.append_segment(
                        session_id=s_id,
                        segment_index=s_idx,
                        start_time=seg.start_time,
                        end_time=seg.end_time,
                        text=seg.text,
                        confidence=seg.confidence,
                        is_low_confidence=seg.is_low_confidence,
                        flags=flags_data,
                        words=words_data,
                    )
                await session_repo.finalize_session(
                    session_id=s_id,
                    audio_summary={
                        "file_path": upload_meta.get("file_path"),
                        "file_size": os.path.getsize(upload_meta["file_path"]) if os.path.exists(upload_meta.get("file_path", "")) else 0,
                        "duration_seconds": result.duration_seconds or 0.0,
                    },
                    transcript_summary={
                        "transcript_id": transcript_id,
                        "raw_text": result.raw_text,
                        "provider_name": result.provider_name,
                        "duration_seconds": result.duration_seconds or 0.0,
                    },
                )

                # Stage 6: Automatic post-upload verification and report generation pipeline (if enabled)
                from app.database.report_processing_repo import report_processing_repo
                session_unit = await report_processing_repo.resolve_session_unit(s_id)
                auto_veri = await report_processing_repo.get_unit_setting(session_unit, "auto_verification_enabled", default="true")
                if str(auto_veri).strip().lower() in ("true", "1", "yes", "on"):
                    from app.verification.decision_engine import verification_decision_engine
                    await session_repo.set_ai_verification_status(s_id, "compiling")
                    asyncio.create_task(
                        verification_decision_engine.verify_session(s_id, auto_resolve=True)
                    )
            except Exception as db_sync_err:
                print(f"Notice: Phase 2 session sync notice: {db_sync_err}")

            job.status = "completed"
            job.progress_percent = 100.0

            job.status_message = "Transcription complete. Raw transcript preserved."
            job.transcript_id = transcript_id
            job.result = result
            job.completed_at = time.time()

        except Exception as e:
            print(f"Transcription job {job.job_id} failed: {e}")
            job.status = "failed"
            job.error = str(e)
            job.status_message = f"Transcription failed: {str(e)}"
            job.completed_at = time.time()

    def get_job(self, job_id: str) -> Optional[TranscriptionJob]:
        return self.jobs.get(job_id)

    def get_transcript(self, transcript_id: str) -> Optional[Dict[str, Any]]:
        file_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"{transcript_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading transcript {transcript_id}: {e}")
        return None

    def list_transcripts(self) -> List[Dict[str, Any]]:
        return load_transcripts_manifest()


transcription_manager = TranscriptionManager()
