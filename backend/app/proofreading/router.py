"""
Proofreading API Router (Phase 8)

Provides endpoints for:
1. AI proofreading status & configuration.
2. Proofreading Standards management & versioning.
3. Running conservative AI proofreading on the Edited Report.
4. Saving manual adjustments to the proofread report as new revisions.
5. Accepting the proofread version and finalizing Phase 8.
6. Restoring past proofread revisions.
"""

import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, status
from app.database.proofreading_repo import proofreading_repo
from app.database.editing_repo import editing_repo
from app.database.session_repo import session_repo
from app.services.proofreading_provider import gemini_proofreading_provider

router = APIRouter(prefix="/api/proofreading", tags=["AI Proofreading (Phase 8)"])


class ProofreadingStandardCreateRequest(BaseModel):
    guidelines: str = Field(description="General proofreading guidelines.")
    terminology: str = Field(description="Church terminology and reverence capitalization.")
    formatting_rules: str = Field(description="Scripture reference citation and formatting rules.")
    notes: Optional[str] = Field(default=None, description="Version change notes.")
    set_active: bool = Field(default=True, description="Whether to activate this new version immediately.")


class RunProofreadRequest(BaseModel):
    standard_version: Optional[int] = Field(default=None, description="Optional specific proofreading standard version to use.")


class SaveManualProofreadRequest(BaseModel):
    proofread_text: str = Field(description="The updated markdown text of the proofread report.")
    proofread_title: Optional[str] = Field(default=None, description="Optional updated title.")


class AcceptProofreadRequest(BaseModel):
    revision_id: Optional[str] = Field(default=None, description="Optional specific revision ID to accept. Defaults to active revision.")


@router.get("/status")
async def get_proofreading_status():
    """
    Returns AI proofreading configuration state and active Proofreading Standard version.
    """
    try:
        active_std = await proofreading_repo.get_active_standard()
        active_ver = active_std.get("version_label", "v1")
    except Exception:
        active_ver = "v1"

    is_ready = gemini_proofreading_provider.is_configured()
    model_name = gemini_proofreading_provider.get_model_name()

    return {
        "configured": is_ready,
        "provider": gemini_proofreading_provider.get_provider_name(),
        "model": model_name,
        "active_standard_version": active_ver,
        "message": "AI Proofreading is ready." if is_ready else "AI Proofreading is not configured. GEMINI_API_KEY is not set.",
    }


# -----------------------------------------------------------------------------
# Proofreading Standards Endpoints
# -----------------------------------------------------------------------------

@router.get("/standards")
async def list_proofreading_standards():
    """Lists all versions of the Proofreading Standard ordered by version descending."""
    standards = await proofreading_repo.list_standards()
    return {"standards": standards}


@router.get("/standards/active")
async def get_active_proofreading_standard():
    """Returns the currently active Proofreading Standard."""
    standard = await proofreading_repo.get_active_standard()
    return {"standard": standard}


@router.get("/standards/{version}")
async def get_proofreading_standard_by_version(version: int):
    """Returns a specific version of the Proofreading Standard."""
    standard = await proofreading_repo.get_standard_by_version(version)
    if not standard:
        raise HTTPException(status_code=404, detail=f"Proofreading Standard version {version} not found.")
    return {"standard": standard}


@router.post("/standards")
async def create_proofreading_standard_version(payload: ProofreadingStandardCreateRequest):
    """Creates a new incremented version of the Proofreading Standard, preserving previous versions."""
    new_std = await proofreading_repo.create_new_standard_version(
        guidelines=payload.guidelines,
        terminology=payload.terminology,
        formatting_rules=payload.formatting_rules,
        notes=payload.notes,
        set_active=payload.set_active,
    )
    return {"status": "created", "standard": new_std}


@router.post("/standards/{version}/activate")
async def activate_proofreading_standard(version: int):
    """Sets a specific Proofreading Standard version as active."""
    activated = await proofreading_repo.activate_standard_version(version)
    if not activated:
        raise HTTPException(status_code=404, detail=f"Proofreading Standard version {version} not found.")
    return {"status": "activated", "standard": activated}


# -----------------------------------------------------------------------------
# Proofread Report Generation, Retrieval & Review Endpoints
# -----------------------------------------------------------------------------

