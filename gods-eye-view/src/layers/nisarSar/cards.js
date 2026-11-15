/** Card model for one selected NISAR anomaly. Pure — no Cesium types. */

import { t } from '../../i18n/index.js';

export const NISAR_OVERLAY_SOURCE_ID = 'nisar-sar';

/** Fill/line CSS color for an anomaly by severity. */
export function nisarAccent(severity) {
  if (severity === 'CRITICAL') return '#ff2d55';
  if (severity === 'HIGH') return '#ff9500';
  if (severity === 'MODERATE') return '#00c7be';
  return '#ffd60a';
}

/** Shoelace area (degree², sign dropped) — relative sizes only. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

/**
 * Anchor point for the anomaly card: the centroid of the largest polygon's
 * outer ring. Degrees, so callers own the Cartesian conversion.
 */
export function nisarAnchorDegrees(polygons) {
  let best = null;
  let bestArea = -1;
  for (const rings of polygons) {
    const outer = rings[0];
    const area = ringArea(outer);
    if (area > bestArea) {
      bestArea = area;
      best = outer;
    }
  }
  let lon = 0;
  let lat = 0;
  const count = best.length - 1;
  for (let i = 0; i < count; i++) {
    lon += best[i][0];
    lat += best[i][1];
  }
  return { lon: lon / count, lat: lat / count };
}

const signed = (value, digits = 1) =>
  value == null ? null : `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

/**
 * Build the overlay-host entry for one selected anomaly. The caller supplies
 * `position` (Cartesian) separately — this model stays JSON-safe for tests.
 */
export function buildNisarCard(row) {
  const title = `${row.severity} · ${row.regionName || t(row.hazardLabel)}`;

  const telemetry = [];
  if (row.deltaDb != null) telemetry.push(`Δσ⁰ ${signed(row.deltaDb)} dB`);
  if (row.displacementMm != null)
    telemetry.push(`LOS ${signed(row.displacementMm)} mm`);
  if (row.soilPct != null)
    telemetry.push(t('soil {pct}%', { pct: row.soilPct.toFixed(1) }));

  const details = [t(row.hazardLabel)];
  if (telemetry.length) details.push(telemetry.join(' · '));
  const context = [];
  if (row.coherence != null)
    context.push(t('coherence {value}', { value: row.coherence.toFixed(2) }));
  if (row.structures > 0)
    context.push(t('{count} structures', { count: String(row.structures) }));
  if (context.length) details.push(context.join(' · '));
  if (row.corridor) details.push(row.corridor);
  details.push(
    row.dataMode === 'live'
      ? t('L-band 24 cm · cloud-independent · LIVE')
      : t('L-band 24 cm · cloud-independent · SIMULATED DEMO'),
  );

  return {
    id: `nisar-sar-card:${row.stableId}`,
    selected: true,
    interactive: false,
    title,
    details,
    accent: nisarAccent(row.severity),
    priority: Number.MAX_SAFE_INTEGER,
    gapPx: 15,
    verticalOnly: true,
    placement: 'above',
  };
}
