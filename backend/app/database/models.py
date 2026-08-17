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

-- Phase 6: Versioned Reporting Standards (editable guidelines, glossary, examples)
CREATE TABLE IF NOT EXISTS reporting_standards (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    version_label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    general_guidelines TEXT NOT NULL,
    reporter_a_instructions TEXT NOT NULL,
    reporter_b_instructions TEXT NOT NULL,
    terminology TEXT NOT NULL,
    examples TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_standards_version ON reporting_standards(version DESC);
CREATE INDEX IF NOT EXISTS idx_standards_active ON reporting_standards(is_active);

-- Phase 6: Generated Reports (Reporter A and Reporter B outputs)
CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    transcript_id TEXT,
    reporter_role TEXT NOT NULL, -- 'reporter_a' | 'reporter_b'
    standard_version INTEGER NOT NULL,
    standard_version_label TEXT NOT NULL,
    status TEXT NOT NULL, -- 'generating' | 'ready' | 'failed'
    report_title TEXT,
    report_text TEXT,
    key_points_json TEXT,
    scriptures_json TEXT,
    warnings_json TEXT,
    evidence_metadata_json TEXT,
    model_name TEXT,
    error_message TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_session_role ON reports(session_id, reporter_role, is_active);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

-- Phase 7: Versioned Editor Standards (editable compilation guidelines, glossary, examples)
CREATE TABLE IF NOT EXISTS editor_standards (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    version_label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    general_guidelines TEXT NOT NULL,
    compilation_guidance TEXT NOT NULL,
    terminology TEXT NOT NULL,
    approved_examples TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editor_standards_version ON editor_standards(version DESC);
CREATE INDEX IF NOT EXISTS idx_editor_standards_active ON editor_standards(is_active);

-- Phase 7: Edited Report Revisions (AI generated & human edited drafts)
CREATE TABLE IF NOT EXISTS edited_reports (
    revision_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    transcript_id TEXT,
    reporter_a_id TEXT,
    reporter_b_id TEXT,
    standard_version INTEGER NOT NULL,
    standard_version_label TEXT NOT NULL,
    revision_number INTEGER NOT NULL,
    revision_source TEXT NOT NULL, -- 'ai_generated' | 'human_edited' | 'ai_regenerated'
    report_title TEXT,
    report_text TEXT NOT NULL,
    review_notes_json TEXT,
    source_uncertainties_json TEXT,
    model_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edited_reports_session ON edited_reports(session_id, is_active);
CREATE INDEX IF NOT EXISTS idx_edited_reports_rev ON edited_reports(session_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_edited_reports_created ON edited_reports(created_at DESC);
"""

# Phase 5 migration: add verification columns to sessions table.
PHASE5_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN verification_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN verification_items_total INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN verification_items_resolved INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN verified_text TEXT",
    "ALTER TABLE sessions ADD COLUMN verified_at TEXT",
]

# Phase 6 migration: add reporting workflow columns to sessions table.
PHASE6_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN reporting_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN reporting_completed_at TEXT",
    "ALTER TABLE sessions ADD COLUMN reporting_standard_version INTEGER",
]

# Phase 7 migration: add editing workflow columns to sessions table.
PHASE7_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN editing_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN editing_completed_at TEXT",
    "ALTER TABLE sessions ADD COLUMN editing_standard_version INTEGER",
]


