"""
Audio Extraction & Media Utilities

Provides utilities for:
- Detecting file types (audio vs video)
- Extracting audio streams from video files (e.g., MP4 -> WAV processing copy)
  using the lightweight bundled imageio-ffmpeg executable.
- Probing duration and basic media metadata.
"""

import os
import subprocess
import time
from typing import Dict, Optional, Tuple


def get_ffmpeg_binary() -> str:
    """Returns the absolute path to the FFmpeg executable bundled via imageio-ffmpeg."""
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def is_video_file(file_path: str) -> bool:
    """Determines if the given file is a video based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    return ext in [".mp4", ".mov", ".mkv", ".avi", ".webm"]


def extract_audio_from_video(
    video_path: str,
    output_wav_path: str,
    sample_rate: int = 48000,
    channels: int = 1,
) -> str:
    """
    Extracts the audio track from a video file and writes a clean 16-bit PCM WAV file
    to use as a transcription processing copy.
    The original video file is never modified.

    Args:
        video_path: Path to the original video file.
        output_wav_path: Path where the extracted WAV processing copy will be saved.
        sample_rate: Target sample rate (default 48000 Hz).
        channels: Target channels (default 1 = mono).

    Returns:
        output_wav_path upon successful extraction.
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    ffmpeg_exe = get_ffmpeg_binary()
    os.makedirs(os.path.dirname(output_wav_path), exist_ok=True)

    # Command: ffmpeg -y -i input.mp4 -vn -acodec pcm_s16le -ar 48000 -ac 1 output.wav
    cmd = [
        ffmpeg_exe,
        "-y",  # Overwrite output if exists
        "-i",
        video_path,
        "-vn",  # Disable video stream
        "-acodec",
        "pcm_s16le",  # Uncompressed 16-bit PCM
        "-ar",
        str(sample_rate),
        "-ac",
        str(channels),
        output_wav_path,
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr}")

    if not os.path.exists(output_wav_path) or os.path.getsize(output_wav_path) == 0:
        raise RuntimeError("Audio extraction produced an empty or missing WAV file.")

def convert_to_wav_audio(
    input_path: str,
    output_wav_path: str,
    sample_rate: int = 16000,
    channels: int = 1,
) -> str:
    """
    Converts any audio or video input file into a clean 16-bit PCM WAV processing copy
    (default 16kHz mono, ideal for Azure Speech SDK and standard speech engines).
    The original input file is never modified.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    ffmpeg_exe = get_ffmpeg_binary()
    os.makedirs(os.path.dirname(output_wav_path), exist_ok=True)

    cmd = [
        ffmpeg_exe,
        "-y",
        "-i",
        input_path,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        str(sample_rate),
        "-ac",
        str(channels),
        output_wav_path,
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio conversion failed: {result.stderr}")

    if not os.path.exists(output_wav_path) or os.path.getsize(output_wav_path) == 0:
        raise RuntimeError("Audio conversion produced an empty or missing WAV file.")

    return output_wav_path


def probe_media_duration(file_path: str) -> Optional[float]:
    """Attempts to calculate media duration in seconds using FFmpeg."""
    if not os.path.exists(file_path):
        return None

    try:
        ffmpeg_exe = get_ffmpeg_binary()
        cmd = [ffmpeg_exe, "-i", file_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        # FFmpeg outputs file information to stderr
        output = result.stderr
        for line in output.split("\n"):
            if "Duration:" in line:
                # Format: Duration: 00:04:12.34, start: ...
                parts = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = parts.split(":")
                return round(int(h) * 3600 + int(m) * 60 + float(s), 2)
    except Exception as e:
        print(f"Notice: Could not probe media duration: {e}")
    return None
