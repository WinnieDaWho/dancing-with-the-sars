# Dancing with the SARs — submission copy

Team: **RHD Labs**. Participant location: **Toronto, Canada**. Official event registration is not verified in this package.

This copy describes the delivered showcase and the proposed application separately. Before submitting, update the implementation status to match the code and data Claude/Fable actually delivers.

## Project Name

Dancing with the SARs — RHD Labs

## High-Level Summary

RHD Labs explores how NASA–ISRO NISAR radar can make Earth's surface changes easier to understand. Our prototype combines a windowed-data architecture, PostGIS spatial queries, and an interactive visualization concept, illustrated through Saskatchewan agricultural moisture and British Columbia slope-change scenarios. The public showcase includes a comparison slider, an architecture walkthrough, and a captioned concept reel. Its imagery and readings are synthetic; they are not validated NISAR detections or operational warnings.

## Detailed Description

### The problem

Earth's surface changes through natural processes and human activity. Those changes can be difficult to communicate, particularly when optical observations are limited by clouds. Radar offers a complementary perspective, but large scientific products and unfamiliar processing steps can make that perspective hard to use.

### Our approach

We propose an inspectable path from radar products to a human-readable map: discover appropriate NISAR GCOV observations through NASA Earthdata/ASF; access a bounded coordinate window through a supported HDF5 transport; compare appropriately matched observations; store validated features and their provenance in PostgreSQL/PostGIS; and serve GeoJSON to an interactive globe. A separate gods-eye-view integration is planned for voice queries and Director Mode flythroughs.

GCOV backscatter change and GUNW interferometry require different scientific treatment. Backscatter does not directly measure saturation percentage or water depth. Interferometry measures relative motion along the radar line of sight and does not, by itself, establish vertical or downslope movement. Calibration, geometry, masks, reference choices, and validation remain essential.

### The demonstration

The Saskatchewan scenario illustrates an agricultural moisture contrast. The British Columbia scenario illustrates a slope-change review area and nearby example structures. The locations and numerical readings are deterministic examples supplied by the concept outline. They are clearly labeled simulated. They do not demonstrate measured soil moisture, a specific storm, a real landslide, a count of actual threatened homes, or a basis for evacuation.

### What is delivered

The public static showcase provides an interactive comparison, scenario switching, an architecture walkthrough, a concept reel with English captions, a seven-slide deck, and a downloadable Apache-2.0 source scaffold. The scaffold contains a tested bounds-conversion helper and an initial PostGIS schema. Live Earthdata ingestion, quantitative change analysis, the 3D application, voice tools, and their end-to-end validation require the separate application deliverable.

### Why it matters

The goal is to reduce the gap between complex Earth-observation products and an understandable, traceable conversation about change. The design prioritizes public code, data provenance, explicit uncertainty, and a clear distinction between illustration and observation.

## Space Agency Data & Tools Used

- NASA–ISRO NISAR mission: https://nisar.jpl.nasa.gov/
- NISAR documentation and product access guidance, Alaska Satellite Facility: https://nisar-docs.asf.alaska.edu/
- ASF OpenSARLab NISAR Cookbook: https://github.com/ASFOpenSARlab/NISAR_Cookbook (Apache-2.0; reference only, no notebooks copied).
- NASA Earthdata: https://www.earthdata.nasa.gov/
- Target products: GCOV for geocoded covariance/backscatter analysis; GUNW for a separately validated interferometric workflow.
- Proposed software: earthaccess, asf_search, h5py, pyproj, Shapely, PostgreSQL/PostGIS, FastAPI, and CesiumJS through gods-eye-view.

**Data-use status:** No actual NISAR granule has been ingested or analyzed by this showcase. Do not list a granule as used unless the application deliverable supplies its identifier, acquisition time, processing details, and source URL. NASA/ISRO/ASF citations identify mission and technical references, not the provenance of the synthetic graphics.

## Journey Prompts — adaptable answers

**How did you approach the challenge?** We narrowed a broad radar-visualization challenge into two Canadian narratives and a pipeline that keeps the interface separate from data access and interpretation. We prepared a public scaffold and a visual walkthrough to make the approach inspectable.

**What did you learn?** Scientific provenance must remain visible all the way to the interface. Radar contrast is not automatically a moisture percentage, and line-of-sight motion is not automatically vertical displacement. Clear limits improve both the science and the storytelling.

**What was challenging?** Connecting large authenticated scientific assets to a public browser experience while preserving meaningful validation and honest fallback behavior. The demonstration therefore labels its synthetic examples explicitly.

**What comes next?** Validate a pair of suitable NISAR observations, replace the synthetic layer with documented results, complete the API/globe/voice integration, and compare interpretations with independent evidence.

## AI and Open-Source Disclosure

The human participant defined the project direction and team identity. Google Gemini supplied the initial outline. OpenAI Codex assisted with the static website, documentation, source packaging, captions, presentation, and procedural concept media. Claude/Fable is assigned the separate application work; describe its actual contribution after reviewing its output.

An attempt to generate narration using the Brian stock voice through Everygen returned `NO_SUBSCRIPTION`; no voice audio was produced. ElevenLabs/Higgsfield-generated assets are not included. The delivered concept reel uses original procedural graphics, burned-in English captions, and a procedurally synthesized ambient bed. The Brian/Daniel narration settings and Higgsfield prompts are retained as editable production instructions.

The original scaffold and showcase are Apache-2.0. gods-eye-view is a target integration: its source code has an MIT grant, while bundled and runtime third-party datasets have separate terms. Its source and datasets are not bundled here. Preserve all relevant upstream notices when integrating.

## Links to paste after publication

Public showcase and asset URLs are recorded in `DELIVERY.md` in the complete kit. The intended GitHub repository is `WinnieDaWho/dancing-with-the-sars`, but must be created and independently verified before listing it as published. The full 3D application URL must come from Claude/Fable's deployed application; localhost is not a public submission URL.

