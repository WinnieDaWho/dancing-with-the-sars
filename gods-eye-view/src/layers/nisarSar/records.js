/**
 * Normalize the NISAR anomaly FeatureCollection from the same-origin proxy,
 * skipping individually invalid features. Only a payload that is not a
 * feature collection at all rejects the whole snapshot.
 */

import { msg } from '../../i18n/marker.js';

const HAZARD_LABELS = Object.freeze({
  SOIL_MOISTURE_DEFICIT: msg('Soil moisture deficit'),
  SUBSURFACE_SATURATION: msg('Subsurface saturation'),
  SLOPE_SUBSIDENCE: msg('Slope subsidence'),
  FLOOD_INUNDATION: msg('Flood inundation'),
  WETLAND_LOSS: msg('Wetland loss'),
  WILDFIRE_BURN_SCAR: msg('Wildfire burn scar'),
  SEISMIC_DEFORMATION: msg('Seismic deformation'),
  GLACIER_DISPLACEMENT: msg('Glacier displacement'),
});

const SEVERITIES = new Set(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

const finiteOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const textOrNull = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
};

function validRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  for (const position of ring) {
    if (!Array.isArray(position) || position.length < 2) return false;
    const [lon, lat] = position;
    if (!Number.isFinite(lon) || Math.abs(lon) > 180) return false;
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) return false;
  }
  return true;
}

/** Polygon/MultiPolygon -> array of polygons (each an array of rings);
 * null on malformed geometry, [] when empty. */
function normalizePolygons(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;
  let polygons;
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
  else return null;
  if (!Array.isArray(polygons)) return null;
  const result = [];
  for (const rings of polygons) {
    if (!Array.isArray(rings)) return null;
    if (!rings.length) continue;
    if (!rings.every(validRing)) return null;
    result.push(rings);
  }
  return result;
}

/** Human label for a hazard code, or null when the code is unknown. */
export function nisarHazardLabel(hazardType) {
  return HAZARD_LABELS[hazardType] || null;
}

export function normalizeNisarSnapshot(geojson) {
  if (!Array.isArray(geojson?.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const feature of geojson.features) {
    const properties = feature?.properties;
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties)
    )
      continue;
    const hazardType = textOrNull(properties.hazard_type);
    const hazardLabel = nisarHazardLabel(hazardType);
    if (!hazardLabel) continue;
    const severity = textOrNull(properties.severity);
    if (!SEVERITIES.has(severity)) continue;
    const polygons = normalizePolygons(feature.geometry);
    if (polygons === null || !polygons.length) continue;
    const stableId = textOrNull(properties.id);
    if (stableId == null || ids.has(stableId)) continue;
    ids.add(stableId);
    rows.push({
      stableId,
      regionName: textOrNull(properties.region_name),
      hazardType,
      hazardLabel,
      severity,
      dataMode: properties.data_mode === 'live' ? 'live' : 'simulated',
      deltaDb: finiteOrNull(properties.mean_backscatter_delta_db),
      displacementMm: finiteOrNull(properties.vertical_displacement_mm),
      coherence: finiteOrNull(properties.coherence_score),
      soilPct: finiteOrNull(properties.soil_saturation_pct),
      structures: finiteOrNull(properties.affected_structures_count) ?? 0,
      corridor: textOrNull(properties.infrastructure_corridor),
      summary: textOrNull(properties.impact_summary),
      acquiredAt: textOrNull(properties.acquisition_date),
      granuleId: textOrNull(properties.granule_id),
      polygons,
    });
  }
  return rows;
}
