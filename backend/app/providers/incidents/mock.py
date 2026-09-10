"""Mock incident catalog — the scenario incidents plus a few historical reference cases."""

from __future__ import annotations

from datetime import UTC, datetime

from app.fixtures.scenarios import SCENARIOS
from app.providers.base import BaseProvider
from app.schemas.common import LonLat
from app.schemas.incidents import Incident, IncidentQuery

_HISTORICAL: list[Incident] = [
    Incident(
        id="noaa-2021-arb-0088",
        source="NOAA (mock ground truth)",
        name="Bilge discharge, Gulf of Kutch approaches",
        location=LonLat(lon=68.71, lat=22.35),
        reported_at=datetime(2021, 3, 14, 6, 0, tzinfo=UTC),
        severity="minor",
        status="archived",
        substance="oily bilge water",
        estimated_volume_bbl=60,
        description="Short linear sheen; no responsible party identified.",
    ),
    Incident(
        id="noaa-2019-arb-0203",
        source="NOAA (mock ground truth)",
        name="Tanker cargo transfer spill off Mumbai",
        location=LonLat(lon=72.41, lat=18.79),
        reported_at=datetime(2019, 11, 2, 12, 30, tzinfo=UTC),
        severity="major",
        status="archived",
        substance="heavy fuel oil",
        estimated_volume_bbl=3200,
        description="Ship-to-ship transfer failure; shoreline impact on mangroves.",
    ),
]


class MockIncidentProvider(BaseProvider):
    id = "mock"
    domain = "incidents"
    display_name = "Mock Incident Catalog"
    is_mock = True

    def _all(self) -> list[Incident]:
        return [s.incident for s in SCENARIOS.values()] + _HISTORICAL

    async def query(self, q: IncidentQuery) -> list[Incident]:
        out = self._all()
        if q.bbox:
            b = q.bbox
            out = [i for i in out if b.west <= i.location.lon <= b.east
                   and b.south <= i.location.lat <= b.north]
        if q.start:
            out = [i for i in out if i.reported_at >= q.start]
        if q.end:
            out = [i for i in out if i.reported_at <= q.end]
        if q.severity:
            out = [i for i in out if i.severity == q.severity]
        return out[: q.limit]

    async def get(self, incident_id: str) -> Incident | None:
        return next((i for i in self._all() if i.id == incident_id), None)
