# Data Integration (M∞) — switching providers off "mock"

Neuro's pipeline never imports a data source directly — it asks the **provider
registry** for whichever provider a domain is set to. Each of the four domains
(`imagery`, `incidents`, `oceanography`, `ais`) defaults to a deterministic `mock`
that replays the *Arabian Sea discharge* scenario. This document is the checklist for
wiring in the real sources.

Set the active provider per domain in `backend/.env` (copy from `.env.example`):

```
IMAGERY_PROVIDER=mock
INCIDENT_PROVIDER=mock
OCEANOGRAPHY_PROVIDER=mock
AIS_PROVIDER=mock
```

Restart the backend after any `.env` change. The **Providers** screen in the app
(`/providers`) shows each provider's live health and which one is active.

---

## Status

| Domain | Provider id | Real client | Credentials |
|---|---|---|---|
| oceanography | `open-meteo-marine` | **✅ implemented & tested** | **none — keyless** |
| oceanography | `copernicus-marine` | **✅ implemented & tested** | CMEMS username + password |
| imagery | `hybrid` | **✅ implemented & tested** | **none** (scenario mock + keyless CDSE search) |
| imagery | `copernicus-dataspace` | **✅ implemented & tested** | none for search; account for scene fetch |
| imagery | `sentinel-hub` | stub | OAuth client id + secret |
| imagery | `nasa-earthdata` | stub | bearer token |
| imagery | `usgs-earthexplorer` | stub | account (M2M access request) |
| incidents | `noaa` / `hybrid` | **✅ implemented & tested** | **none — keyless** (NOAA IncidentNews Atom feed) |
| ais | `global-fishing-watch` | **✅ implemented & tested** | API token (instant) |
| ais | `marine-cadastre` | **✅ implemented & tested** | none — US waters only (regional alt.) |
| detection | `trained-unet` | **pipeline ✅, checkpoint = your GPU run** | none (Zenodo dataset, CC-BY) |

"stub" = the class exists, is registered, and reports `unavailable` until its client
is written. The contract (`get_fields` / `search` / `query` / `tracks`) is already
defined by the domain's `base.py` Protocol, so implementing one is self-contained.

---

## Ready now — no action needed from you

### `open-meteo-marine` (oceanography fallback)

Keyless. Flip the switch and it works:

```
OCEANOGRAPHY_PROVIDER=open-meteo-marine
```

Pulls hourly wave height, SST, surface-current velocity/direction from the
Open-Meteo **Marine** API and 10 m wind from the **Forecast** API, samples a 3×3
lattice across the detection bbox, and feeds the drift engine. Verified end-to-end:
hindcast recovers the scenario origin within ~14 km and the release window within
~1 h using real currents. Covers roughly the last 90 days plus a 16-day forecast;
older windows need an archive/ERA5 client (not yet written).

Test: `pytest tests/test_open_meteo_provider.py` (skips itself if offline).
Windows older than ~80 days fall through to the keyless Open-Meteo **ERA5 archive**
for wind; historical waves/currents are not available keyless (the marine model has
no deep history).

### `classical-sar` (detection segmentation)

Keyless. `SEGMENTATION_MODEL=classical-sar` runs dark-spot detection on the real
Sentinel-1 quicklook — adaptive threshold, morphology, then per-component contrast /
shape / context filtering. Needs a real imagery scene (it forces a CDSE scene over
the mock one), and **falls back to the scenario model when it finds no candidate**,
so the pipeline always completes. Tests inject a synthetic slick and confirm it is
recovered; on a clean real scene "no candidate" is the correct answer. This is a
pre-CNN operational method, not a trained model — for precision you still want a CNN
behind `SegmentationModel` (needs torch + labelled data or a published checkpoint)
and the calibrated full-resolution GRD.
Test: `pytest tests/test_sar_segmenter.py`.

### `hybrid` / `noaa` (incidents)

Keyless. `INCIDENT_PROVIDER=hybrid` (the default in `.env.example`) returns the
scenario ground-truth incidents first, then appends real entries from the **NOAA
IncidentNews** Atom feed (`https://incidentnews.noaa.gov/incidents.atom`) — the ~10
most recent incidents NOAA OR&R has responded to, with a georss point, date and
summary. `hybrid.get(<scenario incident id>)` still resolves the mock, so the
knowledge graph is unaffected.

Honest scope: the feed is **recent + US-centric**, not a global historical archive —
so it rarely intersects the Arabian Sea replay AOI. It proves the incidents domain
ingests live NOAA data; for a real US-waters investigation it would carry weight.
`INCIDENT_PROVIDER=noaa` gives the NOAA entries alone (drops the scenario catalog).

Test: `pytest tests/test_noaa_incidents_provider.py`.

