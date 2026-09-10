# Deploying Nero

Nero is two apps that talk over HTTP:

| App         | Stack             | Host                                   |
|-------------|-------------------|----------------------------------------|
| `frontend/` | Next.js 14        | **Vercel**                             |
| `backend/`  | FastAPI (Python)  | **Render / Railway / Fly / Cloud Run** |

Vercel runs the frontend only. FastAPI needs a normal always-on Python process
(long-lived in-memory state for investigation runs), so it goes on a separate
host. Deploy the backend first, then point the frontend at it.

The whole demo runs on the built-in **mock** providers — no API keys, no
database. Real Sentinel / AIS / oceanography providers are drop-in later.

---

## 1 · Backend → Render (free tier, ~2 min build)

**Blueprint (one click):** Render dashboard → **New → Blueprint** → pick this
repo. It reads [`render.yaml`](render.yaml) and creates the `nero-api` web
service (root `backend/`, `pip install -r requirements-deploy.txt`,
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/v1/health`).

Two env vars are left blank on purpose — set them after the first deploy gives
you the service URL (e.g. `https://nero-api.onrender.com`):

| Var               | Value                                                  |
|-------------------|--------------------------------------------------------|
| `PUBLIC_BASE_URL` | the API's own URL, e.g. `https://nero-api.onrender.com` |
| `CORS_ORIGINS`    | your Vercel origin, e.g. `https://nero.vercel.app` (comma-separate several, no trailing slash) |

`CORS_ORIGIN_REGEX` is prefilled as `https://.*\.vercel\.app` so preview
deployments work too; tighten or remove it if you don't want that.

**Manual instead of the blueprint:** New → Web Service → this repo → Root
Directory `backend`, Build `pip install -r requirements-deploy.txt`, Start
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, then add the env vars from
`render.yaml`.

**Docker host instead of Render:** [`backend/Dockerfile`](backend/Dockerfile)
builds the same thing (`docker build -t nero-api backend/`); it honours `$PORT`.

Check it: `curl https://<your-api>/v1/health` → `{"status":"ok",...}` and
`curl -X POST https://<your-api>/v1/detection/run -H 'content-type: application/json' -d '{"bbox":{"west":68.55,"south":20.15,"east":69.35,"north":20.85},"scenario":"arabian-sea-discharge"}'`

> Free Render services sleep after 15 min idle — the first request then takes
> ~30–50 s to wake. Fine for a demo; use a paid instance or a cron ping to keep
> it warm for judging.

---

## 2 · Frontend → Vercel

Vercel deploys **one app per project**, and it must build from the folder that
holds `package.json`. This repo is a monorepo, so **you have to set the Root
Directory to `frontend`** — there is no `vercel.json`-only workaround for a
Next.js app in a subfolder (Vercel checks the Root Directory's `package.json`
for `next` *before* any build command runs; if it builds from the repo root you
get `Error: No Next.js version detected`).

1. Vercel → **Add New → Project** → import `LakshithaSangam/nero-oil-spill-intelligence`.
2. On the configure screen (or later in **Settings → Build & Deployment →
   Root Directory**): set **Root Directory = `frontend`** and Save.
   Framework then auto-detects as Next.js and
   [`frontend/vercel.json`](frontend/vercel.json) supplies the build settings.
3. **Environment Variables:**

   | Name                       | Value                                    |
   |----------------------------|------------------------------------------|
   | `NEXT_PUBLIC_API_BASE_URL` | your backend URL, **no trailing slash**, e.g. `https://nero-api.onrender.com` |

4. **Deploy** → `https://<project>.vercel.app`.

If the project already exists and failed: **Settings → Build & Deployment →
Root Directory → `frontend` → Save**, then **Deployments → ⋯ → Redeploy**.

`NEXT_PUBLIC_*` is inlined at build time, so after changing it use **Redeploy**
(not just "Visit").

---

## 3 · Wire the two together

1. Backend `CORS_ORIGINS` = the Vercel origin from step 2 → redeploy the backend.
2. Backend `PUBLIC_BASE_URL` = the backend's own URL → redeploy. (Only matters
   for `SEGMENTATION_MODEL=classical-sar`, which fetches the synthetic quicklook
   over HTTP.)
3. Open the Vercel URL → DevTools Network: calls to `/v1/...` should be `200`.
   A CORS error means `CORS_ORIGINS` doesn't match the site's origin exactly.

---

## Notes

- **`trained-unet` segmentation** needs PyTorch and a checkpoint, neither of
  which ship in the deploy image. Add `pip install -r requirements-ml.txt`, set
  `SEGMENTATION_WEIGHTS`, and expect a much larger image / slower cold start.
  `mock` and `classical-sar` need nothing extra.
- **Do not deploy the backend to Vercel functions.** Investigation runs keep
  state in memory and the frontend polls for them; serverless instances don't
  share that state.
- **Secrets:** `backend/.env` and `backend/.env.real.bak` are git-ignored. On
  the hosts, set only what you need as env vars; the demo needs none.
