"""
Phase 6 Automated Test Suite — AI Reporting System

Tests:
1. Reporting Standards default v1 seeding and retrieval.
2. Reporting Standards versioning, persistence, and activation.
3. Layered Prompt Assembly & Protected Backend Rules enforcement.
4. Graceful handling of unconfigured Gemini API key.
5. Report persistence, revision history, and Session status tracking.
6. API Endpoints verification via FastAPI TestClient.
"""

import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.reporting_repo import reporting_repo
from app.database.session_repo import session_repo
from app.services.reporting_provider import (
    gemini_reporting_provider,
    PROTECTED_BACKEND_RULES,
    REPORTER_A_ROLE_DEFINITION,
    REPORTER_B_ROLE_DEFINITION,
)

client = TestClient(app)


@pytest.mark.asyncio
async def test_reporting_standards_default_v1_seed():
    """Verify that Reporting Standard v1 is seeded with all standard sections."""
    await reporting_repo.init_db()
    active_std = await reporting_repo.get_active_standard()

    assert active_std is not None
    assert active_std["version"] >= 1
    assert "v1" in active_std["version_label"] or active_std["is_active"] is True
    assert "Information Unit" in active_std["general_guidelines"]
    assert "Reporter A" in active_std["reporter_a_instructions"]
    assert "Reporter B" in active_std["reporter_b_instructions"]
    assert "Pastor W.F. Kumuyi" in active_std["terminology"]
    assert "Approved Report Example" in active_std["examples"]


@pytest.mark.asyncio
async def test_reporting_standards_versioning():
    """Verify that editing standards creates a new incremented version without overwriting previous versions."""
    await reporting_repo.init_db()
    initial_standards = await reporting_repo.list_standards()
    initial_count = len(initial_standards)

    # Create new version (e.g. v2)
    v2_std = await reporting_repo.create_new_standard_version(
        general_guidelines="# Guidelines v2\nUpdated guidelines content.",
        reporter_a_instructions="# Reporter A v2\nUpdated structure instructions.",
        reporter_b_instructions="# Reporter B v2\nUpdated detail instructions.",
        terminology="# Glossary v2\nUpdated terminology.",
        examples="# Examples v2\nUpdated example.",
        notes="Testing Phase 6 versioning",
        set_active=True,
    )

    assert v2_std["version"] == initial_count + 1
    assert v2_std["is_active"] is True
    assert "Guidelines v2" in v2_std["general_guidelines"]

    # Verify previous version (v1) still exists and is inactive
    v1_std = await reporting_repo.get_standard_by_version(1)
    assert v1_std is not None
    assert v1_std["is_active"] is False

    # Switch active version back to v1
    re_activated = await reporting_repo.activate_standard_version(1)
    assert re_activated["is_active"] is True

    # Re-verify v2 is now inactive
    v2_check = await reporting_repo.get_standard_by_version(v2_std["version"])
    assert v2_check["is_active"] is False


def test_reporting_status_endpoint():
    """Verify GET /api/reporting/status response structure."""
    response = client.get("/api/reporting/status")
    assert response.status_code == 200
    data = response.json()
    assert "configured" in data
    assert data["provider"] == "gemini"
    assert "model" in data
    assert "active_standard_version" in data
    assert isinstance(data["configured"], bool)


def test_reporting_standards_api_endpoints():
    """Verify standards listing and active standard endpoints."""
    # List standards
    list_res = client.get("/api/reporting/standards")
    assert list_res.status_code == 200
    standards = list_res.json().get("standards", [])
    assert len(standards) >= 1

    # Active standard
    active_res = client.get("/api/reporting/standards/active")
    assert active_res.status_code == 200
    active = active_res.json().get("standard")
    assert active is not None
    assert "general_guidelines" in active


def test_unconfigured_generation_handling():
    """Verify that generation attempts without an API key fail gracefully with 503 instead of crashing."""
    # Ensure GEMINI_API_KEY is unset for this test
    original_key = os.environ.get("GEMINI_API_KEY")
    if "GEMINI_API_KEY" in os.environ:
        del os.environ["GEMINI_API_KEY"]

    try:
        response = client.post(
            "/api/reporting/sessions/test_session_id/generate",
            json={"role": "all"},
        )
        # Should return 404 (session not found) or 503 (unconfigured), never 500
        assert response.status_code in (404, 503, 400)
    finally:
        if original_key is not None:
            os.environ["GEMINI_API_KEY"] = original_key


