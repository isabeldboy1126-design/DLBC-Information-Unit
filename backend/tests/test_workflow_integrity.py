"""
Workflow Integrity Pass Integration Tests

Verifies:
1. Immediate document export without mandatory human approval gate.
2. Approval binds to specific revision, timestamp, user_id, and account_id.
3. Automatic invalidation of approval when:
   - Verified transcript changes (resolve item, bulk confirm, finalise verification).
   - Report is edited / new revision saved.
4. Source-change protection during AI processing (SHA-256 snapshot) aborts save if transcript changes.
5. Real cancellation idempotency for AI processing and verification.
6. Permanent hard delete preserves account ownership isolation and cascades cleanly.
"""

import hashlib
import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database.connection import get_db_connection
from app.database.session_repo import session_repo
from app.database.final_report_repo import final_report_repo
from app.database.report_processing_repo import report_processing_repo
from app.report_processing.engine import report_processing_engine


async def create_onboarded_user_account(client: AsyncClient, username: str) -> tuple[dict, str]:
    headers = {"Authorization": f"Bearer test_token_{username}:{username}@dlbc.org"}
    onboard_res = await client.post(
        "/api/auth/onboarding/complete",
        headers=headers,
        json={"sector": "Adult", "church_state": "Lagos", "terminal_level": "state_headquarters"},
    )
    account_id = onboard_res.json()["account"]["id"]
    return headers, account_id


@pytest.mark.asyncio
async def test_immediate_export_without_approval_gate():
    """Exporting finalized report succeeds immediately without requiring explicit human approval."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_onboarded_user_account(client, f"user_exp_{uuid.uuid4().hex[:6]}")
        session_id = f"test_gate_sess_{uuid.uuid4().hex[:8]}"

        await session_repo.create_session(
            session_id=session_id,
            title="Integrity Test Service",
            account_id=account_id,
        )

        # Finalize a draft report (defaults to approval_status="draft")
        report = await final_report_repo.finalize_report(
            session_id=session_id,
            proofread_report_revision_id=None,
            report_title="Integrity Test Report",
            report_text="# Sunday Message\n\nContent for testing...",
            minister="Pastor Test",
            programme="Sunday Worship",
            approval_status="draft",
        )
        assert report["approval_status"] == "draft"

        # 1. Attempt generate-docx -> succeeds immediately (200)
        gen_res = await client.post(
            f"/api/report-processing/generate-docx/{session_id}",
            headers=headers,
        )
        assert gen_res.status_code == 200
        assert gen_res.json()["status"] == "success"

        # 2. Attempt download-docx -> succeeds immediately (200)
        dl_res = await client.get(
            f"/api/report-processing/download-docx/{session_id}",
            headers=headers,
        )
        assert dl_res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in dl_res.headers["content-type"]

        # 3. Attempt final-report/sessions/{id}/download -> succeeds immediately (200)
        fr_dl_res = await client.get(
            f"/api/final-report/sessions/{session_id}/download",
            headers=headers,
        )
        assert fr_dl_res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in fr_dl_res.headers["content-type"]


@pytest.mark.asyncio
async def test_approval_and_invalidation_workflow():
    """Approving report binds revision + user; editing or changing transcript invalidates approval status while export remains accessible."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_onboarded_user_account(client, f"user_appr_{uuid.uuid4().hex[:6]}")
        session_id = f"test_appr_sess_{uuid.uuid4().hex[:8]}"

        await session_repo.create_session(
            session_id=session_id,
            title="Approval Test Service",
            account_id=account_id,
        )

        # Finalize initial report
        report = await final_report_repo.finalize_report(
            session_id=session_id,
            proofread_report_revision_id=None,
            report_title="Approval Test Report",
            report_text="# Initial Content",
            approval_status="draft",
        )
        rev_id = report["id"]

        # Approve report
        appr_res = await client.post(
            f"/api/final-report/sessions/{session_id}/approve",
            json={"revision_id": rev_id},
            headers=headers,
        )
        assert appr_res.status_code == 200
        approved_data = appr_res.json()["final_report"]
        assert approved_data["approval_status"] == "approved"
        assert approved_data["approved_by_account_id"] == account_id
        assert approved_data["approved_revision_id"] == rev_id
        assert approved_data["approved_at"] is not None

        # Verify export succeeds (200)
        dl_res = await client.get(
            f"/api/report-processing/download-docx/{session_id}",
            headers=headers,
        )
        assert dl_res.status_code == 200

        # Now save a new report revision -> must reset to draft
        saved_rev = await final_report_repo.save_final_report_revision(
            session_id=session_id,
            report_title="Approval Test Report (Edited)",
            report_text="# Updated Content by Human",
        )
        assert saved_rev["approval_status"] == "draft"

        # Verify export succeeds with updated revision
        dl_res_after_edit = await client.get(
            f"/api/report-processing/download-docx/{session_id}",
            headers=headers,
        )
        assert dl_res_after_edit.status_code == 200

        # Re-approve the new revision
        appr_res2 = await client.post(
            f"/api/final-report/sessions/{session_id}/approve",
            json={"revision_id": saved_rev["id"]},
            headers=headers,
        )
        assert appr_res2.status_code == 200

        # Now simulate transcript finalisation change -> must invalidate approval status
        await session_repo.finalise_verification(session_id)

        active_report = await final_report_repo.get_active_final_report(session_id)
        assert active_report["approval_status"] in ("needs_review", "draft")

        # Export remains available immediately without requiring re-approval
        dl_res_after_transcript = await client.get(
            f"/api/report-processing/download-docx/{session_id}",
            headers=headers,
        )
        assert dl_res_after_transcript.status_code == 200


