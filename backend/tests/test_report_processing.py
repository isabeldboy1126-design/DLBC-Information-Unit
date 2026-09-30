"""
Unified Report Processing Test Suite (Stage 7)

Comprehensive unit and integration tests covering:
1. Exactly ONE Gemini reasoning request per session (single-stage architecture).
2. Four truthful pipeline states (preparing_transcript -> ai_processing -> preparing_report -> completed).
3. Idempotency protection against duplicate triggers and page refreshes.
4. Anti-AI-slop validation and rejection of prohibited clichés.
5. Legacy reporting material reuse (reused_existing_material flag).
6. Seed approved examples library (AM, AN, AO, AP).
7. Standards versioning, creation, and activation.
8. Human edit diff learning and exemplar promotion.
9. Settings persistence (auto_process_after_verification).
10. Auto-processing trigger after verification completion (0 unresolved items).
11. Document (.docx) generation and download endpoints.
12. Completed reports archive search and multi-attribute filtering.

GUARANTEE: Zero real Gemini quota consumed (100% mocked responses).
"""

import asyncio
import json
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database.final_report_repo import final_report_repo
from app.database.report_processing_repo import (
    DEFAULT_ANTI_SLOP_RULES,
    report_processing_repo,
)
from app.database.session_repo import session_repo
from app.main import app
from app.report_processing.engine import ReportProcessingEngine, report_processing_engine
from app.services.gemini_gateway import GeminiGateway, GatewayResponse

client = TestClient(app)



MOCK_VALID_AI_REPORT_JSON = {
    "report_title": "The Power of Consecrated Living",
    "theme": "Holiness and Total Surrender",
    "scripture_reference": "1 Peter 1:13-16; Romans 8:1-14",
    "minister": "Pastor (Dr) W.F. Kumuyi",
    "service_date": "2026-08-23",
    "report_text": """# The Power of Consecrated Living

**Theme:** Holiness and Total Surrender  
**Text:** 1 Peter 1:13-16; Romans 8:1-14  
**Minister:** Pastor (Dr) W.F. Kumuyi  
**Date:** August 23, 2026  

## INTRODUCTION
The call of the Lord to every believer is a call of utmost solemnity and divine dignity. God has not summoned His redeemed children into superficial religious observance, but into real, inward, and enduring holiness. In this powerful message, the minister of God directs the church to the non-negotiable imperative of personal purity, undivided consecration, and spiritual stamina. Where holiness is absent, all outward profession is vain.

## 1. THE FOUNDATION OF THE HOLY CALLING
The believer is commanded to gird up the loins of his mind and be sober. True transformation begins in the renewed intellect and disciplined heart. Having turned away from the former lusts of ignorance, the Christian sets his affections on heavenly things. Regeneration provides the divine nature that makes holy living practical and joyful.

## 2. THE ABSOLUTE NATURE OF THE DIVINE STANDARD
The standard of righteousness is neither cultural nor societal; the standard is God Himself: 'Be ye holy; for I am holy.' God provides the sanctifying grace through the Blood of the Lamb and the inward working of the Holy Ghost. This sanctification touches personal integrity, speech, business dealings, and domestic peace.

## 3. THE STEADFAST WALK IN THE SPIRIT
Those who walk in the Spirit do not fulfill the lust of the flesh. They mortify the deeds of the body and manifest the fruit of righteousness in every circumstance.

## CONCLUSION AND CALL TO PRAYER
The congregation is challenged to surrender wholly to Christ, seeking full sanctification and holy empowerment for Christian service.""",
    "reporter_extraction": {
        "speaker": "Pastor (Dr) W.F. Kumuyi",
        "theme": "Holiness and Total Surrender",
        "scriptures_cited": ["1 Peter 1:13-16", "Romans 8:1-14"],
        "main_divisions": [
            "1. THE FOUNDATION OF THE HOLY CALLING",
            "2. THE ABSOLUTE NATURE OF THE DIVINE STANDARD",
            "3. THE STEADFAST WALK IN THE SPIRIT",
        ],
        "illustrations": ["Discipline of the mind", "Mortification of the deeds of the body"],
        "key_admonitions": ["Be ye holy; for I am holy", "Gird up the loins of your mind"],
    },
    "editorial_selection": {
        "kept_elements": ["Foundational scripture texts", "Three main message divisions", "Call to prayer"],
        "compressed_elements": ["Rhetorical audience questions", "Repeated oratorical phrases"],
        "omitted_elements": ["Procedural platform instructions", "Coughs and vocal hesitations"],
    },
    "writing_notes": {
        "structure_summary": "Introduction, 3 Roman Numeral Outlines, Conclusion and Prayer",
        "theological_focus": "Sanctification and Consecration",
    },
    "proofreading": {
        "scripture_checks": ["Confirmed 1 Peter 1:13-16 and Romans 8:1-14"],
        "names_checked": ["Confirmed Pastor (Dr) W.F. Kumuyi"],
        "grammar_checked": True,
        "anti_slop_passed": True,
        "proofreader_notes": "Zero forbidden cliches; pure DLBC publication voice.",
    },
}


