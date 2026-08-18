"""
Final Report Repository Layer (Phase 9)

Handles SQLite persistence and revision preservation for:
1. Final Reports derived deterministically from the human-approved Proofread Report.
2. Final Report manual post-finalization adjustments preserved as separate revisions.
3. Tracking DOCX file metadata and session completion.
"""

import time
import uuid
from typing import Any, Dict, List, Optional

from app.database.connection import get_db_connection
from app.database.models import (
    INIT_SCHEMA_SQL,
    PHASE5_MIGRATION_COLUMNS,
    PHASE6_MIGRATION_COLUMNS,
    PHASE7_MIGRATION_COLUMNS,
    PHASE8_MIGRATION_COLUMNS,
    PHASE9_MIGRATION_COLUMNS,
)


class FinalReportRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes database schema and runs Phase 5–9 migrations."""
        async with get_db_connection() as conn:
            await conn.executescript(INIT_SCHEMA_SQL)

            for sql_list in [
                PHASE5_MIGRATION_COLUMNS,
                PHASE6_MIGRATION_COLUMNS,
                PHASE7_MIGRATION_COLUMNS,
                PHASE8_MIGRATION_COLUMNS,
                PHASE9_MIGRATION_COLUMNS,
            ]:
                for sql in sql_list:
                    try:
                        await conn.execute(sql)
                    except Exception:
                        pass

            await conn.commit()
        self._initialized = True

    async def finalize_report(
        self,
        session_id: str,
        proofread_report_revision_id: Optional[str],
        report_title: str,
        report_text: str,
        minister: Optional[str] = None,
        programme: Optional[str] = None,
        service_date: Optional[str] = None,
        docx_filename: Optional[str] = None,
        docx_file_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Creates and stores a new Final Report derived from the approved Proofread Report.
        Preserves existing revisions by incrementing revision_number.
        Updates session status to 'complete'.
        """
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # 1. Calculate next revision number
            cursor = await conn.execute(
                "SELECT MAX(revision_number) FROM final_reports WHERE session_id = ?",
                (session_id,),
            )
            row = await cursor.fetchone()
            current_max = row[0] if (row and row[0] is not None) else 0
            new_rev_num = current_max + 1
            final_report_id = f"final_rep_{session_id}_{new_rev_num}_{int(time.time())}"

            # 2. Deactivate previous active final reports for this session
            await conn.execute(
                "UPDATE final_reports SET is_active = 0 WHERE session_id = ?",
                (session_id,),
            )

            # 3. Insert new Final Report
            await conn.execute(
                """
                INSERT INTO final_reports (
                    id, session_id, proofread_report_revision_id,
                    revision_number, report_title, report_text,
                    minister, programme, service_date,
                    docx_filename, docx_file_size,
                    is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    final_report_id,
                    session_id,
                    proofread_report_revision_id,
                    new_rev_num,
                    report_title.strip(),
                    report_text.strip(),
                    minister,
                    programme,
                    service_date,
                    docx_filename,
                    docx_file_size,
                    now_iso,
                    now_iso,
                ),
            )

            # 4. Update session status
            await conn.execute(
                """
                UPDATE sessions
                SET final_report_status = 'complete',
                    final_report_completed_at = ?,
                    final_report_id = ?
                WHERE session_id = ?
                """,
                (now_iso, final_report_id, session_id),
            )

            await conn.commit()

        return await self.get_final_report_by_id(final_report_id)

    async def save_final_report_revision(
        self,
        session_id: str,
        report_title: str,
        report_text: str,
        minister: Optional[str] = None,
        programme: Optional[str] = None,
        service_date: Optional[str] = None,
        docx_filename: Optional[str] = None,
        docx_file_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Saves a post-finalization human adjustment as a new revision without overwriting earlier ones.
        """
        active_report = await self.get_active_final_report(session_id)
        proofread_id = active_report.get("proofread_report_revision_id") if active_report else None

        return await self.finalize_report(
            session_id=session_id,
            proofread_report_revision_id=proofread_id,
            report_title=report_title,
            report_text=report_text,
            minister=minister or (active_report.get("minister") if active_report else None),
            programme=programme or (active_report.get("programme") if active_report else None),
            service_date=service_date or (active_report.get("service_date") if active_report else None),
            docx_filename=docx_filename,
            docx_file_size=docx_file_size,
        )

    async def get_active_final_report(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Returns the currently active Final Report for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, session_id, proofread_report_revision_id,
                       revision_number, report_title, report_text,
                       minister, programme, service_date,
                       docx_filename, docx_file_size,
                       is_active, created_at, updated_at
                FROM final_reports
                WHERE session_id = ? AND is_active = 1
                LIMIT 1
                """,
                (session_id,),
            )
            row = await cursor.fetchone()
            if row:
                return self._row_to_final_report(row)

            # Fallback to highest revision_number
            cursor = await conn.execute(
                """
                SELECT id, session_id, proofread_report_revision_id,
                       revision_number, report_title, report_text,
                       minister, programme, service_date,
                       docx_filename, docx_file_size,
                       is_active, created_at, updated_at
                FROM final_reports
                WHERE session_id = ?
                ORDER BY revision_number DESC
                LIMIT 1
                """,
                (session_id,),
            )
            row = await cursor.fetchone()
            return self._row_to_final_report(row) if row else None

    async def get_final_report_by_id(self, final_report_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a specific Final Report by its ID."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, session_id, proofread_report_revision_id,
                       revision_number, report_title, report_text,
                       minister, programme, service_date,
                       docx_filename, docx_file_size,
                       is_active, created_at, updated_at
                FROM final_reports
                WHERE id = ?
                """,
                (final_report_id,),
            )
            row = await cursor.fetchone()
            return self._row_to_final_report(row) if row else None

    async def list_final_report_revisions(self, session_id: str) -> List[Dict[str, Any]]:
        """Lists all Final Report revisions for a session in descending order."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, session_id, proofread_report_revision_id,
                       revision_number, report_title, report_text,
                       minister, programme, service_date,
                       docx_filename, docx_file_size,
                       is_active, created_at, updated_at
                FROM final_reports
                WHERE session_id = ?
                ORDER BY revision_number DESC
                """,
                (session_id,),
            )
            rows = await cursor.fetchall()
            return [self._row_to_final_report(r) for r in rows]

    async def activate_final_report_revision(self, session_id: str, final_report_id: str) -> Optional[Dict[str, Any]]:
        """Restores an earlier Final Report revision as active."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT id FROM final_reports WHERE session_id = ? AND id = ?",
                (session_id, final_report_id),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            await conn.execute("UPDATE final_reports SET is_active = 0 WHERE session_id = ?", (session_id,))
            await conn.execute("UPDATE final_reports SET is_active = 1 WHERE id = ?", (final_report_id,))
            await conn.execute(
                "UPDATE sessions SET final_report_id = ? WHERE session_id = ?",
                (final_report_id, session_id),
            )
            await conn.commit()

        return await self.get_final_report_by_id(final_report_id)

    async def update_docx_metadata(self, final_report_id: str, docx_filename: str, docx_file_size: int):
        """Updates the stored docx filename and byte size for a final report."""
        await self.init_db()
        async with get_db_connection() as conn:
            await conn.execute(
                "UPDATE final_reports SET docx_filename = ?, docx_file_size = ? WHERE id = ?",
                (docx_filename, docx_file_size, final_report_id),
            )
            await conn.commit()

    def _row_to_final_report(self, row) -> Dict[str, Any]:
        return {
            "id": row[0],
            "session_id": row[1],
            "proofread_report_revision_id": row[2],
            "revision_number": row[3],
            "report_title": row[4],
            "report_text": row[5],
            "minister": row[6],
            "programme": row[7],
            "service_date": row[8],
            "docx_filename": row[9],
            "docx_file_size": row[10],
            "is_active": bool(row[11]),
            "created_at": row[12],
            "updated_at": row[13],
        }


# Global singleton instance
final_report_repo = FinalReportRepository()