### `hybrid` (imagery)

Keyless. `IMAGERY_PROVIDER=hybrid` (the default) — scenario replay scenes + real
Copernicus Data Space catalogue search. See §1 below.

---

## Needs your signup — 10 minutes each

For every service below: create the account, generate the credential, paste it into
`backend/.env`, set the matching `*_PROVIDER`, restart. **You never send Neuro your
password for anything except CMEMS** (which has no token option); everything else is
OAuth client credentials or a bearer token you can revoke.

### 1. Copernicus Data Space Ecosystem — Sentinel-1 SAR + Sentinel-2 (primary imagery) — ✅ implemented

**Scene search works with no credentials** — set `IMAGERY_PROVIDER=copernicus-dataspace`
and `search()` / the historical timeline / `GET /v1/detection/scenes` immediately
return real Sentinel-1 GRD and Sentinel-2 L2A acquisitions over the AOI (footprints,
polarisations, cloud cover) from the public OData catalogue. Provider health then
reports `degraded` — "catalogue OK; set credentials to fetch scenes".

To also fetch scene pixels / quicklooks (`fetch_scene` returns a real quicklook URL),
add a credential — **your CDSE account is easiest:**

1. Register at <https://dataspace.copernicus.eu/> (free, instant).
2. `.env`:
   ```
   IMAGERY_PROVIDER=copernicus-dataspace
   COPERNICUS_USERNAME=your-email
   COPERNICUS_PASSWORD=your-password
   ```
   (Password grant against the built-in `cdse-public` client — no OAuth client
   registration needed. Alternatively register an OAuth client and set
   `COPERNICUS_CLIENT_ID` / `COPERNICUS_CLIENT_SECRET` for a client-credentials grant.)

**Boundary:** this supplies real scene *identity* (which passes exist, when, where).
Pixel-level oil segmentation still runs on the scenario mock — that needs trained
model weights, tracked separately below.

**Keep both — `IMAGERY_PROVIDER=hybrid`.** The hybrid provider always returns every
scenario replay scene *first* (so `detection.run` stays deterministic — the canonical
pass sits exactly on `sar_pass_at` and is never crowded out), then fills the rest of
the result budget with real CDSE acquisitions. The scene list and historical timeline
show both. Keyless; degrades to mock-only if CDSE is unreachable. This is the default
in `.env.example`.

### 2. Sentinel Hub — processed tiles / statistics (imagery, alt.)

1. Sign up at <https://www.sentinel-hub.com/> (30-day trial or Copernicus-backed
   free tier).
2. **Dashboard** → **User settings** → **OAuth clients** → create.
3. `.env`:
   ```
   IMAGERY_PROVIDER=sentinel-hub
   SENTINELHUB_CLIENT_ID=...
   SENTINELHUB_CLIENT_SECRET=...
   ```

### 3. NASA Earthdata — NASA/USGS archives (imagery, alt.)

1. Register at <https://urs.earthdata.nasa.gov/>.
2. **Profile** → **Generate Token** (valid ~60 days).
3. `.env`:
   ```
   IMAGERY_PROVIDER=nasa-earthdata
   EARTHDATA_TOKEN=...
   ```

### 4. USGS EarthExplorer — Landsat / on-demand (imagery, alt.)

1. Create a USGS ERS account at <https://ers.cr.usgs.gov/register>.
2. Request **Machine-to-Machine (M2M) API** access (manual approval, ~1 business day).
3. Uses username + a short-lived login token; no static secret. When implemented it
   will read `EARTHDATA_TOKEN` or a dedicated `USGS_*` pair (TBD in the client).

### 5. Copernicus Marine Service — currents / waves / SST (primary oceanography) — ✅ implemented

1. Register at <https://marine.copernicus.eu/> → **Login/Register**.
2. There is no API token — the `copernicusmarine` toolbox authenticates with your
   portal **username + password** (the username is a generated handle, not your email;
   find it on your account page).
3. `.env`:
   ```
   OCEANOGRAPHY_PROVIDER=copernicus-marine
   CMEMS_USERNAME=your-handle
   CMEMS_PASSWORD=your-password
   ```
4. `pip install -r requirements.txt` (adds `copernicusmarine`, which pulls xarray +
   zarr). Restart the backend.

Pulls hourly `uo/vo` currents + `thetao` SST from
`cmems_mod_glo_phy_anfc_0.083deg_PT1H-m` and 3-hourly `VHM0` wave height from
`cmems_mod_glo_wav_anfc_0.083deg_PT3H-i`, sampled on a 5×5 lattice; 10 m wind is
taken from Open-Meteo (CMEMS ocean products have no wind). Verified end-to-end:
hindcast recovers the Arabian Sea origin within ~12 km and the release window
within ~1 h. Test: `pytest tests/test_copernicus_marine_provider.py` (skips without
credentials).