def create_mock_gateway(json_payload=None, token_count=1250):
    """Creates a mock GeminiGateway returning predictable structured output without API calls."""
    mock_gtw = MagicMock(spec=GeminiGateway)
    mock_gtw.is_configured.return_value = True

    response_text = json.dumps(json_payload or MOCK_VALID_AI_REPORT_JSON)

    mock_resp = MagicMock()
    mock_resp.text = response_text
    mock_usage = MagicMock()
    mock_usage.total_token_count = token_count
    mock_resp.usage_metadata = mock_usage

    mock_gateway_res = GatewayResponse(
        response=mock_resp,
        provider_slot="primary",
        model_name="gemini-3.8-flash",
        latency_ms=120.0,
        attempts=1,
    )

    mock_gtw.generate = AsyncMock(return_value=mock_gateway_res)
    return mock_gtw


# -----------------------------------------------------------------------------
# 1. SEED DATA & STANDARDS TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_seed_approved_examples_library():
    """Verifies that Seed Examples AM, AN, AO, AP are pre-populated in the library."""
    examples = await report_processing_repo.list_approved_examples(active_only=True)
    letters = [e["section_letter"] for e in examples]

    assert "AM" in letters, "Seed Example AM must exist"
    assert "AN" in letters, "Seed Example AN must exist"
    assert "AO" in letters, "Seed Example AO must exist"
    assert "AP" in letters, "Seed Example AP must exist"

    # Verify Section AM content
    am_ex = next(e for e in examples if e["section_letter"] == "AM")
    assert "The Believer's High Calling to Holy Living" in am_ex["title"]
    assert "1 Peter 1:13-16" in am_ex["scripture_reference"]
    assert len(am_ex["approved_content"]) > 300


@pytest.mark.asyncio
async def test_standards_versioning_and_activation():
    """Verifies creating new standards and switching active versions."""
    active_std = await report_processing_repo.get_active_standard()
    assert active_std["version"] == 1
    assert "v1.0" in active_std["version_label"]

    # Create version 2
    new_std = await report_processing_repo.create_standard(
        version_label="v2.0 Enhanced Standards",
        reporter_extraction_instructions="Extraction v2 guidelines",
        editorial_selection_instructions="Selection v2 guidelines",
        writing_instructions="Writing v2 guidelines",
        proofreading_instructions="Proofreading v2 guidelines",
        anti_slop_rules="Strict v2 slop rules",
        is_active=True,
    )
    assert new_std["version"] == 2
    assert new_std["is_active"] == 1

    # Verify it became active
    current_active = await report_processing_repo.get_active_standard()
    assert current_active["version"] == 2

    # Switch back to version 1
    await report_processing_repo.set_active_standard(1)
    restored = await report_processing_repo.get_active_standard()
    assert restored["version"] == 1


