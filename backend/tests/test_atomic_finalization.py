"""Final approval must never commit a replacement before its conflict checks."""
import asyncio
import sqlite3
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.database.connection import get_db_connection
from app.database.editing_repo import editing_repo
from app.database.final_report_repo import final_report_repo, ReviewConflict
import app.database.final_report_repo as final_module
from app.database.proofreading_repo import proofreading_repo
from app.database.session_repo import session_repo
from test_review_integrity import client, export_responses, seed_session


async def seed_replacement(tmp_path):
    sid = await seed_session()
    source = (tmp_path / (sid + '.wav')).resolve()
    source.write_bytes(b'RIFF-synthetic-original-source')
    async with get_db_connection() as conn:
        await conn.execute('UPDATE sessions SET audio_file_path=? WHERE session_id=?', (str(source), sid))
        await conn.commit()
    await editing_repo.save_edited_report_revision(sid, 'Previous editor source.', 'human_edited', 1, 'v1')
    old_proof = await proofreading_repo.save_proofread_revision(sid, 'Previous proofread source.',
        'human_reviewed', 1, 'v1', proofread_title='Previous proofread title')
    await proofreading_repo.accept_revision(sid, old_proof['revision_id'])
    first = client.post(f'/api/final-report/sessions/{sid}/finalize', json={})
    assert first.status_code == 200
    previous = first.json()['final_report']
    editor = await editing_repo.save_edited_report_revision(sid, 'Replacement editor source.', 'human_edited', 1, 'v1')
    proof = await proofreading_repo.save_proofread_revision(sid, 'Replacement proofread source.',
        'human_reviewed', 1, 'v1', proofread_title='Reviewed replacement title')
    await proofreading_repo.accept_revision(sid, proof['revision_id'])
    return sid, source, previous, editor, proof


async def saved_state(sid):
    async with get_db_connection() as conn:
        state = {}
        for table, order in [('sessions', 'session_id'), ('edited_reports', 'revision_id'),
                             ('proofread_reports', 'revision_id'), ('final_reports', 'id'),
                             ('report_approvals', 'approval_id')]:
            cur = await conn.execute(f'SELECT * FROM {table} WHERE session_id=? ORDER BY {order}', (sid,))
            state[table] = [dict(row) for row in await cur.fetchall()]
        return state


@pytest.mark.asyncio
async def test_source_conflict_between_draft_and_approval_preserves_previous_active_report(tmp_path, monkeypatch):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    before = await saved_state(sid)
    finalize = final_report_repo.finalize_report

    async def change_source_after_draft(**kwargs):
        draft = await finalize(**kwargs)
        conn = kwargs.get('connection')
        if conn is None:
            # Reproduces the old split-commit gap deterministically.
            async with get_db_connection() as other:
                await other.execute('UPDATE edited_reports SET is_active=0 WHERE session_id=?', (sid,))
                await other.commit()
        else:
            # Fault injection at the same boundary under the repaired transaction.
            await conn.execute('UPDATE edited_reports SET is_active=0 WHERE session_id=?', (sid,))
        return draft

    monkeypatch.setattr(final_report_repo, 'finalize_report', change_source_after_draft)
    response = client.post(f'/api/final-report/sessions/{sid}/finalize',
        json={'proofread_revision_id': proof['revision_id']})
    assert response.status_code == 409
    assert 'editor source has changed' in response.json()['detail'].lower()
    active = await final_report_repo.get_active_final_report(sid)
    assert active['id'] == previous['id'], 'A failed finalization replaced the active report'
    assert (await session_repo.get_session(sid))['final_report_id'] == previous['id']
    assert await saved_state(sid) == before
    assert source.read_bytes() == b'RIFF-synthetic-original-source'
    assert all(response.status_code == 409 for response in export_responses(sid))


@pytest.mark.asyncio
async def test_failure_after_approval_rolls_back_replacement_and_approval_audit(tmp_path, monkeypatch):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    before = await saved_state(sid)
    approve = final_report_repo.approve_report

    async def fail_after_approval(session_id, revision_id, **kwargs):
        await approve(session_id, revision_id, **kwargs)
        raise ReviewConflict('Synthetic abort after approval')

    monkeypatch.setattr(final_report_repo, 'approve_report', fail_after_approval)
    response = client.post(f'/api/final-report/sessions/{sid}/finalize',
        json={'proofread_revision_id': proof['revision_id']})
    assert response.status_code == 409
    assert (await final_report_repo.get_active_final_report(sid))['id'] == previous['id']
    assert await saved_state(sid) == before
    assert source.read_bytes() == b'RIFF-synthetic-original-source'


@pytest.mark.asyncio
async def test_successful_replacement_uses_reviewed_title_preserves_history_and_is_idempotent(tmp_path):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    before = await saved_state(sid)
    response = client.post(f'/api/final-report/sessions/{sid}/finalize',
        json={'proofread_revision_id': proof['revision_id']})
    assert response.status_code == 200 and response.json()['status'] == 'approved'
    final = response.json()['final_report']
    assert final['id'] != previous['id'] and final['report_title'] == 'Reviewed replacement title'
    assert final['report_text'] == proof['proofread_text'] and final['can_export']
    assert (await session_repo.get_session(sid))['final_report_id'] == final['id']
    history = await final_report_repo.list_final_report_revisions(sid)
    assert len(history) == 2 and history[1]['id'] == previous['id']
    assert history[1]['report_text'] == previous['report_text'] and history[1]['approved_at'] == previous['approved_at']
    for route, payload in [('finalize', {'proofread_revision_id': proof['revision_id']}),
                           ('approve', {'revision_id': final['id']})]:
        repeated = client.post(f'/api/final-report/sessions/{sid}/{route}', json=payload)
        assert repeated.status_code == 200 and repeated.json()['final_report']['id'] == final['id']
    after = await saved_state(sid)
    assert len(after['final_reports']) == 2 and len(after['report_approvals']) == 2
    assert after['edited_reports'] == before['edited_reports']
    assert after['proofread_reports'] == before['proofread_reports']
    assert after['sessions'][0]['raw_text'] == before['sessions'][0]['raw_text']
    assert source.read_bytes() == b'RIFF-synthetic-original-source'
    assert all(response.status_code == 200 for response in export_responses(sid))


