"""
Account, User, and Membership Repository
Manages church accounts, app users, account memberships, and onboarding state.
Supports both Azure SQL (MSSQL) and SQLite seamlessly.
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.database.connection import get_db_connection
from app.database.models import (
    AUTH_MIGRATION_COLUMNS,
    AUTH_MIGRATION_COLUMNS_MSSQL,
    INIT_SCHEMA_MSSQL,
    INIT_SCHEMA_SQL,
)

LEGACY_DEFAULT_ACCOUNT_ID = "legacy_default_account"
DEMO_ACCOUNT_ID = LEGACY_DEFAULT_ACCOUNT_ID


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def derive_account_name(account: Dict[str, Any]) -> str:
    """
    Derives account identity from sector + terminal hierarchy per prompt requirements:
    Examples:
      - Youth Information Unit – Mini Aza District · Rivers Central
      - Adult Information Unit – Rivers Central State Headquarters
    """
    sector = (account.get("custom_sector") or account.get("sector") or "Adult").strip()
    if not sector.lower().endswith("information unit"):
        prefix = f"{sector} Information Unit"
    else:
        prefix = sector

    state = (account.get("church_state") or "").strip()
    terminal = account.get("terminal_level") or "state_headquarters"
    region = (account.get("region") or "").strip()
    old_group = (account.get("old_group") or "").strip()
    group_name = (account.get("group_name") or "").strip()
    district = (account.get("district") or "").strip()

    if terminal == "state_headquarters":
        return f"{prefix} – {state} State Headquarters" if state else prefix
    elif terminal == "region_headquarters":
        return f"{prefix} – {region} Region · {state}" if region else f"{prefix} – {state}"
    elif terminal == "old_group_headquarters":
        return f"{prefix} – {old_group} Old Group · {state}" if old_group else f"{prefix} – {state}"
    elif terminal == "group_headquarters":
        return f"{prefix} – {group_name} Group · {state}" if group_name else f"{prefix} – {state}"
    elif terminal == "district":
        return f"{prefix} – {district} District · {state}" if district else f"{prefix} – {state}"

    return f"{prefix} – {state}" if state else prefix


def clean_hierarchy_for_terminal_level(data: Dict[str, Any], terminal_level: str) -> Dict[str, Any]:
    """
    Enforces Section 20 Hierarchy Rule:
    Fields BELOW the selected terminal level must be NULL.
    """
    cleaned = dict(data)
    cleaned["terminal_level"] = terminal_level

    if terminal_level == "state_headquarters":
        cleaned["region"] = None
        cleaned["old_group"] = None
        cleaned["group_name"] = None
        cleaned["district"] = None
    elif terminal_level == "region_headquarters":
        cleaned["old_group"] = None
        cleaned["group_name"] = None
        cleaned["district"] = None
    elif terminal_level == "old_group_headquarters":
        cleaned["group_name"] = None
        cleaned["district"] = None
    elif terminal_level == "group_headquarters":
        cleaned["district"] = None

    if cleaned.get("sector") != "Other":
        cleaned["custom_sector"] = None

    return cleaned


class AccountRepository:
    DEMO_ACCOUNT_ID = DEMO_ACCOUNT_ID
    LEGACY_DEFAULT_ACCOUNT_ID = LEGACY_DEFAULT_ACCOUNT_ID

    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes tables, migration columns, and the legacy default account."""
        is_mssql = bool(os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL").startswith("sqlite"))

        async with get_db_connection() as conn:
            if is_mssql:
                await conn.executescript(INIT_SCHEMA_MSSQL)
                for sql in AUTH_MIGRATION_COLUMNS_MSSQL:
                    try:
                        await conn.execute(sql)
                    except Exception:
                        pass
            else:
                await conn.executescript(INIT_SCHEMA_SQL)
                for sql in AUTH_MIGRATION_COLUMNS:
                    try:
                        await conn.execute(sql)
                    except Exception:
                        pass

            # Seed designated legacy default account if it does not exist
            cursor = await conn.execute(
                "SELECT id FROM accounts WHERE id = ?",
                (LEGACY_DEFAULT_ACCOUNT_ID,)
            )
            row = await cursor.fetchone()
            now = utc_now_iso()
            if not row:
                await conn.execute(
                    """
                    INSERT INTO accounts (
                        id, sector, custom_sector, church_state, region, old_group,
                        group_name, district, terminal_level, onboarding_step,
                        onboarding_completed_at, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        LEGACY_DEFAULT_ACCOUNT_ID,
                        "Adult",
                        None,
                        "Rivers Central",
                        None,
                        None,
                        None,
                        None,
                        "state_headquarters",
                        2,
                        "2026-08-23T00:00:00Z",
                        "active",
                        now,
                        now,
                    )
                )

            # Assign existing unassigned sessions to legacy_default_account
            try:
                await conn.execute(
                    "UPDATE sessions SET account_id = ? WHERE account_id IS NULL OR account_id = ''",
                    (LEGACY_DEFAULT_ACCOUNT_ID,)
                )
            except Exception as e:
                print(f"Warning migrating sessions account_id: {e}")

            # Assign existing unassigned programmes to legacy_default_account
            try:
                await conn.execute(
                    "UPDATE programmes SET account_id = ? WHERE account_id IS NULL OR account_id = ''",
                    (LEGACY_DEFAULT_ACCOUNT_ID,)
                )
            except Exception as e:
                print(f"Warning migrating programmes account_id: {e}")

            # Copy global report_processing_settings into account_settings for legacy account
            try:
                cursor = await conn.execute("SELECT [key], [value], [updated_at] FROM report_processing_settings")
                rows = await cursor.fetchall()
                for r in rows:
                    k, v, u = r[0], r[1], r[2]
                    await conn.execute(
                        """
                        INSERT INTO account_settings (account_id, setting_key, setting_value, updated_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (LEGACY_DEFAULT_ACCOUNT_ID, k, v, u)
                    )
            except Exception:
                pass  # Ignore if duplicate or empty
            await conn.commit()
            self._initialized = True

    async def get_or_create_demo_account(self, visitor_id: str = "default") -> Dict[str, Any]:
        """
        Retrieves the canonical universal shared Demo account.
        All devices, laptops, and visitors enter the same shared Demo workspace.
        """
        await self.init_db()
        acct = await self.get_account_by_id(LEGACY_DEFAULT_ACCOUNT_ID)
        if not acct:
            raise RuntimeError(f"Universal Demo account '{LEGACY_DEFAULT_ACCOUNT_ID}' not initialized.")
        return acct

    async def get_user_by_supabase_id(self, supabase_user_id: str) -> Optional[Dict[str, Any]]:
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT id, supabase_user_id, email, display_name, status, created_at, updated_at, last_login_at FROM app_users WHERE supabase_user_id = ?",
                (supabase_user_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return dict(row)

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT id, supabase_user_id, email, display_name, status, created_at, updated_at, last_login_at FROM app_users WHERE LOWER(email) = LOWER(?)",
                (email.strip(),)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return dict(row)

    async def get_user_and_account_by_supabase_id(
        self, supabase_user_id: str
    ) -> Optional[Tuple[Dict[str, Any], Optional[Dict[str, Any]], Optional[str]]]:
        """
        Retrieves user, their primary active account, and membership role in a single
        read-only query. Avoids table locks and repeated write churn.
        Returns (user_dict, account_dict_or_None, role_or_None) if user exists,
        or None if user does not exist.
        """
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT 
                    u.id AS u_id, u.supabase_user_id AS u_sub, u.email AS u_email,
                    u.display_name AS u_display_name, u.status AS u_status,
                    u.created_at AS u_created_at, u.updated_at AS u_updated_at,
                    u.last_login_at AS u_last_login_at,
                    a.id AS a_id, a.sector AS a_sector, a.custom_sector AS a_custom_sector,
                    a.church_state AS a_church_state, a.region AS a_region,
                    a.old_group AS a_old_group, a.group_name AS a_group_name,
                    a.district AS a_district, a.terminal_level AS a_terminal_level,
                    a.onboarding_step AS a_onboarding_step,
                    a.onboarding_completed_at AS a_onboarding_completed_at,
                    a.status AS a_status, a.created_at AS a_created_at,
                    a.updated_at AS a_updated_at,
                    m.role AS m_role
                FROM app_users u
                LEFT JOIN account_memberships m ON u.id = m.user_id
                LEFT JOIN accounts a ON m.account_id = a.id AND a.status = 'active'
                WHERE u.supabase_user_id = ?
                ORDER BY a.created_at ASC
                """,
                (supabase_user_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            user = {
                "id": row["u_id"],
                "supabase_user_id": row["u_sub"],
                "email": row["u_email"],
                "display_name": row["u_display_name"],
                "status": row["u_status"],
                "created_at": row["u_created_at"],
                "updated_at": row["u_updated_at"],
                "last_login_at": row["u_last_login_at"],
            }

            if row["a_id"]:
                account = {
                    "id": row["a_id"],
                    "sector": row["a_sector"],
                    "custom_sector": row["a_custom_sector"],
                    "church_state": row["a_church_state"],
                    "region": row["a_region"],
                    "old_group": row["a_old_group"],
                    "group_name": row["a_group_name"],
                    "district": row["a_district"],
                    "terminal_level": row["a_terminal_level"],
                    "onboarding_step": row["a_onboarding_step"],
                    "onboarding_completed_at": row["a_onboarding_completed_at"],
                    "status": row["a_status"],
                    "created_at": row["a_created_at"],
                    "updated_at": row["a_updated_at"],
                }
                account["account_name"] = derive_account_name(account)
                account["display_name"] = account["account_name"]
                role = row["m_role"] or "owner"
            else:
                account = None
                role = None

            return user, account, role

    async def update_last_login(self, user_id: str) -> None:
        """Throttled update of last_login_at for an existing user."""
        now = utc_now_iso()
        async with get_db_connection() as conn:
            await conn.execute(
                "UPDATE app_users SET last_login_at = ?, updated_at = ? WHERE id = ?",
                (now, now, user_id),
            )
            await conn.commit()

    async def create_or_update_user(self, supabase_user_id: str, email: str) -> Dict[str, Any]:
        now = utc_now_iso()
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT id, supabase_user_id, email, display_name, status, created_at, updated_at, last_login_at FROM app_users WHERE supabase_user_id = ?",
                (supabase_user_id,)
            )
            row = await cursor.fetchone()
            if row:
                user_id = row["id"]
                await conn.execute(
                    "UPDATE app_users SET email = ?, last_login_at = ?, updated_at = ? WHERE id = ?",
                    (email.strip().lower(), now, now, user_id)
                )
                await conn.commit()
                cursor = await conn.execute("SELECT id, supabase_user_id, email, display_name, status, created_at, updated_at, last_login_at FROM app_users WHERE id = ?", (user_id,))
                return dict(await cursor.fetchone())
            else:
                user_id = f"usr_{uuid.uuid4().hex[:16]}"
                await conn.execute(
                    """
                    INSERT INTO app_users (id, supabase_user_id, email, display_name, status, created_at, updated_at, last_login_at)
                    VALUES (?, ?, ?, NULL, 'active', ?, ?, ?)
                    """,
                    (user_id, supabase_user_id, email.strip().lower(), now, now, now)
                )
                await conn.commit()
                return {
                    "id": user_id,
                    "supabase_user_id": supabase_user_id,
                    "email": email.strip().lower(),
                    "display_name": None,
                    "status": "active",
                    "created_at": now,
                    "updated_at": now,
                    "last_login_at": now,
                }

    async def update_user_display_name(self, user_id: str, display_name: Optional[str]) -> Optional[Dict[str, Any]]:
        now = utc_now_iso()
        cleaned = display_name.strip() if display_name and display_name.strip() else None
        async with get_db_connection() as conn:
            await conn.execute(
                "UPDATE app_users SET display_name = ?, updated_at = ? WHERE id = ?",
                (cleaned, now, user_id)
            )
            await conn.commit()
            cursor = await conn.execute(
                "SELECT id, supabase_user_id, email, display_name, status, created_at, updated_at, last_login_at FROM app_users WHERE id = ?",
                (user_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_user_account(self, user_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Returns (account_dict, membership_role) or (None, None)."""
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                """
                SELECT a.id, a.sector, a.custom_sector, a.church_state, a.region,
                       a.old_group, a.group_name, a.district, a.terminal_level,
                       a.onboarding_step, a.onboarding_completed_at, a.status,
                       a.created_at, a.updated_at, m.role
                FROM account_memberships m
                JOIN accounts a ON m.account_id = a.id
                WHERE m.user_id = ? AND a.status = 'active'
                ORDER BY a.created_at ASC
                """,
                (user_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return None, None
            d = dict(row)
            role = d.pop("role", "owner")
            d["account_name"] = derive_account_name(d)
            d["display_name"] = d["account_name"]
            return d, role

    async def get_account_by_id(self, account_id: str) -> Optional[Dict[str, Any]]:
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT * FROM accounts WHERE id = ?",
                (account_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            d = dict(row)
            d["account_name"] = derive_account_name(d)
            d["display_name"] = d["account_name"]
            return d

    async def create_draft_account(self, user_id: str, sector: str = "Adult", church_state: str = "", terminal_level: str = "state_headquarters") -> Dict[str, Any]:
        """Creates an initial draft account for onboarding and links user as owner."""
        now = utc_now_iso()
        account_id = f"acc_{uuid.uuid4().hex[:16]}"
        membership_id = f"mem_{uuid.uuid4().hex[:16]}"

        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO accounts (
                    id, sector, custom_sector, church_state, region, old_group,
                    group_name, district, terminal_level, onboarding_step,
                    onboarding_completed_at, status, created_at, updated_at
                ) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, 1, NULL, 'active', ?, ?)
                """,
                (account_id, sector, church_state, terminal_level, now, now)
            )
            await conn.execute(
                """
                INSERT INTO account_memberships (id, account_id, user_id, role, created_at)
                VALUES (?, ?, ?, 'owner', ?)
                """,
                (membership_id, account_id, user_id, now)
            )
            await conn.commit()

        acct = await self.get_account_by_id(account_id)
        return acct

    async def update_account_progress(self, account_id: str, data: Dict[str, Any], step: int) -> Dict[str, Any]:
        """Progressive save of onboarding step with Section 20 hierarchy truncation."""
        terminal = data.get("terminal_level") or "state_headquarters"
        cleaned = clean_hierarchy_for_terminal_level(data, terminal)
        now = utc_now_iso()

        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE accounts SET
                    sector = ?,
                    custom_sector = ?,
                    church_state = ?,
                    region = ?,
                    old_group = ?,
                    group_name = ?,
                    district = ?,
                    terminal_level = ?,
                    onboarding_step = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    cleaned.get("sector") or "Adult",
                    cleaned.get("custom_sector"),
                    cleaned.get("church_state") or "",
                    cleaned.get("region"),
                    cleaned.get("old_group"),
                    cleaned.get("group_name"),
                    cleaned.get("district"),
                    cleaned.get("terminal_level") or "state_headquarters",
                    step,
                    now,
                    account_id
                )
            )
            await conn.commit()

        return await self.get_account_by_id(account_id)

    async def complete_account_onboarding(self, account_id: str, final_hierarchy: Dict[str, Any]) -> Dict[str, Any]:
        """Completes first-time onboarding atomically."""
        terminal = final_hierarchy.get("terminal_level") or "state_headquarters"
        cleaned = clean_hierarchy_for_terminal_level(final_hierarchy, terminal)
        now = utc_now_iso()

        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE accounts SET
                    sector = ?,
                    custom_sector = ?,
                    church_state = ?,
                    region = ?,
                    old_group = ?,
                    group_name = ?,
                    district = ?,
                    terminal_level = ?,
                    onboarding_completed_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    cleaned.get("sector") or "Adult",
                    cleaned.get("custom_sector"),
                    cleaned.get("church_state") or "",
                    cleaned.get("region"),
                    cleaned.get("old_group"),
                    cleaned.get("group_name"),
                    cleaned.get("district"),
                    cleaned.get("terminal_level") or "state_headquarters",
                    now,
                    now,
                    account_id
                )
            )
            await conn.commit()

        return await self.get_account_by_id(account_id)

    async def update_account_hierarchy_atomic(self, account_id: str, final_hierarchy: Dict[str, Any]) -> Dict[str, Any]:
        """
        Replay Onboarding atomic finish.
        Replaces live church profile without touching sessions, recordings, or reports.
        """
        terminal = final_hierarchy.get("terminal_level") or "state_headquarters"
        cleaned = clean_hierarchy_for_terminal_level(final_hierarchy, terminal)
        now = utc_now_iso()

        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE accounts SET
                    sector = ?,
                    custom_sector = ?,
                    church_state = ?,
                    region = ?,
                    old_group = ?,
                    group_name = ?,
                    district = ?,
                    terminal_level = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    cleaned.get("sector") or "Adult",
                    cleaned.get("custom_sector"),
                    cleaned.get("church_state") or "",
                    cleaned.get("region"),
                    cleaned.get("old_group"),
                    cleaned.get("group_name"),
                    cleaned.get("district"),
                    cleaned.get("terminal_level") or "state_headquarters",
                    now,
                    account_id
                )
            )
            await conn.commit()

        return await self.get_account_by_id(account_id)

    async def assign_account_owner(self, email: str, account_id: str = LEGACY_DEFAULT_ACCOUNT_ID) -> Dict[str, Any]:
        """Safe one-time admin command to assign owner of legacy or specified account."""
        user = await self.get_user_by_email(email)
        if not user:
            raise ValueError(f"No app_user found with email '{email}'. The user must sign up first.")

        acct = await self.get_account_by_id(account_id)
        if not acct:
            raise ValueError(f"Account '{account_id}' does not exist.")

        now = utc_now_iso()
        async with get_db_connection() as conn:
            # Check existing membership
            cursor = await conn.execute(
                "SELECT id, account_id, role FROM account_memberships WHERE user_id = ?",
                (user["id"],)
            )
            existing = await cursor.fetchall()
            already_owner = any(r["account_id"] == account_id for r in existing)
            if not already_owner:
                # Remove placeholder draft accounts if any
                for r in existing:
                    old_acc_id = r["account_id"]
                    if old_acc_id != account_id and old_acc_id != LEGACY_DEFAULT_ACCOUNT_ID:
                        # Check if old account has any real sessions
                        s_cursor = await conn.execute("SELECT COUNT(*) FROM sessions WHERE account_id = ?", (old_acc_id,))
                        cnt_row = await s_cursor.fetchone()
                        cnt = cnt_row[0] if cnt_row else 0
                        if cnt == 0:
                            await conn.execute("DELETE FROM account_memberships WHERE id = ?", (r["id"],))
                            await conn.execute("DELETE FROM accounts WHERE id = ?", (old_acc_id,))

                mem_id = f"mem_{uuid.uuid4().hex[:16]}"
                await conn.execute(
                    "INSERT INTO account_memberships (id, account_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
                    (mem_id, account_id, user["id"], now)
                )
                await conn.commit()

        updated_account, role = await self.get_user_account(user["id"])
        return {
            "user": user,
            "account": updated_account,
            "role": role,
            "message": f"Successfully assigned user {email} as owner of account '{account_id}' ({updated_account.get('account_name')})."
        }

    async def get_account_setting(self, account_id: str, key: str, default: Optional[str] = None) -> Optional[str]:
        async with get_db_connection() as conn:
            cursor = await conn.execute(
                "SELECT setting_value FROM account_settings WHERE account_id = ? AND setting_key = ?",
                (account_id, key)
            )
            row = await cursor.fetchone()
            if row:
                return row[0]
            # Fallback to global setting if account setting is not set
            cursor = await conn.execute(
                "SELECT [value] FROM report_processing_settings WHERE [key] = ?",
                (key,)
            )
            row = await cursor.fetchone()
            if row:
                return row[0]
            return default

    async def set_account_setting(self, account_id: str, key: str, value: str):
        now = utc_now_iso()
        async with get_db_connection() as conn:
            # Upsert into account_settings
            cursor = await conn.execute(
                "SELECT setting_key FROM account_settings WHERE account_id = ? AND setting_key = ?",
                (account_id, key)
            )
            if await cursor.fetchone():
                await conn.execute(
                    "UPDATE account_settings SET setting_value = ?, updated_at = ? WHERE account_id = ? AND setting_key = ?",
                    (value, now, account_id, key)
                )
            else:
                await conn.execute(
                    "INSERT INTO account_settings (account_id, setting_key, setting_value, updated_at) VALUES (?, ?, ?, ?)",
                    (account_id, key, value, now)
                )
            await conn.commit()


account_repo = AccountRepository()
