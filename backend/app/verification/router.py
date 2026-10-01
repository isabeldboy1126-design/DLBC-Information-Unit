"""
Phase 5: Verification REST API Router

Provides endpoints for the human verification workflow — reviewing flagged
transcript segments, confirming or correcting them, and finalising the
Verified Transcript.

Does NOT modify Raw Transcript or session.status.
"""

import asyncio
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account
from app.database.session_repo import session_repo
from app.verification.decision_engine import verification_decision_engine

router = APIRouter(prefix="/api/sessions", tags=["Verification"])


class VerifyAIRequest(BaseModel):
    session_id: Optional[str] = None
    auto_resolve: bool = True
    background: bool = True


class ResolveItemRequest(BaseModel):
    verified_text: str
    action: str  # 'confirmed' | 'corrected'
    correction_note: Optional[str] = None


class AddItemRequest(BaseModel):
    segment_index: int


@router.post("/{session_id}/verification/start")
async def start_verification(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Initialises verification by gathering flagged segments into verification items.
    Only segments with low confidence or manual flags become verification items.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.init_verification(session_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/{session_id}/verification")
async def get_verification(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Returns current verification state: status, progress, and all verification items.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.get_verification_state(session_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.patch("/{session_id}/verification/{segment_index}")
async def resolve_item(session_id: str, segment_index: int, payload: ResolveItemRequest, auth: AuthContext = Depends(require_account)):
    """
    Confirms or corrects a single verification item.
    action='confirmed' retains original wording; action='corrected' saves edited text.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.resolve_verification_item(
        session_id=session_id,
        segment_index=segment_index,
        verified_text=payload.verified_text,
        action=payload.action,
        correction_note=payload.correction_note,
    )
    if result and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{session_id}/verification/add-item")
async def add_manual_item(session_id: str, payload: AddItemRequest, auth: AuthContext = Depends(require_account)):
    """
    Allows the reviewer to manually flag an unflagged segment for verification review.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.add_manual_verification_item(
        session_id=session_id,
        segment_index=payload.segment_index,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{session_id}/verification/finalise")
async def finalise_verification(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Finalises verification: all items must be resolved. Constructs the complete
    Verified Transcript by overlaying corrections onto the full raw segment sequence.
    Saves to SQLite and storage/verified_transcripts/.
    Does NOT change session.status.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.finalise_verification(session_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{session_id}/verification/confirm-all-remaining")
async def confirm_all_remaining(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Bulk-confirms all remaining unresolved (pending) verification items using
    their original transcript wording. Preserves existing corrections and already-confirmed items.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.confirm_all_remaining(session_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{session_id}/verification/confirm-raw")
async def confirm_raw_as_verified(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Zero-flag shortcut: confirms the entire raw transcript as verified with
    one explicit human action. No individual verification items are created.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.confirm_raw_as_verified(session_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


async def _execute_ai_verification(
    session_id: Optional[str],
    payload: Optional[VerifyAIRequest] = None,
    account_id: Optional[str] = None,
):
    target_id = session_id or (payload.session_id if payload else None)
    if not target_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    session = await session_repo.get_session(target_id, account_id=account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    auto_resolve = payload.auto_resolve if payload else True
    run_background = payload.background if payload else True

    # If already running, return current status without duplication
    cur_status = await session_repo.get_ai_verification_status(target_id)
    if cur_status.get("ai_verification_status") in ("compiling", "verifying"):
        return {
            "message": "AI verification already in progress",
            "session_id": target_id,
            "status": cur_status["ai_verification_status"],
            "summary": cur_status.get("summary", {}),
        }

    if run_background:
        await session_repo.set_ai_verification_status(target_id, "compiling")
        asyncio.create_task(
            verification_decision_engine.verify_session(target_id, auto_resolve=auto_resolve)
        )
        return {
            "message": "AI verification initiated",
            "session_id": target_id,
            "status": "compiling",
        }
    else:
        res = await verification_decision_engine.verify_session(target_id, auto_resolve=auto_resolve)
        if res.get("status") == "failed" and "error" in res:
            raise HTTPException(status_code=400, detail=res["error"])
        return res


@router.post("/{session_id}/verification/verify-ai")
@router.post("/{session_id}/verification/verify-ai/")
@router.post("/{session_id}/verify-ai")
@router.post("/{session_id}/verify-ai/")
async def trigger_ai_verification(
    session_id: str,
    payload: Optional[VerifyAIRequest] = None,
    auth: AuthContext = Depends(require_account),
):
    """
    Triggers AI-powered verification across flagged segments using multi-modal
    Azure transcript, bounded Gemini audio transcription, and KJV doctrinal checking.
    """
    return await _execute_ai_verification(session_id=session_id, payload=payload, account_id=auth.account_id)


@router.post("/verify-ai")
@router.post("/verify-ai/")
async def trigger_ai_verification_direct(
    payload: VerifyAIRequest,
    auth: AuthContext = Depends(require_account),
):
    """
    Enables triggering AI verification by supplying session_id directly in the request body.
    """
    return await _execute_ai_verification(session_id=payload.session_id, payload=payload, account_id=auth.account_id)


@router.get("/{session_id}/verification/verify-ai")
@router.get("/{session_id}/verification/verify-ai/")
@router.get("/{session_id}/verify-ai")
@router.get("/{session_id}/verify-ai/")
async def get_ai_verification_status_alias(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Fallback status alias for clients following redirects or querying via GET.
    """
    return await get_ai_verification_status_endpoint(session_id, auth=auth)


@router.get("/{session_id}/verification/ai-status")
@router.get("/{session_id}/verification/ai-status/")
async def get_ai_verification_status_endpoint(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Returns current AI verification lifecycle state, timestamps, and resolution summary.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await session_repo.get_ai_verification_status(session_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/{session_id}/verification/cancel")
@router.post("/{session_id}/verification/verify-ai/cancel")
@router.post("/{session_id}/verify-ai/cancel")
async def cancel_ai_verification(session_id: str, auth: AuthContext = Depends(require_account)):
    """
    Cancels an in-progress automated AI verification run for a session.
    Idempotent. Preserves previously resolved items and allows manual completion.
    """
    session = await session_repo.get_session(session_id, account_id=auth.account_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    cur_status = await session_repo.get_ai_verification_status(session_id)
    current_ai_status = cur_status.get("ai_verification_status")

    if current_ai_status in ("compiling", "verifying"):
        await session_repo.set_ai_verification_status(session_id, "cancelled")

    return {
        "status": "cancelled",
        "session_id": session_id,
        "message": "AI verification was cancelled.",
    }


