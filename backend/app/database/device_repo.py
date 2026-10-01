"""
Device Repository & Multi-Device State Manager

Manages:
- registered_devices: Account-scoped devices with presence heartbeats
- active_recording_state: Single active recording state per account with owner device
- device_commands: Time-to-live remote command queue (e.g. STOP_RECORDING)
- active_workflow_state: Synchronized post-recording verification and AI workflow state with UI host
"""

import datetime
import uuid
from typing import Any, Dict, List, Optional
from app.database.connection import get_db_connection


class DeviceRepository:
    def __init__(self):
        pass

    async def init_db(self):
        """Ensures device tables are created on database initialization."""
        async with get_db_connection() as conn:
            from app.database.models import INIT_SCHEMA_SQL
            await conn.executescript(INIT_SCHEMA_SQL)
            await conn.commit()

    # =========================================================================
    # Device Registration & Presence
    # =========================================================================

    async def register_or_heartbeat(
        self,
        account_id: str,
        device_uid: str,
        display_name: str,
        platform: str = "web",
        device_type: str = "desktop",
    ) -> Dict[str, Any]:
        """Registers a device or updates its presence heartbeat and metadata."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        clean_name = display_name.strip() if display_name and display_name.strip() else "Device"
        clean_platform = platform.strip() if platform else "web"
        clean_type = device_type.strip() if device_type else "desktop"

        async with get_db_connection() as conn:
            # Check existing device
            cursor = await conn.execute(
                "SELECT id, display_name FROM registered_devices WHERE account_id = ? AND device_uid = ?",
                (account_id, device_uid),
            )
            row = await cursor.fetchone()

            if row:
                dev_id = row["id"]
                await conn.execute(
                    """
                    UPDATE registered_devices
                    SET display_name = ?, platform = ?, device_type = ?, last_seen_at = ?, updated_at = ?
                    WHERE id = ? AND account_id = ?
                    """,
                    (clean_name, clean_platform, clean_type, now, now, dev_id, account_id),
                )
            else:
                dev_id = str(uuid.uuid4())
                await conn.execute(
                    """
                    INSERT INTO registered_devices
                    (id, account_id, device_uid, display_name, platform, device_type, last_seen_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (dev_id, account_id, device_uid, clean_name, clean_platform, clean_type, now, now, now),
                )
            await conn.commit()

            return await self.get_device(account_id, device_uid)

    async def get_device(self, account_id: str, device_uid: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single device by account_id and device_uid."""
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, account_id, device_uid, display_name, platform, device_type, last_seen_at, created_at, updated_at
                FROM registered_devices
                WHERE account_id = ? AND device_uid = ?
                """,
                (account_id, device_uid),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            data = dict(row)
            is_online = False
            if data.get("last_seen_at"):
                try:
                    last_seen_dt = datetime.datetime.fromisoformat(data["last_seen_at"])
                    is_online = (now_dt - last_seen_dt).total_seconds() < 12
                except Exception:
                    is_online = False
            data["is_online"] = is_online
            return data

    async def list_devices(self, account_id: str) -> List[Dict[str, Any]]:
        """Lists all registered devices for an account with online/offline determination."""
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT id, account_id, device_uid, display_name, platform, device_type, last_seen_at, created_at, updated_at
                FROM registered_devices
                WHERE account_id = ?
                ORDER BY updated_at DESC
                """,
                (account_id,),
            )
            rows = await cursor.fetchall()
            devices = []
            for r in rows:
                d = dict(r)
                is_online = False
                if d.get("last_seen_at"):
                    try:
                        last_seen_dt = datetime.datetime.fromisoformat(d["last_seen_at"])
                        is_online = (now_dt - last_seen_dt).total_seconds() < 12
                    except Exception:
                        is_online = False
                d["is_online"] = is_online
                devices.append(d)
            return devices

    # =========================================================================
    # Active Recording State & Ownership
    # =========================================================================

    async def set_active_recording(
        self,
        account_id: str,
        session_id: str,
        owner_device_id: str,
        recording_status: str = "recording",
        started_at: Optional[str] = None,
        title: Optional[str] = None,
        programme: Optional[str] = None,
        minister: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Sets or replaces the single active recording for the account."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        rec_started = started_at or now

        async with get_db_connection() as conn:
            # Check existing active recording for this account
            cursor = await conn.execute(
                "SELECT account_id FROM active_recording_state WHERE account_id = ?",
                (account_id,),
            )
            row = await cursor.fetchone()

            if row:
                await conn.execute(
                    """
                    UPDATE active_recording_state
                    SET session_id = ?, owner_device_id = ?, recording_status = ?, started_at = ?,
                        title = ?, programme = ?, minister = ?, last_heartbeat_at = ?, updated_at = ?
                    WHERE account_id = ?
                    """,
                    (session_id, owner_device_id, recording_status, rec_started, title, programme, minister, now, now, account_id),
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO active_recording_state
                    (account_id, session_id, owner_device_id, recording_status, started_at, title, programme, minister, last_heartbeat_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (account_id, session_id, owner_device_id, recording_status, rec_started, title, programme, minister, now, now),
                )

            # Automatically set the recording owner as the initial ui_host for subsequent workflows
            await conn.execute(
                """
                INSERT INTO active_workflow_state
                (account_id, session_id, workflow_type, status, ui_host_device_id, progress_label, items_total, items_resolved, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_id) DO UPDATE SET
                    session_id = excluded.session_id,
                    workflow_type = excluded.workflow_type,
                    status = excluded.status,
                    ui_host_device_id = excluded.ui_host_device_id,
                    progress_label = excluded.progress_label,
                    updated_at = excluded.updated_at
                """,
                (account_id, session_id, "recording", "recording", owner_device_id, "Live Recording", 0, 0, now),
            )

            await conn.commit()

        return await self.get_active_recording(account_id)

    async def update_recording_heartbeat(
        self,
        account_id: str,
        session_id: str,
        owner_device_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Updates last_heartbeat_at from the owner device while recording."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                UPDATE active_recording_state
                SET last_heartbeat_at = ?, updated_at = ?
                WHERE account_id = ? AND session_id = ? AND owner_device_id = ? AND recording_status IN ('starting', 'recording')
                """,
                (now, now, account_id, session_id, owner_device_id),
            )
            await conn.commit()
            if cursor.rowcount == 0:
                return None

        return await self.get_active_recording(account_id)

    async def stop_active_recording(
        self,
        account_id: str,
        session_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Transitions active recording state to 'stopped'."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                UPDATE active_recording_state
                SET recording_status = 'stopped', updated_at = ?
                WHERE account_id = ? AND session_id = ?
                """,
                (now, account_id, session_id),
            )
            await conn.commit()
            if cursor.rowcount == 0:
                return None

        return await self.get_active_recording(account_id)

    async def get_active_recording(self, account_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves active recording state for an account.
        Calculates owner online status based on last_heartbeat_at.
        """
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT account_id, session_id, owner_device_id, recording_status, started_at,
                       title, programme, minister, last_heartbeat_at, updated_at
                FROM active_recording_state
                WHERE account_id = ?
                """,
                (account_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            rec = dict(row)
            # Fetch owner device display name
            dev_cursor = await conn.execute(
                "SELECT display_name FROM registered_devices WHERE account_id = ? AND device_uid = ?",
                (account_id, rec["owner_device_id"]),
            )
            dev_row = await dev_cursor.fetchone()
            rec["owner_device_name"] = dev_row["display_name"] if dev_row else "Media Laptop"

            # Check if owner heartbeat is still fresh (< 12 seconds)
            is_owner_online = False
            if rec.get("last_heartbeat_at"):
                try:
                    hb_dt = datetime.datetime.fromisoformat(rec["last_heartbeat_at"])
                    is_owner_online = (now_dt - hb_dt).total_seconds() < 12
                except Exception:
                    is_owner_online = False

            rec["is_owner_online"] = is_owner_online
            if not is_owner_online and rec.get("recording_status") == "recording":
                rec["is_owner_offline"] = True
            else:
                rec["is_owner_offline"] = False

            return rec

    # =========================================================================
    # Remote Commands Queue
    # =========================================================================

    async def create_command(
        self,
        account_id: str,
        session_id: str,
        target_device_id: str,
        command_type: str = "STOP_RECORDING",
        ttl_seconds: int = 15,
    ) -> Dict[str, Any]:
        """
        Creates a time-bound command targeting a specific owner device.
        Idempotent: Reuses unexpired pending/acknowledged command if one is already active.
        """
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        now = now_dt.isoformat()
        expires_at = (now_dt + datetime.timedelta(seconds=ttl_seconds)).isoformat()

        async with get_db_connection() as conn:
            # Check for existing unexpired command for this session and target
            cursor = await conn.execute(
                """
                SELECT id, account_id, session_id, target_device_id, command_type, status,
                       created_at, acknowledged_at, completed_at, expires_at, failure_reason
                FROM device_commands
                WHERE account_id = ? AND session_id = ? AND target_device_id = ?
                  AND command_type = ? AND status IN ('pending', 'acknowledged')
                  AND expires_at > ?
                ORDER BY created_at DESC
                """,
                (account_id, session_id, target_device_id, command_type, now),
            )
            existing = await cursor.fetchone()
            if existing:
                return dict(existing)

            # Create new command
            cmd_id = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO device_commands
                (id, account_id, session_id, target_device_id, command_type, status, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (cmd_id, account_id, session_id, target_device_id, command_type, now, expires_at),
            )
            await conn.commit()

            return {
                "id": cmd_id,
                "account_id": account_id,
                "session_id": session_id,
                "target_device_id": target_device_id,
                "command_type": command_type,
                "status": "pending",
                "created_at": now,
                "acknowledged_at": None,
                "completed_at": None,
                "expires_at": expires_at,
                "failure_reason": None,
            }

    async def get_pending_commands(
        self,
        account_id: str,
        target_device_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves pending unexpired commands targeting this device.
        Automatically marks stale commands as expired.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        async with get_db_connection() as conn:
            # Mark expired
            await conn.execute(
                """
                UPDATE device_commands
                SET status = 'expired'
                WHERE account_id = ? AND target_device_id = ? AND status = 'pending' AND expires_at <= ?
                """,
                (account_id, target_device_id, now),
            )
            await conn.commit()

            # Fetch active pending
            cursor = await conn.execute(
                """
                SELECT id, account_id, session_id, target_device_id, command_type, status,
                       created_at, acknowledged_at, completed_at, expires_at, failure_reason
                FROM device_commands
                WHERE account_id = ? AND target_device_id = ? AND status = 'pending' AND expires_at > ?
                ORDER BY created_at ASC
                """,
                (account_id, target_device_id, now),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def acknowledge_command(
        self,
        account_id: str,
        command_id: str,
        target_device_id: str,
    ) -> bool:
        """Atomically acknowledges a pending command before execution."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                UPDATE device_commands
                SET status = 'acknowledged', acknowledged_at = ?
                WHERE id = ? AND account_id = ? AND target_device_id = ? AND status = 'pending' AND expires_at > ?
                """,
                (now, command_id, account_id, target_device_id, now),
            )
            await conn.commit()
            return cursor.rowcount > 0

    async def complete_command(
        self,
        account_id: str,
        command_id: str,
        target_device_id: str,
        failure_reason: Optional[str] = None,
    ) -> bool:
        """Marks a command as executed (or failed) once the local stop flow completes."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        status = "failed" if failure_reason else "executed"

        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                UPDATE device_commands
                SET status = ?, completed_at = ?, failure_reason = ?
                WHERE id = ? AND account_id = ? AND target_device_id = ? AND status IN ('pending', 'acknowledged')
                """,
                (status, now, failure_reason, command_id, account_id, target_device_id),
            )
            # If executed successfully, ensure active_recording_state is marked stopped
            if status == "executed":
                # Find command session_id
                cmd_cursor = await conn.execute("SELECT session_id FROM device_commands WHERE id = ?", (command_id,))
                cmd_row = await cmd_cursor.fetchone()
                if cmd_row:
                    await conn.execute(
                        """
                        UPDATE active_recording_state
                        SET recording_status = 'stopped', updated_at = ?
                        WHERE account_id = ? AND session_id = ?
                        """,
                        (now, account_id, cmd_row["session_id"]),
                    )

            await conn.commit()
            return cursor.rowcount > 0

    # =========================================================================
    # Synchronized Workflow State & UI Host Device
    # =========================================================================

    async def set_active_workflow(
        self,
        account_id: str,
        session_id: str,
        workflow_type: str,
        status: str,
        ui_host_device_id: str,
        progress_label: Optional[str] = None,
        items_total: int = 0,
        items_resolved: int = 0,
    ) -> Dict[str, Any]:
        """Sets or updates the account-scoped active workflow state and designated UI host."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        async with get_db_connection() as conn:
            # Check existing
            cursor = await conn.execute(
                "SELECT account_id FROM active_workflow_state WHERE account_id = ?",
                (account_id,),
            )
            row = await cursor.fetchone()

            if row:
                await conn.execute(
                    """
                    UPDATE active_workflow_state
                    SET session_id = ?, workflow_type = ?, status = ?, ui_host_device_id = ?,
                        progress_label = ?, items_total = ?, items_resolved = ?, updated_at = ?
                    WHERE account_id = ?
                    """,
                    (session_id, workflow_type, status, ui_host_device_id, progress_label, items_total, items_resolved, now, account_id),
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO active_workflow_state
                    (account_id, session_id, workflow_type, status, ui_host_device_id, progress_label, items_total, items_resolved, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (account_id, session_id, workflow_type, status, ui_host_device_id, progress_label, items_total, items_resolved, now),
                )
            await conn.commit()

        return await self.get_active_workflow(account_id)

    async def get_active_workflow(self, account_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves current active workflow for an account."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT account_id, session_id, workflow_type, status, ui_host_device_id,
                       progress_label, items_total, items_resolved, updated_at
                FROM active_workflow_state
                WHERE account_id = ?
                """,
                (account_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return dict(row)

    async def clear_active_workflow(self, account_id: str, session_id: Optional[str] = None) -> bool:
        """Clears active workflow state for an account."""
        async with get_db_connection() as conn:
            if session_id:
                cursor = await conn.execute(
                    "DELETE FROM active_workflow_state WHERE account_id = ? AND session_id = ?",
                    (account_id, session_id),
                )
            else:
                cursor = await conn.execute(
                    "DELETE FROM active_workflow_state WHERE account_id = ?",
                    (account_id,),
                )
            await conn.commit()
            return cursor.rowcount > 0


device_repo = DeviceRepository()
