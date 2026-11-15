"""FastAPI read layer: GeoJSON anomalies + voice pinpoint briefings.

Serves seeded simulated anomalies and any live worker-produced rows from
PostGIS. data_mode is always explicit; simulated data is never presented as
a live observation. CORS is restricted to the gods-eye-view dev origin.

Run: uvicorn backend.api_server:app --port 8077
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend import db
from backend.config import settings

HAZARD_TYPES = {
    "SOIL_MOISTURE_DEFICIT", "SUBSURFACE_SATURATION", "SLOPE_SUBSIDENCE",
    "FLOOD_INUNDATION", "WETLAND_LOSS", "WILDFIRE_BURN_SCAR",
    "SEISMIC_DEFORMATION", "GLACIER_DISPLACEMENT",
}
SEVERITIES = {"LOW", "MODERATE", "HIGH", "CRITICAL"}
MAX_FEATURES = 500


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.pool.open(wait=False)
    yield
    db.pool.close()


app = FastAPI(title="Dancing with the SARS — NISAR API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _anomaly_feature(row: dict) -> dict:
    """GeoJSON Feature from a DB row (geojson key holds the geometry)."""
    props = {k: v for k, v in row.items() if k != "geojson"}
    for key, value in props.items():
        if hasattr(value, "isoformat"):
            props[key] = value.isoformat()
        elif value is not None and type(value).__name__ == "Decimal":
            props[key] = float(value)
        elif hasattr(value, "hex") and key == "id":
            props[key] = str(value)
    props["id"] = str(props.get("id", ""))
    return {"type": "Feature", "geometry": row["geojson"], "properties": props}


@app.get("/api/health")
def health() -> dict:
    row = db.query_one(
        "SELECT PostGIS_Version() AS postgis, "
        "(SELECT COUNT(*) FROM surface_change_anomalies) AS anomalies, "
        "(SELECT COUNT(*) FROM nisar_granules) AS granules"
    )
    return {
        "status": "ok",
        "postgis_version": row["postgis"],
        "anomaly_count": row["anomalies"],
        "granule_count": row["granules"],
    }


@app.get("/api/nisar/anomalies")
def anomalies(
    hazard_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
) -> dict:
    if hazard_type is not None and hazard_type not in HAZARD_TYPES:
        raise HTTPException(422, f"hazard_type must be one of {sorted(HAZARD_TYPES)}")
    if severity is not None and severity not in SEVERITIES:
        raise HTTPException(422, f"severity must be one of {sorted(SEVERITIES)}")

    rows = db.query_all(
        """
        SELECT id, granule_id, region_name, hazard_type, severity, data_mode,
               mean_backscatter_delta_db, vertical_displacement_mm,
               coherence_score, soil_saturation_pct, affected_structures_count,
               infrastructure_corridor, impact_summary, acquisition_date,
               ST_AsGeoJSON(geom)::jsonb AS geojson
        FROM surface_change_anomalies
        WHERE (%(hazard)s::text IS NULL OR hazard_type = %(hazard)s)
          AND (%(severity)s::text IS NULL OR severity = %(severity)s)
        ORDER BY acquisition_date DESC
        LIMIT %(lim)s
        """,
        {"hazard": hazard_type, "severity": severity, "lim": MAX_FEATURES},
    )
    features = [_anomaly_feature(r) for r in rows]
    modes = {f["properties"]["data_mode"] for f in features}
    return {
        "type": "FeatureCollection",
        "data_mode": "live" if modes == {"live"} else "simulated",
        "features": features,
    }


def _voice_briefing(features: list[dict], radius_km: float, simulated: bool) -> str:
    if not features:
        return (
            f"No NISAR surface-change anomalies within {radius_km:g} kilometers "
            "of the scan point."
        )
    top = features[0]["properties"]
    hazard = top["hazard_type"].replace("_", " ").lower()
    dist_km = float(top["distance_meters"]) / 1000.0
    opening = (
        "Simulated demonstration data: " if simulated else "Live NISAR data: "
    )
    lines = [
        f"{opening}{len(features)} radar anomal"
        f"{'y' if len(features) == 1 else 'ies'} within {radius_km:g} kilometers.",
        f"Most urgent: {top['region_name']} — {hazard}, severity "
        f"{top['severity']}, {dist_km:.1f} kilometers from the scan point.",
        f"L-band telemetry: backscatter delta "
        f"{float(top['mean_backscatter_delta_db']):+.1f} dB, line-of-sight "
        f"displacement {float(top['vertical_displacement_mm']):.1f} millimeters, "
        f"soil saturation {float(top['soil_saturation_pct']):.1f} percent.",
    ]
    structures = int(top["affected_structures_count"])
    if structures:
        corridor = top.get("infrastructure_corridor") or "the local corridor"
        lines.append(
            f"{structures} structures lie inside the impact polygon along {corridor}."
        )
    return " ".join(lines)


@app.get("/api/nisar/pinpoint")
def pinpoint(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=25.0, gt=0),
) -> dict:
    radius_km = min(max(radius_km, 1.0), 500.0)
    rows = db.query_all(
        "SELECT * FROM fn_pinpoint_nisar_anomalies(%s, %s, %s)",
        (lat, lon, radius_km * 1000.0),
    )
    features = []
    for r in rows:
        row = {k.removeprefix("out_"): v for k, v in r.items()}
        features.append(_anomaly_feature(row))
    modes = {f["properties"]["data_mode"] for f in features}
    simulated = modes != {"live"}
    granule_ids = sorted(
        {f["properties"]["granule_id"] for f in features if f["properties"].get("granule_id")}
    )
    return {
        "data_mode": "live" if not simulated else "simulated",
        "features": features,
        "voice_briefing": _voice_briefing(features, radius_km, simulated),
        "provenance": {
            "source": (
                "Deterministic seeded PostGIS fixtures (demonstration)"
                if simulated else "NISAR L2 granules processed by queue worker"
            ),
            "granule_ids": granule_ids,
            "algorithm": "deterministic_fixture" if simulated else "gcov_delta_db_v1",
            "query": {"lat": lat, "lon": lon, "radius_km": radius_km},
            "limitations": (
                "Simulated values are fixtures, not measured NISAR observations. "
                "Displacement is relative line-of-sight; dB deltas assume "
                "co-registered GCOV pairs."
            ),
        },
    }
