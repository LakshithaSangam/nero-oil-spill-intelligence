# Demo backend image — providers on "mock", segmentation "mock" | "classical-sar".
# Works on Render, Railway, Fly.io, Cloud Run, or plain `docker run`.
FROM python:3.12-slim

# geopandas/pyproj/shapely wheels are self-contained; opencv-headless needs libGL-free
# runtime libs only. Keep the image lean.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

COPY requirements-deploy.txt .
RUN pip install --no-cache-dir -r requirements-deploy.txt

COPY . .

# The platform injects $PORT; default 8000 for local `docker run -p 8000:8000`.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
