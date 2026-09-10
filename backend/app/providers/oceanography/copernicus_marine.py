"""Copernicus Marine Service (CMEMS) — real PRIMARY oceanography provider.

https://marine.copernicus.eu/  ·  auth: CMEMS_USERNAME / CMEMS_PASSWORD

Global Analysis & Forecast model output via the ``copernicusmarine`` toolbox (lazy
Zarr over S3):

* ``cmems_mod_glo_phy_anfc_0.083deg_PT1H-m``  — hourly-mean surface uo/vo/thetao (1/12 deg)
* ``cmems_mod_glo_wav_anfc_0.083deg_PT3H-i``  — 3-hourly significant wave height VHM0

CMEMS ocean products carry no surface wind, so the 10 m wind vector the drift engine
needs for windage is borrowed from the keyless Open-Meteo helper (``_wind``).

The toolbox is synchronous and its first call pays a catalogue + Zarr-metadata cost
(a few seconds); every call here runs in a worker thread so the event loop is free.
"""

from __future__ import annotations

import asyncio
import math
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.base import BaseProvider
from app.providers.oceanography._wind import open_meteo_wind_10m
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

_PHY_DATASET = "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m"
_WAV_DATASET = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i"
_GRID = 5  # 5x5 lattice sampled from the native 1/12 deg grid

_HEALTH_TTL_S = 600.0  # a live CMEMS probe costs ~20s; cache it so /providers stays snappy
_health_cache: tuple[float, ProviderHealth] | None = None


class CopernicusMarineError(RuntimeError):
    pass


class CopernicusMarineProvider(BaseProvider):
    id = "copernicus-marine"
    domain = "oceanography"
    display_name = "Copernicus Marine Service"
    is_mock = False
    docs_url = "https://marine.copernicus.eu/"

    def capabilities(self) -> dict[str, object]:
        return {
            "variables": ["surface_current", "wind_10m", "wave_height", "sst"],
            "resolution_deg": 0.083,
            "cadence_hours": 1,
            "model": "GLOBAL_ANALYSISFORECAST_PHY_001_024 + _WAV_001_027 (wind via Open-Meteo)",
            "role": "primary",
            "api_key_required": True,
        }

    def _creds(self) -> tuple[str, str]:
        s = get_settings()
        if not (s.cmems_username and s.cmems_password):
            raise CopernicusMarineError("CMEMS_USERNAME / CMEMS_PASSWORD not set")
        return s.cmems_username, s.cmems_password

    async def health(self) -> ProviderHealth:
        global _health_cache
        try:
            user, password = self._creds()
        except CopernicusMarineError as exc:
            return ProviderHealth(state="unavailable", checked_at=datetime.now(UTC), detail=str(exc))

        if _health_cache is not None and time.monotonic() - _health_cache[0] < _HEALTH_TTL_S:
            return _health_cache[1]

        started = time.perf_counter()
        try:
            await asyncio.to_thread(_probe, user, password)
        except Exception as exc:  # noqa: BLE001 — surface any toolbox/auth failure as health
            health = ProviderHealth(
                state="unavailable",
                checked_at=datetime.now(UTC),
                detail=f"CMEMS probe failed: {type(exc).__name__}: {str(exc)[:160]}",
            )
        else:
            health = ProviderHealth(
                state="ok",
                checked_at=datetime.now(UTC),
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
                detail=f"authenticated as {user}",
            )
        _health_cache = (time.monotonic(), health)
        return health

    async def get_fields(self, request: OceanFieldRequest) -> OceanFieldResponse:
        user, password = self._creds()
        b = request.bbox
        points = [
            LonLat(lon=round(b.west + (b.east - b.west) * i / (_GRID - 1), 4),
                   lat=round(b.south + (b.north - b.south) * j / (_GRID - 1), 4))
            for j in range(_GRID)
            for i in range(_GRID)
        ]

        raw, wind = await asyncio.gather(
            asyncio.to_thread(_fetch_blocking, user, password, request),
            open_meteo_wind_10m(points, request.start, request.end),
        )
        return _assemble(request, points, raw, wind)


# ---- worker-thread functions (blocking; no event loop here) -------------------


def _probe(user: str, password: str) -> None:
    import copernicusmarine as cm

    cm.open_dataset(
        dataset_id=_PHY_DATASET,
        variables=["uo"],
        username=user,
        password=password,
        minimum_longitude=71.0, maximum_longitude=71.1,
        minimum_latitude=18.5, maximum_latitude=18.6,
        minimum_depth=0.0, maximum_depth=1.0,
    )


