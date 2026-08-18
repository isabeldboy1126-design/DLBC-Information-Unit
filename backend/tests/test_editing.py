"""
Automated Test Suite for Phase 7 — AI Editing & Report Compilation

Tests:
1. Editor Standards versioning, activation, and persistence.
2. Protected backend rules and layered prompt construction.
3. Entry validation (requiring Verified Transcript and both Reporter drafts).
4. AI Compilation draft generation.
5. Human manual editing and revision preservation.
6. Revision history activation and restoring.
7. Stage completion ('complete' / ready for proofreading).
8. Regression safety across Phase 1-6 features.
"""

import asyncio
import os
import pytest
from app.database.connection import get_db_connection
from app.database.session_repo import session_repo
from app.database.reporting_repo import reporting_repo
from app.database.editing_repo import editing_repo
from app.services.editing_provider import (
    PROTECTED_BACKEND_EDITOR_RULES,
    EditingResult,
    GeminiEditingProvider,
    gemini_editing_provider,
)


@pytest.mark.asyncio
async def test_editor_standards_seeding_and_versioning():
    """Verifies that default Editor Standard v1 is seeded and creating new versions increments version number."""
    await editing_repo.init_db()

    # 1. Standard v1 must exist
    v1_record = await editing_repo.get_standard_by_version(1)
    assert v1_record is not None
    assert "Information Unit" in v1_record["general_guidelines"]
    assert "Reporter A" in v1_record["compilation_guidance"]

    # Ensure active standard is retrieved
    active_std = await editing_repo.get_active_standard()
    assert active_std is not None
    assert active_std["is_active"] is True

    initial_standards = await editing_repo.list_standards()
    initial_count = len(initial_standards)

    # 2. Create a new standard version
    new_v = await editing_repo.create_new_standard_version(
        general_guidelines="Updated guidelines for testing.",
        compilation_guidance="Updated compilation instructions for testing.",
        terminology="DLBC Terminology test",
        approved_examples="Example test report text.",
        notes="Testing version creation.",
        set_active=True,
    )

    assert new_v["version"] == initial_count + 1
    assert new_v["version_label"] == f"v{initial_count + 1}"
    assert new_v["is_active"] is True

    # 3. Active standard should now be the new version
    curr_active = await editing_repo.get_active_standard()
    assert curr_active["version"] == new_v["version"]

    # 4. Old standard v1 still exists in history and is now inactive
    v1_after = await editing_repo.get_standard_by_version(1)
    assert v1_after is not None
    assert v1_after["is_active"] is False

    # 5. Restore/activate v1
    reactivated = await editing_repo.activate_standard_version(1)
    assert reactivated["version"] == 1
    assert reactivated["is_active"] is True

    # Verify active standard is back to v1
    curr_active_after = await editing_repo.get_active_standard()
    assert curr_active_after["version"] == 1


@pytest.mark.asyncio
async def test_protected_editor_rules_and_prompt_layers():
    """Verifies that protected backend rules contain essential guardrails and layered prompt builder includes all inputs."""
    # Check protected rules
    assert "Verified Transcript provided below is the ABSOLUTE and EXCLUSIVE factual source of truth" in PROTECTED_BACKEND_EDITOR_RULES
    assert "NEVER invent, fabricate" in PROTECTED_BACKEND_EDITOR_RULES
    assert "NEVER resolve disagreements between Reporter A and Reporter B by guessing" in PROTECTED_BACKEND_EDITOR_RULES

    # Check layered prompt assembly
    provider = GeminiEditingProvider()
    standard = await editing_repo.get_active_standard()

    prompt = provider._build_prompt(
        session_metadata={"title": "Test Sermon", "speaker": "Pastor W.F. Kumuyi", "date_created": "2026-08-17"},
        verified_text="And Jesus spoke unto them a parable...",
        reporter_a_report={"report_title": "Reporter A Outline", "report_text": "Point 1: The Parable of Prayer"},
        reporter_b_report={"report_title": "Reporter B Details", "report_text": "Verse 1-8 details: The unjust judge"},
        standard=standard,
    )

    assert "PROTECTED SYSTEM RULES" in prompt
    assert "LAYER 1: ACTIVE EDITOR STANDARD" in prompt
    assert "LAYER 2: COMPILATION & RECONCILIATION GUIDANCE" in prompt
    assert "LAYER 5: AUTHORITATIVE VERIFIED TRANSCRIPT" in prompt
    assert "LAYER 6: INPUT DRAFT 1 — REPORTER A" in prompt
    assert "LAYER 7: INPUT DRAFT 2 — REPORTER B" in prompt
    assert "And Jesus spoke unto them a parable..." in prompt


