"""
Automated Stabilization and Edge-Case Test Suite for Stage 6 AI Verification.

Covers Section 2 and Section 7 requirements:
1. Cancellation during processing across separate worker contexts / container restarts.
2. Cancellation during result persistence (confirming save_ai_verification_batch_results aborts).
3. Superseded run_id handling (old background run cannot overwrite newer run_id or status).
4. Late AI response after cancellation (response safely discarded and auto report pipeline blocked).
5. Stale-run recovery mechanism and force override.
6. Azure SQL query parameter translation and DDL adaptation.
"""

import asyncio
import json
import uuid
import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.connection import get_db_connection, AsyncConnectionAdapter
from app.database.session_repo import session_repo
from app.services.gemini_gateway import GeminiGateway, GatewayResponse
from app.verification.decision_engine import VerificationDecisionEngine
from tests.test_batch_verification import create_dummy_wav_file, create_session_with_n_flags
from tests.test_verification_router import get_test_auth


@pytest.mark.asyncio
async def test_cancellation_during_processing_across_workers():
    """
    Simulates a scenario where Verification is started on Worker A (run_id=run_worker_1),
    and while Call 1 is in-flight, Worker B / API cancels the run in the database.
    The engine checkpoint must detect DB status == 'cancelled', raise CancelledError,
    and prevent completion without changing DB status to 'failed'.
    """
    wav_path = create_dummy_wav_file(duration_sec=30.0)
    session_id = await create_session_with_n_flags(3, audio_path=wav_path)
    run_id = f"run_worker_1_{uuid.uuid4().hex[:6]}"

    await session_repo.set_ai_verification_status(session_id, "compiling", run_id=run_id)

    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    async def mock_transcribe_with_concurrent_cancel(*args, **kwargs):
        # Simulate concurrent cancellation from another container / worker instance
        await session_repo.set_ai_verification_status(session_id, "cancelled", run_id=run_id)
        trans_dict = {"V001": "Faith in God", "V002": "Spoken scripture", "V003": "Holiness"}
        resp = GatewayResponse(
            response=MagicMock(), provider_slot="primary", model_name="gemini-3.5-transcribe", latency_ms=10.0, attempts=1
        )
        resp.response.text = json.dumps(trans_dict)
        return resp

    mock_gw.transcribe_audio = AsyncMock(side_effect=mock_transcribe_with_concurrent_cancel)
    mock_gw.generate = AsyncMock()

    engine = VerificationDecisionEngine(gateway=mock_gw)
    result = await engine.verify_session(session_id, auto_resolve=True, run_id=run_id)

    # Status returned must be 'cancelled'
    assert result["status"] == "cancelled"
    assert result["run_id"] == run_id

    # Reasoning generation (Call 2) must NEVER have been called
    mock_gw.generate.assert_not_called()

    # Database status must remain 'cancelled' and NOT be flipped to 'failed' or 'completed'
    db_status = await session_repo.get_ai_verification_status(session_id)
    assert db_status["ai_verification_status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancellation_during_result_persistence_blocks_writes():
    """
    Ensures that save_ai_verification_batch_results aborts without writing
    if the session status is cancelled.
    """
    session_id = await create_session_with_n_flags(2)
    run_id = f"run_persist_{uuid.uuid4().hex[:6]}"

    # Set status to cancelled
    await session_repo.set_ai_verification_status(session_id, "cancelled", run_id=run_id)

    # Attempt to persist results
    res = await session_repo.save_ai_verification_batch_results(
        session_id=session_id,
        results=[
            {
                "segment_index": 0,
                "ai_decision": "CORRECTED",
                "ai_verified_text": "Injected text during cancellation",
                "ai_confidence": 0.99,
                "auto_resolve": True,
            }
        ],
        run_id=run_id,
    )

    assert res["status"] == "cancelled"
    assert res["count"] == 0

    # Verify no database record was modified
    async with get_db_connection() as conn:
        cursor = await conn.execute(
            "SELECT ai_decision, verified_text, action FROM verification_items WHERE session_id = ?",
            (session_id,),
        )
        rows = await cursor.fetchall()
        for r in rows:
            assert r["ai_decision"] is None
            assert r["action"] == "pending"


@pytest.mark.asyncio
async def test_superseded_run_id_cannot_write_results_or_status():
    """
    Verifies that if an older run finishes after a new run has been initiated (e.g. restart),
    the older run is blocked from saving results and from overwriting the session status.
    """
    session_id = await create_session_with_n_flags(2)
    old_run_id = f"run_old_{uuid.uuid4().hex[:6]}"
    new_run_id = f"run_new_{uuid.uuid4().hex[:6]}"

    # Start new run
    await session_repo.set_ai_verification_status(session_id, "verifying", run_id=new_run_id)

    # 1. Old run attempts to save batch results
    batch_res = await session_repo.save_ai_verification_batch_results(
        session_id=session_id,
        results=[
            {
                "segment_index": 0,
                "ai_decision": "CORRECTED",
                "ai_verified_text": "Old run text",
                "ai_confidence": 0.9,
                "auto_resolve": True,
            }
        ],
        run_id=old_run_id,
    )
    assert batch_res["status"] == "superseded"
    assert batch_res["count"] == 0

    # 2. Old run attempts to mark session as completed
    status_update_res = await session_repo.set_ai_verification_status(
        session_id=session_id,
        status="completed_verified",
        run_id=old_run_id,
        expected_run_id=old_run_id,
        guard_not_cancelled=True,
    )
    assert status_update_res.get("updated") is False

    # Check database state: still 'verifying' with new_run_id
    cur_status = await session_repo.get_ai_verification_status(session_id)
    assert cur_status["ai_verification_status"] == "verifying"
    assert cur_status["ai_verification_run_id"] == new_run_id

    # 3. New run now completes successfully
    new_batch_res = await session_repo.save_ai_verification_batch_results(
        session_id=session_id,
        results=[
            {
                "segment_index": 0,
                "ai_decision": "VERIFIED",
                "ai_verified_text": "Valid new text",
                "ai_confidence": 0.95,
                "auto_resolve": True,
            }
        ],
        run_id=new_run_id,
    )
    assert new_batch_res["status"] == "success"

    new_status_res = await session_repo.set_ai_verification_status(
        session_id=session_id,
        status="completed_verified",
        run_id=new_run_id,
        expected_run_id=new_run_id,
        guard_not_cancelled=True,
    )
    assert new_status_res.get("updated") is True
    final_status = await session_repo.get_ai_verification_status(session_id)
    assert final_status["ai_verification_status"] == "completed_verified"
    assert final_status["ai_verification_run_id"] == new_run_id


@pytest.mark.asyncio
async def test_late_ai_response_after_cancellation_aborts_and_does_not_trigger_auto_pipeline():
    """
    When Gemini responds after the user already cancelled the verification,
    the post-AI cancellation checkpoint must drop the response, raise CancelledError,
    and prevent triggering the downstream automatic report processing pipeline.
    """
    wav_path = create_dummy_wav_file(duration_sec=30.0)
    session_id = await create_session_with_n_flags(2, audio_path=wav_path)
    run_id = f"run_late_{uuid.uuid4().hex[:6]}"

    await session_repo.set_ai_verification_status(session_id, "compiling", run_id=run_id)

    mock_gw = MagicMock(spec=GeminiGateway)
    mock_gw.is_configured.return_value = True

    # Call 1 transcribe succeeds
    mock_trans_resp = MagicMock()
    mock_trans_resp.text = json.dumps({"V001": "Audio words 1", "V002": "Audio words 2"})
    mock_gw.transcribe_audio = AsyncMock(
        return_value=GatewayResponse(
            response=mock_trans_resp, provider_slot="primary", model_name="gemini-3.5-transcribe", latency_ms=10.0, attempts=1
        )
    )

    # Call 2 reasoning: cancels in DB right before returning late response
    async def mock_late_generate(*args, **kwargs):
        await session_repo.set_ai_verification_status(session_id, "cancelled", run_id=run_id)
        decisions = [
            {
                "item_id": "V001",
                "decision": "VERIFIED",
                "corrected_text": "Late text 1",
                "confidence": 0.95,
                "reason_code": "KJV_CORROBORATED",
                "explanation": "Verified",
                "scripture_references": [],
                "is_high_risk": False,
            }
        ]
        resp = GatewayResponse(
            response=MagicMock(), provider_slot="primary", model_name="gemini-3.8-flash", latency_ms=10.0, attempts=1
        )
        resp.response.text = json.dumps(decisions)
        return resp

    mock_gw.generate = AsyncMock(side_effect=mock_late_generate)

    with patch("app.report_processing.engine.report_processing_engine.start_processing", new_callable=AsyncMock) as mock_auto_process:
        engine = VerificationDecisionEngine(gateway=mock_gw)
        result = await engine.verify_session(session_id, auto_resolve=True, run_id=run_id)

        assert result["status"] == "cancelled"
        # Auto-pipeline must NEVER be triggered
        mock_auto_process.assert_not_called()

    # DB status must remain cancelled
    db_status = await session_repo.get_ai_verification_status(session_id)
    assert db_status["ai_verification_status"] == "cancelled"


@pytest.mark.asyncio
async def test_stale_run_recovery_and_force_override():
    """
    Tests that:
    1. If a session is stuck in 'verifying' from a dead worker (> 15 min old),
       a new verification trigger will recover it.
    2. An explicit force=True payload overrides an in-progress status immediately.
    """
    auth_header, account_id = await get_test_auth()
    session_id = f"test_stale_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Stale Run Test",
        status="completed",
        account_id=account_id,
    )

    # Set status to verifying with started_at 25 minutes ago
    old_time = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
    async with get_db_connection() as conn:
        await conn.execute(
            "UPDATE sessions SET ai_verification_status = 'verifying', ai_verification_started_at = ? WHERE session_id = ?",
            (old_time, session_id),
        )
        await conn.commit()

    with patch("app.verification.router.verification_decision_engine.verify_session", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {"status": "completed_verified"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Normal call with stale record should NOT block: should initiate
            resp1 = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                headers=auth_header,
                json={"auto_resolve": True, "background": True},
            )
            assert resp1.status_code == 200
            data1 = resp1.json()
            assert data1["status"] == "compiling"
            assert "initiated" in data1["message"]

            # 2. Call again immediately: now active, should return in-progress guard
            resp2 = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                headers=auth_header,
                json={"auto_resolve": True, "background": True},
            )
            assert resp2.status_code == 200
            assert "already in progress" in resp2.json()["message"]

            # 3. Call with force=True: should override
            resp3 = await client.post(
                f"/api/sessions/{session_id}/verification/verify-ai",
                headers=auth_header,
                json={"auto_resolve": True, "background": True, "force": True},
            )
            assert resp3.status_code == 200
            assert resp3.json()["status"] == "compiling"


