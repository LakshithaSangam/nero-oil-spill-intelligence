"""Open-Meteo Marine surface currents, factored out for the map's ambient current layer.

Same shape as ``_wind.py``'s helper, pulling ``ocean_current_velocity`` /
``ocean_current_direction`` instead of 10 m wind. Velocity arrives in km/h and is
converted to m/s; direction is already "flowing toward" (our going-to convention),
unlike wind direction which needs a 180 deg rotation.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

from app.core.logging import get_logger
from app.providers._http import get_json, http_client
from app.schemas.common import LonLat

log = get_logger(__name__)

_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

# After a failure (typically the free-tier daily quota, HTTP 429) stop hammering
# the API for a while; callers fall back to a synthetic field in the meantime.
_COOLDOWN_S = 1800.0
_cooldown_until = 0.0


@dataclass
class CurrentField:
    """Hourly surface current over a fixed lattice; ``sample`` picks the nearest hour."""

    times: list[datetime]
    speed_ms: list[list[float]]
    going_to_deg: list[list[float]]

    def sample(self, t: datetime, point_i: int) -> tuple[float, float]:
        if not self.times:
            return 0.0, 0.0
        ti = min(range(len(self.times)), key=lambda i: abs((self.times[i] - t).total_seconds()))
        row_s, row_d = self.speed_ms[ti], self.going_to_deg[ti]
        if point_i >= len(row_s):
            return 0.0, 0.0
        return row_s[point_i], row_d[point_i]


_EMPTY = CurrentField(times=[], speed_ms=[], going_to_deg=[])


async def open_meteo_current_10m(points: list[LonLat], start: datetime, end: datetime) -> CurrentField:
    """Fetch surface current for every point; returns an empty field on failure."""
    global _cooldown_until
    if time.monotonic() < _cooldown_until:
        return _EMPTY
    lat_csv = ",".join(str(p.lat) for p in points)
    lon_csv = ",".join(str(p.lon) for p in points)
    params = {
        "latitude": lat_csv,
        "longitude": lon_csv,
        "hourly": "ocean_current_velocity,ocean_current_direction",
        "start_date": (start - timedelta(days=1)).date().isoformat(),
        "end_date": (end + timedelta(days=1)).date().isoformat(),
        "timezone": "GMT",
    }
    try:
        async with http_client() as client:
            payload = await get_json(_MARINE_URL, params=params, client=client)
    except httpx.HTTPError as exc:
        _cooldown_until = time.monotonic() + _COOLDOWN_S
        log.warning(
            "open-meteo marine current fetch failed (%s); using synthetic field for %.0f min",
            exc, _COOLDOWN_S / 60,
        )
        return _EMPTY

    batch = payload if isinstance(payload, list) else [payload]
    if not batch or "hourly" not in batch[0]:
        return _EMPTY

    times = [datetime.fromisoformat(s).replace(tzinfo=UTC) for s in batch[0]["hourly"]["time"]]
    speed: list[list[float]] = []
    going: list[list[float]] = []
    for ti in range(len(times)):
        s_row, d_row = [], []
        for gi in range(len(points)):
            hourly = batch[gi].get("hourly", {}) if gi < len(batch) else {}
            v = _at(hourly.get("ocean_current_velocity"), ti)
            d = _at(hourly.get("ocean_current_direction"), ti)
            s_row.append((v / 3.6) if v is not None else 0.0)  # km/h -> m/s
            d_row.append((d % 360.0) if d is not None else 0.0)
        speed.append(s_row)
        going.append(d_row)
    return CurrentField(times=times, speed_ms=speed, going_to_deg=going)


def _at(series: list[float] | None, i: int) -> float | None:
    if not series or i >= len(series):
        return None
    return series[i]