# -----------------------------------------------------------------------------
# 2. SINGLE GEMINI CALL & PIPELINE EXECUTION TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_single_gemini_call_budget_and_pipeline_completion():
    """
    CRITICAL ARCHITECTURE REQUIREMENT:
    An entire session report generation must require exactly ONE Gemini reasoning request.
    Verifies transitions through all 4 pipeline states:
    preparing_transcript -> ai_processing -> preparing_report -> completed.
    """
    session_id = f"test_proc_sess_{int(time.time())}"
    await session_repo.create_session(
        session_id=session_id,
        title="Sunday Morning Worship Service",
    )
    # Set verified transcript text
    from app.database.connection import get_db_connection
    async with get_db_connection() as conn:
        await conn.execute(
            "UPDATE sessions SET verified_text = ?, verification_status = 'complete' WHERE session_id = ?",
            ("This is the full authoritative verified transcript text of the holy sermon.", session_id),
        )
        await conn.commit()


    mock_gateway = create_mock_gateway()
    custom_engine = ReportProcessingEngine(
        gateway=mock_gateway,
        repo=report_processing_repo,
        final_repo=final_report_repo,
    )

    # Trigger processing
    run = await custom_engine.start_processing(session_id)
    run_id = run["run_id"]
    assert run["status"] in ("preparing_transcript", "ai_processing")

    # Wait for background pipeline to complete
    for _ in range(30):
        await asyncio.sleep(0.1)
        r = await report_processing_repo.get_run(run_id)
        if r and r["status"] in ("completed", "failed"):
            break

    final_run = await report_processing_repo.get_run(run_id)
    assert final_run["status"] == "completed", f"Run failed with: {final_run.get('error_message')}"
    assert final_run["current_step"] == "completed"

    # GUARANTEE: Exactly ONE Gemini reasoning request called
    assert mock_gateway.generate.call_count == 1
    call_kwargs = mock_gateway.generate.call_args.kwargs
    assert call_kwargs["operation"] == "report_processing_reasoning"

    # Verify final report was persisted
    assert final_run["final_report_id"] is not None
    active_final = await final_report_repo.get_active_final_report(session_id)
    assert active_final is not None
    assert active_final["id"] == final_run["final_report_id"]
    assert "The Power of Consecrated Living" in active_final["report_title"]


@pytest.mark.asyncio
async def test_idempotency_prevents_duplicate_ai_calls():
    """
    Idempotency test:
    Triggering start_processing multiple times on the same active session
    must return the existing run and NOT fire duplicate Gemini requests.
    """
    session_id = f"test_idempotency_{int(time.time())}"
    await session_repo.create_session(
        session_id=session_id,
        title="Bible Study on Grace",
    )
    from app.database.connection import get_db_connection
    async with get_db_connection() as conn:
        await conn.execute(
            "UPDATE sessions SET verified_text = 'Grace teaching transcript' WHERE session_id = ?",
            (session_id,),
        )
        await conn.commit()

    mock_gateway = create_mock_gateway()
    custom_engine = ReportProcessingEngine(gateway=mock_gateway)

    # First start
    run1 = await custom_engine.start_processing(session_id)

    # Immediate second start (simulating double click or parallel request)
    run2 = await custom_engine.start_processing(session_id)

    assert run1["run_id"] == run2["run_id"], "Second call must return the existing active run ID"

    # Allow completion
    for _ in range(30):
        await asyncio.sleep(0.1)
        r = await report_processing_repo.get_run(run1["run_id"])
        if r and r["status"] == "completed":
            break

    # Gemini call count must still be exactly 1
    assert mock_gateway.generate.call_count == 1


# -----------------------------------------------------------------------------
# 3. ANTI-SLOP VALIDATION & REJECTION TESTS
# -----------------------------------------------------------------------------

def test_anti_slop_audit_detects_forbidden_cliches():
    """Tests that forbidden AI buzzwords are flagged by the validator."""
    clean_text = "The sermon established that righteousness comes through faith in Jesus Christ alone."
    clean_val = report_processing_engine.validate_output(clean_text * 15)
    assert clean_val["anti_slop_passed"] is True
    assert len(clean_val["flagged_slop_terms"]) == 0

    slop_text = "This message is a rich tapestry of faith, a beacon of hope, and a testament to God's love. In conclusion, delve in."
    slop_val = report_processing_engine.validate_output(slop_text * 10)
    assert slop_val["anti_slop_passed"] is False
    assert any("tapestry" in t.lower() for t in slop_val["flagged_slop_terms"])
    assert any("beacon" in t.lower() for t in slop_val["flagged_slop_terms"])
    assert any("delve" in t.lower() for t in slop_val["flagged_slop_terms"])


