"""
FastAPI Router for Configurable Programmes and Programme Sessions.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account
from app.database.programmes_repo import programmes_repo

router = APIRouter(prefix="/api/programmes", tags=["Programmes"])


class CreateProgrammeRequest(BaseModel):
    name: str
    sort_order: Optional[int] = 0


class UpdateProgrammeRequest(BaseModel):
    name: Optional[str] = None
    is_archived: Optional[bool] = None
    sort_order: Optional[int] = None


class CreateProgrammeSessionRequest(BaseModel):
    name: str
    sort_order: Optional[int] = 0


class UpdateProgrammeSessionRequest(BaseModel):
    name: Optional[str] = None
    is_archived: Optional[bool] = None
    sort_order: Optional[int] = None


class ReorderSessionsRequest(BaseModel):
    session_ids: List[str]


@router.get("")
async def get_programmes(include_archived: bool = False):
    """Lists all configured programmes with their sessions/sections."""
    return await programmes_repo.get_all_programmes(include_archived=include_archived)


@router.get("/{programme_id}")
async def get_programme(programme_id: str):
    """Retrieves a single programme by ID."""
    prog = await programmes_repo.get_programme_by_id(programme_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.post("")
async def create_programme(req: CreateProgrammeRequest, auth: AuthContext = Depends(require_account)):
    """Creates a new programme."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Programme name cannot be empty")
    return await programmes_repo.create_programme(name=req.name, sort_order=req.sort_order or 0)


@router.put("/{programme_id}")
async def update_programme(programme_id: str, req: UpdateProgrammeRequest, auth: AuthContext = Depends(require_account)):
    """Updates an existing programme."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    prog = await programmes_repo.update_programme(
        programme_id=programme_id,
        name=req.name,
        is_archived=req.is_archived,
        sort_order=req.sort_order,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.delete("/{programme_id}")
async def archive_programme(programme_id: str, auth: AuthContext = Depends(require_account)):
    """Soft-archives a programme (preserves historical references)."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    prog = await programmes_repo.archive_programme(programme_id, archive=True)
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.post("/{programme_id}/sessions")
async def create_programme_session(programme_id: str, req: CreateProgrammeSessionRequest, auth: AuthContext = Depends(require_account)):
    """Creates a new session/section under a programme."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Session/section name cannot be empty")
    prog = await programmes_repo.create_programme_session(
        programme_id=programme_id,
        name=req.name,
        sort_order=req.sort_order or 0,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.put("/{programme_id}/sessions/{session_item_id}")
async def update_programme_session(
    programme_id: str, session_item_id: str, req: UpdateProgrammeSessionRequest, auth: AuthContext = Depends(require_account)
):
    """Updates a session/section under a programme."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    prog = await programmes_repo.update_programme_session(
        session_item_id=session_item_id,
        name=req.name,
        is_archived=req.is_archived,
        sort_order=req.sort_order,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Session/section or programme not found")
    return prog


@router.delete("/{programme_id}/sessions/{session_item_id}")
async def archive_programme_session(programme_id: str, session_item_id: str, auth: AuthContext = Depends(require_account)):
    """Soft-archives a session/section."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    prog = await programmes_repo.archive_programme_session(session_item_id, archive=True)
    if not prog:
        raise HTTPException(status_code=404, detail="Session/section or programme not found")
    return prog


@router.post("/{programme_id}/sessions/reorder")
async def reorder_programme_sessions(programme_id: str, req: ReorderSessionsRequest, auth: AuthContext = Depends(require_account)):
    """Reorders sessions/sections under a programme."""
    if getattr(auth, "is_demo", False):
        raise HTTPException(status_code=403, detail="Modifying programmes is disabled in Demo mode to protect shared sample data.")
    prog = await programmes_repo.reorder_programme_sessions(
        programme_id=programme_id,
        session_ids=req.session_ids,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog

