-- ============================================================================
-- 002_seed_nisar_demo.sql — Deterministic multi-hazard NISAR demo fixtures.
--
-- ALL rows here are data_mode='simulated': deterministic demonstration
-- fixtures with fixed UUIDs (stable for tests). Numeric values are
-- simulation fixtures, NOT measured NISAR observations. The API and voice
-- layer must label them accordingly and never present them as live data.
-- Granule IDs follow NISAR L2 naming conventions but are synthetic.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Granules (status='complete' for seeded products; one 'pending' row left in
-- the queue so the worker's SKIP LOCKED claim path is demonstrable).
-- ----------------------------------------------------------------------------
INSERT INTO nisar_granules
    (id, granule_id, product_type, frequency_band, polarization,
     acquisition_date, s3_url, status, footprint)
VALUES
-- Saskatchewan prairie corridor (GCOV, covers both farm anomalies)
('11111111-1111-4111-8111-111111111101',
 'NISAR_L2_PR_GCOV_010_057_A_041_4020_DHDH_A_20261108T134512_20261108T134542_D00401_N_F_J_001',
 'GCOV', 'L-Band (24cm)', 'HHHH/HVHV',
 '2026-11-08T13:45:12Z', NULL, 'complete',
 ST_GeomFromText('POLYGON((-106.2 50.1, -104.8 50.1, -104.8 50.9, -106.2 50.9, -106.2 50.1))', 4326)),

-- BC Fraser Canyon (GUNW interferometric pair)
('11111111-1111-4111-8111-111111111102',
 'NISAR_L2_PR_GUNW_010_064_A_012_2810_SHNA_A_20261101T141900_20261113T141930_D00402_N_F_J_001',
 'GUNW', 'L-Band (24cm)', 'HHHH/HVHV',
 '2026-11-13T14:19:00Z', NULL, 'complete',
 ST_GeomFromText('POLYGON((-122.1 48.9, -120.7 48.9, -120.7 49.9, -122.1 49.9, -122.1 48.9))', 4326)),

-- Pantanal, Brazil (GCOV — global coverage bonus)
('11111111-1111-4111-8111-111111111103',
 'NISAR_L2_PR_GCOV_010_122_D_077_4050_DHDH_A_20261105T093011_20261105T093041_D00403_N_F_J_001',
 'GCOV', 'L-Band (24cm)', 'HHHH/HVHV',
 '2026-11-05T09:30:11Z', NULL, 'complete',
 ST_GeomFromText('POLYGON((-57.8 -18.1, -56.4 -18.1, -56.4 -17.1, -57.8 -17.1, -57.8 -18.1))', 4326)),

-- Karakoram, Pakistan (GUNW — global coverage bonus)
('11111111-1111-4111-8111-111111111104',
 'NISAR_L2_PR_GUNW_010_201_A_133_2790_SHNA_A_20261030T052244_20261111T052314_D00404_N_F_J_001',
 'GUNW', 'L-Band (24cm)', 'HHHH/HVHV',
 '2026-11-11T05:22:44Z', NULL, 'complete',
 ST_GeomFromText('POLYGON((74.0 35.9, 75.4 35.9, 75.4 36.7, 74.0 36.7, 74.0 35.9))', 4326)),

-- Queue demo: a pending granule for the worker to claim (offline -> failed
-- with a clear message; seeded anomalies stay authoritative either way)
('11111111-1111-4111-8111-111111111105',
 'NISAR_L2_PR_GCOV_010_058_A_042_4021_DHDH_A_20261114T134512_20261114T134542_D00405_N_F_J_001',
 'GCOV', 'L-Band (24cm)', 'HHHH/HVHV',
 '2026-11-14T13:45:12Z',
 'https://nisar.asf.earthdatacloud.nasa.gov/example/NISAR_L2_PR_GCOV_010_058.h5',
 'pending',
 ST_GeomFromText('POLYGON((-106.2 50.1, -104.8 50.1, -104.8 50.9, -106.2 50.9, -106.2 50.1))', 4326))
ON CONFLICT (granule_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Surface-change anomalies
-- ----------------------------------------------------------------------------
INSERT INTO surface_change_anomalies
    (id, granule_id, region_name, hazard_type, severity, data_mode,
     mean_backscatter_delta_db, vertical_displacement_mm, coherence_score,
     soil_saturation_pct, affected_structures_count, infrastructure_corridor,
     impact_summary, acquisition_date, geom)
VALUES
-- 1) Saskatchewan — South Ridge: dry topsoil, moisture deficit
('22222222-2222-4222-8222-222222222201',
 'NISAR_L2_PR_GCOV_010_057_A_041_4020_DHDH_A_20261108T134512_20261108T134542_D00401_N_F_J_001',
 'South Ridge Quarter — Moose Jaw / Regina Corridor, SK',
 'SOIL_MOISTURE_DEFICIT', 'MODERATE', 'simulated',
 -2.10, -1.50, 0.910, 19.00, 0,
 'SK Highway 363 farm access',
 'Simulated scenario: persistent low L-band backscatter consistent with dry topsoil across the South Ridge quarter-section; irrigation review suggested. Fixture values for demonstration, not a measured soil-moisture product.',
 '2026-11-08T13:45:12Z',
 ST_GeomFromText('POLYGON((-105.560 50.430, -105.520 50.430, -105.520 50.452, -105.560 50.452, -105.560 50.430))', 4326)),

-- 2) Saskatchewan — North Quarter: subsurface saturation ribbon
('22222222-2222-4222-8222-222222222202',
 'NISAR_L2_PR_GCOV_010_057_A_041_4020_DHDH_A_20261108T134512_20261108T134542_D00401_N_F_J_001',
 'North Quarter — Moose Jaw / Regina Corridor, SK',
 'SUBSURFACE_SATURATION', 'HIGH', 'simulated',
 -4.80, 2.30, 0.880, 88.50, 0,
 'SK Highway 363 farm access',
 'Simulated scenario: HVHV backscatter shift consistent with a shallow subsurface water ribbon beneath dry-looking topsoil on the North Quarter. L-band imaging is cloud-independent. Fixture values for demonstration.',
 '2026-11-08T13:45:12Z',
 ST_GeomFromText('POLYGON((-105.560 50.456, -105.520 50.456, -105.520 50.478, -105.560 50.478, -105.560 50.456))', 4326)),

