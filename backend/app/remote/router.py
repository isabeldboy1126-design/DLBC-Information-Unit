"""
Multi-Device Remote Control & State Synchronization API Router

Provides account-scoped endpoints for:
- Device registration and presence heartbeats
- Active recording state & ownership
- Remote STOP_RECORDING command issuing and acknowledgment
- Post-recording workflow state synchronization (Verification & AI processing)
- Designated UI host determination (floating window auto-opens on host only)
- Cross-device cancellation
"""

import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account, require_auth
from app.database.device_repo import device_repo
from app.database.session_repo import session_repo
from app.database.report_processing_repo import report_processing_repo

router = APIRouter(prefix="/api/remote", tags=["remote"])


# =============================================================================
# Request & Response Schemas
# =============================================================================

class DeviceRegisterRequest(BaseModel):
    device_uid: str
    display_name: str
    platform: Optional[str] = "web"
    device_type: Optional[str] = "desktop"


class StartRecordingRequest(BaseModel):
    session_id: str
    device_uid: str
    title: Optional[str] = None
    programme: Optional[str] = None
    minister: Optional[str] = None
    started_at: Optional[str] = None


class RecordingHeartbeatRequest(BaseModel):
    session_id: str
    device_uid: str


class StopRecordingStateRequest(BaseModel):
    session_id: str
    device_uid: str


class SendCommandRequest(BaseModel):
    command_type: str = "STOP_RECORDING"
    session_id: str


class CompleteCommandRequest(BaseModel):
    device_uid: str
    failure_reason: Optional[str] = None


class WorkflowUpdateRequest(BaseModel):
    session_id: str
    workflow_type: str  # 'verification' | 'report_processing'
    status: str  # 'running' | 'completed' | 'failed' | 'cancelled'
    ui_host_device_id: str
    progress_label: Optional[str] = None
    items_total: int = 0
    items_resolved: int = 0


class CancelJobRequest(BaseModel):
    session_id: str
    job_type: str  # 'verification' | 'report_processing'


# =============================================================================
# Device Registration & Presence
# =============================================================================

