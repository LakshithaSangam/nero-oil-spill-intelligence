# Neuro — Backend

FastAPI service hosting the AI pipeline, multi-agent orchestrator, and the Data
Provider Layer.

## Run

```bash
python -m venv .venv
.venv/Scripts/pip install -U pip -r requirements.txt   # Windows
# source .venv/bin/activate && pip install ...          # POSIX
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs.

## PyTorch

Detection model weights are added in a later milestone. Install the platform-correct
build when needed:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

Until then, `modules/detection` runs against the mock `SegmentationModel`.

## Layout

| Path                    | Responsibility                                            |
| ----------------------- | -------------------------------------------------------- |
| `app/core/`             | config (env), logging, error handlers                   |
| `app/api/v1/`           | thin routers → services                                 |
| `app/schemas/`          | pydantic contracts (also the frontend's types via OpenAPI) |
| `app/providers/`        | Data Provider Layer — base Protocols, registry, impls, mocks |
| `app/modules/`          | AI pipeline stages (Module 1–4 + advanced feature slots)|
| `app/agents/`           | orchestrator + per-stage agents                         |
| `app/services/`         | report generator, scenario loader                       |
| `app/db/`               | SQLAlchemy + GeoAlchemy2 models, async session          |
| `app/fixtures/`         | mock scenarios (GeoJSON + JSON)                         |

Providers are selected by `IMAGERY_PROVIDER` / `INCIDENT_PROVIDER` /
`OCEANOGRAPHY_PROVIDER` / `AIS_PROVIDER`. Unset means `mock`.
