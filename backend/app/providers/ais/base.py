"""AIS provider interface. Historical reconstruction is a first-class capability;
no single vendor is assumed. Candidates: MarineCadastre, Global Fishing Watch, others.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.providers.base import DataProvider
from app.schemas.ais import AISQuery, VesselStaticInfo, VesselTrack


@runtime_checkable
class AISProvider(DataProvider, Protocol):
    async def tracks(self, q: AISQuery) -> list[VesselTrack]:
        """Reconstruct vessel tracks intersecting the AOI + time window."""
        ...

    async def vessel(self, mmsi: str) -> VesselStaticInfo | None:
        ...

    async def fleet(self) -> list[VesselStaticInfo]:
        """Every vessel the provider knows about (for the fleet risk index).
        May be empty for providers that only answer point queries."""
        ...
