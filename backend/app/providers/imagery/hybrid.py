"""Hybrid imagery — the scenario replay mock *plus* real Copernicus Data Space scenes.

``search`` always returns every mock (scenario) scene first, then fills the remaining
result budget with real Sentinel-1 / Sentinel-2 acquisitions from CDSE. This keeps
``detection.run`` deterministic — the canonical replay pass sits exactly on
``sar_pass_at`` and is never crowded out — while the scene list and the historical
timeline gain the real satellite coverage around it.

``fetch_scene`` routes by id shape: mock ids look like
``arabian-sea-discharge:sentinel-1-sar:20260828T0541`` (contain ``:``), CDSE ids are
UUIDs.

Select with ``IMAGERY_PROVIDER=hybrid``. If CDSE is unreachable or unconfigured the
provider still works — it just returns the mock scenes alone.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from app.core.logging import get_logger
from app.providers.base import BaseProvider
from app.providers.imagery.copernicus_dataspace import CopernicusDataSpaceImagery
from app.providers.imagery.mock import MockImageryProvider
from app.schemas.imagery import RasterTile, SceneRef, SceneSearchRequest
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)


class HybridImageryProvider(BaseProvider):
    id = "hybrid"
    domain = "imagery"
    display_name = "Hybrid — scenario replay + Copernicus Data Space"
    is_mock = False
    docs_url = "https://dataspace.copernicus.eu/"

    def __init__(self) -> None:
        self._mock = MockImageryProvider()
        self._real = CopernicusDataSpaceImagery()

    def capabilities(self) -> dict[str, object]:
        return {
            **self._real.capabilities(),
            "role": "primary",
            "composition": "scenario mock (always) + copernicus-dataspace (when reachable)",
        }

    async def health(self) -> ProviderHealth:
        real = await self._real.health()
        note = f"scenario replay always on; CDSE {real.state}"
        if real.detail:
            note += f" — {real.detail}"
        # mock is always available, so the hybrid is never worse than "degraded"
        state = "ok" if real.state == "ok" else "degraded"
        return ProviderHealth(
            state=state,
            checked_at=datetime.now(UTC),
            latency_ms=real.latency_ms,
            detail=note,
        )

    async def search(self, request: SceneSearchRequest) -> list[SceneRef]:
        mock_scenes = await self._mock.search(request)

        real_scenes: list[SceneRef] = []
        try:
            real_scenes = await self._real.search(request)
        except httpx.HTTPError as exc:
            log.warning("hybrid imagery: CDSE search failed (%s); returning mock only", exc)

        budget = max(0, request.max_results - len(mock_scenes))
        combined = mock_scenes + real_scenes[:budget]
        combined.sort(key=lambda s: s.acquired_at)
        return combined

    async def fetch_scene(self, scene_id: str) -> RasterTile:
        if ":" in scene_id:
            return await self._mock.fetch_scene(scene_id)
        return await self._real.fetch_scene(scene_id)
