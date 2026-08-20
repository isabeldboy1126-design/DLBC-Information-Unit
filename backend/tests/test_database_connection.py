"""
Unit tests for Dual-Mode Database Connection (SQLite & Azure SQL Adapter)
"""

import pytest
from app.database.connection import get_db_connection, AdaptedRow, AsyncCursorAdapter


@pytest.mark.asyncio
async def test_sqlite_local_connection():
    """Verify local SQLite connections function with proper row factory and pragmas."""
    async with get_db_connection() as conn:
        cursor = await conn.execute("SELECT 1 AS num, 'test' AS name")
        row = await cursor.fetchone()
        assert row is not None
        assert row["num"] == 1
        assert row["name"] == "test"
        assert row[0] == 1
        assert row[1] == "test"


@pytest.mark.asyncio
async def test_adapted_row_interface():
    """Verify AdaptedRow mimics aiosqlite.Row for dictionary and index access."""
    row = AdaptedRow({"id": "sess_1", "status": "completed"}, ["sess_1", "completed"])
    assert row["id"] == "sess_1"
    assert row["status"] == "completed"
    assert row[0] == "sess_1"
    assert row[1] == "completed"
    assert row.get("id") == "sess_1"
    assert row.get("nonexistent", "default") == "default"
    assert dict(row) == {"id": "sess_1", "status": "completed"}
    assert list(row.keys()) == ["id", "status"]
    assert len(row) == 2


@pytest.mark.asyncio
async def test_adapted_cursor_fetchone_and_fetchall():
    """Verify AsyncCursorAdapter fetchone and fetchall operations."""
    class FakeResult:
        def __init__(self, rows):
            self._rows = list(rows)
            self._idx = 0
            self.rowcount = len(rows)

        def fetchone(self):
            if self._idx < len(self._rows):
                r = self._rows[self._idx]
                self._idx += 1
                return r
            return None

        def fetchall(self):
            rem = self._rows[self._idx:]
            self._idx = len(self._rows)
            return rem

    class FakeRow:
        def __init__(self, mapping, data):
            self._mapping = mapping
            self._data = data

    fake_rows = [
        FakeRow({"col1": "a", "col2": 1}, ["a", 1]),
        FakeRow({"col1": "b", "col2": 2}, ["b", 2]),
    ]
    cursor = AsyncCursorAdapter(FakeResult(fake_rows))
    first = await cursor.fetchone()
    assert first["col1"] == "a"
    assert first[1] == 1

    rest = await cursor.fetchall()
    assert len(rest) == 1
    assert rest[0]["col1"] == "b"
