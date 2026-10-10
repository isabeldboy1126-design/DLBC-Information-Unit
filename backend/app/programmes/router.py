"""
FastAPI Router for Configurable Programmes and Programme Sessions.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account, get_optional_account
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
async def get_programmes(
    include_archived: bool = False,
    auth: Optional[AuthContext] = Depends(get_optional_account),
):
    """Lists all configured programmes accessible to the account (system canonical + account custom)."""
    if auth and auth.account_id:
        return await programmes_repo.get_all_programmes(account_id=auth.account_id, include_archived=include_archived)
    # Unauthenticated callers only see canonical system templates
    progs = await programmes_repo.get_all_programmes(account_id=None, include_archived=include_archived)
    return [p for p in progs if p.get("is_system")]


@router.get("/{programme_id}")
async def get_programme(
    programme_id: str,
    auth: Optional[AuthContext] = Depends(get_optional_account),
):
    """Retrieves a single programme by ID if accessible to the account."""
    account_id = auth.account_id if auth else None
    prog = await programmes_repo.get_programme_by_id(programme_id, account_id=account_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    if not account_id and not prog.get("is_system"):
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.post("")
async def create_programme(req: CreateProgrammeRequest, auth: AuthContext = Depends(require_account)):
    """Creates a new custom programme for the authenticated account."""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Programme name cannot be empty")
    return await programmes_repo.create_programme(name=req.name, sort_order=req.sort_order or 0, account_id=auth.account_id)


@router.put("/{programme_id}")
async def update_programme(programme_id: str, req: UpdateProgrammeRequest, auth: AuthContext = Depends(require_account)):
    """Updates an existing custom programme. Canonical default church programmes cannot be modified."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="System default programmes cannot be modified.")

    prog = await programmes_repo.update_programme(
        programme_id=programme_id,
        account_id=auth.account_id,
        name=req.name,
        is_archived=req.is_archived,
        sort_order=req.sort_order,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.delete("/{programme_id}")
async def delete_or_archive_programme(
    programme_id: str,
    permanent: bool = False,
    auth: AuthContext = Depends(require_account),
):
    """Deletes or archives a custom programme. Canonical default church programmes cannot be deleted."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="System default programmes cannot be deleted or archived.")

    if permanent:
        success = await programmes_repo.delete_programme_permanent(programme_id, account_id=auth.account_id)
        if not success:
            raise HTTPException(status_code=404, detail="Programme not found")
        return {"status": "deleted", "programme_id": programme_id}
    prog = await programmes_repo.archive_programme(programme_id, account_id=auth.account_id, archive=True)
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.delete("/{programme_id}/permanent")
async def delete_programme_permanent_endpoint(programme_id: str, auth: AuthContext = Depends(require_account)):
    """Permanently deletes a custom programme. Canonical default church programmes cannot be deleted."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="System default programmes cannot be deleted.")

    success = await programmes_repo.delete_programme_permanent(programme_id, account_id=auth.account_id)
    if not success:
        raise HTTPException(status_code=404, detail="Programme not found")
    return {"status": "deleted", "programme_id": programme_id}


@router.post("/{programme_id}/sessions")
async def create_programme_session(programme_id: str, req: CreateProgrammeSessionRequest, auth: AuthContext = Depends(require_account)):
    """Creates a new session/section under a custom programme."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot add custom sessions to system default programmes.")

    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Session/section name cannot be empty")
    prog = await programmes_repo.create_programme_session(
        programme_id=programme_id,
        name=req.name,
        sort_order=req.sort_order or 0,
        account_id=auth.account_id,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog


@router.put("/{programme_id}/sessions/{session_item_id}")
async def update_programme_session(
    programme_id: str, session_item_id: str, req: UpdateProgrammeSessionRequest, auth: AuthContext = Depends(require_account)
):
    """Updates a session/section under a custom programme."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot modify sessions of system default programmes.")

    prog = await programmes_repo.update_programme_session(
        session_item_id=session_item_id,
        name=req.name,
        is_archived=req.is_archived,
        sort_order=req.sort_order,
        account_id=auth.account_id,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Session/section or programme not found")
    return prog


@router.delete("/{programme_id}/sessions/{session_item_id}")
async def archive_or_delete_programme_session(
    programme_id: str,
    session_item_id: str,
    permanent: bool = False,
    auth: AuthContext = Depends(require_account),
):
    """Deletes or archives a session/section under a custom programme."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot delete sessions of system default programmes.")

    if permanent:
        success = await programmes_repo.delete_programme_session_permanent(session_item_id, account_id=auth.account_id)
        if not success:
            raise HTTPException(status_code=404, detail="Session/section not found")
        return {"status": "deleted", "session_id": session_item_id}
    prog = await programmes_repo.archive_programme_session(session_item_id, account_id=auth.account_id, archive=True)
    if not prog:
        raise HTTPException(status_code=404, detail="Session/section or programme not found")
    return prog


@router.delete("/{programme_id}/sessions/{session_item_id}/permanent")
async def delete_programme_session_permanent_endpoint(
    programme_id: str,
    session_item_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Permanently deletes a programme session/section item."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot delete sessions of system default programmes.")

    success = await programmes_repo.delete_programme_session_permanent(session_item_id, account_id=auth.account_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session/section not found")
    return {"status": "deleted", "session_id": session_item_id}


@router.post("/{programme_id}/sessions/reorder")
async def reorder_programme_sessions(programme_id: str, req: ReorderSessionsRequest, auth: AuthContext = Depends(require_account)):
    """Reorders sessions/sections under a programme."""
    existing = await programmes_repo.get_programme_by_id(programme_id, account_id=auth.account_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Programme not found")
    if existing.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot reorder sessions of system default programmes.")

    prog = await programmes_repo.reorder_programme_sessions(
        programme_id=programme_id,
        session_ids=req.session_ids,
        account_id=auth.account_id,
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found")
    return prog

