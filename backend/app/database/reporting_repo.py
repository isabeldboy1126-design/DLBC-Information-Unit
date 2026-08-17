"""
Reporting Repository Layer (Phase 6)

Handles SQLite persistence and versioning for:
1. Versioned Reporting Standards (editable guidelines, role instructions, glossary, examples).
2. Derivative Reports (Reporter A and Reporter B drafts linked to Session & Verified Transcript).
"""

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from app.database.connection import get_db_connection
from app.database.models import INIT_SCHEMA_SQL, PHASE5_MIGRATION_COLUMNS, PHASE6_MIGRATION_COLUMNS


DEFAULT_GENERAL_GUIDELINES = """# Information Unit Reporting Guidelines

## 1. Purpose & Standards
The Information Unit produces clear, faithful, and well-structured reports of preached messages during church programmes. Reports serve church members, media channels, and future publications.

## 2. Structural Requirements
A standard Information Unit report must include:
- **Title / Topic**: Clear, bold message topic as announced or derived from the central theme.
- **Minister / Speaker**: Name and title of the minister (e.g., Pastor W.F. Kumuyi).
- **Text / Anchor Scripture**: Primary Bible passage(s) referenced.
- **Introduction**: Brief context and overarching spiritual thrust of the sermon.
- **Main Points & Sub-points**: Sequential or thematic breakdown of the preacher's outline with supporting Scripture references and explanations.
- **Exhortation & Practical Application**: Concrete spiritual lessons and call to action.
- **Conclusion**: Summary and closing prayer emphasis.

## 3. Style & Tone
- Clear, reverent, objective, and inspiring.
- Write in standard, grammatically sound English with active voice.
- Eliminate spoken filler words, conversational pauses, and repetitive administrative announcements while preserving all spiritual content.
- Ensure all Scripture references (Book, Chapter, Verse) are accurately transcribed.
"""

DEFAULT_REPORTER_A_INSTRUCTIONS = """# Reporter A — Main Message & Structure Instructions

## Primary Focus
Your objective is to produce a coherent, well-structured Information Unit report that captures the core message and logical flow of the sermon.

## Key Responsibilities:
1. **Central Message**: Clearly identify and state the main theme and spiritual purpose of the message.
2. **Main Points & Structure**: Organize the report around the preacher's major points, divisions, and sub-points. Follow the chronological or thematic sequence of the preaching.
3. **Core Statements**: Highlight profound doctrinal, biblical, and spiritual declarations made by the preacher.
4. **Scripture Anchors**: Include all primary Scripture passages that form the foundation of the message.
5. **Concise Cohesion**: Eliminate conversational filler and spoken repetition, providing a clean, professional narrative.
"""

DEFAULT_REPORTER_B_INSTRUCTIONS = """# Reporter B — Detail & Omission Watch Instructions

## Primary Focus
Your objective is to independently report the sermon with special vigilance for specific facts, illustrations, names, numbers, and supporting details that a summary reporter might overlook.

## Key Responsibilities:
1. **Supporting Details**: Record specific facts, figures, dates, historical references, and contextual explanations provided by the speaker.
2. **Illustrations & Real-Life Examples**: Capture the essence of stories, parables, testimonies, and personal or biblical illustrations used to explain points.
3. **Comprehensive Scripture References**: Note all secondary and referenced Bible verses quoted or alluded to during the sermon.
4. **Direct Quotes & Vivid Statements**: Preserve striking phrases, vivid metaphors, and specific warnings or promises articulated by the preacher.
5. **Transitions & Nuances**: Highlight important transitional thoughts and practical examples that add depth to the main teaching.
"""

DEFAULT_TERMINOLOGY = """# Church Terminology & Glossary

- **Pastor W.F. Kumuyi**: General Superintendent, Deeper Christian Life Ministry
- **DLBC**: Deeper Life Bible Church
- **DCLM**: Deeper Christian Life Ministry
- **Information Unit**: The reporting and press unit responsible for message documentation
- **GCK**: Global Crusade with Kumuyi
- **Sunday Worship Service (SWS)**: Weekly Sunday service
- **Monday Bible Study (MBS)**: Weekly systematic expository teaching service
- **Revival and Evangelism Training Service (RETS)**: Weekly Thursday service
- **National December Retreat**: Annual multi-day spiritual retreat
- **Youth Success Camp (YSC)**: Annual youth conference
- **Ministers' Conference / Ministers' Development**: Leadership training sessions
- **Key Doctrinal Terms**: Salvation, Sanctification, Holy Ghost Baptism, Restitution, Consecration, Total Deliverance, Divine Healing, Second Coming of Christ, Great Commission
"""