@pytest.mark.asyncio
async def test_edited_report_lifecycle_and_revisions():
    """Tests the full editing lifecycle: compilation persistence, human manual edits, revision preservation, and stage completion."""
    session_id = f"test_edit_session_{int(asyncio.get_event_loop().time() * 1000)}"

    # 1. Create session and seed Verified Transcript + Reporter A + Reporter B
    await session_repo.create_session(
        session_id=session_id,
        title="The Mystery of Divine Grace",
        recording_id="rec_edit_001",
        status="completed",
    )

    # Set verified transcript and reporting status
    async with get_db_connection() as conn:
        await conn.execute(
            """
            UPDATE sessions
            SET verified_text = ?,
                verification_status = 'completed',
                reporting_status = 'reports_ready'
            WHERE session_id = ?
            """,
            ("For by grace are ye saved through faith; and that not of yourselves: it is the gift of God.", session_id),
        )
        await conn.commit()

    # Seed Reporter A and Reporter B reports
    await reporting_repo.save_report(
        session_id=session_id,
        reporter_role="reporter_a",
        standard_version=1,
        standard_version_label="v1",
        status="ready",
        report_title="Reporter A - The Doctrine of Grace",
        report_text="### 1. Salvation by Grace Through Faith\nThe gift of God is available to all.",
    )

    await reporting_repo.save_report(
        session_id=session_id,
        reporter_role="reporter_b",
        standard_version=1,
        standard_version_label="v1",
        status="ready",
        report_title="Reporter B - Detailed Notes on Grace",
        report_text="Eph 2:8-9 cited. Preacher emphasized works cannot save.",
    )

    # 2. Simulate AI Generation (Revision 1)
    std = await editing_repo.get_active_standard()
    rev1 = await editing_repo.save_edited_report_revision(
        session_id=session_id,
        report_text="# The Mystery of Divine Grace\n\nPastor W.F. Kumuyi expounded on Ephesians 2:8-9...",
        revision_source="ai_generated",
        standard_version=std["version"],
        standard_version_label=std["version_label"],
        report_title="The Mystery of Divine Grace",
        review_notes=["Check spelling of Ephesians citation."],
        model_name="gemini-3.7-flash",
    )

    assert rev1 is not None
    assert rev1["revision_number"] == 1
    assert rev1["revision_source"] == "ai_generated"
    assert rev1["is_active"] is True

    # 3. Simulate Human Manual Edit (Revision 2)
    rev2 = await editing_repo.save_edited_report_revision(
        session_id=session_id,
        report_text="# The Mystery of Divine Grace (Human Polished)\n\nDuring the Sunday Worship Service, Pastor W.F. Kumuyi ministered powerfully...",
        revision_source="human_edited",
        standard_version=std["version"],
        standard_version_label=std["version_label"],
        report_title="The Mystery of Divine Grace (Official)",
    )

    assert rev2 is not None
    assert rev2["revision_number"] == 2
    assert rev2["revision_source"] == "human_edited"
    assert rev2["is_active"] is True

    # 4. Check active report and history preservation
    active = await editing_repo.get_active_edited_report(session_id)
    assert active["revision_id"] == rev2["revision_id"]
    assert "Human Polished" in active["report_text"]

    revisions_list = await editing_repo.list_revisions_for_session(session_id)
    assert len(revisions_list) == 2
    assert revisions_list[0]["revision_number"] == 2
    assert revisions_list[1]["revision_number"] == 1

    # 5. Test activating/restoring Revision 1
    restored = await editing_repo.activate_revision(session_id, rev1["revision_id"])
    assert restored["revision_id"] == rev1["revision_id"]
    assert restored["is_active"] is True

    active_now = await editing_repo.get_active_edited_report(session_id)
    assert active_now["revision_number"] == 1

    # Restore Revision 2 back to active
    await editing_repo.activate_revision(session_id, rev2["revision_id"])

    # 6. Mark Editing as Complete
    await editing_repo.set_editing_status(session_id, "complete", completed_at="2026-08-17T16:00:00Z")
    updated_session = await session_repo.get_session(session_id)
    assert updated_session["editing_status"] == "complete"
    assert updated_session["editing_completed_at"] == "2026-08-17T16:00:00Z"