def test_azure_sql_connection_adapter_query_translation():
    """
    Directly tests that AsyncConnectionAdapter._convert_query_params correctly
    adapts Stage 6 SQL queries and DDL for Azure SQL (T-SQL).
    """
    mock_conn = MagicMock()
    adapter = AsyncConnectionAdapter(mock_conn)

    # 1. Update query with positional parameters
    sql_update = "UPDATE sessions SET ai_verification_status = ?, ai_verification_run_id = ? WHERE session_id = ? AND (ai_verification_run_id IS NULL OR ai_verification_run_id = ?)"
    params = ["verifying", "vr_run_123", "sess_abc", "vr_run_123"]

    stmt, bound_params = adapter._convert_query_params(sql_update, params)
    str_stmt = str(stmt)

    assert ":p_0" in str_stmt
    assert ":p_1" in str_stmt
    assert ":p_2" in str_stmt
    assert ":p_3" in str_stmt
    assert "?" not in str_stmt
    assert bound_params == {
        "p_0": "verifying",
        "p_1": "vr_run_123",
        "p_2": "sess_abc",
        "p_3": "vr_run_123",
    }

    # 2. DDL adaptation: ADD COLUMN -> ADD, TEXT -> NVARCHAR(MAX)
    sql_ddl = "ALTER TABLE sessions ADD COLUMN ai_verification_run_id TEXT"
    stmt_ddl, _ = adapter._convert_query_params(sql_ddl, None)
    str_ddl = str(stmt_ddl).upper()

    assert "ADD COLUMN" not in str_ddl
    assert "ADD AI_VERIFICATION_RUN_ID" in str_ddl
    assert "NVARCHAR(MAX)" in str_ddl

    # 3. LIMIT stripping for Azure SQL compatibility
    sql_limit = "SELECT * FROM sessions WHERE session_id = ? LIMIT 1"
    stmt_limit, _ = adapter._convert_query_params(sql_limit, ["sess_abc"])
    assert "LIMIT" not in str(stmt_limit).upper()

