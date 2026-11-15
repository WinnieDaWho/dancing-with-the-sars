-- ============================================================================
-- 001_init_nisar_schema.sql — Dancing with the SARS (NASA Space Apps / NISAR)
-- Extensions, tables, constraints, indexes, and PL/pgSQL functions.
-- Clean-room implementation (Apache-2.0); no proprietary code copied.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- nisar_granules — one row per NISAR Level-2 product the worker may process.
-- status lifecycle: pending -> processing -> complete | failed
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nisar_granules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    granule_id       TEXT UNIQUE NOT NULL,
    product_type     TEXT NOT NULL CHECK (product_type IN ('GCOV', 'GUNW')),
    frequency_band   TEXT NOT NULL DEFAULT 'L-Band (24cm)',
    polarization     TEXT NOT NULL DEFAULT 'HHHH/HVHV',
    acquisition_date TIMESTAMPTZ NOT NULL,
    s3_url           TEXT,
    status           TEXT NOT NULL DEFAULT 'complete'
                     CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
    error_message    TEXT,
    footprint        GEOMETRY(Polygon, 4326) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_granules_footprint
    ON nisar_granules USING GIST (footprint);

-- Functional geography index: serves ST_DWithin(footprint::geography, ...)
CREATE INDEX IF NOT EXISTS idx_granules_footprint_geog
    ON nisar_granules USING GIST ((footprint::geography));

-- Worker queue scan: tiny partial index over claimable rows only
CREATE INDEX IF NOT EXISTS idx_granules_pending
    ON nisar_granules (created_at) WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- surface_change_anomalies — polygons of detected/seeded surface change.
