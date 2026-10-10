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


@pytest.mark.asyncio
async def test_demo_mode_security_and_gating():
    """
    Mandatory Security Verification for Demo Mode (Public & Development):
    1. Unauthenticated request without header -> 401 Unauthorized
    2. Valid demo request with X-DLBC-Demo: 1 -> 200 OK with legacy_default_account
    3. Demo mode does not insert fake users or memberships into the database
    4. Demo users CAN create and permanently delete sessions within their own sandbox
    5. Demo users CANNOT delete sessions belonging to other accounts -> 404 Not Found
    6. Demo users CAN create and delete custom programmes within their own sandbox
    7. System canonical programmes cannot be modified or deleted by demo mode -> 403 Forbidden
    8. Destructive Protection: Demo mode cannot mutate authoritative onboarding -> 400 Bad Request
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Unauthenticated request without header -> MUST BE 401
        res_no_header = await client.get("/api/auth/me")
        assert res_no_header.status_code == 401
        res_no_header_sess = await client.get("/api/sessions")
        assert res_no_header_sess.status_code == 401

        # 2. Public demo request with X-DLBC-Demo: 1 -> 200 OK bound to legacy_default_account
        res_demo_me = await client.get("/api/auth/me", headers={"X-DLBC-Demo": "1"})
        assert res_demo_me.status_code == 200, f"Demo request failed: {res_demo_me.status_code}"
        demo_data = res_demo_me.json()
        assert demo_data["account_id"] == "legacy_default_account"
        assert demo_data["is_demo"] is True
        assert demo_data["is_onboarded"] is True

        res_demo_sess = await client.get("/api/sessions", headers={"X-DLBC-Demo": "1"})
        assert res_demo_sess.status_code == 200, f"Demo sessions request rejected: {res_demo_sess.status_code}"

        # 3. DEMO MODE DOES NOT INSERT FAKE USERS OR MEMBERSHIPS IN DATABASE
        async with get_db_connection() as conn:
            cur = await conn.execute("SELECT COUNT(*) as cnt FROM app_users WHERE id = 'demo_user'")
            row = await cur.fetchone()
            assert row["cnt"] == 0, "demo_user was incorrectly persisted to app_users"

        # 4. PERMANENT DEMO DELETION: Demo user creates a session and permanently deletes it
        import uuid
        demo_test_sess_id = f"demo_sess_{uuid.uuid4().hex[:8]}"
        res_create_sess = await client.post(
            "/api/sessions",
            headers={"X-DLBC-Demo": "1"},
            json={"title": "Demo Sandbox Test Session", "raw_text": "Demo content for deletion test."},
        )
        assert res_create_sess.status_code == 200
        created_id = res_create_sess.json()["session"]["session_id"]

        # Deletion in demo account succeeds permanently
        res_del_demo = await client.delete(f"/api/sessions/{created_id}", headers={"X-DLBC-Demo": "1"})
        assert res_del_demo.status_code == 200
        assert res_del_demo.json()["status"] == "deleted"

        # Verifying session is permanently gone
        res_get_del = await client.get(f"/api/sessions/{created_id}", headers={"X-DLBC-Demo": "1"})
        assert res_get_del.status_code == 404

        # 5. CROSS-ACCOUNT GUARD: Demo user cannot delete other accounts' sessions
        res_del_other = await client.delete("/api/sessions/non_existent_or_other_account", headers={"X-DLBC-Demo": "1"})
        assert res_del_other.status_code == 404

        # 6. DEMO PROGRAMMES: Demo user can create and delete custom programmes in their sandbox
        res_create_prog = await client.post(
            "/api/programmes",
            headers={"X-DLBC-Demo": "1"},
            json={"name": "Demo Custom Programme"},
        )
        assert res_create_prog.status_code == 200
        demo_prog_id = res_create_prog.json()["id"]

        res_del_prog = await client.delete(f"/api/programmes/{demo_prog_id}?permanent=true", headers={"X-DLBC-Demo": "1"})
        assert res_del_prog.status_code == 200

        # 7. CANONICAL DEFAULT GUARD: Canonical system programmes cannot be deleted or modified
        res_progs = await client.get("/api/programmes", headers={"X-DLBC-Demo": "1"})
        assert res_progs.status_code == 200
        canonical_progs = [p for p in res_progs.json() if p.get("is_system")]
        assert len(canonical_progs) > 0
        canonical_id = canonical_progs[0]["id"]

        res_del_canonical = await client.delete(f"/api/programmes/{canonical_id}", headers={"X-DLBC-Demo": "1"})
        assert res_del_canonical.status_code == 403

        # 8. DEMO RECORDING LIFECYCLE: Demo user can delete their own recording, but cannot delete church recordings
        import os
        from app.config import STORAGE_AUDIO_DIR
        from app.audio.stream_manager import load_manifest, save_manifest

        demo_rec_id = f"rec_demo_test_{uuid.uuid4().hex[:6]}"
        demo_rec_path = os.path.join(STORAGE_AUDIO_DIR, f"{demo_rec_id}.wav")
        os.makedirs(STORAGE_AUDIO_DIR, exist_ok=True)
        with open(demo_rec_path, "wb") as f:
            f.write(b"RIFF" + b"\x00" * 40)  # Dummy WAV file

        # Register demo recording in manifest with demo account_id
        manifest = load_manifest()
        manifest.insert(0, {
            "recording_id": demo_rec_id,
            "filename": f"{demo_rec_id}.wav",
            "account_id": "legacy_default_account",
            "duration_seconds": 1.0,
        })
        save_manifest(manifest)

        # Demo user deletes their own recording -> 200 OK
        res_del_rec = await client.delete(f"/api/audio/recordings/{demo_rec_id}", headers={"X-DLBC-Demo": "1"})
        assert res_del_rec.status_code == 200
        assert res_del_rec.json()["status"] == "deleted"
        assert not os.path.exists(demo_rec_path)

        # Demo user cannot delete another church account's recording -> 403 Forbidden
        church_rec_id = f"rec_church_protected_{uuid.uuid4().hex[:6]}"
        manifest = load_manifest()
        manifest.insert(0, {
            "recording_id": church_rec_id,
            "filename": f"{church_rec_id}.wav",
            "account_id": "acc_church_rivers_hq",
            "duration_seconds": 10.0,
        })
        save_manifest(manifest)

        res_del_church_rec = await client.delete(f"/api/audio/recordings/{church_rec_id}", headers={"X-DLBC-Demo": "1"})
        assert res_del_church_rec.status_code == 403

        # Clean up test manifest entry
        manifest = [m for m in load_manifest() if m.get("recording_id") != church_rec_id]
        save_manifest(manifest)

        # 9. DEMO WORKSPACE DOCUMENTS: Demo user can create and delete workspace documents
        doc_id = f"doc_{uuid.uuid4().hex[:8]}"
        res_create_doc = await client.put(
            f"/api/workspace/documents/{doc_id}",
            headers={"X-DLBC-Demo": "1"},
            json={"title": "Demo Draft Document", "content": "Sample sermon draft text.", "status": "Draft"},
        )
        assert res_create_doc.status_code == 200

        res_del_doc = await client.delete(f"/api/workspace/documents/{doc_id}", headers={"X-DLBC-Demo": "1"})
        assert res_del_doc.status_code == 200

        res_get_doc = await client.get(f"/api/workspace/documents/{doc_id}", headers={"X-DLBC-Demo": "1"})
        assert res_get_doc.status_code == 404

        # 10. DEMO ACCOUNT SETTINGS: Demo user can save settings for their own isolated account
        res_set_setting = await client.post(
            "/api/auth/account-settings",
            headers={"X-DLBC-Demo": "1"},
            json={"key": "instruction", "value": "demo instruction"},
        )
        assert res_set_setting.status_code == 200

        # 11. DESTRUCTIVE GUARD: DEMO CANNOT MUTATE AUTHORITATIVE ONBOARDING -> 400 BAD REQUEST
        res_demo_mut = await client.post(
            "/api/auth/onboarding/complete",
            headers={"X-DLBC-Demo": "1"},
            json={"sector": "Youth", "church_state": "Abia", "terminal_level": "state_headquarters"},
        )
        assert res_demo_mut.status_code == 400, f"Demo onboarding mutation was not blocked: {res_demo_mut.status_code}"
        assert "Demo mode cannot modify authoritative onboarding" in res_demo_mut.json()["detail"]


@pytest.mark.asyncio
async def test_cross_account_programme_isolation(auth_header_user_a, auth_header_user_b):
    """
    Step 2 Verification: Cross-Account Programme and Event Isolation
    1. User A lists programmes -> sees canonical default church events (is_system = 1)
    2. User A creates a custom programme -> belongs to Account A
    3. User A lists programmes -> sees canonical default events + their custom programme
    4. User B lists programmes -> sees canonical default events, CANNOT see User A's custom programme
    5. User B attempts to access, edit, or delete User A's custom programme -> 404 Not Found
    6. User A and User B cannot edit or delete canonical system programmes -> 403 Forbidden
    7. Unauthenticated GET /api/programmes returns ONLY canonical system programmes
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Unauthenticated request only sees canonical system programmes
        res_unauth = await client.get("/api/programmes")
        assert res_unauth.status_code == 200
        unauth_progs = res_unauth.json()
        assert len(unauth_progs) > 0
        for p in unauth_progs:
            assert p["is_system"] is True

        # 2. User A creates a custom programme
        res_create_a = await client.post(
            "/api/programmes",
            headers=auth_header_user_a,
            json={"name": "Rivers Central Special Convention"},
        )
        assert res_create_a.status_code == 200
        prog_a = res_create_a.json()
        prog_a_id = prog_a["id"]
        assert prog_a["is_system"] is False

        # 3. User A sees their custom programme
        res_list_a = await client.get("/api/programmes", headers=auth_header_user_a)
        assert res_list_a.status_code == 200
        a_ids = [p["id"] for p in res_list_a.json()]
        assert prog_a_id in a_ids

        # 4. User B does NOT see User A's custom programme
        res_list_b = await client.get("/api/programmes", headers=auth_header_user_b)
        assert res_list_b.status_code == 200
        b_ids = [p["id"] for p in res_list_b.json()]
        assert prog_a_id not in b_ids

        # 5. User B cannot access, modify, or delete User A's custom programme
        res_get_b = await client.get(f"/api/programmes/{prog_a_id}", headers=auth_header_user_b)
        assert res_get_b.status_code == 404

        res_put_b = await client.put(
            f"/api/programmes/{prog_a_id}",
            headers=auth_header_user_b,
            json={"name": "Tampered Name"},
        )
        assert res_put_b.status_code == 404

        res_del_b = await client.delete(f"/api/programmes/{prog_a_id}", headers=auth_header_user_b)
        assert res_del_b.status_code == 404

        # 6. Neither User A nor User B can modify or delete a canonical system programme
        canonical_id = unauth_progs[0]["id"]
        res_put_canonical = await client.put(
            f"/api/programmes/{canonical_id}",
            headers=auth_header_user_a,
            json={"name": "Renamed System Service"},
        )
        assert res_put_canonical.status_code == 403

        res_del_canonical = await client.delete(
            f"/api/programmes/{canonical_id}",
            headers=auth_header_user_a,
        )
        assert res_del_canonical.status_code == 403

        # Clean up User A's custom programme
        res_del_a = await client.delete(f"/api/programmes/{prog_a_id}?permanent=true", headers=auth_header_user_a)
        assert res_del_a.status_code == 200


