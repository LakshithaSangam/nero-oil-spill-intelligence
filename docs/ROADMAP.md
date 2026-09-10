# Neuro — Build Roadmap

Built **module by module**. Each milestone is independently reviewable and leaves the
app in a runnable state. No milestone edits a previous module's internals — only its
declared schema.

**Status (2026-09-06): M0–M7 complete.** The full workflow + multi-agent orchestration
+ all ten advanced features run end-to-end on the mock scenario. 31 backend tests,
clean type-check & build. See [../TESTING.md](../TESTING.md). Only **M∞** (real
Copernicus / NOAA / AIS providers + trained detection weights) remains — it needs
credentials and is a per-provider drop-in behind the existing interfaces.

---

## M0 — Foundation  ·  *this milestone*

- [x] Monorepo layout, `ARCHITECTURE.md`, this roadmap
- [x] Root tooling: `Makefile`, `.gitignore`, `infra/docker-compose.yml` (Postgres + PostGIS)
- [x] Backend skeleton: FastAPI app factory, config, `api/v1` router, health route
- [x] Data Provider Layer: base Protocols + registry for imagery / incidents / oceanography / AIS, with **mock** implementations
- [x] Shared schemas (pydantic) for every module's I/O contract
- [x] Frontend scaffold: Next.js + TS + Tailwind + MapLibre deps, design tokens, `globals.css`
- [x] One realistic scenario fixture: **"Arabian Sea tanker discharge"**

**Runnable:** backend `/docs` lists every endpoint (mock data); frontend builds.

---

## M1 — App shell & map experience  ·  *done*

- [x] Workspace shell: icon rail nav, command bar (go-to-coordinates), status strip, theme toggle
- [x] MapLibre canvas as persistent centrepiece — Esri World Ocean bathymetry base, desaturated + navy-washed for an abyssal chart look; ResizeObserver + visibility handling
- [x] Layer manager + legend (grouped Base / Detection / Drift / Vessels / Environment; future layers tagged with their milestone), map controls (zoom / compass / 3-D), coordinate + zoom + scale readout
- [x] Cursor ripple field — canvas, rAF, pointer sampling throttled, capped ripple count, inert under `prefers-reduced-motion`
- [x] Investigation list + investigation workspace with 8 sub-tab routes (Overview live; Detection / Ocean / Vessels / Environment / Timeline / Knowledge graph / Report scaffolded with milestone tags)
- [x] "Data Providers" screen — live from `GET /v1/providers`, all four domains, health + active selection
- [x] Dashboard (incidents + investigations + scenario switch) · Incident catalog (live, filterable) · Vessel risk index placeholder

**Runnable:** navigate the whole app; map renders and flies to the active scenario AOI; `npm run build` clean.

---

## M2 — Module 1: Detection & Characterisation  ·  *done*

- [x] `providers/imagery` mock returns SAR + EO scene refs and tiles for the scenario
- [x] `modules/detection`: `preprocess` (SAR chain report) → `SegmentationModel` Protocol + `MockSegmentationModel` (elongated slick + trailing sheen fragment) → `validate_with_eo` (optical cross-check, confidence delta) → `geometry` (Shapely + `pyproj.Geod`: area, perimeter, centroid, slick length, fragments) → `characterisation` (Bonn-code thickness → volume bbl, oil type from cargo hint, age from length/drift) → confidence score
- [x] API: `POST /v1/detection/run`, `GET /v1/detection/{id}`, `GET /v1/detection/scenes`
- [x] Frontend: spill polygon + boundary map layers (auto-enabled on result), staged phase runner, spill-stats panel (area / volume / oil type / age / confidence bars / false-positive checks / scene ids), imagery pane, live pipeline-stage status on the investigation overview

Scenario result: ~14.7 km² slick, 2 fragments, 13.9 km long, metallic film, 460–4 600 bbl, crude (55%), detection confidence 83%.

---

## M3 — Module 2: Ocean Intelligence Engine  ·  *done*