@router.post("/devices/register")
async def register_device(
    req: DeviceRegisterRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Registers a device or updates its heartbeat and display name."""
    account_id = auth.account_id or "demo_account"
    device = await device_repo.register_or_heartbeat(
        account_id=account_id,
        device_uid=req.device_uid,
        display_name=req.display_name,
        platform=req.platform or "web",
        device_type=req.device_type or "desktop",
    )
    return {"status": "ok", "device": device}


@router.get("/devices")
async def list_account_devices(
    auth: AuthContext = Depends(require_auth),
):
    """Lists all devices registered under the authenticated user's account."""
    account_id = auth.account_id or "demo_account"
    devices = await device_repo.list_devices(account_id)
    return {"devices": devices}


# =============================================================================
# Active Recording State & Ownership
# =============================================================================

@router.post("/recording/start")
async def start_recording_state(
    req: StartRecordingRequest,
    auth: AuthContext = Depends(require_auth),
):
    """
    Called by the device initiating recording.
    Designates that device as owner_device_id and registers active recording state.
    """
    account_id = auth.account_id or "demo_account"
    recording = await device_repo.set_active_recording(
        account_id=account_id,
        session_id=req.session_id,
        owner_device_id=req.device_uid,
        recording_status="recording",
        started_at=req.started_at,
        title=req.title,
        programme=req.programme,
        minister=req.minister,
    )
    return {"status": "recording", "active_recording": recording}


@router.post("/recording/heartbeat")
async def recording_heartbeat(
    req: RecordingHeartbeatRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Updates recording heartbeat from the owner device (~every 2-3s)."""
    account_id = auth.account_id or "demo_account"
    updated = await device_repo.update_recording_heartbeat(
        account_id=account_id,
        session_id=req.session_id,
        owner_device_id=req.device_uid,
    )
    if not updated:
        return {"status": "inactive"}
    return {"status": "ok", "active_recording": updated}


@router.post("/recording/stop")
async def stop_recording_state(
    req: StopRecordingStateRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Transitions active recording state to 'stopped'."""
    account_id = auth.account_id or "demo_account"
    updated = await device_repo.stop_active_recording(
        account_id=account_id,
        session_id=req.session_id,
    )
    return {"status": "stopped", "active_recording": updated}


# =============================================================================
# Synchronized State & Remote Control Status
# =============================================================================

@router.get("/status")
async def get_remote_status(
    device_uid: Optional[str] = Query(None),
    auth: AuthContext = Depends(require_auth),
):
    """
    Returns full multi-device synchronized status for the account:
    - active recording (if any), with owner info and offline detection
    - active workflow (verification or AI processing), with UI host designation
    - ownership flags (is_owner, is_ui_host) relative to caller's device_uid
    """
    account_id = auth.account_id or "demo_account"
    active_rec = await device_repo.get_active_recording(account_id)
    active_wf = await device_repo.get_active_workflow(account_id)

    # Compute ownership flags
    is_owner = bool(device_uid and active_rec and active_rec.get("owner_device_id") == device_uid)
    is_ui_host = bool(device_uid and active_wf and active_wf.get("ui_host_device_id") == device_uid)

    return {
        "account_id": account_id,
        "caller_device_uid": device_uid,
        "active_recording": active_rec,
        "is_owner": is_owner,
        "active_workflow": active_wf,
        "is_ui_host": is_ui_host,
        "server_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


# =============================================================================
# Remote Commands (STOP_RECORDING)
# =============================================================================

@router.post("/commands")
async def send_remote_command(
    req: SendCommandRequest,
    auth: AuthContext = Depends(require_auth),
):
    """
    Issues a remote command (e.g. STOP_RECORDING) from a remote device.
    Verifies session ownership and active recording state.
    Targets exact owner_device_id with a 15-second TTL.
    """
    account_id = auth.account_id or "demo_account"

    # Verify active recording exists and is currently recording
    active_rec = await device_repo.get_active_recording(account_id)
    if not active_rec or active_rec.get("session_id") != req.session_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active recording found for this session on your account.",
        )

    if active_rec.get("recording_status") not in ("starting", "recording"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recording is already {active_rec.get('recording_status')}.",
        )

    owner_device_id = active_rec["owner_device_id"]
    command = await device_repo.create_command(
        account_id=account_id,
        session_id=req.session_id,
        target_device_id=owner_device_id,
        command_type=req.command_type,
        ttl_seconds=15,
    )

    return {
        "status": "command_queued",
        "command": command,
        "target_device_id": owner_device_id,
        "target_device_name": active_rec.get("owner_device_name", "Media Laptop"),
    }


@router.get("/commands/pending")
async def get_pending_commands(
    device_uid: str = Query(...),
    auth: AuthContext = Depends(require_auth),
):
    """
    Polled by recording owner device (~1/sec while recording)
    to receive commands targeting its device_uid.
    Stale commands (>15s) are automatically expired.
    """
    account_id = auth.account_id or "demo_account"
    commands = await device_repo.get_pending_commands(account_id, device_uid)
    return {"commands": commands}


@router.post("/commands/{command_id}/acknowledge")
async def acknowledge_command(
    command_id: str,
    device_uid: str = Query(...),
    auth: AuthContext = Depends(require_auth),
):
    """Atomically acknowledges a command before executing local stop."""
    account_id = auth.account_id or "demo_account"
    acknowledged = await device_repo.acknowledge_command(account_id, command_id, device_uid)
    if not acknowledged:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Command not found, already acknowledged, or expired.",
        )
    return {"status": "acknowledged", "command_id": command_id}


@router.post("/commands/{command_id}/complete")
async def complete_command(
    command_id: str,
    req: CompleteCommandRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Marks command executed (or failed) once local stop flow finishes."""
    account_id = auth.account_id or "demo_account"
    completed = await device_repo.complete_command(
        account_id=account_id,
        command_id=command_id,
        target_device_id=req.device_uid,
        failure_reason=req.failure_reason,
    )
    if not completed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Command not found or already completed.",
        )
    return {"status": "completed", "command_id": command_id}


# =============================================================================
# Post-Recording Workflow Synchronization & UI Host
# =============================================================================

@router.post("/workflow/update")
async def update_workflow_state(
    req: WorkflowUpdateRequest,
    auth: AuthContext = Depends(require_auth),
):
    """
    Updates active workflow state (verification or AI processing)
    and records the designated UI host device.
    """
    account_id = auth.account_id or "demo_account"
    wf = await device_repo.set_active_workflow(
        account_id=account_id,
        session_id=req.session_id,
        workflow_type=req.workflow_type,
        status=req.status,
        ui_host_device_id=req.ui_host_device_id,
        progress_label=req.progress_label,
        items_total=req.items_total,
        items_resolved=req.items_resolved,
    )
    return {"status": "ok", "workflow": wf}


@router.post("/cancel")
async def cancel_active_job(
    req: CancelJobRequest,
    auth: AuthContext = Depends(require_auth),
):
    """
    Cancels an active Verification or AI Processing job from any authorized
    device on the same account.
    """
    account_id = auth.account_id or "demo_account"

    # Verify session belongs to account
    session = await session_repo.get_session(req.session_id)
    if not session or (session.get("account_id") and session.get("account_id") != account_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found on your account.",
        )

    if req.job_type == "verification":
        await session_repo.set_ai_verification_status(req.session_id, "cancelled")
        await device_repo.set_active_workflow(
            account_id=account_id,
            session_id=req.session_id,
            workflow_type="verification",
            status="cancelled",
            ui_host_device_id="",
            progress_label="Verification cancelled",
        )
        return {"status": "cancelled", "job_type": "verification"}

    elif req.job_type == "report_processing":
        cancelled = await report_processing_repo.cancel_session_processing(req.session_id)
        await device_repo.set_active_workflow(
            account_id=account_id,
            session_id=req.session_id,
            workflow_type="report_processing",
            status="cancelled",
            ui_host_device_id="",
            progress_label="AI Processing cancelled",
        )
        return {"status": "cancelled", "job_type": "report_processing"}

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unknown job_type: {req.job_type}",
    )
