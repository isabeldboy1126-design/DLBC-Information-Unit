"""
WAV File Header and Serialization Utility

Generates standard 44-byte RIFF/WAVE headers for uncompressed LINEAR16 PCM audio.
Supports any arbitrary sample rate and channel count.
"""

import struct


def create_wav_header(
    pcm_data_len: int,
    sample_rate: int = 48000,
    num_channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes:
    """
    Creates a standard 44-byte canonical RIFF/WAVE header.

    Structure:
    - ChunkID: "RIFF" (4 bytes)
    - ChunkSize: 36 + pcm_data_len (4 bytes, unsigned 32-bit int, little-endian)
    - Format: "WAVE" (4 bytes)
    - Subchunk1ID: "fmt " (4 bytes)
    - Subchunk1Size: 16 (4 bytes, unsigned 32-bit int, little-endian, PCM)
    - AudioFormat: 1 (2 bytes, unsigned 16-bit int, 1 = Linear PCM)
    - NumChannels: num_channels (2 bytes, unsigned 16-bit int)
    - SampleRate: sample_rate (4 bytes, unsigned 32-bit int)
    - ByteRate: sample_rate * num_channels * bits_per_sample / 8 (4 bytes)
    - BlockAlign: num_channels * bits_per_sample / 8 (2 bytes)
    - BitsPerSample: bits_per_sample (2 bytes)
    - Subchunk2ID: "data" (4 bytes)
    - Subchunk2Size: pcm_data_len (4 bytes, unsigned 32-bit int)
    """
    bytes_per_sample = bits_per_sample // 8
    block_align = num_channels * bytes_per_sample
    byte_rate = sample_rate * block_align
    chunk_size = 36 + pcm_data_len

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        chunk_size,
        b"WAVE",
        b"fmt ",
        16,  # Subchunk1Size for PCM
        1,   # AudioFormat (1 = PCM)
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        pcm_data_len,
    )
    return header


def finalize_pcm_to_wav(pcm_file_path: str, wav_file_path: str, sample_rate: int, num_channels: int = 1) -> dict:
    """
    Reads an existing raw PCM file, prepends the canonical WAV header,
    and writes the finalized WAV file to the destination path.
    """
    import os

    if not os.path.exists(pcm_file_path):
        raise FileNotFoundError(f"PCM file not found: {pcm_file_path}")

    pcm_size = os.path.getsize(pcm_file_path)
    header = create_wav_header(
        pcm_data_len=pcm_size,
        sample_rate=sample_rate,
        num_channels=num_channels,
        bits_per_sample=16,
    )

    with open(wav_file_path, "wb") as wav_out:
        wav_out.write(header)
        with open(pcm_file_path, "rb") as pcm_in:
            while chunk := pcm_in.read(65536):
                wav_out.write(chunk)

    bytes_per_sample = 2  # 16-bit
    total_samples = pcm_size // (num_channels * bytes_per_sample) if (num_channels * bytes_per_sample) > 0 else 0
    duration_seconds = round(total_samples / sample_rate, 2) if sample_rate > 0 else 0.0

    return {
        "file_size": os.path.getsize(wav_file_path),
        "duration_seconds": duration_seconds,
        "sample_rate": sample_rate,
        "channels": num_channels,
        "bits_per_sample": 16,
        "pcm_bytes": pcm_size,
    }
