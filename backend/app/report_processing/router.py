"""
Report Processing Router (Stage 7)

FastAPI router exposing:
- Pipeline execution: /start, /status/{session_id}, /cancel/{run_id}, /result/{run_id}
- Document export: /generate-docx/{session_id}, /download-docx/{session_id}
- Archive: /archive (Completed Reports Archive)
- Standards & Instructions: /standards, /standards/active, /standards/activate/{version}
- Approved Examples Library: /examples
- Human Learning Diffs: /diffs, /diffs/{diff_id}/promote
- Configuration Settings: /settings
- Live Compiled Prompt Preview: /prompt-preview/{session_id}
"""

import io
import json
import logging
import os
import urllib.parse
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.auth.auth_context import AuthContext
from app.auth.dependencies import get_optional_account, require_account
from app.config import STORAGE_DOCUMENTS_DIR
from app.database.final_report_repo import final_report_repo
from app.database.report_processing_repo import report_processing_repo
from app.database.session_repo import session_repo
from app.report_processing.engine import report_processing_engine
from app.services.document_service import document_service

logger = logging.getLogger("app.report_processing.router")

router = APIRouter(prefix="/api/report-processing", tags=["Report Processing"])


# -----------------------------------------------------------------------------
# PYDANTIC SCHEMAS
# -----------------------------------------------------------------------------

class StartProcessingRequest(BaseModel):
    session_id: str
    force_new: bool = False


class SettingUpdateRequest(BaseModel):
    key: str
    value: str


class InstructionUpdateRequest(BaseModel):
    instruction: Optional[str] = None
    unified_instructions: Optional[str] = None


class StandardCreateRequest(BaseModel):
    version_label: str
    reporter_extraction_instructions: str
    editorial_selection_instructions: str
    writing_instructions: str
    proofreading_instructions: str
    anti_slop_rules: str
    is_active: bool = True


class ExampleCreateRequest(BaseModel):
    section_letter: str
    section_name: str
    title: str
    approved_content: str
    theme: Optional[str] = None
    scripture_reference: Optional[str] = None
    minister: Optional[str] = None
    service_date: Optional[str] = None
    teaching_goal: Optional[str] = None
    editorial_focus: Optional[str] = None


class PromoteDiffRequest(BaseModel):
    section_letter: str
    section_name: str
    title: str
    teaching_goal: Optional[str] = None
    editorial_focus: Optional[str] = None


class HumanDiffCreateRequest(BaseModel):
    session_id: str
    original_ai_text: str
    human_edited_text: str
    run_id: Optional[str] = None
    diff_summary: Optional[Dict[str, Any]] = None


# -----------------------------------------------------------------------------
# CORE PIPELINE LIFECYCLE ENDPOINTS
# -----------------------------------------------------------------------------

@router.post("/start", response_model=Dict[str, Any])
async def start_report_processing(payload: StartProcessingRequest, auth: AuthContext = Depends(require_account)):
    """
    Initiates the unified report processing pipeline.
    Idempotent: if a run is already in progress for this session, reconnects to that active run.
    """
    session = await session_repo.get_session(payload.session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {payload.session_id} not found",
        )

    run = await report_processing_engine.start_processing(
        session_id=payload.session_id,
        force_new=payload.force_new,
    )
    return run


