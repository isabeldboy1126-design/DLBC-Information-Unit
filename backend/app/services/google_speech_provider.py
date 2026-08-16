"""
Google Cloud Speech-to-Text Provider Implementation

Implements the TranscriptionProvider interface using Google Cloud Speech-to-Text.
Supports both short recordings (< 1 min) and long sermon recordings (via GCS batch recognize),
with word-level timestamp extraction and automatic punctuation.
"""

import asyncio
import os
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from app.services.transcription_provider import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
)


class GoogleSpeechToTextProvider(TranscriptionProvider):
    """Google Cloud Speech-to-Text provider implementation."""

    def __init__(self):
        self.provider_id = "google_speech_to_text"

    def is_configured(self) -> bool:
        """
        Returns True if Google Cloud credentials are configured via
        GOOGLE_APPLICATION_CREDENTIALS environment variable or default application credentials.
        """
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        api_key = os.getenv("GOOGLE_SPEECH_API_KEY")
        if creds_path and os.path.exists(creds_path):
            return True
        if api_key and len(api_key.strip()) > 0:
            return True
        return False

    def get_gcs_bucket(self) -> Optional[str]:
        bucket = os.getenv("GCS_BUCKET_NAME", "").strip()
        return bucket if bucket else None

    def get_configuration_instructions(self) -> str:
        return (
            "To enable Google Cloud Speech-to-Text:\n"
            "1. Create or open a Google Cloud project.\n"
            "2. Enable the 'Cloud Speech-to-Text API' in the Google Cloud Console.\n"
            "3. (Recommended) Create a Service Account, generate a JSON Key file, and set its absolute path in backend/.env:\n"
            "   GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account-key.json\n"
            "4. For long sermon recordings (> 1 minute), also create a Cloud Storage bucket, enable 'Cloud Storage API', and set:\n"
            "   GCS_BUCKET_NAME=your-cloud-storage-bucket\n"
        )

    def _get_encoding_for_file(self, file_path: str):
        from google.cloud import speech

        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".wav":
            return speech.RecognitionConfig.AudioEncoding.LINEAR16
        elif ext == ".mp3":
            return speech.RecognitionConfig.AudioEncoding.MP3
        elif ext == ".flac":
            return speech.RecognitionConfig.AudioEncoding.FLAC
        elif ext == ".ogg":
            return speech.RecognitionConfig.AudioEncoding.OGG_OPUS
        else:
            # Default/fallback
            return speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED

    async def transcribe_audio(
        self,
        audio_file_path: str,
        language_code: str = "en-US",
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> TranscriptionResult:
        """
        Transcribes an audio file using Google Cloud Speech-to-Text.
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        if not self.is_configured():
            raise RuntimeError(
                f"Google Cloud Speech-to-Text is not configured.\n\n{self.get_configuration_instructions()}"
            )

        # Import Google Cloud SDK inside the method to allow app startup even before package resolution
        from google.cloud import speech

        client = speech.SpeechClient()
        file_size = os.path.getsize(audio_file_path)
        encoding = self._get_encoding_for_file(audio_file_path)

        config = speech.RecognitionConfig(
            encoding=encoding,
            language_code=language_code,
            enable_word_time_offsets=True,
            enable_automatic_punctuation=True,
            model="latest_long",
        )

        gcs_bucket = self.get_gcs_bucket()
        # If file is over ~10MB or longer than 1 minute, use LongRunningRecognize with GCS if configured
        is_large_file = file_size > (10 * 1024 * 1024)

        if is_large_file:
            if not gcs_bucket:
                raise RuntimeError(
                    f"This audio recording ({round(file_size / (1024*1024), 1)} MB) is a full/long sermon file.\n"
                    "Google Cloud Speech-to-Text requires a Google Cloud Storage bucket for long-running batch transcription.\n"
                    "Please set GCS_BUCKET_NAME in your backend/.env file to enable processing of full-length recordings."
                )

            return await self._transcribe_via_gcs(
                client=client,
                config=config,
                audio_file_path=audio_file_path,
                gcs_bucket=gcs_bucket,
                language_code=language_code,
                progress_callback=progress_callback,
            )
        else:
            return await self._transcribe_direct(
                client=client,
                config=config,
                audio_file_path=audio_file_path,
                language_code=language_code,
                progress_callback=progress_callback,
            )

    async def _transcribe_direct(
        self,
        client: Any,
        config: Any,
        audio_file_path: str,
        language_code: str,
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> TranscriptionResult:
        """Transcribes smaller audio files directly via inline audio bytes."""
        from google.cloud import speech

        if progress_callback:
            progress_callback("Reading audio data...", 20.0)

        with open(audio_file_path, "rb") as f:
            audio_bytes = f.read()

        audio = speech.RecognitionAudio(content=audio_bytes)

        if progress_callback:
            progress_callback("Sending to Google Cloud Speech-to-Text...", 40.0)

        # Run synchronous call in thread pool to not block asyncio event loop
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: client.recognize(config=config, audio=audio))

        if progress_callback:
            progress_callback("Formatting transcript and timestamp segments...", 85.0)

        return self._parse_google_response(response, language_code)

    async def _transcribe_via_gcs(
        self,
        client: Any,
        config: Any,
        audio_file_path: str,
        gcs_bucket: str,
        language_code: str,
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> TranscriptionResult:
        """Uploads temporary processing copy to GCS, runs long_running_recognize, and cleans up."""
        from google.cloud import speech, storage

        storage_client = storage.Client()
        bucket = storage_client.bucket(gcs_bucket)

        ext = os.path.splitext(audio_file_path)[1]
        temp_blob_name = f"temp_transcriptions/temp_{uuid.uuid4().hex}{ext}"
        blob = bucket.blob(temp_blob_name)

        if progress_callback:
            progress_callback("Staging processing copy to Google Cloud Storage...", 25.0)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: blob.upload_from_filename(audio_file_path))
        gcs_uri = f"gs://{gcs_bucket}/{temp_blob_name}"

        try:
            if progress_callback:
                progress_callback("Running Google Cloud batch speech recognition...", 50.0)

            audio = speech.RecognitionAudio(uri=gcs_uri)
            operation = await loop.run_in_executor(
                None, lambda: client.long_running_recognize(config=config, audio=audio)
            )

            # Poll operation result
            while not operation.done():
                if progress_callback:
                    progress_callback("Transcribing recorded sermon in Google Cloud...", 70.0)
                await asyncio.sleep(3)

            response = operation.result()

            if progress_callback:
                progress_callback("Finalizing transcript segments...", 90.0)

            return self._parse_google_response(response, language_code)

        finally:
            # Always clean up temporary GCS staging file
            try:
                await loop.run_in_executor(None, blob.delete)
            except Exception as e:
                print(f"Notice: Failed to remove temporary GCS object {temp_blob_name}: {e}")

    def _parse_google_response(self, response: Any, language_code: str) -> TranscriptionResult:
        """Extracts text and groups word-level timestamps into readable segments."""
        raw_transcripts = []
        segments: List[TranscriptionSegment] = []

        for result in response.results:
            if not result.alternatives:
                continue

            alt = result.alternatives[0]
            transcript_text = alt.transcript.strip()
            if not transcript_text:
                continue

            raw_transcripts.append(transcript_text)
            words = alt.words

            if words:
                # Group words into reasonable sentence/phrase chunks (~10-15s or punctuation)
                current_words = []
                seg_start = words[0].start_time.total_seconds()

                for i, w in enumerate(words):
                    word_str = w.word
                    current_words.append(word_str)
                    w_end = w.end_time.total_seconds()

                    is_sentence_end = word_str.endswith((".", "!", "?", ":", ";"))
                    is_long_chunk = (w_end - seg_start) >= 12.0
                    is_last_word = (i == len(words) - 1)

                    if is_sentence_end or is_long_chunk or is_last_word:
                        seg_text = " ".join(current_words).strip()
                        if seg_text:
                            segments.append(
                                TranscriptionSegment(
                                    start_time=round(seg_start, 2),
                                    end_time=round(w_end, 2),
                                    text=seg_text,
                                    confidence=round(alt.confidence, 3) if alt.confidence else None,
                                )
                            )
                        current_words = []
                        if not is_last_word:
                            seg_start = words[i + 1].start_time.total_seconds()
            else:
                # Fallback if word offsets were not returned
                segments.append(
                    TranscriptionSegment(
                        start_time=0.0,
                        end_time=0.0,
                        text=transcript_text,
                        confidence=round(alt.confidence, 3) if alt.confidence else None,
                    )
                )

        full_raw_text = " ".join(raw_transcripts).strip()
        total_duration = segments[-1].end_time if segments else 0.0

        return TranscriptionResult(
            provider_name=self.provider_id,
            raw_text=full_raw_text,
            segments=segments,
            duration_seconds=total_duration,
            language_code=language_code,
            metadata={
                "results_count": len(response.results),
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
