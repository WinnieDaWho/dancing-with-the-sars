# RHD Labs — integration handoff

## What Codex delivers

1. A buildless, responsive `index.html` showcase with two synthetic scenarios, a keyboard-accessible comparison slider, a four-step architecture walkthrough, source citations, disclosures, and working downloads.
2. A captioned 28.8-second concept reel, separate ambient music, SRT/VTT captions, narration scripts, and B-roll production prompts.
3. A seven-slide PDF and editable PowerPoint.
4. An Apache-2.0 Python/PostGIS scaffold, independent of proprietary SIARS/LinkBucket code.
5. Editable submission copy, a public-link checker, and a candid verification report.

## What Claude/Fable owns

The real GCOV/GUNW adapter; queued worker; FastAPI endpoints; PostGIS anomaly migration; gods-eye-view layer; GEV MIC registries; Director Mode scene; deployment of the actual application; and scientific validation of any claimed NISAR result. The supplied outline's code instructions target that engineering role. They are not evidence that those components have been implemented.

## Connect the full application

1. Deploy the application to a public HTTPS URL. `localhost:4173` on the participant's computer is not reachable from judges' browsers or from this execution environment.
2. Set `SHOWCASE_CONFIG.liveDemoUrl` near the bottom of the showcase `index.html` to that URL. The site then displays an “Open the full 3D application” link.
3. Once GitHub is public and accessible without credentials, set `SHOWCASE_CONFIG.githubUrl` to its verified URL.
4. Replace `assets/demo-reel.mp4` with a screen-recorded demonstration if available. Keep the reel below 30 seconds as requested by the outline, update its captions/poster and runtime label, and verify current official submission requirements separately.
5. If embedding in Google Sites, publish the standalone showcase and insert its public URL as an embed. The single-file HTML is also in the kit. Google Sites custom-domain mapping requires ownership verification and DNS access; it has not been configured here.

## Data and API contract

The planned routes are `GET /api/nisar/anomalies` and `GET /api/nisar/pinpoint?lat=...&lon=...&radius_km=...`. `integration-contract.json` supplies an example envelope. Add an explicit data mode and provenance to both routes. A seeded fallback must return `data_mode: "simulated"`; it must never silently impersonate a live observation.

For real observations preserve at least product/granule identifiers, source URLs, before/after acquisition times, CRS, polarization, orbit/viewing geometry, algorithm and parameters, quality masks, and uncertainty/limitations. Radius validation, bounded result sizes, parameterized SQL, and narrowly configured CORS belong in the API.

## Science corrections to the outline

- Treat the −4.8 dB, 88.5%, −21.0 mm, 94.2%, and 42-structure values as simulation fixtures unless actual data and a documented algorithm substantiate them.
- Avoid “15 cm underground,” “100% cloud penetration,” “real time,” “three-second lifeline,” and evacuation instructions as measured or validated capabilities.
- Compare co-registered, compatible GCOV observations. For positive power values, change in dB is `10*log10(after) - 10*log10(before)`; masks and units matter.
- GUNW phase-to-displacement interpretation is relative and line-of-sight. It is not vertical or downslope displacement without additional assumptions/evidence.
- Remote `h5py` slicing requires a suitable file-like driver/transport and authentication. `earthaccess` by itself does not make every HDF5 asset efficiently streamable.
- Preserve separate licenses for third-party assets inside gods-eye-view even though its source is MIT.

## Database guardrails to retain

The outline's conceptual guardrails are useful: perform ingestion HTTP outside database procedures; claim queue rows transactionally with `FOR UPDATE SKIP LOCKED`; match geography distance expressions with functional geography GiST indexes; explicitly type numeric return columns; and handle missing timestamps before applying time decay. These should be independently implemented, not copied from proprietary sources.

## Publishing and verification

Read `DELIVERY.md` and `qa-status.md` for actual published URLs and observed results. The GitHub integration could not create a repository; the participant was asked to create an empty public repository so the prepared commit can be pushed. Do not report GitHub or the 3D application as live until verified.

