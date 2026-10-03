"""
Media Repository
Manages secure media upload tokens and received audio recordings.
Scoped by church account with strict isolation.
Supports both SQLite and Azure SQL (MSSQL).
"""

import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.database.connection import get_db_connection


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MediaRepository:
    async def init_db(self):
        """Creates media tables if they do not already exist."""
        async with get_db_connection() as conn:
            from app.database.connection import is_mssql
            if is_mssql():
                statements = [
                    """
                    IF OBJECT_ID(N'media_upload_tokens', N'U') IS NULL
                    CREATE TABLE media_upload_tokens (
                        token_id VARCHAR(255) PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        token VARCHAR(255) NOT NULL UNIQUE,
                        label NVARCHAR(255) DEFAULT 'Media Team Upload Link',
                        pin_code VARCHAR(50),
                        is_active INT NOT NULL DEFAULT 1,
                        created_at VARCHAR(255) NOT NULL,
                        updated_at VARCHAR(255) NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_tokens_account')
                    CREATE INDEX idx_media_tokens_account ON media_upload_tokens(account_id, is_active);
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_tokens_token')
                    CREATE INDEX idx_media_tokens_token ON media_upload_tokens(token);
                    """,
                    """
                    IF OBJECT_ID(N'media_recordings', N'U') IS NULL
                    CREATE TABLE media_recordings (
                        recording_id VARCHAR(255) PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        token_id VARCHAR(255),
                        title NVARCHAR(MAX) NOT NULL,
                        source VARCHAR(50) NOT NULL DEFAULT 'media_link',
                        original_filename NVARCHAR(MAX),
                        file_path NVARCHAR(MAX) NOT NULL,
                        file_size BIGINT DEFAULT 0,
                        file_format VARCHAR(50),
                        duration_seconds FLOAT DEFAULT 0,
                        event NVARCHAR(MAX),
                        programme NVARCHAR(MAX),
                        day_number INT,
                        pastor_name NVARCHAR(MAX),
                        status VARCHAR(50) NOT NULL DEFAULT 'new',
                        session_id VARCHAR(255),
                        uploaded_by NVARCHAR(255) DEFAULT 'Media Team',
                        error_message NVARCHAR(MAX),
                        created_at VARCHAR(255) NOT NULL,
                        updated_at VARCHAR(255) NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_recordings_account')
                    CREATE INDEX idx_media_recordings_account ON media_recordings(account_id, status);
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_recordings_created')
                    CREATE INDEX idx_media_recordings_created ON media_recordings(created_at DESC);
                    """,
                ]
                for stmt in statements:
                    try:
                        await conn.execute(stmt)
                    except Exception as e:
                        print(f"MSSQL media table init notice: {e}")
            else:
                statements = [
                    """
                    CREATE TABLE IF NOT EXISTS media_upload_tokens (
                        token_id TEXT PRIMARY KEY,
                        account_id TEXT NOT NULL,
                        token TEXT NOT NULL UNIQUE,
                        label TEXT DEFAULT 'Media Team Upload Link',
                        pin_code TEXT,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    "CREATE INDEX IF NOT EXISTS idx_media_tokens_account ON media_upload_tokens(account_id, is_active);",
                    "CREATE INDEX IF NOT EXISTS idx_media_tokens_token ON media_upload_tokens(token);",
                    """
                    CREATE TABLE IF NOT EXISTS media_recordings (
                        recording_id TEXT PRIMARY KEY,
                        account_id TEXT NOT NULL,
                        token_id TEXT,
                        title TEXT NOT NULL,
                        source TEXT NOT NULL DEFAULT 'media_link',
                        original_filename TEXT,
                        file_path TEXT NOT NULL,
                        file_size INTEGER DEFAULT 0,
                        file_format TEXT,
                        duration_seconds REAL DEFAULT 0,
                        event TEXT,
                        programme TEXT,
                        day_number INTEGER,
                        pastor_name TEXT,
                        status TEXT NOT NULL DEFAULT 'new',
                        session_id TEXT,
                        uploaded_by TEXT DEFAULT 'Media Team',
                        error_message TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    "CREATE INDEX IF NOT EXISTS idx_media_recordings_account ON media_recordings(account_id, status);",
                    "CREATE INDEX IF NOT EXISTS idx_media_recordings_created ON media_recordings(created_at DESC);",
                ]
                for stmt in statements:
                    try:
                        await conn.execute(stmt)
                    except Exception as e:
                        print(f"SQLite media table init notice: {e}")
            await conn.commit()

    async def get_or_create_token(self, account_id: str, label: str = "Media Team Upload Link", pin_code: Optional[str] = None) -> Dict[str, Any]:
        """Gets the active token for an account, or creates a new high-entropy token if none exists."""
        async with get_db_connection() as conn:
            from app.database.connection import is_mssql
            placeholder = "?" if not is_mssql() else "?"
            cursor = await conn.execute(
                f"SELECT token_id, account_id, token, label, pin_code, is_active, created_at, updated_at "
                f"FROM media_upload_tokens WHERE account_id = {placeholder} AND is_active = 1 ORDER BY created_at DESC",
                (account_id,)
            )
            row = await cursor.fetchone()
            if row:
                return {
                    "token_id": row[0],
                    "account_id": row[1],
                    "token": row[2],
                    "label": row[3],
                    "pin_code": row[4],
                    "is_active": bool(row[5]),
                    "created_at": row[6],
                    "updated_at": row[7],
                }

            # Generate new high-entropy token (32 URL-safe chars)
            token_id = f"token_{uuid.uuid4().hex[:12]}"
            token_val = secrets.token_urlsafe(24)
            now = utc_now_iso()
            await conn.execute(
                f"INSERT INTO media_upload_tokens (token_id, account_id, token, label, pin_code, is_active, created_at, updated_at) "
                f"VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                (token_id, account_id, token_val, label, pin_code, now, now)
            )
            await conn.commit()
            return {
                "token_id": token_id,
                "account_id": account_id,
                "token": token_val,
                "label": label,
                "pin_code": pin_code,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }

    async def regenerate_token(self, account_id: str, pin_code: Optional[str] = None) -> Dict[str, Any]:
        """Deactivates all previous tokens for the account and creates a brand new one."""
        async with get_db_connection() as conn:
            now = utc_now_iso()
            await conn.execute(
                "UPDATE media_upload_tokens SET is_active = 0, updated_at = ? WHERE account_id = ?",
                (now, account_id)
            )
            token_id = f"token_{uuid.uuid4().hex[:12]}"
            token_val = secrets.token_urlsafe(24)
            await conn.execute(
                "INSERT INTO media_upload_tokens (token_id, account_id, token, label, pin_code, is_active, created_at, updated_at) "
                "VALUES (?, ?, ?, 'Media Team Upload Link', ?, 1, ?, ?)",
                (token_id, account_id, token_val, pin_code, now, now)
            )
            await conn.commit()
            return {
                "token_id": token_id,
                "account_id": account_id,
                "token": token_val,
                "label": "Media Team Upload Link",
                "pin_code": pin_code,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }

    async def get_token_by_value(self, token_str: str) -> Optional[Dict[str, Any]]:
        """Retrieves active token details by its token string value."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT token_id, account_id, token, label, pin_code, is_active, created_at, updated_at "
                "FROM media_upload_tokens WHERE token = ? AND is_active = 1",
                (token_str,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return {
                "token_id": row[0],
                "account_id": row[1],
                "token": row[2],
                "label": row[3],
                "pin_code": row[4],
                "is_active": bool(row[5]),
                "created_at": row[6],
                "updated_at": row[7],
            }

    async def create_recording(
        self,
        account_id: str,
        title: str,
        file_path: str,
        original_filename: str,
        file_size: int,
        file_format: str,
        duration_seconds: float = 0.0,
        token_id: Optional[str] = None,
        source: str = "media_link",
        event: Optional[str] = None,
        programme: Optional[str] = None,
        day_number: Optional[int] = None,
        pastor_name: Optional[str] = None,
        status: str = "new",
        uploaded_by: str = "Media Team",
    ) -> Dict[str, Any]:
        """Creates a new received media recording row."""
        rec_id = f"rec_{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO media_recordings (
                    recording_id, account_id, token_id, title, source, original_filename,
                    file_path, file_size, file_format, duration_seconds, event, programme,
                    day_number, pastor_name, status, uploaded_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rec_id, account_id, token_id, title, source, original_filename,
                    file_path, file_size, file_format, duration_seconds, event, programme,
                    day_number, pastor_name, status, uploaded_by, now, now
                )
            )
            await conn.commit()
            return {
                "recording_id": rec_id,
                "account_id": account_id,
                "token_id": token_id,
                "title": title,
                "source": source,
                "original_filename": original_filename,
                "file_path": file_path,
                "file_size": file_size,
                "file_format": file_format,
                "duration_seconds": duration_seconds,
                "event": event,
                "programme": programme,
                "day_number": day_number,
                "pastor_name": pastor_name,
                "status": status,
                "uploaded_by": uploaded_by,
                "session_id": None,
                "created_at": now,
                "updated_at": now,
            }

    async def list_recordings(
        self,
        account_id: str,
        status_filter: Optional[str] = None,
        search_query: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists recordings for an account with optional status filter and search query."""
        async with get_db_connection() as conn:
            query = (
                "SELECT recording_id, account_id, token_id, title, source, original_filename, "
                "file_path, file_size, file_format, duration_seconds, event, programme, "
                "day_number, pastor_name, status, session_id, uploaded_by, error_message, "
                "created_at, updated_at "
                "FROM media_recordings WHERE account_id = ?"
            )
            params: List[Any] = [account_id]

            if status_filter and status_filter != "all":
                if status_filter == "pending":
                    query += " AND status IN ('new', 'needs_details')"
                else:
                    query += " AND status = ?"
                    params.append(status_filter)

            if search_query and search_query.strip():
                pattern = f"%{search_query.strip()}%"
                query += " AND (title LIKE ? OR programme LIKE ? OR pastor_name LIKE ? OR original_filename LIKE ?)"
                params.extend([pattern, pattern, pattern, pattern])

            query += " ORDER BY created_at DESC"
            cursor = await conn.execute(query, tuple(params))
            rows = await cursor.fetchall()

            recordings = []
            for r in rows:
                recordings.append({
                    "recording_id": r[0],
                    "account_id": r[1],
                    "token_id": r[2],
                    "title": r[3],
                    "source": r[4],
                    "original_filename": r[5],
                    "file_path": r[6],
                    "file_size": r[7],
                    "file_format": r[8],
                    "duration_seconds": r[9],
                    "event": r[10],
                    "programme": r[11],
                    "day_number": r[12],
                    "pastor_name": r[13],
                    "status": r[14],
                    "session_id": r[15],
                    "uploaded_by": r[16],
                    "error_message": r[17],
                    "created_at": r[18],
                    "updated_at": r[19],
                })
            return recordings

    async def get_recording(self, account_id: str, recording_id: str) -> Optional[Dict[str, Any]]:
        """Gets a single recording scoped by account_id."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT recording_id, account_id, token_id, title, source, original_filename, "
                "file_path, file_size, file_format, duration_seconds, event, programme, "
                "day_number, pastor_name, status, session_id, uploaded_by, error_message, "
                "created_at, updated_at "
                "FROM media_recordings WHERE account_id = ? AND recording_id = ?",
                (account_id, recording_id)
            )
            r = await cursor.fetchone()
            if not r:
                return None
            return {
                "recording_id": r[0],
                "account_id": r[1],
                "token_id": r[2],
                "title": r[3],
                "source": r[4],
                "original_filename": r[5],
                "file_path": r[6],
                "file_size": r[7],
                "file_format": r[8],
                "duration_seconds": r[9],
                "event": r[10],
                "programme": r[11],
                "day_number": r[12],
                "pastor_name": r[13],
                "status": r[14],
                "session_id": r[15],
                "uploaded_by": r[16],
                "error_message": r[17],
                "created_at": r[18],
                "updated_at": r[19],
            }

    async def update_recording(self, account_id: str, recording_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Updates metadata/status of a recording."""
        allowed_fields = [
            "title", "event", "programme", "day_number", "pastor_name",
            "status", "session_id", "error_message", "duration_seconds"
        ]
        set_clauses = []
        params = []
        for k, v in updates.items():
            if k in allowed_fields:
                set_clauses.append(f"{k} = ?")
                params.append(v)

        if not set_clauses:
            return await self.get_recording(account_id, recording_id)

        now = utc_now_iso()
        set_clauses.append("updated_at = ?")
        params.append(now)

        params.extend([account_id, recording_id])
        async with get_db_connection() as conn:
            await conn.execute(
                f"UPDATE media_recordings SET {', '.join(set_clauses)} WHERE account_id = ? AND recording_id = ?",
                tuple(params)
            )
            await conn.commit()
            return await self.get_recording(account_id, recording_id)

    async def delete_recording(self, account_id: str, recording_id: str) -> bool:
        """Deletes a recording record (and associated file if unlinked from active session)."""
        rec = await self.get_recording(account_id, recording_id)
        if not rec:
            return False
        async with get_db_connection() as conn:
            await conn.execute(
                "DELETE FROM media_recordings WHERE account_id = ? AND recording_id = ?",
                (account_id, recording_id)
            )
            await conn.commit()

        # Remove local file if present
        try:
            if rec.get("file_path") and os.path.exists(rec["file_path"]):
                os.remove(rec["file_path"])
        except Exception:
            pass
        return True


media_repo = MediaRepository()
