"""Additive local review/retention migration; no historical approvals are inferred."""
import hashlib
import json


async def migrate_review_integrity(conn):
    is_sqlite = conn.__class__.__module__.startswith('aiosqlite')
    if is_sqlite:
        # Serialize additive migrations across simultaneous requests.
        await conn.commit()
        await conn.execute('BEGIN IMMEDIATE')
    columns = {
        "sessions": {"is_archived": "INTEGER NOT NULL DEFAULT 0", "archived_at": "TEXT"},
        "final_reports": {
            "approval_status": "TEXT NOT NULL DEFAULT 'legacy_unreviewed'",
            "approved_at": "TEXT", "source_run_id": "TEXT", "source_signature": "TEXT",
            "generation_input_signature": "TEXT",
        },
        "report_processing_runs": {"error_code": "TEXT", "generation_input_signature": "TEXT",
                                   "input_snapshot_json": "TEXT"},
    }
    for table, additions in columns.items():
        cursor = await conn.execute(f"PRAGMA table_info({table})" if is_sqlite else
                                    "SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(?)",
                                    () if is_sqlite else (table,))
        existing = {row[1] if is_sqlite else row[0] for row in await cursor.fetchall()}
        for name, definition in additions.items():
            if name not in existing:
                if not is_sqlite:
                    definition = definition.replace('TEXT', 'NVARCHAR(MAX)' if name == 'input_snapshot_json' else 'NVARCHAR(255)')
                await conn.execute(f"ALTER TABLE {table} ADD {'COLUMN ' if is_sqlite else ''}{name} {definition}")
    await conn.execute(("CREATE TABLE IF NOT EXISTS" if is_sqlite else
                        "IF OBJECT_ID(N'report_approvals', N'U') IS NULL CREATE TABLE") + """ report_approvals (
        approval_id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
        report_revision_id TEXT NOT NULL, source_signature TEXT NOT NULL,
        approved_at TEXT NOT NULL)""".replace('TEXT', 'TEXT' if is_sqlite else 'NVARCHAR(255)'))
    await conn.execute("""UPDATE sessions SET final_report_status='needs_review',
        final_report_completed_at=NULL WHERE final_report_status='complete'
        AND EXISTS (SELECT 1 FROM final_reports f WHERE f.session_id=sessions.session_id
                    AND f.is_active=1 AND f.approval_status='legacy_unreviewed')""")


async def source_signature(conn, session_id):
    """Current source/review content, including segment-only transcripts.

    Final-report metadata is a saved snapshot: later session-label changes do
    not rewrite it or revoke an approval of those saved labels.
    """
    cursor = await conn.execute(
        "SELECT verified_text, raw_text FROM sessions WHERE session_id=?", (session_id,))
    row = await cursor.fetchone()
    parts = [row[0], row[1]] if row else []
    if row and not (row[0] or row[1] or '').strip():
        cursor = await conn.execute("""SELECT segment_id, segment_index, text FROM session_segments
            WHERE session_id=? ORDER BY segment_index, segment_id""", (session_id,))
        parts.append([[r[0], r[1], r[2]] for r in await cursor.fetchall()])
    for table in ("edited_reports", "proofread_reports"):
        title, text = ('report_title', 'report_text') if table == 'edited_reports' else ('proofread_title', 'proofread_text')
        cursor = await conn.execute(
            f"""SELECT revision_id, {title}, {text} FROM {table}
            WHERE session_id=? AND is_active=1 ORDER BY revision_number DESC, revision_id DESC""",
            (session_id,))
        parts.append([[r[0], r[1], r[2]] for r in await cursor.fetchall()])
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False).encode("utf-8")).hexdigest()


async def invalidate_approval(conn, session_id):
    """Retain approval history while revoking the current export permission."""
    await conn.execute("""UPDATE final_reports SET approval_status='draft',
        docx_filename=NULL, docx_file_size=NULL
        WHERE session_id=? AND is_active=1 AND approval_status='approved'""", (session_id,))
    await conn.execute("""UPDATE sessions SET final_report_status='needs_review',
        final_report_completed_at=NULL WHERE session_id=? AND final_report_id IS NOT NULL""", (session_id,))
