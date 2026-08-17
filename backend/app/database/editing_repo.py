"""
Editing Repository Layer (Phase 7)

Handles SQLite persistence and versioning for:
1. Versioned Editor Standards (editable guidelines, compilation guidance, glossary, examples).
2. Edited Report Revisions (AI generated drafts, human manual revisions, regeneration history).
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
)

DEFAULT_EDITOR_GENERAL_GUIDELINES = """# Information Unit Editorial Standards

## 1. Editorial Objective
The Editor synthesizes raw reporting materials into one unified, publication-ready Information Unit report. The final report must speak with a single, clear, authoritative voice that faithfully reflects the minister's message.

## 2. Style, Voice & Tone
- **Voice**: Single, cohesive third-person narrative. The final report must not read like two distinct drafts pasted together.
- **Tone**: Reverent, inspiring, dignified, and doctrinally accurate.
- **Language**: Formal, standard English with strong active verbs and clean sentence structures.
- **Conciseness & Flow**: Eliminate verbal hesitations, spoken filler, colloquialisms, and conversational repetitions while retaining the full spiritual depth and completeness of the preached message.

## 3. Structural Format
- **Message Header**: Clear Topic/Title, Minister (e.g. Pastor W.F. Kumuyi), Service/Programme, and Main Scripture Text.
- **Introduction / Overview**: 1–2 well-crafted paragraphs capturing the core thrust and spiritual emphasis.
- **Main Body Divisions**: 2 to 4 major numbered divisions following the preacher's structured outline, each supported by clear sub-points and biblical explanations.
- **Practical Application & Exhortation**: Direct, actionable spiritual lessons for believers and seekers.
- **Conclusion**: Concise summary and closing call to prayer.
"""

DEFAULT_COMPILATION_GUIDANCE = """# Report Compilation & Reconciliation Guidance

## 1. Source Reconciliation Principles
- **Reporter A (Main Message & Structure)** provides the primary architectural backbone, chronological progression, and major doctrinal headings.
- **Reporter B (Detail & Omission Watch)** provides essential supporting details, exact Bible references, preacher illustrations, real-life examples, numbers, names, and vivid quotes.
- **Intelligent Synthesis**: Integrate Reporter B's granular facts seamlessly under Reporter A's major headings without creating redundancy or disjointed prose.

## 2. Factual Conflict Resolution
- Always cross-reference facts, names, figures, and scriptures against the **Verified Transcript** (the ultimate source of truth).
- If Reporter A and Reporter B provide conflicting descriptions, adopt the wording verified by the transcript.
- If the transcript itself is ambiguous on a detail, omit the uncertain nuance or surface it in editorial review notes. Never invent a compromise.

## 3. De-duplication & Trimming
- Remove overlapping points captured by both reporters.
- Remove redundant spoken summaries and administrative announcements.
- Maintain an appropriate, balanced length suitable for bulletin, web, and press publication.
"""

DEFAULT_EDITOR_TERMINOLOGY = """# Church Terminology & Glossary

- **Pastor W.F. Kumuyi**: General Superintendent, Deeper Christian Life Ministry
- **DLBC**: Deeper Life Bible Church
- **DCLM**: Deeper Christian Life Ministry
- **Information Unit**: The reporting and editorial documentation team
- **GCK**: Global Crusade with Kumuyi
- **Sunday Worship Service (SWS)**: Weekly Sunday service
- **Monday Bible Study (MBS)**: Weekly systematic expository teaching service
- **Revival and Evangelism Training Service (RETS)**: Weekly Thursday revival service
- **National December Retreat**: Annual multi-day retreat
- **Youth Success Camp (YSC)**: Annual youth conference
- **Key Doctrinal Terms**: Salvation, Sanctification, Holy Ghost Baptism, Restitution, Consecration, Total Deliverance, Divine Healing, Second Coming of Christ, Great Commission
"""

DEFAULT_EDITOR_APPROVED_EXAMPLES = """# Approved Finished Report Example

**Topic**: The Transforming Power of the Uncompromised Word
**Minister**: Pastor W.F. Kumuyi
**Text**: 2 Timothy 3:14-17; Hebrews 4:12

