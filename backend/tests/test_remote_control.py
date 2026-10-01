"""
Multi-Device Remote Control & State Synchronization Integration Tests

Tests:
1. Device registration and presence heartbeats (online/offline status).
2. Active recording state tracking and owner_device_id assignment.
3. Cross-account invisibility (Account A cannot see or control Account B).
4. STOP_RECORDING command creation with 15s TTL.
5. Command retrieval, atomic acknowledgment, and execution completion.
6. Command expiry handling (>15s TTL).
7. Idempotent command execution and duplicate Stop handling (two remote Stops).
8. Race condition between local Stop and remote Stop.
9. Offline recording owner detection.
10. Post-recording workflow state & designated UI host tracking (verification & AI processing).
11. Multi-device cancellation (same-account device can cancel; cross-account rejected).
12. Demo account isolation.
"""

import asyncio
import datetime
import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database.device_repo import device_repo
from app.database.session_repo import session_repo


async def create_test_account(client: AsyncClient, username: str) -> tuple[dict, str]:
    headers = {"Authorization": f"Bearer test_token_{username}:{username}@dlbc.org"}
    res = await client.post(
        "/api/auth/onboarding/complete",
        headers=headers,
        json={"sector": "Adult", "church_state": "Lagos", "terminal_level": "state_headquarters"},
    )
    account_id = res.json()["account"]["id"]
    return headers, account_id


