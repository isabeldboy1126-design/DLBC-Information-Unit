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

-- Phase 8: Versioned Proofreading Standards (capitalization, punctuation, scriptures, terminology)
CREATE TABLE IF NOT EXISTS proofreading_standards (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    version_label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    guidelines TEXT NOT NULL,
    terminology TEXT NOT NULL,
    formatting_rules TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proofreading_standards_version ON proofreading_standards(version DESC);
CREATE INDEX IF NOT EXISTS idx_proofreading_standards_active ON proofreading_standards(is_active);

-- Phase 8: Proofread Report Revisions (conservative AI check & human accepted/adjusted versions)
CREATE TABLE IF NOT EXISTS proofread_reports (
    revision_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    edited_report_revision_id TEXT,
    standard_version INTEGER NOT NULL,
    standard_version_label TEXT NOT NULL,
    revision_number INTEGER NOT NULL,
    revision_source TEXT NOT NULL, -- 'ai_proofread' | 'human_reviewed'
    proofread_title TEXT,
    proofread_text TEXT NOT NULL,
    changes_json TEXT,
    review_notes_json TEXT,
    model_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_accepted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proofread_reports_session ON proofread_reports(session_id, is_active);
CREATE INDEX IF NOT EXISTS idx_proofread_reports_rev ON proofread_reports(session_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_proofread_reports_created ON proofread_reports(created_at DESC);

-- Phase 9: Final Reports (derived from approved proofread report, finalized for download/export)
CREATE TABLE IF NOT EXISTS final_reports (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    proofread_report_revision_id TEXT,
    revision_number INTEGER NOT NULL,
    report_title TEXT NOT NULL,
    report_text TEXT NOT NULL,
    minister TEXT,
    programme TEXT,
    service_date TEXT,
    docx_filename TEXT,
    docx_file_size INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_final_reports_session ON final_reports(session_id, is_active);
CREATE INDEX IF NOT EXISTS idx_final_reports_rev ON final_reports(session_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_final_reports_created ON final_reports(created_at DESC);

-- Configurable Programmes & Sessions
CREATE TABLE IF NOT EXISTS programmes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_programmes_archived ON programmes(is_archived, sort_order ASC);

CREATE TABLE IF NOT EXISTS programme_sessions (
    id TEXT PRIMARY KEY,
    programme_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(programme_id) REFERENCES programmes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_programme_sessions_prog ON programme_sessions(programme_id, is_archived, sort_order ASC);
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

# Phase 8 migration: add proofreading workflow columns to sessions table.
PHASE8_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN proofreading_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN proofreading_completed_at TEXT",
    "ALTER TABLE sessions ADD COLUMN proofreading_standard_version INTEGER",
    "ALTER TABLE sessions ADD COLUMN accepted_proofread_revision_id TEXT",
]

# Phase 9 migration: add final report workflow columns to sessions table.
PHASE9_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN final_report_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN final_report_completed_at TEXT",
    "ALTER TABLE sessions ADD COLUMN final_report_id TEXT",
]

# Stage 6 migration: add AI verification engine workflow columns to sessions & verification_items tables.
STAGE6_AI_VERIFICATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN ai_verification_status TEXT DEFAULT 'idle'",
    "ALTER TABLE sessions ADD COLUMN ai_verification_started_at TEXT",
    "ALTER TABLE sessions ADD COLUMN ai_verification_completed_at TEXT",
    "ALTER TABLE sessions ADD COLUMN ai_verification_summary_json TEXT",
    "ALTER TABLE sessions ADD COLUMN event_id TEXT",
    "ALTER TABLE verification_items ADD COLUMN ai_decision TEXT",
    "ALTER TABLE verification_items ADD COLUMN ai_verified_text TEXT",
    "ALTER TABLE verification_items ADD COLUMN ai_confidence REAL",
    "ALTER TABLE verification_items ADD COLUMN ai_explanation TEXT",
    "ALTER TABLE verification_items ADD COLUMN ai_model_name TEXT",
    "ALTER TABLE verification_items ADD COLUMN ai_scriptures_json TEXT",
]

# ---------------------------------------------------------------------------
# Azure SQL / Microsoft SQL Server DDL Schema (Production)
# ---------------------------------------------------------------------------
INIT_SCHEMA_MSSQL = """
IF OBJECT_ID(N'sessions', N'U') IS NULL
CREATE TABLE sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    title NVARCHAR(MAX) NOT NULL,
    date_created VARCHAR(255) NOT NULL,
    start_time FLOAT,
    end_time FLOAT,
    duration_seconds FLOAT DEFAULT 0.0,
    status VARCHAR(100) NOT NULL,
    recording_id VARCHAR(255),
    audio_filename NVARCHAR(MAX),
    audio_file_path NVARCHAR(MAX),
    audio_file_size BIGINT DEFAULT 0,
    audio_duration_seconds FLOAT DEFAULT 0.0,
    transcript_id VARCHAR(255),
    raw_text NVARCHAR(MAX),
    provider_name VARCHAR(100),
    language_code VARCHAR(50) DEFAULT 'en-NG',
    segment_count INT DEFAULT 0,
    flag_count INT DEFAULT 0,
    is_interrupted INT DEFAULT 0,
    recovery_notes NVARCHAR(MAX),
    metadata_json NVARCHAR(MAX)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_sessions_created')
CREATE INDEX idx_sessions_created ON sessions(date_created DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_sessions_status')
CREATE INDEX idx_sessions_status ON sessions(status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_sessions_recording')
CREATE INDEX idx_sessions_recording ON sessions(recording_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_sessions_transcript')
CREATE INDEX idx_sessions_transcript ON sessions(transcript_id);

IF OBJECT_ID(N'session_segments', N'U') IS NULL
CREATE TABLE session_segments (
    segment_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    segment_index INT NOT NULL,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    text NVARCHAR(MAX) NOT NULL,
    confidence FLOAT,
    is_low_confidence INT DEFAULT 0,
    flags_json NVARCHAR(MAX),
    words_json NVARCHAR(MAX),
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_segments_session')
CREATE INDEX idx_segments_session ON session_segments(session_id, segment_index ASC);

IF OBJECT_ID(N'verification_items', N'U') IS NULL
CREATE TABLE verification_items (
    item_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    segment_index INT NOT NULL,
    original_text NVARCHAR(MAX) NOT NULL,
    verified_text NVARCHAR(MAX) NOT NULL,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    original_confidence FLOAT,
    action VARCHAR(100) NOT NULL DEFAULT 'pending',
    correction_note NVARCHAR(MAX),
    verified_at VARCHAR(255),
    flag_reasons NVARCHAR(MAX),
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_verification_session')
CREATE INDEX idx_verification_session ON verification_items(session_id, segment_index ASC);

IF OBJECT_ID(N'reporting_standards', N'U') IS NULL
CREATE TABLE reporting_standards (
    id VARCHAR(255) PRIMARY KEY,
    version INT NOT NULL UNIQUE,
    version_label VARCHAR(255) NOT NULL,
    is_active INT NOT NULL DEFAULT 0,
    general_guidelines NVARCHAR(MAX) NOT NULL,
    reporter_a_instructions NVARCHAR(MAX) NOT NULL,
    reporter_b_instructions NVARCHAR(MAX) NOT NULL,
    terminology NVARCHAR(MAX) NOT NULL,
    examples NVARCHAR(MAX) NOT NULL,
    notes NVARCHAR(MAX),
    created_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_standards_version')
CREATE INDEX idx_standards_version ON reporting_standards(version DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_standards_active')
CREATE INDEX idx_standards_active ON reporting_standards(is_active);

IF OBJECT_ID(N'reports', N'U') IS NULL
CREATE TABLE reports (
    report_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    transcript_id VARCHAR(255),
    reporter_role VARCHAR(100) NOT NULL,
    standard_version INT NOT NULL,
    standard_version_label VARCHAR(255) NOT NULL,
    status VARCHAR(100) NOT NULL,
    report_title NVARCHAR(MAX),
    report_text NVARCHAR(MAX),
    key_points_json NVARCHAR(MAX),
    scriptures_json NVARCHAR(MAX),
    warnings_json NVARCHAR(MAX),
    evidence_metadata_json NVARCHAR(MAX),
    model_name VARCHAR(255),
    error_message NVARCHAR(MAX),
    is_active INT NOT NULL DEFAULT 1,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reports_session_role')
CREATE INDEX idx_reports_session_role ON reports(session_id, reporter_role, is_active);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reports_created')
CREATE INDEX idx_reports_created ON reports(created_at DESC);

IF OBJECT_ID(N'editor_standards', N'U') IS NULL
CREATE TABLE editor_standards (
    id VARCHAR(255) PRIMARY KEY,
    version INT NOT NULL UNIQUE,
    version_label VARCHAR(255) NOT NULL,
    is_active INT NOT NULL DEFAULT 0,
    general_guidelines NVARCHAR(MAX) NOT NULL,
    compilation_guidance NVARCHAR(MAX) NOT NULL,
    terminology NVARCHAR(MAX) NOT NULL,
    approved_examples NVARCHAR(MAX) NOT NULL,
    notes NVARCHAR(MAX),
    created_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_editor_standards_version')
CREATE INDEX idx_editor_standards_version ON editor_standards(version DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_editor_standards_active')
CREATE INDEX idx_editor_standards_active ON editor_standards(is_active);

IF OBJECT_ID(N'edited_reports', N'U') IS NULL
CREATE TABLE edited_reports (
    revision_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    transcript_id VARCHAR(255),
    reporter_a_id VARCHAR(255),
    reporter_b_id VARCHAR(255),
    standard_version INT NOT NULL,
    standard_version_label VARCHAR(255) NOT NULL,
    revision_number INT NOT NULL,
    revision_source VARCHAR(100) NOT NULL,
    report_title NVARCHAR(MAX),
    report_text NVARCHAR(MAX) NOT NULL,
    review_notes_json NVARCHAR(MAX),
    source_uncertainties_json NVARCHAR(MAX),
    model_name VARCHAR(255),
    is_active INT NOT NULL DEFAULT 1,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_edited_reports_session')
CREATE INDEX idx_edited_reports_session ON edited_reports(session_id, is_active);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_edited_reports_rev')
CREATE INDEX idx_edited_reports_rev ON edited_reports(session_id, revision_number DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_edited_reports_created')
CREATE INDEX idx_edited_reports_created ON edited_reports(created_at DESC);

IF OBJECT_ID(N'proofreading_standards', N'U') IS NULL
CREATE TABLE proofreading_standards (
    id VARCHAR(255) PRIMARY KEY,
    version INT NOT NULL UNIQUE,
    version_label VARCHAR(255) NOT NULL,
    is_active INT NOT NULL DEFAULT 0,
    guidelines NVARCHAR(MAX) NOT NULL,
    terminology NVARCHAR(MAX) NOT NULL,
    formatting_rules NVARCHAR(MAX) NOT NULL,
    notes NVARCHAR(MAX),
    created_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_proofreading_standards_version')
CREATE INDEX idx_proofreading_standards_version ON proofreading_standards(version DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_proofreading_standards_active')
CREATE INDEX idx_proofreading_standards_active ON proofreading_standards(is_active);

IF OBJECT_ID(N'proofread_reports', N'U') IS NULL
CREATE TABLE proofread_reports (
    revision_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    edited_report_revision_id VARCHAR(255),
    standard_version INT NOT NULL,
    standard_version_label VARCHAR(255) NOT NULL,
    revision_number INT NOT NULL,
    revision_source VARCHAR(100) NOT NULL,
    proofread_title NVARCHAR(MAX),
    proofread_text NVARCHAR(MAX) NOT NULL,
    changes_json NVARCHAR(MAX),
    review_notes_json NVARCHAR(MAX),
    model_name VARCHAR(255),
    is_active INT NOT NULL DEFAULT 1,
    is_accepted INT NOT NULL DEFAULT 0,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_proofread_reports_session')
CREATE INDEX idx_proofread_reports_session ON proofread_reports(session_id, is_active);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_proofread_reports_rev')
CREATE INDEX idx_proofread_reports_rev ON proofread_reports(session_id, revision_number DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_proofread_reports_created')
CREATE INDEX idx_proofread_reports_created ON proofread_reports(created_at DESC);

IF OBJECT_ID(N'final_reports', N'U') IS NULL
CREATE TABLE final_reports (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    proofread_report_revision_id VARCHAR(255),
    revision_number INT NOT NULL,
    report_title NVARCHAR(MAX) NOT NULL,
    report_text NVARCHAR(MAX) NOT NULL,
    minister NVARCHAR(MAX),
    programme NVARCHAR(MAX),
    service_date VARCHAR(255),
    docx_filename NVARCHAR(MAX),
    docx_file_path NVARCHAR(MAX),
    docx_file_size BIGINT DEFAULT 0,
    is_active INT NOT NULL DEFAULT 1,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_session')
CREATE INDEX idx_final_reports_session ON final_reports(session_id, is_active);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_rev')
CREATE INDEX idx_final_reports_rev ON final_reports(session_id, revision_number DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_created')
CREATE INDEX idx_final_reports_created ON final_reports(created_at DESC);

IF OBJECT_ID(N'programmes', N'U') IS NULL
CREATE TABLE programmes (
    id VARCHAR(255) PRIMARY KEY,
    name NVARCHAR(MAX) NOT NULL,
    is_archived INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_programmes_archived')
CREATE INDEX idx_programmes_archived ON programmes(is_archived, sort_order ASC);

IF OBJECT_ID(N'programme_sessions', N'U') IS NULL
CREATE TABLE programme_sessions (
    id VARCHAR(255) PRIMARY KEY,
    programme_id VARCHAR(255) NOT NULL,
    name NVARCHAR(MAX) NOT NULL,
    is_archived INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_programme_sessions_prog')
CREATE INDEX idx_programme_sessions_prog ON programme_sessions(programme_id, is_archived, sort_order ASC);
"""

PHASE5_MIGRATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'verification_status') IS NULL ALTER TABLE sessions ADD verification_status VARCHAR(100) DEFAULT 'not_started'",
    "IF COL_LENGTH('sessions', 'verification_items_total') IS NULL ALTER TABLE sessions ADD verification_items_total INT DEFAULT 0",
    "IF COL_LENGTH('sessions', 'verification_items_resolved') IS NULL ALTER TABLE sessions ADD verification_items_resolved INT DEFAULT 0",
    "IF COL_LENGTH('sessions', 'verified_text') IS NULL ALTER TABLE sessions ADD verified_text NVARCHAR(MAX)",
    "IF COL_LENGTH('sessions', 'verified_at') IS NULL ALTER TABLE sessions ADD verified_at VARCHAR(255)",
]

PHASE6_MIGRATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'reporting_status') IS NULL ALTER TABLE sessions ADD reporting_status VARCHAR(100) DEFAULT 'not_started'",
    "IF COL_LENGTH('sessions', 'reporting_completed_at') IS NULL ALTER TABLE sessions ADD reporting_completed_at VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'reporting_standard_version') IS NULL ALTER TABLE sessions ADD reporting_standard_version INT",
]

