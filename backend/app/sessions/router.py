"""
Session REST API Router (Phase 4)

Provides endpoints for managing church service sessions, listing session history,
retrieving session detail, editing session titles, and explicit deletion.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.database.session_repo import session_repo

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None
    provider_name: Optional[str] = "azure_speech"
    language_code: Optional[str] = "en-NG"
    raw_text: Optional[str] = None
    verified_text: Optional[str] = None


class UpdateTitleRequest(BaseModel):
    title: str


@router.get("")
async def list_sessions():
    """Lists all saved sessions ordered by creation date descending."""
    sessions = await session_repo.list_sessions()
    return {"sessions": sessions}


@router.post("")
async def create_session(payload: CreateSessionRequest):
    """Explicitly initializes a new session prior to recording."""
    import time, uuid
    session_id = f"session_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    session = await session_repo.create_session(
        session_id=session_id,
        title=payload.title,
        provider_name=payload.provider_name or "azure_speech",
        language_code=payload.language_code or "en-NG",
        raw_text=payload.raw_text,
        verified_text=payload.verified_text,
    )
    return {"session": session}


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Retrieves full details of a session with linked audio, transcript segments, and flags."""
    session = await session_repo.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"session": session}


@router.patch("/{session_id}")
async def update_session_title(session_id: str, payload: UpdateTitleRequest):
    """Renames a session title cleanly without modifying underlying files or IDs."""
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    session = await session_repo.update_session_title(session_id, payload.title)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"session": session}


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Deletes a session record upon explicit user confirmation."""
    success = await session_repo.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return {"status": "deleted", "session_id": session_id}
