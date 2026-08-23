"""
YouTube Media Ingestion & Live Stream Service

Provides robust server-side utilities for:
- Validating YouTube URLs (recorded videos, shorts, live streams).
- Extracting metadata (title, channel, duration, live status, thumbnail) via yt-dlp.
- Downloading and converting audio from recorded YouTube videos into clean 16-bit PCM WAV.
- Managing server-side YouTube Live stream audio ingestion and feeding the Azure Speech pipeline.
"""

import asyncio
import logging
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

import httpx

from app.audio.stream_manager import AudioStreamSession
from app.config import STORAGE_AUDIO_DIR, STORAGE_TRANSCRIPTS_DIR
from app.database.session_repo import session_repo
from app.transcription.audio_extractor import get_ffmpeg_binary
from app.transcription.live_transcription import LiveTranscriptionSession

logger = logging.getLogger("youtube_service")

# Regex for validating all common YouTube URL formats
YOUTUBE_URL_REGEX = re.compile(
    r"^(https?://)?(www\.|m\.)?(youtube\.com/(watch\?v=|live/|shorts/|embed/)|youtu\.be/)[a-zA-Z0-9_-]{11}(.*)?$"
)


def validate_youtube_url(url: str) -> bool:
    """Validates if the provided string is a supported YouTube URL."""
    if not url or not isinstance(url, str):
        return False
    return bool(YOUTUBE_URL_REGEX.match(url.strip()))


def get_yt_extractor_args() -> dict:
    """Returns extractor arguments configured with bgutil PO-Token provider and mobile player clients."""
    return {
        "youtubepot-bgutilhttp": {
            "base_url": ["http://127.0.0.1:4416"],
        },
        "youtube": {
            "player_client": ["android", "android_creator", "mweb", "web"],
        },
    }


def extract_youtube_metadata(url: str) -> Dict[str, Any]:
    """
    Extracts video/stream metadata without downloading media.
    Uses official YouTube oEmbed API combined with yt-dlp bgutil PO Token provider
    for bulletproof resilience across cloud datacenter IPs.
    """
    import yt_dlp

    clean_url = url.strip()
    if not validate_youtube_url(clean_url):
        raise ValueError("Invalid YouTube URL format. Please provide a valid YouTube link.")

    # 1. Fetch public oEmbed data as baseline guarantee (never blocked by IP / bot filters)
    oembed_data = {}
    oembed_status = 200
    try:
        r = httpx.get(f"https://www.youtube.com/oembed?url={clean_url}&format=json", timeout=6.0)
        oembed_status = r.status_code
        if r.status_code == 200:
            oembed_data = r.json()
    except Exception as oe_err:
        logger.debug(f"oEmbed extraction notice: {oe_err}")

    # 2. Extract detailed stream metadata via yt-dlp with PO-Token Provider
    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "nocheckcertificate": True,
        "extractor_args": get_yt_extractor_args(),
    }

    info = {}
    yt_error_msg = ""
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False) or {}
    except Exception as e:
        yt_error_msg = str(e)
        logger.warning(f"yt-dlp metadata extraction notice for {clean_url}: {e}")

    # If both oEmbed returned 404/not found and yt-dlp failed, the video is definitely unavailable
    if oembed_status in (404, 400) and not info:
        raise ValueError("This YouTube video or live broadcast is unavailable or has been removed.")

    if not info and not oembed_data:
        if "Private video" in yt_error_msg:
            raise ValueError("This YouTube video is private.")
        elif "Video unavailable" in yt_error_msg:
            raise ValueError("This YouTube video is unavailable or has been removed.")
        else:
            raise ValueError(f"Unable to access YouTube stream: {yt_error_msg or 'Video unavailable'}")

    title = info.get("title") or oembed_data.get("title") or "YouTube Worship Session"
    channel = info.get("uploader") or info.get("channel") or oembed_data.get("author_name") or "YouTube Channel"
    thumbnail = info.get("thumbnail") or oembed_data.get("thumbnail_url")

    duration = info.get("duration")
    if duration is not None:
        duration = float(duration)

    live_status = info.get("live_status", "")
    is_live = bool(
        info.get("is_live")
        or live_status == "is_live"
        or "/live/" in clean_url.lower()
        or (info.get("was_live") is False and duration is None and bool(info))
    )
    is_upcoming = bool(live_status == "is_upcoming" or info.get("is_upcoming"))

    return {
        "title": title,
        "channel": channel,
        "duration_seconds": duration,
        "thumbnail": thumbnail,
        "is_live": is_live,
        "is_upcoming": is_upcoming,
        "view_count": info.get("view_count"),
        "description": (info.get("description") or "")[:300],
        "url": clean_url,
    }


