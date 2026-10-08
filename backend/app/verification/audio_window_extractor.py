"""
Audio Window Extraction and Batching for Verification Engine (Stage 6)

Provides bounded, read-only audio extraction around flagged transcript segments
for independent transcription by Gemini 3.5 Transcribe.

Key Requirements:
- Non-destructive: Master WAV recordings are strictly read-only.
- Bounded: Extracts ~5s before + segment + ~5s after.
- Merged: Overlapping or proximate windows (within 3.0s) are merged to minimize Gemini calls.
- In-memory: Returns valid WAV bytes via io.BytesIO without writing temporary files to disk.
- Graceful degradation: Handles missing audio files, out-of-bounds timestamps, or text-only sessions.
"""

import io
import os
import wave
import logging
import tempfile
import subprocess
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("app.verification.audio_window_extractor")


def _ensure_pcm_wav_path(source_path: str) -> Tuple[Optional[str], bool]:
    """
    Ensures that source_path can be read as a PCM WAV file.
    If source_path is already a valid WAV file, returns (source_path, False).
    If it is an MP3, M4A, AAC, or other non-WAV container, decodes it to a temporary
    PCM WAV file using FFmpeg and returns (temp_wav_path, True).
    The caller is responsible for deleting the temp file if True is returned.
    """
    if not source_path or not os.path.isfile(source_path):
        return None, False

    try:
        with wave.open(source_path, "rb") as test_wf:
            if test_wf.getframerate() > 0 and test_wf.getnframes() > 0:
                return source_path, False
    except Exception:
        pass

    # Attempt conversion using bundled FFmpeg
    try:
        from app.transcription.audio_extractor import get_ffmpeg_binary
        ffmpeg_exe = get_ffmpeg_binary()
        tmp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_path = tmp_file.name
        tmp_file.close()

        cmd = [
            ffmpeg_exe,
            "-y",
            "-i", source_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            tmp_path,
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return tmp_path, True
    except Exception as conv_err:
        logger.warning("Failed to decode non-WAV audio %s via ffmpeg: %s", source_path, conv_err)
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        return None, False


def compute_bounded_windows(
    segments: List[Dict[str, Any]],
    buffer_seconds: float = 5.0,
    merge_threshold_seconds: float = 3.0,
    max_duration: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Computes bounded time windows around flagged segments and merges overlapping
    or proximate windows.

    Parameters:
    - segments: List of segment dicts with 'segment_index', 'start_time', 'end_time'.
    - buffer_seconds: Duration in seconds to prepend and append (default 5.0s).
    - merge_threshold_seconds: If distance between adjacent windows <= this threshold, merge them.
    - max_duration: Total audio duration in seconds, if known (bounds end_time).

    Returns:
    List of merged window dicts:
    [
        {
            "window_index": 0,
            "start_time": 0.0,
            "end_time": 18.5,
            "duration": 18.5,
            "segment_indices": [0, 1]
        }
    ]
    """
    if not segments:
        return []

    # Sort segments by start_time
    sorted_segs = sorted(segments, key=lambda s: float(s.get("start_time", 0.0)))

    # Initial raw windows with buffer applied
    raw_windows = []
    for s in sorted_segs:
        s_start = float(s.get("start_time", 0.0))
        s_end = float(s.get("end_time", s_start + 1.0))
        if s_end < s_start:
            s_end = s_start + 1.0

        w_start = max(0.0, s_start - buffer_seconds)
        w_end = s_end + buffer_seconds
        if max_duration is not None and max_duration > 0:
            w_end = min(max_duration, w_end)

        raw_windows.append({
            "start_time": round(w_start, 2),
            "end_time": round(w_end, 2),
            "segment_indices": [int(s.get("segment_index", 0))],
        })

    # Merge overlapping or close windows
    merged: List[Dict[str, Any]] = []
    for win in raw_windows:
        if not merged:
            merged.append(win)
            continue

        prev = merged[-1]
        # Check for overlap or proximity within merge_threshold_seconds
        if win["start_time"] <= prev["end_time"] + merge_threshold_seconds:
            # Merge
            prev["end_time"] = round(max(prev["end_time"], win["end_time"]), 2)
            for idx in win["segment_indices"]:
                if idx not in prev["segment_indices"]:
                    prev["segment_indices"].append(idx)
        else:
            merged.append(win)

    # Format result with window_index and duration
    results = []
    for idx, m in enumerate(merged):
        duration = round(max(0.0, m["end_time"] - m["start_time"]), 2)
        results.append({
            "window_index": idx,
            "start_time": m["start_time"],
            "end_time": m["end_time"],
            "duration": duration,
            "segment_indices": sorted(m["segment_indices"]),
        })

    return results


def extract_audio_window_bytes(
    wav_path: str,
    start_time: float,
    end_time: float,
) -> Optional[bytes]:
    """
    Extracts a bounded slice of audio from a local WAV file in-memory.
    Never modifies the original WAV file.

    Returns valid WAV file bytes, or None if the file cannot be opened/read.
    """
    if not wav_path or not os.path.isfile(wav_path):
        logger.warning("Audio file does not exist on disk: %s", wav_path)
        return None

    effective_path, is_temp = _ensure_pcm_wav_path(wav_path)
    if not effective_path:
        return None

    try:
        with wave.open(effective_path, "rb") as wf:
            nchannels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            total_frames = wf.getnframes()

            if framerate <= 0 or total_frames <= 0:
                logger.warning("Invalid WAV file properties: framerate=%d, frames=%d", framerate, total_frames)
                return None

            start_frame = max(0, min(total_frames, int(start_time * framerate)))
            end_frame = max(start_frame, min(total_frames, int(end_time * framerate)))
            num_frames = end_frame - start_frame

            if num_frames <= 0:
                return None

            wf.setpos(start_frame)
            raw_frames = wf.readframes(num_frames)

            # Package as valid WAV into in-memory buffer
            buf = io.BytesIO()
            with wave.open(buf, "wb") as out_wf:
                out_wf.setnchannels(nchannels)
                out_wf.setsampwidth(sampwidth)
                out_wf.setframerate(framerate)
                out_wf.writeframes(raw_frames)

            return buf.getvalue()
    except Exception as e:
        logger.error("Failed to extract audio window from %s: %s", wav_path, e)
        return None
    finally:
        if is_temp and os.path.exists(effective_path):
            try:
                os.remove(effective_path)
            except Exception:
                pass


def batch_extract_windows(
    audio_file_path: Optional[str],
    flagged_segments: List[Dict[str, Any]],
    buffer_seconds: float = 5.0,
    merge_threshold_seconds: float = 3.0,
    max_duration: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    High-level batching helper: computes merged windows for all flagged segments
    and extracts their audio bytes into memory.

    Returns list of window dicts with 'audio_bytes' attached.
    """
    windows = compute_bounded_windows(
        segments=flagged_segments,
        buffer_seconds=buffer_seconds,
        merge_threshold_seconds=merge_threshold_seconds,
        max_duration=max_duration,
    )

    for win in windows:
        if audio_file_path and os.path.isfile(audio_file_path):
            win["audio_bytes"] = extract_audio_window_bytes(
                wav_path=audio_file_path,
                start_time=win["start_time"],
                end_time=win["end_time"],
            )
        else:
            win["audio_bytes"] = None

    return windows


def build_verification_reel(
    audio_file_path: Optional[str],
    flagged_items: List[Dict[str, Any]],
    buffer_seconds: float = 2.5,
    silence_gap_ms: int = 600,
) -> Tuple[Optional[bytes], List[Dict[str, Any]], float]:
    """
    Constructs ONE continuous in-memory WAV verification reel concatenating
    bounded audio windows for all flagged verification items, separated by a
    deterministic silence gap (500–750ms).

    Never modifies the immutable master WAV recording.
    Does not add spoken labels or modify speech audio.

    Returns:
    - reel_bytes: Valid WAV bytes of the continuous reel (or None if audio missing/unreadable)
    - manifest: List of manifest dicts mapping item_id to source and reel intervals:
      [
        {
          "item_id": "V001",
          "segment_index": 0,
          "source_start_ms": 12000,
          "source_end_ms": 18000,
          "reel_start_ms": 0,
          "reel_end_ms": 6000,
          "reel_start_sec": 0.0,
          "reel_end_sec": 6.0
        },
        ...
      ]
    - total_duration_sec: Total duration of the reel in seconds.
    """
    if not audio_file_path or not os.path.isfile(audio_file_path) or not flagged_items:
        return None, [], 0.0

    effective_path, is_temp = _ensure_pcm_wav_path(audio_file_path)
    if not effective_path:
        logger.warning("Could not read or decode audio path for verification reel: %s", audio_file_path)
        return None, [], 0.0

    try:
        with wave.open(effective_path, "rb") as wf:
            nchannels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            total_frames = wf.getnframes()

            if framerate <= 0 or total_frames <= 0:
                logger.warning("Invalid master WAV properties: framerate=%d, frames=%d", framerate, total_frames)
                return None, [], 0.0

            bytes_per_frame = nchannels * sampwidth
            silence_frames_count = int((silence_gap_ms / 1000.0) * framerate)
            silence_raw_bytes = b"\x00" * (silence_frames_count * bytes_per_frame)

            accumulated_frames = bytearray()
            manifest: List[Dict[str, Any]] = []
            current_reel_frames = 0

            for idx, item in enumerate(flagged_items):
                item_id = str(item.get("clean_id") or item.get("item_id") or f"V{idx+1:03d}")
                seg_idx = item.get("segment_index", idx)

                s_start = float(item.get("start_time", 0.0))
                s_end = float(item.get("end_time", s_start + 1.0))
                if s_end < s_start:
                    s_end = s_start + 1.0

                clip_start = max(0.0, s_start - buffer_seconds)
                clip_end = min(total_frames / framerate, s_end + buffer_seconds)
                if clip_end <= clip_start:
                    clip_end = clip_start + 1.0

                start_frame = max(0, min(total_frames, int(clip_start * framerate)))
                end_frame = max(start_frame, min(total_frames, int(clip_end * framerate)))
                num_frames = end_frame - start_frame

                if num_frames > 0:
                    wf.setpos(start_frame)
                    clip_raw = wf.readframes(num_frames)
                else:
                    clip_raw = b""

                actual_clip_frames = len(clip_raw) // bytes_per_frame
                reel_start_ms = int((current_reel_frames * 1000) / framerate)
                reel_end_ms = int(((current_reel_frames + actual_clip_frames) * 1000) / framerate)

                manifest.append({
                    "item_id": item_id,
                    "segment_index": seg_idx,
                    "source_start_ms": int(clip_start * 1000),
                    "source_end_ms": int(clip_end * 1000),
                    "reel_start_ms": reel_start_ms,
                    "reel_end_ms": reel_end_ms,
                    "reel_start_sec": round(reel_start_ms / 1000.0, 2),
                    "reel_end_sec": round(reel_end_ms / 1000.0, 2),
                })

                accumulated_frames.extend(clip_raw)
                current_reel_frames += actual_clip_frames

                # Append silence gap between items (except after the final item)
                if idx < len(flagged_items) - 1:
                    accumulated_frames.extend(silence_raw_bytes)
                    current_reel_frames += silence_frames_count

            # Assemble valid WAV container
            buf = io.BytesIO()
            with wave.open(buf, "wb") as out_wf:
                out_wf.setnchannels(nchannels)
                out_wf.setsampwidth(sampwidth)
                out_wf.setframerate(framerate)
                out_wf.writeframes(accumulated_frames)

            total_duration_sec = round(current_reel_frames / framerate, 2)
            logger.info(
                "Verification reel constructed: %d clips, duration=%.2fs, size=%d bytes, manifest_entries=%d",
                len(flagged_items),
                total_duration_sec,
                len(buf.getvalue()),
                len(manifest),
            )
            return buf.getvalue(), manifest, total_duration_sec

    except Exception as e:
        logger.error("Failed to construct verification reel from %s: %s", audio_file_path, e)
        return None, [], 0.0
    finally:
        if is_temp and os.path.exists(effective_path):
            try:
                os.remove(effective_path)
            except Exception:
                pass

