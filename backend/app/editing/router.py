"""
Editing API Router (Phase 7)

Provides endpoints for:
1. Editor AI status & configuration detection.
2. Editor Standards management & versioning.
3. Compiling Reporter A + Reporter B into an Edited Report.
4. Saving human manual edits & managing revision history.
5. Marking editing as complete for the next workflow stage.
"""

import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, status
from app.database.editing_repo import editing_repo
from app.database.reporting_repo import reporting_repo
from app.database.session_repo import session_repo
from app.services.editing_provider import gemini_editing_provider

router = APIRouter(prefix="/api/editing", tags=["AI Editing (Phase 7)"])


class EditorStandardCreateRequest(BaseModel):
    general_guidelines: str = Field(description="General editing standards and guidelines.")
    compilation_guidance: str = Field(description="Specific instructions for reconciling Reporter A and B.")
    terminology: str = Field(description="Church terminology and glossary.")
    approved_examples: str = Field(description="Approved reference finished report examples.")
    notes: Optional[str] = Field(default=None, description="Version change notes.")
    set_active: bool = Field(default=True, description="Whether to activate this new version immediately.")


class GenerateEditedReportRequest(BaseModel):
    standard_version: Optional[int] = Field(default=None, description="Optional specific editor standard version to use.")


class SaveManualEditRequest(BaseModel):
    report_text: str = Field(description="The updated markdown text of the edited report.")
    report_title: Optional[str] = Field(default=None, description="Optional updated title.")


@router.get("/status")
async def get_editing_status():
    """
    Returns the AI editing configuration state and active Editor Standard version.
    """
    try:
        active_std = await editing_repo.get_active_standard()
        active_ver = active_std.get("version_label", "v1")
    except Exception:
        active_ver = "v1"

    is_ready = gemini_editing_provider.is_configured()
    model_name = gemini_editing_provider.get_model_name()

    return {
        "configured": is_ready,
        "provider": gemini_editing_provider.get_provider_name(),
        "model": model_name,
        "active_standard_version": active_ver,
        "message": "AI Editing is ready." if is_ready else "AI Editing is not configured. GEMINI_API_KEY is not set.",
    }


# -----------------------------------------------------------------------------
# Editor Standards Endpoints
# -----------------------------------------------------------------------------

@router.get("/standards")
async def list_editor_standards():
    """Lists all versions of the Editor Standard ordered by version descending."""
    standards = await editing_repo.list_standards()
    return {"standards": standards}


@router.get("/standards/active")
async def get_active_editor_standard():
    """Returns the currently active Editor Standard."""
    standard = await editing_repo.get_active_standard()
    return {"standard": standard}


@router.get("/standards/{version}")
async def get_editor_standard_by_version(version: int):
    """Returns a specific version of the Editor Standard."""
    standard = await editing_repo.get_standard_by_version(version)
    if not standard:
        raise HTTPException(status_code=404, detail=f"Editor Standard version {version} not found.")
    return {"standard": standard}


@router.post("/standards")
async def create_editor_standard_version(payload: EditorStandardCreateRequest):
    """Creates a new incremented version of the Editor Standard, preserving previous versions."""
    new_std = await editing_repo.create_new_standard_version(
        general_guidelines=payload.general_guidelines,
        compilation_guidance=payload.compilation_guidance,
        terminology=payload.terminology,
        approved_examples=payload.approved_examples,
        notes=payload.notes,
        set_active=payload.set_active,
    )
    return {"status": "created", "standard": new_std}


@router.post("/standards/{version}/activate")
async def activate_editor_standard(version: int):
    """Sets a specific Editor Standard version as active."""
    activated = await editing_repo.activate_standard_version(version)
    if not activated:
        raise HTTPException(status_code=404, detail=f"Editor Standard version {version} not found.")
    return {"status": "activated", "standard": activated}


# -----------------------------------------------------------------------------
# Edited Report Generation, Retrieval & Human Editing Endpoints
# -----------------------------------------------------------------------------