**Trade-off:** the `copernicusmarine` toolbox pays a large catalogue + Zarr-metadata
cost per call — a hindcast takes ~60–75 s and a forecast ~30 s on a cold process
(faster afterwards as the catalogue caches in-process; provider health is cached
10 min). For a snappy run use `open-meteo-marine` — also real data, sub-second — and
keep `copernicus-marine` for when you want the CMEMS ocean model specifically.

### 6. Global Fishing Watch — AIS vessel tracks (primary AIS) — ✅ implemented

1. Create an account at <https://globalfishingwatch.org/> and generate a token at
   <https://globalfishingwatch.org/our-apis/tokens> (issued immediately).
2. `.env`:
   ```
   AIS_PROVIDER=global-fishing-watch
   AIS_API_KEY=<the JWT>
   ```

Base `https://gateway.api.globalfishingwatch.org/v3`, bearer auth. `vessel()` uses
`GET /vessels/search`. GFW's public API has **no raw position tracks**, so `tracks()`
is built from `POST /4wings/report` (`public-global-presence`, `group-by=VESSEL_ID`,
`temporal-resolution=HOURLY`) — one hourly centroid position per vessel per cell it
was seen in, inside the query bbox + window; AIS gaps are inferred from hour-to-hour
discontinuities. Verified end-to-end: the investigation pipeline runs on ~17 real
Arabian Sea vessels and produces an explainable ranked evidence list (proximity +
time-correlation to the release window).

**Boundary:** hourly presence, not minute-resolution manoeuvres — attribution ranks
on "near the origin during the release window" and AIS-gap behaviour, which this
carries; fine-grained speed/course metrics are weak. The fictional scenario suspect
(MV HORIZON) does not exist in real AIS, so with GFW active the ranking reflects the
actual vessels that were there.
Test: `pytest tests/test_global_fishing_watch_provider.py` (skips without a token).

### 7. MarineCadastre — US AIS bulk archive (`marine-cadastre`) — ✅ implemented

Keyless. `AIS_PROVIDER=marine-cadastre`. Downloads the relevant daily zip from
`https://coast.noaa.gov/htdata/CMSP/AISDataHandler/<yyyy>/AIS_<yyyy>_<mm>_<dd>.zip`
(~300 MB each, cached under `MARINECADASTRE_CACHE_DIR`, default `.cache/marinecadastre`),
parses the CSV, and filters by bbox + window. Gives **true per-message tracks** (unlike
GFW's hourly presence) — verified against a real archive: ~80 vessels with ~1
position/minute in NY harbour over one hour. `_MAX_DAYS` caps a query at 4 days.

**Boundary:** US waters only, published months in arrears — so for the Arabian Sea
replay `tracks()` returns `[]` and `health()` reports `degraded`. A regional
alternative, not a drop-in. First query per date pays the ~300 MB download.
Test: `pytest tests/test_marine_cadastre_provider.py` (parsing tested always; the
end-to-end check skips unless an archive is already cached — it never downloads one).

### Trained segmentation model (`trained-unet`)

`SEGMENTATION_MODEL=trained-unet` + `SEGMENTATION_WEIGHTS=<checkpoint.pt>`. The
training pipeline lives in [`app/ml/`](../backend/app/ml/README.md): a U-Net, a
dataset loader for the **Sentinel-1 SAR Oil Spill Dataset** (Zenodo
`10.5281/zenodo.8346860`, CC-BY-4.0 — 1,200 σ⁰ image/mask pairs), and
`python -m app.ml.train`. Install `requirements-ml.txt` (adds torch). No GPU here, so
train on Colab / a GPU box, then drop the checkpoint in. `TrainedUNetSegmentationModel`
tiles the raster, runs the model, and vectorises the probability map to geo polygons;
it falls back to the scenario model if the checkpoint is missing or the map is empty.
Smoke-tested on the real mask format (`tests/test_ml_segmentation.py`).

---

## Implementing a stub

Each stub is one file under `backend/app/providers/<domain>/`. To make it real:

1. Keep the class attributes (`id`, `domain`, `display_name`, `is_mock = False`).
2. Implement the domain method(s) from `<domain>/base.py` — return the same pydantic
   schema the mock returns.
3. Use `app.providers._http.get_json` / `http_client` for HTTP (shared timeout,
   retry, User-Agent). Read secrets via `app.core.config.get_settings()`, never
   `os.environ` directly.
4. Make `health()` do a cheap real probe and return `ProviderHealth(state=...)`.
5. Add a `tests/test_<provider>.py` that skips when the credential is absent or the
   service is unreachable.

`open_meteo_marine.py` is the reference implementation.
