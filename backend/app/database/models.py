"""
Database models and DDL schema definitions for Phase 4 Session Persistence.
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
"""
