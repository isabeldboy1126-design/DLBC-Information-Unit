"""
Unit Tests for Audio Window Extractor and Batching (Checkpoint D)
"""

import io
import os
import wave
import tempfile
import pytest

from app.verification.audio_window_extractor import (
    compute_bounded_windows,
    extract_audio_window_bytes,
    batch_extract_windows,
)


def create_dummy_wav(duration_seconds: float = 30.0, framerate: int = 16000) -> str:
    """Helper creating a temporary valid PCM 16-bit mono WAV file."""
    temp_dir = tempfile.gettempdir()
    wav_path = os.path.join(temp_dir, f"test_sample_{duration_seconds}s.wav")
    total_frames = int(duration_seconds * framerate)
    dummy_frames = b"\x00\x00" * total_frames  # silence

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(dummy_frames)

    return wav_path


def test_compute_bounded_windows_empty():
    res = compute_bounded_windows([])
    assert res == []


def test_compute_bounded_windows_single():
    # Segment from 2.0s to 5.0s
    segs = [{"segment_index": 0, "start_time": 2.0, "end_time": 5.0}]
    res = compute_bounded_windows(segs, buffer_seconds=5.0)

    assert len(res) == 1
    # 2.0 - 5.0 = -3.0 bounded to 0.0
    assert res[0]["start_time"] == 0.0
    # 5.0 + 5.0 = 10.0
    assert res[0]["end_time"] == 10.0
    assert res[0]["segment_indices"] == [0]


def test_compute_bounded_windows_overlap_merging():
    # Seg 0: 10.0 to 14.0 -> window: 5.0 to 19.0
    # Seg 1: 18.0 to 22.0 -> window: 13.0 to 27.0
    # These overlap significantly, must merge into [5.0, 27.0]
    segs = [
        {"segment_index": 0, "start_time": 10.0, "end_time": 14.0},
        {"segment_index": 1, "start_time": 18.0, "end_time": 22.0},
    ]
    res = compute_bounded_windows(segs, buffer_seconds=5.0, merge_threshold_seconds=3.0)

    assert len(res) == 1
    assert res[0]["start_time"] == 5.0
    assert res[0]["end_time"] == 27.0
    assert res[0]["segment_indices"] == [0, 1]


def test_compute_bounded_windows_distant_distinct():
    # Seg 0: 5.0 to 8.0 -> window: 0.0 to 13.0
    # Seg 1: 60.0 to 65.0 -> window: 55.0 to 70.0
    # Far apart, must remain 2 separate windows
    segs = [
        {"segment_index": 0, "start_time": 5.0, "end_time": 8.0},
        {"segment_index": 1, "start_time": 60.0, "end_time": 65.0},
    ]
    res = compute_bounded_windows(segs, buffer_seconds=5.0, merge_threshold_seconds=3.0)

    assert len(res) == 2
    assert res[0]["start_time"] == 0.0
    assert res[0]["end_time"] == 13.0
    assert res[0]["segment_indices"] == [0]

    assert res[1]["start_time"] == 55.0
    assert res[1]["end_time"] == 70.0
    assert res[1]["segment_indices"] == [1]


def test_extract_audio_window_bytes_valid_wav():
    wav_path = create_dummy_wav(duration_seconds=20.0, framerate=16000)
    try:
        # Extract 5.0s to 12.0s (7.0 seconds duration)
        raw_bytes = extract_audio_window_bytes(wav_path, start_time=5.0, end_time=12.0)
        assert raw_bytes is not None
        assert len(raw_bytes) > 44  # WAV header is 44 bytes

        # Read the extracted buffer as WAV to verify header and length
        buf = io.BytesIO(raw_bytes)
        with wave.open(buf, "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 16000
            # 7.0 seconds * 16000 = 112000 frames
            assert wf.getnframes() == 112000
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def test_extract_audio_window_bytes_missing_file():
    res = extract_audio_window_bytes("C:/non_existent_folder/missing.wav", 0.0, 10.0)
    assert res is None


def test_batch_extract_windows():
    wav_path = create_dummy_wav(duration_seconds=30.0, framerate=16000)
    try:
        segs = [
            {"segment_index": 0, "start_time": 5.0, "end_time": 8.0},
            {"segment_index": 1, "start_time": 20.0, "end_time": 23.0},
        ]
        windows = batch_extract_windows(wav_path, segs, buffer_seconds=3.0)

        assert len(windows) == 2
        for w in windows:
            assert w["audio_bytes"] is not None
            assert len(w["audio_bytes"]) > 44
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
