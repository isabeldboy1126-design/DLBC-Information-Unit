"""
Programmes and Programme Sessions Repository.

Manages persistent SQLite storage for DLBC Programmes/Events and their
constituent Sessions/Sections.
"""

import uuid
from datetime import datetime, timezone
import aiosqlite

from app.database.connection import get_db_connection
from app.database.models import INIT_SCHEMA_SQL


DEFAULT_SEEDED_PROGRAMMES = [
    {
        "name": "Sunday Worship Service",
        "sessions": ["Sunday Worship Service"],
    },
    {
        "name": "2026 Easter Retreat",
        "sessions": [
            "Faith Clinic",
            "Morning Message",
            "Bible Teaching",
            "Revival Session",
            "Evening Message",
        ],
    },
    {
        "name": "Workers Meeting",
        "sessions": ["Workers Meeting"],
    },
    {
        "name": "Youth Success Camp",
        "sessions": [
            "Morning Session",
            "Seminars / Workshops",
            "Evening Revival",
        ],
    },
    {
        "name": "December Retreat",
        "sessions": [
            "Faith Clinic",
            "Morning Message",
            "Bible Teaching",
            "Revival Session",
            "Evening Message",
        ],
    },
]


class ProgrammesRepository:
    """Repository for managing Programmes and their Sessions/Sections."""

    async def init_db(self):
        """Initializes tables and seeds default programmes if empty."""
        async with get_db_connection() as conn:
            await conn.executescript(INIT_SCHEMA_SQL)
            await conn.commit()
        await self.seed_default_programmes_if_empty()

    async def seed_default_programmes_if_empty(self):
        """Seeds default canonical church programmes and sessions if none exist, or marks canonical defaults as is_system=1."""
        async with get_db_connection() as conn:
            # First, ensure migration columns exist
            for col_sql in [
                "ALTER TABLE programmes ADD COLUMN account_id TEXT",
                "ALTER TABLE programmes ADD COLUMN is_system INTEGER DEFAULT 0",
            ]:
                try:
                    await conn.execute(col_sql)
                except Exception:
                    pass

            # Mark canonical seeded defaults as is_system=1 and account_id='dlbc_system_canonical'
            canonical_names = [p["name"] for p in DEFAULT_SEEDED_PROGRAMMES]
            placeholders = ",".join(["?"] * len(canonical_names))
            await conn.execute(
                f"""
                UPDATE programmes
                SET is_system = 1, account_id = 'dlbc_system_canonical'
                WHERE name IN ({placeholders}) AND (account_id IS NULL OR account_id = '' OR account_id = 'legacy_default_account' OR account_id = 'dlbc_system_canonical');
                """,
                tuple(canonical_names),
            )
            await conn.commit()

            async with conn.execute("SELECT COUNT(*) as count FROM programmes WHERE is_system = 1;") as cursor:
                row = await cursor.fetchone()
                if row and row["count"] > 0:
                    return

            now = datetime.now(timezone.utc).isoformat()
            for prog_idx, prog_data in enumerate(DEFAULT_SEEDED_PROGRAMMES):
                prog_id = f"prog_{uuid.uuid4().hex[:8]}"
                await conn.execute(
                    """
                    INSERT INTO programmes (id, account_id, name, is_system, is_archived, sort_order, created_at, updated_at)
                    VALUES (?, 'dlbc_system_canonical', ?, 1, 0, ?, ?, ?);
                    """,
                    (prog_id, prog_data["name"], prog_idx, now, now),
                )

                for sess_idx, sess_name in enumerate(prog_data["sessions"]):
                    sess_id = f"psess_{uuid.uuid4().hex[:8]}"
                    await conn.execute(
                        """
                        INSERT INTO programme_sessions (id, programme_id, name, is_archived, sort_order, created_at, updated_at)
                        VALUES (?, ?, ?, 0, ?, ?, ?);
                        """,
                        (sess_id, prog_id, sess_name, sess_idx, now, now),
                    )

            await conn.commit()

    async def get_all_programmes(self, account_id: str | None = None, include_archived: bool = False) -> list[dict]:
        """Returns all programmes accessible to the account (canonical system defaults + account custom events)."""
        async with get_db_connection() as conn:
            where_clauses = []
            params = []

            if not include_archived:
                where_clauses.append("is_archived = 0")

            if account_id:
                where_clauses.append("(is_system = 1 OR account_id = ?)")
                params.append(account_id)

            where_prog = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
            query_progs = f"""
                SELECT id, account_id, name, is_system, is_archived, sort_order, created_at, updated_at
                FROM programmes
                {where_prog}
                ORDER BY is_system DESC, sort_order ASC, name ASC;
            """
            async with conn.execute(query_progs, tuple(params)) as cursor:
                prog_rows = await cursor.fetchall()

            where_sess = "" if include_archived else "WHERE is_archived = 0"
            query_sess = f"""
                SELECT id, programme_id, name, is_archived, sort_order, created_at, updated_at
                FROM programme_sessions
                {where_sess}
                ORDER BY sort_order ASC, created_at ASC;
            """
            async with conn.execute(query_sess) as cursor:
                sess_rows = await cursor.fetchall()

            # Group sessions by programme_id
            sess_by_prog = {}
            for s in sess_rows:
                p_id = s["programme_id"]
                if p_id not in sess_by_prog:
                    sess_by_prog[p_id] = []
                sess_by_prog[p_id].append({
                    "id": s["id"],
                    "programme_id": s["programme_id"],
                    "name": s["name"],
                    "is_archived": bool(s["is_archived"]),
                    "sort_order": s["sort_order"],
                    "created_at": s["created_at"],
                    "updated_at": s["updated_at"],
                })

            result = []
            for p in prog_rows:
                p_dict = dict(p)
                result.append({
                    "id": p_dict["id"],
                    "account_id": p_dict.get("account_id"),
                    "name": p_dict["name"],
                    "is_system": bool(p_dict.get("is_system", 0)),
                    "is_archived": bool(p_dict["is_archived"]),
                    "sort_order": p_dict["sort_order"],
                    "created_at": p_dict["created_at"],
                    "updated_at": p_dict["updated_at"],
                    "sessions": sess_by_prog.get(p_dict["id"], []),
                })

            return result

    async def get_programme_by_id(self, programme_id: str, account_id: str | None = None) -> dict | None:
        """Returns a single programme by ID with its sessions if accessible to the account."""
        async with get_db_connection() as conn:
            if account_id:
                query = "SELECT id, account_id, name, is_system, is_archived, sort_order, created_at, updated_at FROM programmes WHERE id = ? AND (is_system = 1 OR account_id = ?);"
                params = (programme_id, account_id)
            else:
                query = "SELECT id, account_id, name, is_system, is_archived, sort_order, created_at, updated_at FROM programmes WHERE id = ?;"
                params = (programme_id,)

            async with conn.execute(query, params) as cursor:
                p = await cursor.fetchone()
                if not p:
                    return None

            async with conn.execute(
                "SELECT id, programme_id, name, is_archived, sort_order, created_at, updated_at FROM programme_sessions WHERE programme_id = ? ORDER BY sort_order ASC;",
                (programme_id,),
            ) as cursor:
                sess_rows = await cursor.fetchall()

            p_dict = dict(p)
            return {
                "id": p_dict["id"],
                "account_id": p_dict.get("account_id"),
                "name": p_dict["name"],
                "is_system": bool(p_dict.get("is_system", 0)),
                "is_archived": bool(p_dict["is_archived"]),
                "sort_order": p_dict["sort_order"],
                "created_at": p_dict["created_at"],
                "updated_at": p_dict["updated_at"],
                "sessions": [
                    {
                        "id": s["id"],
                        "programme_id": s["programme_id"],
                        "name": s["name"],
                        "is_archived": bool(s["is_archived"]),
                        "sort_order": s["sort_order"],
                        "created_at": s["created_at"],
                        "updated_at": s["updated_at"],
                    }
                    for s in sess_rows
                ],
            }

    async def create_programme(self, name: str, sort_order: int = 0, account_id: str | None = None) -> dict:
        """Creates a new programme scoped to an account."""
        prog_id = f"prog_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO programmes (id, account_id, name, is_system, is_archived, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, 0, 0, ?, ?, ?);
                """,
                (prog_id, account_id, name.strip(), sort_order, now, now),
            )
            await conn.commit()
        return await self.get_programme_by_id(prog_id, account_id=account_id)

    async def update_programme(
        self,
        programme_id: str,
        account_id: str | None = None,
        name: str | None = None,
        is_archived: bool | None = None,
        sort_order: int | None = None,
    ) -> dict | None:
        """Updates a programme's properties and relationally propagates renames."""
        old_prog = await self.get_programme_by_id(programme_id, account_id=account_id)
        if not old_prog:
            return None
        if old_prog.get("is_system"):
            # System canonical events cannot be renamed or archived
            return None
        if account_id and old_prog.get("account_id") and old_prog.get("account_id") != account_id:
            return None

        old_name = old_prog.get("name")
        now = datetime.now(timezone.utc).isoformat()
        updates = ["updated_at = ?"]
        params = [now]

        if name is not None:
            updates.append("name = ?")
            params.append(name.strip())
        if is_archived is not None:
            updates.append("is_archived = ?")
            params.append(1 if is_archived else 0)
        if sort_order is not None:
            updates.append("sort_order = ?")
            params.append(sort_order)

        params.append(programme_id)
        query = f"UPDATE programmes SET {', '.join(updates)} WHERE id = ?;"

        async with get_db_connection() as conn:
            await conn.execute(query, tuple(params))

            # Relational rename propagation across sessions
            if name is not None and old_name and name.strip() != old_name:
                import json
                new_name = name.strip()
                cursor = await conn.execute(
                    "SELECT session_id, metadata_json FROM sessions WHERE event_id = ? OR metadata_json LIKE ? OR metadata_json LIKE ?",
                    (programme_id, f"%{programme_id}%", f"%{old_name}%"),
                )
                session_rows = await cursor.fetchall()
                for s_row in session_rows:
                    try:
                        s_meta = json.loads(s_row["metadata_json"] or "{}")
                        if (
                            s_meta.get("programme_id") == programme_id
                            or s_meta.get("event_id") == programme_id
                            or s_meta.get("programme") == old_name
                            or s_meta.get("programme_name") == old_name
                        ):
                            s_meta["programme"] = new_name
                            s_meta["programme_name"] = new_name
                            await conn.execute(
                                "UPDATE sessions SET metadata_json = ? WHERE session_id = ?",
                                (json.dumps(s_meta), s_row["session_id"]),
                            )
                    except Exception:
                        pass

            await conn.commit()

        return await self.get_programme_by_id(programme_id, account_id=account_id)

    async def archive_programme(self, programme_id: str, account_id: str | None = None, archive: bool = True) -> dict | None:
        """Soft-archives or unarchives a programme."""
        return await self.update_programme(programme_id, account_id=account_id, is_archived=archive)

    async def create_programme_session(
        self, programme_id: str, name: str, sort_order: int = 0, account_id: str | None = None
    ) -> dict | None:
        """Creates a new session/section under a programme."""
        parent = await self.get_programme_by_id(programme_id, account_id=account_id)
        if not parent:
            return None
        sess_id = f"psess_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO programme_sessions (id, programme_id, name, is_archived, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?);
                """,
                (sess_id, programme_id, name.strip(), sort_order, now, now),
            )
            await conn.commit()
        return await self.get_programme_by_id(programme_id, account_id=account_id)

    async def update_programme_session(
        self,
        session_item_id: str,
        name: str | None = None,
        is_archived: bool | None = None,
        sort_order: int | None = None,
        account_id: str | None = None,
    ) -> dict | None:
        """Updates a session/section item."""
        now = datetime.now(timezone.utc).isoformat()
        updates = ["updated_at = ?"]
        params = [now]

        if name is not None:
            updates.append("name = ?")
            params.append(name.strip())
        if is_archived is not None:
            updates.append("is_archived = ?")
            params.append(1 if is_archived else 0)
        if sort_order is not None:
            updates.append("sort_order = ?")
            params.append(sort_order)

        params.append(session_item_id)
        query = f"UPDATE programme_sessions SET {', '.join(updates)} WHERE id = ?;"

        async with get_db_connection() as conn:
            # Check parent ownership
            cur_p = await conn.execute("SELECT programme_id FROM programme_sessions WHERE id = ?", (session_item_id,))
            p_row = await cur_p.fetchone()
            if not p_row:
                return None
            parent = await self.get_programme_by_id(p_row[0], account_id=account_id)
            if not parent:
                return None

            await conn.execute(query, tuple(params))
            await conn.commit()
            return await self.get_programme_by_id(p_row[0], account_id=account_id)

    async def archive_programme_session(
        self, session_item_id: str, account_id: str | None = None, archive: bool = True
    ) -> dict | None:
        """Soft-archives or unarchives a session/section."""
        return await self.update_programme_session(session_item_id, account_id=account_id, is_archived=archive)

    async def reorder_programme_sessions(
        self, programme_id: str, session_ids: list[str], account_id: str | None = None
    ) -> dict | None:
        """Updates sort_order for a list of session/section IDs under a programme."""
        parent = await self.get_programme_by_id(programme_id, account_id=account_id)
        if not parent:
            return None
        now = datetime.now(timezone.utc).isoformat()
        async with get_db_connection() as conn:
            for idx, s_id in enumerate(session_ids):
                await conn.execute(
                    "UPDATE programme_sessions SET sort_order = ?, updated_at = ? WHERE id = ? AND programme_id = ?;",
                    (idx, now, s_id, programme_id),
                )
            await conn.commit()
        return await self.get_programme_by_id(programme_id, account_id=account_id)

    async def delete_programme_permanent(self, programme_id: str, account_id: str | None = None) -> bool:
        """Permanently deletes a custom programme and its child programme_sessions. Protects system canonical programmes."""
        async with get_db_connection() as conn:
            if account_id:
                chk = await conn.execute(
                    "SELECT id, is_system, account_id FROM programmes WHERE id = ? AND (is_system = 0 OR is_system IS NULL) AND account_id = ?",
                    (programme_id, account_id),
                )
            else:
                chk = await conn.execute("SELECT id, is_system, account_id FROM programmes WHERE id = ? AND (is_system = 0 OR is_system IS NULL)", (programme_id,))
            row = await chk.fetchone()
            if not row:
                return False

            await conn.execute("DELETE FROM programme_sessions WHERE programme_id = ?", (programme_id,))
            await conn.execute("DELETE FROM programmes WHERE id = ?", (programme_id,))
            await conn.commit()
            return True

    async def delete_programme_session_permanent(self, session_item_id: str, account_id: str | None = None) -> bool:
        """Permanently deletes a programme session item."""
        async with get_db_connection() as conn:
            cur_p = await conn.execute("SELECT programme_id FROM programme_sessions WHERE id = ?", (session_item_id,))
            p_row = await cur_p.fetchone()
            if not p_row:
                return False
            parent = await self.get_programme_by_id(p_row[0], account_id=account_id)
            if not parent or parent.get("is_system"):
                return False

            await conn.execute("DELETE FROM programme_sessions WHERE id = ?", (session_item_id,))
            await conn.commit()
            return True


programmes_repo = ProgrammesRepository()
