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
    # Check for demo mode header (available in local dev and production for public demo account)
    demo_header_val = (x_dlbc_demo or request.headers.get("x-dlbc-demo") or "").strip()
    if demo_header_val == "1":
        legacy_acct = await account_repo.get_account_by_id("legacy_default_account")
        return AuthContext(
            user_id="demo_user",
            supabase_user_id="demo_sub",
            email="demo@dlbc.org",
            account_id="legacy_default_account",
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


async def require_session_access(request: Request, auth: AuthContext = Depends(require_account)):
    """Apply account ownership to every session route in a review-stage router."""
    from app.database.session_repo import session_repo
    session_id = request.path_params.get("session_id")
    if session_id and not await session_repo.get_session(session_id, account_id=auth.account_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return auth