@router.get("/sessions/{session_id}/report")
async def get_session_proofread_report(session_id: str):
    """
    Returns the source Edited Report, active proofread revision, revision history, and session status.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_edited_report = await editing_repo.get_active_edited_report(session_id)
    active_proofread_rev = await proofreading_repo.get_active_proofread_report(session_id)
    revisions = await proofreading_repo.list_revisions_for_session(session_id)

    has_edited_report = bool(active_edited_report and active_edited_report.get("report_text"))

    return {
        "session_id": session_id,
        "proofreading_status": session.get("proofreading_status", "not_started"),
        "proofreading_completed_at": session.get("proofreading_completed_at"),
        "accepted_proofread_revision_id": session.get("accepted_proofread_revision_id"),
        "can_proofread": has_edited_report,
        "source_edited_report": active_edited_report,
        "active_revision": active_proofread_rev,
        "revisions_count": len(revisions),
        "revisions": revisions,
    }


@router.post("/sessions/{session_id}/run")
async def run_proofreading(session_id: str, payload: RunProofreadRequest):
    """
    Runs conservative AI proofreading on the active Edited Report for a session.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # 1. Require active Edited Report
    active_edited = await editing_repo.get_active_edited_report(session_id)
    if not active_edited or not active_edited.get("report_text", "").strip():
        raise HTTPException(
            status_code=400,
            detail="A saved Edited Report is required before Proofreading can begin.",
        )

    # 2. Check AI configuration
    if not gemini_proofreading_provider.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Proofreading is not configured. Please set GEMINI_API_KEY in the backend environment.",
        )

    # 3. Load Proofreading Standard
    if payload.standard_version:
        standard = await proofreading_repo.get_standard_by_version(payload.standard_version)
        if not standard:
            raise HTTPException(status_code=404, detail=f"Proofreading Standard v{payload.standard_version} not found.")
    else:
        standard = await proofreading_repo.get_active_standard()

    # Mark status as generating
    await proofreading_repo.set_proofreading_status(session_id, "generating")

    # 4. Call Proofreading Provider
    result = await gemini_proofreading_provider.proofread_report(
        session_metadata=session,
        edited_report_text=active_edited["report_text"],
        edited_report_title=active_edited.get("report_title") or session.get("title", "Edited Message Report"),
        standard=standard,
    )

    if not result.is_success:
        await proofreading_repo.set_proofreading_status(session_id, "failed")
        raise HTTPException(
            status_code=500,
            detail=f"Proofreading could not be completed: {result.error_message}",
        )

    # 5. Save AI Proofread Revision
    new_revision = await proofreading_repo.save_proofread_revision(
        session_id=session_id,
        proofread_text=result.proofread_text,
        revision_source="ai_proofread",
        standard_version=result.standard_version,
        standard_version_label=result.standard_version_label,
        proofread_title=result.proofread_title,
        edited_report_revision_id=active_edited.get("revision_id"),
        changes=result.changes,
        review_notes=result.review_notes,
        model_name=result.model_name,
        is_accepted=False,
    )

    return {
        "status": "completed",
        "session_id": session_id,
        "proofreading_status": "ready_for_review",
        "active_revision": new_revision,
    }


@router.post("/sessions/{session_id}/save")
async def save_manual_proofread_adjustments(session_id: str, payload: SaveManualProofreadRequest):
    """
    Saves human manual edits to the proofread text as a new revision without overwriting earlier revisions.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    if not payload.proofread_text or not payload.proofread_text.strip():
        raise HTTPException(status_code=400, detail="Proofread text cannot be empty.")

    active_rev = await proofreading_repo.get_active_proofread_report(session_id)
    active_edited = await editing_repo.get_active_edited_report(session_id)
    standard = await proofreading_repo.get_active_standard()

    std_ver = active_rev.get("standard_version", standard.get("version", 1)) if active_rev else standard.get("version", 1)
    std_label = active_rev.get("standard_version_label", standard.get("version_label", "v1")) if active_rev else standard.get("version_label", "v1")
    title = payload.proofread_title or (active_rev.get("proofread_title") if active_rev else "Proofread Message Report")

    saved_revision = await proofreading_repo.save_proofread_revision(
        session_id=session_id,
        proofread_text=payload.proofread_text,
        revision_source="human_reviewed",
        standard_version=std_ver,
        standard_version_label=std_label,
        proofread_title=title,
        edited_report_revision_id=active_edited.get("revision_id") if active_edited else None,
        changes=active_rev.get("changes", []) if active_rev else [],
        review_notes=active_rev.get("review_notes", []) if active_rev else [],
        model_name=active_rev.get("model_name") if active_rev else None,
        is_accepted=False,
    )

    return {
        "status": "saved",
        "session_id": session_id,
        "proofreading_status": "ready_for_review",
        "active_revision": saved_revision,
    }


@router.post("/sessions/{session_id}/accept")
async def accept_proofread_report(session_id: str, payload: Optional[AcceptProofreadRequest] = None):
    """
    Accepts the active or specified proofread revision.
    Marks Proofreading as complete and prepares the session for Final Report (Phase 9).
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    rev_id = payload.revision_id if (payload and payload.revision_id) else None
    if not rev_id:
        active_rev = await proofreading_repo.get_active_proofread_report(session_id)
        if not active_rev:
            raise HTTPException(
                status_code=400,
                detail="No proofread report found to accept. Please run Proofread first.",
            )
        rev_id = active_rev["revision_id"]

    accepted = await proofreading_repo.accept_revision(session_id, rev_id)
    if not accepted:
        raise HTTPException(status_code=404, detail=f"Revision {rev_id} could not be accepted.")

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    await proofreading_repo.set_proofreading_status(
        session_id=session_id,
        new_status="complete",
        completed_at=now_iso,
        accepted_rev_id=rev_id,
    )

    return {
        "status": "complete",
        "session_id": session_id,
        "proofreading_status": "complete",
        "accepted_revision_id": rev_id,
        "accepted_revision": accepted,
        "message": "Proofreading accepted successfully. Ready for Final Report.",
    }


@router.post("/sessions/{session_id}/revisions/{revision_id}/activate")
async def activate_proofread_revision(session_id: str, revision_id: str):
    """Restores/activates an earlier proofread revision."""
    activated = await proofreading_repo.activate_revision(session_id, revision_id)
    if not activated:
        raise HTTPException(status_code=404, detail=f"Revision {revision_id} not found for this session.")
    return {"status": "activated", "active_revision": activated}
