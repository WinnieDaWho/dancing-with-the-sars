"""Connection pool and query helpers (psycopg 3). Parameterized SQL only."""

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from backend.config import settings

pool = ConnectionPool(
    settings.database_url, min_size=1, max_size=5, open=False, timeout=10
)


def ensure_open() -> None:
    # A pool created with open=False reports closed=True until first open().
    if pool.closed:
        pool.open(wait=True, timeout=10)


def query_all(sql: str, params: tuple = ()) -> list[dict]:
    ensure_open()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query_all(sql, params)
    return rows[0] if rows else None
