// Cloudflare Pages Function: serves /api/nisar/anomalies and
// /api/nisar/pinpoint at the edge with the same contract as the local
// chain (server/providers/nisar.js proxy -> FastAPI -> PostGIS
// fn_pinpoint_nisar_anomalies). The cockpit's NISAR layer and voice tool
// work on *.pages.dev with no localhost backend.
//
// Data honesty: rows come from the deterministic seed snapshot
// (server/edge/nisarSeed.js) and stay data_mode="simulated"; the voice
// briefing opens by saying so. Distance/urgency replicate the SQL
// function: urgency = severity_weight(4/3/2/1) x NULL-guarded time decay
// exp(-0.005 * days_since_acquisition) x
// (1 + min(|displacement_mm|/10, 5) + min(|delta_dB|/3, 5)).

import { normalizeNisarSnapshot } from '../../../src/layers/nisarSar/records.js';
import { SEED_SNAPSHOT } from '../../../server/edge/nisarSeed.js';

const SEVERITY_WEIGHT = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
const EARTH_RADIUS_M = 6371008.8;
const M_PER_DEG_LAT = 111194.93; // spherical mean, close to geography distances

const toRad = (deg) => (deg * Math.PI) / 180;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Ray-cast point-in-ring test (ring: [[lon,lat], ...], closed). */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Distance from the point to the closest point of segment a-b, in meters,
 * using a local equirectangular projection around the scan latitude. */
function segmentDistanceMeters(lat, lon, a, b) {
  const kx = Math.cos(toRad(lat)) * M_PER_DEG_LAT;
  const px = 0;
  const py = 0;
  const ax = (a[0] - lon) * kx;
  const ay = (a[1] - lat) * M_PER_DEG_LAT;
  const bx = (b[0] - lon) * kx;
  const by = (b[1] - lat) * M_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0)
    t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  // Convert the closest planar point back to lon/lat, measure on the sphere.
  const closestLon = lon + cx / kx;
  const closestLat = lat + cy / M_PER_DEG_LAT;
  return haversineMeters(lat, lon, closestLat, closestLon);
}

/** Point-to-geometry distance in meters (0 when inside), like
 * ST_Distance(geom::geography, point::geography). */
