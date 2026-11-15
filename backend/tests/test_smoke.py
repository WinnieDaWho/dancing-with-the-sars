"""Smoke tests: SQL cast types, GeoJSON schema, pinpoint endpoint contract.

Skips cleanly when the PostGIS container is down (CI without Docker, etc.).
"""

from __future__ import annotations

import math

import pytest

from backend import db

BC_LAT, BC_LON = 49.3858, -121.4419
SK_LAT, SK_LON = 50.4547, -105.5349


def _db_up() -> bool:
    try:
        db.query_one("SELECT 1 AS ok")
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _db_up(), reason="PostGIS not reachable (docker compose up -d)"
)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from backend.api_server import app

    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# SQL layer
# ---------------------------------------------------------------------------

def test_pinpoint_fn_cast_types():
    row = db.query_one(
        """
        SELECT pg_typeof(out_distance_meters)::text AS dist,
               pg_typeof(out_urgency_score)::text  AS urg,
               pg_typeof(out_geojson)::text        AS gj
        FROM fn_pinpoint_nisar_anomalies(%s, %s, 25000) LIMIT 1
        """,
        (BC_LAT, BC_LON),
    )
    assert row is not None, "BC seed anomaly missing"
    assert row["dist"] == "numeric"
    assert row["urg"] == "numeric"
    assert row["gj"] == "jsonb"


def test_pinpoint_fn_ordering_and_null_guard():
    rows = db.query_all(
        "SELECT out_urgency_score, out_distance_meters "
        "FROM fn_pinpoint_nisar_anomalies(%s, %s, 50000)",
        (SK_LAT, SK_LON),
    )
    assert len(rows) >= 2, "expected both Saskatchewan farm anomalies"
    scores = [float(r["out_urgency_score"]) for r in rows]
    assert scores == sorted(scores, reverse=True)
    assert all(math.isfinite(s) and s >= 0 for s in scores)


def test_geography_index_exists():
    row = db.query_one(
        "SELECT COUNT(*) AS n FROM pg_indexes "
        "WHERE indexname = 'idx_anomalies_geog'"
    )
    assert row["n"] == 1


# ---------------------------------------------------------------------------
# API layer
# ---------------------------------------------------------------------------

def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["anomaly_count"] >= 5


def test_anomalies_geojson_schema(client):
    body = client.get("/api/nisar/anomalies").json()
    assert body["type"] == "FeatureCollection"
    assert body["data_mode"] in {"simulated", "live"}
    assert len(body["features"]) >= 5
    for feat in body["features"]:
        assert feat["type"] == "Feature"
        assert feat["geometry"]["type"] == "Polygon"
        ring = feat["geometry"]["coordinates"][0]
        assert len(ring) >= 4 and ring[0] == ring[-1]
        assert feat["properties"]["data_mode"] in {"simulated", "live"}
        assert feat["properties"]["hazard_type"]


def test_anomalies_filter_validation(client):
    assert client.get("/api/nisar/anomalies?hazard_type=BOGUS").status_code == 422
    body = client.get("/api/nisar/anomalies?severity=CRITICAL").json()
    assert all(f["properties"]["severity"] == "CRITICAL" for f in body["features"])
    assert len(body["features"]) >= 1


def test_pinpoint_contract(client):
    body = client.get(
        f"/api/nisar/pinpoint?lat={BC_LAT}&lon={BC_LON}&radius_km=25"
    ).json()
    for key in ("data_mode", "features", "voice_briefing", "provenance"):
        assert key in body
    assert body["data_mode"] == "simulated"
    assert body["voice_briefing"].startswith("Simulated demonstration data:")
    top = body["features"][0]["properties"]
    assert top["severity"] == "CRITICAL"
    assert isinstance(top["distance_meters"], float)
    assert body["provenance"]["algorithm"] == "deterministic_fixture"
    assert body["provenance"]["limitations"]


def test_pinpoint_validation(client):
    assert client.get("/api/nisar/pinpoint?lat=99&lon=0").status_code == 422
    assert client.get("/api/nisar/pinpoint?lat=0&lon=-999").status_code == 422
    body = client.get("/api/nisar/pinpoint?lat=0&lon=0&radius_km=25").json()
    assert body["features"] == []
    assert "No NISAR surface-change anomalies" in body["voice_briefing"]
