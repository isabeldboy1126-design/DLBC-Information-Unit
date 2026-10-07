import os
import wave
import pytest
from app.audio.stream_manager import StreamManager, AudioStreamSession
from app.audio.wav_writer import create_wav_header, patch_wav_header


@pytest.fixture
def stream_manager():
    return StreamManager()


def test_direct_wav_streaming_short_recording(stream_manager):
    sample_rate = 16000
    channels = 1
    session = stream_manager.create_session(sample_rate=sample_rate, channels=channels, device_name="Test Mic")

    # 1 second of 16-bit PCM silence (16000 samples * 2 bytes = 32000 bytes)
    chunk1 = bytes(16000)
    chunk2 = bytes(16000)

    session.append_chunk(chunk1)
    session.append_chunk(chunk2)

    summary = session.finalize()

    assert summary["recording_id"] == session.session_id
    assert summary["sample_rate"] == sample_rate
    assert summary["channels"] == channels
    assert summary["total_bytes"] == 32000
    assert summary["chunk_count"] == 2
    assert summary["duration_seconds"] == 1.0
    assert summary["file_size"] == 32000 + 44  # 44-byte WAV header + PCM

    # Verify standard WAV file validity using python's wave module
    wav_path = summary["file_path"]
    assert os.path.exists(wav_path)
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == sample_rate
        assert wf.getnframes() == 16000

    # Cleanup
    if os.path.exists(wav_path):
        os.remove(wav_path)


def test_direct_wav_streaming_long_recording(stream_manager):
    sample_rate = 48000
    channels = 1
    session = stream_manager.create_session(sample_rate=sample_rate, channels=channels)

    # Stream 50 chunks of 1920 bytes each (96,000 bytes = 1.0s at 48kHz 16-bit mono)
    chunk = bytes([1, 0] * 960)
    for _ in range(50):
        session.append_chunk(chunk)

    summary = session.finalize()

    assert summary["total_bytes"] == 96000
    assert summary["chunk_count"] == 50
    assert summary["duration_seconds"] == 1.0
    assert summary["file_size"] == 96044

    wav_path = summary["file_path"]
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == 48000
        assert wf.getnframes() == 48000

    if os.path.exists(wav_path):
        os.remove(wav_path)


def test_direct_wav_streaming_pause_resume(stream_manager):
    sample_rate = 16000
    channels = 1
    session = stream_manager.create_session(sample_rate=sample_rate, channels=channels)

    # Initial recording: 0.25s (8000 bytes)
    session.append_chunk(bytes([2, 0] * 4000))

    # Simulated pause: no chunks appended for a period

    # Resumed recording: 0.25s (8000 bytes)
    session.append_chunk(bytes([3, 0] * 4000))

    summary = session.finalize()

    assert summary["total_bytes"] == 16000
    assert summary["duration_seconds"] == 0.5
    assert summary["chunk_count"] == 2

    wav_path = summary["file_path"]
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnframes() == 8000

    if os.path.exists(wav_path):
        os.remove(wav_path)


def test_direct_wav_streaming_empty_recording(stream_manager):
    session = stream_manager.create_session(sample_rate=16000, channels=1)
    summary = session.finalize()

    assert summary["total_bytes"] == 0
    assert summary["chunk_count"] == 0
    assert summary["duration_seconds"] == 0.0

    wav_path = summary["file_path"]
    assert os.path.exists(wav_path)
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnframes() == 0

    if os.path.exists(wav_path):
        os.remove(wav_path)


def test_patch_wav_header_utility(tmp_path):
    test_file = tmp_path / "test_patch.wav"
    with open(test_file, "wb+") as f:
        # Write 0-byte header
        placeholder = create_wav_header(0, sample_rate=44100, num_channels=2, bits_per_sample=16)
        f.write(placeholder)
        # Write some data: 2000 bytes
        data = bytes([170, 85] * 1000)
        f.write(data)

        # Patch header
        patch_wav_header(f, pcm_data_len=2000, sample_rate=44100, num_channels=2, bits_per_sample=16)

    with wave.open(str(test_file), "rb") as wf:
        assert wf.getnchannels() == 2
        assert wf.getframerate() == 44100
        assert wf.getnframes() == 500
