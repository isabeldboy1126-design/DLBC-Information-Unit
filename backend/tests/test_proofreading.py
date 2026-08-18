"""
Automated Test Suite for Phase 8 — AI Proofreading Check

Tests:
1. Proofreading Standards default v1 seeding, versioning, and activation.
2. Protected backend proofreading rules (16 guardrails) and layered prompt construction.
3. Proofreading report persistence, structured changes parsing, and revision history.
4. Human manual adjustments and preservation of earlier revisions.
5. Acceptance workflow and transition to 'complete'.
6. API endpoint structure and graceful unconfigured handling.
"""

import asyncio
import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import get_db_connection
from app.database.session_repo import session_repo
from app.database.editing_repo import editing_repo
from app.database.proofreading_repo import proofreading_repo
from app.services.proofreading_provider import (
    PROTECTED_BACKEND_PROOFREADING_RULES,
    GeminiProofreadingProvider,
    gemini_proofreading_provider,
)

client = TestClient(app)


@pytest.mark.asyncio
async def test_proofreading_standards_seeding_and_versioning():
    """Verifies that default Proofreading Standard v1 is seeded and creating new versions increments version number."""
    await proofreading_repo.init_db()

    # 1. Standard v1 must exist and contain key guidelines
    v1_record = await proofreading_repo.get_standard_by_version(1)
    assert v1_record is not None
    assert "Proofreading Guidelines" in v1_record["guidelines"]
    assert "Pastor W.F. Kumuyi" in v1_record["terminology"]
    assert "Scripture" in v1_record["formatting_rules"]

    active_std = await proofreading_repo.get_active_standard()
    assert active_std is not None
    assert active_std["is_active"] is True

    initial_standards = await proofreading_repo.list_standards()
    initial_count = len(initial_standards)

    # 2. Create a new standard version
    new_v = await proofreading_repo.create_new_standard_version(
        guidelines="Updated proofreading guidelines for v2 testing.",
        terminology="DLBC Proofreading Terminology v2",
        formatting_rules="Scripture and punctuation rules v2",
        notes="Testing Phase 8 version creation.",
        set_active=True,
    )

    assert new_v["version"] == initial_count + 1
    assert new_v["version_label"] == f"v{initial_count + 1}"
    assert new_v["is_active"] is True

    # 3. Active standard should now be the new version
    curr_active = await proofreading_repo.get_active_standard()
    assert curr_active["version"] == new_v["version"]

    # 4. Old standard v1 still exists in history and is now inactive
    v1_after = await proofreading_repo.get_standard_by_version(1)
    assert v1_after is not None
    assert v1_after["is_active"] is False

    # 5. Restore/activate v1
    reactivated = await proofreading_repo.activate_standard_version(1)
    assert reactivated["version"] == 1
    assert reactivated["is_active"] is True

    # Verify active standard is back to v1
    curr_active_after = await proofreading_repo.get_active_standard()
    assert curr_active_after["version"] == 1


@pytest.mark.asyncio
async def test_protected_proofreading_rules_and_prompt_layers():
    """Verifies that protected backend rules contain essential guardrails and layered prompt builder includes all inputs."""
    # Check protected rules
    assert "DO NOT change the factual meaning" in PROTECTED_BACKEND_PROOFREADING_RULES
    assert "DO NOT invent, fabricate, extrapolate" in PROTECTED_BACKEND_PROOFREADING_RULES
    assert "BE CONSERVATIVE" in PROTECTED_BACKEND_PROOFREADING_RULES
    assert "return the EXACT unchanged text and an EMPTY list of changes" in PROTECTED_BACKEND_PROOFREADING_RULES

    # Check layered prompt assembly
    provider = GeminiProofreadingProvider()
    standard = await proofreading_repo.get_active_standard()

    prompt = provider._build_prompt(
        session_metadata={"title": "Test Sermon", "speaker": "Pastor W.F. Kumuyi", "date_created": "2026-08-17"},
        edited_report_text="# Test Sermon\n\nPastor W.F. Kumuyi ministered on Luke 18:1-8.",
        edited_report_title="Test Sermon",
        standard=standard,
    )

    assert "PROTECTED SYSTEM RULES" in prompt
    assert "LAYER 1: ACTIVE PROOFREADING STANDARD" in prompt
    assert "LAYER 2: CHURCH TERMINOLOGY & REVERENCE CAPITALIZATION" in prompt
    assert "LAYER 3: SCRIPTURE & FORMATTING RULES" in prompt
    assert "LAYER 5: EDITED REPORT TO PROOFREAD" in prompt
    assert "Pastor W.F. Kumuyi ministered on Luke 18:1-8" in prompt


@pytest.mark.asyncio
async def test_proofread_report_lifecycle_and_revisions():
    """Tests the full proofreading lifecycle: revision persistence, structured changes, human adjustments, and acceptance."""
    session_id = f"test_proofread_session_{os.urandom(4).hex()}"

    # 1. Create session and seed Edited Report
    await session_repo.create_session(
        session_id=session_id,
        title="The Triumph of Faith",
        status="completed",
    )

    std_edit = await editing_repo.get_active_standard()
    edited_rev = await editing_repo.save_edited_report_revision(
        session_id=session_id,
        report_text="# The Triumph of Faith\n\nDuring the Sunday service, Pastor W.F. Kumuyi preached on faith.",
        revision_source="human_edited",
        standard_version=std_edit["version"],
        standard_version_label=std_edit["version_label"],
        report_title="The Triumph of Faith",
    )

    # 2. Simulate AI Proofread (Revision 1)
    std_pr = await proofreading_repo.get_active_standard()
    rev1 = await proofreading_repo.save_proofread_revision(
        session_id=session_id,
        proofread_text="# The Triumph of Faith\n\nDuring the Sunday Worship Service, Pastor W.F. Kumuyi preached on faith.",
        revision_source="ai_proofread",
        standard_version=std_pr["version"],
        standard_version_label=std_pr["version_label"],
        proofread_title="The Triumph of Faith",
        edited_report_revision_id=edited_rev["revision_id"],
        changes=[
            {
                "original_text": "Sunday service",
                "suggested_text": "Sunday Worship Service",
                "change_type": "consistency",
                "reason": "Standard church programme title capitalization.",
            }
        ],
        review_notes=["All scripture citations are accurate."],
        model_name="gemini-3.7-flash",
    )

    assert rev1 is not None
    assert rev1["revision_number"] == 1
    assert rev1["revision_source"] == "ai_proofread"
    assert rev1["is_active"] is True
    assert len(rev1["changes"]) == 1

    # 3. Simulate Human Manual Adjustment (Revision 2)
    rev2 = await proofreading_repo.save_proofread_revision(
        session_id=session_id,
        proofread_text="# The Triumph of Faith (Final Polished)\n\nDuring the Sunday Worship Service, Pastor W.F. Kumuyi preached on faith.",
        revision_source="human_reviewed",
        standard_version=std_pr["version"],
        standard_version_label=std_pr["version_label"],
        proofread_title="The Triumph of Faith (Official)",
        edited_report_revision_id=edited_rev["revision_id"],
        changes=rev1["changes"],
    )

    assert rev2 is not None
    assert rev2["revision_number"] == 2
    assert rev2["revision_source"] == "human_reviewed"
    assert rev2["is_active"] is True

    # 4. Check active report and history preservation
    active = await proofreading_repo.get_active_proofread_report(session_id)
    assert active["revision_id"] == rev2["revision_id"]
    assert "Final Polished" in active["proofread_text"]

    revisions_list = await proofreading_repo.list_revisions_for_session(session_id)
    assert len(revisions_list) == 2
    assert revisions_list[0]["revision_number"] == 2
    assert revisions_list[1]["revision_number"] == 1

    # 5. Accept Revision 2
    accepted = await proofreading_repo.accept_revision(session_id, rev2["revision_id"])
    assert accepted["is_accepted"] is True

    sess = await session_repo.get_session(session_id)
    assert sess["proofreading_status"] == "complete"
    assert sess["accepted_proofread_revision_id"] == rev2["revision_id"]

    # Clean up test session
    await session_repo.delete_session(session_id)


def test_proofreading_api_status_and_standards():
    """Verify proofreading status and standards listing API endpoints."""
    # Status endpoint
    status_res = client.get("/api/proofreading/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert "configured" in status_data
    assert status_data["provider"] == "gemini"

    # Standards list endpoint
    stds_res = client.get("/api/proofreading/standards")
    assert stds_res.status_code == 200
    stds = stds_res.json().get("standards", [])
    assert len(stds) >= 1

    # Active standard endpoint
    act_res = client.get("/api/proofreading/standards/active")
    assert act_res.status_code == 200
    act_std = act_res.json().get("standard")
    assert act_std is not None
    assert "guidelines" in act_std