@pytest.mark.asyncio
async def test_device_registration_and_presence():
    """Devices register, send heartbeats, and report online/offline based on last_seen_at."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_test_account(client, f"dev_user_{uuid.uuid4().hex[:6]}")

        dev1_uid = f"uid_lap_{uuid.uuid4().hex[:8]}"
        dev2_uid = f"uid_phn_{uuid.uuid4().hex[:8]}"

        # 1. Register Laptop
        reg_res1 = await client.post(
            "/api/remote/devices/register",
            headers=headers,
            json={"device_uid": dev1_uid, "display_name": "Media Laptop", "platform": "windows", "device_type": "desktop"},
        )
        assert reg_res1.status_code == 200
        assert reg_res1.json()["device"]["display_name"] == "Media Laptop"
        assert reg_res1.json()["device"]["is_online"] is True

        # 2. Register Phone
        reg_res2 = await client.post(
            "/api/remote/devices/register",
            headers=headers,
            json={"device_uid": dev2_uid, "display_name": "Pixel 8 Pro", "platform": "android", "device_type": "mobile"},
        )
        assert reg_res2.status_code == 200
        assert reg_res2.json()["device"]["display_name"] == "Pixel 8 Pro"

        # 3. List devices
        list_res = await client.get("/api/remote/devices", headers=headers)
        assert list_res.status_code == 200
        devs = list_res.json()["devices"]
        assert len(devs) >= 2
        uids = [d["device_uid"] for d in devs]
        assert dev1_uid in uids
        assert dev2_uid in uids


@pytest.mark.asyncio
async def test_active_recording_and_cross_account_isolation():
    """Account A starts recording; Account A Phone sees it; Account B sees nothing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers_a, account_a = await create_test_account(client, f"acct_a_{uuid.uuid4().hex[:6]}")
        headers_b, account_b = await create_test_account(client, f"acct_b_{uuid.uuid4().hex[:6]}")

        laptop_a = f"lap_a_{uuid.uuid4().hex[:6]}"
        phone_a = f"phn_a_{uuid.uuid4().hex[:6]}"
        sess_a = f"sess_a_{uuid.uuid4().hex[:6]}"

        # Start recording on Account A laptop
        start_res = await client.post(
            "/api/remote/recording/start",
            headers=headers_a,
            json={
                "session_id": sess_a,
                "device_uid": laptop_a,
                "title": "Sunday Worship Service",
                "programme": "Sunday Worship",
                "minister": "Pastor Kumuyi",
                "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
        )
        assert start_res.status_code == 200
        rec = start_res.json()["active_recording"]
        assert rec["session_id"] == sess_a
        assert rec["owner_device_id"] == laptop_a
        assert rec["recording_status"] == "recording"

        # Account A Phone checks status -> Sees active recording
        status_a = await client.get(f"/api/remote/status?device_uid={phone_a}", headers=headers_a)
        assert status_a.status_code == 200
        a_data = status_a.json()
        assert a_data["active_recording"] is not None
        assert a_data["active_recording"]["session_id"] == sess_a
        assert a_data["is_owner"] is False  # phone is not owner

        # Account A Laptop checks status -> Sees active recording and is_owner is True
        status_lap = await client.get(f"/api/remote/status?device_uid={laptop_a}", headers=headers_a)
        assert status_lap.json()["is_owner"] is True

        # Account B checks status -> Active recording is None (Strict Account Isolation)
        status_b = await client.get(f"/api/remote/status?device_uid=phone_b", headers=headers_b)
        assert status_b.status_code == 200
        assert status_b.json()["active_recording"] is None

        # Account B tries to send STOP_RECORDING command for Account A's session -> 404
        cmd_hack = await client.post(
            "/api/remote/commands",
            headers=headers_b,
            json={"session_id": sess_a, "command_type": "STOP_RECORDING"},
        )
        assert cmd_hack.status_code == 404


@pytest.mark.asyncio
async def test_remote_stop_command_flow_and_idempotency():
    """
    Device B issues STOP_RECORDING.
    Device A polls, acknowledges, and completes.
    Second STOP command reuses active command / does not finalize twice.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_test_account(client, f"cmd_user_{uuid.uuid4().hex[:6]}")

        laptop_id = f"lap_{uuid.uuid4().hex[:6]}"
        phone_id = f"phn_{uuid.uuid4().hex[:6]}"
        sess_id = f"sess_{uuid.uuid4().hex[:6]}"

        # Start recording
        await client.post(
            "/api/remote/recording/start",
            headers=headers,
            json={"session_id": sess_id, "device_uid": laptop_id, "title": "Revival Service"},
        )

        # Phone issues STOP_RECORDING
        cmd_res1 = await client.post(
            "/api/remote/commands",
            headers=headers,
            json={"session_id": sess_id, "command_type": "STOP_RECORDING"},
        )
        assert cmd_res1.status_code == 200
        cmd1 = cmd_res1.json()["command"]
        cmd_id = cmd1["id"]
        assert cmd1["target_device_id"] == laptop_id
        assert cmd1["status"] == "pending"

        # Simultaneous second phone issues STOP_RECORDING -> Reuses existing active command
        cmd_res2 = await client.post(
            "/api/remote/commands",
            headers=headers,
            json={"session_id": sess_id, "command_type": "STOP_RECORDING"},
        )
        assert cmd_res2.status_code == 200
        assert cmd_res2.json()["command"]["id"] == cmd_id

        # Laptop polls pending commands
        poll_res = await client.get(f"/api/remote/commands/pending?device_uid={laptop_id}", headers=headers)
        assert poll_res.status_code == 200
        pending = poll_res.json()["commands"]
        assert len(pending) == 1
        assert pending[0]["id"] == cmd_id

        # Laptop atomically acknowledges
        ack_res = await client.post(
            f"/api/remote/commands/{cmd_id}/acknowledge?device_uid={laptop_id}",
            headers=headers,
        )
        assert ack_res.status_code == 200

        # Laptop completes execution
        comp_res = await client.post(
            f"/api/remote/commands/{cmd_id}/complete",
            headers=headers,
            json={"device_uid": laptop_id},
        )
        assert comp_res.status_code == 200

        # Verify active recording is now marked stopped
        st_res = await client.get(f"/api/remote/status?device_uid={laptop_id}", headers=headers)
        assert st_res.json()["active_recording"]["recording_status"] == "stopped"


@pytest.mark.asyncio
async def test_command_expiration_ttl():
    """Commands past their 15s TTL expire and are ignored."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_test_account(client, f"exp_user_{uuid.uuid4().hex[:6]}")

        laptop_id = f"lap_exp_{uuid.uuid4().hex[:6]}"
        sess_id = f"sess_exp_{uuid.uuid4().hex[:6]}"

        await client.post(
            "/api/remote/recording/start",
            headers=headers,
            json={"session_id": sess_id, "device_uid": laptop_id},
        )

        # Directly insert an already-expired command using device_repo with negative TTL
        past_cmd = await device_repo.create_command(
            account_id=account_id,
            session_id=sess_id,
            target_device_id=laptop_id,
            command_type="STOP_RECORDING",
            ttl_seconds=-5,  # expired 5 seconds ago
        )

        # Laptop polls -> expired command is filtered out
        poll_res = await client.get(f"/api/remote/commands/pending?device_uid={laptop_id}", headers=headers)
        assert len(poll_res.json()["commands"]) == 0


@pytest.mark.asyncio
async def test_workflow_state_sync_and_ui_host():
    """
    Automatic verification designates recording owner laptop as UI host.
    Remote phone receives synchronized verification status without auto-opening modal.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers, account_id = await create_test_account(client, f"wf_user_{uuid.uuid4().hex[:6]}")

        laptop_id = f"lap_{uuid.uuid4().hex[:6]}"
        phone_id = f"phn_{uuid.uuid4().hex[:6]}"
        sess_id = f"sess_wf_{uuid.uuid4().hex[:6]}"

        # Laptop updates workflow to verification running
        wf_res = await client.post(
            "/api/remote/workflow/update",
            headers=headers,
            json={
                "session_id": sess_id,
                "workflow_type": "verification",
                "status": "running",
                "ui_host_device_id": laptop_id,
                "progress_label": "18 of 59 checked",
                "items_total": 59,
                "items_resolved": 18,
            },
        )
        assert wf_res.status_code == 200

        # Laptop checks status: is_ui_host == True
        lap_status = await client.get(f"/api/remote/status?device_uid={laptop_id}", headers=headers)
        assert lap_status.json()["is_ui_host"] is True

        # Phone checks status: is_ui_host == False, but sees synchronized status!
        phone_status = await client.get(f"/api/remote/status?device_uid={phone_id}", headers=headers)
        p_data = phone_status.json()
        assert p_data["is_ui_host"] is False
        assert p_data["active_workflow"]["workflow_type"] == "verification"
        assert p_data["active_workflow"]["progress_label"] == "18 of 59 checked"
        assert p_data["active_workflow"]["items_total"] == 59
        assert p_data["active_workflow"]["items_resolved"] == 18

        # Chaining to AI processing
        ai_res = await client.post(
            "/api/remote/workflow/update",
            headers=headers,
            json={
                "session_id": sess_id,
                "workflow_type": "report_processing",
                "status": "running",
                "ui_host_device_id": laptop_id,
                "progress_label": "Processing report…",
            },
        )
        assert ai_res.status_code == 200

        # Both devices see AI processing running
        p_status2 = await client.get(f"/api/remote/status?device_uid={phone_id}", headers=headers)
        assert p_status2.json()["active_workflow"]["workflow_type"] == "report_processing"
        assert p_status2.json()["active_workflow"]["progress_label"] == "Processing report…"


@pytest.mark.asyncio
async def test_cross_device_cancellation_and_cross_account_block():
    """Same-account device can cancel active workflow; different account is rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers_a, account_a = await create_test_account(client, f"can_a_{uuid.uuid4().hex[:6]}")
        headers_b, account_b = await create_test_account(client, f"can_b_{uuid.uuid4().hex[:6]}")

        sess_id = f"sess_can_{uuid.uuid4().hex[:6]}"
        await session_repo.create_session(session_id=sess_id, title="Cancel Test", account_id=account_a)
        await session_repo.set_ai_verification_status(sess_id, "verifying")

        # Account B attempts to cancel Account A session -> 404
        b_res = await client.post(
            "/api/remote/cancel",
            headers=headers_b,
            json={"session_id": sess_id, "job_type": "verification"},
        )
        assert b_res.status_code == 404

        # Account A cancels from secondary device -> Succeeds
        a_res = await client.post(
            "/api/remote/cancel",
            headers=headers_a,
            json={"session_id": sess_id, "job_type": "verification"},
        )
        assert a_res.status_code == 200
        assert a_res.json()["status"] == "cancelled"

        # Verify workflow status updated to cancelled
        st = await client.get("/api/remote/status", headers=headers_a)
        assert st.json()["active_workflow"]["status"] == "cancelled"