-- 3) BC Fraser Canyon — CRITICAL slope subsidence at Hwy 1 Milepost 14
('22222222-2222-4222-8222-222222222203',
 'NISAR_L2_PR_GUNW_010_064_A_012_2810_SHNA_A_20261101T141900_20261113T141930_D00402_N_F_J_001',
 'Fraser Canyon — Trans-Canada Hwy 1, Milepost 14, BC',
 'SLOPE_SUBSIDENCE', 'CRITICAL', 'simulated',
 6.40, -21.00, 0.760, 94.20, 42,
 'Trans-Canada Hwy 1 — Milepost 14',
 'Simulated scenario: interferometric pair shows ~21 mm line-of-sight ground motion on a saturated hillside above Hwy 1 Milepost 14, imaged through full cloud cover (L-band is cloud-independent). 42 structures lie inside the simulated impact polygon; a real detection of this pattern would warrant geotechnical assessment. Fixture values for demonstration.',
 '2026-11-13T14:19:00Z',
 ST_GeomFromText('POLYGON((-121.460 49.372, -121.424 49.372, -121.424 49.400, -121.460 49.400, -121.460 49.372))', 4326)),

-- 4) Pantanal, Brazil — wetland loss (global bonus)
('22222222-2222-4222-8222-222222222204',
 'NISAR_L2_PR_GCOV_010_122_D_077_4050_DHDH_A_20261105T093011_20261105T093041_D00403_N_F_J_001',
 'Pantanal wetland margin — Mato Grosso do Sul, Brazil',
 'WETLAND_LOSS', 'HIGH', 'simulated',
 -5.60, -3.20, 0.840, 31.40, 0,
 'BR-262 corridor',
 'Simulated scenario: season-over-season backscatter decline along the wetland margin consistent with open-water and inundated-vegetation loss. Fixture values for demonstration.',
 '2026-11-05T09:30:11Z',
 ST_GeomFromText('POLYGON((-57.20 -17.60, -57.05 -17.60, -57.05 -17.48, -57.20 -17.48, -57.20 -17.60))', 4326)),

-- 5) Karakoram, Pakistan — glacier displacement (global bonus)
('22222222-2222-4222-8222-222222222205',
 'NISAR_L2_PR_GUNW_010_201_A_133_2790_SHNA_A_20261030T052244_20261111T052314_D00404_N_F_J_001',
 'Shisper Glacier tongue — Hunza Valley, Karakoram, PK',
 'GLACIER_DISPLACEMENT', 'MODERATE', 'simulated',
 3.10, 142.00, 0.620, 12.80, 3,
 'Karakoram Highway (N-35)',
 'Simulated scenario: 12-day interferometric pair shows strong line-of-sight motion on the glacier tongue above the Karakoram Highway. Fixture values for demonstration.',
 '2026-11-11T05:22:44Z',
 ST_GeomFromText('POLYGON((74.56 36.37, 74.63 36.37, 74.63 36.43, 74.56 36.43, 74.56 36.37))', 4326))
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- HOW TO USE
--   Runs automatically after 001 on first container init. Idempotent
--   (ON CONFLICT DO NOTHING); safe to re-apply manually:
--     docker exec -i dwts-postgis psql -U dwts -d dwts < sql/002_seed_nisar_demo.sql
--
-- ROLLBACK
--   DELETE FROM surface_change_anomalies WHERE data_mode = 'simulated';
--   DELETE FROM nisar_granules WHERE id::text LIKE '11111111-%';
-- ============================================================================
