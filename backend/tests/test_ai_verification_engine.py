"""
Unit & Integration Tests for AI Verification Decision Engine (Checkpoint E)
"""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.database.connection import get_db_connection
from app.database.session_repo import session_repo
from app.services.gemini_gateway import GeminiGateway, GatewayResponse
from app.services.bible_context_service import BibleContextService
from app.verification.decision_engine import VerificationDecisionEngine


async def create_mock_session_with_flags():
    """Helper to create a test session with 2 flagged segments."""
    await session_repo.init_db()
    session_id = f"test_verify_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Test Message for AI Verification",
        status="completed",
    )
    async with get_db_connection() as conn:
        await conn.execute(
            """
            INSERT INTO session_segments (
                segment_id, session_id, segment_index, start_time, end_time,
                text, confidence, is_low_confidence, flags_json, words_json
            ) VALUES (?, ?, 0, 0.0, 5.0, 'For God so loved the world that he gave his only son', 0.60, 1, '[]', '[]')
            """,
            (f"seg_{session_id}_0", session_id),
        )
        await conn.execute(
            """
            INSERT INTO session_segments (
                segment_id, session_id, segment_index, start_time, end_time,
                text, confidence, is_low_confidence, flags_json, words_json
            ) VALUES (?, ?, 1, 5.0, 10.0, 'Paul was on the way to Damascus', 0.55, 1, '[]', '[]')
            """,
            (f"seg_{session_id}_1", session_id),
        )
        await conn.commit()

    await session_repo.init_verification(session_id)
    return session_id


@pytest.mark.asyncio
async def test_evaluate_segment_verified():
    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    ai_json = {
        "decision": "VERIFIED",
        "verified_text": "For God so loved the world, that he gave his only begotten Son",
        "confidence": 0.98,
        "explanation": "Corroborated with John 3:16 KJV canonical text.",
        "scripture_references": ["John 3:16"],
        "is_high_risk": False,
    }

    mock_resp = GatewayResponse(
        response=MagicMock(),
        provider_slot="primary",
        model_name="gemini-3.8-flash",
        latency_ms=120.0,
        attempts=1,
    )
    mock_resp.response.text = json.dumps(ai_json)
    mock_gw.generate = AsyncMock(return_value=mock_resp)

    engine = VerificationDecisionEngine(gateway=mock_gw)
    res = await engine.evaluate_segment(
        azure_text="For God so loved the world that he gave his only son",
        surrounding_context="In John chapter 3 Jesus spoke to Nicodemus",
        gemini_audio_text="For God so loved the world that he gave his only begotten Son",
    )

    assert res["decision"] == "VERIFIED"
    assert res["confidence"] == 0.98
    assert "John 3:16" in res["scripture_references"]
    assert res["is_high_risk"] is False


@pytest.mark.asyncio
async def test_evaluate_segment_corrected():
    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    ai_json = {
        "decision": "CORRECTED",
        "verified_text": "Saul was on the way to Damascus",
        "confidence": 0.95,
        "explanation": "Audio and historical biblical narrative indicate Saul prior to conversion.",
        "scripture_references": ["Acts 9:1-3"],
        "is_high_risk": False,
    }

    mock_resp = GatewayResponse(
        response=MagicMock(),
        provider_slot="primary",
        model_name="gemini-3.8-flash",
        latency_ms=150.0,
        attempts=1,
    )
    mock_resp.response.text = json.dumps(ai_json)
    mock_gw.generate = AsyncMock(return_value=mock_resp)

    engine = VerificationDecisionEngine(gateway=mock_gw)
    res = await engine.evaluate_segment(
        azure_text="Paul was on the way to Damascus",
        surrounding_context="Before his name became Paul",
        gemini_audio_text="Saul was on the way to Damascus",
    )

    assert res["decision"] == "CORRECTED"
    assert res["verified_text"] == "Saul was on the way to Damascus"
    assert res["confidence"] == 0.95


@pytest.mark.asyncio
async def test_evaluate_segment_unresolved():
    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    ai_json = {
        "decision": "UNRESOLVED",
        "verified_text": "We went to the city",
        "confidence": 0.50,
        "explanation": "Severe audio distortion; preacher may have said Antioch or Athens.",
        "scripture_references": [],
        "is_high_risk": True,
    }

    mock_resp = GatewayResponse(
        response=MagicMock(),
        provider_slot="primary",
        model_name="gemini-3.8-flash",
        latency_ms=140.0,
        attempts=1,
    )
    mock_resp.response.text = json.dumps(ai_json)
    mock_gw.generate = AsyncMock(return_value=mock_resp)

    engine = VerificationDecisionEngine(gateway=mock_gw)
    res = await engine.evaluate_segment(
        azure_text="We went to the city",
        surrounding_context="Then Paul departed",
        gemini_audio_text="We went to ... indistinct",
    )

    assert res["decision"] == "UNRESOLVED"
    assert res["is_high_risk"] is True


@pytest.mark.asyncio
async def test_evaluate_segment_gateway_unconfigured_fallback():
    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = False

    engine = VerificationDecisionEngine(gateway=mock_gw)
    res = await engine.evaluate_segment(
        azure_text="Testing unconfigured gateway",
        surrounding_context="",
    )

    assert res["decision"] == "UNRESOLVED"
    assert "not configured" in res["explanation"].lower()


@pytest.mark.asyncio
async def test_verify_session_full_lifecycle():
    session_id = await create_mock_session_with_flags()

    # Create mock gateway resolving segment 0 as VERIFIED and segment 1 as CORRECTED
    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    async def mock_generate(operation, model, contents, config=None):
        prompt_text = str(contents)
        if "John" in prompt_text or "loved the world" in prompt_text:
            ai_data = {
                "decision": "VERIFIED",
                "verified_text": "For God so loved the world that he gave his only begotten Son",
                "confidence": 0.95,
                "explanation": "Verified John 3:16 citation",
                "scripture_references": ["John 3:16"],
                "is_high_risk": False,
            }
        else:
            ai_data = {
                "decision": "CORRECTED",
                "verified_text": "Saul was on the way to Damascus",
                "confidence": 0.92,
                "explanation": "Corrected Paul to Saul based on Acts 9",
                "scripture_references": ["Acts 9:3"],
                "is_high_risk": False,
            }
        resp = GatewayResponse(
            response=MagicMock(),
            provider_slot="primary",
            model_name="gemini-3.8-flash",
            latency_ms=100.0,
            attempts=1,
        )
        resp.response.text = json.dumps(ai_data)
        return resp

    mock_gw.generate = AsyncMock(side_effect=mock_generate)
    mock_gw.transcribe_audio = AsyncMock(return_value=GatewayResponse(
        response=MagicMock(), provider_slot="primary", model_name="gemini-3.5-transcribe", latency_ms=80.0, attempts=1
    ))

    engine = VerificationDecisionEngine(gateway=mock_gw)
    res = await engine.verify_session(session_id=session_id, auto_resolve=True)

    assert res["status"] == "completed_verified"
    assert res["summary"]["unresolved_count"] == 0
    assert res["summary"]["verified_count"] >= 1

    # Verify session in DB has verified status
    s_status = await session_repo.get_ai_verification_status(session_id)
    assert s_status["ai_verification_status"] == "completed_verified"
    assert s_status["items_pending"] == 0
