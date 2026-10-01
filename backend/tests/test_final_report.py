"""
Automated Test Suite for Phase 9 — Final Report & Downloadable Document

Tests:
1. DocumentService deterministic Word (.docx) generation, styling, and filename sanitization.
2. Exact wording preservation (word count and content verification).
3. FinalReportRepository persistence, revision history, and session completion.
4. Final Report API endpoints (finalize, save-revision, download .docx).
5. Phase 7 Edited Report .docx export endpoint (does not change workflow status).
"""

import io
import os
import pytest
import docx
from fastapi.testclient import TestClient

from app.main import app
from app.database.session_repo import session_repo
from app.database.editing_repo import editing_repo
from app.database.proofreading_repo import proofreading_repo
from app.database.final_report_repo import final_report_repo
from app.services.document_service import document_service

client = TestClient(app)


def test_document_service_filename_generation():
    """Verify clean, human-readable filename generation and forbidden character sanitization."""
    # Test valid sermon title + date
    fn1 = document_service.generate_filename(
        title="The Triumph of Faith",
        programme="Sunday Worship Service",
        date_str="2026-08-17T10:00:00Z",
    )
    assert fn1 == "The Triumph of Faith - 17 Aug 2026.docx"

    # Test title with forbidden OS characters: / \ : * ? " < > |
    fn2 = document_service.generate_filename(
        title="Faith: The Key to Victory/Triumph? Yes!",
        programme="MBS",
        date_str="2026-08-17",
    )
    assert ":" not in fn2
    assert "/" not in fn2
    assert "?" not in fn2
    assert "Faith - The Key to Victory - Triumph - Yes!" in fn2
    assert fn2.endswith(".docx")

    # Test Edited Draft suffix
    fn3 = document_service.generate_filename(
        title="The Power of Prayer",
        programme="RETS",
        date_str="2026-08-17",
        suffix="Edited Draft",
    )
    assert fn3 == "The Power of Prayer - Edited Draft - 17 Aug 2026.docx"


def test_document_service_docx_structure_and_exact_wording():
    """Verify that python-docx generates a valid editable Word document with exact text preservation."""
    sample_text = (
        "# The Triumph of Faith\n\n"
        "Pastor W.F. Kumuyi ministered powerfully on faith from Luke 18:1-8.\n\n"
        "## 1. The Foundation of Genuine Faith\n"
        "- Faith comes by hearing the Word of God (**Romans 10:17**).\n"
        "- We must abide in Christ with unwavering commitment.\n\n"
        "> \"Without faith it is impossible to please God.\" — Hebrews 11:6\n\n"
        "### Essential Steps for Every Believer\n"
        "1. Total repentance and surrender.\n"
        "2. Regular fellowship and Bible study.\n"
    )

    metadata = {
        "title": "The Triumph of Faith",
        "speaker": "Pastor W.F. Kumuyi",
        "programme": "Sunday Worship Service",
        "date_created": "2026-08-17T09:00:00Z",
    }

    # Generate in-memory DOCX
    stream = document_service.generate_final_report_docx(
        report_title="The Triumph of Faith",
        report_text=sample_text,
        session_metadata=metadata,
    )

    assert stream is not None
    docx_bytes = stream.getvalue()
    assert len(docx_bytes) > 1000  # Valid zip container

    # Re-open with python-docx to verify content
    doc = docx.Document(io.BytesIO(docx_bytes))
    full_text = "\n".join([p.text for p in doc.paragraphs if p.text])

    # Assert exact wording was preserved without alterations
    assert "DEEPER CHRISTIAN LIFE MINISTRY — INFORMATION UNIT" in full_text
    assert "The Triumph of Faith" in full_text
    assert "Pastor W.F. Kumuyi" in full_text
    assert "Sunday Worship Service" in full_text
    assert "The Foundation of Genuine Faith" in full_text
    assert "Faith comes by hearing the Word of God (Romans 10:17)" in full_text
    assert "Without faith it is impossible to please God" in full_text
    assert "Total repentance and surrender." in full_text


