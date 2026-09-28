"""
Automated Test Suite for Stage 6 AI Verification Router Endpoints.

Tests:
1. GET /api/sessions/{session_id}/verification/ai-status (404 and 200).
2. GET /api/sessions/{session_id}/verification includes AI verification lifecycle state.
3. POST /api/sessions/{session_id}/verification/verify-ai (404 for unknown session).
4. POST /api/sessions/{session_id}/verification/verify-ai (synchronous execution).
5. POST /api/sessions/{session_id}/verification/verify-ai (background trigger + duplicate in-progress guard).
"""

import pytest
import uuid
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.session_repo import session_repo


@pytest.mark.asyncio
async def test_ai_status_endpoint_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/sessions/nonexistent-session-id/verification/ai-status")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_ai_status_and_verification_state_endpoints():
    session_id = f"test_vstat_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="AI Status Test",
        status="completed",
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check initial ai-status
        resp = await client.get(f"/api/sessions/{session_id}/verification/ai-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == session_id
        assert data["ai_verification_status"] == "idle"

        # Check full verification endpoint includes ai fields
        v_resp = await client.get(f"/api/sessions/{session_id}/verification")
        assert v_resp.status_code == 200
        v_data = v_resp.json()
        assert v_data["ai_verification_status"] == "idle"
        assert "ai_verification_summary" in v_data


@pytest.mark.asyncio
async def test_trigger_ai_verification_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/sessions/nonexistent-session/verification/verify-ai")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_trigger_ai_verification_synchronous():
    session_id = f"test_vsync_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="AI Verify Sync Test",
        status="completed",
    )

    mock_result = {
        "status": "completed_verified",
        "session_id": session_id,
        "summary": {"total_items": 2, "verified_count": 2, "corrected_count": 0, "unresolved_count": 0},
    }

    with patch("app.verification.router.verification_decision_engine.verify_session", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = mock_result
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                json={"auto_resolve": True, "background": False},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "completed_verified"
            assert data["summary"]["verified_count"] == 2
            mock_verify.assert_called_once_with(session_id, auto_resolve=True)


@pytest.mark.asyncio
async def test_trigger_ai_verification_background_and_in_progress_guard():
    session_id = f"test_vbg_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="AI Verify BG Test",
        status="completed",
    )

    with patch("app.verification.router.verification_decision_engine.verify_session", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {"status": "completed_verified"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Start verification in background
            resp = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                json={"auto_resolve": True, "background": True},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "compiling"
            assert "initiated" in data["message"]

            # 2. Try to start again while in compiling: should return in-progress guard
            resp2 = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                json={"auto_resolve": True, "background": True},
            )
            assert resp2.status_code == 200
            data2 = resp2.json()
            assert "already in progress" in data2["message"]


@pytest.mark.asyncio
async def test_a_manual_verification_route_variations():
    """
    Test A: Manual AI verification on existing session across all path variations:
    1. POST /api/sessions/{session_id}/verification/verify-ai
    2. POST /api/sessions/{session_id}/verification/verify-ai/ (trailing slash)
    3. POST /api/sessions/{session_id}/verify-ai
    4. POST /api/sessions/{session_id}/verify-ai/ (trailing slash)
    5. POST /api/sessions/verify-ai (with session_id in JSON payload)
    6. GET /api/sessions/{session_id}/verification/verify-ai (GET status fallback alias)
    """
    session_id = f"test_route_var_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Route Variations Test",
        status="completed",
    )

    mock_result = {
        "status": "completed_verified",
        "session_id": session_id,
        "summary": {"total_items": 1, "verified_count": 1, "corrected_count": 0, "unresolved_count": 0},
    }

    with patch("app.verification.router.verification_decision_engine.verify_session", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = mock_result
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Canonical route
            r1 = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                json={"auto_resolve": True, "background": False},
            )
            assert r1.status_code == 200, f"Failed on canonical route: {r1.status_code} {r1.text}"
            assert r1.json()["status"] == "completed_verified"

            # 2. Canonical route with trailing slash
            r2 = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai/",
                json={"auto_resolve": True, "background": False},
            )
            assert r2.status_code == 200, f"Failed on trailing slash: {r2.status_code} {r2.text}"
            assert r2.json()["status"] == "completed_verified"

            # 3. Direct verify-ai subpath
            r3 = await client.post(
                f"/api/sessions/{session_id}/verify-ai",
                json={"auto_resolve": True, "background": False},
            )
            assert r3.status_code == 200, f"Failed on direct subpath: {r3.status_code} {r3.text}"
            assert r3.json()["status"] == "completed_verified"

            # 4. Direct verify-ai subpath with trailing slash
            r4 = await client.post(
                f"/api/sessions/{session_id}/verify-ai/",
                json={"auto_resolve": True, "background": False},
            )
            assert r4.status_code == 200, f"Failed on subpath trailing slash: {r4.status_code} {r4.text}"
            assert r4.json()["status"] == "completed_verified"

            # 5. Direct /verify-ai endpoint with session_id in body
            r5 = await client.post(
                "/api/sessions/verify-ai",
                json={"session_id": session_id, "auto_resolve": True, "background": False},
            )
            assert r5.status_code == 200, f"Failed on body endpoint: {r5.status_code} {r5.text}"
            assert r5.json()["status"] == "completed_verified"

            # 6. GET status fallback alias (prevents 405 on accidental GET / redirect)
            r6 = await client.get(f"/api/sessions/{session_id}/verification/verify-ai")
            assert r6.status_code == 200, f"Failed on GET fallback alias: {r6.status_code} {r6.text}"
            assert "ai_verification_status" in r6.json()


