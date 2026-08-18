"""
Final Report & Downloadable Document API Router (Phase 9)

Provides endpoints for:
1. Finalizing report from approved Proofread Report.
2. Retrieving Final Report details, status, and revision history.
3. Saving human manual revisions to the Final Report without overwriting earlier ones.
4. Downloading the formatted Microsoft Word (.docx) document.
5. Restoring past Final Report revisions.
"""

from typing import Any, Dict, List, Optional
import urllib.parse
from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.database.session_repo import session_repo
from app.database.proofreading_repo import proofreading_repo
from app.database.final_report_repo import final_report_repo
from app.services.document_service import document_service

router = APIRouter(prefix="/api/final-report", tags=["Final Report & Document Export (Phase 9)"])


class FinalizeReportRequest(BaseModel):
    proofread_revision_id: Optional[str] = Field(default=None, description="Optional specific proofread revision to finalize. Defaults to active revision.")
    report_title: Optional[str] = Field(default=None, description="Optional custom final title override.")


class SaveFinalReportRevisionRequest(BaseModel):
    report_text: str = Field(description="The updated text of the final report.")
    report_title: Optional[str] = Field(default=None, description="Optional updated title.")


@router.get("/sessions/{session_id}")
async def get_session_final_report(session_id: str):
    """
    Returns the active Final Report, revision history, and readiness status for a session.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_final = await final_report_repo.get_active_final_report(session_id)
    revisions = await final_report_repo.list_revisions_for_session(session_id) if hasattr(final_report_repo, "list_revisions_for_session") else await final_report_repo.list_final_report_revisions(session_id)
    active_proofread = await proofreading_repo.get_active_proofread_report(session_id)

    # Can finalize if an active proofread report exists
    has_proofread = bool(active_proofread and active_proofread.get("proofread_text"))
    p_status = session.get("proofreading_status", "not_started")

    # Generate safe filename preview
    title = active_final.get("report_title") if active_final else (active_proofread.get("proofread_title") if active_proofread else session.get("title"))
    programme = session.get("metadata", {}).get("programme") or session.get("programme")
    date_str = session.get("date_created")
    suggested_filename = document_service.generate_filename(title, programme, date_str)

    return {
        "session_id": session_id,
        "final_report_status": session.get("final_report_status", "not_started"),
        "final_report_completed_at": session.get("final_report_completed_at"),
        "can_finalize": has_proofread,
        "active_final_report": active_final,
        "revisions_count": len(revisions),
        "revisions": revisions,
        "source_proofread_report": active_proofread,
        "suggested_docx_filename": suggested_filename,
    }


@router.post("/sessions/{session_id}/finalize")
async def finalize_session_report(session_id: str, payload: Optional[FinalizeReportRequest] = None):
    """
    Derives and saves the Final Report from the human-approved Proofread Report.
    Generates DOCX metadata and marks session as workflow complete.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # 1. Retrieve the source Proofread Report
    rev_id = payload.proofread_revision_id if (payload and payload.proofread_revision_id) else None
    if rev_id:
        source_proofread = await proofreading_repo.get_revision_by_id(rev_id)
    else:
        source_proofread = await proofreading_repo.get_active_proofread_report(session_id)

    if not source_proofread or not source_proofread.get("proofread_text", "").strip():
        raise HTTPException(
            status_code=400,
            detail="An approved Proofread Report is required before the Final Report can be generated.",
        )

    # 2. Extract metadata
    speaker = session.get("metadata", {}).get("speaker") or session.get("speaker") or "Pastor W.F. Kumuyi"
    programme = session.get("metadata", {}).get("programme") or session.get("programme") or "Deeper Life Bible Church Service"
    date_str = session.get("date_created") or session.get("created_at")

    final_title = (payload.report_title if (payload and payload.report_title) else None) or source_proofread.get("proofread_title") or session.get("title", "Message Report")
    final_text = source_proofread["proofread_text"]

    # 3. Calculate DOCX filename and byte size
    filename = document_service.generate_filename(final_title, programme, date_str)
    docx_stream = document_service.generate_final_report_docx(
        report_title=final_title,
        report_text=final_text,
        session_metadata=session,
    )
    docx_bytes = docx_stream.getvalue()
    file_size = len(docx_bytes)

    # 4. Save Final Report record in repository
    final_report = await final_report_repo.finalize_report(
        session_id=session_id,
        proofread_report_revision_id=source_proofread.get("revision_id"),
        report_title=final_title,
        report_text=final_text,
        minister=speaker,
        programme=programme,
        service_date=date_str,
        docx_filename=filename,
        docx_file_size=file_size,
    )

    return {
        "status": "complete",
        "session_id": session_id,
        "final_report_status": "complete",
        "final_report": final_report,
        "download_filename": filename,
    }


