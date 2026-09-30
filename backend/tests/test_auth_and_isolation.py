"""
Authentication, Church Account Onboarding, and Cross-Account Data Isolation Test Suite.
"""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database.account_repo import account_repo
from app.database.session_repo import session_repo
from app.database.report_processing_repo import report_processing_repo
from app.database.final_report_repo import final_report_repo
from app.database.connection import get_db_connection


@pytest.fixture
def auth_header_user_a():
    return {"Authorization": "Bearer test_token_user_a_001:user_a@dlbc.org"}


@pytest.fixture
def auth_header_user_b():
    return {"Authorization": "Bearer test_token_user_b_002:user_b@dlbc.org"}


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected():
    """Requests without credentials to protected endpoints must return 401 Unauthorized."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # /api/auth/me
        res_me = await client.get("/api/auth/me")
        assert res_me.status_code == 401

        # /api/sessions
        res_sess = await client.get("/api/sessions")
        assert res_sess.status_code == 401

        # /api/report-processing/archive
        res_arch = await client.get("/api/report-processing/archive")
        assert res_arch.status_code == 401


@pytest.mark.asyncio
async def test_token_verification_and_user_creation(auth_header_user_a):
    """Valid Bearer token auto-creates or loads user in app_users and returns profile."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.get("/api/auth/me", headers=auth_header_user_a)
        assert res.status_code == 200
        data = res.json()
        assert data["supabase_user_id"] == "user_a_001"
        assert data["email"] == "user_a@dlbc.org"
        assert data["is_onboarded"] is False


@pytest.mark.asyncio
async def test_incomplete_onboarding_blocks_church_resources(auth_header_user_a):
    """An authenticated user without completed onboarding receives 403 on church resources."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.get("/api/sessions", headers=auth_header_user_a)
        assert res.status_code == 403
        assert "Onboarding required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_progressive_onboarding_and_completion_state_headquarters(auth_header_user_a):
    """Progressive save and completion for terminal_level: state_headquarters."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Step 1: Save progress
        prog_res = await client.post(
            "/api/auth/onboarding/progress",
            headers=auth_header_user_a,
            json={"step": 2, "draft": {"sector": "Adult", "church_state": "Lagos"}},
        )
        assert prog_res.status_code == 200
        assert prog_res.json()["onboarding_step"] == 2

        # Step 2: Complete onboarding at state headquarters
        complete_res = await client.post(
            "/api/auth/onboarding/complete",
            headers=auth_header_user_a,
            json={
                "sector": "Adult",
                "church_state": "Lagos",
                "terminal_level": "state_headquarters",
                "region": "ShouldBeIgnoredOrNull",
            },
        )
        assert complete_res.status_code == 200
        account = complete_res.json()["account"]
        assert account["sector"] == "Adult"
        assert account["church_state"] == "Lagos"
        assert account["terminal_level"] == "state_headquarters"
        # Section 20 truncation: downstream levels must be strictly None
        assert account["region"] is None
        assert account["old_group"] is None
        assert account["group_name"] is None
        assert account["district"] is None
        assert "Adult Information Unit" in account["display_name"]
        assert "State Headquarters" in account["display_name"]


