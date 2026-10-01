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
    approval_status TEXT DEFAULT 'draft',
    approved_at TEXT,
    approved_by_user_id TEXT,
    approved_by_account_id TEXT,
    approved_revision_id TEXT,
    source_hash TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_final_reports_session ON final_reports(session_id, is_active);
CREATE INDEX IF NOT EXISTS idx_final_reports_rev ON final_reports(session_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_final_reports_created ON final_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_final_reports_approval ON final_reports(session_id, approval_status);

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

-- Stage 7: Unified Report Processing Runs
CREATE TABLE IF NOT EXISTS report_processing_runs (
    run_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'preparing_transcript', 'ai_processing', 'preparing_report', 'completed', 'failed', 'cancelled'
    current_step TEXT,
    error_message TEXT,
    model_name TEXT,
    tokens_used INTEGER DEFAULT 0,
    reused_existing_material INTEGER DEFAULT 0,
    report_title TEXT,
    report_text TEXT,
    reporter_extraction_json TEXT,
    editorial_selection_json TEXT,
    writing_json TEXT,
    proofreading_json TEXT,
    validation_summary_json TEXT,
    final_report_id TEXT,
    source_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_proc_runs_session ON report_processing_runs(session_id, status);
CREATE INDEX IF NOT EXISTS idx_report_proc_runs_created ON report_processing_runs(created_at DESC);

-- Stage 7: Versioned Report Processing Standards
CREATE TABLE IF NOT EXISTS report_processing_standards (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    version_label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    reporter_extraction_instructions TEXT NOT NULL,
    editorial_selection_instructions TEXT NOT NULL,
    writing_instructions TEXT NOT NULL,
    proofreading_instructions TEXT NOT NULL,
    anti_slop_rules TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_proc_std_version ON report_processing_standards(version DESC);
CREATE INDEX IF NOT EXISTS idx_report_proc_std_active ON report_processing_standards(is_active);

-- Stage 7: Approved Examples Library (Seed examples AM, AN, AO, AP + promoted diffs)
CREATE TABLE IF NOT EXISTS report_approved_examples (
    id TEXT PRIMARY KEY,
    section_letter TEXT NOT NULL, -- 'AM', 'AN', 'AO', 'AP'
    section_name TEXT NOT NULL,
    title TEXT NOT NULL,
    theme TEXT,
    scripture_reference TEXT,
    minister TEXT,
    service_date TEXT,
    approved_content TEXT NOT NULL,
    teaching_goal TEXT,
    editorial_focus TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    source_diff_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approved_examples_section ON report_approved_examples(section_letter, is_active);

-- Stage 7: Human Edit Learning & Diffs
CREATE TABLE IF NOT EXISTS report_human_diffs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    run_id TEXT,
    original_ai_text TEXT NOT NULL,
    human_edited_text TEXT NOT NULL,
    diff_summary_json TEXT,
    is_promoted_to_example INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_human_diffs_session ON report_human_diffs(session_id);

-- Stage 7: Report Processing Settings
CREATE TABLE IF NOT EXISTS report_processing_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Permanent Deletion Tombstones (solely prevents resurrection from old files or background recovery)
CREATE TABLE IF NOT EXISTS deleted_session_tombstones (
    session_id TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tombstones_deleted ON deleted_session_tombstones(deleted_at DESC);

-- Authentication & Church Account Model
CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    supabase_user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_supabase ON app_users(supabase_user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    sector TEXT NOT NULL,
    custom_sector TEXT,
    church_state TEXT NOT NULL,
    region TEXT,
    old_group TEXT,
    group_name TEXT,
    district TEXT,
    terminal_level TEXT NOT NULL,
    onboarding_step INTEGER NOT NULL DEFAULT 1,
    onboarding_completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

CREATE TABLE IF NOT EXISTS account_memberships (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memberships_account ON account_memberships(account_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON account_memberships(user_id);

CREATE TABLE IF NOT EXISTS account_settings (
    account_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(account_id, setting_key)
);

-- Multi-Device Remote Control & Device State (SQLite)
CREATE TABLE IF NOT EXISTS registered_devices (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    device_uid TEXT NOT NULL,
    display_name TEXT NOT NULL,
    platform TEXT DEFAULT 'web',
    device_type TEXT DEFAULT 'desktop',
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_account_uid ON registered_devices(account_id, device_uid);
CREATE INDEX IF NOT EXISTS idx_devices_account ON registered_devices(account_id);

CREATE TABLE IF NOT EXISTS active_recording_state (
    account_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    owner_device_id TEXT NOT NULL,
    recording_status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    title TEXT,
    programme TEXT,
    minister TEXT,
    last_heartbeat_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_act_rec_account ON active_recording_state(account_id);

CREATE TABLE IF NOT EXISTS device_commands (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    target_device_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    acknowledged_at TEXT,
    completed_at TEXT,
    expires_at TEXT NOT NULL,
    failure_reason TEXT,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cmd_account_target ON device_commands(account_id, target_device_id, status);
CREATE INDEX IF NOT EXISTS idx_cmd_session ON device_commands(session_id);

CREATE TABLE IF NOT EXISTS active_workflow_state (
    account_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    workflow_type TEXT NOT NULL,
    status TEXT NOT NULL,
    ui_host_device_id TEXT NOT NULL,
    progress_label TEXT,
    items_total INTEGER DEFAULT 0,
    items_resolved INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_act_wf_account ON active_workflow_state(account_id);
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

# Phase 9 approval & source protection migration: add revision-bound approval and source_hash columns.
PHASE9_APPROVAL_COLUMNS = [
    "ALTER TABLE final_reports ADD COLUMN approval_status TEXT DEFAULT 'draft'",
    "ALTER TABLE final_reports ADD COLUMN approved_at TEXT",
    "ALTER TABLE final_reports ADD COLUMN approved_by_user_id TEXT",
    "ALTER TABLE final_reports ADD COLUMN approved_by_account_id TEXT",
    "ALTER TABLE final_reports ADD COLUMN approved_revision_id TEXT",
    "ALTER TABLE final_reports ADD COLUMN source_hash TEXT",
    "ALTER TABLE report_processing_runs ADD COLUMN source_hash TEXT",
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

# Stage 7 migration: add unified report processing workflow columns to sessions table.
STAGE7_REPORT_PROCESSING_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN report_processing_status TEXT DEFAULT 'not_started'",
    "ALTER TABLE sessions ADD COLUMN report_processing_run_id TEXT",
    "ALTER TABLE sessions ADD COLUMN report_processing_completed_at TEXT",
]

# Authentication & Account scoping migration: add account_id columns
AUTH_MIGRATION_COLUMNS = [
    "ALTER TABLE sessions ADD COLUMN account_id TEXT",
    "ALTER TABLE programmes ADD COLUMN account_id TEXT",
    "ALTER TABLE app_users ADD COLUMN display_name TEXT",
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
    approval_status VARCHAR(50) DEFAULT 'draft',
    approved_at VARCHAR(255),
    approved_by_user_id VARCHAR(255),
    approved_by_account_id VARCHAR(255),
    approved_revision_id VARCHAR(255),
    source_hash VARCHAR(255),
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_session')
CREATE INDEX idx_final_reports_session ON final_reports(session_id, is_active);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_rev')
CREATE INDEX idx_final_reports_rev ON final_reports(session_id, revision_number DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_created')
CREATE INDEX idx_final_reports_created ON final_reports(created_at DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_final_reports_approval')
CREATE INDEX idx_final_reports_approval ON final_reports(session_id, approval_status);

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

IF OBJECT_ID(N'report_processing_runs', N'U') IS NULL
CREATE TABLE report_processing_runs (
    run_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    status VARCHAR(100) NOT NULL,
    current_step VARCHAR(100),
    error_message NVARCHAR(MAX),
    model_name VARCHAR(255),
    tokens_used INT DEFAULT 0,
    reused_existing_material INT DEFAULT 0,
    report_title NVARCHAR(MAX),
    report_text NVARCHAR(MAX),
    reporter_extraction_json NVARCHAR(MAX),
    editorial_selection_json NVARCHAR(MAX),
    writing_json NVARCHAR(MAX),
    proofreading_json NVARCHAR(MAX),
    validation_summary_json NVARCHAR(MAX),
    final_report_id VARCHAR(255),
    source_hash VARCHAR(255),
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    completed_at VARCHAR(255),
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_report_proc_runs_session')
CREATE INDEX idx_report_proc_runs_session ON report_processing_runs(session_id, status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_report_proc_runs_created')
CREATE INDEX idx_report_proc_runs_created ON report_processing_runs(created_at DESC);

IF OBJECT_ID(N'report_processing_standards', N'U') IS NULL
CREATE TABLE report_processing_standards (
    id VARCHAR(255) PRIMARY KEY,
    version INT NOT NULL UNIQUE,
    version_label VARCHAR(255) NOT NULL,
    is_active INT NOT NULL DEFAULT 0,
    reporter_extraction_instructions NVARCHAR(MAX) NOT NULL,
    editorial_selection_instructions NVARCHAR(MAX) NOT NULL,
    writing_instructions NVARCHAR(MAX) NOT NULL,
    proofreading_instructions NVARCHAR(MAX) NOT NULL,
    anti_slop_rules NVARCHAR(MAX) NOT NULL,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_report_proc_std_version')
CREATE INDEX idx_report_proc_std_version ON report_processing_standards(version DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_report_proc_std_active')
CREATE INDEX idx_report_proc_std_active ON report_processing_standards(is_active);

IF OBJECT_ID(N'report_approved_examples', N'U') IS NULL
CREATE TABLE report_approved_examples (
    id VARCHAR(255) PRIMARY KEY,
    section_letter VARCHAR(10) NOT NULL,
    section_name VARCHAR(255) NOT NULL,
    title NVARCHAR(MAX) NOT NULL,
    theme NVARCHAR(MAX),
    scripture_reference NVARCHAR(MAX),
    minister NVARCHAR(MAX),
    service_date VARCHAR(255),
    approved_content NVARCHAR(MAX) NOT NULL,
    teaching_goal NVARCHAR(MAX),
    editorial_focus NVARCHAR(MAX),
    is_active INT NOT NULL DEFAULT 1,
    source_diff_id VARCHAR(255),
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_approved_examples_section')
CREATE INDEX idx_approved_examples_section ON report_approved_examples(section_letter, is_active);

IF OBJECT_ID(N'report_human_diffs', N'U') IS NULL
CREATE TABLE report_human_diffs (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    run_id VARCHAR(255),
    original_ai_text NVARCHAR(MAX) NOT NULL,
    human_edited_text NVARCHAR(MAX) NOT NULL,
    diff_summary_json NVARCHAR(MAX),
    is_promoted_to_example INT NOT NULL DEFAULT 0,
    created_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_human_diffs_session')
CREATE INDEX idx_human_diffs_session ON report_human_diffs(session_id);

IF OBJECT_ID(N'report_processing_settings', N'U') IS NULL
CREATE TABLE report_processing_settings (
    [key] VARCHAR(100) PRIMARY KEY,
    [value] NVARCHAR(MAX) NOT NULL,
    updated_at VARCHAR(255) NOT NULL
);

IF OBJECT_ID(N'deleted_session_tombstones', N'U') IS NULL
CREATE TABLE deleted_session_tombstones (
    session_id VARCHAR(255) PRIMARY KEY,
    deleted_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_tombstones_deleted')
CREATE INDEX idx_tombstones_deleted ON deleted_session_tombstones(deleted_at DESC);

-- Authentication & Church Account Model (MSSQL)
IF OBJECT_ID(N'app_users', N'U') IS NULL
CREATE TABLE app_users (
    id VARCHAR(255) PRIMARY KEY,
    supabase_user_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    display_name NVARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    last_login_at VARCHAR(255)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_app_users_supabase')
CREATE UNIQUE INDEX idx_app_users_supabase ON app_users(supabase_user_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_app_users_email')
CREATE INDEX idx_app_users_email ON app_users(email);

IF OBJECT_ID(N'accounts', N'U') IS NULL
CREATE TABLE accounts (
    id VARCHAR(255) PRIMARY KEY,
    sector VARCHAR(100) NOT NULL,
    custom_sector NVARCHAR(255),
    church_state NVARCHAR(255) NOT NULL,
    region NVARCHAR(255),
    old_group NVARCHAR(255),
    group_name NVARCHAR(255),
    district NVARCHAR(255),
    terminal_level VARCHAR(100) NOT NULL,
    onboarding_step INT NOT NULL DEFAULT 1,
    onboarding_completed_at VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_accounts_status')
CREATE INDEX idx_accounts_status ON accounts(status);

IF OBJECT_ID(N'account_memberships', N'U') IS NULL
CREATE TABLE account_memberships (
    id VARCHAR(255) PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'owner',
    created_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_memberships_account')
CREATE INDEX idx_memberships_account ON account_memberships(account_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_memberships_user')
CREATE INDEX idx_memberships_user ON account_memberships(user_id);

IF OBJECT_ID(N'account_settings', N'U') IS NULL
CREATE TABLE account_settings (
    account_id VARCHAR(255) NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value NVARCHAR(MAX) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    PRIMARY KEY(account_id, setting_key)
);

-- Multi-Device Remote Control & Device State (MSSQL)
IF OBJECT_ID(N'registered_devices', N'U') IS NULL
CREATE TABLE registered_devices (
    id VARCHAR(255) PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    device_uid VARCHAR(255) NOT NULL,
    display_name NVARCHAR(255) NOT NULL,
    platform VARCHAR(100) DEFAULT 'web',
    device_type VARCHAR(100) DEFAULT 'desktop',
    last_seen_at VARCHAR(255) NOT NULL,
    created_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_devices_account_uid')
CREATE UNIQUE INDEX idx_devices_account_uid ON registered_devices(account_id, device_uid);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_devices_account')
CREATE INDEX idx_devices_account ON registered_devices(account_id);

IF OBJECT_ID(N'active_recording_state', N'U') IS NULL
CREATE TABLE active_recording_state (
    account_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    owner_device_id VARCHAR(255) NOT NULL,
    recording_status VARCHAR(50) NOT NULL,
    started_at VARCHAR(255) NOT NULL,
    title NVARCHAR(MAX),
    programme NVARCHAR(MAX),
    minister NVARCHAR(MAX),
    last_heartbeat_at VARCHAR(255) NOT NULL,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_act_rec_account')
CREATE INDEX idx_act_rec_account ON active_recording_state(account_id);

IF OBJECT_ID(N'device_commands', N'U') IS NULL
CREATE TABLE device_commands (
    id VARCHAR(255) PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    target_device_id VARCHAR(255) NOT NULL,
    command_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at VARCHAR(255) NOT NULL,
    acknowledged_at VARCHAR(255),
    completed_at VARCHAR(255),
    expires_at VARCHAR(255) NOT NULL,
    failure_reason NVARCHAR(MAX),
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_cmd_account_target')
CREATE INDEX idx_cmd_account_target ON device_commands(account_id, target_device_id, status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_cmd_session')
CREATE INDEX idx_cmd_session ON device_commands(session_id);

IF OBJECT_ID(N'active_workflow_state', N'U') IS NULL
CREATE TABLE active_workflow_state (
    account_id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    ui_host_device_id VARCHAR(255) NOT NULL,
    progress_label NVARCHAR(MAX),
    items_total INT DEFAULT 0,
    items_resolved INT DEFAULT 0,
    updated_at VARCHAR(255) NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_act_wf_account')
CREATE INDEX idx_act_wf_account ON active_workflow_state(account_id);
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

PHASE9_APPROVAL_COLUMNS_MSSQL = [
    "IF COL_LENGTH('final_reports', 'approval_status') IS NULL ALTER TABLE final_reports ADD approval_status VARCHAR(50) DEFAULT 'draft'",
    "IF COL_LENGTH('final_reports', 'approved_at') IS NULL ALTER TABLE final_reports ADD approved_at VARCHAR(255)",
    "IF COL_LENGTH('final_reports', 'approved_by_user_id') IS NULL ALTER TABLE final_reports ADD approved_by_user_id VARCHAR(255)",
    "IF COL_LENGTH('final_reports', 'approved_by_account_id') IS NULL ALTER TABLE final_reports ADD approved_by_account_id VARCHAR(255)",
    "IF COL_LENGTH('final_reports', 'approved_revision_id') IS NULL ALTER TABLE final_reports ADD approved_revision_id VARCHAR(255)",
    "IF COL_LENGTH('final_reports', 'source_hash') IS NULL ALTER TABLE final_reports ADD source_hash VARCHAR(255)",
    "IF COL_LENGTH('report_processing_runs', 'source_hash') IS NULL ALTER TABLE report_processing_runs ADD source_hash VARCHAR(255)",
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

STAGE7_REPORT_PROCESSING_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'report_processing_status') IS NULL ALTER TABLE sessions ADD report_processing_status VARCHAR(100) DEFAULT 'not_started'",
    "IF COL_LENGTH('sessions', 'report_processing_run_id') IS NULL ALTER TABLE sessions ADD report_processing_run_id VARCHAR(255)",
    "IF COL_LENGTH('sessions', 'report_processing_completed_at') IS NULL ALTER TABLE sessions ADD report_processing_completed_at VARCHAR(255)",
]

AUTH_MIGRATION_COLUMNS_MSSQL = [
    "IF COL_LENGTH('sessions', 'account_id') IS NULL ALTER TABLE sessions ADD account_id VARCHAR(255)",
    "IF COL_LENGTH('programmes', 'account_id') IS NULL ALTER TABLE programmes ADD account_id VARCHAR(255)",
    "IF COL_LENGTH('app_users', 'display_name') IS NULL ALTER TABLE app_users ADD display_name NVARCHAR(255)",
]