def download_recorded_youtube_audio(
    url: str,
    output_wav_path: str,
    progress_callback: Optional[Callable[[str, float], None]] = None,
) -> str:
    """
    Downloads audio-only stream from recorded YouTube video and converts directly
    to a 16-bit 16kHz mono PCM WAV file for speech-to-text processing and master replay.
    """
    import yt_dlp

    clean_url = url.strip()
    os.makedirs(os.path.dirname(output_wav_path), exist_ok=True)
    temp_id = uuid.uuid4().hex[:8]
    temp_dir = os.path.join(os.path.dirname(output_wav_path), f"tmp_yt_{temp_id}")
    os.makedirs(temp_dir, exist_ok=True)
    temp_download_template = os.path.join(temp_dir, "%(id)s.%(ext)s")

    ffmpeg_path = get_ffmpeg_binary()

    def ydl_progress_hook(d):
        if progress_callback and d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 1
            downloaded = d.get("downloaded_bytes") or 0
            pct = min(50.0, (downloaded / total) * 50.0)
            progress_callback("Downloading YouTube audio stream...", pct)

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": temp_download_template,
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "extractor_args": get_yt_extractor_args(),
        "progress_hooks": [ydl_progress_hook],
        "ffmpeg_location": os.path.dirname(ffmpeg_path) if ffmpeg_path else None,
    }

    try:
        if progress_callback:
            progress_callback("Connecting to YouTube audio stream...", 5.0)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([clean_url])

        # Find downloaded temporary file
        downloaded_files = [
            os.path.join(temp_dir, f)
            for f in os.listdir(temp_dir)
            if os.path.isfile(os.path.join(temp_dir, f))
        ]
        if not downloaded_files:
            raise RuntimeError("YouTube audio download did not produce a valid file.")

        downloaded_file = downloaded_files[0]

        if progress_callback:
            progress_callback("Converting YouTube audio to 16kHz PCM WAV...", 60.0)

        # Convert to 16kHz mono 16-bit PCM WAV using FFmpeg
        cmd = [
            ffmpeg_path,
            "-y",
            "-i",
            downloaded_file,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            output_wav_path,
        ]

        conv_result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if conv_result.returncode != 0:
            raise RuntimeError(f"FFmpeg conversion failed: {conv_result.stderr}")

        if not os.path.exists(output_wav_path) or os.path.getsize(output_wav_path) == 0:
            raise RuntimeError("Converted audio file is empty.")

        if progress_callback:
            progress_callback("YouTube audio ready for transcription.", 75.0)

        return output_wav_path

    finally:
        # Clean up temporary download directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


