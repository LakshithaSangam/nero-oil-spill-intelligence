"""Open-Meteo 10 m wind, factored out so any oceanography provider can borrow it.

CMEMS ocean products carry currents / waves / SST but no surface wind, and the drift
engine needs a wind vector for windage. This helper fetches hourly 10 m wind for a
lattice of points from the keyless Open-Meteo Forecast API and exposes a
nearest-in-time sampler. Directions are returned in the going-to convention (the
meteorological "coming from" angle rotated 180 deg).
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

_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"  # ERA5, keyless, decades back
_ARCHIVE_CUTOVER_DAYS = 80  # the forecast API keeps roughly this many past days

# After a failure (typically the free-tier daily quota, HTTP 429) stop hammering
# the API for a while; callers fall back to a synthetic field in the meantime.
_COOLDOWN_S = 1800.0
_cooldown_until = 0.0


@dataclass
class WindField:
    """Hourly 10 m wind over a fixed lattice; ``sample`` picks the nearest hour."""

    times: list[datetime]
    speed_ms: list[list[float]]      # [time_index][point_index]
    going_to_deg: list[list[float]]  # [time_index][point_index]

    def sample(self, t: datetime, point_i: int) -> tuple[float, float]:
        if not self.times:
            return 0.0, 0.0
        ti = min(range(len(self.times)), key=lambda i: abs((self.times[i] - t).total_seconds()))
        row_s, row_d = self.speed_ms[ti], self.going_to_deg[ti]
        if point_i >= len(row_s):
            return 0.0, 0.0
        return row_s[point_i], row_d[point_i]


_EMPTY = WindField(times=[], speed_ms=[], going_to_deg=[])


async def open_meteo_wind_10m(points: list[LonLat], start: datetime, end: datetime) -> WindField:
    """Fetch 10 m wind for every point; returns an empty field (no windage) on failure.

    Recent windows use the forecast API; windows older than ~80 days fall through to
    the keyless ERA5 archive so historical investigations still get real wind.
    """
    global _cooldown_until
    if time.monotonic() < _cooldown_until:
        return _EMPTY
    lat_csv = ",".join(str(p.lat) for p in points)
    lon_csv = ",".join(str(p.lon) for p in points)
    params = {
        "latitude": lat_csv,
        "longitude": lon_csv,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "ms",
        "start_date": (start - timedelta(days=1)).date().isoformat(),
        "end_date": (end + timedelta(days=1)).date().isoformat(),
        "timezone": "GMT",
    }
    age_days = (datetime.now(UTC) - start).total_seconds() / 86400.0
    url = _ARCHIVE_URL if age_days > _ARCHIVE_CUTOVER_DAYS else _FORECAST_URL
    try:
        async with http_client() as client:
            payload = await get_json(url, params=params, client=client)
    except httpx.HTTPError as exc:
        _cooldown_until = time.monotonic() + _COOLDOWN_S
        log.warning(
            "open-meteo wind fetch failed (%s); using synthetic field for %.0f min",
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
            sp = _at(hourly.get("wind_speed_10m"), ti)
            fr = _at(hourly.get("wind_direction_10m"), ti)
            s_row.append(sp if sp is not None else 0.0)
            d_row.append(((fr + 180.0) % 360) if fr is not None else 0.0)
        speed.append(s_row)
        going.append(d_row)
    return WindField(times=times, speed_ms=speed, going_to_deg=going)


def _at(series: list[float] | None, i: int) -> float | None:
    if not series or i >= len(series):
        return None
    return series[i]
