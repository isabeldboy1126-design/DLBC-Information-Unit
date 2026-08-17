"""
Reporting API Router (Phase 6)

Provides endpoints for:
1. Reporting AI status & configuration detection.
2. Reporting Standards management & versioning.
3. Generating, retrieving, and retrying independent Reporter A & B drafts.
"""

import asyncio
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, status
from app.database.reporting_repo import reporting_repo
from app.database.session_repo import session_repo
from app.services.reporting_provider import gemini_reporting_provider

router = APIRouter(prefix="/api/reporting", tags=["AI Reporting (Phase 6)"])


class StandardCreateRequest(BaseModel):
    general_guidelines: str = Field(description="Main editable reporting guidelines.")
    reporter_a_instructions: str = Field(description="Role guidance for Reporter A.")
    reporter_b_instructions: str = Field(description="Role guidance for Reporter B.")
    terminology: str = Field(description="Church terminology and glossary.")
    examples: str = Field(description="Approved reference report examples.")
    notes: Optional[str] = Field(default=None, description="Version change notes.")
    set_active: bool = Field(default=True, description="Whether to make this new version active immediately.")


class GenerateReportsRequest(BaseModel):
    role: str = Field(default="all", description="'all', 'reporter_a', or 'reporter_b'")
    standard_version: Optional[int] = Field(default=None, description="Optional specific standard version to use.")


@router.get("/status")
async def get_reporting_status():
    """
    Returns the AI reporting configuration state.
    Allows frontend to show 'AI Reporting is not configured' cleanly if GEMINI_API_KEY is unset.
    """
    try:
        active_std = await reporting_repo.get_active_standard()
        active_ver = active_std.get("version_label", "v1")
    except Exception:
        active_ver = "v1"

    is_ready = gemini_reporting_provider.is_configured()
    model_name = gemini_reporting_provider.get_model_name()

    return {
        "configured": is_ready,
        "provider": gemini_reporting_provider.get_provider_name(),
        "model": model_name,
        "active_standard_version": active_ver,
        "message": "AI Reporting is ready." if is_ready else "AI Reporting is not configured. GEMINI_API_KEY is not set.",
    }


# -----------------------------------------------------------------------------
# Reporting Standards Endpoints
# -----------------------------------------------------------------------------

@router.get("/standards")
async def list_standards():
    """Lists all versions of the Reporting Standard ordered by version descending."""
    standards = await reporting_repo.list_standards()
    return {"standards": standards}


@router.get("/standards/active")
async def get_active_standard():
    """Returns the currently active Reporting Standard."""
    standard = await reporting_repo.get_active_standard()
    return {"standard": standard}


@router.get("/standards/{version}")
async def get_standard_by_version(version: int):
    """Returns a specific version of the Reporting Standard."""
    standard = await reporting_repo.get_standard_by_version(version)
    if not standard:
        raise HTTPException(status_code=404, detail=f"Reporting Standard version {version} not found.")
    return {"standard": standard}


@router.post("/standards")
async def create_standard_version(payload: StandardCreateRequest):
    """Creates a new incremented version of the Reporting Standard, preserving previous versions."""
    new_std = await reporting_repo.create_new_standard_version(
        general_guidelines=payload.general_guidelines,
        reporter_a_instructions=payload.reporter_a_instructions,
        reporter_b_instructions=payload.reporter_b_instructions,
        terminology=payload.terminology,
        examples=payload.examples,
        notes=payload.notes,
        set_active=payload.set_active,
    )
    return {"status": "created", "standard": new_std}


@router.post("/standards/{version}/activate")
async def activate_standard(version: int):
    """Sets a specific Reporting Standard version as the active version."""
    activated = await reporting_repo.activate_standard_version(version)
    if not activated:
        raise HTTPException(status_code=404, detail=f"Reporting Standard version {version} not found.")
    return {"status": "activated", "standard": activated}


# -----------------------------------------------------------------------------
# Reports Generation & Retrieval Endpoints
# -----------------------------------------------------------------------------

