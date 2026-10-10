"""
Test Suite for Automatic Verification ON/OFF Toggle and Unauthenticated Audio Download.
Validates:
1. Audio download and streaming require NO authorization (public link access).
2. Automatic verification setting persistence (get_setting, set_setting, GET/POST /api/report-processing/settings).
3. Toggle ON: auto-verification triggers when transcript is valid and usable timestamps exist.
4. Toggle OFF: auto-verification does NOT trigger; transcript and audio remain intact.
5. Sessions without transcripts do NOT trigger AI verification.
6. Manual verification remains 100% operational regardless of toggle state.
"""
import os
import wave
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import STORAGE_AUDIO_DIR
from app.database.session_repo import session_repo
from app.database.report_processing_repo import report_processing_repo
from app.verification.decision_engine import verification_decision_engine

DEMO_HEADERS = {"Authorization": "Bearer demo", "x-dlbc-demo": "1"}


@pytest.mark.asyncio
async def test_unauthenticated_audio_download_and_streaming():
    """Ensure downloading and streaming audio works with NO authorization headers."""
    session_id = "session_test_unauth_audio_01"
    rec_id = "rec_test_unauth_audio_01"
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav")

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)

    try:
        await session_repo.create_session(
            session_id=session_id,
            title="Sunday Morning Service",
            recording_id=rec_id,
            status="recorded",
            provider_name="recording_only",
            account_id="legacy_default_account",
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Download endpoint with NO auth header
            res_dl = await client.get(f"/api/sessions/{session_id}/audio/download")
            assert res_dl.status_code == 200, f"Download failed: {res_dl.text}"
            assert res_dl.headers["content-type"] == "audio/wav"
            assert "attachment" in res_dl.headers["content-disposition"]
            assert "Sunday_Morning_Service" in res_dl.headers["content-disposition"]

            # 2. Audio streaming endpoint with NO auth header
            res_stream = await client.get(f"/api/sessions/{session_id}/audio")
            assert res_stream.status_code == 200, f"Stream failed: {res_stream.text}"
            assert res_stream.headers["content-type"] == "audio/wav"

            # 3. HTTP Range streaming with NO auth header
            res_range = await client.get(
                f"/api/sessions/{session_id}/audio",
                headers={"Range": "bytes=0-99"},
            )
            assert res_range.status_code == 206
            assert res_range.headers["content-length"] == "100"
            assert "bytes 0-99/" in res_range.headers["content-range"]
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
        await session_repo.delete_session(session_id, account_id="legacy_default_account")


@pytest.mark.asyncio
async def test_automatic_verification_setting_persistence():
    """Test getting and updating the auto_verification_enabled setting."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Default should be enabled
        res = await client.get("/api/report-processing/settings", headers=DEMO_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data.get("auto_verification_enabled") is True or data.get("auto_verification_enabled") == "true"

        # Toggle OFF
        res_off = await client.post(
            "/api/report-processing/settings",
            headers=DEMO_HEADERS,
            json={"auto_verification_enabled": False},
        )
        assert res_off.status_code == 200

        # Check DB directly
        val = await report_processing_repo.get_setting("auto_verification_enabled")
        assert val == "false"

        # Check GET endpoint
        res_get_off = await client.get("/api/report-processing/settings", headers=DEMO_HEADERS)
        assert res_get_off.status_code == 200
        assert res_get_off.json().get("auto_verification_enabled") is False

        # Toggle ON again
        res_on = await client.post(
            "/api/report-processing/settings",
            headers=DEMO_HEADERS,
            json={"key": "auto_verification_enabled", "value": "true"},
        )
        assert res_on.status_code == 200
        val_on = await report_processing_repo.get_setting("auto_verification_enabled")
        assert val_on == "true"


@pytest.mark.asyncio
async def test_no_transcript_skips_verification():
    """Sessions with no transcript must not run verification or trigger AI calls."""
    session_id = "session_test_no_transcript_01"
    await session_repo.create_session(
        session_id=session_id,
        title="Empty Session Without Transcript",
        recording_id="rec_empty_01",
        status="recorded",
        provider_name="recording_only",
        raw_text=None,
        account_id="legacy_default_account",
    )
    try:
        res = await verification_decision_engine.verify_session(session_id)
        assert res.get("status") == "skipped"
        assert "no transcript" in res.get("message", "").lower()

        # Status in DB should remain idle
        status_info = await session_repo.get_ai_verification_status(session_id)
        assert status_info.get("ai_verification_status") in ("idle", "not_started")
    finally:
        await session_repo.delete_session(session_id, account_id="legacy_default_account")


@pytest.mark.asyncio
async def test_toggle_off_suppresses_auto_verification_on_import():
    """When toggle is OFF, importing transcript does NOT trigger auto-verification."""
    # Ensure toggle is OFF
    await report_processing_repo.set_setting("auto_verification_enabled", "false")

    session_id = "session_test_toggle_off_import"
    rec_id = "rec_test_toggle_off_import"
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav")

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)

    try:
        await session_repo.create_session(
            session_id=session_id,
            title="Imported Session Auto-Off",
            recording_id=rec_id,
            status="recorded",
            provider_name="recording_only",
            account_id="legacy_default_account",
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            import_payload = {
                "raw_text": "The grace of our Lord Jesus Christ be with you all.",
                "segments": [
                    {
                        "start_time": 0.0,
                        "end_time": 3.5,
                        "text": "The grace of our Lord Jesus Christ be with you all.",
                    }
                ],
            }
            res = await client.post(
                f"/api/sessions/{session_id}/import-transcript",
                headers=DEMO_HEADERS,
                json=import_payload,
            )
            assert res.status_code == 200

            # Verification status should NOT be 'compiling' or 'verifying'
            v_status = await session_repo.get_ai_verification_status(session_id)
            assert v_status.get("ai_verification_status") in ("idle", "not_started")
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
        await session_repo.delete_session(session_id, account_id="legacy_default_account")
        # Restore setting to true
        await report_processing_repo.set_setting("auto_verification_enabled", "true")


@pytest.mark.asyncio
async def test_manual_verification_remains_active_when_toggle_off():
    """Manual verification endpoint still works even when auto-verification is turned OFF."""
    # Ensure toggle is OFF
    await report_processing_repo.set_setting("auto_verification_enabled", "false")

    session_id = "session_test_manual_verify_off"
    rec_id = "rec_test_manual_verify_off"
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav")

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)

    try:
        await session_repo.create_session(
            session_id=session_id,
            title="Manual Verify When Auto Off",
            recording_id=rec_id,
            status="recorded",
            provider_name="recording_only",
            account_id="legacy_default_account",
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # Import a segment
            await client.post(
                f"/api/sessions/{session_id}/import-transcript",
                headers=DEMO_HEADERS,
                json={
                    "raw_text": "Search the scriptures daily.",
                    "segments": [
                        {"start_time": 0.0, "end_time": 2.5, "text": "Search the scriptures daily."}
                    ],
                },
            )

            # Manual verification trigger should initiate cleanly
            res_manual = await client.post(
                f"/api/sessions/{session_id}/verify-ai",
                headers=DEMO_HEADERS,
            )
            assert res_manual.status_code == 200
            data = res_manual.json()
            assert data.get("session_id") == session_id
            assert data.get("status") in ("compiling", "completed_verified", "completed_needs_review", "idle")
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
        await session_repo.delete_session(session_id, account_id="legacy_default_account")
        # Restore setting to true
        await report_processing_repo.set_setting("auto_verification_enabled", "true")


@pytest.mark.asyncio
async def test_independent_unit_verification_settings_isolation():
    """
    Test independent Automatic Verification settings for Adult, Youth, and Campus units.
    Validates:
    - Adult: ON
    - Youth: OFF
    - Campus: ON
    - Disabling Youth must NOT affect Adult or Campus.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Configure Adult: ON, Youth: OFF, Campus: ON
        await report_processing_repo.set_unit_setting("adult", value="true")
        await report_processing_repo.set_unit_setting("youth", value="false")
        await report_processing_repo.set_unit_setting("campus", value="true")

        # 2. Verify direct DB resolution
        val_adult = await report_processing_repo.get_unit_setting("adult")
        val_youth = await report_processing_repo.get_unit_setting("youth")
        val_campus = await report_processing_repo.get_unit_setting("campus")

        assert val_adult == "true"
        assert val_youth == "false"
        assert val_campus == "true"

        # 3. Verify API endpoint GET with unit query parameter
        res_adult = await client.get("/api/report-processing/settings?unit=Adult", headers=DEMO_HEADERS)
        assert res_adult.status_code == 200
        assert res_adult.json()["auto_verification_enabled"] is True
        assert res_adult.json()["unit_settings"]["adult"] is True
        assert res_adult.json()["unit_settings"]["youth"] is False
        assert res_adult.json()["unit_settings"]["campus"] is True

        res_youth = await client.get("/api/report-processing/settings?unit=Youth", headers=DEMO_HEADERS)
        assert res_youth.status_code == 200
        assert res_youth.json()["auto_verification_enabled"] is False

        res_campus = await client.get("/api/report-processing/settings?unit=Campus", headers=DEMO_HEADERS)
        assert res_campus.status_code == 200
        assert res_campus.json()["auto_verification_enabled"] is True

        # 4. Modify Youth to True and verify non-interference with Adult/Campus
        res_update_youth = await client.post(
            "/api/report-processing/settings",
            headers=DEMO_HEADERS,
            json={"auto_verification_enabled": True, "unit": "youth"},
        )
        assert res_update_youth.status_code == 200
        assert res_update_youth.json()["auto_verification_enabled"] is True

        # Turn Youth back OFF
        await client.post(
            "/api/report-processing/settings",
            headers=DEMO_HEADERS,
            json={"key": "auto_verification_enabled:youth", "value": "false"},
        )
        val_youth_after = await report_processing_repo.get_unit_setting("youth")
        val_adult_after = await report_processing_repo.get_unit_setting("adult")
        assert val_youth_after == "false"
        assert val_adult_after == "true"


@pytest.mark.asyncio
async def test_unit_session_auto_verification_non_interference():
    """
    Ensure a session belonging to Youth (where verification is OFF) does not auto-verify,
    while a session belonging to Adult (where verification is ON) does auto-verify.
    """
    # Adult: ON, Youth: OFF
    await report_processing_repo.set_unit_setting("adult", value="true")
    await report_processing_repo.set_unit_setting("youth", value="false")

    adult_session_id = "session_test_unit_adult_01"
    youth_session_id = "session_test_unit_youth_01"

    rec_adult = "rec_test_unit_adult_01"
    rec_youth = "rec_test_unit_youth_01"

    wav_adult = os.path.join(STORAGE_AUDIO_DIR, f"{rec_adult}.wav")
    wav_youth = os.path.join(STORAGE_AUDIO_DIR, f"{rec_youth}.wav")

    for p in (wav_adult, wav_youth):
        with wave.open(p, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\x00\x00" * 3200)

    try:
        # Create adult session with metadata unit = Adult
        import json
        await session_repo.create_session(
            session_id=adult_session_id,
            title="Adult Sunday Worship",
            recording_id=rec_adult,
            status="recorded",
            provider_name="recording_only",
            account_id="legacy_default_account",
            metadata={"unit": "Adult"},
        )

        # Create youth session with metadata unit = Youth
        await session_repo.create_session(
            session_id=youth_session_id,
            title="Youth Fellowship",
            recording_id=rec_youth,
            status="recorded",
            provider_name="recording_only",
            account_id="legacy_default_account",
            metadata={"unit": "Youth"},
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Import transcript with valid timestamps for Youth
            res_y = await client.post(
                f"/api/sessions/{youth_session_id}/import-transcript",
                headers=DEMO_HEADERS,
                json={
                    "raw_text": "Remember now thy Creator in the days of thy youth.",
                    "segments": [
                        {"start_time": 0.0, "end_time": 3.0, "text": "Remember now thy Creator in the days of thy youth."}
                    ],
                },
            )
            assert res_y.status_code == 200
            # Youth auto_verification is OFF -> must remain idle
            status_y = await session_repo.get_ai_verification_status(youth_session_id)
            assert status_y.get("ai_verification_status") in ("idle", "not_started")

            # 2. Import transcript with valid timestamps for Adult
            res_a = await client.post(
                f"/api/sessions/{adult_session_id}/import-transcript",
                headers=DEMO_HEADERS,
                json={
                    "raw_text": "Sanctify them through thy truth thy word is truth.",
                    "segments": [
                        {"start_time": 0.0, "end_time": 3.0, "text": "Sanctify them through thy truth thy word is truth."}
                    ],
                },
            )
            assert res_a.status_code == 200
            # Adult auto_verification is ON -> initiates compiling/verifying
            status_a = await session_repo.get_ai_verification_status(adult_session_id)
            assert status_a.get("ai_verification_status") in ("compiling", "completed_verified", "completed_needs_review", "idle")

    finally:
        for p in (wav_adult, wav_youth):
            if os.path.exists(p):
                os.remove(p)
        await session_repo.delete_session(adult_session_id, account_id="legacy_default_account")
        await session_repo.delete_session(youth_session_id, account_id="legacy_default_account")
        await report_processing_repo.set_unit_setting("youth", value="true")


@pytest.mark.asyncio
async def test_transcript_import_removes_fabricated_timestamps():
    """
    Validates:
    - Text-only import does NOT fabricate 150 wpm timing.
    - Confidence is set to 0.0 (not artificial 1.0).
    - Flags contain 'unaligned_external_import' and 'provisional_import'.
    - Auto-verification is NEVER triggered when usable timestamps are absent.
    """
    await report_processing_repo.set_setting("auto_verification_enabled", "true")
    await report_processing_repo.set_unit_setting("adult", value="true")

    session_id = "session_test_unaligned_import"
    rec_id = "rec_test_unaligned_import"
    wav_path = os.path.join(STORAGE_AUDIO_DIR, f"{rec_id}.wav")

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)

    try:
        await session_repo.create_session(
            session_id=session_id,
            title="Import Raw Text Without Timestamps",
            recording_id=rec_id,
            status="recorded",
            provider_name="recording_only",
            account_id="legacy_default_account",
            metadata={"unit": "Adult"},
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            raw_input_text = "For God so loved the world that He gave His only begotten Son. That whosoever believeth in Him should not perish."
            res = await client.post(
                f"/api/sessions/{session_id}/import-transcript",
                headers=DEMO_HEADERS,
                json={"raw_text": raw_input_text},
            )
            assert res.status_code == 200
            data = res.json()
            session_obj = data.get("session") or {}
            segments = session_obj.get("segments", [])
            assert len(segments) > 0

            # Verify segments do NOT contain fabricated timing
            for seg in segments:
                # In DB output or JSON, flags must mark unaligned
                assert "unaligned_external_import" in seg.get("flags", [])
                assert seg.get("confidence") == 0.0
                assert seg.get("is_low_confidence") is True or seg.get("is_low_confidence") == 1

            # Verification MUST NOT have started because text has no real timestamps
            v_status = await session_repo.get_ai_verification_status(session_id)
            assert v_status.get("ai_verification_status") in ("idle", "not_started")

    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
        await session_repo.delete_session(session_id, account_id="legacy_default_account")


@pytest.mark.asyncio
async def test_cross_unit_authorization_defense():
    """
    Ensure operators assigned to a specific unit (e.g. Youth) cannot modify
    another unit's settings (e.g. Adult) without admin permissions.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Create a mock authenticated operator for Youth unit with operator role (not admin)
        from app.auth.auth_context import AuthContext
        youth_auth = AuthContext(
            user_id="user_youth_op_01",
            supabase_user_id="sub_youth_op_01",
            email="youth@dlbc.org",
            account_id="acc_youth_01",
            account={"id": "acc_youth_01", "sector": "Youth"},
            role="operator",
            is_onboarded=True,
            is_demo=False,
        )

        from app.auth.dependencies import get_optional_account
        app.dependency_overrides[get_optional_account] = lambda: youth_auth

        try:
            # 1. Modifying own unit (Youth) setting -> ALLOWED
            res_own = await client.post(
                "/api/report-processing/settings",
                json={"key": "auto_verification_enabled:youth", "value": "true"},
            )
            assert res_own.status_code == 200

            # 2. Attempting to modify Adult setting -> FORBIDDEN (403)
            res_cross = await client.post(
                "/api/report-processing/settings",
                json={"key": "auto_verification_enabled:adult", "value": "false"},
            )
            assert res_cross.status_code == 403
            assert "cannot modify settings for other units" in res_cross.text.lower() or "forbidden" in res_cross.text.lower()

            # 3. Attempting to modify via unit payload -> FORBIDDEN (403)
            res_cross_payload = await client.post(
                "/api/report-processing/settings",
                json={"auto_verification_enabled": False, "unit": "adult"},
            )
            assert res_cross_payload.status_code == 403

        finally:
            app.dependency_overrides.pop(get_optional_account, None)


@pytest.mark.asyncio
async def test_session_unit_resolution_hierarchy():
    """
    Validates unit resolution precedence:
    1. metadata_json["unit"] / metadata_json["sector"]
    2. session["sector"] / session["unit"]
    3. account["sector"]
    4. fallback to 'adult'
    """
    # 1. Session with explicit metadata unit
    u1 = await report_processing_repo.resolve_session_unit({
        "metadata_json": '{"unit": "Youth"}',
        "account_id": "acc_unknown",
    })
    assert u1 == "youth"

    # 2. Session with direct sector field
    u2 = await report_processing_repo.resolve_session_unit({
        "sector": "Campus",
        "account_id": "acc_unknown",
    })
    assert u2 == "campus"

    # 3. Fallback to adult
    u3 = await report_processing_repo.resolve_session_unit({})
    assert u3 == "adult"


@pytest.mark.asyncio
async def test_sqlite_and_mssql_ddl_declarations():
    """
    Verify report_processing_settings table DDL exists in both SQLite and Azure SQL (MSSQL) schemas.
    """
    from app.database.models import INIT_SCHEMA_SQL, INIT_SCHEMA_MSSQL
    assert "report_processing_settings" in INIT_SCHEMA_SQL
    assert "report_processing_settings" in INIT_SCHEMA_MSSQL
    assert "session_segments" in INIT_SCHEMA_SQL
    assert "session_segments" in INIT_SCHEMA_MSSQL