PHASE7_MIGRATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'editing_status') IS NULL ALTER TABLE sessions ADD editing_status VARCHAR(100) DEFAULT 'not_started'",
    "IF COL_LENGTH('sessions', 'editing_completed_at') IS NULL ALTER TABLE sessions ADD editing_completed_at VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'editing_standard_version') IS NULL ALTER TABLE sessions ADD editing_standard_version INT",
]

PHASE8_MIGRATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'proofreading_status') IS NULL ALTER TABLE sessions ADD proofreading_status VARCHAR(100) DEFAULT 'not_started'",
    "IF COL_LENGTH('sessions', 'proofreading_completed_at') IS NULL ALTER TABLE sessions ADD proofreading_completed_at VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'proofreading_standard_version') IS NULL ALTER TABLE sessions ADD proofreading_standard_version INT",
    "IF COL_LENGTH('sessions', 'accepted_proofread_revision_id') IS NULL ALTER TABLE sessions ADD accepted_proofread_revision_id VARCHAR(255)",
]

PHASE9_MIGRATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'final_report_status') IS NULL ALTER TABLE sessions ADD final_report_status VARCHAR(100) DEFAULT 'not_started'",
    "IF COL_LENGTH('sessions', 'final_report_completed_at') IS NULL ALTER TABLE sessions ADD final_report_completed_at VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'final_report_id') IS NULL ALTER TABLE sessions ADD final_report_id VARCHAR(255)",
]