@router.get("/sessions/{session_id}/report")
async def get_session_edited_report(session_id: str):
    """Returns the active edited report revision, revision history, and source availability for a session."""
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_rev = await editing_repo.get_active_edited_report(session_id)
    revisions = await editing_repo.list_revisions_for_session(session_id)
    active_reports = await reporting_repo.get_active_reports_for_session(session_id)

    rep_a = active_reports.get("reporter_a")
    rep_b = active_reports.get("reporter_b")
    has_verified = bool(session.get("verified_text") and session.get("verified_text").strip())
    has_rep_a = bool(rep_a and rep_a.get("status") == "ready")
    has_rep_b = bool(rep_b and rep_b.get("status") == "ready")

    can_edit = has_verified and has_rep_a and has_rep_b

    return {
        "session_id": session_id,
        "editing_status": session.get("editing_status", "not_started"),
        "editing_completed_at": session.get("editing_completed_at"),
        "active_revision": active_rev,
        "revisions_count": len(revisions),
        "revisions": revisions,
        "sources_available": {
            "verified_transcript": has_verified,
            "reporter_a": has_rep_a,
            "reporter_b": has_rep_b,
            "can_edit": can_edit,
        },
        "sources": {
            "verified_text": session.get("verified_text", ""),
            "reporter_a": rep_a,
            "reporter_b": rep_b,
        },
    }


@router.post("/sessions/{session_id}/generate")
async def generate_edited_report(session_id: str, payload: GenerateEditedReportRequest):
    """
    Synthesizes Reporter A, Reporter B, and Verified Transcript into a compiled Edited Report.
    Requires both Reporter drafts to be ready.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # 1. Require Verified Transcript
    verified_text = session.get("verified_text", "")
    if not verified_text or not verified_text.strip():
        raise HTTPException(
            status_code=400,
            detail="A human-verified transcript is required before editing can begin.",
        )

    # 2. Require Both Reporter Drafts
    active_reports = await reporting_repo.get_active_reports_for_session(session_id)
    rep_a = active_reports.get("reporter_a")
    rep_b = active_reports.get("reporter_b")

    if not rep_a or rep_a.get("status") != "ready" or not rep_b or rep_b.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Both Reporter drafts are required before Editing can begin.",
        )

    # 3. Check AI Configuration
    if not gemini_editing_provider.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Editing is not configured. Please set GEMINI_API_KEY in the backend environment.",
        )

    # 4. Load Editor Standard
    if payload.standard_version:
        standard = await editing_repo.get_standard_by_version(payload.standard_version)
        if not standard:
            raise HTTPException(status_code=404, detail=f"Editor Standard v{payload.standard_version} not found.")
    else:
        standard = await editing_repo.get_active_standard()

    # Mark session editing_status as 'generating'
    await editing_repo.set_editing_status(session_id, "generating")

    # 5. Check if prior revisions exist (to distinguish 'ai_generated' vs 'ai_regenerated')
    prior_revisions = await editing_repo.list_revisions_for_session(session_id)
    rev_source = "ai_regenerated" if len(prior_revisions) > 0 else "ai_generated"

    # 6. Execute AI Synthesis
    result = await gemini_editing_provider.generate_edited_report(
        session_metadata=session,
        verified_text=verified_text,
        reporter_a_report=rep_a,
        reporter_b_report=rep_b,
        standard=standard,
    )

    if not result.is_success:
        # If generation failed, restore previous editing status or set to failed
        prev_status = "in_review" if len(prior_revisions) > 0 else "failed"
        await editing_repo.set_editing_status(session_id, prev_status)
        status_code = 429 if "request limit" in (result.error_message or "").lower() else 500
        raise HTTPException(
            status_code=status_code,
            detail=result.error_message or "Editing generation could not be completed.",
        )

    # 7. Persist new revision in SQLite
    new_revision = await editing_repo.save_edited_report_revision(
        session_id=session_id,
        report_text=result.report_text,
        revision_source=rev_source,
        standard_version=result.standard_version,
        standard_version_label=result.standard_version_label,
        report_title=result.report_title,
        transcript_id=session.get("transcript_id"),
        reporter_a_id=rep_a.get("report_id"),
        reporter_b_id=rep_b.get("report_id"),
        review_notes=result.review_notes,
        source_uncertainties=result.source_uncertainties,
        model_name=result.model_name,
    )

    return {
        "status": "completed",
        "session_id": session_id,
        "editing_status": "draft_ready",
        "active_revision": new_revision,
    }


@router.post("/sessions/{session_id}/save")
async def save_manual_edit(session_id: str, payload: SaveManualEditRequest):
    """
    Saves a manual human edit as a new revision without overwriting prior revisions.
    Sets session status to 'in_review'.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    if not payload.report_text or not payload.report_text.strip():
        raise HTTPException(status_code=400, detail="Report text cannot be empty.")

    active_rev = await editing_repo.get_active_edited_report(session_id)
    active_reports = await reporting_repo.get_active_reports_for_session(session_id)
    standard = await editing_repo.get_active_standard()

    std_ver = active_rev.get("standard_version", standard.get("version", 1)) if active_rev else standard.get("version", 1)
    std_label = active_rev.get("standard_version_label", standard.get("version_label", "v1")) if active_rev else standard.get("version_label", "v1")
    title = payload.report_title or (active_rev.get("report_title") if active_rev else session.get("title", "Edited Message Report"))

    rep_a = active_reports.get("reporter_a")
    rep_b = active_reports.get("reporter_b")

    saved_revision = await editing_repo.save_edited_report_revision(
        session_id=session_id,
        report_text=payload.report_text,
        revision_source="human_edited",
        standard_version=std_ver,
        standard_version_label=std_label,
        report_title=title,
        transcript_id=session.get("transcript_id"),
        reporter_a_id=rep_a.get("report_id") if rep_a else None,
        reporter_b_id=rep_b.get("report_id") if rep_b else None,
        review_notes=active_rev.get("review_notes", []) if active_rev else [],
        source_uncertainties=active_rev.get("source_uncertainties", []) if active_rev else [],
        model_name=active_rev.get("model_name") if active_rev else None,
    )

    return {
        "status": "saved",
        "session_id": session_id,
        "editing_status": "in_review",
        "active_revision": saved_revision,
    }


