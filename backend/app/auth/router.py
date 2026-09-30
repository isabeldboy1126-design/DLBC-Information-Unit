"""
Authentication & Onboarding API Routes
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.auth_context import AuthContext
from app.auth.dependencies import require_account, require_auth
from app.database.account_repo import account_repo

router = APIRouter(prefix="/api/auth", tags=["auth"])


class OnboardingProgressRequest(BaseModel):
    step: int = 1
    sector: Optional[str] = None
    custom_sector: Optional[str] = None
    church_state: Optional[str] = None
    region: Optional[str] = None
    old_group: Optional[str] = None
    group_name: Optional[str] = None
    district: Optional[str] = None
    terminal_level: Optional[str] = None
    draft: Optional[Dict[str, Any]] = None


class OnboardingCompleteRequest(BaseModel):
    sector: str
    custom_sector: Optional[str] = None
    church_state: str
    region: Optional[str] = None
    old_group: Optional[str] = None
    group_name: Optional[str] = None
    district: Optional[str] = None
    terminal_level: str


class SettingUpdateRequest(BaseModel):
    key: str
    value: str


@router.get("/me")
async def get_me(auth: AuthContext = Depends(require_auth)):
    """Returns authenticated user profile, active church account, and onboarding status."""
    return {
        "user": {
            "id": auth.user_id,
            "supabase_user_id": auth.supabase_user_id,
            "email": auth.email,
        },
        "user_id": auth.user_id,
        "supabase_user_id": auth.supabase_user_id,
        "email": auth.email,
        "account_id": auth.account_id,
        "account": auth.account,
        "is_onboarded": auth.is_onboarded,
        "role": auth.role,
    }


@router.get("/onboarding")
async def get_onboarding_state(auth: AuthContext = Depends(require_auth)):
    """Retrieves saved onboarding draft for progressive resume."""
    account = auth.account
    if not account:
        # Create a fresh draft account for this user
        account = await account_repo.create_draft_account(auth.user_id)

    return {
        "account_id": account["id"],
        "sector": account.get("sector") or "Adult",
        "custom_sector": account.get("custom_sector"),
        "church_state": account.get("church_state") or "",
        "region": account.get("region"),
        "old_group": account.get("old_group"),
        "group_name": account.get("group_name"),
        "district": account.get("district"),
        "terminal_level": account.get("terminal_level") or "state_headquarters",
        "onboarding_step": account.get("onboarding_step") or 1,
        "is_onboarded": bool(account.get("onboarding_completed_at")),
        "account_name": account.get("account_name"),
    }


@router.post("/onboarding/progress")
async def save_onboarding_progress(req: OnboardingProgressRequest, auth: AuthContext = Depends(require_auth)):
    """Progressively saves user's onboarding choices."""
    account_id = auth.account_id
    data = req.model_dump(exclude_unset=True)
    if req.draft:
        data.update(req.draft)
    data.pop("draft", None)

    if not account_id:
        acct = await account_repo.create_draft_account(
            auth.user_id,
            sector=data.get("sector") or "Adult",
            church_state=data.get("church_state") or "",
            terminal_level=data.get("terminal_level") or "state_headquarters",
        )
        account_id = acct["id"]

    updated = await account_repo.update_account_progress(
        account_id,
        data,
        step=req.step,
    )
    return {
        "status": "saved",
        "account": updated,
        "onboarding_step": updated.get("onboarding_step") if updated else req.step,
    }


@router.post("/onboarding/complete")
async def complete_onboarding(req: OnboardingCompleteRequest, auth: AuthContext = Depends(require_auth)):
    """Validates and finalizes first-time onboarding."""
    account_id = auth.account_id
    if not account_id:
        acct = await account_repo.create_draft_account(auth.user_id, sector=req.sector, church_state=req.church_state, terminal_level=req.terminal_level)
        account_id = acct["id"]

    updated = await account_repo.complete_account_onboarding(
        account_id,
        req.model_dump()
    )
    return {
        "status": "completed",
        "account": updated,
        "account_name": updated.get("account_name"),
    }


@router.post("/onboarding/replay-finish")
async def replay_finish(req: OnboardingCompleteRequest, auth: AuthContext = Depends(require_account)):
    """
    Replay Onboarding Finish:
    Atomically updates live church hierarchy without affecting existing sessions,
    recordings, reports, or programmes.
    """
    updated = await account_repo.update_account_hierarchy_atomic(
        auth.account_id,
        req.model_dump()
    )
    return {
        "status": "updated",
        "account": updated,
        "account_name": updated.get("account_name"),
    }


@router.get("/account-settings")
async def get_account_settings(auth: AuthContext = Depends(require_account)):
    """Retrieves account-scoped settings."""
    instruction = await account_repo.get_account_setting(auth.account_id, "instruction")
    auto_process = await account_repo.get_account_setting(auth.account_id, "auto_process_after_verification", "false")
    return {
        "instruction": instruction,
        "auto_process_after_verification": auto_process.lower() in ("true", "1"),
    }


@router.post("/account-settings")
async def set_account_setting(req: SettingUpdateRequest, auth: AuthContext = Depends(require_account)):
    """Saves an account-scoped setting."""
    await account_repo.set_account_setting(auth.account_id, req.key, req.value)
    return {"status": "saved", "key": req.key}