@router.get("/status/{session_id}", response_model=Dict[str, Any])
async def get_report_processing_status(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Returns the active or latest report processing run for a given session.
    Used by the floating processing card and session detail views.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    run = await report_processing_engine.get_active_or_latest_run(session_id)
    if not run:
        return {"status": "not_started", "session_id": session_id}
    return run


@router.post("/cancel/{run_id}", response_model=Dict[str, Any])
async def cancel_report_processing(run_id: str):
    """Cancels an in-progress report processing run."""
    success = await report_processing_repo.cancel_run(run_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Run cannot be cancelled or was not found in active state",
        )
    return {"status": "cancelled", "run_id": run_id}


@router.post("/sessions/{session_id}/cancel", response_model=Dict[str, Any])
async def cancel_session_report_processing(
    session_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Cancels any active report processing run for a given session."""
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    await report_processing_repo.cancel_active_run_for_session(session_id)
    return {"status": "cancelled", "session_id": session_id}


class ApproveProcessingReportRequest(BaseModel):
    revision_id: Optional[str] = None


@router.post("/sessions/{session_id}/approve", response_model=Dict[str, Any])
async def approve_report_processing_report(
    session_id: str,
    payload: Optional[ApproveProcessingReportRequest] = None,
    auth: Optional[AuthContext] = Depends(get_optional_account),
):
    """Approves the current saved report revision for final export."""
    account_id = getattr(auth, "account_id", None)
    session = await session_repo.get_session(session_id, account_id=account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    active_final = await final_report_repo.get_active_final_report(session_id)
    if not active_final:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No final report exists to approve.",
        )
    rev_id = (payload.revision_id if payload and payload.revision_id else None) or active_final.get("revision_id") or active_final.get("id")
    user_id = getattr(auth, "user_id", None)
    account_id = getattr(auth, "account_id", None)

    approved = await final_report_repo.approve_report(
        session_id=session_id,
        revision_id=rev_id,
        user_id=user_id,
        account_id=account_id,
    )
    if not approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to approve report.")
    return {"status": "approved", "session_id": session_id, "final_report": approved}


@router.get("/result/{run_id}", response_model=Dict[str, Any])
async def get_report_processing_result(run_id: str):
    """Retrieves the full durable result and JSON artifacts of a completed run."""
    run = await report_processing_repo.get_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found",
        )

    # Unpack JSON strings for frontend convenience
    unpacked = dict(run)
    for key in (
        "reporter_extraction_json",
        "editorial_selection_json",
        "writing_json",
        "proofreading_json",
        "validation_summary_json",
    ):
        if unpacked.get(key) and isinstance(unpacked[key], str):
            try:
                unpacked[key.replace("_json", "")] = json.loads(unpacked[key])
            except Exception:
                unpacked[key.replace("_json", "")] = {}
    return unpacked


# -----------------------------------------------------------------------------
# DOCUMENT GENERATION & DOWNLOAD ENDPOINTS
# -----------------------------------------------------------------------------

@router.post("/generate-docx/{session_id}", response_model=Dict[str, Any])
async def generate_report_docx(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Generates the publication-ready Word (.docx) document for the finalized report.
    Persists file metadata into the final_reports table.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    active_final = await final_report_repo.get_active_final_report(session_id)
    if not active_final:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No finalized report exists for this session yet. Complete report processing first.",
        )

    title = active_final.get("report_title") or session.get("title") or "DLBC Information Unit Report"
    programme = active_final.get("programme") or "Sunday Worship Service"
    minister = active_final.get("minister") or session.get("minister") or "Minister not provided"
    service_date = active_final.get("service_date") or session.get("date_created", "")[:10]
    report_text = active_final.get("report_text") or ""

    filename = document_service.generate_filename(title, programme, service_date)
    os.makedirs(STORAGE_DOCUMENTS_DIR, exist_ok=True)
    file_path = os.path.join(STORAGE_DOCUMENTS_DIR, filename)

    docx_stream = document_service.generate_final_report_docx(
        report_title=title,
        report_text=report_text,
        session_metadata={
            "title": title,
            "programme": programme,
            "minister": minister,
            "date_created": service_date,
        },
    )
    file_bytes = docx_stream.getvalue()

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    file_size = len(file_bytes)

    # Update final_reports record with filename and size
    from app.database.connection import get_db_connection
    async with get_db_connection() as conn:
        await conn.execute(
            """
            UPDATE final_reports
            SET docx_filename = ?, docx_file_size = ?
            WHERE id = ?
            """,
            (filename, file_size, active_final["id"]),
        )
        await conn.commit()

    return {
        "status": "success",
        "session_id": session_id,
        "filename": filename,
        "file_size": file_size,
        "download_url": f"/api/report-processing/download-docx/{session_id}",
    }


@router.get("/download-docx/{session_id}")
async def download_report_docx(session_id: str, auth: AuthContext = Depends(require_account)):
    """Serves the generated .docx file for immediate download."""
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    active_final = await final_report_repo.get_active_final_report(session_id)
    if not active_final:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No finalized report exists for this session.",
        )

    title = active_final.get("report_title") or "DLBC Information Unit Report"
    programme = active_final.get("programme") or "Sunday Worship Service"
    service_date = active_final.get("service_date") or ""
    filename = active_final.get("docx_filename") or document_service.generate_filename(
        title, programme, service_date
    )
    filename = document_service.sanitize_filename(filename.replace(".docx", "")) + ".docx"

    file_path = os.path.join(STORAGE_DOCUMENTS_DIR, filename)
    if os.path.isfile(file_path):
        with open(file_path, "rb") as f:
            content = f.read()
    else:
        # Generate on the fly
        report_text = active_final.get("report_text") or ""
        minister = active_final.get("minister") or "Minister not provided"
        stream = document_service.generate_final_report_docx(
            report_title=title,
            report_text=report_text,
            session_metadata={
                "title": title,
                "programme": programme,
                "minister": minister,
                "date_created": service_date,
            },
        )
        content = stream.getvalue()

    encoded_filename = urllib.parse.quote(filename)
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    return Response(content=content, headers=headers, media_type=headers["Content-Type"])


# -----------------------------------------------------------------------------
# COMPLETED REPORTS ARCHIVE ENDPOINTS (#reports)
# -----------------------------------------------------------------------------

@router.get("/archive", response_model=List[Dict[str, Any]])
async def list_completed_reports_archive(
    search: Optional[str] = Query(None, description="Free text search on title, text, minister"),
    programme: Optional[str] = Query(None, description="Filter by event/programme"),
    session_type: Optional[str] = Query(None, description="Filter by session type"),
    minister: Optional[str] = Query(None, description="Filter by minister"),
    date_from: Optional[str] = Query(None, description="Filter date from (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter date to (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    auth: AuthContext = Depends(require_account),
):
    """
    Returns the completed Information Unit reports archive with multi-attribute filtering.
    Powers the '#reports' view in the frontend.
    """
    reports = await report_processing_repo.list_completed_reports(
        search=search,
        programme=programme,
        session_type=session_type,
        minister=minister,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        account_id=auth.account_id,
    )
    return reports


# -----------------------------------------------------------------------------
# STANDARDS, APPROVED EXAMPLES & LEARNING DIFFS ENDPOINTS
# -----------------------------------------------------------------------------

@router.get("/standards/active", response_model=Dict[str, Any])
async def get_active_standard():
    return await report_processing_repo.get_active_standard()


@router.get("/standards", response_model=List[Dict[str, Any]])
async def list_standards():
    return await report_processing_repo.list_standards()


@router.post("/standards", response_model=Dict[str, Any])
async def create_standard(payload: StandardCreateRequest):
    return await report_processing_repo.create_standard(
        version_label=payload.version_label,
        reporter_extraction_instructions=payload.reporter_extraction_instructions,
        editorial_selection_instructions=payload.editorial_selection_instructions,
        writing_instructions=payload.writing_instructions,
        proofreading_instructions=payload.proofreading_instructions,
        anti_slop_rules=payload.anti_slop_rules,
        is_active=payload.is_active,
    )


@router.post("/standards/activate/{version}", response_model=Dict[str, Any])
async def activate_standard(version: int):
    success = await report_processing_repo.set_active_standard(version)
    return {"status": "success", "active_version": version, "success": success}


@router.get("/examples", response_model=List[Dict[str, Any]])
async def list_approved_examples(
    section: Optional[str] = Query(None, description="Filter by section letter AM, AN, AO, AP")
):
    return await report_processing_repo.list_approved_examples(section_letter=section)


@router.post("/examples", response_model=Dict[str, Any])
async def create_approved_example(payload: ExampleCreateRequest):
    return await report_processing_repo.create_approved_example(
        section_letter=payload.section_letter,
        section_name=payload.section_name,
        title=payload.title,
        approved_content=payload.approved_content,
        theme=payload.theme,
        scripture_reference=payload.scripture_reference,
        minister=payload.minister,
        service_date=payload.service_date,
        teaching_goal=payload.teaching_goal,
        editorial_focus=payload.editorial_focus,
    )


@router.post("/diffs", response_model=Dict[str, Any])
async def record_human_diff(payload: HumanDiffCreateRequest, auth: AuthContext = Depends(require_account)):
    """Records human corrections to an AI-generated report for reinforcement learning."""
    session = await session_repo.get_session(payload.session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {payload.session_id} not found",
        )
    return await report_processing_repo.save_human_diff(
        session_id=payload.session_id,
        original_ai_text=payload.original_ai_text,
        human_edited_text=payload.human_edited_text,
        run_id=payload.run_id,
        diff_summary=payload.diff_summary,
    )


@router.post("/diffs/{diff_id}/promote", response_model=Dict[str, Any])
async def promote_diff_to_example(diff_id: str, payload: PromoteDiffRequest):
    """Promotes a human edit diff into the approved exemplars library."""
    try:
        example = await report_processing_repo.promote_diff_to_example(
            diff_id=diff_id,
            section_letter=payload.section_letter,
            section_name=payload.section_name,
            title=payload.title,
            teaching_goal=payload.teaching_goal,
            editorial_focus=payload.editorial_focus,
        )
        return example
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/settings", response_model=Dict[str, Any])
async def get_settings(
    unit: Optional[str] = Query(None),
    auth: Optional[AuthContext] = Depends(get_optional_account),
):
    settings = await report_processing_repo.get_all_settings()
    active_inst = await report_processing_repo.get_active_unified_instruction()
    settings["instruction"] = active_inst
    settings["unified_instructions"] = active_inst

    # Resolve unit if provided or from authenticated church account
    target_unit = None
    if unit:
        target_unit = report_processing_repo.normalize_unit(unit)
    elif auth and auth.account:
        sec = auth.account.get("sector") or auth.account.get("custom_sector")
        if sec:
            target_unit = report_processing_repo.normalize_unit(sec)

    for flag_key in ("auto_process_after_verification", "auto_verification_enabled"):
        raw_val = settings.get(flag_key, "true")
        bool_val = str(raw_val).strip().lower() in ("true", "1", "yes", "on")
        settings[flag_key] = bool_val

    # Populate and convert unit-scoped flags
    unit_settings = {}
    for u in ("adult", "youth", "campus"):
        uk = f"auto_verification_enabled:{u}"
        raw_u = settings.get(uk, settings.get("auto_verification_enabled", True))
        b_u = str(raw_u).strip().lower() in ("true", "1", "yes", "on") if isinstance(raw_u, str) else bool(raw_u)
        settings[uk] = b_u
        unit_settings[u] = b_u

    settings["unit_settings"] = unit_settings
    if target_unit and target_unit in unit_settings:
        settings["unit"] = target_unit
        settings["auto_verification_enabled"] = unit_settings[target_unit]

    return settings


@router.post("/settings", response_model=Dict[str, Any])
async def update_setting(
    payload: Dict[str, Any],
    auth: Optional[AuthContext] = Depends(get_optional_account),
):
    req_unit = payload.get("unit")
    target_unit = report_processing_repo.normalize_unit(req_unit) if req_unit else None

    # Check authorization if authenticated with a specific church sector
    if auth and auth.account and not auth.is_demo and getattr(auth, "role", None) not in ("admin", "owner", "superadmin"):
        user_sector = report_processing_repo.normalize_unit(auth.account.get("sector") or auth.account.get("custom_sector"))
        if target_unit and target_unit != user_sector:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operators cannot modify settings for other units ({target_unit}). Your account is assigned to '{user_sector}'.",
            )

    if "key" in payload and "value" in payload:
        k = str(payload["key"])
        v = payload["value"]
        val_str = "true" if v is True else "false" if v is False else str(v)

        if k.startswith("auto_verification_enabled:"):
            key_unit = k.split(":", 1)[1].lower()
            if auth and auth.account and not auth.is_demo and getattr(auth, "role", None) not in ("admin", "owner", "superadmin"):
                user_sector = report_processing_repo.normalize_unit(auth.account.get("sector") or auth.account.get("custom_sector"))
                if key_unit != user_sector:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Operators cannot modify settings for other units ({key_unit}).",
                    )
        elif k == "auto_verification_enabled" and target_unit:
            k = f"auto_verification_enabled:{target_unit}"

        if k in ("unified_instructions", "instruction"):
            await report_processing_repo.save_active_unified_instruction(val_str)
        else:
            await report_processing_repo.set_setting(k, val_str)
        bool_val = val_str.lower() in ("true", "1", "yes", "on")
        return {"status": "success", "key": k, "value": bool_val, k: bool_val, "auto_verification_enabled": bool_val}

    res_settings = {}
    for k, v in payload.items():
        if k == "unit":
            continue
        val_str = "true" if v is True else "false" if v is False else str(v)
        actual_key = k
        if k == "auto_verification_enabled" and target_unit:
            actual_key = f"auto_verification_enabled:{target_unit}"

        if actual_key.startswith("auto_verification_enabled:"):
            key_unit = actual_key.split(":", 1)[1].lower()
            if auth and auth.account and not auth.is_demo and getattr(auth, "role", None) not in ("admin", "owner", "superadmin"):
                user_sector = report_processing_repo.normalize_unit(auth.account.get("sector") or auth.account.get("custom_sector"))
                if key_unit != user_sector:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Operators cannot modify settings for other units ({key_unit}).",
                    )

        if actual_key in ("unified_instructions", "instruction"):
            await report_processing_repo.save_active_unified_instruction(val_str)
        else:
            await report_processing_repo.set_setting(actual_key, val_str)
        is_bool = actual_key in ("auto_process_after_verification", "auto_verification_enabled") or actual_key.startswith("auto_verification_enabled:")
        res_settings[actual_key] = val_str.lower() in ("true", "1", "yes", "on") if is_bool else v

    if target_unit and f"auto_verification_enabled:{target_unit}" in res_settings:
        res_settings["auto_verification_enabled"] = res_settings[f"auto_verification_enabled:{target_unit}"]
        res_settings["unit"] = target_unit

    return {"status": "success", "settings": res_settings, **res_settings}


@router.get("/instruction", response_model=Dict[str, Any])
async def get_unified_instruction():
    instruction = await report_processing_repo.get_active_unified_instruction()
    return {
        "instruction": instruction,
        "unified_instructions": instruction,
        "status": "success",
    }


@router.post("/instruction", response_model=Dict[str, Any])
async def save_unified_instruction(payload: InstructionUpdateRequest):
    raw_inst = payload.instruction or payload.unified_instructions or ""
    if not raw_inst.strip():
        raise HTTPException(status_code=400, detail="Instruction cannot be empty")
    saved = await report_processing_repo.save_active_unified_instruction(raw_inst.strip())
    return {
        "instruction": saved,
        "unified_instructions": saved,
        "status": "success",
    }


@router.get("/prompt-preview/{session_id}", response_model=Dict[str, Any])
async def preview_compiled_prompt(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Returns the live compiled prompt that would be sent to Gemini for this session,
    including the active standards and few-shot exemplars interpolated.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    transcript_text = session.get("verified_text") or session.get("raw_text") or ""
    standard = await report_processing_repo.get_active_standard()
    examples = await report_processing_repo.list_approved_examples(active_only=True)
    legacy = await report_processing_engine._extract_legacy_material(session_id)

    prompt = report_processing_engine.compile_prompt(
        session=session,
        transcript_text=transcript_text,
        standard=standard,
        approved_examples=examples,
        legacy_material=legacy,
    )
    return {
        "session_id": session_id,
        "standard_version": standard.get("version", 1),
        "examples_count": len(examples),
        "reused_legacy": bool(legacy),
        "prompt": prompt,
    }