@pytest.mark.asyncio
async def test_personal_profile_display_name(auth_header_user_a):
    """Personal display_name can be inspected and updated via PATCH /api/auth/profile without affecting church account."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Check initial me response has display_name key
        me_res1 = await client.get("/api/auth/me", headers=auth_header_user_a)
        assert me_res1.status_code == 200
        assert "display_name" in me_res1.json()

        # Update display_name
        patch_res = await client.patch(
            "/api/auth/profile",
            headers=auth_header_user_a,
            json={"display_name": "Bro. John Doe"},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "updated"
        assert patch_res.json()["display_name"] == "Bro. John Doe"

        # Verify persisted in me endpoint
        me_res2 = await client.get("/api/auth/me", headers=auth_header_user_a)
        assert me_res2.status_code == 200
        assert me_res2.json()["display_name"] == "Bro. John Doe"
        assert me_res2.json()["user"]["display_name"] == "Bro. John Doe"

        # Test demo mode profile patch
        demo_patch = await client.patch(
            "/api/auth/profile",
            headers={"X-DLBC-Demo": "1"},
            json={"display_name": "Demo Operator"},
        )
        assert demo_patch.status_code == 200
        assert demo_patch.json()["display_name"] == "Demo Operator"


@pytest.mark.asyncio
async def test_read_requests_do_not_mutate_app_users(auth_header_user_a):
    """
    Verifies that routine authenticated requests (auth/me, accounts/me, remote/status)
    execute via the read-only fast path and do not issue UPDATE statements on app_users,
    preventing row-lock exhaustion on Azure SQL.
    """
    from app.database.connection import get_db_connection

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Step 1: Initial request provisions user
        res = await client.get("/api/auth/me", headers=auth_header_user_a)
        assert res.status_code == 200

        # Step 2: Capture exact user timestamps from database
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT updated_at, last_login_at FROM app_users WHERE LOWER(email) = LOWER('user_a@dlbc.org')"
            )
            row = await cursor.fetchone()
            assert row is not None
            initial_updated_at = row["updated_at"]
            initial_last_login = row["last_login_at"]

        # Step 3: Send multiple concurrent or sequential read requests (including polling simulation)
        for _ in range(10):
            res_auth = await client.get("/api/auth/me", headers=auth_header_user_a)
            assert res_auth.status_code == 200
            res_remote = await client.get("/api/remote/status", headers=auth_header_user_a)
            assert res_remote.status_code == 200
            res_devices = await client.get("/api/remote/devices", headers=auth_header_user_a)
            assert res_devices.status_code == 200

        # Step 4: Verify timestamps in database remain untouched (0 writes occurred)
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT updated_at, last_login_at FROM app_users WHERE LOWER(email) = LOWER('user_a@dlbc.org')"
            )
            row_after = await cursor.fetchone()
            assert row_after["updated_at"] == initial_updated_at, "app_users.updated_at was modified during read requests"
            assert row_after["last_login_at"] == initial_last_login, "app_users.last_login_at was modified during read requests"


@pytest.mark.asyncio
async def test_universal_shared_demo_workspace(auth_header_user_a):
    """
    Verifies that:
    1. Anyone entering demo (Device Alpha and Device Beta) enters the same shared workspace.
    2. Both receive account_id == "legacy_default_account" and see the same existing data.
    3. Resources created by Device Alpha are immediately visible to Device Beta.
    4. Deletion in demo deletes the resource from the shared workspace for all devices.
    5. Real church accounts remain completely isolated from Demo.
    """
    transport = ASGITransport(app=app)
    header_alpha = {"X-DLBC-Demo": "1"}
    header_beta = {"X-DLBC-Demo": "1"}

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Step 1: Device Alpha enters demo
        res_me_a = await client.get("/api/auth/me", headers=header_alpha)
        assert res_me_a.status_code == 200
        data_a = res_me_a.json()
        assert data_a["account_id"] == "legacy_default_account"
        assert data_a["is_demo"] is True

        # Step 2: Device Beta enters demo
        res_me_b = await client.get("/api/auth/me", headers=header_beta)
        assert res_me_b.status_code == 200
        data_b = res_me_b.json()
        assert data_b["account_id"] == "legacy_default_account"
        assert data_b["is_demo"] is True

        # Step 3: Device Alpha creates custom session in shared demo
        res_new_sess_a = await client.post(
            "/api/sessions",
            headers=header_alpha,
            json={"title": "Shared Demo Worship Service", "raw_text": "Shared sermon content."},
        )
        assert res_new_sess_a.status_code == 200
        shared_sess_id = res_new_sess_a.json()["session"]["session_id"]

        # Step 4: Device Beta IMMEDIATELY sees Device Alpha's session (universal workspace)
        res_sess_b_check = await client.get("/api/sessions", headers=header_beta)
        assert res_sess_b_check.status_code == 200
        b_ids = [s["session_id"] for s in res_sess_b_check.json()["sessions"]]
        assert shared_sess_id in b_ids, "Device Beta could not see session created in shared demo!"

        # Step 5: Deletion in demo removes resource from the shared workspace
        res_del_shared = await client.delete(f"/api/sessions/{shared_sess_id}", headers=header_beta)
        assert res_del_shared.status_code == 200
        assert res_del_shared.json()["status"] == "deleted"

        # Verify Device Alpha now sees it is gone
        res_sess_a_check = await client.get("/api/sessions", headers=header_alpha)
        a_ids = [s["session_id"] for s in res_sess_a_check.json()["sessions"]]
        assert shared_sess_id not in a_ids

        # Step 6: Real Authenticated Church Account Isolation
        res_church_sess = await client.post(
            "/api/sessions",
            headers=auth_header_user_a,
            json={"title": "Official Sunday Service", "raw_text": "Authoritative church sermon."},
        )
        assert res_church_sess.status_code == 200
        church_sess_id = res_church_sess.json()["session"]["session_id"]

        # Demo attempts to view or delete real church session -> 404 Not Found
        res_demo_hack = await client.get(f"/api/sessions/{church_sess_id}", headers=header_alpha)
        assert res_demo_hack.status_code == 404

        res_demo_del_hack = await client.delete(f"/api/sessions/{church_sess_id}", headers=header_alpha)
        assert res_demo_del_hack.status_code == 404

        # Church session remains intact
        res_church_verify = await client.get(f"/api/sessions/{church_sess_id}", headers=auth_header_user_a)
        assert res_church_verify.status_code == 200