def _fetch_blocking(user: str, password: str, request: OceanFieldRequest) -> dict[str, Any]:
    """Open both datasets, subset to the padded bbox/window, return plain arrays."""
    import copernicusmarine as cm
    import numpy as np

    b = request.bbox
    pad = 0.15  # a little slack so nearest-neighbour always has a cell
    start = (request.start - timedelta(hours=3)).replace(tzinfo=None)
    end = (request.end + timedelta(hours=3)).replace(tzinfo=None)

    def _open(dataset_id: str, variables: list[str], depth: bool) -> Any:
        kw: dict[str, Any] = dict(
            dataset_id=dataset_id,
            variables=variables,
            username=user,
            password=password,
            minimum_longitude=b.west - pad, maximum_longitude=b.east + pad,
            minimum_latitude=b.south - pad, maximum_latitude=b.north + pad,
            start_datetime=start.isoformat(), end_datetime=end.isoformat(),
        )
        if depth:
            kw.update(minimum_depth=0.0, maximum_depth=1.0)
        return cm.open_dataset(**kw)

    phy = _open(_PHY_DATASET, ["uo", "vo", "thetao"], depth=True)
    if "depth" in phy.sizes:
        phy = phy.isel(depth=0)
    phy = phy.load()

    wav = _open(_WAV_DATASET, ["VHM0"], depth=False).load()

    def _times(ds: Any) -> list[str]:
        return [np.datetime_as_string(t, unit="s") for t in ds.time.values]

    return {
        "phy_lat": [float(v) for v in phy.latitude.values],
        "phy_lon": [float(v) for v in phy.longitude.values],
        "phy_times": _times(phy),
        "uo": np.asarray(phy["uo"].values, dtype=float).tolist(),      # [t][lat][lon]
        "vo": np.asarray(phy["vo"].values, dtype=float).tolist(),
        "thetao": np.asarray(phy["thetao"].values, dtype=float).tolist(),
        "wav_lat": [float(v) for v in wav.latitude.values],
        "wav_lon": [float(v) for v in wav.longitude.values],
        "wav_times": _times(wav),
        "vhm0": np.asarray(wav["VHM0"].values, dtype=float).tolist(),
    }


# ---- assembly (async side; builds the schema objects) ------------------------


def _nearest_idx(coords: list[float], value: float) -> int:
    return min(range(len(coords)), key=lambda i: abs(coords[i] - value))


def _nearest_time_idx(times: list[datetime], target: datetime) -> int:
    return min(range(len(times)), key=lambda i: abs((times[i] - target).total_seconds()))


def _finite_mean(grid: list[list[float]]) -> float:
    flat = [v for row in grid for v in row if v == v]  # v == v filters NaN
    return sum(flat) / len(flat) if flat else 0.0


def _assemble(
    request: OceanFieldRequest,
    points: list[LonLat],
    raw: dict[str, Any],
    wind: Any,
) -> OceanFieldResponse:
    phy_times = [datetime.fromisoformat(s).replace(tzinfo=UTC) for s in raw["phy_times"]]
    wav_times = [datetime.fromisoformat(s).replace(tzinfo=UTC) for s in raw["wav_times"]]
    if not phy_times:
        raise CopernicusMarineError("CMEMS physics subset returned no timesteps for the window")

    phy_lat, phy_lon = raw["phy_lat"], raw["phy_lon"]
    wav_lat, wav_lon = raw["wav_lat"], raw["wav_lon"]
    uo, vo, thetao, vhm0 = raw["uo"], raw["vo"], raw["thetao"], raw["vhm0"]

    step_h = max(1, round(request.step_hours))
    targets: list[datetime] = []
    t = request.start
    while t <= request.end:
        targets.append(t)
        t += timedelta(hours=step_h)
    if request.end not in targets:
        targets.append(request.end)

    steps: list[OceanConditions] = []
    for target in targets:
        pi = _nearest_time_idx(phy_times, target)
        wi = _nearest_time_idx(wav_times, target) if wav_times else None
        sst_fallback = _finite_mean(thetao[pi])
        wav_fallback = _finite_mean(vhm0[wi]) if wi is not None else 1.5

        cur, wnd, wave, sst = [], [], [], []
        for gi, at in enumerate(points):
            la = _nearest_idx(phy_lat, at.lat)
            lo = _nearest_idx(phy_lon, at.lon)
            u, v = uo[pi][la][lo], vo[pi][la][lo]
            u = u if u == u else 0.0
            v = v if v == v else 0.0
            speed = math.hypot(u, v)
            direction = math.degrees(math.atan2(u, v)) % 360.0 if speed > 1e-9 else 0.0
            cur.append(VectorSample(at=at, time=target, speed_ms=round(speed, 3),
                                    direction_deg=round(direction, 1)))

            th = thetao[pi][la][lo]
            sst.append(ScalarSample(at=at, time=target,
                                    value=round(th if th == th else sst_fallback, 2)))

            if wi is not None:
                wla = _nearest_idx(wav_lat, at.lat)
                wlo = _nearest_idx(wav_lon, at.lon)
                h = vhm0[wi][wla][wlo]
            else:
                h = float("nan")
            wave.append(ScalarSample(at=at, time=target,
                                     value=round(h if h == h else wav_fallback, 2)))

            ws, wd = wind.sample(target, gi)
            wnd.append(VectorSample(at=at, time=target, speed_ms=round(ws, 2),
                                    direction_deg=round(wd, 1)))

        steps.append(OceanConditions(time=target, surface_current=cur, wind_10m=wnd,
                                     wave_height_m=wave, sea_surface_temp_c=sst, tide_height_m=[]))

    return OceanFieldResponse(bbox=request.bbox, provider_id="copernicus-marine", steps=steps)
