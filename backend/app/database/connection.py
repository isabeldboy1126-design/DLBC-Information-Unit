"""
SQLite database connection configuration for DLBC Information Unit App (Phase 4).

Uses aiosqlite for asynchronous SQLite access.
The database file is stored in storage/app.db.

TEST ISOLATION
--------------
When the environment variable DLBC_TEST_DB_PATH is set, ALL database
connections in this process will use that path instead of storage/app.db.
This is used exclusively by the pytest test suite via tests/conftest.py.
It must NEVER be set in production or development .env files.

Production and development behavior is completely unchanged when the
variable is absent.
"""

import os
from contextlib import asynccontextmanager
import aiosqlite

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.dirname(APP_DIR)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
STORAGE_DIR = os.path.join(PROJECT_ROOT, "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

# Default production database path. Tests override this via DLBC_TEST_DB_PATH.
DB_PATH = os.path.join(STORAGE_DIR, "app.db")


def _get_db_path() -> str:
    """
    Returns the active database path for this process.

    If DLBC_TEST_DB_PATH is set (only by tests/conftest.py), the test database
    is used. Otherwise the production/development database is used.
    This function is called at connection time so the path can be changed by
    conftest.py before any connections are opened.
    """
    override = os.environ.get("DLBC_TEST_DB_PATH")
    if override:
        return override
    return DB_PATH


@asynccontextmanager
async def get_db_connection():
    """Asynchronous context manager returning an SQLite connection with row_factory set."""
    async with aiosqlite.connect(_get_db_path()) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        await conn.execute("PRAGMA journal_mode = WAL;")
        yield conn
