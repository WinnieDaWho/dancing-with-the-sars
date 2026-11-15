// Deterministic seeded NISAR anomaly snapshot captured from the local
// FastAPI + PostGIS backend (sql/002_seed_nisar_demo.sql). Served by the
// Cloudflare Pages Function so the cockpit runs without localhost. Every
// row carries data_mode="simulated" — fixtures, never live observations.
export const SEED_SNAPSHOT = {
  "type": "FeatureCollection",
  "data_mode": "simulated",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -121.46,
              49.372
            ],
            [
              -121.424,
              49.372
            ],
            [
              -121.424,
              49.4
            ],
            [
              -121.46,
              49.4
            ],
            [
              -121.46,
              49.372
            ]
          ]
        ]
      },
      "properties": {
        "id": "22222222-2222-4222-8222-222222222203",
        "granule_id": "NISAR_L2_PR_GUNW_010_064_A_012_2810_SHNA_A_20261101T141900_20261113T141930_D00402_N_F_J_001",
        "region_name": "Fraser Canyon — Trans-Canada Hwy 1, Milepost 14, BC",
        "hazard_type": "SLOPE_SUBSIDENCE",
        "severity": "CRITICAL",
        "data_mode": "simulated",
        "mean_backscatter_delta_db": 6.4,
        "vertical_displacement_mm": -21,
        "coherence_score": 0.76,
        "soil_saturation_pct": 94.2,
        "affected_structures_count": 42,
        "infrastructure_corridor": "Trans-Canada Hwy 1 — Milepost 14",
        "impact_summary": "Simulated scenario: interferometric pair shows ~21 mm line-of-sight ground motion on a saturated hillside above Hwy 1 Milepost 14, imaged through full cloud cover (L-band is cloud-independent). 42 structures lie inside the simulated impact polygon; a real detection of this pattern would warrant geotechnical assessment. Fixture values for demonstration.",
        "acquisition_date": "2026-11-13T14:19:00+00:00"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              74.56,
              36.37
            ],
            [
              74.63,
              36.37
            ],
            [
              74.63,
              36.43
            ],
            [
              74.56,
              36.43
            ],
            [
              74.56,
              36.37
            ]
          ]
        ]
      },
      "properties": {
        "id": "22222222-2222-4222-8222-222222222205",
        "granule_id": "NISAR_L2_PR_GUNW_010_201_A_133_2790_SHNA_A_20261030T052244_20261111T052314_D00404_N_F_J_001",
        "region_name": "Shisper Glacier tongue — Hunza Valley, Karakoram, PK",
        "hazard_type": "GLACIER_DISPLACEMENT",
        "severity": "MODERATE",
        "data_mode": "simulated",
        "mean_backscatter_delta_db": 3.1,
        "vertical_displacement_mm": 142,
        "coherence_score": 0.62,
        "soil_saturation_pct": 12.8,
        "affected_structures_count": 3,
        "infrastructure_corridor": "Karakoram Highway (N-35)",
        "impact_summary": "Simulated scenario: 12-day interferometric pair shows strong line-of-sight motion on the glacier tongue above the Karakoram Highway. Fixture values for demonstration.",
        "acquisition_date": "2026-11-11T05:22:44+00:00"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -105.56,
              50.43
            ],
            [
              -105.52,
              50.43
            ],
            [
              -105.52,
              50.452
            ],
            [
              -105.56,
              50.452
            ],
            [
              -105.56,
              50.43
            ]
          ]
        ]
      },
      "properties": {
        "id": "22222222-2222-4222-8222-222222222201",
        "granule_id": "NISAR_L2_PR_GCOV_010_057_A_041_4020_DHDH_A_20261108T134512_20261108T134542_D00401_N_F_J_001",
        "region_name": "South Ridge Quarter — Moose Jaw / Regina Corridor, SK",
        "hazard_type": "SOIL_MOISTURE_DEFICIT",
        "severity": "MODERATE",
        "data_mode": "simulated",
        "mean_backscatter_delta_db": -2.1,
        "vertical_displacement_mm": -1.5,
        "coherence_score": 0.91,
        "soil_saturation_pct": 19,
        "affected_structures_count": 0,
        "infrastructure_corridor": "SK Highway 363 farm access",
        "impact_summary": "Simulated scenario: persistent low L-band backscatter consistent with dry topsoil across the South Ridge quarter-section; irrigation review suggested. Fixture values for demonstration, not a measured soil-moisture product.",
        "acquisition_date": "2026-11-08T13:45:12+00:00"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -105.56,
              50.456
            ],
            [
              -105.52,
              50.456
            ],
            [
              -105.52,
              50.478
            ],
            [
              -105.56,
              50.478
            ],
            [
              -105.56,
              50.456
            ]
          ]
        ]
      },
      "properties": {
        "id": "22222222-2222-4222-8222-222222222202",
        "granule_id": "NISAR_L2_PR_GCOV_010_057_A_041_4020_DHDH_A_20261108T134512_20261108T134542_D00401_N_F_J_001",
        "region_name": "North Quarter — Moose Jaw / Regina Corridor, SK",
        "hazard_type": "SUBSURFACE_SATURATION",
        "severity": "HIGH",
        "data_mode": "simulated",
        "mean_backscatter_delta_db": -4.8,
        "vertical_displacement_mm": 2.3,
        "coherence_score": 0.88,
        "soil_saturation_pct": 88.5,
        "affected_structures_count": 0,
        "infrastructure_corridor": "SK Highway 363 farm access",
        "impact_summary": "Simulated scenario: HVHV backscatter shift consistent with a shallow subsurface water ribbon beneath dry-looking topsoil on the North Quarter. L-band imaging is cloud-independent. Fixture values for demonstration.",
        "acquisition_date": "2026-11-08T13:45:12+00:00"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -57.2,
              -17.6
            ],
            [
              -57.05,
              -17.6
            ],
            [
              -57.05,
              -17.48
            ],
            [
              -57.2,
              -17.48
            ],
            [
              -57.2,
              -17.6
            ]
          ]
        ]
      },
      "properties": {
        "id": "22222222-2222-4222-8222-222222222204",
        "granule_id": "NISAR_L2_PR_GCOV_010_122_D_077_4050_DHDH_A_20261105T093011_20261105T093041_D00403_N_F_J_001",
        "region_name": "Pantanal wetland margin — Mato Grosso do Sul, Brazil",
        "hazard_type": "WETLAND_LOSS",
        "severity": "HIGH",
        "data_mode": "simulated",
        "mean_backscatter_delta_db": -5.6,
        "vertical_displacement_mm": -3.2,
        "coherence_score": 0.84,
        "soil_saturation_pct": 31.4,
        "affected_structures_count": 0,
        "infrastructure_corridor": "BR-262 corridor",
        "impact_summary": "Simulated scenario: season-over-season backscatter decline along the wetland margin consistent with open-water and inundated-vegetation loss. Fixture values for demonstration.",
        "acquisition_date": "2026-11-05T09:30:11+00:00"
      }
    }
  ]
};
