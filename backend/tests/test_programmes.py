"""
Automated Test Suite for Configurable Programmes & Sessions.

Tests:
1. Default seeding of DLBC Programmes & Sessions.
2. Creating custom Programmes.
3. Adding Sessions/Sections under a Programme.
4. Renaming and updating Programmes and Sessions.
5. Soft-archiving and restoring (historical reference preservation).
6. Reordering Sessions/Sections.
7. FastAPI REST API endpoints.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.programmes_repo import programmes_repo


@pytest.mark.asyncio
async def test_programmes_default_seeding():
    """Verifies default programmes and their constituent sessions are seeded."""
    await programmes_repo.init_db()

    progs = await programmes_repo.get_all_programmes(include_archived=False)
    assert len(progs) >= 5

    prog_names = [p["name"] for p in progs]
    assert "Sunday Worship Service" in prog_names
    assert "2026 Easter Retreat" in prog_names
    assert "Workers Meeting" in prog_names
    assert "Youth Success Camp" in prog_names
    assert "December Retreat" in prog_names

    easter_prog = next(p for p in progs if p["name"] == "2026 Easter Retreat")
    sess_names = [s["name"] for s in easter_prog["sessions"]]
    assert "Faith Clinic" in sess_names
    assert "Morning Message" in sess_names
    assert "Bible Teaching" in sess_names
    assert "Revival Session" in sess_names
    assert "Evening Message" in sess_names


@pytest.mark.asyncio
async def test_create_and_manage_programme():
    """Verifies creating, updating, archiving, and managing sessions for a new Programme."""
    await programmes_repo.init_db()

    # 1. Create custom Programme
    prog = await programmes_repo.create_programme(name="2026 Women Conference")
    assert prog is not None
    assert prog["name"] == "2026 Women Conference"
    prog_id = prog["id"]

    # 2. Add sessions under the Programme
    await programmes_repo.create_programme_session(prog_id, "Plenary Session 1", sort_order=0)
    await programmes_repo.create_programme_session(prog_id, "Workshop / Seminar", sort_order=1)
    prog_updated = await programmes_repo.create_programme_session(prog_id, "Evening Revival", sort_order=2)

    assert len(prog_updated["sessions"]) == 3
    assert prog_updated["sessions"][0]["name"] == "Plenary Session 1"
    assert prog_updated["sessions"][1]["name"] == "Workshop / Seminar"
    assert prog_updated["sessions"][2]["name"] == "Evening Revival"

    # 3. Rename Programme
    prog_renamed = await programmes_repo.update_programme(prog_id, name="2026 International Women Conference")
    assert prog_renamed["name"] == "2026 International Women Conference"

    # 4. Rename Session
    sess_id = prog_updated["sessions"][0]["id"]
    prog_sess_renamed = await programmes_repo.update_programme_session(sess_id, name="Opening Plenary")
    assert any(s["name"] == "Opening Plenary" for s in prog_sess_renamed["sessions"])

    # 5. Archive Session
    prog_sess_archived = await programmes_repo.archive_programme_session(sess_id, archive=True)
    active_sessions = [s for s in prog_sess_archived["sessions"] if not s["is_archived"]]
    assert len(active_sessions) == 2

    # 6. Archive Programme
    prog_archived = await programmes_repo.archive_programme(prog_id, archive=True)
    assert prog_archived["is_archived"] is True

    # Active programmes query should not include archived programme
    active_progs = await programmes_repo.get_all_programmes(include_archived=False)
    assert not any(p["id"] == prog_id for p in active_progs)

    # But include_archived=True preserves it
    all_progs = await programmes_repo.get_all_programmes(include_archived=True)
    assert any(p["id"] == prog_id for p in all_progs)


@pytest.mark.asyncio
async def test_reorder_programme_sessions():
    """Verifies reordering sessions under a Programme."""
    await programmes_repo.init_db()

    prog = await programmes_repo.create_programme(name="Leadership Summit 2026")
    prog_id = prog["id"]

    await programmes_repo.create_programme_session(prog_id, "Session A", sort_order=0)
    await programmes_repo.create_programme_session(prog_id, "Session B", sort_order=1)
    prog_with_sess = await programmes_repo.create_programme_session(prog_id, "Session C", sort_order=2)

    sess_ids = [s["id"] for s in prog_with_sess["sessions"]]
    # Reverse order: C, B, A
    reordered_ids = [sess_ids[2], sess_ids[1], sess_ids[0]]

    reordered_prog = await programmes_repo.reorder_programme_sessions(prog_id, reordered_ids)
    sorted_sessions = sorted(reordered_prog["sessions"], key=lambda s: s["sort_order"])
    assert sorted_sessions[0]["name"] == "Session C"
    assert sorted_sessions[1]["name"] == "Session B"
    assert sorted_sessions[2]["name"] == "Session A"


@pytest.mark.asyncio
async def test_programmes_api_endpoints():
    """Verifies FastAPI REST API endpoints for programmes and sessions."""
    await programmes_repo.init_db()
    from app.database.account_repo import account_repo
    await account_repo.init_db()
    user = await account_repo.create_or_update_user("user_prog_test", "prog_test@dlbc.org")
    acct = await account_repo.create_draft_account(user["id"], sector="Adult", church_state="Lagos")
    await account_repo.complete_account_onboarding(acct["id"], {"sector": "Adult", "church_state": "Lagos", "terminal_level": "state_headquarters"})
    headers = {"Authorization": "Bearer test_token_user_prog_test:prog_test@dlbc.org"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. GET /api/programmes
        res = await ac.get("/api/programmes?include_archived=false")
        assert res.status_code == 200
        progs = res.json()
        assert len(progs) > 0

        # 2. POST /api/programmes
        create_res = await ac.post("/api/programmes", headers=headers, json={"name": "Youth Camp 2026"})
        assert create_res.status_code == 200
        created_prog = create_res.json()
        assert created_prog["name"] == "Youth Camp 2026"
        prog_id = created_prog["id"]

        # 3. POST /api/programmes/{id}/sessions
        add_sess_res = await ac.post(
            f"/api/programmes/{prog_id}/sessions",
            headers=headers,
            json={"name": "Morning Devotion"},
        )
        assert add_sess_res.status_code == 200
        prog_with_sess = add_sess_res.json()
        assert any(s["name"] == "Morning Devotion" for s in prog_with_sess["sessions"])

        # 4. PUT /api/programmes/{id}
        put_res = await ac.put(f"/api/programmes/{prog_id}", headers=headers, json={"name": "National Youth Camp 2026"})
        assert put_res.status_code == 200
        assert put_res.json()["name"] == "National Youth Camp 2026"

        # 5. DELETE /api/programmes/{id} (Archive)
        del_res = await ac.delete(f"/api/programmes/{prog_id}", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json()["is_archived"] is True

