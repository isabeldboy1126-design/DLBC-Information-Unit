"""
Workspace Documents Router
Authenticated endpoints for Information Unit staff to manage standalone workspace documents.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account
from app.database.workspace_repo import workspace_repo

router = APIRouter(prefix="/api/workspace", tags=["Workspace"])


class CreateDocumentRequest(BaseModel):
    id: Optional[str] = None
    title: str = "Untitled Document"
    content: str = ""
    words: Optional[int] = 0
    status: Optional[str] = "Draft"
    editor_name: Optional[str] = None
    is_starred: Optional[bool] = False


class UpdateDocumentRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    words: Optional[int] = None
    status: Optional[str] = None
    editor_name: Optional[str] = None
    is_starred: Optional[bool] = None


@router.get("/documents")
async def list_workspace_documents(
    search: Optional[str] = Query(default=None),
    starred_only: bool = Query(default=False),
    auth: AuthContext = Depends(require_account),
):
    """Lists all workspace documents for the current account."""
    docs = await workspace_repo.list_documents(
        account_id=auth.account_id,
        search_query=search,
        only_starred=starred_only,
    )
    return {
        "status": "success",
        "total": len(docs),
        "documents": docs,
    }


@router.get("/documents/{doc_id}")
async def get_workspace_document(
    doc_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Gets a single workspace document by ID."""
    doc = await workspace_repo.get_document(auth.account_id, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Workspace document not found")
    return {
        "status": "success",
        "document": doc,
    }


@router.post("/documents")
async def create_workspace_document(
    payload: CreateDocumentRequest,
    auth: AuthContext = Depends(require_account),
):
    """Creates a new workspace document."""
    doc = await workspace_repo.create_document(
        account_id=auth.account_id,
        doc_id=payload.id,
        title=payload.title,
        content=payload.content,
        words=payload.words or 0,
        status=payload.status or "Draft",
        editor_name=payload.editor_name or auth.user_email,
        is_starred=payload.is_starred or False,
    )
    return {
        "status": "success",
        "document": doc,
    }


@router.put("/documents/{doc_id}")
async def save_workspace_document(
    doc_id: str,
    payload: UpdateDocumentRequest,
    auth: AuthContext = Depends(require_account),
):
    """Upserts (saves) a workspace document."""
    doc = await workspace_repo.upsert_document(
        account_id=auth.account_id,
        doc_id=doc_id,
        title=payload.title or "Untitled Document",
        content=payload.content or "",
        words=payload.words,
        status=payload.status,
        editor_name=payload.editor_name or auth.email,
        is_starred=payload.is_starred,
    )
    return {
        "status": "success",
        "document": doc,
    }


@router.delete("/documents/{doc_id}")
async def delete_workspace_document(
    doc_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Deletes a workspace document."""
    deleted = await workspace_repo.delete_document(auth.account_id, doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workspace document not found")
    return {
        "status": "success",
        "deleted_id": doc_id,
    }


@router.post("/documents/{doc_id}/star")
async def toggle_star_document(
    doc_id: str,
    auth: AuthContext = Depends(require_account),
):
    """Toggles the star flag for a workspace document."""
    new_starred = await workspace_repo.toggle_starred(auth.account_id, doc_id)
    if new_starred is None:
        raise HTTPException(status_code=404, detail="Workspace document not found")
    return {
        "status": "success",
        "is_starred": new_starred,
    }
