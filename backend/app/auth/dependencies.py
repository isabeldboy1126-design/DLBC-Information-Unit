"""
FastAPI dependencies for token verification and account authorization.
"""

import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, Header, HTTPException, Query, Request, status

from app.auth.auth_context import AuthContext
from app.auth.token_verifier import token_verifier
from app.database.account_repo import account_repo, DEMO_ACCOUNT_ID


async def get_auth_context(
    request: Request,
    authorization: Optional[str] = Header(None),
    token_param: Optional[str] = Query(None, alias="token"),
    x_dlbc_demo: Optional[str] = Header(None, alias="X-DLBC-Demo"),
    x_dlbc_visitor_id: Optional[str] = Header(None, alias="X-DLBC-Visitor-Id"),
    x_dlbc_device_uid: Optional[str] = Header(None, alias="X-DLBC-Device-Uid"),
) -> AuthContext:
    """
    Extracts and validates Supabase Bearer token, provisions/updates user record,
    and resolves the user's primary church account.
    Supports isolated per-visitor demo mode via X-DLBC-Demo header and visitor identifiers.
    """
    # Check for demo mode header (available in local dev and production for public demo account)
    demo_header_val = (x_dlbc_demo or request.headers.get("x-dlbc-demo") or "").strip()
    if demo_header_val == "1":
        legacy_acct = await account_repo.get_account_by_id(account_repo.LEGACY_DEFAULT_ACCOUNT_ID)
        return AuthContext(
            user_id="demo_user",
            supabase_user_id="demo_sub",
            email="demo@dlbc.org",
            account_id=account_repo.LEGACY_DEFAULT_ACCOUNT_ID,
            account=legacy_acct,
            is_onboarded=True,
            role="owner",
            display_name="Demo User",
            is_demo=True,
        )

    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ", 1)[1].strip()
    elif token_param:
        raw_token = token_param.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = raw_token
    try:
        payload = token_verifier.verify_token(token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    email = payload.get("email") or f"{sub}@dlbc.org"
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims: sub missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fast path: Read-only single-query lookup for existing user and active account.
    # Eliminates row/table lock contention on Azure SQL during frequent polling.
    resolved = await account_repo.get_user_and_account_by_supabase_id(sub)
    if resolved:
        user, account, role = resolved

        # Throttled login timestamp update: only update if last_login_at is missing or older than 6 hours
        # and do not run on routine polling endpoints (/status, /ai-status).
        path = request.url.path if request else ""
        is_polling = path.endswith("/status") or path.endswith("/ai-status")
        if not is_polling:
            now_dt = datetime.now(timezone.utc)
            last_login_str = user.get("last_login_at")
            should_update_login = False
            if not last_login_str:
                should_update_login = True
            else:
                try:
                    last_login_dt = datetime.fromisoformat(last_login_str.replace("Z", "+00:00"))
                    if (now_dt - last_login_dt).total_seconds() > 21600:  # 6 hours
                        should_update_login = True
                except Exception:
                    pass

            if should_update_login:
                try:
                    await account_repo.update_last_login(user["id"])
                except Exception:
                    # Never let login timestamp failure fail the request
                    pass
    else:
        # Just-in-time provision new user on their first visit
        user = await account_repo.create_or_update_user(sub, email)
        account, role = await account_repo.get_user_account(user["id"])

    is_onboarded = bool(account and account.get("onboarding_completed_at"))

    return AuthContext(
        user_id=user["id"],
        supabase_user_id=sub,
        email=user["email"],
        account_id=account["id"] if account else None,
        account=account,
        is_onboarded=is_onboarded,
        role=role or "owner",
        display_name=user.get("display_name"),
    )


async def require_auth(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    """Requires valid authenticated user (onboarding may be in progress)."""
    return auth


async def require_account(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    """Requires valid authenticated user with completed onboarding."""
    if not auth.account_id or not auth.is_onboarded:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Onboarding required before accessing church resources",
        )
    return auth


async def get_optional_account(
    request: Request,
    authorization: Optional[str] = Header(None),
    token_param: Optional[str] = Query(None, alias="token"),
    x_dlbc_demo: Optional[str] = Header(None, alias="X-DLBC-Demo"),
    x_dlbc_visitor_id: Optional[str] = Header(None, alias="X-DLBC-Visitor-Id"),
    x_dlbc_device_uid: Optional[str] = Header(None, alias="X-DLBC-Device-Uid"),
) -> Optional[AuthContext]:
    """Resolves AuthContext if authorization is present, otherwise returns None without error."""
    try:
        return await get_auth_context(
            request,
            authorization,
            token_param,
            x_dlbc_demo,
            x_dlbc_visitor_id,
            x_dlbc_device_uid,
        )
    except HTTPException:
        return None
