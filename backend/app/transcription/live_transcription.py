"""
Live Transcription Session Manager (Phase 3)

Provides isolated, non-blocking real-time speech-to-text streaming with Azure Speech SDK.
Ensures that transcription runs completely independently from the master audio capture
pipeline, guaranteeing that recording is never interrupted, delayed, or corrupted.
"""

import asyncio
import json
import os
import queue
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from app.database.session_repo import session_repo
from app.services.transcription_provider import (
    SegmentFlag,
    TranscriptionResult,
    TranscriptionSegment,
)
from app.transcription.transcription_manager import (
    STORAGE_TRANSCRIPTS_DIR,
    load_transcripts_manifest,
    save_transcripts_manifest,
)


class LiveTranscriptionSession:
    """
    Manages an active real-time speech transcription session for a live recording.
    Audio PCM chunks are passed via a non-blocking queue to a dedicated background
    worker thread feeding Azure's PushAudioInputStream.
    """

    def __init__(
        self,
        recording_id: str,
        session_id: Optional[str] = None,
        sample_rate: int = 48000,
        channels: int = 1,
        language_code: str = "en-NG",
        ws_send_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
        event_loop: Optional[asyncio.AbstractEventLoop] = None,
    ):
        self.recording_id = recording_id
        self.session_id = session_id or f"session_{recording_id}"
        self.sample_rate = sample_rate
        self.channels = channels
        self.language_code = language_code
        self.ws_send_callback = ws_send_callback
        self.event_loop = event_loop or asyncio.get_event_loop()


        self.api_key = os.getenv("AZURE_SPEECH_KEY", "").strip()
        self.region = os.getenv("AZURE_SPEECH_REGION", "southafricanorth").strip()
        self.silence_timeout_ms = os.getenv("AZURE_SEGMENTATION_SILENCE_MS", "400").strip()
        self.low_conf_threshold = float(os.getenv("LOW_CONFIDENCE_THRESHOLD", "0.54"))

        self.is_active = False
        self.status = "initializing"  # 'initializing', 'listening', 'recognizing', 'reconnecting', 'unavailable', 'completed'
        self.status_message = "Initializing live transcription..."

        self.segments: List[TranscriptionSegment] = []
        self.current_interim_text = ""
        self.is_finalized = False

        # Non-blocking buffer queue for audio feeding
        self._audio_queue: queue.Queue = queue.Queue(maxsize=1000)
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Azure SDK objects
        self._push_stream = None
        self._recognizer = None

    def start(self):
        """Starts the background transcription worker thread if credentials are valid."""
        if not self.api_key:
            self.status = "unavailable"
            self.status_message = "Azure Speech key not configured"
            self._notify_status()
            return

        self.is_active = True
        self._worker_thread = threading.Thread(
            target=self._worker_run,
            name=f"LiveTranscribeWorker-{self.recording_id}",
            daemon=True,
        )
        self._worker_thread.start()

    def push_pcm(self, pcm_data: bytes):
        """
        Non-blocking audio push. If queue is full, oldest non-critical chunks
        are dropped on the transcription side without blocking audio disk writing.
        """
        if not self.is_active or self.is_finalized:
            return

        try:
            self._audio_queue.put_nowait(pcm_data)
        except queue.Full:
            try:
                # Drop one old chunk to prevent memory bloat and prevent blocking
                self._audio_queue.get_nowait()
                self._audio_queue.put_nowait(pcm_data)
            except Exception:
                pass

    def toggle_manual_flag(self, segment_idx: int) -> Optional[TranscriptionSegment]:
        """Toggles a manual verification flag on a specific completed segment."""
        if segment_idx < 0 or segment_idx >= len(self.segments):
            return None

        seg = self.segments[segment_idx]
        existing_manual = [f for f in seg.flags if f.flag_type == "manual_flag"]

        if existing_manual:
            # Remove manual flag
            seg.flags = [f for f in seg.flags if f.flag_type != "manual_flag"]
        else:
            # Add manual flag
            manual_flag = SegmentFlag(
                flag_id=f"flag_man_{uuid.uuid4().hex[:8]}",
                flag_type="manual_flag",
                confidence=seg.confidence,
                reason="Flagged manually by operator during recording",
                is_verified=False,
            )
            seg.flags.append(manual_flag)

        # Notify frontend of updated segment
        self._notify_segment_update(segment_idx, seg)

        # Progressively update flags in SQLite
        try:
            flags_data = [f.model_dump() if hasattr(f, "model_dump") else f for f in (seg.flags or [])]
            asyncio.run_coroutine_threadsafe(
                session_repo.update_segment_flags(
                    session_id=self.session_id,
                    segment_index=segment_idx,
                    flags=flags_data,
                ),
                self.event_loop,
            )

        except Exception as e:
            print(f"Notice: Progressive flag update notice: {e}")

        return seg


    def finalize(self, wav_summary: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Stops live recognition, finalizes the raw transcript, and persists
        the record to storage/transcripts/.
        """
        if self.is_finalized:
            return self.get_summary()

        self.is_finalized = True
        self.is_active = False
        self._stop_event.set()

        # Close push stream to allow recognizer to finish
        if self._push_stream:
            try:
                self._push_stream.close()
            except Exception:
                pass

        # Wait briefly for worker thread to complete recognition
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=3.0)

        # Build raw continuous text from segments
        raw_text = " ".join(seg.text.strip() for seg in self.segments if seg.text.strip())

        transcript_id = f"tr_{self.recording_id}"
        transcript_file_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"{transcript_id}.json")
        duration = (
            wav_summary.get("duration_seconds")
            if wav_summary and "duration_seconds" in wav_summary
            else (self.segments[-1].end_time if self.segments else 0.0)
        )

        transcript_data = {
            "transcript_id": transcript_id,
            "upload_id": self.recording_id,
            "recording_id": self.recording_id,
            "original_filename": f"{self.recording_id}.wav",
            "saved_filename": f"{self.recording_id}.wav",
            "is_video": False,
            "duration_seconds": duration,
            "provider_name": "azure_speech",
            "language_code": self.language_code,
            "raw_text": raw_text,
            "segments": [seg.model_dump() for seg in self.segments],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "metadata": {
                "source": "live_stream",
                "device_name": wav_summary.get("device_name", "Microphone") if wav_summary else "Microphone",
                "sample_rate": self.sample_rate,
                "channels": self.channels,
                "low_conf_threshold": self.low_conf_threshold,
                "silence_timeout_ms": self.silence_timeout_ms,
            },
        }

        # Save transcript file to storage
        try:
            with open(transcript_file_path, "w", encoding="utf-8") as f:
                json.dump(transcript_data, f, indent=2)

            # Update transcript manifest for history viewer
            manifest = load_transcripts_manifest()
            manifest = [m for m in manifest if m.get("transcript_id") != transcript_id]
            summary_entry = {
                "transcript_id": transcript_id,
                "upload_id": self.recording_id,
                "original_filename": f"{self.recording_id}.wav",
                "is_video": False,
                "duration_seconds": duration,
                "provider_name": "azure_speech",
                "segments_count": len(self.segments),
                "flagged_segments_count": sum(
                    1 for s in self.segments if s.is_low_confidence or s.flags
                ),
                "preview_text": (raw_text[:120] + "...") if len(raw_text) > 120 else raw_text,
                "created_at": transcript_data["created_at"],
            }
            manifest.insert(0, summary_entry)
            save_transcripts_manifest(manifest)
        except Exception as e:
            print(f"Error persisting live transcript for {self.recording_id}: {e}")

        self.status = "completed"
        self.status_message = "Live transcription finalized"
        self._notify_status()

        return transcript_data

    def get_summary(self) -> Dict[str, Any]:
        return {
            "recording_id": self.recording_id,
            "segments_count": len(self.segments),
            "status": self.status,
            "status_message": self.status_message,
        }

    # =========================================================================
    # Internal Worker & Azure Recognizer Loop
    # =========================================================================

    def _worker_run(self):
        """Worker thread running Azure Speech continuous recognition over PushAudioInputStream."""
        import azure.cognitiveservices.speech as speechsdk

        try:
            # 1. Configure audio format & push stream
            stream_fmt = speechsdk.audio.AudioStreamFormat(
                samples_per_second=self.sample_rate,
                bits_per_sample=16,
                channels=self.channels,
            )
            self._push_stream = speechsdk.audio.PushAudioInputStream(stream_format=stream_fmt)
            audio_config = speechsdk.AudioConfig(stream=self._push_stream)

            # 2. Configure Speech SDK
            speech_config = speechsdk.SpeechConfig(
                subscription=self.api_key,
                region=self.region,
            )
            speech_config.speech_recognition_language = self.language_code
            speech_config.output_format = speechsdk.OutputFormat.Detailed
            speech_config.request_word_level_timestamps()
            speech_config.set_property(
                speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
                str(self.silence_timeout_ms),
            )

            # 3. Instantiate recognizer
            self._recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )

            # 4. Attach event handlers
            def on_session_started(evt):
                self.status = "listening"
                self.status_message = f"Azure Connected ({self.language_code})"
                self._notify_status()

            def on_recognizing(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
                    text = evt.result.text.strip()
                    self.current_interim_text = text
                    self.status = "recognizing"
                    self.status_message = "Receiving speech..."
                    self._notify_interim(text)

            def on_recognized(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    text = evt.result.text.strip()
                    if text:
                        self.current_interim_text = ""
                        self.status = "listening"
                        self.status_message = f"Listening ({self.language_code})"

                        offset_secs = round(evt.result.offset / 10_000_000, 2)
                        dur_secs = round(evt.result.duration / 10_000_000, 2)
                        end_secs = round(offset_secs + dur_secs, 2)

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
                                    top_res = nbest[0]
                                    if "Confidence" in top_res:
                                        confidence = round(float(top_res["Confidence"]), 3)
                                    words_raw = top_res.get("Words", [])
                                    for w in words_raw:
                                        w_offset = round(w.get("Offset", 0) / 10_000_000, 2)
                                        w_dur = round(w.get("Duration", 0) / 10_000_000, 2)
                                        word_entries.append({
                                            "word": w.get("Word", ""),
                                            "start_time": w_offset,
                                            "end_time": round(w_offset + w_dur, 2),
                                            "confidence": (
                                                round(float(w["Confidence"]), 3)
                                                if "Confidence" in w
                                                else None
                                            ),
                                        })
                        except Exception as parse_err:
                            print(f"Notice: Parsing live Azure confidence: {parse_err}")

                        # Automated low confidence check (< 0.54)
                        is_low_conf = False
                        flags: List[SegmentFlag] = []
                        if confidence is not None and confidence < self.low_conf_threshold:
                            is_low_conf = True
                            flags.append(
                                SegmentFlag(
                                    flag_id=f"flag_{uuid.uuid4().hex[:8]}",
                                    flag_type="low_confidence",
                                    confidence=confidence,
                                    reason=f"Azure confidence ({round(confidence * 100, 1)}%) is below verification threshold ({int(self.low_conf_threshold * 100)}%)",
                                    is_verified=False,
                                )
                            )

                        segment = TranscriptionSegment(
                            start_time=offset_secs,
                            end_time=end_secs,
                            text=text,
                            confidence=confidence,
                            is_low_confidence=is_low_conf,
                            flags=flags,
                            words=word_entries,
                        )
                        self.segments.append(segment)
                        self._notify_new_segment(len(self.segments) - 1, segment)

                        flags_data = [f.model_dump() if hasattr(f, "model_dump") else f for f in (flags or [])]
                        try:
                            asyncio.run_coroutine_threadsafe(
                                session_repo.append_segment(
                                    session_id=self.session_id,
                                    segment_index=len(self.segments) - 1,
                                    start_time=offset_secs,
                                    end_time=end_secs,
                                    text=text,
                                    confidence=confidence,
                                    is_low_confidence=is_low_conf,
                                    flags=flags_data,
                                    words=word_entries,
                                ),
                                self.event_loop,
                            )
                        except Exception as p_err:
                            print(f"Notice: Progressive segment persistence notice: {p_err}")



            def on_canceled(evt):
                print(f"Azure Speech canceled event: {evt.reason} ({evt.error_details})")
                if evt.reason == speechsdk.CancellationReason.Error:
                    self.status = "reconnecting"
                    self.status_message = "Live transcription reconnecting..."
                    self._notify_status()

            self._recognizer.session_started.connect(on_session_started)
            self._recognizer.recognizing.connect(on_recognizing)
            self._recognizer.recognized.connect(on_recognized)
            # Start recognition synchronously in this background worker thread
            self._recognizer.start_continuous_recognition()

            # Audio feeding loop from queue to push stream
            while not self._stop_event.is_set():
                try:
                    chunk = self._audio_queue.get(timeout=0.2)
                    if chunk and self._push_stream:
                        self._push_stream.write(chunk)
                except queue.Empty:
                    continue
                except Exception as stream_err:
                    print(f"Error writing chunk to push stream: {stream_err}")

            # Flush any remaining audio in queue
            while not self._audio_queue.empty():
                try:
                    chunk = self._audio_queue.get_nowait()
                    if chunk and self._push_stream:
                        self._push_stream.write(chunk)
                except Exception:
                    break

            if self._push_stream:
                try:
                    self._push_stream.close()
                except Exception:
                    pass

            if self._recognizer:
                try:
                    self._recognizer.stop_continuous_recognition()
                except Exception:
                    pass

        except Exception as e:
            print(f"Live transcription worker error: {e}")
            self.status = "unavailable"
            self.status_message = f"Live transcription unavailable: {e}"
            self._notify_status()
        finally:
            if self._push_stream:
                try:
                    self._push_stream.close()
                except Exception:
                    pass


    # =========================================================================
    # WebSocket Notifications to Frontend
    # =========================================================================

    def _send_ws_payload(self, payload: Dict[str, Any]):
        if not self.ws_send_callback or not self.event_loop:
            return
        try:
            if self.event_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.ws_send_callback(payload),
                    self.event_loop,
                )
        except Exception as e:
            print(f"Error sending live transcript WebSocket event: {e}")

    def _notify_status(self):
        self._send_ws_payload({
            "type": "live_transcription_status",
            "status": self.status,
            "message": self.status_message,
        })

    def _notify_interim(self, text: str):
        self._send_ws_payload({
            "type": "live_transcript_interim",
            "text": text,
        })

    def _notify_new_segment(self, index: int, segment: TranscriptionSegment):
        self._send_ws_payload({
            "type": "live_transcript_segment",
            "index": index,
            "segment": segment.model_dump(),
        })

    def _notify_segment_update(self, index: int, segment: TranscriptionSegment):
        self._send_ws_payload({
            "type": "live_transcript_segment_updated",
            "index": index,
            "segment": segment.model_dump(),
        })
