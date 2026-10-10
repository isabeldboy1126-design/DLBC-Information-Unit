"""
Test Suite for Temporary Recording-Only Mode, Audio Download, and Whisper Feasibility.
Tests criteria 1 through 17.
"""
import os
import re
import json
import pytest
import wave
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.audio.router import sanitize_recording_filename
from app.config import STORAGE_AUDIO_DIR, STORAGE_TRANSCRIPTS_DIR, TRANSCRIPTION_PROVIDER
from app.database.connection import get_db_connection
from app.database.session_repo import session_repo

DEMO_HEADERS = {"Authorization": "Bearer demo", "x-dlbc-demo": "1"}


@pytest.mark.asyncio
async def test_criterion_3_and_4_filename_formatting_and_sanitization():
    fn1 = sanitize_recording_filename("Sunday Morning Service", "2026-10-10T18:21:41Z", "rec_20261010_182141_4004e7")
    assert fn1 == "DLBC_2026-10-10_Sunday_Morning_Service_rec_20261010_182141_4004e7.wav"

    fn2 = sanitize_recording_filename('Message: "The Great Commission" / Acts 1:8? *Final*', "2026-10-10", "rec_999")
    for bad_char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*', "'", '`']:
        assert bad_char not in fn2
    assert "Message_The_Great_Commission_Acts_1_8_Final" in fn2
    assert fn2.startswith("DLBC_2026-10-10_")
    assert fn2.endswith("_rec_999.wav")

    fn3 = sanitize_recording_filename("", None, "rec_20261009_200000_123456")
    assert fn3 == "DLBC_2026-10-09_Recording_rec_20261009_200000_123456.wav"


@pytest.mark.asyncio
async def test_criterion_1_and_7_download_completed_and_legacy_recording():
    rec_id = "rec_test_legacy_001"
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 800)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get(f"/api/audio/recordings/{rec_id}/download")
            assert res.status_code == 200
            assert res.headers["content-type"] == "audio/wav"
            assert "attachment" in res.headers["content-disposition"]
            assert rec_id in res.headers["content-disposition"]
            assert len(res.content) == os.path.getsize(wav_path)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


@pytest.mark.asyncio
async def test_criterion_2_5_6_session_audio_download_and_streaming():
    session_id = "session_test_rec_only_002"
    rec_id = "rec_test_rec_only_002"
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)

    try:
        await session_repo.create_session(
            session_id=session_id,
            title="Monday Bible Study — Audio Only",
            recording_id=rec_id,
            status="recorded",
            provider_name="recording_only",
            raw_text=None,
            account_id="legacy_default_account",
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res_dl = await client.get(f"/api/sessions/{session_id}/audio/download", headers=DEMO_HEADERS)
            assert res_dl.status_code == 200
            assert res_dl.headers["content-type"] == "audio/wav"
            assert "attachment" in res_dl.headers["content-disposition"]
            assert "Monday_Bible_Study_Audio_Only" in res_dl.headers["content-disposition"]

            res_stream = await client.get(f"/api/sessions/{session_id}/audio", headers=DEMO_HEADERS)
            assert res_stream.status_code == 200

            res_range = await client.get(
                f"/api/sessions/{session_id}/audio",
                headers={**DEMO_HEADERS, "Range": "bytes=0-99"},
            )
            assert res_range.status_code == 206
            assert res_range.headers["content-length"] == "100"
            assert "bytes 0-99/" in res_range.headers["content-range"]
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
        await session_repo.delete_session(session_id, account_id="legacy_default_account")


@pytest.mark.asyncio
async def test_criterion_8_9_10_11_12_13_recording_only_mode():
    assert TRANSCRIPTION_PROVIDER in ("disabled", "none", "off")

    session_id = "session_test_recording_only_lifecycle"
    rec_id = "rec_test_recording_only_lifecycle"

    await session_repo.create_session(
        session_id=session_id,
        title="Youth Choir Rehearsal",
        recording_id=rec_id,
        status="recording",
        provider_name="recording_only",
        account_id="legacy_default_account",
    )

    try:
        audio_summary = {
            "recording_id": rec_id,
            "file_path": f"/mock/{rec_id}.wav",
            "file_size": 204800,
            "duration_seconds": 12.5,
            "sample_rate": 16000,
            "channels": 1,
        }
        finalized = await session_repo.finalize_session(
            session_id=session_id,
            audio_summary=audio_summary,
            transcript_summary=None,
        )

        assert finalized["status"] in ("audio_only", "recorded")
        assert finalized["audio_file_size"] == 204800
        assert finalized["raw_text"] == ""
        assert finalized["segment_count"] == 0
        assert finalized["flag_count"] == 0

        veri_stat = await session_repo.get_ai_verification_status(session_id)
        assert veri_stat["ai_verification_status"] == "idle"
    finally:
        await session_repo.delete_session(session_id, account_id="legacy_default_account")


@pytest.mark.asyncio
async def test_criterion_16_transcript_import_endpoint():
    session_id = "session_test_import_endpoint"
    await session_repo.create_session(
        session_id=session_id,
        title="Revival Hour Message",
        status="recorded",
        provider_name="recording_only",
        account_id="legacy_default_account",
    )

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            payload = {
                "raw_text": "First point: Repentance towards God. Second point: Faith towards our Lord Jesus Christ.",
                "provider_name": "manual_import",
                "language_code": "en-NG",
            }
            res = await client.post(
                f"/api/sessions/{session_id}/import-transcript",
                json=payload,
                headers=DEMO_HEADERS,
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "transcript_imported"
            sess = data["session"]
            assert sess["segment_count"] == 2
            assert sess["provider_name"] == "manual_import"
            assert "Repentance towards God" in sess["raw_text"]

            tr_file = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"tr_{session_id}.json")
            assert os.path.exists(tr_file)
    finally:
        await session_repo.delete_session(session_id, account_id="legacy_default_account")
        tr_file = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"tr_{session_id}.json")
        if os.path.exists(tr_file):
            os.remove(tr_file)


@pytest.mark.asyncio
async def test_criterion_17_integrity_check():
    async with get_db_connection() as conn:
        cursor = await conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row["name"] for row in await cursor.fetchall()]
        assert "sessions" in tables
        assert "session_segments" in tables
        assert "verification_items" in tables
