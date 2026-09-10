"""Synthetic ocean fields — a smooth, deterministic flow field over the AOI.

A gentle south-easterly surface current with a diurnal tidal wobble and a steady
monsoon-season wind. Enough structure for the particle engine to produce a plausible
hindcast/forecast; replaced by real Copernicus Marine data in M∞.
"""

from __future__ import annotations

import math
from datetime import timedelta

from app.providers.base import BaseProvider
from app.schemas.common import LonLat
from app.schemas.oceanography import (
    OceanConditions,
    OceanFieldRequest,
    OceanFieldResponse,
    ScalarSample,
    VectorSample,
)

_GRID = 5  # 5x5 sample lattice per step


class MockOceanographyProvider(BaseProvider):
    id = "mock"
    domain = "oceanography"
    display_name = "Mock Ocean Fields (analytic)"
    is_mock = True

    def capabilities(self) -> dict[str, object]:
        return {
            "variables": ["surface_current", "wind_10m", "wave_height", "sst", "tide"],
            "resolution_deg": 0.083,
            "cadence_hours": 1,
            "model": "analytic monsoon-season approximation",
        }

    async def get_fields(self, request: OceanFieldRequest) -> OceanFieldResponse:
        b = request.bbox
        lons = [b.west + (b.east - b.west) * i / (_GRID - 1) for i in range(_GRID)]
        lats = [b.south + (b.north - b.south) * j / (_GRID - 1) for j in range(_GRID)]

        steps: list[OceanConditions] = []
        t = request.start
        while t <= request.end:
            hours = (t - request.start).total_seconds() / 3600.0
            tide_phase = math.sin(2 * math.pi * hours / 12.42)  # semi-diurnal
            cur, wind, wave, sst, tide = [], [], [], [], []
            for lon in lons:
                for lat in lats:
                    at = LonLat(lon=lon, lat=lat)
                    # Monsoon-season Arabian Sea surface flow: a steady ESE-going current
                    # with a semi-diurnal tidal wobble and mild north-south shear.
                    cur_speed = 0.46 + 0.09 * tide_phase + 0.04 * (lat - b.south)
                    cur.append(VectorSample(at=at, time=t, speed_ms=round(cur_speed, 3),
                                            direction_deg=(103.0 + 8.0 * tide_phase) % 360))
                    # SW monsoon wind blows toward the ENE (Indian coast).
                    wind.append(VectorSample(at=at, time=t, speed_ms=10.0,
                                             direction_deg=58.0))
                    wave.append(ScalarSample(at=at, time=t, value=round(1.8 + 0.25 * tide_phase, 2)))
                    sst.append(ScalarSample(at=at, time=t, value=28.4))
                    tide.append(ScalarSample(at=at, time=t, value=round(0.8 * tide_phase, 3)))
            steps.append(OceanConditions(time=t, surface_current=cur, wind_10m=wind,
                                         wave_height_m=wave, sea_surface_temp_c=sst,
                                         tide_height_m=tide))
            t += timedelta(hours=request.step_hours)

        return OceanFieldResponse(bbox=request.bbox, provider_id=self.id, steps=steps)