### Overview
During the Monday Bible Study, the General Superintendent, Pastor W.F. Kumuyi, ministered on the divine efficacy and enduring authority of the Holy Scriptures. He charged the church to remain steadfast in the truths of God's Word, emphasizing that true spiritual maturity and lasting fruitfulness are rooted in personal obedience to biblical doctrine.

### 1. The Divine Inspiration and Authority of the Word (2 Tim 3:14-15)
The man of God established that the Scriptures are God-breathed and infallible. Highlighting Timothy's early spiritual foundation through his grandmother Lois and mother Eunice (2 Tim 1:5), the preacher urged believers to ground their children and converts early in biblical truth to shield them from modern deception.

### 2. The Total Sufficiency of Scripture for Christian Growth (2 Tim 3:16-17)
The Scriptures provide complete spiritual equipment for the believer in four vital areas:
1. **Doctrine**: Establishing the immutable foundation of faith.
2. **Reproof**: Convicting hearts of sin and compromise.
3. **Correction**: Restoring wandering souls to the path of righteousness.
4. **Instruction in Righteousness**: Guiding daily holy conduct.

### Conclusion & Exhortation
Believers were exhorted to make the Word of God their daily guide and unwavering standard. The service concluded with an earnest call to persistent prayer and renewed commitment to holy living.
"""


class EditingRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes database schema and seeds initial Editor Standard v1 if empty."""
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

            # Check if any editor standards exist; if none, seed default v1
            cursor = await conn.execute("SELECT COUNT(*) FROM editor_standards")
            row = await cursor.fetchone()
            count = row[0] if row else 0

            if count == 0:
                std_id = f"ed_std_v1_{uuid.uuid4().hex[:6]}"
                now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                await conn.execute(
                    """
                    INSERT INTO editor_standards (
                        id, version, version_label, is_active,
                        general_guidelines, compilation_guidance,
                        terminology, approved_examples, notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        std_id,
                        1,
                        "v1",
                        1,
                        DEFAULT_EDITOR_GENERAL_GUIDELINES.strip(),
                        DEFAULT_COMPILATION_GUIDANCE.strip(),
                        DEFAULT_EDITOR_TERMINOLOGY.strip(),
                        DEFAULT_EDITOR_APPROVED_EXAMPLES.strip(),
                        "Initial default Information Unit Editor Standard (v1)",
                        now_iso,
                    ),
                )

            await conn.commit()
        self._initialized = True

    # -------------------------------------------------------------------------
    # Editor Standards Methods
    # -------------------------------------------------------------------------

    async def get_active_standard(self) -> Dict[str, Any]:
        """Returns the currently active Editor Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, compilation_guidance,
                       terminology, approved_examples, notes, created_at
                FROM editor_standards
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
                       general_guidelines, compilation_guidance,
                       terminology, approved_examples, notes, created_at
                FROM editor_standards
                ORDER BY version DESC
                LIMIT 1
                """
            )
            row = await cursor.fetchone()
            if row:
                return self._row_to_standard(row)

        raise RuntimeError("No Editor Standard found in database.")

    async def get_standard_by_version(self, version: int) -> Optional[Dict[str, Any]]:
        """Returns a specific version of the Editor Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, compilation_guidance,
                       terminology, approved_examples, notes, created_at
                FROM editor_standards
                WHERE version = ?
                """,
                (version,),
            )
            row = await cursor.fetchone()
            return self._row_to_standard(row) if row else None

    async def list_standards(self) -> List[Dict[str, Any]]:
        """Returns all versions of the Editor Standard ordered by version descending."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, version, version_label, is_active,
                       general_guidelines, compilation_guidance,
                       terminology, approved_examples, notes, created_at
                FROM editor_standards
                ORDER BY version DESC
                """
            )
            rows = await cursor.fetchall()
            return [self._row_to_standard(r) for r in rows]

    async def create_new_standard_version(
        self,
        general_guidelines: str,
        compilation_guidance: str,
        terminology: str,
        approved_examples: str,
        notes: Optional[str] = None,
        set_active: bool = True,
    ) -> Dict[str, Any]:
        """Creates a new incremented version of the Editor Standard, preserving previous versions."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute("SELECT MAX(version) FROM editor_standards")
            row = await cursor.fetchone()
            current_max = row[0] if (row and row[0] is not None) else 0
            new_version = current_max + 1
            new_id = f"ed_std_v{new_version}_{uuid.uuid4().hex[:6]}"
            version_label = f"v{new_version}"
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            if set_active:
                await conn.execute("UPDATE editor_standards SET is_active = 0")

            await conn.execute(
                """
                INSERT INTO editor_standards (
                    id, version, version_label, is_active,
                    general_guidelines, compilation_guidance,
                    terminology, approved_examples, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    new_version,
                    version_label,
                    1 if set_active else 0,
                    general_guidelines.strip(),
                    compilation_guidance.strip(),
                    terminology.strip(),
                    approved_examples.strip(),
                    notes.strip() if notes else f"Version {version_label} updates",
                    now_iso,
                ),
            )
            await conn.commit()

        return await self.get_standard_by_version(new_version)

    async def activate_standard_version(self, version: int) -> Optional[Dict[str, Any]]:
        """Activates a specific version of the Editor Standard."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute("SELECT id FROM editor_standards WHERE version = ?", (version,))
            row = await cursor.fetchone()
            if not row:
                return None

            await conn.execute("UPDATE editor_standards SET is_active = 0")
            await conn.execute("UPDATE editor_standards SET is_active = 1 WHERE version = ?", (version,))
            await conn.commit()

        return await self.get_standard_by_version(version)

    def _row_to_standard(self, row) -> Dict[str, Any]:
        return {
            "id": row[0],
            "version": row[1],
            "version_label": row[2],
            "is_active": bool(row[3]),
            "general_guidelines": row[4],
            "compilation_guidance": row[5],
            "terminology": row[6],
            "approved_examples": row[7],
            "notes": row[8],
            "created_at": row[9],
        }

    # -------------------------------------------------------------------------
    # Edited Report Revisions Methods
    # -------------------------------------------------------------------------

    async def save_edited_report_revision(
        self,
        session_id: str,
        report_text: str,
        revision_source: str,  # 'ai_generated' | 'human_edited' | 'ai_regenerated'
        standard_version: int,
        standard_version_label: str,
        report_title: Optional[str] = None,
        transcript_id: Optional[str] = None,
        reporter_a_id: Optional[str] = None,
        reporter_b_id: Optional[str] = None,
        review_notes: Optional[List[str]] = None,
        source_uncertainties: Optional[List[str]] = None,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Saves a new revision of the Edited Report.
        Preserves all earlier revisions by incrementing revision_number.
        """
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # 1. Calculate next revision number
            cursor = await conn.execute(
                "SELECT MAX(revision_number) FROM edited_reports WHERE session_id = ?",
                (session_id,),
            )
            row = await cursor.fetchone()
            current_max_rev = row[0] if (row and row[0] is not None) else 0
            new_rev_num = current_max_rev + 1
            revision_id = f"ed_rev_{session_id}_{new_rev_num}_{int(time.time())}"

            # 2. Deactivate previous active revisions
            await conn.execute(
                "UPDATE edited_reports SET is_active = 0 WHERE session_id = ?",
                (session_id,),
            )

            # 3. Insert new revision
            await conn.execute(
                """
                INSERT INTO edited_reports (
                    revision_id, session_id, transcript_id, reporter_a_id,
                    reporter_b_id, standard_version, standard_version_label,
                    revision_number, revision_source, report_title, report_text,
                    review_notes_json, source_uncertainties_json, model_name,
                    is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    revision_id,
                    session_id,
                    transcript_id,
                    reporter_a_id,
                    reporter_b_id,
                    standard_version,
                    standard_version_label,
                    new_rev_num,
                    revision_source,
                    report_title or "Edited Message Report",
                    report_text.strip(),
                    json.dumps(review_notes or []),
                    json.dumps(source_uncertainties or []),
                    model_name,
                    now_iso,
                    now_iso,
                ),
            )

            # 4. Update session status
            new_editing_status = "in_review" if revision_source == "human_edited" else "draft_ready"
            await conn.execute(
                """
                UPDATE sessions
                SET editing_status = ?,
                    editing_standard_version = ?
                WHERE session_id = ?
                """,
                (new_editing_status, standard_version, session_id),
            )

            await conn.commit()

        return await self.get_revision_by_id(revision_id)

    async def get_active_edited_report(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Returns the currently active revision of the Edited Report for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT revision_id, session_id, transcript_id, reporter_a_id,
                       reporter_b_id, standard_version, standard_version_label,
                       revision_number, revision_source, report_title, report_text,
                       review_notes_json, source_uncertainties_json, model_name,
                       is_active, created_at, updated_at
                FROM edited_reports
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
                SELECT revision_id, session_id, transcript_id, reporter_a_id,
                       reporter_b_id, standard_version, standard_version_label,
                       revision_number, revision_source, report_title, report_text,
                       review_notes_json, source_uncertainties_json, model_name,
                       is_active, created_at, updated_at
                FROM edited_reports
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
                SELECT revision_id, session_id, transcript_id, reporter_a_id,
                       reporter_b_id, standard_version, standard_version_label,
                       revision_number, revision_source, report_title, report_text,
                       review_notes_json, source_uncertainties_json, model_name,
                       is_active, created_at, updated_at
                FROM edited_reports
                WHERE revision_id = ?
                """,
                (revision_id,),
            )
            row = await cursor.fetchone()
            return self._row_to_revision(row) if row else None

    async def list_revisions_for_session(self, session_id: str) -> List[Dict[str, Any]]:
        """Returns all revisions of the Edited Report for a session ordered by revision_number descending."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT revision_id, session_id, transcript_id, reporter_a_id,
                       reporter_b_id, standard_version, standard_version_label,
                       revision_number, revision_source, report_title, report_text,
                       review_notes_json, source_uncertainties_json, model_name,
                       is_active, created_at, updated_at
                FROM edited_reports
                WHERE session_id = ?
                ORDER BY revision_number DESC
                """,
                (session_id,),
            )
            rows = await cursor.fetchall()
            return [self._row_to_revision(r) for r in rows]

    async def activate_revision(self, session_id: str, revision_id: str) -> Optional[Dict[str, Any]]:
        """Activates an earlier revision for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT revision_id FROM edited_reports WHERE session_id = ? AND revision_id = ?",
                (session_id, revision_id),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            await conn.execute("UPDATE edited_reports SET is_active = 0 WHERE session_id = ?", (session_id,))
            await conn.execute("UPDATE edited_reports SET is_active = 1 WHERE revision_id = ?", (revision_id,))
            await conn.commit()

        return await self.get_revision_by_id(revision_id)

    async def set_editing_status(
        self,
        session_id: str,
        new_status: str,
        completed_at: Optional[str] = None,
    ):
        """Sets the editing_status on the session record."""
        await self.init_db()
        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE sessions
                SET editing_status = ?,
                    editing_completed_at = COALESCE(?, editing_completed_at)
                WHERE session_id = ?
                """,
                (new_status, completed_at, session_id),
            )
            await conn.commit()

    def _row_to_revision(self, row) -> Dict[str, Any]:
        return {
            "revision_id": row[0],
            "session_id": row[1],
            "transcript_id": row[2],
            "reporter_a_id": row[3],
            "reporter_b_id": row[4],
            "standard_version": row[5],
            "standard_version_label": row[6],
            "revision_number": row[7],
            "revision_source": row[8],
            "report_title": row[9],
            "report_text": row[10],
            "review_notes": json.loads(row[11]) if row[11] else [],
            "source_uncertainties": json.loads(row[12]) if row[12] else [],
            "model_name": row[13],
            "is_active": bool(row[14]),
            "created_at": row[15],
            "updated_at": row[16],
        }


# Global singleton instance
editing_repo = EditingRepository()
