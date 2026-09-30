"""
Safe One-Time Admin Command to assign a Supabase user as owner of the legacy church account.
Usage:
    python -m app.admin.assign_account_owner --email user@example.com
"""

import argparse
import asyncio
import sys

from app.database.account_repo import account_repo, LEGACY_DEFAULT_ACCOUNT_ID


async def assign_legacy_owner(email: str, account_id: str = LEGACY_DEFAULT_ACCOUNT_ID) -> dict:
    await account_repo.init_db()
    result = await account_repo.assign_account_owner(email.strip().lower(), account_id)
    return {
        "status": "success",
        "account_id": result["account"]["id"],
        "user_email": result["user"]["email"],
        "user_id": result["user"]["id"],
        "role": result["role"],
    }


async def main():
    parser = argparse.ArgumentParser(description="Assign owner to DLBC legacy church account")
    parser.add_argument("--email", required=True, help="Email address of the registered Supabase user")
    parser.add_argument("--account-id", default=LEGACY_DEFAULT_ACCOUNT_ID, help="Account ID to assign (default: legacy_default_account)")

    args = parser.parse_args()
    email = args.email.strip().lower()

    print(f"Assigning owner for account '{args.account_id}' to email: {email}...")

    # Ensure DB schema is initialized
    await account_repo.init_db()

    try:
        result = await account_repo.assign_account_owner(email, args.account_id)
        print("\n" + "=" * 60)
        print("SUCCESS:")
        print(f"  User ID:      {result['user']['id']}")
        print(f"  Email:        {result['user']['email']}")
        print(f"  Account ID:   {result['account']['id']}")
        print(f"  Account Name: {result['account']['account_name']}")
        print(f"  Role:         {result['role']}")
        print("=" * 60)
        print(f"\n{result['message']}")
    except ValueError as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\nUNEXPECTED ERROR: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    asyncio.run(main())
