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
from typing import Any, Dict, List, Optional

logger = logging.getLogger("app.verification.audio_window_extractor")


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

    try:
        with wave.open(wav_path, "rb") as wf:
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