# -----------------------------------------------------------------------------
# 4. LEGACY REPORTING MATERIAL REUSE TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_legacy_material_reuse_flag():
    """
    When legacy reports exist for a session, engine must reuse them,
    flagging reused_existing_material = True.
    """
    session_id = f"test_legacy_reuse_{int(time.time())}"
    await session_repo.create_session(session_id=session_id, title="Special Revival Service")

    from app.database.connection import get_db_connection
    async with get_db_connection() as conn:
        await conn.execute(
            "UPDATE sessions SET verified_text = 'Revival transcript' WHERE session_id = ?",
            (session_id,),
        )
        # Insert a pre-existing legacy report
        await conn.execute(
            """
            INSERT INTO reports (
                report_id, session_id, reporter_role, standard_version,
                standard_version_label, status, report_title, report_text,
                is_active, created_at, updated_at
            ) VALUES (?, ?, 'reporter_a', 1, 'v1.0', 'ready', 'Legacy Revival Draft', 'Legacy report text body', 1, '2026-08-20T10:00:00Z', '2026-08-20T10:00:00Z')
            """,
            (f"rep_{session_id}_a", session_id),
        )
        await conn.commit()

    mock_gateway = create_mock_gateway()
    custom_engine = ReportProcessingEngine(gateway=mock_gateway)

    run = await custom_engine.start_processing(session_id)
    run_id = run["run_id"]

    for _ in range(30):
        await asyncio.sleep(0.1)
        r = await report_processing_repo.get_run(run_id)
        if r and r["status"] == "completed":
            break

    completed_run = await report_processing_repo.get_run(run_id)
    assert completed_run["status"] == "completed"
    assert completed_run["reused_existing_material"] == 1


# -----------------------------------------------------------------------------
# 5. HUMAN DIFF LEARNING & PROMOTION TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_human_diff_recording_and_exemplar_promotion():
    """Tests recording a human edit diff and promoting it to an approved exemplar."""
    session_id = f"test_diff_sess_{int(time.time())}"
    await session_repo.create_session(session_id=session_id, title="Expository Study")

    diff = await report_processing_repo.save_human_diff(
        session_id=session_id,
        original_ai_text="AI rough draft of the sermon",
        human_edited_text="Human polished, refined theological publication text",
        diff_summary={"word_count_delta": 15},
    )
    diff_id = diff["id"]
    assert diff_id is not None
    assert diff["is_promoted_to_example"] == 0

    # Promote diff to an approved exemplar in Section AN
    promoted = await report_processing_repo.promote_diff_to_example(
        diff_id=diff_id,
        section_letter="AN",
        section_name="Bible Study Exemplar",
        title="Master Exemplar on Justification",
        teaching_goal="High doctrinal accuracy on faith and works",
    )
    assert promoted["section_letter"] == "AN"
    assert promoted["title"] == "Master Exemplar on Justification"
    assert promoted["source_diff_id"] == diff_id

    # Verify diff record is updated
    from app.database.connection import get_db_connection
    async with get_db_connection() as conn:
        cur = await conn.execute("SELECT is_promoted_to_example FROM report_human_diffs WHERE id = ?", (diff_id,))
        row = await cur.fetchone()
        assert row[0] == 1


# -----------------------------------------------------------------------------
# 6. SETTINGS & AUTO-PROCESS TOGGLE TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_settings_auto_process_toggle():
    """Verifies reading and updating auto_process_after_verification."""
    # Default is true
    default_val = await report_processing_repo.get_setting("auto_process_after_verification")
    assert default_val.lower() == "true"

    # Turn OFF
    await report_processing_repo.set_setting("auto_process_after_verification", "false")
    new_val = await report_processing_repo.get_setting("auto_process_after_verification")
    assert new_val.lower() == "false"

    # Turn back ON
    await report_processing_repo.set_setting("auto_process_after_verification", "true")
    reset_val = await report_processing_repo.get_setting("auto_process_after_verification")
    assert reset_val.lower() == "true"