- [x] `providers/oceanography` mock: ESE monsoon current + ENE wind + tide/wave/SST grid for any AOI/window
- [x] `modules/ocean_intelligence`: vectorised RK2 particle engine (`advection.py`, `fields.py`); `hindcast.py` — age-graded reverse advection → origin point, probability surface, release window, backtrack paths, confidence from cluster tightness; `forecast.py` — 3-member forcing ensemble (nominal / wind-driven / current-dominated) → drift tracks, `expected_area_km2_by_hour`, coastal landfall ETAs + likelihood vs `geo_features.py` receptors
- [x] API: `POST /v1/ocean/hindcast` + `/forecast`, `GET` variants. Hindcast ≈ 0.6 s, forecast ≈ 1.1 s.
- [x] Frontend: ocean tab (hindcast + forecast sections, phase steppers, confidence bar, ensemble list, expansion bars, coastal-exposure list); map layers — origin probability surface + point, dashed backtrack paths, forecast ensemble tracks + heads, coast lines coloured by likelihood
- [x] `detected_at` now = SAR acquisition time (hindcast/forecast windows are scenario-relative)

Scenario result: origin ~31 km WSW of the slick, release window 2026-08-27 11:00–23:05 UTC (conf 0.69); slick expands 23 → 241 km² over 72 h; Saurashtra south coast landfall ETA ~48 h at 30% likelihood (wind-driven member).

---

## M4 — Module 3: Maritime Investigation Engine  ·  *done*

- [x] `providers/ais` mock reworked: window-anchored fleet — a tanker that decelerates to a loiter at the source, goes AIS-dark for 3 h across the release window and resumes on a kinked course, plus two clean transits and a local trawler
- [x] `modules/investigation`: `reconstruction.py` (AIS within `search_radius_km` of the hindcast origin during the padded window) → `behaviour.py` (closest approach, speed drop / loiter, course & route deviation, AIS-gap overlap, drift alignment, time correlation) → `scoring.py` (importance-weighted logistic over incriminating / mitigating `EvidenceFactor`s) → `evidence.py` (Explainable Evidence Card + track GeoJSON with a dashed gap connector + narrative + confidence)
- [x] API: `POST /v1/investigation/run` (needs detection + hindcast), `GET /v1/investigation/{id}`. ~0.3 s.
- [x] Frontend: `store/investigation.ts`, `components/panels/EvidenceCard.tsx` (score bar, incriminating/mitigating factor bars, vessel & company intelligence, focus-on-map), vessels tab; map — suspicion-graded AIS track lines, dashed AIS-gap segments, closest-approach markers, a ring on the lead suspect
- [x] Also improved M1/M2/M3: `slick_offset_km` places the observed slick down-drift of its source, so the hindcast now lands ~3–4 km from the true origin and its release window matches the scenario's

Scenario result: **MV HORIZON** (crude tanker, Panama) ranked #1 at **94%** — passed 2.4 km from the origin, AIS silent 180 min across the release window, slowed 11 → 1.8 kn, declared crude, 2 prior violations. Transit traffic scores 12–25%.

---

## M5 — Module 4 complete + Report Generator  ·  *done*

- [x] `modules/cause_classification` (v1): transparent rule-scorer over morphology + hindcast + suspects → `CauseAssessment` (cause, probability, evidence, alternatives)
- [x] `modules/environmental` (v1): joins the forecast's coastal ETAs with receptor sensitivity/distance → Environmental Priority Score, affected area, cleanup-cost & liability ranges. `POST /v1/environment/{detection_id}` + GET
- [x] `services/report_generator`: assembles detection + hindcast + forecast + suspects + environmental + cause into `InvestigationReport` (executive summary + 7 markdown sections) with a standalone HTML render. `POST /v1/reports`, `GET /v1/reports/{id}`, `GET /v1/reports/{id}/render.html`. ~0.3 s.
- [x] Frontend: **Report tab** (cause card, exec summary, collapsible sections, printable-view link), **Environment tab** (priority, receptors, cost), **Timeline tab** (forecast scrubber + play/pause, map playhead per ensemble member), **Overview "Run full pipeline"** (sequential client runner, every stage shows live status)

Scenario report: cause **illegal bilge dumping (62%)** (alt: maintenance discharge 38%), lead suspect MV HORIZON, environmental priority 55%, cleanup $0.9 M–$122 M.

---

## M6 — Multi-agent orchestration  ·  *done*

