# Dancing with the SARS

> **🌐 Live demo (Cloudflare Pages):** deploy pending first `wrangler login` on the build machine —
> once deployed the cockpit runs 100% on Cloudflare's edge (no localhost) at
> `https://dancing-with-the-sars.pages.dev` and `https://sars.rabbitholedigitalsolutions.com`.
> One-command deploy: `cd gods-eye-view && npx wrangler login && npm run build && npx wrangler pages deploy`

**2026 NASA Space Apps Challenge — "Through the Radar Looking Glass: Revealing Earth Processes with SAR"**

An interactive application that uses radar remote sensing data from the
**NASA-ISRO Synthetic Aperture Radar (NISAR)** mission to track and visualize
surface change around the world — subsurface agricultural moisture shifts,
cloud-obscured slope subsidence, flood inundation, wetland loss, wildfire burn
scars, seismic deformation, and glacier displacement — on a photorealistic 3D
CesiumJS globe with a live voice agent.

L-band radar (24 cm wavelength) images the ground day or night and is
**cloud-independent**, which is why the two demo scenarios — a Saskatchewan
prairie moisture contrast and a storm-covered BC Fraser Canyon slope — are
visible at all.

## Architecture

```
NASA Earthdata (NISAR L2 GCOV/GUNW, HDF5)
        │  earthaccess + h5py byte-range streaming (bbox slices only,
        │  never full 30 GB granules)        [backend/nisar_slicer.py]
        ▼
Queue worker — FOR UPDATE SKIP LOCKED claims  [backend/worker.py]
        ▼
PostGIS 16 (Docker, port 5433)                [sql/001, sql/002]
  nisar_granules · surface_change_anomalies
  fn_pinpoint_nisar_anomalies()  — meter-accurate geography search
        ▼
FastAPI read layer (port 8077)                [backend/api_server.py]
  /api/health · /api/nisar/anomalies · /api/nisar/pinpoint
        ▼
gods-eye-view 3D cockpit (port 4173)          [gods-eye-view/]
  "NASA NISAR SAR" layer · scan_nisar_radar voice tool · Director Mode scene
```

**Offline-resilient by design:** live NASA Earthdata streaming is fully
decoupled from the read layer. Without credentials or a network connection the
API serves deterministic seeded anomalies labeled `data_mode: "simulated"` —
nothing crashes during live judging.

### Data honesty (`data_mode`)

Every anomaly row, API response, and voice briefing carries an explicit
`data_mode`:

- **`simulated`** — deterministic demonstration fixtures (all seed data). The
  voice agent opens these briefings with *"Simulated demonstration data"*.
  Numeric values (−4.8 dB, −21 mm, 94.2 %…) are fixtures, not measurements.
- **`live`** — produced by the worker from real co-registered NISAR granules
  (ΔdB = 10·log₁₀(after) − 10·log₁₀(before); GUNW displacement is relative,
  line-of-sight).

Simulated data is never presented as a live observation.

## Quickstart

Prereqs: Docker Desktop, Python 3.12, Node 24 LTS.

```powershell
# 1. Database (auto-applies sql/ on first init)
docker compose up -d

# 2. Backend
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe -m pytest backend\tests -q
.venv\Scripts\python.exe -m uvicorn backend.api_server:app --port 8077

# 3. Worker (optional; demonstrates the queue + offline fallback)
.venv\Scripts\python.exe -m backend.worker --once

# 4. Frontend cockpit
cd gods-eye-view
npm ci
npm run dev        # http://localhost:4173 → toggle "NASA NISAR SAR" layer
```

Try it:

```
curl "http://localhost:8077/api/nisar/pinpoint?lat=49.3858&lon=-121.4419&radius_km=25"
```

## Cloudflare edge deployment

The cockpit also runs serverless on Cloudflare Pages: a Pages Function
(`gods-eye-view/functions/api/nisar/[[path]].js`) serves
`/api/nisar/anomalies` and `/api/nisar/pinpoint` at the edge with the exact
same contract as the local PostGIS chain — normalized rows for the layer,
`data_mode` / `provenance` / `voice_briefing` for pinpoint, distance and
urgency replicating `fn_pinpoint_nisar_anomalies` (verified byte-equal against
the live backend by a 16-check parity suite). Rows stay
`data_mode: "simulated"` — deterministic fixtures, never presented as live
observations.

```powershell
cd gods-eye-view
npx wrangler login     # one-time browser OAuth
npm run build
npx wrangler pages deploy    # project: dancing-with-the-sars (wrangler.jsonc)
```

Then attach the custom domain in the Cloudflare dashboard: **Workers & Pages →
dancing-with-the-sars → Custom domains → add `sars.rabbitholedigitalsolutions.com`**
(the zone is already on Cloudflare, so DNS is wired automatically).
External live layers that depend on the local dev proxies (flights, vessels,
etc.) degrade gracefully on the edge build; the globe, NISAR layer, HUD cards,
and Director scene are fully functional.

## Voice demo

With a Gemini or OpenAI key configured in gods-eye-view, say:

> "Fly to BC Milepost 14 and scan NISAR radar anomalies."

The `scan_nisar_radar` tool flies the camera, enables the NISAR layer, calls
`/api/nisar/pinpoint`, and speaks the tactical briefing (beginning with the
simulated-data disclosure when applicable).

## Data sources & citations

- **NISAR mission** — NASA-ISRO Synthetic Aperture Radar, L-band 24 cm.
  https://nisar.jpl.nasa.gov/
- **NASA Earthdata / ASF DAAC** — NISAR Level-2 GCOV & GUNW product access.
  https://asf.alaska.edu/ · https://urs.earthdata.nasa.gov/
- **ASF OpenSARLab NISAR cookbook conventions** for GCOV HDF5 paths
  (`/science/LSAR/GCOV/grids/frequencyA/`).
- **gods-eye-view** by Bilawal Sidhu — MIT-licensed 3D globe cockpit
  (bundled third-party data sources keep their own licenses; see
  `gods-eye-view/DATA_SOURCES.md`). https://github.com/bilawalsidhu/gods-eye-view
- **PostGIS** · **FastAPI** · **earthaccess** · **h5py** · **CesiumJS**.

## AI disclosure

This project was built with AI assistance (Anthropic Claude). All seeded
demo values are synthetic fixtures labeled `data_mode: "simulated"`; no
claimed NISAR measurement in the demo is a real observation. Architectural
patterns (spatial indexing, queue claiming, time-decay scoring) were
independently implemented in this repository under Apache-2.0.

## License

Apache-2.0 — see [LICENSE](LICENSE). The `gods-eye-view/` subdirectory is MIT
(upstream); `codex_kit/` is the earlier submission-kit handoff with its own
LICENSE file.
