import { normalizeNisarSnapshot } from '../../src/layers/nisarSar/records.js';
import { readResponseJsonCapped, coalesceProxyRequest } from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { admitSameSiteKeyless } from './common/same-site.js';

// Same-origin proxy to the local "Dancing with the SARS" NISAR backend
// (FastAPI + PostGIS). The page CSP has no http: connect-src, so the browser
// reaches the backend only through these routes. The backend serves seeded
// anomalies labeled data_mode="simulated" when NASA Earthdata is offline.
const DEFAULT_ORIGIN = 'http://localhost:8077';

const MIB = 1024 * 1024;
const SNAPSHOT_TTL_MS = 30_000;
/** Longest a failed refresh keeps serving the last snapshot, marked stale. */
const STALE_MAX_MS = 24 * 60 * 60 * 1000;

/** Validate GEV_NISAR_ORIGIN: http(s), no credentials/path/query/hash. */
export function nisarOrigin(raw = process.env.GEV_NISAR_ORIGIN) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return DEFAULT_ORIGIN;
  let url;
  try {
    url = new URL(text);
  } catch {
    return DEFAULT_ORIGIN;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return DEFAULT_ORIGIN;
  if (url.username || url.password || url.search || url.hash)
    return DEFAULT_ORIGIN;
  return url.origin;
}

/** Bounded local-backend NISAR routes for dev and preview. */
export function nisarProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  origin = nisarOrigin(),
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const allow = makeRateLimiter({
    windowMs: 60_000,
    max: 120,
    globalMax: 1200,
  });

  async function upstream(path, cap, timeout) {
    const signal = AbortSignal.timeout(timeout);
    const response = await fetchImpl(new URL(path, origin), {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('upstream_unavailable');
    }
    return readResponseJsonCapped(response, cap, signal);
  }

  async function fetchAnomalies() {
    const payload = await upstream('/api/nisar/anomalies', 16 * MIB, 15_000);
    const rows = normalizeNisarSnapshot(payload);
    if (!rows) throw new Error('invalid_snapshot');
    return { fetchedAt: now(), dataMode: payload.data_mode, rows };
  }

  async function acquire(key, ttl, load) {
    const previous = cache.get(key);
    if (previous && now() - previous.savedAt < ttl)
      return { value: previous.value, stale: false };
    if (!inFlight.has(key) && inFlight.size >= 256)
      throw Object.assign(new Error('busy'), { status: 429 });
    try {
      const { promise } = coalesceProxyRequest(inFlight, key, async () => {
        const value = await load();
        cache.set(key, { value, savedAt: now() });
        return value;
      });
      return { value: await promise, stale: false };
    } catch (error) {
      if (previous && now() - previous.savedAt <= STALE_MAX_MS)
        return { value: previous.value, stale: true };
      throw error;
    }
  }

  const clampedNumber = (value, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(Math.max(number, min), max);
  };

  async function handler(req, res) {
    const json = (status, value, stale = false) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
        ...(stale ? { 'X-Data-Stale': 'true' } : {}),
      });
      res.end(JSON.stringify(value));
    };
    if (admitSameSiteKeyless(req, res)) return;
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const path = requestUrl.pathname;

    if (path === '/anomalies' || path === '/anomalies/') {
      try {
        const { value, stale } = await acquire(
          'anomalies',
          SNAPSHOT_TTL_MS,
          fetchAnomalies,
        );
        return json(200, stale ? { ...value, stale: true } : value, stale);
      } catch (error) {
        return json(error.status === 429 ? 429 : 502, {
          error: 'nisar_unavailable',
        });
      }
    }

    if (path === '/pinpoint' || path === '/pinpoint/') {
      const lat = clampedNumber(requestUrl.searchParams.get('lat'), -90, 90);
      const lon = clampedNumber(requestUrl.searchParams.get('lon'), -180, 180);
      const radiusKm =
        clampedNumber(requestUrl.searchParams.get('radius_km'), 1, 500) ?? 25;
      if (lat === null || lon === null)
        return json(400, { error: 'lat_lon_required' });
      try {
        const payload = await upstream(
          `/api/nisar/pinpoint?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`,
          16 * MIB,
          15_000,
        );
        return json(200, payload);
      } catch {
        return json(502, { error: 'nisar_unavailable' });
      }
    }

    return json(404, { error: 'unknown_route' });
  }

  return {
    name: 'nisar',
    configureServer({ middlewares }) {
      middlewares.use('/api/nisar', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/nisar', handler);
    },
  };
}
