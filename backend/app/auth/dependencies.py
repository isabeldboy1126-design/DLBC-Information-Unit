"""
FastAPI dependencies for token verification and account authorization.
"""

import os
from typing import Optional
from fastapi import Depends, Header, HTTPException, Query, Request, status

from app.auth.auth_context import AuthContext
from app.auth.token_verifier import token_verifier
from app.database.account_repo import account_repo


async def get_auth_context(
    request: Request,
    authorization: Optional[str] = Header(None),
    token_param: Optional[str] = Query(None, alias="token"),
    x_dlbc_demo: Optional[str] = Header(None, alias="X-DLBC-Demo"),
) -> AuthContext:
    """
    Extracts and validates Supabase Bearer token, provisions/updates user record,
    and resolves the user's primary church account.
    Supports local development demo mode via X-DLBC-Demo header strictly when enabled.
    """
    # Check for explicit local development demo header
    # Must satisfy BOTH: APP_ENV == "development" AND ENABLE_LOCAL_DEMO == "true"
    app_env = os.environ.get("APP_ENV", "").lower()
    enable_local_demo = os.environ.get("ENABLE_LOCAL_DEMO", "").lower() in ("true", "1")
    demo_header_val = (x_dlbc_demo or request.headers.get("x-dlbc-demo") or "").strip()

    if demo_header_val == "1":
        if app_env == "development" and enable_local_demo:
            legacy_acct = await account_repo.get_account_by_id("legacy_default_account")
            return AuthContext(
                user_id="demo_local_user",
                supabase_user_id="demo_local_sub",
                email="demo@local.dlbc",
                account_id="legacy_default_account",
                account=legacy_acct,
                is_onboarded=True,
                role="owner",
                is_demo=True,
            )
        # In production or when ENABLE_LOCAL_DEMO is not active, X-DLBC-Demo has NO privileged effect.
        # It falls through to the standard authentication requirement.

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

    # Just-in-time provision or update the app_user in Azure SQL / SQLite
    user = await account_repo.create_or_update_user(sub, email)

    # Resolve active account and membership
    account, role = await account_repo.get_user_account(user["id"])

    is_onboarded = bool(account and account.get("onboarding_completed_at"))

    return AuthContext(
        user_id=user["id"],
        supabase_user_id=sub,
        email=user["email"],
        account_id=account["id"] if account else None,
        account=account,
        is_onboarded=is_onboarded,
        role=role or "owner"
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