@router.get("/sessions/{session_id}/reports")
async def get_session_reports(session_id: str):
    """Returns active reports (Reporter A & B) and full history for a given session."""
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_reports = await reporting_repo.get_active_reports_for_session(session_id)
    history = await reporting_repo.list_reports_history_for_session(session_id)

    return {
        "session_id": session_id,
        "reporting_status": session.get("reporting_status", "not_started"),
        "reporting_completed_at": session.get("reporting_completed_at"),
        "reporter_a": active_reports.get("reporter_a"),
        "reporter_b": active_reports.get("reporter_b"),
        "history_count": len(history),
        "history": history,
    }


@router.post("/sessions/{session_id}/generate")
async def generate_reports(session_id: str, payload: GenerateReportsRequest):
    """
    Generates independent report drafts for Reporter A and/or Reporter B
    using the Verified Transcript as the source of truth.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # 1. Require Verified Transcript
    verified_text = session.get("verified_text", "")
    if not verified_text or not verified_text.strip():
        # Fallback: check if segments can construct raw text or if verification is incomplete
        if session.get("raw_text"):
            # If verification wasn't completed, advise completing verification first
            raise HTTPException(
                status_code=400,
                detail="A Verified Transcript is required before generating reports. Please complete verification first.",
            )
        else:
            raise HTTPException(status_code=400, detail="No transcript found for this session.")

    # 2. Check AI Configuration
    if not gemini_reporting_provider.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Reporting is not configured. Please set GEMINI_API_KEY in the backend environment.",
        )

    # 3. Load Reporting Standard
    if payload.standard_version:
        standard = await reporting_repo.get_standard_by_version(payload.standard_version)
        if not standard:
            raise HTTPException(status_code=404, detail=f"Reporting Standard v{payload.standard_version} not found.")
    else:
        standard = await reporting_repo.get_active_standard()

    role_param = payload.role.lower().strip()
    roles_to_run = []
    if role_param in ("all", "both"):
        roles_to_run = ["reporter_a", "reporter_b"]
    elif role_param in ("reporter_a", "reporter_b"):
        roles_to_run = [role_param]
    else:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'all', 'reporter_a', or 'reporter_b'.")

    # Mark roles as generating in the database first
    for r in roles_to_run:
        await reporting_repo.save_report(
            session_id=session_id,
            reporter_role=r,
            standard_version=standard.get("version", 1),
            standard_version_label=standard.get("version_label", "v1"),
            status="generating",
            transcript_id=session.get("transcript_id"),
            model_name=gemini_reporting_provider.get_model_name(),
        )

    # 4. Execute AI Generation (concurrently if both roles)
    async def run_single_reporter(role: str):
        result = await gemini_reporting_provider.generate_report(
            reporter_role=role,
            session_metadata=session,
            verified_text=verified_text,
            standard=standard,
        )
        # Persist outcome
        await reporting_repo.save_report(
            session_id=session_id,
            reporter_role=role,
            standard_version=result.standard_version,
            standard_version_label=result.standard_version_label,
            status="ready" if result.is_success else "failed",
            report_title=result.report_title if result.is_success else None,
            report_text=result.report_text if result.is_success else None,
            transcript_id=session.get("transcript_id"),
            key_points=result.key_points,
            scriptures=result.scriptures,
            warnings=result.warnings,
            evidence_metadata=result.evidence_metadata,
            model_name=result.model_name,
            error_message=result.error_message,
        )
        return result

    results = await asyncio.gather(*(run_single_reporter(r) for r in roles_to_run), return_exceptions=True)

    # 5. Return updated reports
    active_reports = await reporting_repo.get_active_reports_for_session(session_id)
    current_session = await session_repo.get_session(session_id)

    return {
        "status": "completed",
        "session_id": session_id,
        "reporting_status": current_session.get("reporting_status", "not_started"),
        "reporter_a": active_reports.get("reporter_a"),
        "reporter_b": active_reports.get("reporter_b"),
    }


@router.post("/sessions/{session_id}/retry/{reporter_role}")
async def retry_single_reporter(session_id: str, reporter_role: str):
    """Retries generation for a single reporter role without overwriting the other."""
    role = reporter_role.lower().strip()
    if role not in ("reporter_a", "reporter_b"):
        raise HTTPException(status_code=400, detail="Invalid reporter role. Must be 'reporter_a' or 'reporter_b'.")

    return await generate_reports(session_id, GenerateReportsRequest(role=role))