@router.post("/sessions/{session_id}/save-revision")
async def save_final_report_revision(session_id: str, payload: SaveFinalReportRevisionRequest):
    """
    Saves a human manual adjustment to the Final Report as a new revision without overwriting earlier ones.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    if not payload.report_text or not payload.report_text.strip():
        raise HTTPException(status_code=400, detail="Final report text cannot be empty.")

    active_final = await final_report_repo.get_active_final_report(session_id)
    title = payload.report_title or (active_final.get("report_title") if active_final else session.get("title", "Message Report"))
    speaker = session.get("metadata", {}).get("speaker") or session.get("speaker") or "Pastor W.F. Kumuyi"
    programme = session.get("metadata", {}).get("programme") or session.get("programme") or "Deeper Life Bible Church Service"
    date_str = session.get("date_created") or session.get("created_at")

    # Generate updated DOCX size
    filename = document_service.generate_filename(title, programme, date_str)
    docx_stream = document_service.generate_final_report_docx(
        report_title=title,
        report_text=payload.report_text,
        session_metadata=session,
    )
    docx_bytes = docx_stream.getvalue()
    file_size = len(docx_bytes)

    saved_rev = await final_report_repo.save_final_report_revision(
        session_id=session_id,
        report_title=title,
        report_text=payload.report_text,
        minister=speaker,
        programme=programme,
        service_date=date_str,
        docx_filename=filename,
        docx_file_size=file_size,
    )

    return {
        "status": "saved",
        "session_id": session_id,
        "final_report": saved_rev,
    }


@router.get("/sessions/{session_id}/download")
async def download_final_report_docx(session_id: str):
    """
    Generates and streams the downloadable Microsoft Word (.docx) file for the active Final Report.
    """
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    active_final = await final_report_repo.get_active_final_report(session_id)
    if not active_final or not active_final.get("report_text"):
        raise HTTPException(
            status_code=404,
            detail="No finalized report found for this session. Please finalize the report first.",
        )

    programme = session.get("metadata", {}).get("programme") or session.get("programme")
    date_str = session.get("date_created") or session.get("created_at")
    raw_filename = active_final.get("docx_filename") or document_service.generate_filename(active_final["report_title"], programme, date_str)
    filename = document_service.sanitize_filename(raw_filename.replace('.docx', '')) + '.docx'

    # Generate fresh stream from exact saved report text
    docx_stream = document_service.generate_final_report_docx(
        report_title=active_final["report_title"],
        report_text=active_final["report_text"],
        session_metadata=session,
    )

    encoded_filename = urllib.parse.quote(filename)
    ascii_filename = filename.encode("ascii", "replace").decode("ascii").replace('"', '')

    return StreamingResponse(
        docx_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}',
            "Cache-Control": "no-cache",
        },
    )


@router.post("/sessions/{session_id}/revisions/{revision_id}/activate")
async def activate_final_report_revision(session_id: str, revision_id: str):
    """Restores an earlier Final Report revision."""
    activated = await final_report_repo.activate_final_report_revision(session_id, revision_id)
    if not activated:
        raise HTTPException(status_code=404, detail=f"Final report revision {revision_id} not found.")
    return {"status": "activated", "active_final_report": activated}
