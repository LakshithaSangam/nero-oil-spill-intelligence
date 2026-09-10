"""Hybrid incidents — the scenario mock catalog *plus* real NOAA IncidentNews.

``query`` returns the mock incidents (scenario ground truth + the historical
reference cases) first, then appends real NOAA IncidentNews entries that match the
filter. ``get`` checks the mock first so a scenario ``incident_id`` always resolves
(the knowledge graph depends on that), then falls back to NOAA.

Select with ``INCIDENT_PROVIDER=hybrid``. If NOAA is unreachable the provider still
returns the mock catalog.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from app.core.logging import get_logger
from app.providers.base import BaseProvider
from app.providers.incidents.mock import MockIncidentProvider
from app.providers.incidents.noaa import NoaaIncidentProvider
from app.schemas.incidents import Incident, IncidentQuery
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)


class HybridIncidentProvider(BaseProvider):
    id = "hybrid"
    domain = "incidents"
    display_name = "Hybrid: scenario catalog plus NOAA IncidentNews"
    is_mock = False
    docs_url = "https://incidentnews.noaa.gov/"

    def __init__(self) -> None:
        self._mock = MockIncidentProvider()
        self._noaa = NoaaIncidentProvider()

    def capabilities(self) -> dict[str, object]:
        return {
            "composition": "scenario mock (always) + noaa (when reachable)",
            "api_key_required": False,
        }

    async def health(self) -> ProviderHealth:
        noaa = await self._noaa.health()
        return ProviderHealth(
            state="ok" if noaa.state == "ok" else "degraded",
            checked_at=datetime.now(UTC),
            latency_ms=noaa.latency_ms,
            detail=f"scenario catalog always on; NOAA {noaa.state}"
            + (f". {noaa.detail}" if noaa.detail else ""),
        )

    async def query(self, q: IncidentQuery) -> list[Incident]:
        out = await self._mock.query(q)
        try:
            real = await self._noaa.query(q)
        except httpx.HTTPError as exc:
            log.warning("hybrid incidents: NOAA query failed (%s); mock only", exc)
            real = []
        seen = {i.id for i in out}
        out += [i for i in real if i.id not in seen]
        return out[: q.limit]

    async def get(self, incident_id: str) -> Incident | None:
        found = await self._mock.get(incident_id)
        if found is not None:
            return found
        try:
            return await self._noaa.get(incident_id)
        except httpx.HTTPError:
            return None
