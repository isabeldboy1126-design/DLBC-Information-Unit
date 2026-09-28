"""
Unit and Integration Tests for Stage 6 AI Verification Storage and Relational Models (Checkpoint C)
"""
import pytest
import uuid
import json
from app.database.session_repo import session_repo
from app.database.programmes_repo import programmes_repo
from app.database.connection import get_db_connection

async def create_test_session():
    await session_repo.init_db()
    session_id = f"test_sess_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Test Sunday Service",
        status="completed"
    )
    async with get_db_connection() as conn:
        await conn.execute(
            """
            INSERT INTO session_segments (
                segment_id, session_id, segment_index, start_time, end_time,
                text, confidence, is_low_confidence, flags_json, words_json
            ) VALUES (?, ?, 0, 0.0, 5.0, 'For God so loved the world', 0.65, 1, '[]', '[]')
            """,
            (f"seg_{session_id}_0", session_id)
        )
        await conn.execute(
            """
            INSERT INTO session_segments (
                segment_id, session_id, segment_index, start_time, end_time,
                text, confidence, is_low_confidence, flags_json, words_json
            ) VALUES (?, ?, 1, 5.0, 10.0, 'Paul said to Saul', 0.50, 1, '[]', '[]')
            """,
            (f"seg_{session_id}_1", session_id)
        )
        await conn.commit()

    await session_repo.init_verification(session_id)
    return session_id

@pytest.mark.asyncio
async def test_ai_verification_lifecycle_status_transitions():
    session_id = await create_test_session()

    # 1. Initial status should be idle
    status = await session_repo.get_ai_verification_status(session_id)
    assert status["ai_verification_status"] == "idle"
    assert status["items_total"] == 2
    assert status["items_resolved"] == 0
    assert status["items_pending"] == 2

    # 2. Transition to compiling
    comp = await session_repo.set_ai_verification_status(session_id, "compiling")
    assert comp["ai_verification_status"] == "compiling"
    assert comp["started_at"] is not None

    # 3. Transition to verifying
    ver = await session_repo.set_ai_verification_status(session_id, "verifying")
    assert ver["ai_verification_status"] == "verifying"

    # 4. Complete with summary
    summary = {"verified_count": 1, "corrected_count": 1, "unresolved_count": 0}
    done = await session_repo.set_ai_verification_status(session_id, "completed_verified", summary=summary)
    assert done["ai_verification_status"] == "completed_verified"
    assert done["completed_at"] is not None
    assert done["summary"]["verified_count"] == 1

@pytest.mark.asyncio
async def test_ai_verification_item_result_auto_resolve():
    session_id = await create_test_session()

    # Auto-resolve segment 0 as VERIFIED
    res0 = await session_repo.save_ai_verification_item_result(
        session_id=session_id,
        segment_index=0,
        ai_decision="VERIFIED",
        ai_verified_text="For God so loved the world",
        ai_confidence=0.98,
        ai_explanation="Exact match with John 3:16 KJV",
        ai_scriptures=["John 3:16"],
        auto_resolve=True
    )
    assert res0["action"] == "confirmed"
    assert res0["verified_text"] == "For God so loved the world"

    # Auto-resolve segment 1 as CORRECTED
    res1 = await session_repo.save_ai_verification_item_result(
        session_id=session_id,
        segment_index=1,
        ai_decision="CORRECTED",
        ai_verified_text="Paul said unto Saul",
        ai_confidence=0.92,
        ai_explanation="Phonetic name correction and KJV grammar",
        ai_scriptures=[],
        auto_resolve=True
    )
    assert res1["action"] == "corrected"
    assert res1["verified_text"] == "Paul said unto Saul"

    # Check updated counts
    status = await session_repo.get_ai_verification_status(session_id)
    assert status["items_resolved"] == 2
    assert status["items_pending"] == 0

@pytest.mark.asyncio
async def test_optional_event_and_rename_propagation():
    await programmes_repo.init_db()
    prog = await programmes_repo.create_programme("Test Retreat 2026")
    prog_id = prog["id"]

    # Create session with this programme
    session_id = f"test_sess_{uuid.uuid4().hex[:8]}"
    await session_repo.create_session(
        session_id=session_id,
        title="Retreat Session 1",
        metadata={"programme_id": prog_id, "programme": "Test Retreat 2026"}
    )

    # Verify session has programme name
    s1 = await session_repo.get_session(session_id)
    assert s1["metadata"]["programme"] == "Test Retreat 2026"

    # Rename programme
    await programmes_repo.update_programme(prog_id, name="Annual Retreat 2026")

    # Verify relational propagation to session
    s2 = await session_repo.get_session(session_id)
    assert s2["metadata"]["programme"] == "Annual Retreat 2026"
