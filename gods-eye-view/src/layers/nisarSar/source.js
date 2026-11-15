import { readResponseJsonCapped } from '../../sources/httpBody.js';

/** Request a normalized snapshot through the bounded, same-origin NISAR proxy. */
export function createNisarSarSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  /**
   * The rows with how fresh they are: the proxy answers from its last
   * snapshot, marked stale, while the NISAR backend is unreachable.
   * @returns {Promise<{rows: object[], stale: boolean, fetchedAt: number|null}>}
   */
  async function getSnapshotDetail({ signal } = {}) {
    signal?.throwIfAborted();
    const response = await fetchImpl('/api/nisar/anomalies', { signal });
    if (!response.ok) throw new Error(`NISAR HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      16 * 1024 * 1024,
      signal,
    );
    signal?.throwIfAborted();
    if (!Array.isArray(payload?.rows))
      throw new Error('Malformed NISAR snapshot');
    return {
      rows: payload.rows,
      stale: payload.stale === true,
      fetchedAt: Number.isFinite(payload.fetchedAt) ? payload.fetchedAt : null,
    };
  }

  return {
    /** The anomaly rows (see getSnapshotDetail for staleness). */
    async getSnapshot(options = {}) {
      return (await getSnapshotDetail(options)).rows;
    },
    getSnapshotDetail,
  };
}