@pytest.mark.asyncio
async def test_progressive_onboarding_all_terminal_levels():
    """Validates hierarchy truncation across all terminal levels: region, old_group, group, and district."""
    levels = [
        ("user_reg:reg@dlbc.org", "Youth", "region_headquarters", {"church_state": "Lagos", "region": "Ikeja", "old_group": "X", "district": "Y"}),
        ("user_og:og@dlbc.org", "Campus", "old_group_headquarters", {"church_state": "Rivers", "region": "Port Harcourt", "old_group": "Rumokoro", "group_name": "Z"}),
        ("user_grp:grp@dlbc.org", "Children", "group_headquarters", {"church_state": "Rivers", "region": "Port Harcourt", "old_group": "Rumokoro", "group_name": "Eliogbolo", "district": "W"}),
        ("user_dist:dist@dlbc.org", "Other", "district", {"church_state": "Rivers", "region": "Port Harcourt", "old_group": "Rumokoro", "group_name": "Eliogbolo", "district": "Mini Aza", "custom_sector": "Translation"}),
    ]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        for token_sub, sector, term_level, payload_data in levels:
            headers = {"Authorization": f"Bearer test_token_{token_sub}"}
            payload = {
                "sector": sector,
                "terminal_level": term_level,
                **payload_data,
            }
            res = await client.post("/api/auth/onboarding/complete", headers=headers, json=payload)
            assert res.status_code == 200
            acc = res.json()["account"]
            assert acc["terminal_level"] == term_level

            # Strict Section 20 truncation assertions
            if term_level == "region_headquarters":
                assert acc["region"] == "Ikeja"
                assert acc["old_group"] is None
                assert acc["group_name"] is None
                assert acc["district"] is None
            elif term_level == "old_group_headquarters":
                assert acc["old_group"] == "Rumokoro"
                assert acc["group_name"] is None
                assert acc["district"] is None
            elif term_level == "group_headquarters":
                assert acc["group_name"] == "Eliogbolo"
                assert acc["district"] is None
            elif term_level == "district":
                assert acc["district"] == "Mini Aza"
                assert acc["sector"] == "Other"
                assert acc["custom_sector"] == "Translation"


@pytest.mark.asyncio
async def test_replay_onboarding_atomic_update(auth_header_user_a):
    """Replaying onboarding updates hierarchy without deleting sessions or account data."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Complete onboarding first
        await client.post(
            "/api/auth/onboarding/complete",
            headers=auth_header_user_a,
            json={
                "sector": "Adult",
                "church_state": "Lagos",
                "terminal_level": "state_headquarters",
            },
        )

        # 2. Create a session on User A's account
        sess_res = await client.post(
            "/api/sessions",
            headers=auth_header_user_a,
            json={"title": "Pre-Replay Worship Service"},
        )
        assert sess_res.status_code == 200
        created_session_id = sess_res.json()["session"]["session_id"]

        # 3. Replay onboarding update
        replay_res = await client.post(
            "/api/auth/onboarding/replay-finish",
            headers=auth_header_user_a,
            json={
                "sector": "Adult",
                "church_state": "Lagos Central",
                "terminal_level": "state_headquarters",
            },
        )
        assert replay_res.status_code == 200
        updated_acc = replay_res.json()["account"]
        assert updated_acc["church_state"] == "Lagos Central"

        # 4. Verify the session was NOT deleted
        get_sess = await client.get(f"/api/sessions/{created_session_id}", headers=auth_header_user_a)
        assert get_sess.status_code == 200
        assert get_sess.json()["session"]["title"] == "Pre-Replay Worship Service"


@pytest.mark.asyncio
async def test_cross_account_data_isolation(auth_header_user_a, auth_header_user_b):
    """
    MANDATORY CROSS-ACCOUNT SECURITY CHECK:
    Account A creates a session. Account B must NEVER be able to:
    - see it in session list
    - get details by ID
    - update it
    - delete it
    - view verification
    - trigger AI processing
    - download docx
    - see it in completed reports archive
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Onboard User A into Account A
        await client.post(
            "/api/auth/onboarding/complete",
            headers=auth_header_user_a,
            json={
                "sector": "Adult",
                "church_state": "Lagos",
                "terminal_level": "state_headquarters",
            },
        )

        # 2. Onboard User B into Account B
        onboard_b = await client.post(
            "/api/auth/onboarding/complete",
            headers=auth_header_user_b,
            json={
                "sector": "Youth",
                "church_state": "Ogun",
                "terminal_level": "state_headquarters",
            },
        )
        assert onboard_b.status_code == 200

        # 3. User A creates Session A
        sess_a_res = await client.post(
            "/api/sessions",
            headers=auth_header_user_a,
            json={"title": "Secret Service Account A", "raw_text": "Prophetic word for Account A"},
        )
        assert sess_a_res.status_code == 200
        session_a_id = sess_a_res.json()["session"]["session_id"]

        # 4. User B lists sessions -> Session A must NOT appear
        list_b = await client.get("/api/sessions", headers=auth_header_user_b)
        assert list_b.status_code == 200
        b_session_ids = [s["session_id"] for s in list_b.json()["sessions"]]
        assert session_a_id not in b_session_ids

        # 5. User B attempts GET /api/sessions/{session_a_id} -> 404
        get_b = await client.get(f"/api/sessions/{session_a_id}", headers=auth_header_user_b)
        assert get_b.status_code == 404

        # 6. User B attempts PATCH /api/sessions/{session_a_id} -> 404
        patch_b = await client.patch(
            f"/api/sessions/{session_a_id}",
            headers=auth_header_user_b,
            json={"title": "Hacked Title"},
        )
        assert patch_b.status_code == 404

        # 7. User B attempts DELETE /api/sessions/{session_a_id} -> 404
        del_b = await client.delete(f"/api/sessions/{session_a_id}", headers=auth_header_user_b)
        assert del_b.status_code == 404

        # 8. User B attempts GET /api/sessions/{session_a_id}/verification -> 404
        verif_b = await client.get(f"/api/sessions/{session_a_id}/verification", headers=auth_header_user_b)
        assert verif_b.status_code == 404

        # 9. User B attempts POST /api/report-processing/start with session_a_id -> 404
        start_proc_b = await client.post(
            "/api/report-processing/start",
            headers=auth_header_user_b,
            json={"session_id": session_a_id},
        )
        assert start_proc_b.status_code == 404

        # 10. User B attempts GET /api/report-processing/download-docx/{session_a_id} -> 404
        docx_b = await client.get(
            f"/api/report-processing/download-docx/{session_a_id}",
            headers=auth_header_user_b,
        )
        assert docx_b.status_code == 404

        # 11. User B queries archive -> Account A reports must not leak
        arch_b = await client.get("/api/report-processing/archive", headers=auth_header_user_b)
        assert arch_b.status_code == 200
        for rep in arch_b.json():
            assert rep.get("session_id") != session_a_id


