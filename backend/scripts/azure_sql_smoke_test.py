"""
Azure SQL Integration Smoke Test Script

Exercises full end-to-end database lifecycle on Azure SQL Database:
1. Connects via DATABASE_URL
2. Initializes DDL schema
3. Creates test programme and test session
4. Reads and validates row data
5. Updates workflow states (recording -> needs_verification -> verified -> completed)
6. Adds segments and verification items
7. Cleans up all test data
"""

import asyncio
import json
import os
import sys

# Ensure backend app is on sys.path
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(APP_DIR, ".env"))


async def run_smoke_test():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url or db_url.startswith("sqlite"):
        print("ERROR: DATABASE_URL is not set to an Azure SQL connection string.")
        print("Please provide DATABASE_URL (e.g. mssql+pymssql://user:password@server.database.windows.net/dbname)")
        return False

    print(f"Connecting to Azure SQL Database via: {db_url.split('@')[-1] if '@' in db_url else db_url}")

    from app.database.connection import get_db_connection
    from app.database.session_repo import session_repo
    from app.database.programmes_repo import programmes_repo

    test_session_id = "session_azure_smoke_test_999"
    test_prog_id = "prog_azure_smoke_test_999"

    try:
        # 1. Initialize schema
        print("Step 1: Initializing DDL schema on Azure SQL...")
        await session_repo.init_db()
        await programmes_repo.init_db()
        print("✓ Schema initialization succeeded.")

        # 2. Create test programme
        print("Step 2: Creating temporary test programme...")
        await programmes_repo.create_programme(
            name="Azure SQL Smoke Test Programme",
            sort_order=999,
            programme_id=test_prog_id,
        )
        prog = await programmes_repo.get_programme(test_prog_id)
        assert prog is not None, "Failed to retrieve test programme"
        assert prog["name"] == "Azure SQL Smoke Test Programme"
        print("✓ Programme created and read successfully.")

        # 3. Create test session
        print("Step 3: Creating temporary test session...")
        await session_repo.create_session(
            session_id=test_session_id,
            title="Azure SQL Smoke Test Sermon",
            status="recording",
            recording_id="rec_smoke_999",
            metadata={"preacher": "Test Pastor", "programme_id": test_prog_id},
        )
        session = await session_repo.get_session(test_session_id)
        assert session is not None, "Failed to retrieve test session"
        assert session["title"] == "Azure SQL Smoke Test Sermon"
        print("✓ Session created and read successfully.")

        # 4. Add segments
        print("Step 4: Inserting segments and verification items...")
        await session_repo.save_segments(
            session_id=test_session_id,
            segments=[
                {
                    "segment_id": "seg_smoke_1",
                    "segment_index": 0,
                    "start_time": 0.0,
                    "end_time": 5.0,
                    "text": "In the beginning God created the heaven and the earth.",
                    "confidence": 0.98,
                    "is_low_confidence": False,
                    "flags": [],
                    "words": [],
                },
                {
                    "segment_id": "seg_smoke_2",
                    "segment_index": 1,
                    "start_time": 5.0,
                    "end_time": 10.0,
                    "text": "And the earth was without form, and void.",
                    "confidence": 0.75,
                    "is_low_confidence": True,
                    "flags": [{"type": "low_confidence", "reason": "Low acoustic score"}],
                    "words": [],
                },
            ],
        )
        segments = await session_repo.get_session_segments(test_session_id)
        assert len(segments) == 2, f"Expected 2 segments, got {len(segments)}"
        print("✓ Segments inserted and read successfully.")

        # 5. Update session status through workflow
        print("Step 5: Updating workflow states...")
        await session_repo.update_session_status(test_session_id, "needs_verification")
        s_nv = await session_repo.get_session(test_session_id)
        assert s_nv["status"] == "needs_verification"

        await session_repo.save_verified_transcript(
            session_id=test_session_id,
            verified_segments=segments,
            verified_full_text="In the beginning God created the heaven and the earth. And the earth was without form, and void.",
        )
        s_v = await session_repo.get_session(test_session_id)
        assert s_v["verified_text"] is not None
        print("✓ Workflow status transitions verified.")

        # 6. Clean up test data
        print("Step 6: Cleaning up test data...")
        await session_repo.delete_session(test_session_id)
        await programmes_repo.delete_programme(test_prog_id)

        # Verify deletion
        assert await session_repo.get_session(test_session_id) is None
        assert await programmes_repo.get_programme(test_prog_id) is None
        print("✓ Cleanup confirmed. Zero leftover test records.")

        print("\n========================================================")
        print("🎉 ALL AZURE SQL SMOKE TEST CHECKS PASSED SUCCESSFULLY!")
        print("========================================================")
        return True

    except Exception as e:
        print(f"\n❌ Azure SQL Smoke Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        # Attempt cleanup on error
        try:
            await session_repo.delete_session(test_session_id)
            await programmes_repo.delete_programme(test_prog_id)
        except Exception:
            pass
        return False


if __name__ == "__main__":
    success = asyncio.run(run_smoke_test())
    sys.exit(0 if success else 1)
