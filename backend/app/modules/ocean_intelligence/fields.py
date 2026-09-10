"""Sample a provider's ocean field bundle at arbitrary positions and time.

Fully vectorised: nearest-neighbour in space over the (coarse, smooth) grid, linear
in time. Vectors are returned as (u, v) arrays in m/s — east and north components.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from app.schemas.oceanography import OceanConditions, OceanFieldResponse, VectorSample


def _grid(samples: list[VectorSample]) -> np.ndarray:
    """(G, 4) array of [lon, lat, u, v]."""
    if not samples:
        return np.zeros((1, 4))
    rows = np.empty((len(samples), 4))
    for i, s in enumerate(samples):
        r = np.radians(s.direction_deg)
        rows[i] = (s.at.lon, s.at.lat, s.speed_ms * np.sin(r), s.speed_ms * np.cos(r))
    return rows


def _scalar_grid(samples) -> np.ndarray:  # noqa: ANN001 - list[ScalarSample]
    """(G, 3) array of [lon, lat, value]; empty grid → single zero row."""
    if not samples:
        return np.zeros((1, 3))
    rows = np.empty((len(samples), 3))
    for i, s in enumerate(samples):
        rows[i] = (s.at.lon, s.at.lat, s.value)
    return rows


class FieldSampler:
    def __init__(self, fields: OceanFieldResponse) -> None:
        steps: list[OceanConditions] = sorted(fields.steps, key=lambda s: s.time)
        if not steps:
            raise ValueError("ocean field response has no steps")
        self._times = np.array([s.time.timestamp() for s in steps])
        self._cur = [_grid(s.surface_current) for s in steps]
        self._wind = [_grid(s.wind_10m) for s in steps]
        self._wave = [_scalar_grid(s.wave_height_m) for s in steps]
        self._tide = [_scalar_grid(s.tide_height_m) for s in steps]
        self.has_waves = any(s.wave_height_m for s in steps)
        self.has_tides = any(s.tide_height_m for s in steps)

    @staticmethod
    def _nearest(grid: np.ndarray, lons: np.ndarray, lats: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        d2 = (grid[:, 0][None, :] - lons[:, None]) ** 2 + (grid[:, 1][None, :] - lats[:, None]) ** 2
        idx = np.argmin(d2, axis=1)
        return grid[idx, 2], grid[idx, 3]

    @staticmethod
    def _nearest_scalar(grid: np.ndarray, lons: np.ndarray, lats: np.ndarray) -> np.ndarray:
        d2 = (grid[:, 0][None, :] - lons[:, None]) ** 2 + (grid[:, 1][None, :] - lats[:, None]) ** 2
        return grid[np.argmin(d2, axis=1), 2]

    def sample_wave_height(self, lons: np.ndarray, lats: np.ndarray, t: datetime) -> np.ndarray:
        """Significant wave height (m) at each position; zeros when no wave field."""
        if not self.has_waves:
            return np.zeros_like(lons, dtype=float)
        lo, hi, w = self._bracket(t)
        h0 = self._nearest_scalar(self._wave[lo], lons, lats)
        if lo == hi:
            return h0
        h1 = self._nearest_scalar(self._wave[hi], lons, lats)
        return h0 + (h1 - h0) * w

    def _bracket(self, t: datetime) -> tuple[int, int, float]:
        ts = t.timestamp()
        hi = int(np.searchsorted(self._times, ts))
        if hi <= 0:
            return 0, 0, 0.0
        if hi >= len(self._times):
            last = len(self._times) - 1
            return last, last, 0.0
        lo = hi - 1
        span = self._times[hi] - self._times[lo]
        return lo, hi, 0.0 if span == 0 else (ts - self._times[lo]) / span

    def sample(
        self, lons: np.ndarray, lats: np.ndarray, t: datetime
    ) -> tuple[tuple[np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray]]:
        ts = t.timestamp()
        hi = int(np.searchsorted(self._times, ts))
        if hi <= 0:
            lo = hi = 0
            w = 0.0
        elif hi >= len(self._times):
            lo = hi = len(self._times) - 1
            w = 0.0
        else:
            lo = hi - 1
            span = self._times[hi] - self._times[lo]
            w = 0.0 if span == 0 else (ts - self._times[lo]) / span

        cu0, cv0 = self._nearest(self._cur[lo], lons, lats)
        wu0, wv0 = self._nearest(self._wind[lo], lons, lats)
        if lo == hi:
            return (cu0, cv0), (wu0, wv0)
        cu1, cv1 = self._nearest(self._cur[hi], lons, lats)
        wu1, wv1 = self._nearest(self._wind[hi], lons, lats)
        return (
            (cu0 + (cu1 - cu0) * w, cv0 + (cv1 - cv0) * w),
            (wu0 + (wu1 - wu0) * w, wv0 + (wv1 - wv0) * w),
        )