@router.post("/sessions/{session_id}/revisions/{revision_id}/activate")
async def activate_revision(session_id: str, revision_id: str):
    """Restores/activates an earlier revision."""
    activated = await editing_repo.activate_revision(session_id, revision_id)
    if not activated:
        raise HTTPException(status_code=404, detail=f"Revision {revision_id} not found for this session.")
    return {"status": "activated", "active_revision": activated}


@router.post("/sessions/{session_id}/complete")
async def complete_editing(session_id: str):
    """
    Explicitly marks the Editing stage as complete.
    Prepares the session for Proofreading.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_rev = await editing_repo.get_active_edited_report(session_id)
    if not active_rev or not active_rev.get("report_text"):
        raise HTTPException(
            status_code=400,
            detail="A saved Edited Report is required before completing the Editing stage.",
        )

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    await editing_repo.set_editing_status(session_id, "complete", completed_at=now_iso)

    updated_session = await session_repo.get_session(session_id)
    return {
        "status": "complete",
        "session_id": session_id,
        "editing_status": "complete",
        "editing_completed_at": updated_session.get("editing_completed_at"),
        "message": "Editing completed successfully. Ready for Proofreading.",
    }


@router.get("/sessions/{session_id}/export-docx")
async def export_edited_report_docx(session_id: str):
    """
    Exports the CURRENT SAVED Edited Report as a downloadable Microsoft Word (.docx) file.
    Does NOT mark editing complete or alter workflow status.
    """
    from fastapi.responses import StreamingResponse
    from app.services.document_service import document_service

    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_rev = await editing_repo.get_active_edited_report(session_id)
    if not active_rev or not active_rev.get("report_text"):
        raise HTTPException(
            status_code=400,
            detail="No saved Edited Report found to export. Please compile or save an edited draft first.",
        )

    title = active_rev.get("report_title") or session.get("title", "Edited Message Report")
    programme = session.get("metadata", {}).get("programme") or session.get("programme")
    date_str = session.get("date_created") or session.get("created_at")

    filename = document_service.generate_filename(title, programme, date_str, suffix="Edited Draft")
    docx_stream = document_service.generate_edited_report_docx(
        report_title=title,
        report_text=active_rev["report_text"],
        session_metadata=session,
    )

    return StreamingResponse(
        docx_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )
