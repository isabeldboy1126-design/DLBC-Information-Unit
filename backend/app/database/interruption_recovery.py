"""
Crash and Interruption Recovery Manager (Phase 4)

Scans for unfinalized sessions on application startup, recovers orphaned PCM files
into playable WAV files safely, and marks surviving sessions as 'interrupted' with detailed notes.
"""

import json
import os
import shutil
import struct
import time
import wave
from typing import Any, Dict, List, Optional

from app.audio.wav_writer import finalize_pcm_to_wav, patch_wav_header
from app.database.connection import get_db_connection
from app.database.session_repo import session_repo


from app.config import STORAGE_AUDIO_DIR

async def recover_interrupted_sessions():
    """
    Executes upon application startup to inspect any sessions left in 'recording' or 'processing'
    states due to unexpected crashes, browser closures, or power interruptions.
    """
    await session_repo.init_db()
    storage_audio_dir = STORAGE_AUDIO_DIR

    async with get_db_connection() as conn:
        # Find any sessions that were left in active recording or processing state
        cursor = await conn.execute(
            """
            SELECT * FROM sessions
            WHERE status IN ('recording', 'processing')
            """
        )
        interrupted_rows = await cursor.fetchall()

        for row in interrupted_rows:
            session_id = row["session_id"]
            recording_id = row["recording_id"] or session_id
            print(f"[Recovery] Detected unfinalized session: {session_id} (Recording ID: {recording_id})")

            # 1. Inspect audio recovery
            wav_path = os.path.join(storage_audio_dir, f"{recording_id}.wav")
            pcm_path = os.path.join(storage_audio_dir, f"active_{recording_id}.pcm")

            audio_recovered = False
            audio_dur = 0.0
            audio_size = 0
            audio_path = None
            recovery_notes = []

            # Check if canonical WAV already exists
            if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:
                file_size = os.path.getsize(wav_path)
                try:
                    with wave.open(wav_path, "rb") as wf:
                        nframes = wf.getnframes()
                        fr = wf.getframerate()
                        if nframes > 0 and fr > 0:
                            audio_dur = round(nframes / float(fr), 2)
                            audio_size = file_size
                            audio_path = wav_path
                            audio_recovered = True
                            recovery_notes.append(f"Master WAV was intact ({audio_dur}s).")
                except Exception as e:
                    recovery_notes.append(f"Existing WAV check error ({e}).")

                # If the WAV file exists and has payload (> 44 bytes), but nframes == 0,
                # the session crashed or was interrupted before finalize() patched the placeholder header.
                # Safe startup policy: DO NOT silently mutate the file on disk during startup.
                # Inspect parameters, calculate duration for database tracking, and preserve file intact on disk.
                if not audio_recovered:
                    meta = json.loads(row["metadata_json"] or "{}")
                    sample_rate = meta.get("sample_rate")
                    channels = meta.get("channels", 1)
                    # Inspect sample rate from the file's own fmt chunk if available
                    if not sample_rate:
                        try:
                            with open(wav_path, "rb") as fh:
                                fh.seek(24)
                                sr_bytes = fh.read(4)
                                if len(sr_bytes) == 4:
                                    sample_rate = struct.unpack("<I", sr_bytes)[0]
                        except Exception:
                            sample_rate = 44100
                    sample_rate = sample_rate or 44100
                    pcm_data_len = file_size - 44
                    audio_dur = round(pcm_data_len / float(sample_rate * channels * 2), 2)
                    audio_size = file_size
                    audio_path = wav_path
                    audio_recovered = True
                    recovery_notes.append(
                        f"Unfinalized WAV payload detected ({audio_dur}s at {sample_rate}Hz, {file_size} bytes). File preserved intact on disk."
                    )

            # If no valid WAV exists, check for surviving orphaned PCM
            if not audio_recovered and os.path.exists(pcm_path) and os.path.getsize(pcm_path) > 0:
                pcm_size = os.path.getsize(pcm_path)
                print(f"[Recovery] Attempting safe audio recovery from surviving PCM: {pcm_path} ({pcm_size} bytes)")
                
                # Use known default format (48000 Hz, Mono, 16-bit)
                sample_rate = 48000
                channels = 1
                meta = json.loads(row["metadata_json"] or "{}")
                if "sample_rate" in meta:
                    sample_rate = meta["sample_rate"]
                if "channels" in meta:
                    channels = meta["channels"]

                recovered_wav_path = os.path.join(storage_audio_dir, f"{recording_id}.wav")
                try:
                    wav_info = finalize_pcm_to_wav(
                        pcm_file_path=pcm_path,
                        wav_file_path=recovered_wav_path,
                        sample_rate=sample_rate,
                        num_channels=channels,
                    )
                    # Verify recovered WAV before updating state
                    if os.path.exists(recovered_wav_path) and os.path.getsize(recovered_wav_path) > 44:
                        with wave.open(recovered_wav_path, "rb") as wf:
                            audio_dur = round(wf.getnframes() / float(wf.getframerate()), 2)
                            audio_size = os.path.getsize(recovered_wav_path)
                            audio_path = recovered_wav_path
                            audio_recovered = True
                            recovery_notes.append(f"Successfully recovered {audio_dur}s audio from progressive PCM.")
                            # Safe to remove temporary PCM once WAV verification passes
                            try:
                                os.remove(pcm_path)
                            except Exception:
                                pass
                except Exception as rec_err:
                    print(f"[Recovery Error] Failed to reconstruct WAV from PCM: {rec_err}")
                    recovery_notes.append(f"PCM recovery error: {rec_err}. Source PCM preserved.")

            # 2. Inspect surviving transcript segments
            seg_cursor = await conn.execute(
                "SELECT COUNT(*), MAX(end_time) FROM session_segments WHERE session_id = ?",
                (session_id,),
            )
            seg_row = await seg_cursor.fetchone()
            seg_count = seg_row[0] or 0
            transcript_dur = seg_row[1] or 0.0

            if seg_count > 0:
                recovery_notes.append(f"Retained {seg_count} live transcript segments ({transcript_dur}s).")

            # Determine final recovery status
            if audio_recovered and seg_count > 0:
                new_status = "interrupted"
            elif audio_recovered and seg_count == 0:
                new_status = "interrupted"
            elif not audio_recovered and seg_count > 0:
                new_status = "partial_transcript"
            else:
                new_status = "interrupted"

            total_dur = max(audio_dur, transcript_dur)
            notes_str = " | ".join(recovery_notes) or "Session interrupted before normal stop."

            # Update session record
            await conn.execute(
                """
                UPDATE sessions
                SET status = ?,
                    is_interrupted = 1,
                    duration_seconds = ?,
                    audio_file_path = COALESCE(?, audio_file_path),
                    audio_file_size = CASE WHEN ? > 0 THEN ? ELSE audio_file_size END,
                    audio_duration_seconds = CASE WHEN ? > 0 THEN ? ELSE audio_duration_seconds END,
                    recovery_notes = ?
                WHERE session_id = ?
                """,
                (
                    new_status,
                    total_dur,
                    audio_path,
                    audio_size,
                    audio_size,
                    audio_dur,
                    audio_dur,
                    notes_str,
                    session_id,
                ),
            )
            print(f"[Recovery] Session {session_id} recovered: status={new_status}, audio={audio_dur}s, notes={notes_str}")

        await conn.commit()


async def repair_interrupted_wav(
    recording_id: str,
    sample_rate: Optional[int] = None,
    channels: Optional[int] = None,
    create_backup: bool = True,
) -> Dict[str, Any]:
    """
    Explicit administrative utility to repair an unfinalized Direct-WAV header in-place.
    Must be called explicitly; never runs automatically during container startup.
    Creates a .bak backup file before modifying any bytes.
    """
    storage_audio_dir = STORAGE_AUDIO_DIR
    wav_path = os.path.join(storage_audio_dir, f"{recording_id}.wav")
    if not os.path.exists(wav_path):
        raise FileNotFoundError(f"Recording WAV not found: {wav_path}")

    file_size = os.path.getsize(wav_path)
    if file_size <= 44:
        raise ValueError(f"WAV file contains no audio payload ({file_size} bytes)")

    # 1. Read existing header parameters from byte offsets 22-34
    with open(wav_path, "rb") as fh:
        hdr = fh.read(44)
    _, _, _, _, _, _, hdr_channels, hdr_sr, _, _, _, _, _ = struct.unpack("<4sI4s4sIHHIIHH4sI", hdr)

    actual_sr = sample_rate or hdr_sr or 44100
    actual_channels = channels or hdr_channels or 1
    pcm_data_len = file_size - 44

    # 2. Create backup if requested
    bak_path = None
    if create_backup:
        bak_path = f"{wav_path}.bak"
        shutil.copyfile(wav_path, bak_path)

    # 3. Patch header in-place
    with open(wav_path, "r+b") as fh:
        patch_wav_header(
            file_handle=fh,
            pcm_data_len=pcm_data_len,
            sample_rate=actual_sr,
            num_channels=actual_channels,
            bits_per_sample=16,
        )

    # 4. Verify repaired file
    with wave.open(wav_path, "rb") as wf:
        nframes = wf.getnframes()
        fr = wf.getframerate()
        audio_dur = round(nframes / float(fr), 2)

    # 5. Update database record
    session_id = f"session_{recording_id}"
    note = f"Master WAV header repaired ({audio_dur}s at {actual_sr}Hz). Backup: {os.path.basename(bak_path) if bak_path else 'none'}."
    async with get_db_connection() as conn:
        await conn.execute(
            """
            UPDATE sessions
            SET status = 'interrupted',
                is_interrupted = 1,
                duration_seconds = ?,
                audio_file_size = ?,
                audio_duration_seconds = ?,
                recovery_notes = CASE WHEN recovery_notes IS NULL OR recovery_notes = '' THEN ? ELSE recovery_notes || ' | ' || ? END
            WHERE session_id = ? OR recording_id = ?
            """,
            (audio_dur, file_size, audio_dur, note, note, session_id, recording_id),
        )
        await conn.commit()

    return {
        "status": "repaired",
        "recording_id": recording_id,
        "sample_rate": actual_sr,
        "channels": actual_channels,
        "pcm_bytes": pcm_data_len,
        "duration_seconds": audio_dur,
        "file_size": file_size,
        "backup_path": bak_path,
    }

