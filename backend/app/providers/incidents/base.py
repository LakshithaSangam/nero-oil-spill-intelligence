"""Incident (ground-truth) provider interface.

NOAA Marine Pollution Monitoring is the reference implementation. Incidents are used
for detection validation, historical replay and cross-spill comparison — never as an
imagery source.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.providers.base import DataProvider
from app.schemas.incidents import Incident, IncidentQuery


@runtime_checkable
class IncidentProvider(DataProvider, Protocol):
    async def query(self, q: IncidentQuery) -> list[Incident]:
        ...

    async def get(self, incident_id: str) -> Incident | None:
        ...