DEFAULT_APPROVED_EXAMPLES = """# Approved Report Example

**Topic**: The Transforming Power of the Uncompromised Word
**Minister**: Pastor W.F. Kumuyi
**Text**: 2 Timothy 3:14-17; Hebrews 4:12

### Overview
The man of God emphasized the enduring efficacy and divine inspiration of the Holy Scriptures. True transformation and lasting spiritual fruitfulness occur when believers receive, obey, and continue in the uncompromised Word of God.

### 1. The Divine Inspiration and Authority of the Word (2 Tim 3:14-15)
- The Scriptures are God-breathed, providing infallible guidance for faith and practice.
- Early grounding in biblical truth protects believers against modern deception and spiritual compromise.
- Illustration: Timothy's early foundation through his grandmother Lois and mother Eunice (2 Tim 1:5).

### 2. The Total Sufficiency of Scripture for Christian Growth (2 Tim 3:16-17)
- The Word of God is profitable for:
  1. Doctrine (foundation of faith)
  2. Reproof (conviction of sin)
  3. Correction (restoration to the right path)
  4. Instruction in righteousness (daily holy living)
- The goal is the complete maturity and spiritual equipping of the believer for every good work.

### Conclusion & Exhortation
Believers were charged to make the Word of God their constant companion, meditate on it daily, and walk in total obedience to experience God's promised blessings.
"""


class ReportingRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes database schema and seeds initial Reporting Standard v1 if empty."""
        async with get_db_connection() as conn:
            await conn.executescript(INIT_SCHEMA_SQL)

            # Apply Phase 5 migrations
            for sql in PHASE5_MIGRATION_COLUMNS:
                try:
                    await conn.execute(sql)
                except Exception:
                    pass

            # Apply Phase 6 migrations
            for sql in PHASE6_MIGRATION_COLUMNS:
                try:
                    await conn.execute(sql)
                except Exception:
                    pass

            # Check if any reporting standards exist; if none, seed default v1
            cursor = await conn.execute("SELECT COUNT(*) FROM reporting_standards")
            row = await cursor.fetchone()
            count = row[0] if row else 0

            if count == 0:
                std_id = f"std_v1_{uuid.uuid4().hex[:6]}"
                now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                await conn.execute(
                    """
                    INSERT INTO reporting_standards (
                        id, version, version_label, is_active,
                        general_guidelines, reporter_a_instructions,
                        reporter_b_instructions, terminology, examples,
                        notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        std_id,
                        1,
                        "v1",
                        1,
                        DEFAULT_GENERAL_GUIDELINES.strip(),
                        DEFAULT_REPORTER_A_INSTRUCTIONS.strip(),
                        DEFAULT_REPORTER_B_INSTRUCTIONS.strip(),
                        DEFAULT_TERMINOLOGY.strip(),
                        DEFAULT_APPROVED_EXAMPLES.strip(),
                        "Initial default Information Unit Reporting Standard (v1)",
                        now_iso,
                    ),
                )

            await conn.commit()
        self._initialized = True

    # -------------------------------------------------------------------------
    # Reporting Standards Methods
    # -------------------------------------------------------------------------

    async def get_active_standard(self) -> Dict[str, Any]:
        """Returns the currently active Reporting Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, reporter_a_instructions,
                       reporter_b_instructions, terminology, examples,
                       notes, created_at
                FROM reporting_standards
                WHERE is_active = 1
                ORDER BY version DESC
                LIMIT 1
                """
            )
            row = await cursor.fetchone()
            if row:
                return self._row_to_standard(row)

            # Fallback to highest version if none is marked active
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, reporter_a_instructions,
                       reporter_b_instructions, terminology, examples,
                       notes, created_at
                FROM reporting_standards
                ORDER BY version DESC
                LIMIT 1
                """
            )
            row = await cursor.fetchone()
            if row:
                return self._row_to_standard(row)

        raise RuntimeError("No Reporting Standard found in database.")

    async def get_standard_by_version(self, version: int) -> Optional[Dict[str, Any]]:
        """Returns a specific version of the Reporting Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, reporter_a_instructions,
                       reporter_b_instructions, terminology, examples,
                       notes, created_at
                FROM reporting_standards
                WHERE version = ?
                """,
                (version,),
            )
            row = await cursor.fetchone()
            return self._row_to_standard(row) if row else None

    async def list_standards(self) -> List[Dict[str, Any]]:
        """Returns all versions of the Reporting Standard ordered by version descending."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, reporter_a_instructions,
                       reporter_b_instructions, terminology, examples,
                       notes, created_at
                FROM reporting_standards
                ORDER BY version DESC
                """
            )
            rows = await cursor.fetchall()
            return [self._row_to_standard(r) for r in rows]

    async def create_new_standard_version(
        self,
        general_guidelines: str,
        reporter_a_instructions: str,
        reporter_b_instructions: str,
        terminology: str,
        examples: str,
        notes: Optional[str] = None,
        set_active: bool = True,
    ) -> Dict[str, Any]:
        """Creates a new incremented version of the Reporting Standard, preserving previous versions."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute("SELECT MAX(version) FROM reporting_standards")
            row = await cursor.fetchone()
            current_max = row[0] if (row and row[0] is not None) else 0
            new_version = current_max + 1
            new_id = f"std_v{new_version}_{uuid.uuid4().hex[:6]}"
            version_label = f"v{new_version}"
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            if set_active:
                await conn.execute("UPDATE reporting_standards SET is_active = 0")

            await conn.execute(
                """
                INSERT INTO reporting_standards (
                    id, version, version_label, is_active,
                    general_guidelines, reporter_a_instructions,
                    reporter_b_instructions, terminology, examples,
                    notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    new_version,
                    version_label,
                    1 if set_active else 0,
                    general_guidelines.strip(),
                    reporter_a_instructions.strip(),
                    reporter_b_instructions.strip(),
                    terminology.strip(),
                    examples.strip(),
                    notes.strip() if notes else f"Version {version_label} updates",
                    now_iso,
                ),
            )
            await conn.commit()

        return await self.get_standard_by_version(new_version)

    async def activate_standard_version(self, version: int) -> Optional[Dict[str, Any]]:
        """Activates a specific version of the Reporting Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute("SELECT id FROM reporting_standards WHERE version = ?", (version,))
            row = await cursor.fetchone()
            if not row:
                return None

            await conn.execute("UPDATE reporting_standards SET is_active = 0")
            await conn.execute("UPDATE reporting_standards SET is_active = 1 WHERE version = ?", (version,))
            await conn.commit()

        return await self.get_standard_by_version(version)

    def _row_to_standard(self, row) -> Dict[str, Any]:
        return {
            "id": row[0],
            "version": row[1],
            "version_label": row[2],
            "is_active": bool(row[3]),
            "general_guidelines": row[4],
            "reporter_a_instructions": row[5],
            "reporter_b_instructions": row[6],
            "terminology": row[7],
            "examples": row[8],
            "notes": row[9],
            "created_at": row[10],
        }

    # -------------------------------------------------------------------------
    # Reports Persistence Methods
    # -------------------------------------------------------------------------

    async def save_report(
        self,
        session_id: str,
        reporter_role: str,
        standard_version: int,
        standard_version_label: str,
        status: str,
        report_title: Optional[str] = None,
        report_text: Optional[str] = None,
        transcript_id: Optional[str] = None,
        key_points: Optional[List[str]] = None,
        scriptures: Optional[List[str]] = None,
        warnings: Optional[List[str]] = None,
        evidence_metadata: Optional[Dict[str, Any]] = None,
        model_name: Optional[str] = None,
        error_message: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Saves a generated or in-progress report for a session and role."""
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        final_report_id = report_id or f"rep_{session_id}_{reporter_role}_{int(time.time())}"

        async with get_db_connection() as conn:
            # Mark any prior report for this session & role as not active
            await conn.execute(
                """
                UPDATE reports SET is_active = 0
                WHERE session_id = ? AND reporter_role = ?
                """,
                (session_id, reporter_role),
            )

            # Insert new report revision
            await conn.execute(
                """
                INSERT INTO reports (
                    report_id, session_id, transcript_id, reporter_role,
                    standard_version, standard_version_label, status,
                    report_title, report_text, key_points_json,
                    scriptures_json, warnings_json, evidence_metadata_json,
                    model_name, error_message, is_active,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    final_report_id,
                    session_id,
                    transcript_id,
                    reporter_role,
                    standard_version,
                    standard_version_label,
                    status,
                    report_title,
                    report_text,
                    json.dumps(key_points or []),
                    json.dumps(scriptures or []),
                    json.dumps(warnings or []),
                    json.dumps(evidence_metadata or {}),
                    model_name,
                    error_message,
                    now_iso,
                    now_iso,
                ),
            )

            await conn.commit()

        # Update the session workflow status
        await self.update_session_reporting_status(session_id)
        return await self.get_report(final_report_id)

    async def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single report by ID."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT report_id, session_id, transcript_id, reporter_role,
                       standard_version, standard_version_label, status,
                       report_title, report_text, key_points_json,
                       scriptures_json, warnings_json, evidence_metadata_json,
                       model_name, error_message, is_active, created_at, updated_at
                FROM reports
                WHERE report_id = ?
                """,
                (report_id,),
            )
            row = await cursor.fetchone()
            return self._row_to_report(row) if row else None

    async def get_active_reports_for_session(self, session_id: str) -> Dict[str, Optional[Dict[str, Any]]]:
        """Returns the active reports for Reporter A and Reporter B for a given session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT report_id, session_id, transcript_id, reporter_role,
                       standard_version, standard_version_label, status,
                       report_title, report_text, key_points_json,
                       scriptures_json, warnings_json, evidence_metadata_json,
                       model_name, error_message, is_active, created_at, updated_at
                FROM reports
                WHERE session_id = ? AND is_active = 1
                ORDER BY created_at DESC
                """,
                (session_id,),
            )
            rows = await cursor.fetchall()
            reports_map = {"reporter_a": None, "reporter_b": None}
            for row in rows:
                rep = self._row_to_report(row)
                role = rep.get("reporter_role")
                if role in reports_map and reports_map[role] is None:
                    reports_map[role] = rep

            return reports_map

    async def list_reports_history_for_session(self, session_id: str) -> List[Dict[str, Any]]:
        """Returns the full revision history of all generated reports for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT report_id, session_id, transcript_id, reporter_role,
                       standard_version, standard_version_label, status,
                       report_title, report_text, key_points_json,
                       scriptures_json, warnings_json, evidence_metadata_json,
                       model_name, error_message, is_active, created_at, updated_at
                FROM reports
                WHERE session_id = ?
                ORDER BY created_at DESC
                """,
                (session_id,),
            )
            rows = await cursor.fetchall()
            return [self._row_to_report(r) for r in rows]

    async def update_session_reporting_status(self, session_id: str) -> str:
        """Calculates and updates the session reporting_status column."""
        await self.init_db()
        active = await self.get_active_reports_for_session(session_id)
        rep_a = active.get("reporter_a")
        rep_b = active.get("reporter_b")

        status_a = rep_a.get("status") if rep_a else None
        status_b = rep_b.get("status") if rep_b else None

        if status_a == "generating" or status_b == "generating":
            new_status = "generating"
        elif status_a == "ready" and status_b == "ready":
            new_status = "reports_ready"
        elif status_a == "ready" or status_b == "ready":
            new_status = "partial"
        elif status_a == "failed" and status_b == "failed":
            new_status = "failed"
        elif status_a or status_b:
            new_status = "partial"
        else:
            new_status = "not_started"

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) if new_status == "reports_ready" else None

        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE sessions
                SET reporting_status = ?,
                    reporting_completed_at = COALESCE(?, reporting_completed_at)
                WHERE session_id = ?
                """,
                (new_status, now_iso, session_id),
            )
            await conn.commit()

        return new_status

    def _row_to_report(self, row) -> Dict[str, Any]:
        return {
            "report_id": row[0],
            "session_id": row[1],
            "transcript_id": row[2],
            "reporter_role": row[3],
            "standard_version": row[4],
            "standard_version_label": row[5],
            "status": row[6],
            "report_title": row[7],
            "report_text": row[8],
            "key_points": json.loads(row[9]) if row[9] else [],
            "scriptures": json.loads(row[10]) if row[10] else [],
            "warnings": json.loads(row[11]) if row[11] else [],
            "evidence_metadata": json.loads(row[12]) if row[12] else {},
            "model_name": row[13],
            "error_message": row[14],
            "is_active": bool(row[15]),
            "created_at": row[16],
            "updated_at": row[17],
        }


# Global singleton instance
reporting_repo = ReportingRepository()
