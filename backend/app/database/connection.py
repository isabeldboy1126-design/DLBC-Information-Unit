"""
SQLite database connection configuration for DLBC Information Unit App (Phase 4).

Uses aiosqlite for asynchronous SQLite access.
The database file is stored in storage/app.db.
"""

import os
from contextlib import asynccontextmanager
import aiosqlite

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.dirname(APP_DIR)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
STORAGE_DIR = os.path.join(PROJECT_ROOT, "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

DB_PATH = os.path.join(STORAGE_DIR, "app.db")


@asynccontextmanager
async def get_db_connection():
    """Asynchronous context manager returning an SQLite connection with row_factory set."""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        await conn.execute("PRAGMA journal_mode = WAL;")
        yield conn
