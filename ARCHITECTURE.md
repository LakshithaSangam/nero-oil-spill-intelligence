# Neuro — System Architecture

> Version 0.1 · Status: **foundation / scaffolding**
> This document is the contract. Modules are built against it one at a time.

---

## 1. System objective

Automate the end-to-end maritime oil-spill investigation:

```
Detect  →  Characterise  →  Hindcast origin  →  Reconstruct AIS  →
Rank suspects  →  Forecast drift  →  Assess environment  →  Visualise  →  Report
```

Every stage is independent, consumes a typed contract, and is individually replaceable.

---

## 2. High-level topology

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                             │
│                                                                            │
│   MapLibre canvas (centrepiece)   ·   Investigation workspace   ·   Panels  │
│   Zustand stores   ·   API client   ·   Client Provider Registry (mock)     │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  REST / JSON  (OpenAPI-typed)
┌───────────────────────────────┴────────────────────────────────────────────┐
│                              BACKEND (FastAPI)                              │
│                                                                            │
│   api/v1/routes ── schemas (pydantic contracts) ── services                │
│        │                                                                   │
│        ├── Agent Orchestrator ──┬── Satellite Agent  ── Module 1           │
│        │                        ├── Ocean Agent      ── Module 2           │
│        │                        ├── Vessel Agent     ── Module 3           │
│        │                        ├── Investigation Ag. ── Module 3          │
│        │                        ├── Environmental Ag. ── Adv. 7            │
│        │                        └── Report Agent     ── Report Generator   │
│        │                                                                   │
│   ┌────┴─────────────────  DATA PROVIDER LAYER  ───────────────────────┐    │
│   │  imagery/   incidents/   oceanography/   ais/                      │    │
│   │  each: base.py (Protocol) + N implementations + mock.py + registry │    │
│   └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│   db/ (SQLAlchemy + GeoAlchemy2)  ──►  PostgreSQL + PostGIS                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Provider Layer

The single most important architectural rule: **the AI pipeline never imports a
concrete provider.** It asks the registry for a capability and receives whatever
implementation the current configuration selects.

### 3.1 Capability domains

| Domain          | Interface (`base.py`)      | Primary                         | Fallback / alternates                                   | Ground-truth use |
| --------------- | ------------------------- | ------------------------------- | ------------------------------------------------------ | ---------------- |
| **Imagery**     | `ImageryProvider`        | Copernicus Data Space (Sentinel-1 SAR) | Sentinel Hub · NASA Earthdata · USGS EarthExplorer | Sentinel-2 EO for optical validation |
| **Incidents**   | `IncidentProvider`       | NOAA Marine Pollution Monitoring | (mock catalog)                                       | validation, replay, comparison |
| **Oceanography**| `OceanographyProvider`   | Copernicus Marine Service       | Open-Meteo Marine API                                 | hindcast + forecast forcing |
| **AIS**         | `AISProvider`            | *(configurable)*                | MarineCadastre · Global Fishing Watch · other APIs    | historical reconstruction |

NOAA is a **ground-truth incident database**, never an imagery source.

### 3.2 Provider contract (shape)

```python
class ImageryProvider(Protocol):
    id: str
    display_name: str
    capabilities: ImageryCapabilities          # sensors, revisit, resolution, latency

    async def search(self, aoi: Polygon, time_range: TimeRange,
                     sensor: Sensor) -> list[SceneRef]: ...
    async def fetch_scene(self, ref: SceneRef) -> RasterTile: ...
    async def health(self) -> ProviderHealth: ...
```

Analogous protocols exist for incidents, oceanography and AIS. Each domain also ships
a `MockProvider` returning fixtures from `backend/app/fixtures/`.

### 3.3 Registry & selection

```python
registry.register(CopernicusDataSpaceImagery())
registry.register(SentinelHubImagery())
registry.register(MockImagery())

provider = registry.get("imagery", settings.IMAGERY_PROVIDER)   # env-driven
```

`settings.<DOMAIN>_PROVIDER` env vars pick the active implementation. Unset → `mock`.
The frontend has a mirror `Provider Registry` (client-side, mock only) so the
dashboard's "Data Providers" screen can display availability and let a dev toggle
scenarios without a backend.

---

## 4. Pipeline modules

Each module = a `service.py` (public entrypoint), internal helpers, a pydantic
`input`/`output` schema pair, and fixtures. Modules communicate only through schemas.