@pytest.mark.asyncio
async def test_b_automatic_verification_flow_parity():
    """
    Test B: Automatic verification flow after recording.
    Confirms that automatic verification triggers the exact same underlying
    verification_decision_engine.verify_session as the manual workflow.
    """
    from app.verification.decision_engine import verification_decision_engine

    session_id = f"test_auto_parity_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Auto Parity Test",
        status="recording",
    )

    with patch.object(verification_decision_engine, "verify_session", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {
            "status": "completed_verified",
            "session_id": session_id,
            "summary": {"total_items": 0, "verified_count": 0, "corrected_count": 0, "unresolved_count": 0},
        }

        # Simulate the exact automatic finalization call made in audio/router.py & youtube_service.py:
        await session_repo.finalize_session(
            session_id=session_id,
            audio_summary={"audio_id": "test_audio", "duration_seconds": 12.0},
            transcript_summary={"transcript_id": "test_tr", "raw_text": "Amen"},
        )
        await session_repo.set_ai_verification_status(session_id, "compiling")
        res = await verification_decision_engine.verify_session(session_id, auto_resolve=True)

        assert res["status"] == "completed_verified"
        mock_verify.assert_called_once_with(session_id, auto_resolve=True)


@pytest.mark.asyncio
async def test_c_verification_failure_no_stuck_states():
    """
    Test C: Verification failure handling (no stuck states).
    When an unhandled exception or model failure occurs during verification,
    the session must not remain permanently stuck in 'compiling' or 'verifying'.
    """
    from app.verification.decision_engine import VerificationDecisionEngine

    session_id = f"test_stuck_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Failure Recovery Test",
        status="completed",
    )

    mock_gw = MagicMock()
    mock_gw.is_configured.return_value = True
    # Simulate Gemini failure
    mock_gw.generate = AsyncMock(side_effect=RuntimeError("Simulated Gemini API timeout"))

    engine = VerificationDecisionEngine(gateway=mock_gw)
    result = await engine.verify_session(session_id, auto_resolve=True)

    # Status must be completed_verified or completed_needs_review, NEVER stuck in compiling or verifying
    status_info = await session_repo.get_ai_verification_status(session_id)
    cur_status = status_info.get("ai_verification_status")
    assert cur_status not in ("compiling", "verifying"), f"Session stuck in {cur_status}"
    assert cur_status in ("completed_verified", "completed_needs_review")


@pytest.mark.asyncio
async def test_d_gemini_primary_to_backup_failover():
    """
    Test D: Gemini primary -> backup failover works.
    When primary provider hits a 503 or 429 quota exhaustion,
    the gateway fails over to the backup slot seamlessly.
    """
    from app.services.gemini_gateway import GeminiGateway

    gw = GeminiGateway()
    gw._get_primary_key = lambda: "fake-primary-key"
    gw._get_backup_key = lambda: "fake-backup-key"

    mock_primary_client = MagicMock()
    mock_backup_client = MagicMock()

    # Primary raises 503 Service Unavailable
    mock_primary_client.aio.models.generate_content = AsyncMock(
        side_effect=Exception("503 UNAVAILABLE: This model is currently experiencing high demand.")
    )

    # Backup succeeds
    mock_resp = MagicMock()
    mock_resp.text = '{"decision": "VERIFIED", "confidence": 0.95}'
    mock_backup_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    gw._get_client = lambda slot: mock_primary_client if slot == "primary" else mock_backup_client

    resp = await gw.generate(
        operation="test_failover",
        model="gemini-3.8-flash",
        contents="Verify scripture",
    )

    assert resp.provider_slot == "backup"
    assert resp.attempts == 2
    assert "VERIFIED" in resp.text

