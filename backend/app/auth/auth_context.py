"""
Authentication Context dataclass representing the verified caller.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class AuthContext:
    user_id: str
    supabase_user_id: str
    email: str
    account_id: Optional[str]
    account: Optional[Dict[str, Any]]
    is_onboarded: bool
    role: str
