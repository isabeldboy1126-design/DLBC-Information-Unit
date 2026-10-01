"""Coherent report input snapshots and a fail-closed persistence guard."""
import hashlib
import json
from dataclasses import dataclass

from app.database.connection import get_db_connection


class SourceChangedError(ValueError):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':')).encode('utf-8')).hexdigest()


async def begin_source_transaction(conn, *, write=False):
    # The cloud adapter has no verified lock/isolation contract. Do not silently
    # downgrade this guard to a check followed by independently committed writes.
    if not conn.__class__.__module__.startswith('aiosqlite'):
        raise RuntimeError('Atomic report generation requires local SQLite; cloud isolation is not implemented.')
    await conn.execute('BEGIN IMMEDIATE' if write else 'BEGIN')


async def read_legacy_material(conn, session_id):
    cur = await conn.execute("""SELECT revision_id, report_title, report_text FROM edited_reports
        WHERE session_id=? AND is_active=1 ORDER BY revision_number DESC, revision_id DESC LIMIT 1""",
        (session_id,))
    row = await cur.fetchone()
    if row and row['report_text'] and row['report_text'].strip():
        return (f"PREVIOUS EDITORIAL DRAFT:\nTitle: {row['report_title']}\n\n{row['report_text']}",
                {'kind': 'editor', 'rows': [dict(row)]})
    cur = await conn.execute("""SELECT report_id, reporter_role, report_title, report_text FROM reports
        WHERE session_id=? AND is_active=1 AND status='ready'
        ORDER BY created_at DESC, report_id DESC LIMIT 2""", (session_id,))
    rows = [dict(row) for row in await cur.fetchall()]
    material = '\n\n---\n\n'.join(
        f"PREVIOUS DRAFT ({row['reporter_role']}):\nTitle: {row['report_title']}\n\n{row['report_text']}"
        for row in rows) or None
    return material, {'kind': 'reporter' if rows else 'none', 'rows': rows}


@dataclass(frozen=True)
class GenerationSnapshot:
    session: dict
    transcript_text: str
    legacy_material: str | None
    signature: str
    provenance: dict


async def read_generation_snapshot(conn, session_id):
    """Read under the caller's transaction; hash content as well as revision IDs."""
    cur = await conn.execute('SELECT * FROM sessions WHERE session_id=?', (session_id,))
    row = await cur.fetchone()
    if not row:
        raise SourceChangedError('Session is no longer available. Restore or reload before retrying.')
    session = dict(row)
    session['metadata'] = json.loads(session.get('metadata_json') or '{}')
    transcript = session.get('verified_text') or session.get('raw_text') or ''
    if not transcript.strip():
        cur = await conn.execute("""SELECT segment_id, segment_index, text FROM session_segments
            WHERE session_id=? ORDER BY segment_index, segment_id""", (session_id,))
        transcript = ' '.join((segment['text'] or '').strip() for segment in await cur.fetchall())
    material, reused = await read_legacy_material(conn, session_id)
    # Include review identities to avoid replacing work that advanced during the
    # provider await. Hash only source fields, never pipeline status/timestamps.
    cur = await conn.execute("""SELECT revision_id FROM proofread_reports WHERE session_id=?
        AND is_active=1 ORDER BY revision_number DESC, revision_id DESC""", (session_id,))
    proofread_ids = [r[0] for r in await cur.fetchall()]
    provenance = {
        'version': 1, 'session_id': session_id,
        'transcript_hash': digest(transcript),
        'verified_text_hash': digest(session.get('verified_text')),
        'raw_text_hash': digest(session.get('raw_text')),
        'metadata_hash': digest({key: session.get(key) for key in
            ('title', 'minister', 'date_created', 'metadata_json', 'transcript_id')}),
        'reused_material_kind': reused['kind'],
        'reused_material_ids': [r.get('revision_id') or r.get('report_id') for r in reused['rows']],
        'reused_material_hash': digest(reused),
        'active_proofread_ids': proofread_ids,
        'accepted_proofread_revision_id': session.get('accepted_proofread_revision_id'),
        'is_archived': bool(session.get('is_archived')),
    }
    return GenerationSnapshot(session, transcript, material, digest(provenance), provenance)


async def capture_generation_snapshot(session_id):
    async with get_db_connection() as conn:
        await begin_source_transaction(conn)
        snapshot = await read_generation_snapshot(conn, session_id)
        await conn.commit()
        return snapshot


async def require_unchanged_source(conn, snapshot):
    current = await read_generation_snapshot(conn, snapshot.session['session_id'])
    if current.signature != snapshot.signature or current.session.get('is_archived'):
        raise SourceChangedError(
            'Source changed during generation. Previous reports are preserved; review the current source and retry.')
