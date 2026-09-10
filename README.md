# Neuro

**AI-powered Maritime Oil Spill Intelligence Platform**

Neuro automates the complete oil-spill investigation workflow: it detects marine
oil spills from satellite imagery, characterises them, reconstructs where and when the
spill originated, retrieves historical vessel traffic, ranks suspect vessels with
explainable evidence, forecasts spill drift, assesses environmental impact, and produces
an investigation report suitable for maritime authorities (Indian Coast Guard, IMO, EMSA,
NOAA and environmental monitoring agencies).

This repository is a **monorepo**:

| Path        | Stack                                               | Purpose                                             |
| ----------- | --------------------------------------------------- | -------------------------------------------------- |
| `frontend/` | Next.js · React · TypeScript · Tailwind · MapLibre  | Geospatial decision-support dashboard              |
| `backend/`  | FastAPI · Python · PyTorch · OpenCV · GeoPandas     | AI pipeline, agents, data-provider layer, REST API |
| `infra/`    | Docker Compose · PostgreSQL + PostGIS               | Local orchestration and spatial database          |
| `docs/`     | Markdown                                            | Architecture, module specs, roadmap               |

## Design principles

1. **Modular Data Provider Layer.** Every external data source (imagery, incidents,
   oceanography, AIS) sits behind a stable interface. Providers are swapped by
   configuration, never by touching the AI pipeline.
2. **Independent pipeline stages.** Detection → Ocean Intelligence → Investigation →
   Decision Support → Reporting. Each stage consumes a typed contract and can be
   upgraded in isolation.
3. **Mock-first, real-ready.** v1 runs entirely on realistic mock scenarios. Real
   Copernicus / Sentinel Hub / NOAA / AIS integrations drop in behind the same
   interfaces with no pipeline changes.
4. **Explainability everywhere.** Every score (suspicion, risk, environmental priority,
   similarity) ships with the evidence that produced it.

## Quick start

```bash
# 1. Infrastructure (Postgres + PostGIS)
make db-up

# 2. Backend  (http://localhost:8000, docs at /docs)
make backend-install
make backend-dev

# 3. Frontend (http://localhost:3000)
make frontend-install
make frontend-dev
```

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the module-by-module build plan and
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the full system design.