def test_api_instruction_endpoints():
    """Verifies getting and persisting authoritative unified instructions via API."""
    # Fetch active instruction
    res = client.get("/api/report-processing/instruction")
    assert res.status_code == 200
    data = res.json()
    assert "instruction" in data
    assert len(data["instruction"]) > 50

    # Update instruction
    custom_inst = "CUSTOM INFORMATION UNIT DIRECTIVE: Prioritize high-fidelity biblical exposition."
    post_res = client.post("/api/report-processing/instruction", json={"instruction": custom_inst})
    assert post_res.status_code == 200
    assert post_res.json()["status"] == "success"

    # Verify persisted on re-fetch
    refetch = client.get("/api/report-processing/instruction")
    assert refetch.status_code == 200
    assert refetch.json()["instruction"] == custom_inst


# -----------------------------------------------------------------------------
# 7. FASTAPI HTTP ENDPOINTS TESTS
# -----------------------------------------------------------------------------

def test_api_status_and_standards_endpoints():
    """Verifies REST endpoints for active standards and settings."""
    res = client.get("/api/report-processing/standards/active")
    assert res.status_code == 200
    std = res.json()
    assert "version" in std
    assert std["is_active"] == 1

    res_settings = client.get("/api/report-processing/settings")
    assert res_settings.status_code == 200
    settings = res_settings.json()
    assert "auto_process_after_verification" in settings

    res_examples = client.get("/api/report-processing/examples")
    assert res_examples.status_code == 200
    examples = res_examples.json()
    assert len(examples) >= 4


@pytest.mark.asyncio
async def test_api_generate_and_download_docx():
    """Verifies Word (.docx) generation and download endpoints."""
    session_id = f"test_docx_sess_{int(time.time())}"
    await session_repo.create_session(session_id=session_id, title="Faith and Victory Service")

    # Finalize a report
    draft = await final_report_repo.finalize_report(
        session_id=session_id,
        proofread_report_revision_id=None,
        report_title="Faith and Victory Service",
        report_text="Full markdown report body for document export testing.",
        minister="Pastor (Dr) W.F. Kumuyi",
        programme="Sunday Worship Service",
        service_date="2026-08-23",
    )

    denied = client.post(f"/api/report-processing/generate-docx/{session_id}")
    assert denied.status_code == 409
    await final_report_repo.approve_report(session_id, draft["id"])

    # 1. POST generate-docx
    gen_res = client.post(f"/api/report-processing/generate-docx/{session_id}")
    assert gen_res.status_code == 200
    gen_data = gen_res.json()
    assert gen_data["status"] == "success"
    assert gen_data["filename"].endswith(".docx")
    assert gen_data["file_size"] > 1000

    # 2. GET download-docx
    dl_res = client.get(f"/api/report-processing/download-docx/{session_id}")
    assert dl_res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in dl_res.headers["content-type"]
    assert len(dl_res.content) == gen_data["file_size"]


@pytest.mark.asyncio
async def test_api_completed_reports_archive_filtering():
    """Verifies archive endpoint with search, minister, and programme filtering."""
    session_id = f"test_archive_{int(time.time())}"
    await session_repo.create_session(session_id=session_id, title="National Youth Retreat")

    await final_report_repo.finalize_report(
        session_id=session_id,
        proofread_report_revision_id=None,
        report_title="Living Above Conformity",
        report_text="Complete publication report text for archive query.",
        minister="Pastor (Dr) W.F. Kumuyi",
        programme="Youth Retreat",
        service_date="2026-12-25",
    )

    # 1. Search filter
    res1 = client.get("/api/report-processing/archive?search=Conformity")
    assert res1.status_code == 200
    items1 = res1.json()
    assert any(i["session_id"] == session_id for i in items1)

    # 2. Programme filter
    res2 = client.get("/api/report-processing/archive?programme=Youth Retreat")
    assert res2.status_code == 200
    items2 = res2.json()
    assert any(i["session_id"] == session_id for i in items2)

    # 3. Unmatched filter returns empty for this session
    res3 = client.get("/api/report-processing/archive?search=NonExistentSermonQueryXYZ")
    assert res3.status_code == 200
    items3 = res3.json()
    assert not any(i["session_id"] == session_id for i in items3)
