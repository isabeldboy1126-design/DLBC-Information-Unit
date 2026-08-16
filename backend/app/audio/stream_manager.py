"""
Audio Stream Session Manager

Handles progressive streaming of uncompressed PCM chunks to disk,
ensuring safe storage and automatic finalization into standard WAV format.
"""

import json
import os
import time
import uuid
from typing import Dict, Optional
from app.audio.wav_writer import finalize_pcm_to_wav

# Resolve project root and storage directory
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend/app
BACKEND_DIR = os.path.dirname(APP_DIR) # backend
PROJECT_ROOT = os.path.dirname(BACKEND_DIR) # Project root
STORAGE_AUDIO_DIR = os.path.join(PROJECT_ROOT, "storage", "audio")
os.makedirs(STORAGE_AUDIO_DIR, exist_ok=True)
MANIFEST_FILE = os.path.join(STORAGE_AUDIO_DIR, "recordings_manifest.json")


def load_manifest() -> list:
    if os.path.exists(MANIFEST_FILE):
        try:
            with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_manifest(manifest: list):
    try:
        with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
    except Exception as e:
        print(f"Error saving manifest: {e}")


class AudioStreamSession:
    def __init__(
        self,
        session_id: str,
        sample_rate: int = 48000,
        channels: int = 1,
        device_name: str = "Unknown Device",
    ):
        self.session_id = session_id
        self.sample_rate = sample_rate
        self.channels = channels
        self.device_name = device_name
        self.start_time = time.time()
        self.total_bytes = 0
        self.chunk_count = 0
        self.is_finalized = False

        self.pcm_path = os.path.join(STORAGE_AUDIO_DIR, f"active_{self.session_id}.pcm")
        self.wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{self.session_id}.wav")

        # Open PCM file for appending in binary mode
        self.file_handle = open(self.pcm_path, "wb")

    def append_chunk(self, data: bytes):
        if self.is_finalized or not self.file_handle:
            return
        self.file_handle.write(data)
        self.file_handle.flush()
        self.total_bytes += len(data)
        self.chunk_count += 1

    def finalize(self) -> dict:
        if self.is_finalized:
            return self.get_summary()

        self.is_finalized = True
        if self.file_handle:
            try:
                self.file_handle.flush()
                self.file_handle.close()
            except Exception:
                pass
            self.file_handle = None

        summary = {
            "recording_id": self.session_id,
            "filename": f"{self.session_id}.wav",
            "file_path": self.wav_path,
            "device_name": self.device_name,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "bits_per_sample": 16,
            "total_bytes": self.total_bytes,
            "chunk_count": self.chunk_count,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.start_time)),
            "duration_seconds": 0.0,
            "file_size": 0,
        }

        # Convert raw PCM to canonical WAV if any data was received
        if os.path.exists(self.pcm_path) and os.path.getsize(self.pcm_path) > 0:
            try:
                wav_info = finalize_pcm_to_wav(
                    pcm_file_path=self.pcm_path,
                    wav_file_path=self.wav_path,
                    sample_rate=self.sample_rate,
                    num_channels=self.channels,
                )
                summary.update(wav_info)
            except Exception as e:
                print(f"Error finalizing WAV for session {self.session_id}: {e}")
            finally:
                # Remove temporary PCM file
                try:
                    if os.path.exists(self.pcm_path):
                        os.remove(self.pcm_path)
                except Exception:
                    pass

        # Update persistent manifest
        manifest = load_manifest()
        manifest = [item for item in manifest if item.get("recording_id") != self.session_id]
        manifest.insert(0, summary)
        save_manifest(manifest)

        return summary

    def get_summary(self) -> dict:
        manifest = load_manifest()
        for item in manifest:
            if item.get("recording_id") == self.session_id:
                return item
        return {
            "recording_id": self.session_id,
            "filename": f"{self.session_id}.wav",
            "device_name": self.device_name,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "is_finalized": self.is_finalized,
        }


class StreamManager:
    def __init__(self):
        self.active_sessions: Dict[str, AudioStreamSession] = {}

    def create_session(
        self,
        sample_rate: int = 48000,
        channels: int = 1,
        device_name: str = "Default Input",
    ) -> AudioStreamSession:
        session_id = f"rec_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        session = AudioStreamSession(
            session_id=session_id,
            sample_rate=sample_rate,
            channels=channels,
            device_name=device_name,
        )
        self.active_sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[AudioStreamSession]:
        return self.active_sessions.get(session_id)

    def finalize_session(self, session_id: str) -> Optional[dict]:
        session = self.active_sessions.pop(session_id, None)
        if session:
            return session.finalize()
        return None


# Global singleton instance
stream_manager = StreamManager()
