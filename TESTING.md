# Neuro — running & testing

Two processes: the **FastAPI backend** and the **Next.js frontend**. Everything runs
on the deterministic *Arabian Sea tanker discharge* replay scenario — no API keys, no
network.

## It's already running

| Service  | URL                              |
| -------- | -------------------------------- |
| Frontend | http://localhost:5175            |
| Backend  | http://localhost:8000            |
| API docs | http://localhost:8000/docs       |

Open **http://localhost:5175** and go to **Investigations → INV-2026-0428**.

## The one-click path

On the investigation **Overview**, press **“Run with agents”**. Six agents run the
whole workflow server-side and narrate it in the *Investigation activity* feed:

```
Satellite → Ocean → Vessel → Investigation → Environmental → Report
```

When it finishes, the map lights up and every tab is populated. Then walk the tabs:

| Tab | What to look at |
| --- | --- |
| **Detection** | spill polygon + stats, **historical satellite timeline** (new/expanding/…), **similar historical spills** with an inferred cause, imagery list |
| **Ocean intelligence** | reverse-advection origin + release window, 3-member drift forecast, coastal ETAs |
| **Vessels** | ranked **Explainable Evidence Cards**; MV Horizon at ~94% with the AIS-gap / loiter / cargo evidence, plus a fleet-risk chip |
| **Environment** | receptor exposure incl. **reef / mangrove** (“no recovery”), priority score, cost/liability, **response guidance** |
| **Timeline** | toggle **Reconstruction** — scrub back through the discharge (marker pins to the estimated point while AIS is dark), then forward through the drift |
| **Knowledge graph** | interactive node-link graph — click a node, hover to trace links, scroll to zoom |
| **Report** | assembled dossier with cause assessment; **Printable view** opens the HTML render |

Other screens: **Dashboard**, **Incident catalog** (NOAA ground truth), **Vessel risk
index** (`/vessels` — the Pollution Risk Index + micro-leak early warning), **Data
providers** (the swappable provider layer).

## Restarting from scratch

```bash
# backend
cd neuro/backend
.venv/Scripts/python -m uvicorn app.main:app --port 8000        # POSIX: source .venv/bin/activate first
```
```bash
# frontend (production)
cd neuro/frontend
npm run build && npm start -- --port 5175
```

For live-reload development use `npm run dev` instead of `build && start`
(a dev-only `window.__oe` store handle is exposed for debugging).

## Tests

```bash
cd neuro/backend && .venv/Scripts/python -m pytest -q     # 31 tests
cd neuro/frontend && npm run build                        # type-check + build
```

## What is mock vs real

Every external dependency sits behind a provider interface and currently uses a
deterministic mock (`app/providers/*/mock.py`, `app/fixtures/*`). Swapping in real
Copernicus Sentinel-1/2, Copernicus Marine, NOAA and an AIS vendor is the `M∞`
milestone in [docs/ROADMAP.md](docs/ROADMAP.md) — set the `*_PROVIDER` env vars and
add credentials; no pipeline or UI changes.
