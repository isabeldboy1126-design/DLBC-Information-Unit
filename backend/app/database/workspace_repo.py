"""
Workspace Documents Repository
Manages standalone ministerial documents created or edited within the Workspace.
Provides SQLite and MSSQL support with automatic schema initialization.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.database.connection import get_db_connection


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkspaceRepository:
    async def init_db(self):
        """Creates workspace tables if they do not already exist."""
        async with get_db_connection() as conn:
            is_mssql = bool(os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL").startswith("sqlite"))
            if is_mssql:
                statements = [
                    """
                    IF OBJECT_ID(N'workspace_documents', N'U') IS NULL
                    CREATE TABLE workspace_documents (
                        id VARCHAR(255) PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        title NVARCHAR(MAX) NOT NULL,
                        content NVARCHAR(MAX),
                        words INT DEFAULT 0,
                        status VARCHAR(50) DEFAULT 'Draft',
                        editor_name NVARCHAR(255),
                        is_starred INT DEFAULT 0,
                        created_at VARCHAR(255) NOT NULL,
                        updated_at VARCHAR(255) NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_workspace_docs_account')
                    CREATE INDEX idx_workspace_docs_account ON workspace_documents(account_id);
                    """,
                ]
                for stmt in statements:
                    try:
                        await conn.execute(stmt)
                    except Exception as e:
                        print(f"MSSQL workspace table init notice: {e}")
            else:
                statements = [
                    """
                    CREATE TABLE IF NOT EXISTS workspace_documents (
                        id TEXT PRIMARY KEY,
                        account_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT,
                        words INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'Draft',
                        editor_name TEXT,
                        is_starred INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    "CREATE INDEX IF NOT EXISTS idx_workspace_docs_account ON workspace_documents(account_id);",
                ]
                for stmt in statements:
                    try:
                        await conn.execute(stmt)
                    except Exception as e:
                        print(f"SQLite workspace table init notice: {e}")
            await conn.commit()

    async def create_document(
        self,
        account_id: str,
        doc_id: Optional[str] = None,
        title: str = "Untitled Document",
        content: str = "",
        words: int = 0,
        status: str = "Draft",
        editor_name: Optional[str] = None,
        is_starred: bool = False,
    ) -> Dict[str, Any]:
        """Creates a new workspace document."""
        real_id = doc_id or f"doc_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{uuid.uuid4().hex[:4]}"
        now = utc_now_iso()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO workspace_documents (
                    id, account_id, title, content, words, status, editor_name, is_starred, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    real_id, account_id, title, content, words, status, editor_name,
                    1 if is_starred else 0, now, now
                ),
            )
            await conn.commit()
            return {
                "id": real_id,
                "account_id": account_id,
                "title": title,
                "content": content,
                "words": words,
                "status": status,
                "editor_name": editor_name,
                "is_starred": is_starred,
                "created_at": now,
                "updated_at": now,
            }

    async def get_document(self, account_id: str, doc_id: str) -> Optional[Dict[str, Any]]:
        """Gets a workspace document by ID."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, account_id, title, content, words, status, editor_name, is_starred, created_at, updated_at
                FROM workspace_documents WHERE account_id = ? AND id = ?
                """,
                (account_id, doc_id),
            )
            r = await cursor.fetchone()
            if not r:
                return None
            return {
                "id": r[0],
                "account_id": r[1],
                "title": r[2],
                "content": r[3] or "",
                "words": r[4] or 0,
                "status": r[5] or "Draft",
                "editor_name": r[6],
                "is_starred": bool(r[7]),
                "created_at": r[8],
                "updated_at": r[9],
            }

    async def list_documents(
        self,
        account_id: str,
        search_query: Optional[str] = None,
        only_starred: bool = False,
    ) -> List[Dict[str, Any]]:
        """Lists all workspace documents for an account."""
        async with get_db_connection() as conn:
            query = (
                "SELECT id, account_id, title, content, words, status, editor_name, is_starred, created_at, updated_at "
                "FROM workspace_documents WHERE account_id = ?"
            )
            params: List[Any] = [account_id]
            if only_starred:
                query += " AND is_starred = 1"
            if search_query and search_query.strip():
                p = f"%{search_query.strip()}%"
                query += " AND (title LIKE ? OR content LIKE ?)"
                params.extend([p, p])

            query += " ORDER BY updated_at DESC"
            cursor = await conn.execute(query, tuple(params))
            rows = await cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "account_id": r[1],
                    "title": r[2],
                    "content": r[3] or "",
                    "words": r[4] or 0,
                    "status": r[5] or "Draft",
                    "editor_name": r[6],
                    "is_starred": bool(r[7]),
                    "created_at": r[8],
                    "updated_at": r[9],
                }
                for r in rows
            ]

    async def upsert_document(
        self,
        account_id: str,
        doc_id: str,
        title: str,
        content: str,
        words: Optional[int] = None,
        status: Optional[str] = None,
        editor_name: Optional[str] = None,
        is_starred: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Updates or creates a workspace document."""
        existing = await self.get_document(account_id, doc_id)
        now = utc_now_iso()
        calc_words = words if words is not None else len(content.split()) if content else 0

        async with get_db_connection() as conn:
            if existing:
                upd_status = status or existing.get("status") or "Draft"
                upd_editor = editor_name if editor_name is not None else existing.get("editor_name")
                upd_starred = 1 if is_starred else (0 if is_starred is False else (1 if existing.get("is_starred") else 0))
                await conn.execute(
                    """
                    UPDATE workspace_documents
                    SET title = ?, content = ?, words = ?, status = ?, editor_name = ?, is_starred = ?, updated_at = ?
                    WHERE account_id = ? AND id = ?
                    """,
                    (title, content, calc_words, upd_status, upd_editor, upd_starred, now, account_id, doc_id),
                )
            else:
                upd_status = status or "Draft"
                upd_editor = editor_name
                upd_starred = 1 if is_starred else 0
                await conn.execute(
                    """
                    INSERT INTO workspace_documents (
                        id, account_id, title, content, words, status, editor_name, is_starred, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (doc_id, account_id, title, content, calc_words, upd_status, upd_editor, upd_starred, now, now),
                )
            await conn.commit()

        return {
            "id": doc_id,
            "account_id": account_id,
            "title": title,
            "content": content,
            "words": calc_words,
            "status": status or (existing.get("status") if existing else "Draft"),
            "editor_name": editor_name if editor_name is not None else (existing.get("editor_name") if existing else None),
            "is_starred": is_starred if is_starred is not None else (existing.get("is_starred") if existing else False),
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
        }

    async def delete_document(self, account_id: str, doc_id: str) -> bool:
        """Deletes a workspace document."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "DELETE FROM workspace_documents WHERE account_id = ? AND id = ?",
                (account_id, doc_id),
            )
            await conn.commit()
            return bool(cursor.rowcount > 0)

    async def toggle_starred(self, account_id: str, doc_id: str) -> Optional[bool]:
        """Toggles the is_starred state of a document."""
        doc = await self.get_document(account_id, doc_id)
        if not doc:
            return None
        new_val = not doc["is_starred"]
        now = utc_now_iso()
        async with get_db_connection() as conn:
            await conn.execute(
                "UPDATE workspace_documents SET is_starred = ?, updated_at = ? WHERE account_id = ? AND id = ?",
                (1 if new_val else 0, now, account_id, doc_id),
            )
            await conn.commit()
        return new_val


workspace_repo = WorkspaceRepository()
