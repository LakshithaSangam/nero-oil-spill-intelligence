"""Open-Meteo Marine API — real FALLBACK oceanography provider.

https://open-meteo.com/en/docs/marine-weather-api  ·  no API key required.

Two keyless endpoints, one call each (both accept a comma-separated batch of
locations and return one result object per point):

* marine-api  — wave height, sea-surface temperature, ocean-current velocity/direction
* forecast    — 10 m wind speed / direction

The provider samples a small lattice across the requested bbox, one hourly column per
lattice point, and assembles the ``OceanConditions`` steps the drift engine consumes.
This is the graceful-degradation path when Copernicus Marine (the primary) is
unconfigured or down.

Conventions handled here:
* ocean-current velocity arrives in km/h -> converted to m/s
* ocean-current direction is already "flowing toward" -> used as-is (our going-to convention)
* wind direction is meteorological "coming from" -> rotated 180 deg to going-to
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import httpx

from app.core.logging import get_logger
from app.providers._http import get_json, http_client
from app.providers.base import BaseProvider
from app.schemas.common import LonLat
from app.schemas.oceanography import (
    OceanConditions,
    OceanFieldRequest,
    OceanFieldResponse,
    ScalarSample,
    VectorSample,
)
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)

_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_GRID = 3  # 3x3 lattice -> 9 points per request

_MARINE_HOURLY = "wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction"
_WIND_HOURLY = "wind_speed_10m,wind_direction_10m"


def _lattice(west: float, south: float, east: float, north: float) -> list[LonLat]:
    lons = [west + (east - west) * i / (_GRID - 1) for i in range(_GRID)]
    lats = [south + (north - south) * j / (_GRID - 1) for j in range(_GRID)]
    return [LonLat(lon=round(lon, 4), lat=round(lat, 4)) for lat in lats for lon in lons]


def _as_list(payload: object) -> list[dict]:
    """Open-Meteo returns a bare object for one location, a list for many."""
    if isinstance(payload, list):
        return payload
    return [payload]  # type: ignore[list-item]


def _mean(values: list[float | None]) -> float:
    nums = [v for v in values if v is not None]
    return sum(nums) / len(nums) if nums else 0.0


class OpenMeteoMarineProvider(BaseProvider):
    id = "open-meteo-marine"
    domain = "oceanography"
    display_name = "Open-Meteo Marine API"
    is_mock = False
    docs_url = "https://open-meteo.com/en/docs/marine-weather-api"

    def capabilities(self) -> dict[str, object]:
        return {
            "variables": ["surface_current", "wind_10m", "wave_height", "sst"],
            "resolution_deg": 0.083,
            "cadence_hours": 1,
            "model": "open-meteo blend (MFWAM waves / GLORYS-class currents / ERA5-ECMWF wind)",
            "role": "fallback",
            "api_key_required": False,
        }

    async def health(self) -> ProviderHealth:
        started = time.perf_counter()
        try:
            await get_json(
                _MARINE_URL,
                params={
                    "latitude": 18.5,
                    "longitude": 71.0,
                    "hourly": "wave_height",
                    "forecast_days": 1,
                },
            )
        except httpx.HTTPError as exc:
            return ProviderHealth(
                state="unavailable",
                checked_at=datetime.now(UTC),
                detail=f"open-meteo marine unreachable: {exc.__class__.__name__}",
            )
        return ProviderHealth(
            state="ok",
            checked_at=datetime.now(UTC),
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
            detail="keyless; reachable",
        )

    async def get_fields(self, request: OceanFieldRequest) -> OceanFieldResponse:
        b = request.bbox
        points = _lattice(b.west, b.south, b.east, b.north)
        lat_csv = ",".join(str(p.lat) for p in points)
        lon_csv = ",".join(str(p.lon) for p in points)

        # Open-Meteo takes whole-day ranges; widen by a day each side so the requested
        # window is fully covered, then trim on assembly.
        start_date = (request.start - timedelta(days=1)).date().isoformat()
        end_date = (request.end + timedelta(days=1)).date().isoformat()
        common = {
            "latitude": lat_csv,
            "longitude": lon_csv,
            "start_date": start_date,
            "end_date": end_date,
            "timezone": "GMT",
        }

        async with http_client() as client:
            marine = _as_list(
                await get_json(
                    _MARINE_URL,
                    params={**common, "hourly": _MARINE_HOURLY},
                    client=client,
                )
            )
            try:
                wind = _as_list(
                    await get_json(
                        _FORECAST_URL,
                        params={**common, "hourly": _WIND_HOURLY, "wind_speed_unit": "ms"},
                        client=client,
                    )
                )
            except httpx.HTTPError as exc:
                log.warning("open-meteo wind fetch failed (%s); proceeding without windage", exc)
                wind = []

        return self._assemble(request, points, marine, wind)

    # -- assembly ---------------------------------------------------------

    def _assemble(
        self,
        request: OceanFieldRequest,
        points: list[LonLat],
        marine: list[dict],
        wind: list[dict],
    ) -> OceanFieldResponse:
        if not marine or "hourly" not in marine[0]:
            raise ValueError("open-meteo marine response missing hourly block")

        times = [
            datetime.fromisoformat(t).replace(tzinfo=UTC)
            for t in marine[0]["hourly"]["time"]
        ]
        wind_index: dict[str, int] = {}
        if wind and "hourly" in wind[0]:
            wind_index = {t: i for i, t in enumerate(wind[0]["hourly"]["time"])}

        marine_times: list[str] = marine[0]["hourly"]["time"]
        step = max(1, round(request.step_hours))
        steps: list[OceanConditions] = []
        for hi, t in enumerate(times):
            if t < request.start or t > request.end or hi % step:
                continue
            wj = wind_index.get(marine_times[hi]) if wind_index else None

            cur, wnd, wave, sst = [], [], [], []
            for gi, at in enumerate(points):
                cur.append(VectorSample(
                    at=at, time=t,
                    speed_ms=round(_val(marine, "ocean_current_velocity", gi, hi) / 3.6, 3),
                    direction_deg=_val(marine, "ocean_current_direction", gi, hi) % 360,
                ))
                wave.append(ScalarSample(at=at, time=t, value=round(_val(marine, "wave_height", gi, hi), 2)))
                sst.append(ScalarSample(
                    at=at, time=t, value=round(_val(marine, "sea_surface_temperature", gi, hi), 2)
                ))
                wspd = _val(wind, "wind_speed_10m", gi, wj) if wj is not None else 0.0
                wfrom = _val(wind, "wind_direction_10m", gi, wj) if wj is not None else 0.0
                wnd.append(VectorSample(
                    at=at, time=t, speed_ms=round(wspd, 2), direction_deg=(wfrom + 180.0) % 360,
                ))

            steps.append(OceanConditions(
                time=t, surface_current=cur, wind_10m=wnd,
                wave_height_m=wave, sea_surface_temp_c=sst, tide_height_m=[],
            ))

        if not steps:
            raise ValueError(
                "open-meteo returned no hourly steps inside the requested window "
                f"({request.start.isoformat()} .. {request.end.isoformat()})"
            )
        return OceanFieldResponse(bbox=request.bbox, provider_id=self.id, steps=steps)


def _col(batch: list[dict], grid_i: int, key: str, hour_i: int | None) -> float | None:
    """One hourly value for lattice point ``grid_i`` at hour ``hour_i``; None if absent."""
    if hour_i is None or grid_i >= len(batch):
        return None
    series = batch[grid_i].get("hourly", {}).get(key)
    if not series or hour_i >= len(series):
        return None
    return series[hour_i]


def _val(batch: list[dict], key: str, grid_i: int, hour_i: int | None) -> float:
    """``_col`` with graceful fallback: the lattice value, else the step mean, else 0.0."""
    here = _col(batch, grid_i, key, hour_i)
    if here is not None:
        return float(here)
    return _mean([_col(batch, g, key, hour_i) for g in range(len(batch))])
