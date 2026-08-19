"""
Azure Speech-to-Text Transcription Provider Implementation

Implements the TranscriptionProvider interface using the official Azure Cognitive Services Speech SDK.
Uses continuous recognition (start_continuous_recognition_async) for reliable, complete audio transcription.
Reads credentials strictly from backend environment (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION).
Configured by default for en-NG (English - Nigeria) in the southafricanorth region.
"""

import asyncio
import json
import os
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from app.services.transcription_provider import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
)
from app.transcription.audio_extractor import convert_to_wav_audio


class AzureSpeechToTextProvider(TranscriptionProvider):
    """Transcription provider using Microsoft Azure Cognitive Services Speech SDK."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        region: Optional[str] = None,
        default_language: str = "en-NG",
    ):
        self.provider_id = "azure_speech"
        self.api_key = api_key or os.getenv("AZURE_SPEECH_KEY")
        self.region = region or os.getenv("AZURE_SPEECH_REGION", "southafricanorth")
        self.default_language = os.getenv("AZURE_SPEECH_LANGUAGE", default_language)

    def is_configured(self) -> bool:
        """Returns True if the required Azure Speech key and region are present."""
        return bool(self.api_key and self.region)

    def get_configuration_instructions(self) -> str:
        return (
            "To enable Azure Speech-to-Text:\n"
            "1. Create an Azure Cognitive Services Speech resource (or use an active Azure for Students subscription).\n"
            "2. In the Azure Portal, open your Speech Resource -> Keys and Endpoint.\n"
            "3. Add your key and region in backend/.env:\n"
            "   AZURE_SPEECH_KEY=your_azure_speech_key_here\n"
            "   AZURE_SPEECH_REGION=southafricanorth\n"
            "   AZURE_SPEECH_LANGUAGE=en-NG\n"
        )

    def _prepare_wav_for_azure(self, audio_file_path: str) -> str:
        """
        Ensures the audio file is in standard 16kHz 16-bit mono WAV format for Azure Speech SDK.
        Returns the path to the processing WAV copy or original file.
        """
        ext = os.path.splitext(audio_file_path)[1].lower()
        if ext == ".wav":
            # Already WAV, can be used directly or converted if needed
            return audio_file_path

        # Convert MP3, M4A, or MP4 to a temporary 16kHz mono WAV copy
        dir_name = os.path.dirname(audio_file_path)
        base_name = os.path.splitext(os.path.basename(audio_file_path))[0]
        proc_wav_path = os.path.join(dir_name, f"proc_azure_{base_name}.wav")

        if not os.path.exists(proc_wav_path):
            convert_to_wav_audio(
                input_path=audio_file_path,
                output_wav_path=proc_wav_path,
                sample_rate=16000,
                channels=1,
            )
        return proc_wav_path

    async def transcribe_audio(
        self,
        audio_file_path: str,
        language_code: str = "en-NG",
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> TranscriptionResult:
        """
        Transcribes the given audio file using Azure Speech SDK continuous recognition.
        """
        if not self.is_configured():
            raise RuntimeError(
                f"Azure Speech-to-Text is not configured.\n\n{self.get_configuration_instructions()}"
            )

        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        # Language code resolution
        lang = language_code or self.default_language
        if lang == "en-US" and self.default_language:
            # Respect Nigeria English default unless explicitly specified
            lang = self.default_language

        if progress_callback:
            progress_callback("Preparing audio for Azure Speech...", 15.0)

        # Ensure suitable WAV file for SDK
        processing_wav_path = self._prepare_wav_for_azure(audio_file_path)
        is_temp_wav = processing_wav_path != audio_file_path

        loop = asyncio.get_event_loop()
        start_time_proc = time.time()

        if progress_callback:
            progress_callback(f"Transcribing audio with Azure Speech ({lang})...", 30.0)

        def _run_continuous_recognition():
            import azure.cognitiveservices.speech as speechsdk

            speech_config = speechsdk.SpeechConfig(
                subscription=self.api_key,
                region=self.region,
            )
            speech_config.speech_recognition_language = lang
            speech_config.output_format = speechsdk.OutputFormat.Detailed
            
            # Request word-level timestamps from Azure
            speech_config.request_word_level_timestamps()

            # Configure natural phrase/sentence segmentation silence timeout (default 400ms)
            silence_timeout_ms = os.getenv("AZURE_SEGMENTATION_SILENCE_MS", "400")
            speech_config.set_property(
                speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
                str(silence_timeout_ms),
            )

            # Verification threshold (default 0.54)
            low_conf_threshold = float(os.getenv("LOW_CONFIDENCE_THRESHOLD", "0.54"))

            audio_config = speechsdk.AudioConfig(filename=processing_wav_path)
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )

            done_event = threading.Event()
            collected_segments: List[TranscriptionSegment] = []
            collected_texts: List[str] = []
            cancellation_error: List[str] = []

            def on_recognized(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    text = evt.result.text.strip()
                    if text:
                        # Convert 100-nanosecond units (ticks) to seconds
                        offset_secs = round(evt.result.offset / 10_000_000, 2)
                        duration_secs = round(evt.result.duration / 10_000_000, 2)
                        end_secs = round(offset_secs + duration_secs, 2)

                        # Extract confidence and word-level timestamps from detailed JSON
                        confidence: Optional[float] = None
                        word_entries: List[Dict[str, Any]] = []

                        try:
                            json_str = evt.result.properties.get(
                                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
                            )
                            if json_str:
                                detail_data = json.loads(json_str)
                                nbest = detail_data.get("NBest", [])
                                if nbest:
                                    top_result = nbest[0]
                                    if "Confidence" in top_result:
                                        confidence = round(float(top_result["Confidence"]), 3)
                                    
                                    words_raw = top_result.get("Words", [])
                                    for w in words_raw:
                                        w_offset = round(w.get("Offset", 0) / 10_000_000, 2)
                                        w_dur = round(w.get("Duration", 0) / 10_000_000, 2)
                                        word_entries.append({
                                            "word": w.get("Word", ""),
                                            "start_time": w_offset,
                                            "end_time": round(w_offset + w_dur, 2),
                                            "confidence": round(float(w["Confidence"]), 3) if "Confidence" in w else None,
                                        })
                        except Exception as parse_err:
                            print(f"Notice: Could not parse detailed Azure confidence/words: {parse_err}")

                        # Determine if confidence flag should be attached (< 54% confidence)
                        is_low_conf = False
                        flags: List[Dict[str, Any]] = []
                        if confidence is not None and confidence < low_conf_threshold:
                            is_low_conf = True
                            flags.append({
                                "flag_id": f"flag_{uuid.uuid4().hex[:8]}",
                                "flag_type": "low_confidence",
                                "confidence": confidence,
                                "reason": f"Azure confidence ({round(confidence * 100, 1)}%) is below verification threshold ({int(low_conf_threshold * 100)}%)",
                                "is_verified": False,
                                "verified_by": None,
                                "verified_at": None,
                                "notes": None,
                            })

                        collected_texts.append(text)
                        collected_segments.append(
                            TranscriptionSegment(
                                start_time=offset_secs,
                                end_time=end_secs,
                                text=text,
                                confidence=confidence,
                                is_low_confidence=is_low_conf,
                                flags=flags,
                                words=word_entries,
                            )
                        )
                        if progress_callback:
                            pct = min(90.0, 30.0 + len(collected_segments) * 3.0)
                            progress_callback(
                                f"Azure Speech: recognized {len(collected_segments)} segment(s)...",
                                pct,
                            )

            def on_canceled(evt):
                cancellation_details = evt.cancellation_details
                if cancellation_details.reason == speechsdk.CancellationReason.Error:
                    err_msg = (
                        f"Azure Speech Error (Code {cancellation_details.error_code}): "
                        f"{cancellation_details.error_details}"
                    )
                    cancellation_error.append(err_msg)
                done_event.set()

            def on_session_stopped(evt):
                done_event.set()

            speech_recognizer.recognized.connect(on_recognized)
            speech_recognizer.canceled.connect(on_canceled)
            speech_recognizer.session_stopped.connect(on_session_stopped)

            # Start continuous recognition
            speech_recognizer.start_continuous_recognition_async()
            # Wait for recognition to complete
            done_event.wait()
            # Stop recognition
            speech_recognizer.stop_continuous_recognition_async()

            if cancellation_error:
                raise RuntimeError(cancellation_error[0])

            return collected_segments, collected_texts

        try:
            segments, texts = await loop.run_in_executor(None, _run_continuous_recognition)
        finally:
            if is_temp_wav and os.path.exists(processing_wav_path):
                try:
                    os.remove(processing_wav_path)
                except Exception:
                    pass

        elapsed_proc_time = round(time.time() - start_time_proc, 2)

        if progress_callback:
            progress_callback("Formatting Azure transcript...", 95.0)

        full_raw_text = " ".join(texts).strip()
        total_duration = segments[-1].end_time if segments else 0.0

        return TranscriptionResult(
            provider_name=self.provider_id,
            raw_text=full_raw_text,
            segments=segments,
            duration_seconds=total_duration,
            language_code=lang,
            metadata={
                "provider": "Azure Cognitive Services Speech",
                "region": self.region,
                "language": lang,
                "segments_count": len(segments),
                "processing_time_seconds": elapsed_proc_time,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