-- data_mode: 'simulated' rows are deterministic demo fixtures; 'live' rows
-- come from the worker slicing real GCOV/GUNW granules. A simulated row must
-- never be presented as a live observation (see /api responses).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS surface_change_anomalies (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    granule_id                 TEXT REFERENCES nisar_granules(granule_id) ON DELETE CASCADE,
    region_name                TEXT NOT NULL,
    hazard_type                TEXT NOT NULL CHECK (hazard_type IN (
                                   'SOIL_MOISTURE_DEFICIT', 'SUBSURFACE_SATURATION',
                                   'SLOPE_SUBSIDENCE', 'FLOOD_INUNDATION',
                                   'WETLAND_LOSS', 'WILDFIRE_BURN_SCAR',
                                   'SEISMIC_DEFORMATION', 'GLACIER_DISPLACEMENT')),
    severity                   TEXT NOT NULL CHECK (severity IN
                                   ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    data_mode                  TEXT NOT NULL DEFAULT 'simulated'
                               CHECK (data_mode IN ('simulated', 'live')),
    mean_backscatter_delta_db  NUMERIC(6,2) NOT NULL,
    vertical_displacement_mm   NUMERIC(8,2) NOT NULL,
    coherence_score            NUMERIC(4,3) NOT NULL,
    soil_saturation_pct        NUMERIC(5,2) NOT NULL,
    affected_structures_count  INTEGER NOT NULL DEFAULT 0,
    infrastructure_corridor    TEXT,
    impact_summary             TEXT NOT NULL,
    acquisition_date           TIMESTAMPTZ NOT NULL,
    geom                       GEOMETRY(Polygon, 4326) NOT NULL,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_geom
    ON surface_change_anomalies USING GIST (geom);

-- Functional geography index: REQUIRED so ST_DWithin(geom::geography, ...)
-- is index-served (a plain geometry GiST cannot serve a ::geography predicate).
CREATE INDEX IF NOT EXISTS idx_anomalies_geog
    ON surface_change_anomalies USING GIST ((geom::geography));

CREATE INDEX IF NOT EXISTS idx_anomalies_hazard
    ON surface_change_anomalies (hazard_type, severity);

-- ----------------------------------------------------------------------------
-- trigger: keep nisar_granules.updated_at honest
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_granules_touch ON nisar_granules;
CREATE TRIGGER trg_granules_touch
    BEFORE UPDATE ON nisar_granules
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- fn_pinpoint_nisar_anomalies — meter-accurate proximity + urgency ranking.
--
-- Every computed column is explicitly cast to match the RETURNS TABLE
-- signature 1-to-1 (ST_Distance yields DOUBLE PRECISION, not NUMERIC).
-- Output columns carry an out_ prefix so ORDER BY is never ambiguous
-- against table columns inside PL/pgSQL.
--
-- urgency_score = severity_weight
--               * time_decay            (NULL-guarded; missing dates score 0)
--               * (1 + displacement factor + backscatter factor)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pinpoint_nisar_anomalies(
    p_lat           DOUBLE PRECISION,
    p_lon           DOUBLE PRECISION,
    p_radius_meters DOUBLE PRECISION DEFAULT 25000
)
RETURNS TABLE (
    out_id                        UUID,
    out_granule_id                TEXT,
    out_region_name               TEXT,
    out_hazard_type               TEXT,
    out_severity                  TEXT,
    out_data_mode                 TEXT,
    out_mean_backscatter_delta_db NUMERIC(6,2),
    out_vertical_displacement_mm  NUMERIC(8,2),
    out_coherence_score           NUMERIC(4,3),
    out_soil_saturation_pct       NUMERIC(5,2),
    out_affected_structures_count INTEGER,
    out_infrastructure_corridor   TEXT,
    out_impact_summary            TEXT,
    out_acquisition_date          TIMESTAMPTZ,
    out_distance_meters           NUMERIC(10,2),
    out_urgency_score             NUMERIC(10,4),
    out_geojson                   JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.granule_id,
        a.region_name,
        a.hazard_type,
        a.severity,
        a.data_mode,
        a.mean_backscatter_delta_db,
        a.vertical_displacement_mm,
        a.coherence_score,
        a.soil_saturation_pct,
        a.affected_structures_count,
        a.infrastructure_corridor,
        a.impact_summary,
        a.acquisition_date,
        ST_Distance(
            a.geom::geography,
            ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
        )::NUMERIC(10,2)                                   AS out_distance_meters,
        (
            (CASE a.severity
                 WHEN 'CRITICAL' THEN 4.0
                 WHEN 'HIGH'     THEN 3.0
                 WHEN 'MODERATE' THEN 2.0
                 ELSE 1.0
             END)
            *
            (CASE
                 WHEN a.acquisition_date IS NULL THEN 0.0
                 ELSE EXP(-0.005 * GREATEST(0, (CURRENT_DATE - a.acquisition_date::date)))
             END)
            *
            (1.0
             + LEAST(ABS(a.vertical_displacement_mm) / 10.0, 5.0)
             + LEAST(ABS(a.mean_backscatter_delta_db) / 3.0, 5.0))
        )::NUMERIC(10,4)                                   AS out_urgency_score,
        ST_AsGeoJSON(a.geom)::jsonb                        AS out_geojson
    FROM surface_change_anomalies a
    WHERE ST_DWithin(
        a.geom::geography,
        ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
        p_radius_meters
    )
    -- Positional ORDER BY: 16 = urgency, 15 = distance. Named aliases here
    -- would be ambiguous against the function's own OUT parameters (42702).
    ORDER BY 16 DESC, 15 ASC;
END;
$$;

-- ============================================================================
-- HOW TO USE
--   docker compose up -d          (runs this file automatically on first init)
--   SELECT * FROM fn_pinpoint_nisar_anomalies(49.3858, -121.4419, 25000);
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS fn_pinpoint_nisar_anomalies(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
--   DROP TRIGGER  IF EXISTS trg_granules_touch ON nisar_granules;
--   DROP FUNCTION IF EXISTS fn_touch_updated_at();
--   DROP TABLE    IF EXISTS surface_change_anomalies;
--   DROP TABLE    IF EXISTS nisar_granules;
-- ============================================================================