@pytest.mark.asyncio
async def test_legacy_production_session_migration():
    """Unassigned sessions are associated with legacy_default_account and assign_account_owner attaches owner."""
    import time, uuid
    legacy_session_id = f"session_legacy_{uuid.uuid4().hex[:6]}"

    # Insert an unassigned session
    async with get_db_connection() as conn:
        await conn.execute(
            """
            INSERT INTO sessions (
                session_id, title, date_created, start_time, duration_seconds, status,
                provider_name, language_code, segment_count, flag_count, is_interrupted,
                account_id
            ) VALUES (?, ?, ?, ?, 0, 'completed', 'azure_speech', 'en-NG', 0, 0, 0, NULL)
            """,
            (legacy_session_id, "Legacy Unassigned Session", time.strftime("%Y-%m-%d"), time.strftime("%H:%M:%S")),
        )
        await conn.commit()

    # Re-run account_repo.init_db() which backfills NULL account_id to legacy_default_account
    await account_repo.init_db()

    # Verify session is now assigned to legacy_default_account
    async with get_db_connection() as conn:
        cur = await conn.execute("SELECT account_id FROM sessions WHERE session_id = ?", (legacy_session_id,))
        row = await cur.fetchone()
        assert row is not None
        assert row["account_id"] == "legacy_default_account"

    # Pre-register admin user in app_users
    await account_repo.create_or_update_user("sub_first_admin", "first_admin@dlbc.org")

    # Test assign_account_owner CLI function
    from app.admin.assign_account_owner import assign_legacy_owner
    assign_result = await assign_legacy_owner("first_admin@dlbc.org")
    assert assign_result["status"] == "success"
    assert assign_result["account_id"] == "legacy_default_account"
    assert assign_result["user_email"] == "first_admin@dlbc.org"