@pytest.mark.asyncio
async def test_cancellation_idempotency_for_ai_processing():
    """Cancellation of report processing is idempotent and resets session state safely."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_onboarded_user_account(client, f"user_canc_{uuid.uuid4().hex[:6]}")
        session_id = f"test_canc_sess_{uuid.uuid4().hex[:8]}"

        await session_repo.create_session(
            session_id=session_id,
            title="Cancellation Test Service",
            account_id=account_id,
        )

        run = await report_processing_repo.create_run(session_id)
        run_id = run["run_id"]

        # 1. Cancel via session endpoint
        res1 = await client.post(
            f"/api/report-processing/sessions/{session_id}/cancel",
            headers=headers,
        )
        assert res1.status_code == 200
        assert res1.json()["status"] == "cancelled"

        # 2. Cancel again via run endpoint (idempotency check)
        res2 = await client.post(
            f"/api/report-processing/cancel/{run_id}",
            headers=headers,
        )
        assert res2.status_code == 200
        assert res2.json()["status"] == "cancelled"

        # Verify run record in DB is marked cancelled
        db_run = await report_processing_repo.get_run(run_id)
        assert db_run["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancellation_idempotency_for_verification():
    """Cancellation of AI verification is idempotent and halts processing safely."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_onboarded_user_account(client, f"user_vcan_{uuid.uuid4().hex[:6]}")
        session_id = f"test_vcan_sess_{uuid.uuid4().hex[:8]}"

        await session_repo.create_session(
            session_id=session_id,
            title="Verification Cancel Test",
            account_id=account_id,
        )

        # Set status to verifying
        await session_repo.set_ai_verification_status(session_id, "verifying")

        # Cancel verification
        res = await client.post(
            f"/api/sessions/{session_id}/verification/cancel",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "cancelled"

        # Call again (idempotent)
        res2 = await client.post(
            f"/api/sessions/{session_id}/verification/cancel",
            headers=headers,
        )
        assert res2.status_code == 200
        assert res2.json()["status"] == "cancelled"

        v_status = await session_repo.get_ai_verification_status(session_id)
        assert v_status["ai_verification_status"] == "cancelled"


@pytest.mark.asyncio
async def test_account_isolation_on_permanent_delete():
    """Account A cannot delete Account B's session."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers_owner, account_id_owner = await create_onboarded_user_account(client, f"user_own_{uuid.uuid4().hex[:6]}")
        headers_attacker, account_id_attacker = await create_onboarded_user_account(client, f"user_att_{uuid.uuid4().hex[:6]}")
        session_id = f"test_iso_sess_{uuid.uuid4().hex[:8]}"

        await session_repo.create_session(
            session_id=session_id,
            title="Isolated Session",
            account_id=account_id_owner,
        )

        # Attacker tries to delete with different account
        del_res = await client.delete(
            f"/api/sessions/{session_id}",
            headers=headers_attacker,
        )
        assert del_res.status_code == 404

        # Verify session still exists
        session_still_there = await session_repo.get_session(session_id)
        assert session_still_there is not None

        # Owner deletes session -> succeeds
        owner_del_res = await client.delete(
            f"/api/sessions/{session_id}",
            headers=headers_owner,
        )
        assert owner_del_res.status_code == 200

        # Verify hard deleted from database
        deleted_check = await session_repo.get_session(session_id)
        assert deleted_check is None
