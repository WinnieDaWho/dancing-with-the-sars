/**
 * scan_nisar_radar — voice tool for the NISAR surface-change layer.
 *
 * Declared OUTSIDE GEV_ACTION_SCHEMAS on purpose: the realtime prompt budget
 * is nearly full, and this record rides into both providers through
 * realtimeSessionTools() in server/standalone/voiceTools.js instead. The
 * description carries the routing guidance (no instructions.js edits).
 */

export const NISAR_SCAN_TOOL = Object.freeze({
  type: 'function',
  name: 'scan_nisar_radar',
  description:
    'Scan NASA NISAR L-band radar surface-change anomalies around a location: ' +
    'flies the camera there, enables the "NASA NISAR SAR" layer, and returns a ' +
    'briefing of soil-moisture, subsidence, flood, wetland, wildfire-scar, ' +
    'seismic and glacier anomalies ranked by urgency. Use when the user asks ' +
    'to scan, sweep, or check NISAR, SAR, or radar anomalies near a place. ' +
    'Speak the say line; if it begins with "Simulated demonstration data", ' +
    'keep that disclosure.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['location_name', 'latitude', 'longitude'],
    properties: {
      location_name: { type: 'string', minLength: 1, maxLength: 120 },
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      radius_km: { type: 'number', minimum: 1, maximum: 500 },
    },
  },
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Run the scan: enable the layer, fly, query the same-origin pinpoint proxy,
 * and hand the backend's voice briefing to the model as the say line.
 */
export async function scanNisarRadar(
  { enableLayer, flyTo, progress = null, fetchImpl = null },
  args,
  { isCurrent = () => true, signal = undefined } = {},
) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  const action = 'scan_nisar_radar';
  const locationName = String(args?.location_name || '').trim();
  const latitude = Number(args?.latitude);
  const longitude = Number(args?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return { ok: false, action, error: 'latitude and longitude are required' };
  const radiusKm = clamp(
    Number.isFinite(Number(args?.radius_km)) ? Number(args.radius_km) : 25,
    1,
    500,
  );

  progress?.('layer');
  const layer = await enableLayer(true);
  if (layer?.ok !== true || !isCurrent())
    return {
      ok: false,
      action,
      stage: 'layer',
      error: layer?.error || 'NISAR layer could not be enabled',
    };

  progress?.('camera');
  const flight = await flyTo({
    latitude,
    longitude,
    rangeM: clamp(radiusKm * 2500, 100, 20_000_000),
    waitForArrival: true,
  });
  if (!isCurrent())
    return { ok: false, action, stage: 'camera', error: 'superseded' };
  if (flight?.ok === false)
    return {
      ok: false,
      action,
      stage: 'camera',
      error: flight?.error || 'camera flight failed',
    };

  progress?.('scan');
  let payload;
  try {
    const response = await doFetch(
      `/api/nisar/pinpoint?lat=${latitude}&lon=${longitude}&radius_km=${radiusKm}`,
      { signal },
    );
    if (!response.ok) throw new Error(`NISAR pinpoint HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    if (!isCurrent()) return { ok: false, action, error: 'superseded' };
    return {
      ok: false,
      action,
      stage: 'scan',
      error:
        'NISAR backend unreachable; the radar layer is on but no briefing is available',
      detail: error?.message || String(error),
    };
  }
  if (!isCurrent()) return { ok: false, action, error: 'superseded' };

  const features = Array.isArray(payload?.features) ? payload.features : [];
  const say =
    typeof payload?.voice_briefing === 'string' && payload.voice_briefing
      ? payload.voice_briefing
      : `No NISAR briefing available for ${locationName || 'the scan point'}.`;
  return {
    ok: true,
    action,
    say,
    location: locationName,
    latitude,
    longitude,
    radiusKm,
    dataMode: payload?.data_mode === 'live' ? 'live' : 'simulated',
    anomalyCount: features.length,
    topAnomalies: features.slice(0, 3).map((feature) => ({
      region: feature?.properties?.region_name,
      hazard: feature?.properties?.hazard_type,
      severity: feature?.properties?.severity,
      distanceMeters: feature?.properties?.distance_meters,
      urgency: feature?.properties?.urgency_score,
    })),
  };
}
