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
from unittest.mock import patch, AsyncMock
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
