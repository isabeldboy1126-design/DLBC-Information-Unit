"""Source races at the provider await and at the durable write boundary."""
import json
import sqlite3
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.database.connection import get_db_connection
from app.database.editing_repo import editing_repo
from app.database.final_report_repo import final_report_repo
from app.database.generation_source import begin_source_transaction, capture_generation_snapshot, digest
from app.database.report_processing_repo import report_processing_repo
from app.database.reporting_repo import reporting_repo
from app.database.session_repo import session_repo
from app.report_processing.engine import ReportProcessingEngine
import app.database.generation_source as source_module
import app.report_processing.engine as engine_module
from test_review_integrity import execute, export_responses, gateway, seed_session, client


async def seed_previous(kind='editor'):
    sid = await seed_session()
    if kind == 'reporter':
        material = await reporting_repo.save_report(sid, 'A', 1, 'v1', 'ready',
            report_title='Previous reporter title', report_text='Previous reporter source words.')
    else:
        material = await editing_repo.save_edited_report_revision(sid, 'Previous editorial source words.',
            'human_edited', 1, 'v1', report_title='Previous editor title')
    final = await final_report_repo.finalize_report(sid, None, 'Previous final', 'Previous reviewed words.')
    await final_report_repo.approve_report(sid, final['id'])
    return sid, material, final


async def mutate(sid, field):
    async with get_db_connection() as conn:
        if field in ('verified_text', 'raw_text', 'title'):
            await conn.execute(f'UPDATE sessions SET {field}=? WHERE session_id=?', ('Changed synthetic words.', sid))
        elif field == 'metadata':
            await conn.execute('UPDATE sessions SET metadata_json=? WHERE session_id=?',
                (json.dumps({'minister': 'Changed speaker', 'programme': 'Changed programme'}), sid))
        elif field == 'editor':
            # Content change without an ID change must still invalidate the input.
            await conn.execute("UPDATE edited_reports SET report_text='Changed editorial source.' WHERE session_id=? AND is_active=1", (sid,))
        elif field == 'reporter':
            await conn.execute("UPDATE reports SET report_text='Changed reporter source.' WHERE session_id=? AND is_active=1", (sid,))
        elif field == 'segments':
            await conn.execute("UPDATE session_segments SET text='Changed segment source.' WHERE session_id=?", (sid,))
        elif field == 'archive':
            await conn.execute('UPDATE sessions SET is_archived=1 WHERE session_id=?', (sid,))
        else:
            raise AssertionError(field)
        await conn.commit()


async def seed_segment_only(sid):
    async with get_db_connection() as conn:
        await conn.execute("UPDATE sessions SET verified_text='', raw_text='' WHERE session_id=?", (sid,))
        await conn.execute("""INSERT INTO session_segments
            (segment_id, session_id, segment_index, start_time, end_time, text)
            VALUES (?, ?, 0, 0, 1, 'Original synthetic segment source.')""", (sid + '_seg', sid))
        await conn.commit()


async def assert_failed_preserving_revisions(sid, run, previous):
    assert run['status'] == 'failed' and run['error_code'] == 'source_changed'
    assert run['final_report_id'] is None and run['report_text'] is None
    assert run['generation_input_signature'] and run['input_snapshot_json']
    assert (await final_report_repo.get_active_final_report(sid))['id'] == previous['id']
    assert len(await final_report_repo.list_final_report_revisions(sid)) == 1
    assert (await session_repo.get_session(sid))['report_processing_status'] == 'failed'


@pytest.mark.asyncio
@pytest.mark.parametrize('field', ['verified_text', 'raw_text', 'metadata', 'title', 'editor', 'reporter', 'archive', 'segments'])
async def test_changed_input_during_provider_await_preserves_previous_material(field):
    sid, material, previous = await seed_previous('reporter' if field == 'reporter' else 'editor')
    if field == 'segments':
        await seed_segment_only(sid)
    before = await capture_generation_snapshot(sid)
    provider = gateway()
    response = provider.generate.return_value

    async def generate(**kwargs):
        assert before.transcript_text in kwargs['contents']
        assert before.legacy_material in kwargs['contents']
        await mutate(sid, field)
        return response

    provider.generate.side_effect = generate
    run = await execute(sid, provider)
    await assert_failed_preserving_revisions(sid, run, previous)
    assert json.loads(run['input_snapshot_json'])['prompt_hash'] == digest(provider.generate.call_args.kwargs['contents'])
    assert run['generation_input_signature'] == before.signature
    assert run['generation_input_signature'] != (await capture_generation_snapshot(sid)).signature
    assert len(await editing_repo.list_revisions_for_session(sid)) == (0 if field == 'reporter' else 1)
    if field != 'reporter':
        assert (await editing_repo.get_active_edited_report(sid))['revision_id'] == material['revision_id']
    # A deliberate retry binds the replacement source, without deleting history.
    if field != 'archive':
        retry = await execute(sid, gateway())
        assert retry['status'] == 'completed'
        assert len(await final_report_repo.list_final_report_revisions(sid)) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize('field', ['verified_text', 'editor', 'reporter'])
