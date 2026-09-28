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
        """Seeds default programmes and sessions if none exist."""
        async with get_db_connection() as conn:
            async with conn.execute("SELECT COUNT(*) as count FROM programmes;") as cursor:
                row = await cursor.fetchone()
                if row and row["count"] > 0:
                    return

            now = datetime.now(timezone.utc).isoformat()
            for prog_idx, prog_data in enumerate(DEFAULT_SEEDED_PROGRAMMES):
                prog_id = f"prog_{uuid.uuid4().hex[:8]}"
                await conn.execute(
                    """
                    INSERT INTO programmes (id, name, is_archived, sort_order, created_at, updated_at)
                    VALUES (?, ?, 0, ?, ?, ?);
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

    async def get_all_programmes(self, include_archived: bool = False) -> list[dict]:
        """Returns all programmes with their attached sessions."""
        async with get_db_connection() as conn:
            where_prog = "" if include_archived else "WHERE is_archived = 0"
            query_progs = f"""
                SELECT id, name, is_archived, sort_order, created_at, updated_at
                FROM programmes
                {where_prog}
                ORDER BY sort_order ASC, name ASC;
            """
            async with conn.execute(query_progs) as cursor:
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
                result.append({
                    "id": p["id"],
                    "name": p["name"],
                    "is_archived": bool(p["is_archived"]),
                    "sort_order": p["sort_order"],
                    "created_at": p["created_at"],
                    "updated_at": p["updated_at"],
                    "sessions": sess_by_prog.get(p["id"], []),
                })

            return result

    async def get_programme_by_id(self, programme_id: str) -> dict | None:
        """Returns a single programme by ID with its sessions."""
        async with get_db_connection() as conn:
            async with conn.execute(
                "SELECT id, name, is_archived, sort_order, created_at, updated_at FROM programmes WHERE id = ?;",
                (programme_id,),
            ) as cursor:
                p = await cursor.fetchone()
                if not p:
                    return None

            async with conn.execute(
                "SELECT id, programme_id, name, is_archived, sort_order, created_at, updated_at FROM programme_sessions WHERE programme_id = ? ORDER BY sort_order ASC;",
                (programme_id,),
            ) as cursor:
                sess_rows = await cursor.fetchall()

            return {
                "id": p["id"],
                "name": p["name"],
                "is_archived": bool(p["is_archived"]),
                "sort_order": p["sort_order"],
                "created_at": p["created_at"],
                "updated_at": p["updated_at"],
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

    async def create_programme(self, name: str, sort_order: int = 0) -> dict:
        """Creates a new programme."""
        prog_id = f"prog_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO programmes (id, name, is_archived, sort_order, created_at, updated_at)
                VALUES (?, ?, 0, ?, ?, ?);
                """,
                (prog_id, name.strip(), sort_order, now, now),
            )
            await conn.commit()
        return await self.get_programme_by_id(prog_id)

    async def update_programme(
        self,
        programme_id: str,
        name: str | None = None,
        is_archived: bool | None = None,
        sort_order: int | None = None,
    ) -> dict | None:
        """Updates a programme's properties and relationally propagates renames."""
        old_prog = await self.get_programme_by_id(programme_id)
        if not old_prog:
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

        return await self.get_programme_by_id(programme_id)

    async def archive_programme(self, programme_id: str, archive: bool = True) -> dict | None:
        """Soft-archives or unarchives a programme."""
        return await self.update_programme(programme_id, is_archived=archive)

    async def create_programme_session(
        self, programme_id: str, name: str, sort_order: int = 0
    ) -> dict | None:
        """Creates a new session/section under a programme."""
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
        return await self.get_programme_by_id(programme_id)

    async def update_programme_session(
        self,
        session_item_id: str,
        name: str | None = None,
        is_archived: bool | None = None,
        sort_order: int | None = None,
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
            await conn.execute(query, tuple(params))
            await conn.commit()

            # Retrieve programme_id to return full programme
            async with conn.execute(
                "SELECT programme_id FROM programme_sessions WHERE id = ?;",
                (session_item_id,),
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    return await self.get_programme_by_id(row["programme_id"])
        return None

    async def archive_programme_session(
        self, session_item_id: str, archive: bool = True
    ) -> dict | None:
        """Soft-archives or unarchives a session/section."""
        return await self.update_programme_session(session_item_id, is_archived=archive)

    async def reorder_programme_sessions(
        self, programme_id: str, session_ids: list[str]
    ) -> dict | None:
        """Updates sort_order for a list of session/section IDs under a programme."""
        now = datetime.now(timezone.utc).isoformat()
        async with get_db_connection() as conn:
            for idx, s_id in enumerate(session_ids):
                await conn.execute(
                    "UPDATE programme_sessions SET sort_order = ?, updated_at = ? WHERE id = ? AND programme_id = ?;",
                    (idx, now, s_id, programme_id),
                )
            await conn.commit()
        return await self.get_programme_by_id(programme_id)


programmes_repo = ProgrammesRepository()
