"""Revision-preserving drafts with explicit, revision-bound human approval."""
import json
import time
import uuid
from typing import Any, Dict, List, Optional

from app.database.connection import connection_scope, get_db_connection
from app.database.review_integrity import source_signature


class ReviewConflict(ValueError):
    pass


class FinalizationInputError(ValueError):
    pass


class FinalReportRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        from app.database.session_repo import session_repo
        await session_repo.init_db()
        self._initialized = True

    async def finalize_report(self, session_id: str, proofread_report_revision_id: Optional[str],
                              report_title: str, report_text: str, minister=None, programme=None,
                              service_date=None, docx_filename=None, docx_file_size=None,
                              source_run_id=None, *, connection=None,
                              generation_input_signature=None) -> Dict[str, Any]:
        """Compatibility writer: creates a draft; only approve_report grants export."""
        if not report_title.strip() or not report_text.strip():
            raise ValueError("Report title and text must be nonempty")
        if connection is None:
            await self.init_db()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        rid = f"final_rep_{uuid.uuid4().hex}"
        async with connection_scope(connection) as conn:
            if connection is None:
                await self._lock(conn)
            cur = await conn.execute("SELECT MAX(revision_number) FROM final_reports WHERE session_id=?", (session_id,))
            row = await cur.fetchone()
            number = (row[0] or 0) + 1
            signature = await source_signature(conn, session_id)
            await conn.execute("UPDATE final_reports SET is_active=0 WHERE session_id=?", (session_id,))
            await conn.execute("""INSERT INTO final_reports (
                id, session_id, proofread_report_revision_id, revision_number, report_title,
                report_text, minister, programme, service_date, is_active, created_at, updated_at,
                approval_status, source_run_id, source_signature, generation_input_signature)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'draft', ?, ?, ?)""",
                (rid, session_id, proofread_report_revision_id, number, report_title.strip(),
                 report_text.strip(), minister, programme, service_date, now, now, source_run_id, signature,
                 generation_input_signature))
            await conn.execute("""UPDATE sessions SET final_report_status='needs_review',
                final_report_completed_at=NULL, final_report_id=? WHERE session_id=?""", (rid, session_id))
            if connection is None:
                await conn.commit()
            else:
                cur = await conn.execute('SELECT * FROM final_reports WHERE id=?', (rid,))
                return await self._decorate(conn, await cur.fetchone())
        return await self.get_final_report_by_id(rid)

    async def save_final_report_revision(self, session_id, report_title, report_text, minister=None,
                                         programme=None, service_date=None, docx_filename=None, docx_file_size=None):
        active = await self.get_active_final_report(session_id) or {}
        return await self.finalize_report(session_id, active.get('proofread_report_revision_id'),
            report_title, report_text, minister or active.get('minister'), programme or active.get('programme'),
            service_date or active.get('service_date'), source_run_id=active.get('source_run_id'))

    async def _lock(self, conn):
        # SQLite transaction serializes approval versus concurrent revision writes.
        if conn.__class__.__module__.startswith('aiosqlite'):
            await conn.execute('BEGIN IMMEDIATE')

    async def _accepted_proofread_source(self, conn, session, proofread_id):
        """Validate and read the exact source under the caller's transaction."""
        cur = await conn.execute('SELECT * FROM proofread_reports WHERE revision_id=?', (proofread_id,))
        source = await cur.fetchone()
        if not source or not (source['proofread_text'] or '').strip():
            raise FinalizationInputError('An approved Proofread Report is required before the Final Report can be generated.')
        if (source['session_id'] != session['session_id'] or not source['is_active']
                or not source['is_accepted'] or session['accepted_proofread_revision_id'] != proofread_id):
            raise ReviewConflict('Accept the current proofread revision for this session before final approval.')
        if source['edited_report_revision_id']:
            cur = await conn.execute('SELECT revision_id FROM edited_reports WHERE session_id=? AND is_active=1',
                                     (session['session_id'],))
            editor = await cur.fetchone()
            if not editor or editor[0] != source['edited_report_revision_id']:
                raise ReviewConflict('The editor source has changed. Proofread the current editor revision first.')
        return source

    async def finalize_accepted_proofread(self, session_id, proofread_revision_id=None, report_title=None):
        """Explicit final approval: replace the active final only on total success."""
        await self.init_db()
        async with get_db_connection() as conn:
            # Do not silently weaken the isolation contract on an unverified adapter.
            if not conn.__class__.__module__.startswith('aiosqlite'):
                raise ReviewConflict('Atomic final approval requires local SQLite; cloud isolation is not implemented.')
            await self._lock(conn)
            try:
                cur = await conn.execute('SELECT * FROM sessions WHERE session_id=?', (session_id,))
                session = await cur.fetchone()
                if not session or session['is_archived']:
                    raise ReviewConflict('Session is missing or archived. Restore or reload before approval.')
                if not proofread_revision_id:
                    cur = await conn.execute("""SELECT revision_id FROM proofread_reports
                        WHERE session_id=? AND is_active=1 ORDER BY revision_number DESC LIMIT 1""", (session_id,))
                    active = await cur.fetchone()
                    proofread_revision_id = active[0] if active else None
                source = await self._accepted_proofread_source(conn, session, proofread_revision_id)
                cur = await conn.execute("""SELECT * FROM final_reports WHERE session_id=? AND is_active=1
                    ORDER BY revision_number DESC LIMIT 1""", (session_id,))
                active = await self._decorate(conn, await cur.fetchone())
                if (active and active['can_export'] and
                        active['proofread_report_revision_id'] == source['revision_id'] and
                        not (report_title and report_title != active['report_title'])):
                    await conn.commit()
                    return active
                metadata = json.loads(session['metadata_json'] or '{}')
                title = report_title or source['proofread_title'] or session['title'] or 'Message Report'
                if not title.strip():
                    raise FinalizationInputError('Final report title cannot be empty.')
                draft = await self.finalize_report(
                    session_id=session_id, proofread_report_revision_id=source['revision_id'],
                    report_title=title, report_text=source['proofread_text'],
                    minister=metadata.get('speaker') or metadata.get('minister') or '',
                    programme=metadata.get('programme') or 'Deeper Life Bible Church Service',
                    service_date=session['date_created'], connection=conn,
                )
                approved = await self.approve_report(session_id, draft['id'], connection=conn)
                await conn.commit()
                return approved
            except BaseException:
                await conn.rollback()
                raise

    async def approve_report(self, session_id, revision_id, *, connection=None):
        if connection is None:
            await self.init_db()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        async with connection_scope(connection) as conn:
            if connection is None:
                await self._lock(conn)
            cur = await conn.execute("SELECT * FROM sessions WHERE session_id=?", (session_id,))
            session = await cur.fetchone()
            if not session or session['is_archived']:
                raise ReviewConflict('Session is missing or archived')
            cur = await conn.execute("SELECT * FROM final_reports WHERE session_id=? AND id=? AND is_active=1", (session_id, revision_id))
            row = await cur.fetchone()
            if not row:
                raise ReviewConflict('The reviewed revision is no longer active. Reload before approving.')
            proofread_id = row['proofread_report_revision_id']
            if proofread_id:
                try:
                    await self._accepted_proofread_source(conn, session, proofread_id)
                except FinalizationInputError as exc:
                    raise ReviewConflict('Accept the current proofread source before final approval.') from exc
            signature = await source_signature(conn, session_id)
            if row['source_signature'] and row['source_signature'] != signature:
                raise ReviewConflict('Source review has changed. Save a reviewed report revision before approval.')
            if not row['report_text'].strip():
                raise ReviewConflict('An empty report cannot be approved')
            if row['approval_status'] != 'approved':
                await conn.execute("""INSERT INTO report_approvals VALUES (?, ?, ?, ?, ?)""",
                    (uuid.uuid4().hex, session_id, revision_id, signature, now))
                await conn.execute("""UPDATE final_reports SET approval_status='approved', approved_at=?,
                    source_signature=? WHERE id=?""", (now, signature, revision_id))
            await conn.execute("""UPDATE sessions SET final_report_status='approved',
                final_report_completed_at=COALESCE(final_report_completed_at, ?) WHERE session_id=?""", (now, session_id))
            if connection is None:
                await conn.commit()
            else:
                cur = await conn.execute('SELECT * FROM final_reports WHERE id=?', (revision_id,))
                return await self._decorate(conn, await cur.fetchone())
        return await self.get_final_report_by_id(revision_id)

    async def _decorate(self, conn, row):
        if not row:
            return None
        report = dict(row)
        report['is_active'] = bool(report['is_active'])
        signature = await source_signature(conn, report['session_id'])
        cur = await conn.execute('SELECT is_archived, accepted_proofread_revision_id FROM sessions WHERE session_id=?', (report['session_id'],))
        session = await cur.fetchone()
        report['source_changed'] = bool(report['source_signature'] and report['source_signature'] != signature)
        proofread_current = True
        if report['proofread_report_revision_id']:
            cur = await conn.execute("""SELECT edited_report_revision_id FROM proofread_reports
                WHERE session_id=? AND revision_id=? AND is_active=1 AND is_accepted=1""",
                (report['session_id'], report['proofread_report_revision_id']))
            proofread = await cur.fetchone()
            proofread_current = bool(proofread and session and session[1] == report['proofread_report_revision_id'])
            if proofread and proofread[0]:
                cur = await conn.execute('SELECT revision_id FROM edited_reports WHERE session_id=? AND is_active=1', (report['session_id'],))
                editor = await cur.fetchone()
                proofread_current = proofread_current and bool(editor and editor[0] == proofread[0])
        report['can_export'] = bool(report['is_active'] and report['approval_status'] == 'approved'
                                    and report['source_signature'] == signature and session and not session[0] and proofread_current)
        report['can_approve'] = bool(report['is_active'] and session and not session[0]
                                    and not report['source_changed'] and proofread_current and not report['can_export'])
        report['review_status'] = 'approved' if report['can_export'] else 'needs_review'
        return report

    async def get_active_final_report(self, session_id):
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute("SELECT * FROM final_reports WHERE session_id=? AND is_active=1 ORDER BY revision_number DESC LIMIT 1", (session_id,))
            return await self._decorate(conn, await cur.fetchone())

    async def get_final_report_by_id(self, final_report_id):
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute('SELECT * FROM final_reports WHERE id=?', (final_report_id,))
            return await self._decorate(conn, await cur.fetchone())

    async def list_final_report_revisions(self, session_id):
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute('SELECT * FROM final_reports WHERE session_id=? ORDER BY revision_number DESC', (session_id,))
            return [await self._decorate(conn, row) for row in await cur.fetchall()]

    async def activate_final_report_revision(self, session_id, final_report_id):
        await self.init_db()
        async with get_db_connection() as conn:
            await self._lock(conn)
            cur = await conn.execute('SELECT id FROM final_reports WHERE session_id=? AND id=?', (session_id, final_report_id))
            if not await cur.fetchone():
                return None
            await conn.execute('UPDATE final_reports SET is_active=0 WHERE session_id=?', (session_id,))
            await conn.execute("""UPDATE final_reports SET is_active=1, approval_status='draft',
                source_signature=?, docx_filename=NULL, docx_file_size=NULL WHERE id=?""",
                (await source_signature(conn, session_id), final_report_id))
            await conn.execute("""UPDATE sessions SET final_report_id=?, final_report_status='needs_review',
                final_report_completed_at=NULL WHERE session_id=?""", (final_report_id, session_id))
            await conn.commit()
        return await self.get_final_report_by_id(final_report_id)

    async def update_docx_metadata(self, final_report_id, docx_filename, docx_file_size):
        await self.init_db()
        async with get_db_connection() as conn:
            await conn.execute('UPDATE final_reports SET docx_filename=?, docx_file_size=? WHERE id=?',
                               (docx_filename, docx_file_size, final_report_id))
            await conn.commit()


final_report_repo = FinalReportRepository()
