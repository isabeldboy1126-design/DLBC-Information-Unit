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


def extract_image_metadata(file_path: str) -> Dict[str, Any]:
    """Extracts width, height, and MIME type without external dependencies."""
    width, height = 0, 0
    mime = "application/octet-stream"
    try:
        with open(file_path, "rb") as f:
            header = f.read(32)
            if header.startswith(b"\x89PNG\r\n\x1a\n"):
                mime = "image/png"
                import struct
                width, height = struct.unpack(">II", header[16:24])
            elif header.startswith(b"\xff\xd8"):
                mime = "image/jpeg"
                import struct
                f.seek(2)
                b = f.read(1)
                while b:
                    while b != b"\xff":
                        b = f.read(1)
                    while b == b"\xff":
                        b = f.read(1)
                    if not b:
                        break
                    marker = ord(b)
                    if 0xC0 <= marker <= 0xC3:
                        f.read(3)
                        h, w = struct.unpack(">HH", f.read(4))
                        width, height = w, h
                        break
                    else:
                        len_data = f.read(2)
                        if len(len_data) < 2:
                            break
                        seg_len = struct.unpack(">H", len_data)[0]
                        f.seek(seg_len - 2, 1)
                    b = f.read(1)
            elif header.startswith(b"RIFF") and header[8:12] == b"WEBP":
                mime = "image/webp"
                import struct
                f.seek(12)
                chunk_header = f.read(4)
                if chunk_header == b"VP8 ":
                    f.seek(26)
                    w, h = struct.unpack("<HH", f.read(4))
                    width = w & 0x3FFF
                    height = h & 0x3FFF
                elif chunk_header == b"VP8L":
                    f.seek(21)
                    b0, b1, b2, b3 = struct.unpack("BBBB", f.read(4))
                    width = 1 + (((b1 & 0x3F) << 8) | b0)
                    height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
                elif chunk_header == b"VP8X":
                    f.seek(24)
                    w = int.from_bytes(f.read(3), "little") + 1
                    h = int.from_bytes(f.read(3), "little") + 1
                    width, height = w, h
    except Exception:
        pass
    return {"width": width, "height": height, "mime_type": mime}


