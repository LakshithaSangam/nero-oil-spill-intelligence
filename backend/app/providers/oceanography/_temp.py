"""Open-Meteo 2 m air temperature over a lattice — feeds the map's temperature
heat-map layer. Same keyless Forecast / ERA5-archive endpoints as the wind helper
(:mod:`app.providers.oceanography._wind`); returns an empty field on failure so the
caller can fall back to a synthetic pattern.
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
_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
_ARCHIVE_CUTOVER_DAYS = 80

_COOLDOWN_S = 1800.0
_cooldown_until = 0.0


@dataclass
class TempField:
    """Hourly 2 m temperature (deg C) over a fixed lattice; ``sample`` picks the nearest hour."""

    times: list[datetime]
    temp_c: list[list[float]]  # [time_index][point_index]

    def sample(self, t: datetime, point_i: int) -> float | None:
        if not self.times:
            return None
        ti = min(range(len(self.times)), key=lambda i: abs((self.times[i] - t).total_seconds()))
        row = self.temp_c[ti]
        if point_i >= len(row):
            return None
        return row[point_i]


_EMPTY = TempField(times=[], temp_c=[])


def _at(series: list[float] | None, i: int) -> float | None:
    if not series or i >= len(series):
        return None
    return series[i]


async def open_meteo_temp_2m(points: list[LonLat], start: datetime, end: datetime) -> TempField:
    """Fetch 2 m temperature for every point; empty field on failure."""
    global _cooldown_until
    if time.monotonic() < _cooldown_until:
        return _EMPTY

    params = {
        "latitude": ",".join(str(p.lat) for p in points),
        "longitude": ",".join(str(p.lon) for p in points),
        "hourly": "temperature_2m",
        "temperature_unit": "celsius",
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
        log.warning("open-meteo temperature fetch failed (%s); using synthetic field", exc)
        return _EMPTY

    batch = payload if isinstance(payload, list) else [payload]
    if not batch or "hourly" not in batch[0]:
        return _EMPTY

    times = [datetime.fromisoformat(s).replace(tzinfo=UTC) for s in batch[0]["hourly"]["time"]]
    temp: list[list[float]] = []
    for ti in range(len(times)):
        row: list[float] = []
        for gi in range(len(points)):
            hourly = batch[gi].get("hourly", {}) if gi < len(batch) else {}
            v = _at(hourly.get("temperature_2m"), ti)
            row.append(v if v is not None else float("nan"))
        temp.append(row)
    return TempField(times=times, temp_c=temp)
