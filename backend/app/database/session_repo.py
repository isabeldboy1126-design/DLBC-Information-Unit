"""
Session Repository Layer (Phases 4–5)

Provides asynchronous CRUD, progressive persistence, non-destructive historical
indexing, and Phase 5 human verification workflow for church message sessions in SQLite.
"""

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from app.database.connection import DB_PATH, get_db_connection
from app.database.models import (
    INIT_SCHEMA_SQL,
    INIT_SCHEMA_MSSQL,
    PHASE5_MIGRATION_COLUMNS,
    PHASE5_MIGRATION_COLUMNS_MSSQL,
    PHASE6_MIGRATION_COLUMNS,
    PHASE6_MIGRATION_COLUMNS_MSSQL,
    PHASE7_MIGRATION_COLUMNS,
    PHASE7_MIGRATION_COLUMNS_MSSQL,
    PHASE8_MIGRATION_COLUMNS,
    PHASE8_MIGRATION_COLUMNS_MSSQL,
    PHASE9_MIGRATION_COLUMNS,
    PHASE9_MIGRATION_COLUMNS_MSSQL,
    STAGE6_AI_VERIFICATION_COLUMNS,
    STAGE6_AI_VERIFICATION_COLUMNS_MSSQL,
)
from app.config import (
    STORAGE_AUDIO_DIR,
    STORAGE_TRANSCRIPTS_DIR,
    STORAGE_VERIFIED_DIR,
)


class SessionRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes the database schema if not already initialized."""
        is_mssql = bool(os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL").startswith("sqlite"))

        async with get_db_connection() as conn:
            if is_mssql:
                await conn.executescript(INIT_SCHEMA_MSSQL)
                for alter_sql in (
                    PHASE5_MIGRATION_COLUMNS_MSSQL
                    + PHASE6_MIGRATION_COLUMNS_MSSQL
                    + PHASE7_MIGRATION_COLUMNS_MSSQL
                    + PHASE8_MIGRATION_COLUMNS_MSSQL
                    + PHASE9_MIGRATION_COLUMNS_MSSQL
                    + STAGE6_AI_VERIFICATION_COLUMNS_MSSQL
                ):
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass
            else:
                await conn.executescript(INIT_SCHEMA_SQL)
                # Phase 5 migration: add verification columns (safe if already exist)
                for alter_sql in PHASE5_MIGRATION_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass  # Column already exists
                # Phase 6 migration: add reporting columns (safe if already exist)
                for alter_sql in PHASE6_MIGRATION_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass  # Column already exists
                # Phase 7 migration: add editing columns (safe if already exist)
                for alter_sql in PHASE7_MIGRATION_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass  # Column already exists
                # Phase 8 migration: add proofreading columns (safe if already exist)
                for alter_sql in PHASE8_MIGRATION_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass  # Column already exists
                # Phase 9 migration: add final report columns (safe if already exist)
                for alter_sql in PHASE9_MIGRATION_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass  # Column already exists
                # Stage 6 migration: add AI verification engine columns
                for alter_sql in STAGE6_AI_VERIFICATION_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass  # Column already exists
            await conn.commit()
        self._initialized = True

    async def create_session(
        self,
        session_id: str,
        title: Optional[str] = None,
        recording_id: Optional[str] = None,
        status: str = "recording",
        provider_name: Optional[str] = "azure_speech",
        language_code: str = "en-NG",
        start_time: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        raw_text: Optional[str] = None,
        verified_text: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates a new durable Session record."""
        await self.init_db()
        now = time.time()
        start_ts = start_time or now
        created_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start_ts))

        # Default human-readable title if not provided
        if not title or not title.strip():
            formatted_date = time.strftime("%d %b %Y, %I:%M %p", time.localtime(start_ts))
            title = f"Live Session — {formatted_date}"

        v_text = verified_text or (raw_text if verified_text is None and raw_text else None)
        v_status = "complete" if v_text else "not_started"

        session_record = {
            "session_id": session_id,
            "title": title.strip(),
            "date_created": created_iso,
            "start_time": start_ts,
            "end_time": None,
            "duration_seconds": 0.0,
            "status": status,
            "recording_id": recording_id or session_id,
            "audio_filename": f"{recording_id or session_id}.wav",
            "audio_file_path": None,
            "audio_file_size": 0,
            "audio_duration_seconds": 0.0,
            "transcript_id": f"tr_{recording_id or session_id}",
            "raw_text": raw_text or "",
            "verified_text": v_text,
            "verification_status": v_status,
            "provider_name": provider_name,
            "language_code": language_code,
            "segment_count": 0,
            "flag_count": 0,
            "is_interrupted": 0,
            "recovery_notes": None,
            "metadata_json": json.dumps(metadata or {}),
        }

        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT session_id FROM sessions WHERE session_id = ?",
                (session_id,),
            )
            existing = await cursor.fetchone()
            if existing:
                await conn.execute(
                    """
                    UPDATE sessions SET
                        title = ?,
                        date_created = ?,
                        start_time = ?,
                        status = ?,
                        provider_name = ?,
                        language_code = ?,
                        raw_text = ?,
                        verified_text = ?,
                        verification_status = ?,
                        metadata_json = ?
                    WHERE session_id = ?
                    """,
                    (
                        session_record["title"],
                        session_record["date_created"],
                        session_record["start_time"],
                        session_record["status"],
                        session_record["provider_name"],
                        session_record["language_code"],
                        session_record["raw_text"],
                        session_record["verified_text"],
                        session_record["verification_status"],
                        session_record["metadata_json"],
                        session_id,
                    ),
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO sessions (
                        session_id, title, date_created, start_time, end_time,
                        duration_seconds, status, recording_id, audio_filename,
                        audio_file_path, audio_file_size, audio_duration_seconds,
                        transcript_id, raw_text, verified_text, verification_status,
                        provider_name, language_code, segment_count, flag_count,
                        is_interrupted, recovery_notes, metadata_json
                    ) VALUES (
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?
                    )
                    """,
                    (
                        session_record["session_id"],
                        session_record["title"],
                        session_record["date_created"],
                        session_record["start_time"],
                        session_record["end_time"],
                        session_record["duration_seconds"],
                        session_record["status"],
                        session_record["recording_id"],
                        session_record["audio_filename"],
                        session_record["audio_file_path"],
                        session_record["audio_file_size"],
                        session_record["audio_duration_seconds"],
                        session_record["transcript_id"],
                        session_record["raw_text"],
                        session_record["verified_text"],
                        session_record["verification_status"],
                        session_record["provider_name"],
                        session_record["language_code"],
                        session_record["segment_count"],
                        session_record["flag_count"],
                        session_record["is_interrupted"],
                        session_record["recovery_notes"],
                        session_record["metadata_json"],
                    ),
                )
            await conn.commit()

        return await self.get_session(session_id)

    async def append_segment(
        self,
        session_id: str,
        segment_index: int,
        start_time: float,
        end_time: float,
        text: str,
        confidence: Optional[float] = None,
        is_low_confidence: bool = False,
        flags: Optional[List[Dict[str, Any]]] = None,
        words: Optional[List[Dict[str, Any]]] = None,
    ):
        """
        Progressively persists a newly finalized transcript segment.
        Updates session segment count and flag count durably.
        """
        segment_id = f"seg_{session_id}_{segment_index}_{uuid.uuid4().hex[:6]}"
        flags_json = json.dumps(flags or [])
        words_json = json.dumps(words or [])

        async with get_db_connection() as conn:
            # 1. Insert or update segment
            seg_chk = await conn.execute(
                "SELECT segment_id FROM session_segments WHERE segment_id = ?",
                (segment_id,),
            )
            if await seg_chk.fetchone():
                await conn.execute(
                    """
                    UPDATE session_segments SET
                        session_id = ?, segment_index = ?, start_time = ?, end_time = ?,
                        text = ?, confidence = ?, is_low_confidence = ?, flags_json = ?, words_json = ?
                    WHERE segment_id = ?
                    """,
                    (
                        session_id,
                        segment_index,
                        start_time,
                        end_time,
                        text,
                        confidence,
                        1 if is_low_confidence else 0,
                        flags_json,
                        words_json,
                        segment_id,
                    ),
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO session_segments (
                        segment_id, session_id, segment_index, start_time, end_time,
                        text, confidence, is_low_confidence, flags_json, words_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        segment_id,
                        session_id,
                        segment_index,
                        start_time,
                        end_time,
                        text,
                        confidence,
                        1 if is_low_confidence else 0,
                        flags_json,
                        words_json,
                    ),
                )

            # 2. Update session duration and counts in a database-agnostic manner
            seg_cur = await conn.execute(
                "SELECT segment_index, text, flags_json, end_time FROM session_segments WHERE session_id = ? ORDER BY segment_index ASC",
                (session_id,),
            )
            all_segs = await seg_cur.fetchall()
            seg_count = len(all_segs)
            total_flags = 0
            all_texts = []
            max_end = end_time
            for s in all_segs:
                sd = dict(s)
                f_list = json.loads(sd.get("flags_json") or "[]")
                total_flags += len(f_list)
                if sd.get("text"):
                    all_texts.append(sd["text"])
                if sd.get("end_time") and sd["end_time"] > max_end:
                    max_end = sd["end_time"]
            full_raw_text = " ".join(all_texts)

            sess_cur = await conn.execute(
                "SELECT duration_seconds FROM sessions WHERE session_id = ?",
                (session_id,),
            )
            sess_row = await sess_cur.fetchone()
            curr_dur = dict(sess_row).get("duration_seconds") or 0.0 if sess_row else 0.0
            new_dur = max(float(curr_dur), float(max_end))

            await conn.execute(
                """
                UPDATE sessions
                SET segment_count = ?,
                    flag_count = ?,
                    duration_seconds = ?,
                    raw_text = ?
                WHERE session_id = ?
                """,
                (seg_count, total_flags, new_dur, full_raw_text, session_id),
            )
            await conn.commit()

    async def update_segment_flags(
        self, session_id: str, segment_index: int, flags: List[Dict[str, Any]]
    ):
        """Updates flags on an existing segment (e.g. manual operator flag toggle)."""
        flags_json = json.dumps(flags)
        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE session_segments
                SET flags_json = ?
                WHERE session_id = ? AND segment_index = ?
                """,
                (flags_json, session_id, segment_index),
            )
            # Recompute total flag count for session cleanly
            seg_cur = await conn.execute(
                "SELECT flags_json FROM session_segments WHERE session_id = ?",
                (session_id,),
            )
            all_segs = await seg_cur.fetchall()
            total_flags = sum(len(json.loads(dict(s).get("flags_json") or "[]")) for s in all_segs)
            await conn.execute(
                "UPDATE sessions SET flag_count = ? WHERE session_id = ?",
                (total_flags, session_id),
            )
            await conn.commit()

    async def finalize_session(
        self,
        session_id: str,
        audio_summary: Optional[Dict[str, Any]] = None,
        transcript_summary: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Finalizes a session to 'completed' (or 'audio_only' / 'partial_transcript') status."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return None

            now = time.time()
            end_time = now
            duration = 0.0

            audio_file_path = None
            audio_file_size = 0
            audio_dur = 0.0
            raw_text = row["raw_text"] or ""
            provider = row["provider_name"]

            if audio_summary:
                audio_file_path = audio_summary.get("file_path")
                audio_file_size = audio_summary.get("file_size", 0)
                audio_dur = audio_summary.get("duration_seconds", 0.0)
                duration = max(duration, audio_dur)

            if transcript_summary:
                transcript_dur = transcript_summary.get("duration_seconds", 0.0)
                duration = max(duration, transcript_dur)
                if transcript_summary.get("raw_text"):
                    raw_text = transcript_summary["raw_text"]
                if transcript_summary.get("provider_name"):
                    provider = transcript_summary["provider_name"]

            if duration == 0.0 and row["start_time"]:
                duration = round(end_time - row["start_time"], 2)

            # Determine final status
            has_audio = bool(audio_file_path and audio_file_size > 0)
            has_transcript = bool(raw_text and raw_text.strip())

            if has_audio and has_transcript:
                final_status = "completed"
            elif has_audio and not has_transcript:
                final_status = "audio_only"
            elif not has_audio and has_transcript:
                final_status = "partial_transcript"
            else:
                final_status = "completed"

            await conn.execute(
                """
                UPDATE sessions
                SET status = ?,
                    end_time = ?,
                    duration_seconds = ?,
                    audio_file_path = COALESCE(?, audio_file_path),
                    audio_file_size = CASE WHEN ? > 0 THEN ? ELSE audio_file_size END,
                    audio_duration_seconds = CASE WHEN ? > 0 THEN ? ELSE audio_duration_seconds END,
                    raw_text = COALESCE(?, raw_text),
                    provider_name = COALESCE(?, provider_name)
                WHERE session_id = ?
                """,
                (
                    final_status,
                    end_time,
                    duration,
                    audio_file_path,
                    audio_file_size,
                    audio_file_size,
                    audio_dur,
                    audio_dur,
                    raw_text,
                    provider,
                    session_id,
                ),
            )
            await conn.commit()

        return await self.get_session(session_id)

    async def update_session_title(self, session_id: str, new_title: str) -> Optional[Dict[str, Any]]:
        """Renames a session title cleanly without touching files or underlying IDs."""
        if not new_title or not new_title.strip():
            return None
        async with get_db_connection() as conn:
            await conn.execute(
                "UPDATE sessions SET title = ? WHERE session_id = ?",
                (new_title.strip(), session_id),
            )
            await conn.commit()
        return await self.get_session(session_id)

    async def update_session_details(
        self,
        session_id: str,
        title: Optional[str] = None,
        programme: Optional[str] = None,
        session_name: Optional[str] = None,
        minister: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Updates session metadata (programme, session title, minister) and updates title cleanly."""
        current = await self.get_session(session_id)
        if not current:
            return None

        # Parse existing metadata
        meta = {}
        raw_meta = current.get("metadata_json")
        if raw_meta:
            try:
                meta = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
            except Exception:
                meta = {}

        if programme is not None:
            meta["programme"] = programme.strip()
            meta["eventType"] = programme.strip()
        if session_name is not None:
            meta["programmeSession"] = session_name.strip()
            meta["session_name"] = session_name.strip()
            meta["messageTitle"] = session_name.strip()
        if minister is not None:
            meta["minister"] = minister.strip()

        # Determine new title
        new_title = current.get("title")
        if title and title.strip():
            new_title = title.strip()
        elif session_name and session_name.strip():
            new_title = session_name.strip()

        async with get_db_connection() as conn:
            await conn.execute(
                "UPDATE sessions SET title = ?, metadata_json = ? WHERE session_id = ?",
                (new_title, json.dumps(meta), session_id),
            )
            await conn.commit()

        return await self.get_session(session_id)

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a full session with linked audio, transcript segments, and flags."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return None

            session = dict(row)

            # Retrieve segments
            seg_cursor = await conn.execute(
                """
                SELECT * FROM session_segments
                WHERE session_id = ?
                ORDER BY segment_index ASC
                """,
                (session_id,),
            )
            seg_rows = await seg_cursor.fetchall()
            segments = []
            for sr in seg_rows:
                s_dict = dict(sr)
                s_dict["flags"] = json.loads(s_dict["flags_json"] or "[]")
                s_dict["words"] = json.loads(s_dict["words_json"] or "[]")
                del s_dict["flags_json"]
                del s_dict["words_json"]
                segments.append(s_dict)

            session["segments"] = segments
            session["metadata"] = json.loads(session.get("metadata_json") or "{}")

            return session

    async def list_sessions(self) -> List[Dict[str, Any]]:
        """Lists all sessions ordered by creation date descending."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT session_id, title, date_created, duration_seconds, status,
                       recording_id, audio_filename, audio_file_size, audio_duration_seconds,
                       transcript_id, provider_name, language_code, segment_count,
                       flag_count, is_interrupted, recovery_notes,
                       verification_status, verification_items_total,
                       verification_items_resolved, verified_at,
                       reporting_status, reporting_completed_at,
                       reporting_standard_version,
                       editing_status, editing_completed_at,
                       editing_standard_version,
                       proofreading_status, proofreading_completed_at,
                       proofreading_standard_version, accepted_proofread_revision_id,
                       final_report_status, final_report_completed_at, final_report_id
                FROM sessions
                ORDER BY date_created DESC
                """
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def delete_session(self, session_id: str) -> bool:
        """Explicit user-confirmed session deletion."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "DELETE FROM sessions WHERE session_id = ?", (session_id,)
            )
            await conn.commit()
            return cursor.rowcount > 0

    async def index_existing_storage_files(self):
        """
        Non-destructively imports pre-existing audio recordings and transcripts from storage/
        into SQLite sessions without modifying, moving, or deleting any original files.
        Only creates a recording<->transcript link when unambiguous metadata exists.
        """
        await self.init_db()

        audio_manifest_path = os.path.join(STORAGE_AUDIO_DIR, "recordings_manifest.json")
        transcripts_manifest_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, "transcripts_manifest.json")

        audio_recordings = []
        if os.path.exists(audio_manifest_path):
            try:
                with open(audio_manifest_path, "r", encoding="utf-8") as f:
                    audio_recordings = json.load(f)
            except Exception:
                pass

        transcripts_list = []
        if os.path.exists(transcripts_manifest_path):
            try:
                with open(transcripts_manifest_path, "r", encoding="utf-8") as f:
                    transcripts_list = json.load(f)
            except Exception:
                pass

        async with get_db_connection() as conn:
            # 1. Index audio recordings
            for rec in audio_recordings:
                rec_id = rec.get("recording_id")
                if not rec_id:
                    continue

                session_id = f"session_{rec_id}"

                # Check if session already exists
                cursor = await conn.execute(
                    "SELECT session_id FROM sessions WHERE session_id = ? OR recording_id = ?",
                    (session_id, rec_id),
                )
                if await cursor.fetchone():
                    continue

                # Title from created_at
                created_at = rec.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ")
                title = f"Recording — {rec.get('filename', rec_id)}"

                await conn.execute(
                    """
                    INSERT INTO sessions (
                        session_id, title, date_created, duration_seconds, status,
                        recording_id, audio_filename, audio_file_path, audio_file_size,
                        audio_duration_seconds, segment_count, flag_count, is_interrupted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
                    """,
                    (
                        session_id,
                        title,
                        created_at,
                        rec.get("duration_seconds", 0.0),
                        "completed",
                        rec_id,
                        rec.get("filename"),
                        rec.get("file_path"),
                        rec.get("file_size", 0),
                        rec.get("duration_seconds", 0.0),
                    ),
                )

            # 2. Index transcripts and link unambiguously
            for tr_meta in transcripts_list:
                tr_id = tr_meta.get("transcript_id")
                if not tr_id:
                    continue

                # Find corresponding transcript JSON file to extract segments & text
                tr_file_path = os.path.join(STORAGE_TRANSCRIPTS_DIR, f"{tr_id}.json")
                tr_data = {}
                if os.path.exists(tr_file_path):
                    try:
                        with open(tr_file_path, "r", encoding="utf-8") as f:
                            tr_data = json.load(f)
                    except Exception:
                        pass

                rec_ref = tr_data.get("recording_id") or tr_data.get("upload_id") or tr_meta.get("upload_id")
                linked_session_id = f"session_{rec_ref}" if rec_ref else f"session_{tr_id}"

                # Check if session already has this transcript
                cursor = await conn.execute(
                    "SELECT session_id, recording_id FROM sessions WHERE session_id = ? OR recording_id = ?",
                    (linked_session_id, rec_ref),
                )
                existing = await cursor.fetchone()

                segments = tr_data.get("segments", [])
                raw_text = tr_data.get("raw_text") or " ".join([s.get("text", "") for s in segments])
                flags_count = sum(len(s.get("flags", [])) for s in segments)

                if existing:
                    # Update existing session with transcript reference & text
                    s_id = existing["session_id"]
                    await conn.execute(
                        """
                        UPDATE sessions
                        SET transcript_id = ?,
                            raw_text = ?,
                            provider_name = ?,
                            segment_count = ?,
                            flag_count = ?
                        WHERE session_id = ?
                        """,
                        (
                            tr_id,
                            raw_text,
                            tr_data.get("provider_name", "azure_speech"),
                            len(segments),
                            flags_count,
                            s_id,
                        ),
                    )
                    # Insert segments if not already present
                    for idx, seg in enumerate(segments):
                        seg_id = f"seg_{s_id}_{idx}"
                        seg_chk = await conn.execute(
                            "SELECT segment_id FROM session_segments WHERE segment_id = ?",
                            (seg_id,),
                        )
                        if not await seg_chk.fetchone():
                            await conn.execute(
                                """
                                INSERT INTO session_segments (
                                    segment_id, session_id, segment_index, start_time, end_time,
                                    text, confidence, is_low_confidence, flags_json, words_json
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    seg_id,
                                    s_id,
                                    idx,
                                    seg.get("start_time", 0.0),
                                    seg.get("end_time", 0.0),
                                    seg.get("text", ""),
                                    seg.get("confidence"),
                                    1 if seg.get("is_low_confidence") else 0,
                                    json.dumps(seg.get("flags", [])),
                                    json.dumps(seg.get("words", [])),
                                ),
                            )
                else:
                    # Create standalone transcript session (e.g. from uploaded file)
                    created_at = tr_meta.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ")
                    title = f"Transcript — {tr_meta.get('original_filename', tr_id)}"
                    sess_chk = await conn.execute(
                        "SELECT session_id FROM sessions WHERE session_id = ?",
                        (linked_session_id,),
                    )
                    if not await sess_chk.fetchone():
                        await conn.execute(
                            """
                            INSERT INTO sessions (
                                session_id, title, date_created, duration_seconds, status,
                                recording_id, transcript_id, raw_text, provider_name,
                                language_code, segment_count, flag_count, is_interrupted
                            ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, 'en-NG', ?, ?, 0)
                            """,
                            (
                                linked_session_id,
                                title,
                                created_at,
                                tr_meta.get("duration_seconds", 0.0),
                                rec_ref,
                                tr_id,
                                raw_text,
                                tr_data.get("provider_name", "azure_speech"),
                                len(segments),
                                flags_count,
                            ),
                        )
                    for idx, seg in enumerate(segments):
                        seg_id = f"seg_{linked_session_id}_{idx}"
                        seg_chk = await conn.execute(
                            "SELECT segment_id FROM session_segments WHERE segment_id = ?",
                            (seg_id,),
                        )
                        if not await seg_chk.fetchone():
                            await conn.execute(
                                """
                                INSERT INTO session_segments (
                                    segment_id, session_id, segment_index, start_time, end_time,
                                    text, confidence, is_low_confidence, flags_json, words_json
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    seg_id,
                                    linked_session_id,
                                    idx,
                                    seg.get("start_time", 0.0),
                                    seg.get("end_time", 0.0),
                                    seg.get("text", ""),
                                    seg.get("confidence"),
                                    1 if seg.get("is_low_confidence") else 0,
                                    json.dumps(seg.get("flags", [])),
                                    json.dumps(seg.get("words", [])),
                                ),
                            )

            await conn.commit()

    # =========================================================================
    # Phase 5: Human Verification Workflow
    # =========================================================================

    async def init_verification(self, session_id: str) -> Dict[str, Any]:
        """
        Initialises verification for a session by gathering flagged segments
        into verification_items. Only segments with is_low_confidence=1 or
        non-empty flags become verification items. Unflagged segments are NOT
        added — they automatically retain raw wording in the Verified Transcript.

        A segment with multiple flags becomes ONE verification item with all
        flag reasons preserved in flag_reasons JSON.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            # Check session exists
            cursor = await conn.execute(
                "SELECT session_id, verification_status FROM sessions WHERE session_id = ?",
                (session_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return {"error": "Session not found"}

            # If already in_progress or complete, return current state
            if row["verification_status"] in ("in_progress", "complete"):
                return await self.get_verification_state(session_id)

            # Gather flagged segments
            seg_cursor = await conn.execute(
                """
                SELECT segment_index, start_time, end_time, text, confidence,
                       is_low_confidence, flags_json
                FROM session_segments
                WHERE session_id = ?
                  AND (is_low_confidence = 1
                       OR (flags_json IS NOT NULL AND flags_json != '[]' AND flags_json != ''))
                ORDER BY segment_index ASC
                """,
                (session_id,),
            )
            flagged_rows = await seg_cursor.fetchall()

            items_total = len(flagged_rows)

            # Create verification items for each flagged segment
            for seg in flagged_rows:
                item_id = f"vi_{session_id}_{seg['segment_index']}_{uuid.uuid4().hex[:6]}"
                flags = json.loads(seg["flags_json"] or "[]")
                flag_reasons = []
                if seg["is_low_confidence"]:
                    flag_reasons.append({
                        "type": "low_confidence",
                        "confidence": seg["confidence"],
                    })
                for f in flags:
                    flag_reasons.append(f)

                vi_chk = await conn.execute(
                    "SELECT item_id FROM verification_items WHERE session_id = ? AND segment_index = ?",
                    (session_id, seg["segment_index"]),
                )
                if not await vi_chk.fetchone():
                    await conn.execute(
                        """
                        INSERT INTO verification_items (
                            item_id, session_id, segment_index, original_text, verified_text,
                            start_time, end_time, original_confidence, action,
                            correction_note, verified_at, flag_reasons
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?)
                        """,
                        (
                            item_id,
                            session_id,
                            seg["segment_index"],
                            seg["text"],
                            seg["text"],  # pre-populate verified_text with original
                            seg["start_time"],
                            seg["end_time"],
                            seg["confidence"],
                            json.dumps(flag_reasons),
                        ),
                    )

            # Update session verification state
            new_status = "in_progress" if items_total > 0 else "not_started"
            await conn.execute(
                """
                UPDATE sessions
                SET verification_status = ?,
                    verification_items_total = ?,
                    verification_items_resolved = 0
                WHERE session_id = ?
                """,
                (new_status, items_total, session_id),
            )
            await conn.commit()

        return await self.get_verification_state(session_id)

    async def get_verification_state(self, session_id: str) -> Dict[str, Any]:
        """
        Returns the current verification state for a session, including
        verification status, progress counts, and all verification items.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT session_id, verification_status, verification_items_total,
                       verification_items_resolved, verified_at, flag_count, segment_count
                FROM sessions WHERE session_id = ?
                """,
                (session_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return {"error": "Session not found"}

            # Get all verification items
            vi_cursor = await conn.execute(
                """
                SELECT item_id, segment_index, original_text, verified_text,
                       start_time, end_time, original_confidence, action,
                       correction_note, verified_at, flag_reasons
                FROM verification_items
                WHERE session_id = ?
                ORDER BY segment_index ASC
                """,
                (session_id,),
            )
            vi_rows = await vi_cursor.fetchall()
            items = []
            for vi in vi_rows:
                item = dict(vi)
                item["flag_reasons"] = json.loads(item["flag_reasons"] or "[]")
                items.append(item)

            return {
                "session_id": session_id,
                "verification_status": row["verification_status"],
                "items_total": row["verification_items_total"],
                "items_resolved": row["verification_items_resolved"],
                "flag_count": row["flag_count"],
                "segment_count": row["segment_count"],
                "verified_at": row["verified_at"],
                "items": items,
            }

    async def resolve_verification_item(
        self,
        session_id: str,
        segment_index: int,
        verified_text: str,
        action: str,
        correction_note: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Resolves a single verification item by confirming or correcting it.
        action must be 'confirmed' or 'corrected'.
        """
        if action not in ("confirmed", "corrected"):
            return {"error": "action must be 'confirmed' or 'corrected'"}

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # Check item exists
            cursor = await conn.execute(
                """
                SELECT item_id, action as current_action
                FROM verification_items
                WHERE session_id = ? AND segment_index = ?
                """,
                (session_id, segment_index),
            )
            item_row = await cursor.fetchone()
            if not item_row:
                return {"error": f"Verification item not found for segment {segment_index}"}

            was_pending = item_row["current_action"] == "pending"

            await conn.execute(
                """
                UPDATE verification_items
                SET verified_text = ?,
                    action = ?,
                    correction_note = ?,
                    verified_at = ?
                WHERE session_id = ? AND segment_index = ?
                """,
                (verified_text, action, correction_note, now_iso, session_id, segment_index),
            )

            # Recompute resolved count
            resolved_cursor = await conn.execute(
                """
                SELECT COUNT(*) as cnt FROM verification_items
                WHERE session_id = ? AND action != 'pending'
                """,
                (session_id,),
            )
            resolved_row = await resolved_cursor.fetchone()
            resolved_count = resolved_row["cnt"]

            await conn.execute(
                """
                UPDATE sessions
                SET verification_items_resolved = ?
                WHERE session_id = ?
                """,
                (resolved_count, session_id),
            )
            await conn.commit()

        return await self.get_verification_state(session_id)

    async def confirm_all_remaining(self, session_id: str) -> Dict[str, Any]:
        """
        Bulk verification improvement:
        Finds all unresolved (action='pending') verification items for the session
        and marks each as 'confirmed' (using original_text wording).
        Preserves existing human corrections and already-confirmed items unchanged.
        Updates verification progress and SQLite persistence immediately.
        """
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # Check session exists
            cursor = await conn.execute(
                "SELECT session_id FROM sessions WHERE session_id = ?",
                (session_id,),
            )
            if not await cursor.fetchone():
                return {"error": "Session not found"}

            # Update ONLY pending items to 'confirmed', setting verified_text = original_text
            await conn.execute(
                """
                UPDATE verification_items
                SET verified_text = original_text,
                    action = 'confirmed',
                    correction_note = NULL,
                    verified_at = ?
                WHERE session_id = ? AND action = 'pending'
                """,
                (now_iso, session_id),
            )

            # Recompute resolved count
            resolved_cursor = await conn.execute(
                """
                SELECT COUNT(*) as cnt FROM verification_items
                WHERE session_id = ? AND action != 'pending'
                """,
                (session_id,),
            )
            resolved_row = await resolved_cursor.fetchone()
            resolved_count = resolved_row["cnt"]

            await conn.execute(
                """
                UPDATE sessions
                SET verification_items_resolved = ?
                WHERE session_id = ?
                """,
                (resolved_count, session_id),
            )
            await conn.commit()

        return await self.get_verification_state(session_id)

    async def add_manual_verification_item(
        self, session_id: str, segment_index: int
    ) -> Dict[str, Any]:
        """
        Allows the reviewer to manually flag an unflagged segment for review.
        Creates a new verification_items record with action='pending'.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            # Check item doesn't already exist for this segment
            cursor = await conn.execute(
                "SELECT item_id FROM verification_items WHERE session_id = ? AND segment_index = ?",
                (session_id, segment_index),
            )
            if await cursor.fetchone():
                return {"error": f"Verification item already exists for segment {segment_index}"}

            # Get the raw segment data
            seg_cursor = await conn.execute(
                """
                SELECT segment_index, start_time, end_time, text, confidence
                FROM session_segments
                WHERE session_id = ? AND segment_index = ?
                """,
                (session_id, segment_index),
            )
            seg = await seg_cursor.fetchone()
            if not seg:
                return {"error": f"Segment {segment_index} not found in session"}

            item_id = f"vi_{session_id}_{segment_index}_{uuid.uuid4().hex[:6]}"
            flag_reasons = [{"type": "manual_verification", "added_by": "reviewer"}]

            await conn.execute(
                """
                INSERT INTO verification_items (
                    item_id, session_id, segment_index, original_text, verified_text,
                    start_time, end_time, original_confidence, action,
                    correction_note, verified_at, flag_reasons
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?)
                """,
                (
                    item_id,
                    session_id,
                    segment_index,
                    seg["text"],
                    seg["text"],
                    seg["start_time"],
                    seg["end_time"],
                    seg["confidence"],
                    json.dumps(flag_reasons),
                ),
            )

            # Increment total count
            await conn.execute(
                """
                UPDATE sessions
                SET verification_items_total = verification_items_total + 1,
                    verification_status = 'in_progress'
                WHERE session_id = ?
                """,
                (session_id,),
            )
            await conn.commit()

        return await self.get_verification_state(session_id)

    async def finalise_verification(self, session_id: str) -> Dict[str, Any]:
        """
        Finalises verification: checks all items are resolved, then constructs
        the complete Verified Transcript by overlaying corrections onto the
        full raw segment sequence. Saves to SQLite and storage/verified_transcripts/.

        Does NOT change session.status. Only sets verification_status = 'complete'.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            # Check verification state
            cursor = await conn.execute(
                """
                SELECT verification_status, verification_items_total,
                       verification_items_resolved
                FROM sessions WHERE session_id = ?
                """,
                (session_id,),
            )
            sess = await cursor.fetchone()
            if not sess:
                return {"error": "Session not found"}

            if sess["verification_items_total"] > 0 and \
               sess["verification_items_resolved"] < sess["verification_items_total"]:
                unresolved = sess["verification_items_total"] - sess["verification_items_resolved"]
                return {
                    "error": f"Cannot finalise: {unresolved} verification item(s) still pending."
                }

            # Get all verification corrections keyed by segment_index
            vi_cursor = await conn.execute(
                """
                SELECT segment_index, verified_text, action
                FROM verification_items
                WHERE session_id = ? AND action = 'corrected'
                """,
                (session_id,),
            )
            vi_rows = await vi_cursor.fetchall()
            corrections = {vi["segment_index"]: vi["verified_text"] for vi in vi_rows}

            # Get ALL raw segments in order
            seg_cursor = await conn.execute(
                """
                SELECT segment_index, start_time, end_time, text, confidence
                FROM session_segments
                WHERE session_id = ?
                ORDER BY segment_index ASC
                """,
                (session_id,),
            )
            all_segments = await seg_cursor.fetchall()

            # Build complete Verified Transcript
            verified_segments = []
            for seg in all_segments:
                idx = seg["segment_index"]
                if idx in corrections:
                    final_text = corrections[idx]
                    source = "corrected"
                else:
                    final_text = seg["text"]
                    source = "raw"

                verified_segments.append({
                    "segment_index": idx,
                    "start_time": seg["start_time"],
                    "end_time": seg["end_time"],
                    "text": final_text,
                    "source": source,
                    "original_confidence": seg["confidence"],
                })

            verified_full_text = " ".join(
                s["text"].strip() for s in verified_segments if s["text"].strip()
            )
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            # Get verification item count for the JSON
            vi_count_cursor = await conn.execute(
                "SELECT COUNT(*) as cnt FROM verification_items WHERE session_id = ?",
                (session_id,),
            )
            vi_count = (await vi_count_cursor.fetchone())["cnt"]

            # Save to sessions table
            await conn.execute(
                """
                UPDATE sessions
                SET verification_status = 'complete',
                    verified_text = ?,
                    verified_at = ?
                WHERE session_id = ?
                """,
                (verified_full_text, now_iso, session_id),
            )
            await conn.commit()

        # Save to storage/verified_transcripts/ JSON file
        verified_data = {
            "session_id": session_id,
            "verified_at": now_iso,
            "total_segments": len(verified_segments),
            "verification_items_reviewed": vi_count,
            "segments": verified_segments,
            "verified_text": verified_full_text,
        }
        self._save_verified_transcript_file(session_id, verified_data)

        return {
            "status": "complete",
            "session_id": session_id,
            "verified_at": now_iso,
            "total_segments": len(verified_segments),
            "verification_items_reviewed": vi_count,
            "verified_text": verified_full_text,
        }

    async def confirm_raw_as_verified(self, session_id: str) -> Dict[str, Any]:
        """
        For zero-flag sessions: creates the Verified Transcript directly from
        all raw segments with one explicit human confirmation action.
        No individual verification items are created.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            # Verify this session actually has zero verification items
            cursor = await conn.execute(
                """
                SELECT verification_status, verification_items_total
                FROM sessions WHERE session_id = ?
                """,
                (session_id,),
            )
            sess = await cursor.fetchone()
            if not sess:
                return {"error": "Session not found"}

            if sess["verification_status"] == "complete":
                return {"error": "Verification already complete for this session."}

            # Check no pending items exist
            vi_cursor = await conn.execute(
                "SELECT COUNT(*) as cnt FROM verification_items WHERE session_id = ? AND action = 'pending'",
                (session_id,),
            )
            pending = (await vi_cursor.fetchone())["cnt"]
            if pending > 0:
                return {"error": f"Cannot confirm raw as verified: {pending} pending verification items exist."}

            # Get all raw segments
            seg_cursor = await conn.execute(
                """
                SELECT segment_index, start_time, end_time, text, confidence
                FROM session_segments
                WHERE session_id = ?
                ORDER BY segment_index ASC
                """,
                (session_id,),
            )
            all_segments = await seg_cursor.fetchall()

            verified_segments = []
            for seg in all_segments:
                verified_segments.append({
                    "segment_index": seg["segment_index"],
                    "start_time": seg["start_time"],
                    "end_time": seg["end_time"],
                    "text": seg["text"],
                    "source": "raw",
                    "original_confidence": seg["confidence"],
                })

            verified_full_text = " ".join(
                s["text"].strip() for s in verified_segments if s["text"].strip()
            )
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            await conn.execute(
                """
                UPDATE sessions
                SET verification_status = 'complete',
                    verified_text = ?,
                    verified_at = ?
                WHERE session_id = ?
                """,
                (verified_full_text, now_iso, session_id),
            )
            await conn.commit()

        # Save JSON file
        verified_data = {
            "session_id": session_id,
            "verified_at": now_iso,
            "total_segments": len(verified_segments),
            "verification_items_reviewed": 0,
            "segments": verified_segments,
            "verified_text": verified_full_text,
        }
        self._save_verified_transcript_file(session_id, verified_data)

        return {
            "status": "complete",
            "session_id": session_id,
            "verified_at": now_iso,
            "total_segments": len(verified_segments),
            "verification_items_reviewed": 0,
            "verified_text": verified_full_text,
        }

    def _save_verified_transcript_file(self, session_id: str, data: Dict[str, Any]):
        """Saves verified transcript JSON to storage/verified_transcripts/."""
        os.makedirs(STORAGE_VERIFIED_DIR, exist_ok=True)
        file_path = os.path.join(STORAGE_VERIFIED_DIR, f"{session_id}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Stage 6: Autonomous AI Verification Storage Methods
    # =========================================================================

    async def set_ai_verification_status(
        self,
        session_id: str,
        status: str,  # 'idle' | 'compiling' | 'verifying' | 'completed_verified' | 'completed_needs_review' | 'ai_unavailable' | 'failed'
        summary: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Updates the session's AI verification processing lifecycle status."""
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        updates = ["ai_verification_status = ?"]
        params = [status]

        if status in ("compiling", "verifying"):
            updates.append("ai_verification_started_at = ?")
            params.append(now_iso)
        elif status in ("completed_verified", "completed_needs_review", "ai_unavailable", "failed"):
            updates.append("ai_verification_completed_at = ?")
            params.append(now_iso)

        if summary is not None:
            updates.append("ai_verification_summary_json = ?")
            params.append(json.dumps(summary, ensure_ascii=False))

        params.append(session_id)
        query = f"UPDATE sessions SET {', '.join(updates)} WHERE session_id = ?"

        async with get_db_connection() as conn:
            await conn.execute(query, tuple(params))
            await conn.commit()

        return await self.get_ai_verification_status(session_id)

    async def get_ai_verification_status(self, session_id: str) -> Dict[str, Any]:
        """Returns the current AI verification lifecycle state and summary for a session."""
        await self.init_db()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT session_id, verification_status, ai_verification_status,
                       ai_verification_started_at, ai_verification_completed_at,
                       ai_verification_summary_json, verification_items_total,
                       verification_items_resolved
                FROM sessions WHERE session_id = ?
                """,
                (session_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return {"error": "Session not found", "session_id": session_id}

            row_dict = dict(row)
            summary = {}
            if row_dict.get("ai_verification_summary_json"):
                try:
                    summary = json.loads(row_dict["ai_verification_summary_json"])
                except Exception:
                    summary = {}

            return {
                "session_id": session_id,
                "verification_status": row_dict.get("verification_status") or "not_started",
                "ai_verification_status": row_dict.get("ai_verification_status") or "idle",
                "started_at": row_dict.get("ai_verification_started_at"),
                "completed_at": row_dict.get("ai_verification_completed_at"),
                "summary": summary,
                "items_total": row_dict.get("verification_items_total") or 0,
                "items_resolved": row_dict.get("verification_items_resolved") or 0,
                "items_pending": max(0, (row_dict.get("verification_items_total") or 0) - (row_dict.get("verification_items_resolved") or 0)),
            }

    async def save_ai_verification_item_result(
        self,
        session_id: str,
        segment_index: int,
        ai_decision: str,  # 'VERIFIED' | 'CORRECTED' | 'UNRESOLVED'
        ai_verified_text: str,
        ai_confidence: float,
        ai_explanation: str,
        ai_model_name: str = "gemini-3.8-flash",
        ai_scriptures: Optional[List[str]] = None,
        auto_resolve: bool = False,
    ) -> Dict[str, Any]:
        """
        Stores AI evaluation result on a verification item.
        If auto_resolve=True:
          - Marks item as action='confirmed' (if VERIFIED) or action='corrected' (if CORRECTED)
          - Updates verified_text and increments verification_items_resolved
        If auto_resolve=False (or decision is UNRESOLVED):
          - Retains item as action='pending' for human review, attaching AI proposal & explanation.
        """
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        scriptures_json = json.dumps(ai_scriptures or [], ensure_ascii=False)

        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT item_id, action, verified_text FROM verification_items WHERE session_id = ? AND segment_index = ?",
                (session_id, segment_index),
            )
            item_row = await cursor.fetchone()
            if not item_row:
                return {"error": f"Verification item for segment {segment_index} not found"}

            item_id = item_row["item_id"]
            current_action = item_row["action"]

            new_action = current_action
            new_verified_text = item_row["verified_text"]
            correction_note = None

            if auto_resolve:
                if ai_decision == "VERIFIED":
                    new_action = "confirmed"
                    new_verified_text = ai_verified_text
                    correction_note = f"AI Verified: {ai_explanation}"
                elif ai_decision == "CORRECTED":
                    new_action = "corrected"
                    new_verified_text = ai_verified_text
                    correction_note = f"AI Corrected: {ai_explanation}"
            else:
                correction_note = f"AI Suggested ({ai_decision}): {ai_explanation}"

            await conn.execute(
                """
                UPDATE verification_items
                SET ai_decision = ?,
                    ai_verified_text = ?,
                    ai_confidence = ?,
                    ai_explanation = ?,
                    ai_model_name = ?,
                    ai_scriptures_json = ?,
                    action = ?,
                    verified_text = ?,
                    correction_note = COALESCE(?, correction_note),
                    verified_at = CASE WHEN ? IN ('confirmed', 'corrected') THEN ? ELSE verified_at END
                WHERE item_id = ?
                """,
                (
                    ai_decision,
                    ai_verified_text,
                    ai_confidence,
                    ai_explanation,
                    ai_model_name,
                    scriptures_json,
                    new_action,
                    new_verified_text,
                    correction_note,
                    new_action,
                    now_iso,
                    item_id,
                ),
            )

            # Update resolved count in sessions
            count_cursor = await conn.execute(
                "SELECT COUNT(*) as resolved FROM verification_items WHERE session_id = ? AND action IN ('confirmed', 'corrected')",
                (session_id,),
            )
            resolved_count = (await count_cursor.fetchone())["resolved"]

            await conn.execute(
                "UPDATE sessions SET verification_items_resolved = ? WHERE session_id = ?",
                (resolved_count, session_id),
            )
            await conn.commit()

        return {
            "status": "success",
            "item_id": item_id,
            "session_id": session_id,
            "segment_index": segment_index,
            "ai_decision": ai_decision,
            "action": new_action,
            "verified_text": new_verified_text,
        }


# Singleton instance
session_repo = SessionRepository()