- [x] Six agents (`agents/pipeline_agents.py`), each wrapping one module and returning a narrated `AgentResult`
- [x] `agents/orchestrator.py` walks the fixed DAG (Satellite → Ocean → Vessel → Investigation; Ocean → Environmental; {Investigation, Environmental} → Report) in dependency order, yields `AgentEvent`s, and SKIPs any phase whose upstream failed
- [x] `services/investigation_runs.py`: run manager — creates a run, drives the workflow as a background task, fans events to SSE subscribers (replay-then-live)
- [x] API: `POST /v1/investigations` (202, kicks the workflow), `GET /v1/investigations`, `GET /v1/investigations/{id}`, `GET /v1/investigations/{id}/events` (SSE)
- [x] Frontend: `store/investigationRun.ts` (EventSource), `components/panels/ActivityFeed.tsx` (live narration with running/done icons + bold markdown), Overview "Run with agents" button, `lib/hydrate.ts` fills every module store from the finished run so the map + all tabs light up, agent runs listed on the investigations page

Scenario run: 6 agents, ~12 events, ends "Attribution is **strong**: MV HORIZON at 94%" → "cause: illegal bilge dumping (62%)".

---

## M7+ — Advanced features (one per slice)

### M7a — Pollution Risk Index + Micro-Leak Early Warning  ·  *done*

- [x] `fixtures/vessel_history.py`: synthetic prior micro-leaks / MARPOL citations / PSC detentions per vessel
- [x] `modules/risk_index/microleak.py`: flags **recurring pollution behaviour** (≥3 micro-leaks in ≤120 days, same corridor) + trend (escalating / steady / sporadic)
- [x] `modules/risk_index/index.py`: logistic score over signed factors — prior violations, recurring micro-leaks, live investigation exposure, persistent-oil cargo, high-risk routing, clean record; tiers low / elevated / high / critical
- [x] `providers/ais` gained `fleet()`; API `GET /v1/risk/index`, `GET /v1/risk/vessel/{mmsi}`
- [x] Frontend: `/vessels` page = the risk leaderboard (score bar, tier, recurring-pollution flag, factor breakdown, micro-leak timeline, record); `FleetRiskChip` cross-links suspects on the investigation Vessels tab

Scenario: MV HORIZON ranks #1 at 93% (critical) on history alone; 98% with a live case attached. Transit traffic 22%.

### M7b — Spill Similarity Search + Maritime Knowledge Graph  ·  *done*

- [x] `fixtures/historical_spills.py`: a 6-case library with comparable signatures (area, oil type, thickness, elongation, fragments, cause, vessel type, outcome)
- [x] `modules/similarity/`: weighted feature match (area / oil / thickness / morphology / region / season) → ranked cases + **inferred cause & vessel type** from the nearest precedents. `GET /v1/similarity/{detection_id}`
- [x] `modules/knowledge_graph/`: assembles one graph from a completed investigation — spill ↔ origin ↔ drift ↔ cause ↔ incident ↔ vessels ↔ company ↔ cargo ↔ flag ↔ evidence ↔ risk ↔ receptors ↔ precedent (24 nodes / 29 edges for the scenario). `GET /v1/graph/{detection_id}` (lazily runs similarity)
- [x] Frontend: "Similar historical spills" section on the Detection tab; **Knowledge Graph tab** = an interactive SVG node-link diagram (deterministic radial layout, click / hover to trace links, scroll-zoom, drag-pan, node detail panel with linked-node navigation). Both wired into `hydrate.ts`

Scenario: nearest precedent "Operational discharge — Gulf of Kutch approaches" (83% match) → infers *illegal bilge dumping*, tanker.

### M7c–f — remaining advanced features  ·  *done*

