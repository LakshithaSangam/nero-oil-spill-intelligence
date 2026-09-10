"""A synthetic Sentinel-1 quicklook PNG per replay scenario.

The mock imagery provider hands the detection pipeline a URL to one of these, so
the classical dark-spot segmenter and the trained U-Net run on **real image
pixels** offline — a coherent dark slick on speckled ocean with a swath no-data
border, positioned where the scenario says the slick was observed. Swap
``IMAGERY_PROVIDER`` to a real one and the same code fetches the true CDSE
quicklook instead, unchanged.
"""

from __future__ import annotations

import functools
import io
import math

import cv2
import numpy as np

from app.fixtures.scenarios import SCENARIOS, get_scenario

_W, _H = 1024, 896
_KM_LAT = 110.574


def _slick_centre_px(scenario_id: str) -> tuple[int, int]:
    """Where the observed slick sits inside the AOI tile (origin + drift offset)."""
    sc = get_scenario(scenario_id)
    b = sc.aoi
    km_lon = 111.320 * math.cos(math.radians(sc.origin_hint.lat))
    ex, nx = sc.slick_offset_km
    lon = sc.origin_hint.lon + ex / km_lon
    lat = sc.origin_hint.lat + nx / _KM_LAT
    fx = (lon - b.west) / max(b.east - b.west, 1e-6)
    fy = (b.north - lat) / max(b.north - b.south, 1e-6)
    return int(np.clip(fx, 0.08, 0.92) * _W), int(np.clip(fy, 0.08, 0.92) * _H)


@functools.lru_cache(maxsize=16)
def quicklook_png(scenario_id: str, sensor: str = "sentinel-1-sar") -> bytes:
    rng = np.random.default_rng(abs(hash((scenario_id, sensor))) % (2**32))

    # bright, gently speckled ocean with a slow wind-brightness gradient.
    # High gamma shape -> low speckle variance, so the slick reads as the one
    # dark feature rather than one dip among many.
    grad = np.linspace(0.88, 1.06, _W, dtype=np.float32)[None, :]
    grad = grad * np.linspace(1.05, 0.92, _H, dtype=np.float32)[:, None]
    speckle = rng.gamma(shape=32.0, scale=1 / 32.0, size=(_H, _W)).astype(np.float32)
    img = 168.0 * grad * speckle

    if "sar" in sensor:
        cx, cy = _slick_centre_px(scenario_id)
        ang = rng.uniform(0, 180)
        # A fresh single-source slick covers well under a percent of a 1° swath:
        # keep the ellipse small (semi-major ~7-10% of the frame width) so the
        # segmented geometry lands in a realistic ~30-160 km2 range.
        L = int(_W * rng.uniform(0.07, 0.10))
        Wd = int(L * rng.uniform(0.42, 0.58))
        slick = np.zeros((_H, _W), np.float32)
        cv2.ellipse(slick, (cx, cy), (L, Wd), ang, 0, 360, 1.0, -1)
        # a small trailing sheen fragment down-drift
        dx = int(math.cos(math.radians(ang)) * L * 1.4)
        dy = int(math.sin(math.radians(ang)) * L * 1.4)
        cv2.ellipse(slick, (cx + dx, cy + dy), (int(L * 0.5), int(Wd * 0.5)), ang, 0, 360, 0.8, -1)
        slick = cv2.GaussianBlur(slick, (0, 0), 7)
        # oil strongly damps the sea return: a deep, smooth dark patch
        dark_level = float(img.mean()) * 0.12
        img = img * (1.0 - 0.94 * slick) + (0.94 * slick) * dark_level

    # SAR swath no-data wedge on the left edge
    wedge = np.zeros((_H, _W), np.uint8)
    pts = np.array([[0, 0], [int(_W * 0.06), 0], [0, _H]], np.int32)
    cv2.fillPoly(wedge, [pts], 1)
    img[wedge > 0] = 0

    out = np.clip(img, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".png", out)
    if not ok:  # pragma: no cover
        raise RuntimeError("failed to encode synthetic quicklook")
    return io.BytesIO(buf.tobytes()).getvalue()


def scene_to_scenario(scene_id: str) -> str:
    """`<scenario>:<sensor>:<ts>` (mock) or bare scenario id -> scenario id."""
    sid = scene_id.split(":", 1)[0]
    return sid if sid in SCENARIOS else next(iter(SCENARIOS))
