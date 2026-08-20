"""
Faster-Whisper Local Transcription Provider Implementation

Implements the TranscriptionProvider interface using faster-whisper (CTranslate2).
Runs 100% locally on CPU using int8 quantization with model caching.
Requires zero external APIs, credentials, or cloud billing.
"""

import asyncio
import os
import time
from typing import Any, Callable, Dict, List, Optional

from app.services.transcription_provider import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
)

from app.config import STORAGE_MODELS_DIR as MODELS_DIR


class FasterWhisperProvider(TranscriptionProvider):
    """Local offline transcription provider using faster-whisper."""

    _model_instance = None
    _loaded_model_size = None

    def __init__(
        self,
        model_size: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
    ):
        self.provider_id = "faster_whisper"
        self.model_size = os.getenv("WHISPER_MODEL_SIZE", model_size)
        self.device = os.getenv("WHISPER_DEVICE", device)
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", compute_type)

    def is_configured(self) -> bool:
        """Faster-Whisper is always ready to run locally."""
        return True

    def get_configuration_instructions(self) -> str:
        return (
            "Faster-Whisper operates locally on your computer using CPU (int8 precision).\n"
            "No cloud billing or API keys are required.\n"
            f"Active model: '{self.model_size}' (Device: {self.device}, Compute: {self.compute_type}).\n"
            f"Models are cached in: {MODELS_DIR}"
        )

    def _get_or_load_model(self, progress_callback: Optional[Callable[[str, float], None]] = None):
        """Loads and caches the WhisperModel singleton instance."""
        from faster_whisper import WhisperModel

        if (
            FasterWhisperProvider._model_instance is not None
            and FasterWhisperProvider._loaded_model_size == self.model_size
        ):
            return FasterWhisperProvider._model_instance

        if progress_callback:
            progress_callback(
                f"Loading local Whisper model ('{self.model_size}', {self.compute_type})...",
                15.0,
            )

        print(f"Initializing Faster-Whisper model '{self.model_size}' on {self.device} ({self.compute_type})...")
        model = WhisperModel(
            model_size_or_path=self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            download_root=MODELS_DIR,
        )

        FasterWhisperProvider._model_instance = model
        FasterWhisperProvider._loaded_model_size = self.model_size
        return model

    async def transcribe_audio(
        self,
        audio_file_path: str,
        language_code: str = "en-US",
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> TranscriptionResult:
        """
        Transcribes the given local audio file using faster-whisper.
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        loop = asyncio.get_event_loop()

        # 1. Load or retrieve cached model
        if progress_callback:
            progress_callback("Preparing local transcription model...", 10.0)

        model = await loop.run_in_executor(
            None, lambda: self._get_or_load_model(progress_callback)
        )

        # 2. Convert BCP-47 language tag (e.g. 'en-US' -> 'en')
        whisper_lang = language_code.split("-")[0].lower() if language_code else "en"

        if progress_callback:
            progress_callback("Transcribing audio locally with Whisper...", 35.0)

        start_time_proc = time.time()

        # 3. Run transcription in thread pool
        def _run_transcribe():
            segments_generator, info = model.transcribe(
                audio_file_path,
                language=whisper_lang,
                word_timestamps=True,
                vad_filter=True,
                beam_size=5,
            )
            # Exhaust generator to collect all segments
            collected_segments = list(segments_generator)
            return collected_segments, info

        segments_raw, info = await loop.run_in_executor(None, _run_transcribe)
        elapsed_proc_time = round(time.time() - start_time_proc, 2)

        if progress_callback:
            progress_callback("Formatting transcript segments...", 90.0)

        # 4. Map into standard TranscriptionSegment format
        segments: List[TranscriptionSegment] = []
        raw_text_parts: List[str] = []

        for seg in segments_raw:
            text = seg.text.strip()
            if text:
                raw_text_parts.append(text)
                segments.append(
                    TranscriptionSegment(
                        start_time=round(seg.start, 2),
                        end_time=round(seg.end, 2),
                        text=text,
                        confidence=round(float(seg.avg_logprob), 3) if hasattr(seg, "avg_logprob") else None,
                    )
                )

        full_raw_text = " ".join(raw_text_parts).strip()
        detected_language = getattr(info, "language", whisper_lang)
        duration_seconds = getattr(info, "duration", None)
        if duration_seconds is None and segments:
            duration_seconds = segments[-1].end_time

        return TranscriptionResult(
            provider_name=self.provider_id,
            raw_text=full_raw_text,
            segments=segments,
            duration_seconds=round(duration_seconds, 2) if duration_seconds else 0.0,
            language_code=detected_language,
            metadata={
                "model_size": self.model_size,
                "device": self.device,
                "compute_type": self.compute_type,
                "processing_time_seconds": elapsed_proc_time,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