### Module 1 — AI Spill Detection & Characterisation
`backend/app/modules/detection/`

| In                              | Steps                                                            | Out |
| ------------------------------- | --------------------------------------------------------------- | --- |
| Sentinel-1 SAR tile, Sentinel-2 EO tile, AOI | SAR preprocessing → segmentation model → EO cross-validation → boundary vectorisation → geometry | `SpillDetection`: polygon (GeoJSON), area, perimeter, est. volume, oil-type estimate, spill-age estimate, confidence |

Model interface is a `SegmentationModel` Protocol — mock returns a plausible mask;
a trained PyTorch U-Net/DeepLab drops in later.

### Module 2 — Ocean Intelligence Engine
`backend/app/modules/ocean_intelligence/`

Physics engine. Consumes currents / wind / waves / tide / SST from the oceanography
provider.

- **Hindcast** — reverse particle advection from the detected polygon → origin
  probability surface + release-time window.
- **Forecast** — forward particle ensemble → drift scenarios, expansion, coastal
  intersection ETAs.

Output: `DriftAnalysis` (origin heatmap GeoJSON, release window, N forecast scenario
tracks with probability weights, affected-coast list).

### Module 3 — Maritime Investigation Engine
`backend/app/modules/investigation/`

1. Query AIS provider for tracks intersecting the hindcast origin ± window.
2. Per vessel: proximity, speed profile, heading, route deviation, AIS gaps, cargo,
   vessel type, behavioural anomalies, time correlation with release window.
3. Score + build an **Explainable Evidence Card** per vessel.

Output: `SuspectRanking` — ordered list of `EvidenceCard { vessel, score, factors[] }`.

### Module 4 — Decision Support & Visualisation
`frontend/`

Interactive GIS dashboard. Layers: live imagery, spill polygon, spill stats, hindcast
origin, forecast paths, AIS tracks, ranked suspects, spill timeline, environmental
overlays, confidence indicators, report.

### Report Generator
`backend/app/services/report_generator.py` — assembles a structured investigation
report (JSON → rendered PDF/HTML) from all module outputs.

---

## 5. Advanced feature slots (architecture reserved, built later)

| # | Feature                          | Home |
| - | -------------------------------- | ---- |
| 1 | Historical Satellite Timeline (new/expanding/stable/recovering) | `modules/detection/timeline.py` + frontend timeline |
| 2 | Before/After Recovery Analysis   | `modules/detection/recovery.py` |
| 3 | Spill Reconstruction Timeline (scientific, animated) | `modules/ocean_intelligence/reconstruction.py` + frontend player |
| 4 | Spill Cause Classification       | `modules/cause_classification/` |
| 5 | Micro-Leak Early Warning         | `modules/risk_index/microleak.py` |
| 6 | Pollution Risk Index (per vessel)| `modules/risk_index/` |
| 7 | Environmental Impact Intelligence| `modules/environmental/` |
| 8 | Vessel & Company Intelligence    | `providers/ais/` + `modules/investigation/vessel_profile.py` |
| 9 | Spill Similarity Search          | `modules/similarity/` (vs NOAA incidents) |
| 10| Maritime Knowledge Graph         | `modules/knowledge_graph/` + frontend graph view |
| 11| Multi-Agent Investigation        | `agents/` (already the orchestration backbone) |

---

## 6. Multi-agent architecture

`agents/orchestrator.py` runs a directed workflow; each agent wraps one module and
emits a typed `AgentResult` plus a human-readable rationale, streamed to the frontend
as investigation "activity".

```
Orchestrator
 ├─ SatelliteAgent      → Module 1
 ├─ OceanAgent          → Module 2 (hindcast + forecast)
 ├─ VesselAgent         → Module 3 (AIS reconstruction + behaviour)
 ├─ InvestigationAgent  → Module 3 (scoring + evidence cards)
 ├─ EnvironmentalAgent  → Adv. 7
 └─ ReportAgent         → Report Generator
```

Agents are deterministic pipeline coordinators in v1 (no LLM dependency); an LLM
reasoning layer can be added behind the same `Agent` base class.

---

## 7. Contracts & typing

- Backend request/response models: **pydantic v2** in `backend/app/schemas/`.
- FastAPI emits **OpenAPI 3.1**; frontend types are generated from it into
  `frontend/src/types/api.ts` (`make gen-types`).
