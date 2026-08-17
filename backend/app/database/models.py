"""
Database models and DDL schema definitions for Phases 4–5.

Phase 4: sessions, session_segments
Phase 5: verification_items + session verification columns
"""

INIT_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date_created TEXT NOT NULL,
    start_time REAL,
    end_time REAL,
    duration_seconds REAL DEFAULT 0.0,
    status TEXT NOT NULL,
    recording_id TEXT,
    audio_filename TEXT,
    audio_file_path TEXT,
    audio_file_size INTEGER DEFAULT 0,
    audio_duration_seconds REAL DEFAULT 0.0,
    transcript_id TEXT,
    raw_text TEXT,
    provider_name TEXT,
    language_code TEXT DEFAULT 'en-NG',
    segment_count INTEGER DEFAULT 0,
    flag_count INTEGER DEFAULT 0,
    is_interrupted INTEGER DEFAULT 0,
    recovery_notes TEXT,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(date_created DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_recording ON sessions(recording_id);
CREATE INDEX IF NOT EXISTS idx_sessions_transcript ON sessions(transcript_id);

CREATE TABLE IF NOT EXISTS session_segments (
    segment_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    text TEXT NOT NULL,
    confidence REAL,
    is_low_confidence INTEGER DEFAULT 0,
    flags_json TEXT,
    words_json TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_session ON session_segments(session_id, segment_index ASC);

-- Phase 5: Verification items (stores ONLY flagged segments that require human review)
CREATE TABLE IF NOT EXISTS verification_items (
    item_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    original_text TEXT NOT NULL,
    verified_text TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    original_confidence REAL,
    action TEXT NOT NULL DEFAULT 'pending',
    correction_note TEXT,
    verified_at TEXT,
    flag_reasons TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verification_session
    ON verification_items(session_id, segment_index ASC);
"""

# Phase 5 migration: add verification columns to sessions table.
# Uses individual ALTER statements so each can safely fail if column already exists.
PHASE5_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN verification_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN verification_items_total INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN verification_items_resolved INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN verified_text TEXT",
    "ALTER TABLE sessions ADD COLUMN verified_at TEXT",
]