class MediaRepository:
    async def init_db(self):
        """Creates media tables if they do not already exist."""
        async with get_db_connection() as conn:
            is_mssql = bool(os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL").startswith("sqlite"))
            if is_mssql:
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
                    """
                    IF OBJECT_ID(N'media_submissions', N'U') IS NULL
                    CREATE TABLE media_submissions (
                        submission_id VARCHAR(255) PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        token_id VARCHAR(255),
                        sender_name NVARCHAR(255),
                        note NVARCHAR(MAX),
                        programme NVARCHAR(MAX),
                        event NVARCHAR(MAX),
                        day_number INT,
                        created_at VARCHAR(255) NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_subs_account')
                    CREATE INDEX idx_media_subs_account ON media_submissions(account_id);
                    """,
                    """
                    IF OBJECT_ID(N'media_assets', N'U') IS NULL
                    CREATE TABLE media_assets (
                        asset_id VARCHAR(255) PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        submission_id VARCHAR(255),
                        asset_type VARCHAR(50) NOT NULL,
                        original_filename NVARCHAR(MAX),
                        file_path NVARCHAR(MAX) NOT NULL,
                        file_size BIGINT DEFAULT 0,
                        mime_type VARCHAR(100),
                        width INT DEFAULT 0,
                        height INT DEFAULT 0,
                        duration_seconds FLOAT DEFAULT 0,
                        title NVARCHAR(MAX),
                        caption NVARCHAR(MAX),
                        status VARCHAR(50) NOT NULL DEFAULT 'ready',
                        created_at VARCHAR(255) NOT NULL,
                        updated_at VARCHAR(255) NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_assets_account')
                    CREATE INDEX idx_media_assets_account ON media_assets(account_id, asset_type);
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_assets_submission')
                    CREATE INDEX idx_media_assets_submission ON media_assets(submission_id);
                    """,
                    """
                    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_media_assets_created')
                    CREATE INDEX idx_media_assets_created ON media_assets(created_at DESC);
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
                    """
                    CREATE TABLE IF NOT EXISTS media_submissions (
                        submission_id TEXT PRIMARY KEY,
                        account_id TEXT NOT NULL,
                        token_id TEXT,
                        sender_name TEXT,
                        note TEXT,
                        programme TEXT,
                        event TEXT,
                        day_number INTEGER,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    "CREATE INDEX IF NOT EXISTS idx_media_subs_account ON media_submissions(account_id);",
                    """
                    CREATE TABLE IF NOT EXISTS media_assets (
                        asset_id TEXT PRIMARY KEY,
                        account_id TEXT NOT NULL,
                        submission_id TEXT,
                        asset_type TEXT NOT NULL,
                        original_filename TEXT,
                        file_path TEXT NOT NULL,
                        file_size INTEGER DEFAULT 0,
                        mime_type TEXT,
                        width INTEGER DEFAULT 0,
                        height INTEGER DEFAULT 0,
                        duration_seconds REAL DEFAULT 0,
                        title TEXT,
                        caption TEXT,
                        status TEXT NOT NULL DEFAULT 'ready',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                    );
                    """,
                    "CREATE INDEX IF NOT EXISTS idx_media_assets_account ON media_assets(account_id, asset_type);",
                    "CREATE INDEX IF NOT EXISTS idx_media_assets_submission ON media_assets(submission_id);",
                    "CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);",
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
            cursor = await conn.execute(
                "SELECT token_id, account_id, token, label, pin_code, is_active, created_at, updated_at "
                "FROM media_upload_tokens WHERE account_id = ? AND is_active = 1 ORDER BY created_at DESC",
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
                "INSERT INTO media_upload_tokens (token_id, account_id, token, label, pin_code, is_active, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
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

    async def revoke_token(self, account_id: str) -> bool:
        """Revokes all active media upload tokens for the account."""
        async with get_db_connection() as conn:
            now = utc_now_iso()
            await conn.execute(
                "UPDATE media_upload_tokens SET is_active = 0, updated_at = ? WHERE account_id = ?",
                (now, account_id),
            )
            await conn.commit()
            return True

    async def create_submission(
        self,
        account_id: str,
        token_id: Optional[str] = None,
        sender_name: Optional[str] = None,
        note: Optional[str] = None,
        programme: Optional[str] = None,
        event: Optional[str] = None,
        day_number: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Creates a container record for a batch of uploaded media assets."""
        sub_id = f"sub_{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO media_submissions (
                    submission_id, account_id, token_id, sender_name, note,
                    programme, event, day_number, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sub_id, account_id, token_id, sender_name, note,
                    programme, event, day_number, now
                ),
            )
            await conn.commit()
            return {
                "submission_id": sub_id,
                "account_id": account_id,
                "token_id": token_id,
                "sender_name": sender_name,
                "note": note,
                "programme": programme,
                "event": event,
                "day_number": day_number,
                "created_at": now,
            }

    async def create_asset(
        self,
        account_id: str,
        file_path: str,
        original_filename: str,
        file_size: int,
        mime_type: str,
        asset_type: str = "photo",
        submission_id: Optional[str] = None,
        width: int = 0,
        height: int = 0,
        duration_seconds: float = 0.0,
        title: Optional[str] = None,
        caption: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates a single media asset record (photo or audio)."""
        asset_id = f"ast_{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        clean_title = title or original_filename
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO media_assets (
                    asset_id, account_id, submission_id, asset_type, original_filename,
                    file_path, file_size, mime_type, width, height, duration_seconds,
                    title, caption, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
                """,
                (
                    asset_id, account_id, submission_id, asset_type, original_filename,
                    file_path, file_size, mime_type, width, height, duration_seconds,
                    clean_title, caption, now, now
                ),
            )
            await conn.commit()
            return {
                "asset_id": asset_id,
                "account_id": account_id,
                "submission_id": submission_id,
                "asset_type": asset_type,
                "original_filename": original_filename,
                "file_path": file_path,
                "file_size": file_size,
                "mime_type": mime_type,
                "width": width,
                "height": height,
                "duration_seconds": duration_seconds,
                "title": clean_title,
                "caption": caption,
                "status": "ready",
                "created_at": now,
                "updated_at": now,
            }

    async def list_assets(
        self,
        account_id: str,
        asset_type: Optional[str] = None,
        search_query: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists media assets for an account, with optional submission metadata joined."""
        async with get_db_connection() as conn:
            query = (
                "SELECT a.asset_id, a.account_id, a.submission_id, a.asset_type, a.original_filename, "
                "a.file_path, a.file_size, a.mime_type, a.width, a.height, a.duration_seconds, "
                "a.title, a.caption, a.status, a.created_at, a.updated_at, "
                "s.sender_name, s.note, s.programme, s.event, s.day_number "
                "FROM media_assets a "
                "LEFT JOIN media_submissions s ON a.submission_id = s.submission_id "
                "WHERE a.account_id = ?"
            )
            params: List[Any] = [account_id]
            if asset_type and asset_type != "all":
                query += " AND a.asset_type = ?"
                params.append(asset_type)
            if search_query and search_query.strip():
                p = f"%{search_query.strip()}%"
                query += " AND (a.title LIKE ? OR a.original_filename LIKE ? OR s.sender_name LIKE ? OR s.programme LIKE ?)"
                params.extend([p, p, p, p])

            query += " ORDER BY a.created_at DESC"
            cursor = await conn.execute(query, tuple(params))
            rows = await cursor.fetchall()

            assets = []
            for r in rows:
                assets.append({
                    "asset_id": r[0],
                    "account_id": r[1],
                    "submission_id": r[2],
                    "asset_type": r[3],
                    "original_filename": r[4],
                    "file_path": r[5],
                    "file_size": r[6],
                    "mime_type": r[7],
                    "width": r[8],
                    "height": r[9],
                    "duration_seconds": r[10],
                    "title": r[11],
                    "caption": r[12],
                    "status": r[13],
                    "created_at": r[14],
                    "updated_at": r[15],
                    "sender_name": r[16],
                    "note": r[17],
                    "programme": r[18],
                    "event": r[19],
                    "day_number": r[20],
                })
            return assets

    async def get_asset(self, account_id: str, asset_id: str) -> Optional[Dict[str, Any]]:
        """Gets a single media asset with submission metadata."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT a.asset_id, a.account_id, a.submission_id, a.asset_type, a.original_filename, "
                "a.file_path, a.file_size, a.mime_type, a.width, a.height, a.duration_seconds, "
                "a.title, a.caption, a.status, a.created_at, a.updated_at, "
                "s.sender_name, s.note, s.programme, s.event, s.day_number "
                "FROM media_assets a "
                "LEFT JOIN media_submissions s ON a.submission_id = s.submission_id "
                "WHERE a.account_id = ? AND a.asset_id = ?",
                (account_id, asset_id),
            )
            r = await cursor.fetchone()
            if not r:
                return None
            return {
                "asset_id": r[0],
                "account_id": r[1],
                "submission_id": r[2],
                "asset_type": r[3],
                "original_filename": r[4],
                "file_path": r[5],
                "file_size": r[6],
                "mime_type": r[7],
                "width": r[8],
                "height": r[9],
                "duration_seconds": r[10],
                "title": r[11],
                "caption": r[12],
                "status": r[13],
                "created_at": r[14],
                "updated_at": r[15],
                "sender_name": r[16],
                "note": r[17],
                "programme": r[18],
                "event": r[19],
                "day_number": r[20],
            }

    async def delete_asset(self, account_id: str, asset_id: str) -> bool:
        """Deletes an asset record and removes its physical file from disk."""
        asset = await self.get_asset(account_id, asset_id)
        if not asset:
            return False
        async with get_db_connection() as conn:
            await conn.execute(
                "DELETE FROM media_assets WHERE account_id = ? AND asset_id = ?",
                (account_id, asset_id),
            )
            await conn.commit()

        try:
            if asset.get("file_path") and os.path.exists(asset["file_path"]):
                os.remove(asset["file_path"])
        except Exception:
            pass
        return True

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
