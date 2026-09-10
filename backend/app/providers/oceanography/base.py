"""Oceanography provider interface — the forcing behind hindcast & forecast.

Primary: Copernicus Marine Service. Fallback: Open-Meteo Marine API.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.providers.base import DataProvider
from app.schemas.oceanography import OceanFieldRequest, OceanFieldResponse


@runtime_checkable
class OceanographyProvider(DataProvider, Protocol):
    async def get_fields(self, request: OceanFieldRequest) -> OceanFieldResponse:
        """Return time-stepped currents / wind / waves / SST / tide over the AOI."""
        ...