function geometryDistanceMeters(lat, lon, geometry) {
  const polygons =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  for (const rings of polygons) {
    if (!rings?.length) continue;
    const [outer, ...holes] = rings;
    if (
      pointInRing(lon, lat, outer) &&
      !holes.some((hole) => pointInRing(lon, lat, hole))
    )
      return 0;
  }
  let best = Infinity;
  for (const rings of polygons) {
    for (const ring of rings ?? []) {
      for (let i = 0; i < ring.length - 1; i++) {
        const d = segmentDistanceMeters(lat, lon, ring[i], ring[i + 1]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** severity_weight x NULL-guarded decay x telemetry factor, 4 decimals. */
function urgencyScore(props) {
  const weight = SEVERITY_WEIGHT[props.severity] ?? 1;
  let decay = 0;
  if (props.acquisition_date) {
    const acquired = new Date(props.acquisition_date);
    if (!Number.isNaN(acquired.getTime())) {
      const acquiredDay = Date.UTC(
        acquired.getUTCFullYear(),
        acquired.getUTCMonth(),
        acquired.getUTCDate(),
      );
      const now = new Date();
      const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const days = Math.max(0, Math.round((today - acquiredDay) / 86_400_000));
      decay = Math.exp(-0.005 * days);
    }
  }
  const displacement = Math.abs(Number(props.vertical_displacement_mm ?? 0));
  const deltaDb = Math.abs(Number(props.mean_backscatter_delta_db ?? 0));
  const factor =
    1 + Math.min(displacement / 10, 5) + Math.min(deltaDb / 3, 5);
  return Math.round(weight * decay * factor * 1e4) / 1e4;
}

const fixed1 = (value) => Number(value).toFixed(1);
const signed1 = (value) => {
  const text = fixed1(value);
  return text.startsWith('-') ? text : `+${text}`;
};

/** Same wording as backend/api_server.py _voice_briefing. */
function voiceBriefing(features, radiusKm) {
  if (!features.length)
    return (
      `No NISAR surface-change anomalies within ${radiusKm} kilometers ` +
      'of the scan point.'
    );
  const top = features[0].properties;
  const hazard = top.hazard_type.replace(/_/g, ' ').toLowerCase();
  const distKm = Number(top.distance_meters) / 1000;
  const plural = features.length === 1 ? 'y' : 'ies';
  const lines = [
    `Simulated demonstration data: ${features.length} radar anomal${plural} ` +
      `within ${radiusKm} kilometers.`,
    `Most urgent: ${top.region_name} — ${hazard}, severity ` +
      `${top.severity}, ${fixed1(distKm)} kilometers from the scan point.`,
    `L-band telemetry: backscatter delta ` +
      `${signed1(top.mean_backscatter_delta_db)} dB, line-of-sight ` +
      `displacement ${fixed1(top.vertical_displacement_mm)} millimeters, ` +
      `soil saturation ${fixed1(top.soil_saturation_pct)} percent.`,
  ];
  const structures = Math.trunc(Number(top.affected_structures_count ?? 0));
  if (structures) {
    const corridor = top.infrastructure_corridor || 'the local corridor';
    lines.push(
      `${structures} structures lie inside the impact polygon along ${corridor}.`,
    );
  }
  return lines.join(' ');
}

function pinpointPayload(lat, lon, radiusKm) {
  const radiusM = radiusKm * 1000;
  const features = SEED_SNAPSHOT.features
    .map((feature) => {
      const distance = geometryDistanceMeters(lat, lon, feature.geometry);
      return { feature, distance };
    })
    .filter(({ distance }) => distance <= radiusM)
    .map(({ feature, distance }) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        distance_meters: Math.round(distance * 100) / 100,
        urgency_score: urgencyScore(feature.properties),
      },
    }))
    .sort(
      (a, b) =>
        b.properties.urgency_score - a.properties.urgency_score ||
        a.properties.distance_meters - b.properties.distance_meters,
    );
  const granuleIds = [
    ...new Set(
      features.map((f) => f.properties.granule_id).filter(Boolean),
    ),
  ].sort();
  return {
    data_mode: 'simulated',
    features,
    voice_briefing: voiceBriefing(features, radiusKm),
    provenance: {
      source: 'Deterministic seeded PostGIS fixtures (demonstration)',
      granule_ids: granuleIds,
      algorithm: 'deterministic_fixture',
      query: { lat, lon, radius_km: radiusKm },
      limitations:
        'Simulated values are fixtures, not measured NISAR observations. ' +
        'Displacement is relative line-of-sight; dB deltas assume ' +
        'co-registered GCOV pairs.',
    },
  };
}

const clampedNumber = (value, min, max) => {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) return null;
  return Math.min(Math.max(number, min), max);
};

const json = (status, value, extra = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });

export async function onRequest({ request }) {
  if (request.method !== 'GET')
    return json(405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/nisar/, '') || '/';

  if (path === '/anomalies' || path === '/anomalies/') {
    const rows = normalizeNisarSnapshot(SEED_SNAPSHOT);
    if (!rows) return json(502, { error: 'nisar_unavailable' });
    return json(200, {
      fetchedAt: Date.now(),
      dataMode: SEED_SNAPSHOT.data_mode,
      rows,
    });
  }

  if (path === '/pinpoint' || path === '/pinpoint/') {
    const lat = clampedNumber(url.searchParams.get('lat'), -90, 90);
    const lon = clampedNumber(url.searchParams.get('lon'), -180, 180);
    const radiusKm =
      clampedNumber(url.searchParams.get('radius_km'), 1, 500) ?? 25;
    if (lat === null || lon === null)
      return json(400, { error: 'lat_lon_required' });
    return json(200, pinpointPayload(lat, lon, radiusKm));
  }

  return json(404, { error: 'unknown_route' });
}
