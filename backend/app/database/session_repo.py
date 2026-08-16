"""
Session Repository Layer (Phase 4)

Provides asynchronous CRUD, progressive persistence, and non-destructive historical
indexing for church message sessions in SQLite.
"""

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from app.database.connection import DB_PATH, get_db_connection
from app.database.models import INIT_SCHEMA_SQL


class SessionRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes the database schema if not already initialized."""
        async with get_db_connection() as conn:
            await conn.executescript(INIT_SCHEMA_SQL)
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
            "raw_text": "",
            "provider_name": provider_name,
            "language_code": language_code,
            "segment_count": 0,
            "flag_count": 0,
            "is_interrupted": 0,
            "recovery_notes": None,
            "metadata_json": json.dumps(metadata or {}),
        }

        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT OR REPLACE INTO sessions (
                    session_id, title, date_created, start_time, end_time, duration_seconds,
                    status, recording_id, audio_filename, audio_file_path, audio_file_size,
                    audio_duration_seconds, transcript_id, raw_text, provider_name,
                    language_code, segment_count, flag_count, is_interrupted,
                    recovery_notes, metadata_json
                ) VALUES (
                    :session_id, :title, :date_created, :start_time, :end_time, :duration_seconds,
                    :status, :recording_id, :audio_filename, :audio_file_path, :audio_file_size,
                    :audio_duration_seconds, :transcript_id, :raw_text, :provider_name,
                    :language_code, :segment_count, :flag_count, :is_interrupted,
                    :recovery_notes, :metadata_json
                )
                """,
                session_record,
            )
            await conn.commit()

        return session_record

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
        Progressively persists a newly finalized transcript segment to SQLite.
        Updates session segment count and flag count durably.
        """
        segment_id = f"seg_{session_id}_{segment_index}_{uuid.uuid4().hex[:6]}"
        flags_json = json.dumps(flags or [])
        words_json = json.dumps(words or [])
        flag_increment = len(flags or [])

        async with get_db_connection() as conn:
            # 1. Insert segment
            await conn.execute(
                """
                INSERT OR REPLACE INTO session_segments (
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

            # 2. Update session duration and counts
            await conn.execute(
                """
                UPDATE sessions
                SET segment_count = (SELECT COUNT(*) FROM session_segments WHERE session_id = ?),
                    flag_count = (SELECT SUM(json_array_length(flags_json)) FROM session_segments WHERE session_id = ?),
                    duration_seconds = MAX(duration_seconds, ?),
                    raw_text = (
                        SELECT GROUP_CONCAT(text, ' ') FROM (
                            SELECT text FROM session_segments WHERE session_id = ? ORDER BY segment_index ASC
                        )
                    )
                WHERE session_id = ?
                """,
                (session_id, session_id, end_time, session_id, session_id),
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
            # Recompute total flag count for session
            await conn.execute(
                """
                UPDATE sessions
                SET flag_count = (
                    SELECT COALESCE(SUM(json_array_length(flags_json)), 0)
                    FROM session_segments WHERE session_id = ?
                )
                WHERE session_id = ?
                """,
                (session_id, session_id),
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
                       flag_count, is_interrupted, recovery_notes
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
        app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        backend_dir = os.path.dirname(app_dir)
        project_root = os.path.dirname(backend_dir)

        audio_manifest_path = os.path.join(project_root, "storage", "audio", "recordings_manifest.json")
        transcripts_manifest_path = os.path.join(project_root, "storage", "transcripts", "transcripts_manifest.json")

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
                    INSERT OR IGNORE INTO sessions (
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
                tr_file_path = os.path.join(project_root, "storage", "transcripts", f"{tr_id}.json")
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
                        await conn.execute(
                            """
                            INSERT OR IGNORE INTO session_segments (
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
                    await conn.execute(
                        """
                        INSERT OR IGNORE INTO sessions (
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
                        await conn.execute(
                            """
                            INSERT OR IGNORE INTO session_segments (
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


# Singleton instance
session_repo = SessionRepository()