class YouTubeLiveSessionManager:
    """
    Manages active server-side YouTube Live sessions.
    Runs continuous audio streaming from YouTube Live through FFmpeg into Azure Speech.
    """

    def __init__(self):
        self.active_sessions: Dict[str, Dict[str, Any]] = {}

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.active_sessions.get(session_id)

    async def start_live_session(
        self,
        url: str,
        title: Optional[str] = None,
        programme: Optional[str] = None,
        programme_session: Optional[str] = None,
        minister: Optional[str] = None,
        message_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Initiates a server-side YouTube Live transcription session.
        """
        import yt_dlp

        clean_url = url.strip()
        metadata = extract_youtube_metadata(clean_url)
        if not metadata.get("is_live"):
            raise ValueError("The provided YouTube URL is not currently broadcasting a live stream.")

        session_id = f"session_yt_live_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        session_title = title or metadata.get("title") or "YouTube Live Service"

        # Initialize SQL database record
        meta_dict = {
            "input_source": "youtube_live",
            "youtube_url": clean_url,
            "channel": metadata.get("channel"),
            "thumbnail": metadata.get("thumbnail"),
            "programme": programme or metadata.get("channel") or "Sunday Worship Service",
            "programmeSession": programme_session or "Live Stream",
            "minister": minister or "",
            "messageTitle": message_title or session_title,
        }

        await session_repo.create_session(
            session_id=session_id,
            title=session_title,
            recording_id=session_id,
            status="recording",
            provider_name="azure_speech",
            language_code="en-NG",
            start_time=time.time(),
            metadata=meta_dict,
        )

        # Setup master audio stream session in storage/audio/
        audio_session = AudioStreamSession(
            session_id=session_id,
            sample_rate=16000,
            channels=1,
            device_name=f"YouTube Live ({metadata.get('channel') or 'Online'})",
        )

        # Setup Azure Live Transcription Session
        live_transcription = LiveTranscriptionSession(
            recording_id=session_id,
            session_id=session_id,
            sample_rate=16000,
            channels=1,
            language_code="en-NG",
        )
        live_transcription.start()

        stop_event = threading.Event()
        session_state = {
            "session_id": session_id,
            "url": clean_url,
            "title": session_title,
            "metadata": meta_dict,
            "status": "connecting",  # connecting, live, transcribing, stream_ended, completed, failed
            "start_time": time.time(),
            "elapsed_seconds": 0.0,
            "audio_session": audio_session,
            "live_transcription": live_transcription,
            "stop_event": stop_event,
            "error": None,
        }

        self.active_sessions[session_id] = session_state

        # Launch background audio ingestion thread
        worker_thread = threading.Thread(
            target=self._run_live_stream_worker,
            args=(session_id, clean_url, stop_event),
            name=f"YTLiveStream-{session_id}",
            daemon=True,
        )
        worker_thread.start()

        return {
            "session_id": session_id,
            "status": "connecting",
            "title": session_title,
            "metadata": meta_dict,
        }

    def _run_live_stream_worker(self, session_id: str, url: str, stop_event: threading.Event):
        """
        Background worker that resolves live audio stream URL, launches FFmpeg to decode
        16kHz mono PCM, and streams audio simultaneously into Azure Speech and the master WAV file.
        """
        import yt_dlp

        session_state = self.active_sessions.get(session_id)
        if not session_state:
            return

        audio_session: AudioStreamSession = session_state["audio_session"]
        live_transcription: LiveTranscriptionSession = session_state["live_transcription"]
        ffmpeg_path = get_ffmpeg_binary()

        try:
            session_state["status"] = "connecting"

            # Extract direct stream URL using yt-dlp
            ydl_opts = {
                "format": "bestaudio/best",
                "quiet": True,
                "no_warnings": True,
                "nocheckcertificate": True,
                "extractor_args": get_yt_extractor_args(),
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                stream_url = info.get("url")

            if not stream_url:
                raise RuntimeError("Could not resolve live audio stream URL from YouTube.")

            session_state["status"] = "live"

            # Launch FFmpeg to read live stream and stream 16-bit PCM 16kHz mono to stdout pipe
            cmd = [
                ffmpeg_path,
                "-reconnect", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "5",
                "-i", stream_url,
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "16000",
                "-ac", "1",
                "-f", "s16le",
                "pipe:1",
            ]

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=65536,
            )

            # 16000 Hz * 1 channel * 2 bytes/sample * 0.1s = 3200 bytes per 100ms chunk
            chunk_size = 3200

            while not stop_event.is_set():
                raw_bytes = process.stdout.read(chunk_size)
                if not raw_bytes:
                    # Stream ended
                    logger.info(f"YouTube Live stream ended for session {session_id}")
                    session_state["status"] = "stream_ended"
                    break

                # 1. Append to master audio session
                audio_session.append_chunk(raw_bytes)

                # 2. Push to Azure Speech live recognizer
                live_transcription.push_pcm(raw_bytes)

                # Update elapsed time
                session_state["elapsed_seconds"] = round(time.time() - session_state["start_time"], 1)

            try:
                process.terminate()
                process.wait(timeout=3)
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Error in YouTube live stream worker for {session_id}: {e}")
            session_state["status"] = "failed"
            session_state["error"] = str(e)

        finally:
            # Finalize session
            asyncio.run(self._finalize_live_session(session_id))

    async def _finalize_live_session(self, session_id: str):
        """Finalizes master WAV, Azure transcription, and updates SQL database."""
        session_state = self.active_sessions.get(session_id)
        if not session_state:
            return

        audio_session: AudioStreamSession = session_state.get("audio_session")
        live_transcription: LiveTranscriptionSession = session_state.get("live_transcription")

        audio_summary = {}
        if audio_session:
            try:
                audio_summary = audio_session.finalize()
            except Exception as e:
                logger.error(f"Error finalizing audio session for {session_id}: {e}")

        # Finalize Azure live transcription
        transcript_result = None
        if live_transcription:
            try:
                transcript_result = live_transcription.finalize()
            except Exception as e:
                logger.error(f"Error finalizing Azure transcription for {session_id}: {e}")

        raw_text = transcript_result.raw_text if transcript_result else ""
        segments = transcript_result.segments if transcript_result else []
        duration_sec = audio_summary.get("duration_seconds") or session_state.get("elapsed_seconds", 0.0)

        # Persist raw transcript to storage/transcripts/
        transcript_id = f"tr_{session_id}"
        transcript_file_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"{transcript_id}.json")
        try:
            transcript_data = {
                "transcript_id": transcript_id,
                "session_id": session_id,
                "source": "youtube_live",
                "duration_seconds": duration_sec,
                "raw_text": raw_text,
                "segments": [s.model_dump() if hasattr(s, "model_dump") else s for s in segments],
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            with open(transcript_file_path, "w", encoding="utf-8") as f:
                import json
                json.dump(transcript_data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving transcript file for {session_id}: {e}")

        # Finalize session in database
        try:
            await session_repo.finalize_session(
                session_id=session_id,
                audio_summary=audio_summary or {
                    "file_path": os.path.join(STORAGE_AUDIO_DIR, f"{session_id}.wav"),
                    "file_size": 0,
                    "duration_seconds": duration_sec,
                },
                transcript_summary={
                    "transcript_id": transcript_id,
                    "raw_text": raw_text,
                    "provider_name": "azure_speech",
                    "duration_seconds": duration_sec,
                },
            )
        except Exception as e:
            logger.error(f"Error finalizing session in DB for {session_id}: {e}")

        session_state["status"] = "completed"

    async def stop_live_session(self, session_id: str) -> Dict[str, Any]:
        """Manually stops an active server-side YouTube Live stream session."""
        session_state = self.active_sessions.get(session_id)
        if not session_state:
            raise ValueError(f"Session {session_id} not found or already stopped.")

        session_state["status"] = "stopping"
        stop_event: threading.Event = session_state.get("stop_event")
        if stop_event:
            stop_event.set()

        # Wait briefly for worker to complete finalization
        for _ in range(20):
            if session_state.get("status") == "completed":
                break
            await asyncio.sleep(0.2)

        return {
            "session_id": session_id,
            "status": "completed",
            "message": "YouTube Live session finalized successfully.",
        }


youtube_live_manager = YouTubeLiveSessionManager()
