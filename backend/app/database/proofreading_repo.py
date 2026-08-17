"""
Proofreading Repository Layer (Phase 8)

Handles SQLite persistence and versioning for:
1. Versioned Proofreading Standards (capitalization, punctuation, scriptures, church terminology).
2. Proofread Report Revisions (conservative AI proofread suggestions & human accepted/adjusted versions).
"""

import json
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
)

DEFAULT_PROOFREADING_GUIDELINES = """# Information Unit Proofreading Guidelines

## 1. Proofreading Objective
The Proofreader provides a conservative, final-pass quality check on the human-approved Edited Report. Its primary duty is to protect the report's fidelity, accuracy, and professional presentation without rewriting or altering doctrinal content.

## 2. Scope of Corrections
- **Spelling & Typos**: Correct typographical errors, misspelled common words, and mistyped theological terms.
- **Grammar & Syntax**: Fix clear grammatical slips, subject-verb agreement errors, and dangling modifiers while preserving the author's sentence cadence.
- **Punctuation**: Correct missing or erroneous punctuation (periods, commas, colons, quotation marks, hyphens, and dashes).
- **Capitalization**: Enforce proper reverence capitalization (e.g. God, Jesus Christ, Holy Spirit, Scripture, Word of God) and title capitalization.
- **Clarity & Repetition**: Remove accidental word duplications (e.g. "the the") and accidental omissions.

## 3. Strict Prohibitions
- DO NOT rewrite paragraphs to sound more poetic or stylized.
- DO NOT summarize, condense, or omit substantive sentences.
- DO NOT expand or add new explanatory ideas.
- DO NOT alter the preacher's theological thrust or meaning.
"""

DEFAULT_PROOFREADING_TERMINOLOGY = """# Church Terminology & Reverence Guidelines

- **Minister**: Pastor W.F. Kumuyi (General Superintendent, Deeper Christian Life Ministry)
- **Ministry Names**: Deeper Life Bible Church (DLBC), Deeper Christian Life Ministry (DCLM), Global Crusade with Kumuyi (GCK), Information Unit
- **Programmes**: Sunday Worship Service (SWS), Monday Bible Study (MBS), Revival and Evangelism Training Service (RETS), National December Retreat, Youth Success Camp (YSC)
- **Reverence Capitalization**:
  - Capitalize God, Lord, Jesus, Jesus Christ, Holy Spirit, Holy Ghost, Father, Almighty, Savior/Saviour.
  - Capitalize Scripture, Scriptures, Bible, Word of God, Gospel, Cross (referring to Christ's sacrifice).
  - Capitalize Church when referring to the universal body of Christ or official denomination (Deeper Life Bible Church).
"""

DEFAULT_PROOFREADING_FORMATTING_RULES = """# Scripture & Formatting Rules

## 1. Scripture Reference Citation Format
- Standard Book Abbreviations and Full Names: Genesis (Gen), Exodus (Exod), Psalms (Psa/Ps), Matthew (Matt), Romans (Rom), 1 Corinthians (1 Cor), 2 Timothy (2 Tim), Hebrews (Heb), Revelation (Rev).
- Chapter and Verse Punctuation: `Book Chapter:Verse` (e.g. `Luke 18:1`, `2 Timothy 3:14-17`, `Hebrews 4:12`).
- Multiple Verses: `John 3:16, 17` or `John 3:16-18`.
- Multiple Chapters: `Romans 8:1; 12:1-2`.

## 2. English Conventions
- Standard British/Commonwealth English spelling is preferred (e.g. Savior/Saviour, emphasize/emphasise, programme). Consistency within the document is mandatory.
- Quotation Marks: Double quotes (`"..."`) for direct speech quotations and message citations.
"""


class ProofreadingRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes database schema and seeds initial Proofreading Standard v1 if empty."""
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

            # Apply Phase 7 migrations
            for sql in PHASE7_MIGRATION_COLUMNS:
                try:
                    await conn.execute(sql)
                except Exception:
                    pass

            # Apply Phase 8 migrations
            for sql in PHASE8_MIGRATION_COLUMNS:
                try:
                    await conn.execute(sql)
                except Exception:
                    pass

            # Check if any proofreading standards exist; if none, seed default v1
            cursor = await conn.execute("SELECT COUNT(*) FROM proofreading_standards")
            row = await cursor.fetchone()
            count = row[0] if row else 0

            if count == 0:
                std_id = f"pr_std_v1_{uuid.uuid4().hex[:6]}"
                now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                await conn.execute(
                    """
                    INSERT INTO proofreading_standards (
                        id, version, version_label, is_active,
                        guidelines, terminology, formatting_rules, notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        std_id,
                        1,
                        "v1",
                        1,
                        DEFAULT_PROOFREADING_GUIDELINES.strip(),
                        DEFAULT_PROOFREADING_TERMINOLOGY.strip(),
                        DEFAULT_PROOFREADING_FORMATTING_RULES.strip(),
                        "Initial default Information Unit Proofreading Standard (v1)",
                        now_iso,
                    ),
                )

            await conn.commit()
        self._initialized = True

    # -------------------------------------------------------------------------
    # Proofreading Standards Methods
    # -------------------------------------------------------------------------

    async def get_active_standard(self) -> Dict[str, Any]:
        """Returns the currently active Proofreading Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       guidelines, terminology, formatting_rules, notes, created_at
                FROM proofreading_standards
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
                       guidelines, terminology, formatting_rules, notes, created_at
                FROM proofreading_standards
                ORDER BY version DESC
                LIMIT 1
                """
            )
            row = await cursor.fetchone()
            if row:
                return self._row_to_standard(row)

        raise RuntimeError("No Proofreading Standard found in database.")

    async def get_standard_by_version(self, version: int) -> Optional[Dict[str, Any]]:
        """Returns a specific version of the Proofreading Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       guidelines, terminology, formatting_rules, notes, created_at
                FROM proofreading_standards
                WHERE version = ?
                """,
                (version,),
            )
            row = await cursor.fetchone()
            return self._row_to_standard(row) if row else None

    async def list_standards(self) -> List[Dict[str, Any]]:
        """Returns all versions of the Proofreading Standard ordered by version descending."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       guidelines, terminology, formatting_rules, notes, created_at
                FROM proofreading_standards
                ORDER BY version DESC
                """
            )
            rows = await cursor.fetchall()
            return [self._row_to_standard(r) for r in rows]

    async def create_new_standard_version(
        self,
        guidelines: str,
        terminology: str,
        formatting_rules: str,
        notes: Optional[str] = None,
        set_active: bool = True,
    ) -> Dict[str, Any]:
        """Creates a new incremented version of the Proofreading Standard, preserving previous versions."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute("SELECT MAX(version) FROM proofreading_standards")
            row = await cursor.fetchone()
            current_max = row[0] if (row and row[0] is not None) else 0
            new_version = current_max + 1
            new_id = f"pr_std_v{new_version}_{uuid.uuid4().hex[:6]}"
            version_label = f"v{new_version}"
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            if set_active:
                await conn.execute("UPDATE proofreading_standards SET is_active = 0")

            await conn.execute(
                """
                INSERT INTO proofreading_standards (
                    id, version, version_label, is_active,
                    guidelines, terminology, formatting_rules, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    new_version,
                    version_label,
                    1 if set_active else 0,
                    guidelines.strip(),
                    terminology.strip(),
                    formatting_rules.strip(),
                    notes.strip() if notes else f"Version {version_label} updates",
                    now_iso,
                ),
            )
            await conn.commit()

        return await self.get_standard_by_version(new_version)

    async def activate_standard_version(self, version: int) -> Optional[Dict[str, Any]]:
        """Activates a specific version of the Proofreading Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute("SELECT id FROM proofreading_standards WHERE version = ?", (version,))
            row = await cursor.fetchone()
            if not row:
                return None

            await conn.execute("UPDATE proofreading_standards SET is_active = 0")
            await conn.execute("UPDATE proofreading_standards SET is_active = 1 WHERE version = ?", (version,))
            await conn.commit()

        return await self.get_standard_by_version(version)

    def _row_to_standard(self, row) -> Dict[str, Any]:
        return {
            "id": row[0],
            "version": row[1],
            "version_label": row[2],
            "is_active": bool(row[3]),
            "guidelines": row[4],
            "terminology": row[5],
            "formatting_rules": row[6],
            "notes": row[7],
            "created_at": row[8],
        }

    # -------------------------------------------------------------------------
    # Proofread Report Revisions Methods
    # -------------------------------------------------------------------------

    async def save_proofread_revision(
        self,
        session_id: str,
        proofread_text: str,
        revision_source: str,  # 'ai_proofread' | 'human_reviewed'
        standard_version: int,
        standard_version_label: str,
        proofread_title: Optional[str] = None,
        edited_report_revision_id: Optional[str] = None,
        changes: Optional[List[Dict[str, Any]]] = None,
        review_notes: Optional[List[str]] = None,
        model_name: Optional[str] = None,
        is_accepted: bool = False,
    ) -> Dict[str, Any]:
        """
        Saves a new revision of the Proofread Report.
        Preserves all earlier revisions by incrementing revision_number.
        """
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # 1. Calculate next revision number
            cursor = await conn.execute(
                "SELECT MAX(revision_number) FROM proofread_reports WHERE session_id = ?",
                (session_id,),
            )
            row = await cursor.fetchone()
            current_max_rev = row[0] if (row and row[0] is not None) else 0
            new_rev_num = current_max_rev + 1
            revision_id = f"pr_rev_{session_id}_{new_rev_num}_{int(time.time())}"

            # 2. Deactivate previous active revisions
            await conn.execute(
                "UPDATE proofread_reports SET is_active = 0 WHERE session_id = ?",
                (session_id,),
            )

            # 3. Insert new revision
            await conn.execute(
                """
                INSERT INTO proofread_reports (
                    revision_id, session_id, edited_report_revision_id,
                    standard_version, standard_version_label, revision_number,
                    revision_source, proofread_title, proofread_text,
                    changes_json, review_notes_json, model_name,
                    is_active, is_accepted, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    revision_id,
                    session_id,
                    edited_report_revision_id,
                    standard_version,
                    standard_version_label,
                    new_rev_num,
                    revision_source,
                    proofread_title or "Proofread Message Report",
                    proofread_text.strip(),
                    json.dumps(changes or []),
                    json.dumps(review_notes or []),
                    model_name,
                    1 if is_accepted else 0,
                    now_iso,
                    now_iso,
                ),
            )

            # 4. Update session proofreading_status
            new_status = "ready_for_review" if not is_accepted else "complete"
            await conn.execute(
                """
                UPDATE sessions
                SET proofreading_status = ?,
                    proofreading_standard_version = ?
                WHERE session_id = ?
                """,
                (new_status, standard_version, session_id),
            )

            await conn.commit()

        return await self.get_revision_by_id(revision_id)

    async def get_active_proofread_report(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Returns the currently active revision of the Proofread Report for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT revision_id, session_id, edited_report_revision_id,
                       standard_version, standard_version_label, revision_number,
                       revision_source, proofread_title, proofread_text,
                       changes_json, review_notes_json, model_name,
                       is_active, is_accepted, created_at, updated_at
                FROM proofread_reports
                WHERE session_id = ? AND is_active = 1
                LIMIT 1
                """,
                (session_id,),
            )
            row = await cursor.fetchone()
            if row:
                return self._row_to_revision(row)

            # Fallback to highest revision_number if none marked active
            cursor = await conn.execute(
                """
                SELECT revision_id, session_id, edited_report_revision_id,
                       standard_version, standard_version_label, revision_number,
                       revision_source, proofread_title, proofread_text,
                       changes_json, review_notes_json, model_name,
                       is_active, is_accepted, created_at, updated_at
                FROM proofread_reports
                WHERE session_id = ?
                ORDER BY revision_number DESC
                LIMIT 1
                """,
                (session_id,),
            )
            row = await cursor.fetchone()
            return self._row_to_revision(row) if row else None

    async def get_revision_by_id(self, revision_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a specific revision by ID."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT revision_id, session_id, edited_report_revision_id,
                       standard_version, standard_version_label, revision_number,
                       revision_source, proofread_title, proofread_text,
                       changes_json, review_notes_json, model_name,
                       is_active, is_accepted, created_at, updated_at
                FROM proofread_reports
                WHERE revision_id = ?
                """,
                (revision_id,),
            )
            row = await cursor.fetchone()
            return self._row_to_revision(row) if row else None

    async def list_revisions_for_session(self, session_id: str) -> List[Dict[str, Any]]:
        """Returns all revisions of the Proofread Report for a session ordered by revision_number descending."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT revision_id, session_id, edited_report_revision_id,
                       standard_version, standard_version_label, revision_number,
                       revision_source, proofread_title, proofread_text,
                       changes_json, review_notes_json, model_name,
                       is_active, is_accepted, created_at, updated_at
                FROM proofread_reports
                WHERE session_id = ?
                ORDER BY revision_number DESC
                """,
                (session_id,),
            )
            rows = await cursor.fetchall()
            return [self._row_to_revision(r) for r in rows]

    async def activate_revision(self, session_id: str, revision_id: str) -> Optional[Dict[str, Any]]:
        """Activates an earlier proofread revision for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT revision_id FROM proofread_reports WHERE session_id = ? AND revision_id = ?",
                (session_id, revision_id),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            await conn.execute("UPDATE proofread_reports SET is_active = 0 WHERE session_id = ?", (session_id,))
            await conn.execute("UPDATE proofread_reports SET is_active = 1 WHERE revision_id = ?", (revision_id,))
            await conn.commit()

        return await self.get_revision_by_id(revision_id)

    async def accept_revision(self, session_id: str, revision_id: str) -> Optional[Dict[str, Any]]:
        """Marks a specific proofread revision as accepted and marks proofreading as complete."""
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT revision_id FROM proofread_reports WHERE session_id = ? AND revision_id = ?",
                (session_id, revision_id),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            # Mark all revisions for this session unaccepted, then set the chosen one as accepted and active
            await conn.execute("UPDATE proofread_reports SET is_active = 0, is_accepted = 0 WHERE session_id = ?", (session_id,))
            await conn.execute(
                "UPDATE proofread_reports SET is_active = 1, is_accepted = 1, updated_at = ? WHERE revision_id = ?",
                (now_iso, revision_id),
            )

            # Update session status
            await conn.execute(
                """
                UPDATE sessions
                SET proofreading_status = 'complete',
                    proofreading_completed_at = ?,
                    accepted_proofread_revision_id = ?
                WHERE session_id = ?
                """,
                (now_iso, revision_id, session_id),
            )
            await conn.commit()

        return await self.get_revision_by_id(revision_id)

    async def set_proofreading_status(
        self,
        session_id: str,
        new_status: str,
        completed_at: Optional[str] = None,
        accepted_rev_id: Optional[str] = None,
    ):
        """Sets the proofreading_status on the session record."""
        await self.init_db()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE sessions
                SET proofreading_status = ?,
                    proofreading_completed_at = COALESCE(?, proofreading_completed_at),
                    accepted_proofread_revision_id = COALESCE(?, accepted_proofread_revision_id)
                WHERE session_id = ?
                """,
                (new_status, completed_at, accepted_rev_id, session_id),
            )
            await conn.commit()

    def _row_to_revision(self, row) -> Dict[str, Any]:
        return {
            "revision_id": row[0],
            "session_id": row[1],
            "edited_report_revision_id": row[2],
            "standard_version": row[3],
            "standard_version_label": row[4],
            "revision_number": row[5],
            "revision_source": row[6],
            "proofread_title": row[7],
            "proofread_text": row[8],
            "changes": json.loads(row[9]) if row[9] else [],
            "review_notes": json.loads(row[10]) if row[10] else [],
            "model_name": row[11],
            "is_active": bool(row[12]),
            "is_accepted": bool(row[13]),
            "created_at": row[14],
            "updated_at": row[15],
        }


# Global singleton instance
proofreading_repo = ProofreadingRepository()
