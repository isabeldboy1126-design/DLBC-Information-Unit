"""
Database Connection Manager supporting SQLite (local/test) and Azure SQL / Cloud Databases (production).

Architecture:
- Development & Testing: Native SQLite via aiosqlite (storage/app.db or DLBC_TEST_DB_PATH).
- Production: When DATABASE_URL is set (e.g. mssql+aioodbc://... for Azure SQL Database),
  connects via async SQLAlchemy engine and adapts cursor/row access seamlessly without changing
  any repository queries, workflow states, or data structures.
"""

import os
import re
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Sequence, Union

from app.config import DEFAULT_DB_PATH

# Default database path (local development)
DB_PATH = os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)

# Global async SQLAlchemy engine cache (only initialized when DATABASE_URL is present)
_async_engine = None


class AdaptedRow:
    """Provides dictionary-like and index-based access matching aiosqlite.Row."""

    def __init__(self, mapping: Dict[str, Any], values: Sequence[Any]):
        self._mapping = dict(mapping)
        self._values = list(values)

    def __getitem__(self, key: Union[str, int]) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._mapping[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._mapping.get(key, default)

    def keys(self):
        return self._mapping.keys()

    def values(self):
        return self._mapping.values()

    def items(self):
        return self._mapping.items()

    def __iter__(self):
        return iter(self._mapping)

    def __len__(self):
        return len(self._mapping)

    def __repr__(self):
        return f"<AdaptedRow {self._mapping}>"


class AsyncCursorAdapter:
    """Wraps SQLAlchemy Result to match the aiosqlite async cursor interface."""

    def __init__(self, result):
        self._result = result

    async def fetchone(self) -> Optional[AdaptedRow]:
        row = self._result.fetchone()
        if row is None:
            return None
        return AdaptedRow(row._mapping, row._data if hasattr(row, "_data") else row)

    async def fetchall(self) -> List[AdaptedRow]:
        rows = self._result.fetchall()
        return [
            AdaptedRow(r._mapping, r._data if hasattr(r, "_data") else r)
            for r in rows
        ]

    @property
    def rowcount(self) -> int:
        return getattr(self._result, "rowcount", -1)

    def __aiter__(self):
        return self

    async def __anext__(self) -> AdaptedRow:
        row = await self.fetchone()
        if row is None:
            raise StopAsyncIteration
        return row

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


class _ExecuteContext:
    """Supports both 'cursor = await conn.execute(...)' and 'async with conn.execute(...) as cursor:'."""

    def __init__(self, conn_adapter: "AsyncConnectionAdapter", sql: str, params: Optional[Union[Sequence, Dict[str, Any]]] = None):
        self._conn_adapter = conn_adapter
        self._sql = sql
        self._params = params

    def __await__(self):
        return self._execute().__await__()

    async def _execute(self) -> AsyncCursorAdapter:
        stmt, bound_params = self._conn_adapter._convert_query_params(self._sql, self._params)
        res = await self._conn_adapter._conn.execute(stmt, bound_params)
        return AsyncCursorAdapter(res)

    async def __aenter__(self) -> AsyncCursorAdapter:
        return await self._execute()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


class AsyncConnectionAdapter:
    """Wraps SQLAlchemy AsyncConnection to provide an aiosqlite-compatible API."""

    def __init__(self, conn):
        self._conn = conn

    def _convert_query_params(self, sql: str, params: Optional[Union[Sequence, Dict[str, Any]]]):
        """Converts ? positional placeholders to :p_0, :p_1 for SQLAlchemy text() and adapts DDL for Azure SQL."""
        import sqlalchemy

        converted_sql = sql
        # Adapt SQLite ALTER TABLE ... ADD COLUMN ... syntax for T-SQL (MSSQL uses ALTER TABLE ... ADD ...)
        if "ADD COLUMN" in converted_sql.upper():
            converted_sql = re.sub(r"\bADD\s+COLUMN\b", "ADD", converted_sql, flags=re.IGNORECASE)
            converted_sql = re.sub(r"\bTEXT\b", "NVARCHAR(MAX)", converted_sql, flags=re.IGNORECASE)
            converted_sql = re.sub(r"\bINTEGER\b", "INT", converted_sql, flags=re.IGNORECASE)

        # Strip LIMIT for T-SQL queries (top row is fetched by fetchone() or TOP)
        if re.search(r"\bLIMIT\s+\d+\b", converted_sql, flags=re.IGNORECASE):
            converted_sql = re.sub(r"\s+LIMIT\s+\d+\s*$", "", converted_sql, flags=re.IGNORECASE)
            converted_sql = re.sub(r"\bLIMIT\s+\d+\b", "", converted_sql, flags=re.IGNORECASE)

        if params is None:
            return sqlalchemy.text(converted_sql), {}

        if isinstance(params, (list, tuple)):
            param_dict = {}
            count = 0

            def _replace_placeholder(match):
                nonlocal count
                p_name = f"p_{count}"
                param_dict[p_name] = params[count]
                count += 1
                return f":{p_name}"

            converted_sql = re.sub(r"\?", _replace_placeholder, converted_sql)
            return sqlalchemy.text(converted_sql), param_dict

        if isinstance(params, dict):
            return sqlalchemy.text(converted_sql), params

        return sqlalchemy.text(converted_sql), params

    def execute(self, sql: str, params: Optional[Union[Sequence, Dict[str, Any]]] = None):
        return _ExecuteContext(self, sql, params)

    async def executescript(self, script: str):
        from app.database.models import INIT_SCHEMA_MSSQL
        if "CREATE TABLE IF NOT EXISTS" in script:
            script_to_run = INIT_SCHEMA_MSSQL
        else:
            script_to_run = script

        statements = [s.strip() for s in script_to_run.split(";") if s.strip()]
        for stmt in statements:
            await self.execute(stmt)

    async def commit(self):
        await self._conn.commit()

    async def rollback(self):
        await self._conn.rollback()


def _get_db_path() -> str:
    """Returns test database path if set, otherwise the default production/dev SQLite path."""
    override = os.environ.get("DLBC_TEST_DB_PATH")
    if override:
        return override
    return DB_PATH


def _get_engine():
    global _async_engine
    if _async_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine

        db_url = os.environ.get("DATABASE_URL")
        # Format normalization for async drivers
        if db_url and db_url.startswith("mssql+pyodbc://"):
            db_url = db_url.replace("mssql+pyodbc://", "mssql+aioodbc://")
        elif db_url and db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql+asyncpg://")

        _async_engine = create_async_engine(
            db_url,
            pool_pre_ping=True,
            pool_recycle=300,
        )
    return _async_engine


@asynccontextmanager
async def get_db_connection():
    """
    Asynchronous context manager returning an SQLite connection (local/tests)
    or an Azure SQL / cloud database adapter (when DATABASE_URL is configured).
    """
    # 1. Test isolation: If running unit/integration tests, ALWAYS use local SQLite
    if os.environ.get("DLBC_TEST_DB_PATH"):
        import aiosqlite

        async with aiosqlite.connect(_get_db_path()) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON;")
            await conn.execute("PRAGMA journal_mode = WAL;")
            yield conn
        return

    # 2. Production: If DATABASE_URL is set, connect to Azure SQL / Cloud DB
    db_url = os.environ.get("DATABASE_URL")
    if db_url and not db_url.startswith("sqlite"):
        engine = _get_engine()
        async with engine.connect() as conn:
            yield AsyncConnectionAdapter(conn)
        return

    # 3. Development Default: Native local SQLite
    import aiosqlite

    async with aiosqlite.connect(_get_db_path()) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        await conn.execute("PRAGMA journal_mode = WAL;")
        yield conn