@pytest.mark.asyncio
@pytest.mark.parametrize('change', ['editor', 'acceptance', 'archive'])
async def test_changed_source_before_transaction_returns_409_without_replacement(change, tmp_path, monkeypatch):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    before = await saved_state(sid)
    lock = final_report_repo._lock

    async def change_before_lock(conn):
        async with get_db_connection() as other:
            if change == 'editor':
                await other.execute('UPDATE edited_reports SET is_active=0 WHERE revision_id=?', (editor['revision_id'],))
            elif change == 'acceptance':
                await other.execute('UPDATE proofread_reports SET is_accepted=0 WHERE revision_id=?', (proof['revision_id'],))
            else:
                await other.execute('UPDATE sessions SET is_archived=1 WHERE session_id=?', (sid,))
            await other.commit()
        await lock(conn)

    monkeypatch.setattr(final_report_repo, '_lock', change_before_lock)
    response = client.post(f'/api/final-report/sessions/{sid}/finalize',
        json={'proofread_revision_id': proof['revision_id']})
    assert response.status_code == 409
    after = await saved_state(sid)
    assert after['final_reports'] == before['final_reports']
    assert after['report_approvals'] == before['report_approvals']
    assert after['sessions'][0]['final_report_id'] == previous['id']
    assert after['sessions'][0]['raw_text'] == before['sessions'][0]['raw_text']
    assert source.read_bytes() == b'RIFF-synthetic-original-source'


@pytest.mark.asyncio
async def test_competing_source_write_is_blocked_between_draft_and_approval(tmp_path, monkeypatch):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    finalize = final_report_repo.finalize_report
    checked = False

    async def attempt_concurrent_change(**kwargs):
        nonlocal checked
        draft = await finalize(**kwargs)
        assert kwargs['connection'].in_transaction
        async with get_db_connection() as other:
            await other.execute('PRAGMA busy_timeout=0')
            with pytest.raises(sqlite3.OperationalError, match='locked'):
                await other.execute('UPDATE edited_reports SET is_active=0 WHERE revision_id=?', (editor['revision_id'],))
            await other.rollback()
        checked = True
        return draft

    monkeypatch.setattr(final_report_repo, 'finalize_report', attempt_concurrent_change)
    response = client.post(f'/api/final-report/sessions/{sid}/finalize',
        json={'proofread_revision_id': proof['revision_id']})
    assert checked and response.status_code == 200
    assert response.json()['final_report']['can_export']
    assert (await editing_repo.get_active_edited_report(sid))['revision_id'] == editor['revision_id']
    assert source.read_bytes() == b'RIFF-synthetic-original-source'


@pytest.mark.asyncio
async def test_concurrent_finalizations_create_one_replacement_and_one_approval(tmp_path):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    results = await asyncio.gather(*[
        final_report_repo.finalize_accepted_proofread(sid, proof['revision_id']) for _ in range(2)])
    assert results[0]['id'] == results[1]['id'] and results[0]['id'] != previous['id']
    state = await saved_state(sid)
    assert len(state['final_reports']) == 2 and len(state['report_approvals']) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize('kind', ['stale', 'missing', 'blank_title'])
async def test_invalid_finalization_preserves_previous_records(kind, tmp_path):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    before = await saved_state(sid)
    payload = {'proofread_revision_id': proof['revision_id']}
    if kind == 'stale':
        payload['proofread_revision_id'] = previous['proofread_report_revision_id']
    elif kind == 'missing':
        payload['proofread_revision_id'] = 'nonexistent_synthetic_revision'
    else:
        payload['report_title'] = '   '
    response = client.post(f'/api/final-report/sessions/{sid}/finalize', json=payload)
    assert response.status_code == (409 if kind == 'stale' else 400)
    assert await saved_state(sid) == before


@pytest.mark.asyncio
async def test_custom_reviewed_title_is_preserved_and_repeat_is_idempotent(tmp_path):
    sid, source, previous, editor, proof = await seed_replacement(tmp_path)
    payload = {'proofread_revision_id': proof['revision_id'], 'report_title': 'Intentional reviewed title'}
    first = client.post(f'/api/final-report/sessions/{sid}/finalize', json=payload)
    repeated = client.post(f'/api/final-report/sessions/{sid}/finalize', json=payload)
    assert first.status_code == repeated.status_code == 200
    assert first.json()['final_report']['report_title'] == payload['report_title']
    assert repeated.json()['final_report']['id'] == first.json()['final_report']['id']
    assert repeated.json()['download_filename'] == first.json()['download_filename']


@pytest.mark.asyncio
async def test_cloud_finalization_fails_closed_before_replacement_queries(monkeypatch):
    conn = SimpleNamespace(execute=AsyncMock())

    @asynccontextmanager
    async def unsupported_connection():
        yield conn

    monkeypatch.setattr(final_report_repo, 'init_db', AsyncMock())
    monkeypatch.setattr(final_module, 'get_db_connection', unsupported_connection)
    with pytest.raises(ReviewConflict, match='Atomic final approval requires local SQLite'):
        await final_report_repo.finalize_accepted_proofread('synthetic_cloud_boundary')
    conn.execute.assert_not_awaited()
