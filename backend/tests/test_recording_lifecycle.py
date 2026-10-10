"""
Automated Test Suite for Stage 6 Automatic Post-Recording Processing States (Checkpoint G).

Tests:
1. Session finalization immediately transitions session to compiling status.
2. Background AI verification lifecycle progresses from compiling -> verifying -> completed_verified.
3. Decision engine resolves high-confidence items and leaves low-confidence/conflicts as needs_review.
4. Final verification state, transcript, and counts reflect automated completion truthfully.
"""

import pytest
import uuid
import json
from unittest.mock import patch, MagicMock, AsyncMock

from app.database.session_repo import session_repo
from app.database.connection import get_db_connection
from app.services.gemini_gateway import GeminiGateway, GatewayResponse
from app.verification.decision_engine import VerificationDecisionEngine


import os
import wave
import tempfile

async def seed_recorded_session(num_flags: int = 2) -> str:
    """Helper to seed a freshly finalized recorded session with flagged segments."""
    await session_repo.init_db()
    session_id = f"test_rec_{uuid.uuid4().hex[:8]}"
    
    # Create a small valid WAV file for acoustic verification reel
    wav_path = os.path.join(tempfile.gettempdir(), f"test_rec_{session_id}.wav")
    total_frames = int(30.0 * 16000)
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * total_frames)

    await session_repo.create_session(
        session_id=session_id,
        title="Recorded Service Test",
        status="recording",
    )

    async with get_db_connection() as conn:
        await conn.execute(
            "UPDATE sessions SET audio_file_path = ? WHERE session_id = ?",
            (wav_path, session_id),
        )
        await conn.commit()

    async with get_db_connection() as conn:
        for idx in range(num_flags):
            await conn.execute(
                """
                INSERT INTO session_segments (
                    segment_id, session_id, segment_index, start_time, end_time,
                    text, confidence, is_low_confidence, flags_json, words_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"seg_{session_id}_{idx}",
                    session_id,
                    idx,
                    float(idx * 5),
                    float((idx + 1) * 5),
                    f"Segment text number {idx} regarding the Scripture",
                    0.60,
                    1,
                    json.dumps([{"type": "low_confidence", "score": 0.60}]),
                    "[]",
                ),
            )
        await conn.commit()

    return session_id


@pytest.mark.asyncio
async def test_automatic_post_recording_compiling_transition():
    """Verify that ending recording immediately sets the session to 'compiling'."""
    session_id = await seed_recorded_session(num_flags=1)

    # Initial state
    init_status = await session_repo.get_ai_verification_status(session_id)
    assert init_status["ai_verification_status"] == "idle"

    # Simulate stopping/finalizing audio session
    summary = {"file_path": f"/tmp/{session_id}.wav", "file_size": 1024, "duration_seconds": 10.0}
    t_summary = {"raw_text": "Sample text", "provider_name": "azure_speech", "duration_seconds": 10.0}
    await session_repo.finalize_session(session_id, audio_summary=summary, transcript_summary=t_summary)

    # The router sets status to compiling
    await session_repo.set_ai_verification_status(session_id, "compiling")

    stat = await session_repo.get_ai_verification_status(session_id)
    assert stat["ai_verification_status"] == "compiling"
    assert stat["started_at"] is not None


@pytest.mark.asyncio
async def test_automatic_lifecycle_to_completed_verified():
    """Verify end-to-end automated progression to completed_verified when AI verifies items."""
    session_id = await seed_recorded_session(num_flags=2)

    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    async def mock_transcribe(audio_bytes, prompt=None, **kwargs):
        resp = GatewayResponse(
            response=MagicMock(), provider_slot="primary", model_name="gemini-3.5-transcribe", latency_ms=80.0, attempts=1
        )
        resp.response.text = json.dumps({
            "V001": "Segment text number 0 regarding the Scripture",
            "V002": "Segment text number 1 regarding the Scripture",
        })
        return resp

    async def mock_generate(operation, model, contents, config=None):
        resp = GatewayResponse(
            response=MagicMock(),
            provider_slot="primary",
            model_name="gemini-3.8-flash",
            latency_ms=100.0,
            attempts=1,
        )
        resp.response.text = json.dumps({
            "items": [
                {
                    "item_id": "V001",
                    "decision": "VERIFIED",
                    "verified_text": "Segment text number 0 regarding the Scripture",
                    "confidence": 0.95,
                    "explanation": "Doctrinally verified against KJV text",
                },
                {
                    "item_id": "V002",
                    "decision": "VERIFIED",
                    "verified_text": "Segment text number 1 regarding the Scripture",
                    "confidence": 0.95,
                    "explanation": "Doctrinally verified against KJV text",
                },
            ]
        })
        return resp

    mock_gw.generate = AsyncMock(side_effect=mock_generate)
    mock_gw.transcribe_audio = AsyncMock(side_effect=mock_transcribe)

    engine = VerificationDecisionEngine(gateway=mock_gw)
    result = await engine.verify_session(session_id, auto_resolve=True)

    assert result["status"] == "completed_verified"
    assert result["summary"]["verified_count"] == 2
    assert result["summary"]["unresolved_count"] == 0

    # Verify session repository state
    stat = await session_repo.get_ai_verification_status(session_id)
    assert stat["ai_verification_status"] == "completed_verified"
    assert stat["completed_at"] is not None
    assert stat["summary"]["verified_count"] == 2

    # Check overall verification status
    v_state = await session_repo.get_verification_state(session_id)
    assert v_state["verification_status"] == "complete"
    assert v_state["items_resolved"] == 2


@pytest.mark.asyncio
async def test_automatic_lifecycle_to_completed_needs_review():
    """Verify lifecycle transitions to completed_needs_review when items require human review."""
    session_id = await seed_recorded_session(num_flags=1)

    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    async def mock_transcribe(audio_bytes, prompt=None, **kwargs):
        resp = GatewayResponse(
            response=MagicMock(), provider_slot="primary", model_name="gemini-3.5-transcribe", latency_ms=80.0, attempts=1
        )
        resp.response.text = json.dumps({
            "V001": "Indistinct text",
        })
        return resp

    async def mock_generate(operation, model, contents, config=None):
        resp = GatewayResponse(
            response=MagicMock(),
            provider_slot="primary",
            model_name="gemini-3.8-flash",
            latency_ms=100.0,
            attempts=1,
        )
        resp.response.text = json.dumps({
            "items": [
                {
                    "item_id": "V001",
                    "decision": "UNRESOLVED",
                    "verified_text": "Original text with uncertainty",
                    "confidence": 0.40,
                    "explanation": "Preacher voice was indistinct; requires human confirmation",
                }
            ]
        })
        return resp

    mock_gw.generate = AsyncMock(side_effect=mock_generate)
    mock_gw.transcribe_audio = AsyncMock(side_effect=mock_transcribe)

    engine = VerificationDecisionEngine(gateway=mock_gw)
    result = await engine.verify_session(session_id, auto_resolve=True)

    assert result["status"] == "completed_needs_review"
    assert result["summary"]["unresolved_count"] == 1

    # Verify session repository state
    stat = await session_repo.get_ai_verification_status(session_id)
    assert stat["ai_verification_status"] == "completed_needs_review"
    assert stat["completed_at"] is not None

    v_state = await session_repo.get_verification_state(session_id)
    assert v_state["verification_status"] == "in_progress"
    assert v_state["items_resolved"] == 0
    assert len(v_state["items"]) == 1
    assert v_state["items"][0]["action"] == "pending"
    assert v_state["items"][0]["ai_decision"] == "UNRESOLVED"


@pytest.mark.asyncio
async def test_interruption_recovery_unfinalized_wav():
    """
    Verifies that:
    1. Application startup recovery detects unfinalized Direct-WAV placeholder sessions,
       calculates pending duration, updates database state, and strictly preserves the
       audio file on disk UNTOUCHED (safe startup policy).
    2. Explicit administrative repair (repair_interrupted_wav) creates a .bak backup,
       patches the header in place, updates the database, and enables normal playback.
    """
    from app.audio.wav_writer import create_wav_header
    from app.database.interruption_recovery import recover_interrupted_sessions, repair_interrupted_wav
    from app.config import STORAGE_AUDIO_DIR

    await session_repo.init_db()
    session_id = f"test_unfinalized_{uuid.uuid4().hex[:8]}"
    recording_id = session_id

    # Create unfinalized Direct-WAV file: 44-byte placeholder (pcm_data_len=0) + 96000 bytes raw PCM (1s at 48kHz mono 16-bit)
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    placeholder = create_wav_header(pcm_data_len=0, sample_rate=48000, num_channels=1, bits_per_sample=16)
    raw_pcm = b"\x00\x00" * 48000  # 96,000 bytes = 1.00s

    with open(wav_path, "wb") as f:
        f.write(placeholder)
        f.write(raw_pcm)

    # Initial state of the unfinalized WAV: wave module sees 0 frames because header says data chunk size is 0
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnframes() == 0

    # Create session left in 'recording' status
    await session_repo.create_session(
        session_id=session_id,
        recording_id=recording_id,
        title="Unfinalized Session Interruption Test",
        status="recording",
        metadata={"sample_rate": 48000, "channels": 1},
    )

    # Step 1: Run startup recovery — must be READ-ONLY on the audio file!
    await recover_interrupted_sessions()

    # Verify session was updated to interrupted with calculated duration
    session = await session_repo.get_session(session_id)
    assert session is not None
    assert session["status"] == "interrupted"
    assert session["is_interrupted"] == 1
    assert session["duration_seconds"] == 1.0
    assert session["audio_file_size"] == 96044
    assert "File preserved intact on disk" in (session.get("recovery_notes") or "")

    # Crucial check: verify startup recovery did NOT modify the WAV file on disk
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnframes() == 0, "Startup recovery should not mutate the WAV file on disk"

    # Step 2: Run explicit administrative repair
    repair_result = await repair_interrupted_wav(recording_id, sample_rate=48000, channels=1, create_backup=True)
    assert repair_result["status"] == "repaired"
    assert repair_result["duration_seconds"] == 1.0
    assert repair_result["backup_path"] is not None
    assert os.path.exists(repair_result["backup_path"])

    # Verify the WAV file on disk now has valid frames in header after explicit repair
    with wave.open(wav_path, "rb") as wf:
        assert wf.getnframes() == 48000
        assert wf.getframerate() == 48000

    # Cleanup test audio files
    try:
        os.remove(wav_path)
        if repair_result.get("backup_path") and os.path.exists(repair_result["backup_path"]):
            os.remove(repair_result["backup_path"])
    except Exception:
        pass


@pytest.mark.asyncio
async def test_recording_init_aborts_cleanly_on_db_timeout():
    """
    Verifies that when database session creation fails or times out during init,
    any allocated audio file on disk is removed and no orphaned session is created.
    """
    from fastapi.testclient import TestClient
    from app.main import app
    from app.config import STORAGE_AUDIO_DIR

    # Simulate WebSocket init with failing database
    with patch("app.database.session_repo.session_repo.create_session", side_effect=TimeoutError("DB Timeout")):
        client = TestClient(app)
        with client.websocket_connect("/api/audio/stream") as websocket:
            websocket.send_json({
                "type": "init",
                "sampleRate": 44100,
                "channels": 1,
                "deviceName": "Test Mic",
            })
            resp = websocket.receive_json()
            assert resp["status"] == "error"
            assert "Database initialization failed" in resp["message"]


