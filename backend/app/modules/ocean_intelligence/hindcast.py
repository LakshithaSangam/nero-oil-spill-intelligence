"""Hindcasting — reconstruct where and when the spill was released.

The slick is elongated because the discharge happened over a time interval: the
down-drift end is old, the up-drift end is fresh. We assign each slick particle an
age along that axis (bounded by Module 1's age estimate), reverse-advect every
particle by *its own* age, and read the origin off the resulting cluster. The
tightness of that cluster is the confidence.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np
from shapely.geometry import Polygon, shape

from app.modules.ocean_intelligence.advection import advect
from app.modules.ocean_intelligence.fields import FieldSampler
from app.schemas.common import Confidence, GeoJSONFeature, GeoJSONFeatureCollection, LonLat, TimeRange
from app.schemas.detection import SpillDetection
from app.schemas.ocean_intelligence import HindcastResult, OriginEstimate

_DT_S = 900.0


def run_hindcast(
    detection: SpillDetection,
    sampler: FieldSampler,
    *,
    n_particles: int = 260,
    seed: int = 7,
) -> HindcastResult:
    poly = shape(detection.geometry.polygon.model_dump())
    pts = _sample_polygon(poly, n_particles, seed)
    detected_at = detection.detected_at

    age_lo = max(detection.characterisation.spill_age_hours_low, 1.0)
    age_hi = max(detection.characterisation.spill_age_hours_high, age_lo + 1.0)

    # age gradient along the drift axis (fresh -> old)
    bearing = _drift_bearing(sampler, poly.centroid.x, poly.centroid.y, detected_at)
    ages = _assign_ages(pts, bearing, age_lo, age_hi)

    # one long backward integration; pick each particle's position at its own age
    _, trail = advect(
        pts, sampler, detected_at, hours=age_hi,
        dt_s=_DT_S, backward=True, seed=seed, record_every_s=_DT_S,
    )
    trail_times = np.array([(detected_at - t).total_seconds() / 3600.0 for t, _ in trail])
    origin_pts = np.zeros_like(pts)
    for i in range(pts.shape[0]):
        k = int(np.argmin(np.abs(trail_times - ages[i])))
        origin_pts[i] = trail[k][1][i]

    ox, oy = float(np.median(origin_pts[:, 0])), float(np.median(origin_pts[:, 1]))
    spread_km = _spread_km(origin_pts, oy)

    surface = _probability_surface(origin_pts)
    backtracks = _backtrack_paths(trail, ages, detected_at, count=10)

    score = max(0.12, min(0.94, 1.0 - spread_km / 22.0))
    confidence = Confidence(
        score=round(score, 3),
        rationale=(
            f"back-tracked cluster σ ≈ {spread_km:.1f} km; "
            f"age-graded along drift bearing {bearing:.0f}°; "
            f"{pts.shape[0]} particles, windage 0.032, RK2 @ {int(_DT_S/60)} min"
        ),
    )

    origin = OriginEstimate(
        point=LonLat(lon=round(ox, 5), lat=round(oy, 5)),
        probability_surface=surface,
        release_window=TimeRange(
            start=detected_at - timedelta(hours=age_hi),
            end=detected_at - timedelta(hours=age_lo),
        ),
        confidence=confidence,
        method="reverse particle advection (age-graded, RK2, windage 0.032)",
    )
    return HindcastResult(
        detection_id=detection.id, origin=origin, backtrack_paths=backtracks
    )


# --------------------------------------------------------------------------- #
def _sample_polygon(poly: Polygon, n: int, seed: int) -> np.ndarray:
    """Uniform interior points via *vectorised* rejection sampling (shapely 2.x)."""
    import shapely

    rng = np.random.default_rng(seed)
    minx, miny, maxx, maxy = poly.bounds
    xs = np.empty(0)
    ys = np.empty(0)
    for _ in range(24):
        need = n - xs.size
        if need <= 0:
            break
        batch = max(need * 3, 64)
        bx = rng.uniform(minx, maxx, batch)
        by = rng.uniform(miny, maxy, batch)
        m = shapely.contains_xy(poly, bx, by)
        xs = np.concatenate([xs, bx[m]])
        ys = np.concatenate([ys, by[m]])
    if xs.size == 0:  # degenerate polygon — fall back to the centroid
        return np.array([(poly.centroid.x, poly.centroid.y)], dtype=float)
    return np.column_stack([xs[:n], ys[:n]])


def _drift_bearing(sampler: FieldSampler, lon: float, lat: float, t: datetime) -> float:
    lons, lats = np.array([lon]), np.array([lat])
    (cu, cv), (wu, wv) = sampler.sample(lons, lats, t)
    u, v = float(cu[0] + 0.032 * wu[0]), float(cv[0] + 0.032 * wv[0])
    return (math.degrees(math.atan2(u, v)) + 360.0) % 360.0


def _assign_ages(pts: np.ndarray, bearing_deg: float, age_lo: float, age_hi: float) -> np.ndarray:
    br = math.radians(bearing_deg)
    ax, ay = math.sin(br), math.cos(br)  # unit along-drift (east, north)
    c = pts.mean(axis=0)
    proj = (pts[:, 0] - c[0]) * ax + (pts[:, 1] - c[1]) * ay
    lo, hi = proj.min(), proj.max()
    s = (proj - lo) / (hi - lo) if hi > lo else np.full(pts.shape[0], 0.5)
    return age_lo + s * (age_hi - age_lo)  # down-drift (large proj) -> older


def _spread_km(pts: np.ndarray, lat0: float) -> float:
    sx = float(np.std(pts[:, 0])) * 111.32 * math.cos(math.radians(lat0))
    sy = float(np.std(pts[:, 1])) * 110.57
    return math.hypot(sx, sy)


def _probability_surface(pts: np.ndarray, cell_deg: float = 0.02, top: int = 45) -> GeoJSONFeatureCollection:
    minx, miny = pts.min(axis=0) - cell_deg
    maxx, maxy = pts.max(axis=0) + cell_deg
    nx = max(1, int(math.ceil((maxx - minx) / cell_deg)))
    ny = max(1, int(math.ceil((maxy - miny) / cell_deg)))
    grid = np.zeros((ny, nx), dtype=float)
    for x, y in pts:
        ix = min(nx - 1, int((x - minx) / cell_deg))
        iy = min(ny - 1, int((y - miny) / cell_deg))
        grid[iy, ix] += 1.0
    peak = grid.max() or 1.0

    cells: list[tuple[float, int, int]] = [
        (grid[iy, ix] / peak, ix, iy)
        for iy in range(ny)
        for ix in range(nx)
        if grid[iy, ix] > 0
    ]
    cells.sort(reverse=True)
    feats: list[GeoJSONFeature] = []
    for rank, (w, ix, iy) in enumerate(cells[:top], start=1):
        x0, y0 = minx + ix * cell_deg, miny + iy * cell_deg
        x1, y1 = x0 + cell_deg, y0 + cell_deg
        feats.append(
            GeoJSONFeature(
                geometry={  # type: ignore[arg-type]
                    "type": "Polygon",
                    "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
                },
                properties={"weight": round(w, 4), "rank": rank},
            )
        )
    return GeoJSONFeatureCollection(features=feats)


def _backtrack_paths(
    trail: list[tuple[datetime, np.ndarray]], ages: np.ndarray, detected_at: datetime, count: int
) -> GeoJSONFeatureCollection:
    if not trail:
        return GeoJSONFeatureCollection(features=[])
    n = trail[0][1].shape[0]
    idxs = np.linspace(0, n - 1, min(count, n)).astype(int)
    times_h = np.array([(detected_at - t).total_seconds() / 3600.0 for t, _ in trail])
    feats: list[GeoJSONFeature] = []
    for i in idxs:
        line = [[float(trail[0][1][i, 0]), float(trail[0][1][i, 1])]]
        for k, (_, pos) in enumerate(trail):
            if times_h[k] <= ages[i] + 1e-6:
                line.append([float(pos[i, 0]), float(pos[i, 1])])
        feats.append(
            GeoJSONFeature(
                geometry={"type": "LineString", "coordinates": line},  # type: ignore[arg-type]
                properties={"particle": int(i), "age_h": round(float(ages[i]), 1)},
            )
        )
    return GeoJSONFeatureCollection(features=feats)