- Geometry travels as **GeoJSON** (RFC 7946), CRS EPSG:4326. PostGIS stores geometry
  in 4326; equal-area math uses on-the-fly projection in GeoPandas.

---

## 8. Frontend architecture

```
src/
  app/                       Next.js App Router
    (workspace)/             authenticated shell: sidebar nav + persistent map
      dashboard/             fleet + incident overview
      investigations/[id]/   the investigation workspace (map-centric, sub-tabs)
      incidents/             NOAA ground-truth catalog
      vessels/               pollution risk index
      providers/             data-provider status & scenario switch
  components/
    map/                     MapLibre wrapper, layers, controls, legends
    panels/                  dockable right-hand analysis panels
    layout/                  shell, sidebar, command bar, status strip
    charts/                  time series, gauges, distributions
    effects/                 cursor ripple field (canvas, rAF, pointer-throttled)
    ui/                      primitives (Card, Tabs, Badge, Score, Sheet…)
  lib/
    api/                     typed fetch client
    providers/               client provider registry (mock)
    geo/                     bbox, turf helpers, formatting
    mock/                    scenario fixtures (GeoJSON + JSON)
  store/                     zustand: investigation, map, layers, ui
  hooks/
  styles/tokens.css          design tokens (single source of truth)
```

### 8.1 Design system

- **Palette** — Midnight Navy `#0A1826`, Deep Teal `#0F3D3E`, Sea Emerald `#1F7A6B`,
  Bioluminescent Cyan `#5FE3D0`, Soft Coral `#FF8C6B`, Warm Sand `#E8DFCF`.
  No generic bright blue. Dark-first; light theme is a token swap.
- **Typography** — Geist / Inter for UI, tabular numerals for metrics. Calm scale.
- **Surfaces** — rounded (14–20px), subtle depth, minimal glassmorphism, no neon glow.
- **Motion** — 150–250ms ease transitions; cursor ripple is a lightweight canvas
  field (capped particle count, `requestAnimationFrame`, pointer sampling throttled),
  disabled under `prefers-reduced-motion`.
- The **map is the centrepiece**; panels float over it, never replace it.

---

## 9. Backend architecture

```
app/
  main.py                    FastAPI app factory, CORS, lifespan
  core/config.py             pydantic-settings (env), provider selection
  api/v1/                    routers → services (thin controllers)
  schemas/                   pydantic contracts (shared with frontend via OpenAPI)
  providers/<domain>/        Data Provider Layer (base + impls + mock + registry)
  modules/<module>/          AI pipeline stages (service + helpers + fixtures)
  agents/                    orchestrator + per-stage agents
  services/                  report_generator, scenario loader
  db/                        SQLAlchemy models, session, PostGIS
  fixtures/                  mock scenarios: GeoJSON scenes, incidents, AIS, ocean
```

Everything async. Providers and models are injected via `Depends` + the registry so
tests and mock mode are the default path, not a special case.

---

## 10. Environments & configuration

| Var                         | Purpose                          | Default |
| --------------------------- | ------------------------------- | ------- |
| `IMAGERY_PROVIDER`          | active imagery impl              | `mock`  |
| `INCIDENT_PROVIDER`         | active incident impl            | `mock`  |
| `OCEANOGRAPHY_PROVIDER`     | active oceanography impl        | `mock`  |
| `AIS_PROVIDER`              | active AIS impl                 | `mock`  |
| `COPERNICUS_*` / `SENTINELHUB_*` / `EARTHDATA_*` | real credentials | unset |
| `DATABASE_URL`             | PostGIS DSN                     | compose value |
| `NEXT_PUBLIC_API_BASE_URL` | frontend → backend             | `http://localhost:8000` |

No real API keys are required to run v1. Adding keys + flipping one env var switches a
domain to live data with zero pipeline edits.

---

## 11. What v1 delivers

- Complete monorepo, folder structure, and typed contracts (this document).
- Data Provider Layer with mock implementations for all four domains.
- Backend API surface for every module, returning fixture-driven realistic output.
- Frontend: oceanic design system, app shell, navigation, MapLibre workspace, and the
  Module 4 dashboard wired to the mock pipeline end-to-end.
- One fully replayable scenario (a realistic Arabian Sea tanker discharge).

Subsequent milestones implement each module's real logic per
[`docs/ROADMAP.md`](docs/ROADMAP.md).