async def test_source_changed_immediately_before_write_transaction_is_rejected(field, monkeypatch):
    sid, _, previous = await seed_previous('reporter' if field == 'reporter' else 'editor')
    begin = engine_module.begin_source_transaction

    async def change_before_lock(conn, *, write=False):
        if write:
            await mutate(sid, field)
        await begin(conn, write=write)

    monkeypatch.setattr(engine_module, 'begin_source_transaction', change_before_lock)
    run = await execute(sid, gateway())
    await assert_failed_preserving_revisions(sid, run, previous)


@pytest.mark.asyncio
async def test_input_capture_is_coherent_when_source_changes_between_reads(monkeypatch):
    sid, material, previous = await seed_previous()
    original = await capture_generation_snapshot(sid)
    read_material = source_module.read_legacy_material
    changed = False

    async def change_between_reads(conn, session_id):
        nonlocal changed
        if session_id == sid and not changed:
            changed = True
            await mutate(sid, 'verified_text')
            await mutate(sid, 'editor')
        return await read_material(conn, session_id)

    monkeypatch.setattr(source_module, 'read_legacy_material', change_between_reads)
    provider = gateway()
    run = await execute(sid, provider)
    prompt = provider.generate.call_args.kwargs['contents']
    assert original.transcript_text in prompt and original.legacy_material in prompt
    assert 'Changed editorial source.' not in prompt
    assert run['generation_input_signature'] == original.signature
    await assert_failed_preserving_revisions(sid, run, previous)


@pytest.mark.asyncio
async def test_source_write_is_locked_through_final_and_run_persistence(monkeypatch):
    sid = await seed_session()
    original = await capture_generation_snapshot(sid)
    finalize = final_report_repo.finalize_report
    checked = False

    async def attempt_change_before_final(**kwargs):
        nonlocal checked
        assert kwargs['connection'].in_transaction
        # Another connection cannot alter source between the comparison and
        # the final signature stamp. Zero busy timeout makes this deterministic.
        async with get_db_connection() as other:
            await other.execute('PRAGMA busy_timeout=0')
            with pytest.raises(sqlite3.OperationalError, match='locked'):
                await other.execute('UPDATE sessions SET verified_text=? WHERE session_id=?', ('Changed after check', sid))
            await other.rollback()
        checked = True
        return await finalize(**kwargs)

    monkeypatch.setattr(final_report_repo, 'finalize_report', attempt_change_before_final)
    run = await execute(sid, gateway())
    assert checked and run['status'] == 'completed'
    assert run['generation_input_signature'] == original.signature
    saved_input = json.loads(run['input_snapshot_json'])
    assert saved_input['transcript_hash'] == digest(original.transcript_text)
    draft = await final_report_repo.get_active_final_report(sid)
    assert draft['generation_input_signature'] == run['generation_input_signature']
    assert draft['source_changed'] is False and draft['can_approve']
    # A writer arriving after commit succeeds, but makes this draft stale.
    await mutate(sid, 'verified_text')
    draft = await final_report_repo.get_active_final_report(sid)
    assert draft['source_changed'] and not draft['can_approve'] and not draft['can_export']
    assert client.post(f'/api/final-report/sessions/{sid}/approve', json={'revision_id': draft['id']}).status_code == 409
    assert all(response.status_code == 409 for response in export_responses(sid))


@pytest.mark.asyncio
@pytest.mark.parametrize('failing_writer', ['final', 'run'])
async def test_persistence_failure_rolls_back_editor_final_and_completion(failing_writer, monkeypatch):
    sid, material, previous = await seed_previous()

    async def fail(**kwargs):
        assert kwargs['connection'].in_transaction
        raise RuntimeError('Synthetic persistence fault')

    if failing_writer == 'final':
        monkeypatch.setattr(final_report_repo, 'finalize_report', fail)
    else:
        monkeypatch.setattr(report_processing_repo, 'save_run_result', fail)
    run = await execute(sid, gateway())
    assert run['status'] == 'failed' and run['error_code'] == 'processing_failed'
    assert run['report_text'] is None and run['final_report_id'] is None
    assert len(await editing_repo.list_revisions_for_session(sid)) == 1
    assert (await editing_repo.get_active_edited_report(sid))['revision_id'] == material['revision_id']
    assert len(await final_report_repo.list_final_report_revisions(sid)) == 1
    final = await final_report_repo.get_active_final_report(sid)
    assert final['id'] == previous['id'] and final['can_export']
    assert (await session_repo.get_session(sid))['report_processing_status'] == 'failed'


@pytest.mark.asyncio
async def test_saved_draft_cannot_be_approved_after_segment_source_change():
    sid = await seed_session()
    await seed_segment_only(sid)
    run = await execute(sid, gateway())
    assert run['status'] == 'completed'
    draft = await final_report_repo.get_active_final_report(sid)
    await final_report_repo.approve_report(sid, draft['id'])
    await mutate(sid, 'segments')
    assert all(response.status_code == 409 for response in export_responses(sid))
    assert client.post(f'/api/final-report/sessions/{sid}/approve', json={'revision_id': draft['id']}).status_code == 409


@pytest.mark.asyncio
async def test_unimplemented_cloud_isolation_fails_closed_without_queries():
    conn = SimpleNamespace(execute=AsyncMock())
    with pytest.raises(RuntimeError, match='Atomic report generation requires local SQLite'):
        await begin_source_transaction(conn, write=True)
    conn.execute.assert_not_awaited()