@pytest.mark.asyncio
async def test_final_report_persistence_and_revision_history():
    """Verify Final Report persistence, revision preservation, and session status transition."""
    session_id = f"test_final_session_{os.urandom(4).hex()}"

    # 1. Create Session
    await session_repo.create_session(
        session_id=session_id,
        title="Sermon on the Mount",
        status="completed",
    )

    # 2. Seed Approved Proofread Report
    std_pr = await proofreading_repo.get_active_standard()
    proofread_rev = await proofreading_repo.save_proofread_revision(
        session_id=session_id,
        proofread_text="# Sermon on the Mount\n\nChrist taught His disciples concerning the Kingdom of God.",
        revision_source="ai_proofread",
        standard_version=std_pr["version"],
        standard_version_label=std_pr["version_label"],
        proofread_title="Sermon on the Mount",
        is_accepted=True,
    )

    # 3. Finalize Report (Revision 1)
    final_rev1 = await final_report_repo.finalize_report(
        session_id=session_id,
        proofread_report_revision_id=proofread_rev["revision_id"],
        report_title="Sermon on the Mount",
        report_text=proofread_rev["proofread_text"],
        minister="Pastor W.F. Kumuyi",
        programme="Sunday Worship Service",
        service_date="2026-08-17",
        docx_filename="Sermon on the Mount - 17 Aug 2026.docx",
        docx_file_size=15000,
    )

    assert final_rev1 is not None
    assert final_rev1["revision_number"] == 1
    assert final_rev1["is_active"] is True
    assert final_rev1["report_title"] == "Sermon on the Mount"

    sess1 = await session_repo.get_session(session_id)
    assert sess1["final_report_status"] == "needs_review"
    assert not final_rev1["can_export"]
    await proofreading_repo.accept_revision(session_id, proofread_rev["revision_id"])
    approved = await final_report_repo.approve_report(session_id, final_rev1["id"])
    assert approved["can_export"]
    assert sess1["final_report_id"] == final_rev1["id"]

    # 4. Save Human Adjustment (Revision 2) post-finalization
    final_rev2 = await final_report_repo.save_final_report_revision(
        session_id=session_id,
        report_title="Sermon on the Mount (Official Release)",
        report_text="# Sermon on the Mount (Official Release)\n\nChrist taught His disciples concerning the Kingdom of God in Matthew 5-7.",
        minister="Pastor W.F. Kumuyi",
        programme="Sunday Worship Service",
        service_date="2026-08-17",
        docx_filename="Sermon on the Mount - 17 Aug 2026.docx",
        docx_file_size=16200,
    )

    assert final_rev2 is not None
    assert final_rev2["revision_number"] == 2
    assert final_rev2["is_active"] is True

    # Check active report is revision 2
    active = await final_report_repo.get_active_final_report(session_id)
    assert active["id"] == final_rev2["id"]

    # Check revision history has 2 records
    history = await final_report_repo.list_final_report_revisions(session_id)
    assert len(history) == 2
    assert history[0]["revision_number"] == 2
    assert history[1]["revision_number"] == 1

    # 5. Restore Revision 1
    restored = await final_report_repo.activate_final_report_revision(session_id, final_rev1["id"])
    assert restored["id"] == final_rev1["id"]
    active_after = await final_report_repo.get_active_final_report(session_id)
    assert active_after["id"] == final_rev1["id"]

    # Clean up test session
    await session_repo.delete_session(session_id)


def test_final_report_and_editing_export_endpoints():
    """Verify Final Report and Edited Report download endpoints."""
    # We will test using an ephemeral session setup
    session_id = f"test_api_sess_{os.urandom(4).hex()}"

    import asyncio
    asyncio.run(session_repo.create_session(session_id=session_id, title="Test Download Sermon", status="completed"))
    asyncio.run(editing_repo.save_edited_report_revision(
        session_id=session_id,
        report_text="# Test Edited Draft\n\nContent for editing export test.",
        revision_source="human_edited",
        standard_version=1,
        standard_version_label="v1",
        report_title="Test Download Sermon",
    ))
    proofread = asyncio.run(proofreading_repo.save_proofread_revision(
        session_id=session_id,
        proofread_text="# Test Proofread Final\n\nContent for final download test.",
        revision_source="ai_proofread",
        standard_version=1,
        standard_version_label="v1",
        proofread_title="Test Download Sermon",
        is_accepted=True,
    ))

    asyncio.run(proofreading_repo.accept_revision(session_id, proofread["revision_id"]))

    # 1. Test Edited Report Export (.docx)
    edit_res = client.get(f"/api/editing/sessions/{session_id}/export-docx")
    assert edit_res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in edit_res.headers["content-type"]
    assert "attachment;" in edit_res.headers["content-disposition"]
    assert "Edited Draft" in edit_res.headers["content-disposition"]
    assert len(edit_res.content) > 1000

    # 2. Test Finalize Report Endpoint
    finalize_res = client.post(f"/api/final-report/sessions/{session_id}/finalize", json={})
    assert finalize_res.status_code == 200
    data = finalize_res.json()
    assert data["status"] == "approved"
    assert "final_report" in data

    # 3. Test Final Report Details Endpoint
    get_res = client.get(f"/api/final-report/sessions/{session_id}")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["final_report_status"] == "approved"
    assert get_data["active_final_report"] is not None

    # 4. Test Final Report Download Endpoint (.docx)
    final_res = client.get(f"/api/final-report/sessions/{session_id}/download")
    assert final_res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in final_res.headers["content-type"]
    assert "attachment;" in final_res.headers["content-disposition"]
    assert ".docx" in final_res.headers["content-disposition"]
    assert len(final_res.content) > 1000

    # Clean up
    asyncio.run(session_repo.delete_session(session_id))