- [x] **Historical satellite timeline + before/after recovery** — `modules/detection/timeline.py`: runs segmentation over every SAR pass (`Scenario.timeline_profile` scales the mock slick per date), classifies trend (new / expanding / stable / recovering), and a `RecoveryAnalysis` when shrinking. `GET /v1/detection/{id}/timeline`; shown on the Detection tab with a sparkline
- [x] **Scientific reconstruction player** — Timeline tab gains a *Reconstruction* mode scrubbing from `release_window − 2h` through the forecast horizon; the map animates the suspect along its AIS track and pins it to the estimated discharge point while AIS is dark. Backs on timestamped track vertices added to the Evidence Card
- [x] **Deeper cause classification** — `classify()` now folds in the similarity result (nearest precedent's cause reinforces the score, with an evidence line)
- [x] **Deeper environmental impact** — reef + mangrove receptors added; per-class `response_note`, `exposure`, `receptor_summary`, and a `response_guidance` list; sensitive-habitat exposure double-weights the priority score
- [x] **Vessel & company intelligence dossier** — `services/vessel_dossier.py` composes static particulars + risk profile + prior record + every investigation appearance. `GET /v1/vessel/{mmsi}/dossier`; shown in the risk-index row detail

All 10 advanced features shipped (M7a–f). 31 backend tests. See [TESTING.md](../TESTING.md).

---

## M∞ — Real data integration

Per domain: implement the real provider behind its existing Protocol, add credentials
to env, flip `<DOMAIN>_PROVIDER`. No pipeline or UI changes. Full signup checklist in
[DATA_INTEGRATION.md](DATA_INTEGRATION.md).

- [x] **Oceanography → Open-Meteo Marine** (`open-meteo-marine`) — keyless, implemented
  and tested end-to-end (`tests/test_open_meteo_provider.py`); real currents/wind/wave/SST
  drive hindcast + forecast. Shared HTTP helper `providers/_http.py` added.
- [x] **Oceanography → Copernicus Marine Service** (`copernicus-marine`) — CMEMS
  user/pass, implemented + tested (`tests/test_copernicus_marine_provider.py`).
  `copernicusmarine` toolbox → hourly `uo/vo/thetao` + 3-hourly `VHM0`; wind reused
  from Open-Meteo via `providers/oceanography/_wind.py`. Slow (toolbox catalogue
  cost); health cached 10 min. `cors_origins` settings parsing hardened as a
  side-fix (`.env` broke on the bare-string value).
- [x] **Imagery → Copernicus Data Space** (`copernicus-dataspace`) — real OData
  catalogue search (keyless) for Sentinel-1 GRD / Sentinel-2 L2A; `fetch_scene`
  resolves footprint + quicklook. Shared CDSE OAuth helper
  `providers/imagery/_cdse_auth.py` (password or client-credentials grant). Tested
  (`tests/test_copernicus_dataspace_provider.py`). Pixel segmentation still mock.
- [x] **Imagery → `hybrid`** — scenario replay scenes + real CDSE scenes in one
  provider; keeps `detection.run` deterministic, adds real coverage to the scene
  list / timeline; degrades to mock-only offline. Default in `.env.example`.
  Tested (`tests/test_hybrid_imagery_provider.py`).
- [ ] Imagery → Sentinel Hub / NASA Earthdata / USGS
- [x] **Incidents → NOAA IncidentNews** (`noaa`) + `hybrid` — keyless Atom-feed
  client (recent NOAA OR&R responses); `hybrid` keeps the scenario ground-truth
  catalog and appends real NOAA entries, `get()` still resolves scenario ids.
  Default `INCIDENT_PROVIDER=hybrid`. Tested (`tests/test_noaa_incidents_provider.py`).
- [x] **AIS → Global Fishing Watch** (`global-fishing-watch`) — bearer token,
  implemented + tested (`tests/test_global_fishing_watch_provider.py`). `tracks()`
  from `POST /4wings/report` presence (hourly centroids; gaps inferred), `vessel()`
  from `/vessels/search`. Investigation pipeline verified on real Arabian Sea vessels.
- [x] **AIS → MarineCadastre** (`marine-cadastre`) — keyless US daily-zip archive,
  true per-message tracks, disk-cached. US waters only → empty for the Arabian Sea
  scenario. Tested (`tests/test_marine_cadastre_provider.py`).
- [x] **Detection → trained U-Net pipeline** (`SEGMENTATION_MODEL=trained-unet`) —
  `app/ml/` (U-Net, Zenodo 8346860 dataset loader, `python -m app.ml.train`) +
  `TrainedUNetSegmentationModel` inference; `requirements-ml.txt`. Smoke-tested on the
  real mask format (`tests/test_ml_segmentation.py`). No GPU here → the actual
  checkpoint is a user GPU run; falls back to the scenario model without one.
- [~] **Detection → real segmentation** — `SEGMENTATION_MODEL=classical-sar`
  ([`sar_segmenter.py`](../backend/app/modules/detection/sar_segmenter.py)): classical
  dark-spot detection (adaptive threshold + morphology + contrast/shape filtering) on
  the keyless CDSE Sentinel-1 quicklook. Recovers an injected slick in tests; on a
  clean real scene it honestly returns "no candidate" and the service falls back to
  the scenario model. A **trained CNN** behind the same interface is still the
  precision path (needs torch + labelled data / a checkpoint).
- [x] Ocean wind history — `_wind.py` falls through to the keyless Open-Meteo **ERA5
  archive** for windows older than ~80 days.
