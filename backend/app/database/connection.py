"""
SQLite database connection configuration.

Uses aiosqlite for async SQLite access via FastAPI.
The database file is stored in the local storage directory
and is git-ignored to avoid committing data.

Product-specific tables will be defined in later phases
(Phase 4 — Session Persistence).
"""

import os

# Database file path — defaults to storage/app.db relative to the project root
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./storage/app.db")