STAGE6_AI_VERIFICATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'ai_verification_status') IS NULL ALTER TABLE sessions ADD ai_verification_status VARCHAR(50) DEFAULT 'idle'",
    "IF COL_LENGTH('sessions', 'ai_verification_started_at') IS NULL ALTER TABLE sessions ADD ai_verification_started_at VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'ai_verification_completed_at') IS NULL ALTER TABLE sessions ADD ai_verification_completed_at VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'ai_verification_summary_json') IS NULL ALTER TABLE sessions ADD ai_verification_summary_json NVARCHAR(MAX)",
    "IF COL_LENGTH('sessions', 'event_id') IS NULL ALTER TABLE sessions ADD event_id VARCHAR(255)",
    "IF COL_LENGTH('verification_items', 'ai_decision') IS NULL ALTER TABLE verification_items ADD ai_decision VARCHAR(50)",
    "IF COL_LENGTH('verification_items', 'ai_verified_text') IS NULL ALTER TABLE verification_items ADD ai_verified_text NVARCHAR(MAX)",
    "IF COL_LENGTH('verification_items', 'ai_confidence') IS NULL ALTER TABLE verification_items ADD ai_confidence FLOAT",
    "IF COL_LENGTH('verification_items', 'ai_explanation') IS NULL ALTER TABLE verification_items ADD ai_explanation NVARCHAR(MAX)",
    "IF COL_LENGTH('verification_items', 'ai_model_name') IS NULL ALTER TABLE verification_items ADD ai_model_name VARCHAR(100)",
    "IF COL_LENGTH('verification_items', 'ai_scriptures_json') IS NULL ALTER TABLE verification_items ADD ai_scriptures_json NVARCHAR(MAX)",
]



