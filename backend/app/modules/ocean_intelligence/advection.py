"""Lagrangian particle advection — the shared core of hindcast and forecast.

Surface-parcel velocity = current_scale·current + windage·wind + wave Stokes drift
+ turbulent diffusion. Integration is RK2 (midpoint); diffusion is an uncorrelated
random walk with coefficient ``diffusion_k`` (m²/s). The Stokes term adds the
wave-driven surface transport that windage alone under-represents: its magnitude
is a fraction of the wind speed, scaled by the local significant wave height where
a wave field is available, and it acts along the wind direction. Fully vectorised,
deterministic given a seed.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np

from app.modules.ocean_intelligence.fields import FieldSampler
from app.modules.ocean_intelligence.land_mask import on_land

_R_EARTH_M = 6_371_000.0
_DEG_LAT_M = math.pi * _R_EARTH_M / 180.0  # metres per degree latitude


def _mps_to_degps(u: np.ndarray, v: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """(N,) u,v in m/s -> (N,2) [dlon, dlat] in degrees/second."""
    dlat = v / _DEG_LAT_M
    dlon = u / (_DEG_LAT_M * np.clip(np.cos(np.radians(lat)), 1e-6, None))
    return np.stack([dlon, dlat], axis=1)


def advect(
    particles: np.ndarray,          # (N, 2) [lon, lat]
    sampler: FieldSampler,
    t_start: datetime,
    hours: float,
    *,
    dt_s: float = 1800.0,
    windage: float = 0.032,
    current_scale: float = 1.0,
    diffusion_k: float = 12.0,
    stokes_coeff: float = 0.0,
    backward: bool = False,
    seed: int = 0,
    record_every_s: float | None = None,
) -> tuple[np.ndarray, list[tuple[datetime, np.ndarray]]]:
    """Integrate ``particles`` for ``hours``. Returns (final positions, trail).

    ``stokes_coeff`` is the base wave Stokes-drift fraction of wind speed (set to
    0.0 to disable); it is further scaled per-particle by local wave height.
    """
    rng = np.random.default_rng(seed)
    pos = particles.astype(float).copy()
    n_steps = max(1, int(round(hours * 3600.0 / dt_s)))
    sign = -1.0 if backward else 1.0
    sigma = math.sqrt(2.0 * diffusion_k * dt_s)  # metres/step/axis

    # The current/wind/wave fields sampled below have no concept of a coastline —
    # left alone a particle just keeps advecting in a straight line across dry
    # land. Freeze each particle the moment it crosses onto land instead, at its
    # last position still on water, the same "beaching" behaviour real spill
    # trajectory tools (GNOME, OpenDrift) apply.
    beached = on_land(pos[:, 0], pos[:, 1])

    trail: list[tuple[datetime, np.ndarray]] = []
    next_record = 0.0

    for step in range(n_steps):
        t = t_start + timedelta(seconds=sign * step * dt_s)
        t_mid = t_start + timedelta(seconds=sign * (step + 0.5) * dt_s)

        vel1 = _velocity(pos, sampler, t, windage, current_scale, stokes_coeff)
        mid = pos + sign * vel1 * (dt_s / 2.0)
        vel2 = _velocity(mid, sampler, t_mid, windage, current_scale, stokes_coeff)
        new_pos = pos + sign * vel2 * dt_s

        jitter_m = rng.normal(0.0, sigma, size=pos.shape)
        new_pos += _mps_to_degps(jitter_m[:, 0], jitter_m[:, 1], new_pos[:, 1])

        beached |= on_land(new_pos[:, 0], new_pos[:, 1])
        pos = np.where(beached[:, None], pos, new_pos)

        elapsed = (step + 1) * dt_s
        if record_every_s and elapsed >= next_record:
            trail.append((t_start + timedelta(seconds=sign * elapsed), pos.copy()))
            next_record += record_every_s

    return pos, trail


def _velocity(
    pos: np.ndarray,
    sampler: FieldSampler,
    t: datetime,
    windage: float,
    current_scale: float,
    stokes_coeff: float = 0.0,
) -> np.ndarray:
    (cu, cv), (wu, wv) = sampler.sample(pos[:, 0], pos[:, 1], t)
    u = current_scale * cu + windage * wu
    v = current_scale * cv + windage * wv

    if stokes_coeff > 0.0:
        wind_sp = np.hypot(wu, wv)
        with np.errstate(invalid="ignore", divide="ignore"):
            dirx = np.where(wind_sp > 1e-6, wu / wind_sp, 0.0)
            diry = np.where(wind_sp > 1e-6, wv / wind_sp, 0.0)
        hs = sampler.sample_wave_height(pos[:, 0], pos[:, 1], t)
        # wave gain: 1.0 with no wave field; ~Hs/1.4 clamped where waves are known
        gain = np.where(hs > 0.0, np.clip(hs / 1.4, 0.4, 2.2), 1.0)
        stokes_sp = stokes_coeff * wind_sp * gain
        u = u + stokes_sp * dirx
        v = v + stokes_sp * diry

    return _mps_to_degps(u, v, pos[:, 1])
