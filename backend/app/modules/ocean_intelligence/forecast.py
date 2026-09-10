"""Forecasting — where the slick goes next.

A small forcing ensemble (nominal / wind-driven / current-dominated) is advected
forward from the detected slick. Each member yields a drift track; together they give
the expansion envelope and the probability that each coastal receptor is reached.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
from pyproj import Geod
from shapely.geometry import MultiPoint, shape

from app.fixtures.geo_features import Receptor
from app.modules.ocean_intelligence.advection import advect
from app.modules.ocean_intelligence.fields import FieldSampler
from app.schemas.common import GeoJSONFeature, GeoJSONFeatureCollection
from app.schemas.detection import SpillDetection
from app.schemas.ocean_intelligence import AffectedCoast, DriftScenario, ForecastResult

_GEOD = Geod(ellps="WGS84")
_DT_S = 900.0
_LANDFALL_KM = 6.0


@dataclass(frozen=True)
class _Member:
    id: str
    label: str
    probability: float
    windage: float
    current_scale: float
    diffusion_k: float
    stokes_coeff: float
    note: str
    seed: int


_ENSEMBLE = [
    _Member("nominal", "Nominal forcing", 0.55, 0.032, 1.0, 12.0, 0.010,
            "provider currents + 3.2% windage + wave Stokes drift", 11),
    _Member("wind-driven", "Wind-driven (stronger leeway)", 0.30, 0.055, 1.0, 14.0, 0.016,
            "windage raised to 5.5% + stronger Stokes drift — persistent SW monsoon", 23),
    _Member("current-dominated", "Current-dominated", 0.15, 0.018, 1.18, 18.0, 0.006,
            "windage cut, current +18%, higher diffusion, light Stokes", 31),
]


def run_forecast(
    detection: SpillDetection,
    sampler: FieldSampler,
    *,
    horizon_hours: float = 72.0,
    receptors: list[Receptor] | None = None,
    n_particles: int = 170,
    seed: int = 5,
) -> ForecastResult:
    poly = shape(detection.geometry.polygon.model_dump())
    pts = _sample_polygon(poly, n_particles, seed)
    t0 = detection.detected_at
    receptors = receptors or []

    scenarios: list[DriftScenario] = []
    per_member_snapshots: dict[str, list[tuple[float, np.ndarray]]] = {}

    # near-shore tidal stirring: where the provider carries a tide field, lift the
    # random-walk term so the ensemble spreads a little faster in coastal water
    tide_mix = 1.15 if getattr(sampler, "has_tides", False) else 1.0

    for m in _ENSEMBLE:
        _, trail = advect(
            pts, sampler, t0, hours=horizon_hours,
            dt_s=_DT_S, windage=m.windage, current_scale=m.current_scale,
            diffusion_k=m.diffusion_k * tide_mix, stokes_coeff=m.stokes_coeff,
            seed=m.seed, record_every_s=3600.0,
        )
        hours_axis = [(t - t0).total_seconds() / 3600.0 for t, _ in trail]
        per_member_snapshots[m.id] = list(zip(hours_axis, [p for _, p in trail], strict=True))
        scenarios.append(_scenario_feature(m, t0, trail))

    expected_area = _expansion_by_hour(per_member_snapshots["nominal"], poly)
    coasts = _affected_coasts(per_member_snapshots, receptors, t0, horizon_hours)

    forcing = ["Surface ocean currents", "Wind (leeway / windage)", "Weather forecast (10 m wind)"]
    if getattr(sampler, "has_waves", False):
        forcing.append("Wave conditions (Stokes drift)")
    else:
        forcing.append("Wave Stokes drift (wind-scaled proxy)")
    if getattr(sampler, "has_tides", False):
        forcing.append("Tidal stirring (near-shore)")
    forcing.append("Turbulent diffusion")

    return ForecastResult(
        detection_id=detection.id,
        horizon_hours=horizon_hours,
        scenarios=scenarios,
        expected_area_km2_by_hour=expected_area,
        affected_coasts=coasts,
        forcing_factors=forcing,
    )


# --------------------------------------------------------------------------- #
def _sample_polygon(poly, n: int, seed: int) -> np.ndarray:
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
    if xs.size == 0:
        return np.array([(poly.centroid.x, poly.centroid.y)], dtype=float)
    return np.column_stack([xs[:n], ys[:n]])


def _scenario_feature(
    m: _Member, t0: datetime, trail: list[tuple[datetime, np.ndarray]]
) -> DriftScenario:
    feats: list[GeoJSONFeature] = []
    centroids: list[list[float]] = []
    for t, pos in trail:
        cx, cy = float(np.mean(pos[:, 0])), float(np.mean(pos[:, 1]))
        centroids.append([cx, cy])
        hour = round((t - t0).total_seconds() / 3600.0)
        feats.append(
            GeoJSONFeature(
                geometry={"type": "Point", "coordinates": [cx, cy]},  # type: ignore[arg-type]
                properties={"hour": hour, "t": t.isoformat()},
            )
        )
    feats.insert(
        0,
        GeoJSONFeature(
            geometry={"type": "LineString", "coordinates": centroids},  # type: ignore[arg-type]
            properties={"role": "centroid-track", "member": m.id},
        ),
    )
    return DriftScenario(
        id=m.id, label=m.label, probability=m.probability,
        track=GeoJSONFeatureCollection(features=feats), forcing_note=m.note,
    )


def _expansion_by_hour(snapshots: list[tuple[float, np.ndarray]], seed_poly) -> dict[str, float]:
    a0, _ = _GEOD.geometry_area_perimeter(seed_poly)
    out = {"0": round(abs(a0) / 1e6, 2)}
    for h, pos in snapshots:
        if int(h) % 12 != 0 or h == 0:
            continue
        hull = MultiPoint([tuple(p) for p in pos]).convex_hull
        if hull.geom_type != "Polygon":
            continue
        area, _ = _GEOD.geometry_area_perimeter(hull)
        out[str(int(h))] = round(abs(area) / 1e6, 2)
    return out


def _affected_coasts(
    per_member: dict[str, list[tuple[float, np.ndarray]]],
    receptors: list[Receptor],
    t0: datetime,
    horizon_hours: float,
) -> list[AffectedCoast]:
    total_prob = sum(m.probability for m in _ENSEMBLE)
    out: list[AffectedCoast] = []
    for r in receptors:
        seg = np.asarray(r.line, dtype=float)
        reaching: list[tuple[float, float]] = []  # (prob, eta_hour)
        for m in _ENSEMBLE:
            hit_h: float | None = None
            for h, pos in per_member[m.id]:
                if h == 0:
                    continue
                if _min_dist_km(pos, seg) <= _LANDFALL_KM:
                    hit_h = h
                    break
            if hit_h is not None:
                reaching.append((m.probability, hit_h))
        if not reaching:
            out.append(AffectedCoast(
                name=r.name,
                geometry=_line_fc(r),
                eta=None,
                likelihood=0.0,
            ))
            continue
        likelihood = round(sum(p for p, _ in reaching) / total_prob, 3)
        eta_hour = min(h for _, h in reaching)
        out.append(AffectedCoast(
            name=r.name,
            geometry=_line_fc(r),
            eta=t0 + timedelta(hours=eta_hour),
            likelihood=likelihood,
        ))
    out.sort(key=lambda c: (c.eta is None, c.eta or datetime.max.replace(tzinfo=t0.tzinfo)))
    return out


def _min_dist_km(pts: np.ndarray, line: np.ndarray) -> float:
    """Smallest distance (km) from any point in ``pts`` (N,2) to the polyline ``line``."""
    lat0 = float(np.mean(pts[:, 1]))
    kx = 111.320 * math.cos(math.radians(lat0))
    ky = 110.574
    p = np.column_stack([pts[:, 0] * kx, pts[:, 1] * ky])  # to local km
    best = np.inf
    for i in range(len(line) - 1):
        a = np.array([line[i, 0] * kx, line[i, 1] * ky])
        b = np.array([line[i + 1, 0] * kx, line[i + 1, 1] * ky])
        ab = b - a
        denom = float(ab @ ab) or 1e-9
        t = np.clip(((p - a) @ ab) / denom, 0.0, 1.0)
        proj = a + t[:, None] * ab
        d = np.hypot(p[:, 0] - proj[:, 0], p[:, 1] - proj[:, 1])
        best = min(best, float(d.min()))
    return best


def _line_fc(r: Receptor) -> GeoJSONFeatureCollection:
    return GeoJSONFeatureCollection(
        features=[
            GeoJSONFeature(
                geometry={"type": "LineString", "coordinates": r.line},  # type: ignore[arg-type]
                properties={"id": r.id, "kind": r.kind, "sensitivity": r.sensitivity},
            )
        ]
    )
