"""Queue worker: claims pending nisar_granules rows and processes them.

Claiming uses SELECT ... FOR UPDATE SKIP LOCKED inside a single UPDATE so
concurrent workers never block or double-claim (ingestion HTTP happens HERE,
in Python — never inside database procedures).

Offline resilience: when live Earthdata access is unavailable the granule is
marked 'failed' with a clear message and the seeded simulated anomalies stay
authoritative. The worker never crashes the demo.

Usage:
    python -m backend.worker --once   # process at most one granule, then exit
    python -m backend.worker          # poll loop
"""

from __future__ import annotations

import argparse
import logging
import time

from psycopg.rows import dict_row

from backend import db
from backend.config import settings
from backend.nisar_slicer import SlicerOffline, slice_nisar_gcov_bbox

log = logging.getLogger("dwts.worker")

CLAIM_SQL = """
UPDATE nisar_granules
SET status = 'processing'
WHERE id IN (
    SELECT id FROM nisar_granules
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING id, granule_id, product_type, s3_url,
          ST_XMin(footprint) AS min_lon, ST_YMin(footprint) AS min_lat,
          ST_XMax(footprint) AS max_lon, ST_YMax(footprint) AS max_lat;
"""


def claim_next_granule(conn) -> dict | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(CLAIM_SQL)
        return cur.fetchone()


def _finish(conn, granule_pk, status: str, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE nisar_granules SET status = %s, error_message = %s WHERE id = %s",
            (status, error, granule_pk),
        )


def process_one() -> bool:
    """Claim and process at most one granule. Returns True if one was claimed."""
    db.ensure_open()
    with db.pool.connection() as conn:
        granule = claim_next_granule(conn)
        if granule is None:
            return False
        gid = granule["granule_id"]
        log.info("claimed granule %s", gid)
        try:
            if not granule["s3_url"]:
                raise SlicerOffline("granule has no source URL")
            bbox = (
                granule["min_lon"], granule["min_lat"],
                granule["max_lon"], granule["max_lat"],
            )
            result = slice_nisar_gcov_bbox(granule["s3_url"], bbox)
            # A single slice yields current backscatter; real change detection
            # needs a co-registered 'before' slice (see nisar_slicer notes).
            log.info(
                "sliced %s: mean %.2f dB over %d pixels",
                gid, result.mean_db, result.valid_pixels,
            )
            _finish(conn, granule["id"], "complete")
        except SlicerOffline as exc:
            msg = (
                f"offline fallback: {exc}. Seeded simulated anomalies remain "
                "authoritative; no live data was ingested."
            )
            log.warning("%s: %s", gid, msg)
            _finish(conn, granule["id"], "failed", msg)
        except Exception as exc:  # defensive: never leave a row stuck
            log.exception("granule %s failed", gid)
            _finish(conn, granule["id"], "failed", str(exc)[:500])
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="NISAR granule queue worker")
    parser.add_argument("--once", action="store_true", help="process one and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if args.once:
        claimed = process_one()
        log.info("claimed=%s", claimed)
        return
    log.info("worker polling every %.0fs", settings.worker_poll_seconds)
    while True:
        try:
            if not process_one():
                time.sleep(settings.worker_poll_seconds)
        except KeyboardInterrupt:
            break
        except Exception:
            log.exception("worker loop error; backing off")
            time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