def test_prompt_assembly_and_protected_rules():
    """Verify layered prompt builder includes protected backend rules and transcript."""
    standard = {
        "version": 1,
        "version_label": "v1",
        "general_guidelines": "General guidelines sample",
        "reporter_a_instructions": "Reporter A specific guidance",
        "reporter_b_instructions": "Reporter B specific guidance",
        "terminology": "Church Terminology sample",
        "examples": "Reference Example sample",
    }
    session_meta = {
        "title": "Sunday Worship Service",
        "date_created": "2026-08-17T09:00:00Z",
        "speaker": "Pastor W.F. Kumuyi",
        "programme": "Sunday Service",
    }
    verified_text = "Jesus Christ is the same yesterday, today, and forever. We must hold fast our profession of faith."

    # Test Reporter A Prompt
    prompt_a = gemini_reporting_provider._build_prompt(
        reporter_role="reporter_a",
        session_metadata=session_meta,
        verified_text=verified_text,
        standard=standard,
    )

    assert "PROTECTED SYSTEM RULES" in prompt_a
    assert "ABSOLUTE and EXCLUSIVE textual source of truth" in prompt_a
    assert "REPORTER A — MAIN MESSAGE & STRUCTURE" in prompt_a
    assert "Sunday Worship Service" in prompt_a
    assert "Pastor W.F. Kumuyi" in prompt_a
    assert verified_text in prompt_a

    # Test Reporter B Prompt
    prompt_b = gemini_reporting_provider._build_prompt(
        reporter_role="reporter_b",
        session_metadata=session_meta,
        verified_text=verified_text,
        standard=standard,
    )

    assert "PROTECTED SYSTEM RULES" in prompt_b
    assert "REPORTER B — DETAIL & OMISSION WATCH" in prompt_b
    assert "Sunday Worship Service" in prompt_b
    assert verified_text in prompt_b


@pytest.mark.asyncio
async def test_report_persistence_and_session_status():
    """Verify saving reports updates session reporting_status and history properly."""
    # Create mock session
    session_id = f"test_rep_sess_{os.urandom(4).hex()}"
    await session_repo.create_session(
        session_id=session_id,
        title="Test Reporting Session",
        status="completed",
    )

    # Initially not_started
    reports_init = await reporting_repo.get_active_reports_for_session(session_id)
    assert reports_init["reporter_a"] is None
    assert reports_init["reporter_b"] is None

    # Save Reporter A draft
    await reporting_repo.save_report(
        session_id=session_id,
        reporter_role="reporter_a",
        standard_version=1,
        standard_version_label="v1",
        status="ready",
        report_title="Report A Draft",
        report_text="Main message structure points...",
        key_points=["Point 1", "Point 2"],
        scriptures=["Hebrews 13:8"],
    )

    active_1 = await reporting_repo.get_active_reports_for_session(session_id)
    assert active_1["reporter_a"] is not None
    assert active_1["reporter_a"]["report_title"] == "Report A Draft"
    assert active_1["reporter_b"] is None

    sess_1 = await session_repo.get_session(session_id)
    assert sess_1["reporting_status"] == "partial"

    # Save Reporter B draft
    await reporting_repo.save_report(
        session_id=session_id,
        reporter_role="reporter_b",
        standard_version=1,
        standard_version_label="v1",
        status="ready",
        report_title="Report B Detail Draft",
        report_text="Detailed facts, illustrations, and quotes...",
        key_points=["Detail 1", "Detail 2"],
        scriptures=["Hebrews 13:8", "John 14:6"],
    )

    active_2 = await reporting_repo.get_active_reports_for_session(session_id)
    assert active_2["reporter_a"] is not None
    assert active_2["reporter_b"] is not None

    sess_2 = await session_repo.get_session(session_id)
    assert sess_2["reporting_status"] == "reports_ready"
    assert sess_2["reporting_completed_at"] is not None

    # Clean up test session
    await session_repo.delete_session(session_id)
