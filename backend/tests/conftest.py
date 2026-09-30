"""
Pytest configuration for DLBC Information Unit App backend tests.

DATABASE ISOLATION STRATEGY
============================
All tests run against a temporary SQLite database file that is completely
isolated from the development database at storage/app.db.

HOW IT WORKS
------------
1. A session-scoped autouse fixture creates a NamedTemporaryFile before any
   test runs.
2. The fixture sets the DLBC_TEST_DB_PATH environment variable to the path of
   that temp file.  app.database.connection._get_db_path() reads this variable
   at connection time, so every database call in every test module is redirected
   to the temp file.
3. After all tests finish the temp file is deleted and the env var is removed.

This approach is correct because:
  - _get_db_path() reads os.environ at call time, not at import time.
  - No monkey-patching of module internals is required.
  - The schema is initialised on the temp file using the same code path as
    production (session_repo.init_db()), so all migrations are exercised.

GUARANTEES
----------
  * Tests NEVER write to storage/app.db.
  * The development database is completely isolated from test runs.
  * Test runs are repeatable (fresh DB file each pytest invocation).
  * Cleanup is automatic.
  * Production and development behavior is completely unchanged when
    DLBC_TEST_DB_PATH is not set.

DO NOT set DLBC_TEST_DB_PATH in production or development .env files.
"""

import asyncio
import os
import tempfile

import pytest


@pytest.fixture(scope="session", autouse=True)
def isolated_test_database():
    """
    Session-scoped fixture that redirects all test DB connections to a
    temporary SQLite file and tears it down when the session finishes.

    Uses scope="session" so only one temp file is created per pytest run
    and all test modules share the same isolated schema.
    """
    # Create a named temp file and close it so aiosqlite can reopen it
    tmp = tempfile.NamedTemporaryFile(
        suffix=".test.db",
        prefix="dlbc_test_",
        delete=False,
    )
    tmp_path = tmp.name
    tmp.close()

    # Tell the connection module to use the temp file
    os.environ["DLBC_TEST_DB_PATH"] = tmp_path

    # Initialise the full schema (all migrations) on the temp database
    async def _init_schema():
        from app.database.account_repo import account_repo
        from app.database.session_repo import session_repo
        # Ensure init_db() runs even if another import already set _initialized
        session_repo._initialized = False
        await account_repo.init_db()
        await session_repo.init_db()

    asyncio.run(_init_schema())

    yield tmp_path   # all tests run here

    # Remove the env var and delete the temp file
    os.environ.pop("DLBC_TEST_DB_PATH", None)
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
