"""Synthetic imagery for the replay scenarios — deterministic, no network."""

from __future__ import annotations

from datetime import timedelta

from app.core.config import get_settings
from app.fixtures.scenarios import SCENARIOS
from app.providers.base import BaseProvider
from app.schemas.imagery import RasterTile, SceneRef, SceneSearchRequest


class MockImageryProvider(BaseProvider):
    id = "mock"
    domain = "imagery"
    display_name = "Mock Imagery (scenario replay)"
    is_mock = True
    docs_url = None

    def capabilities(self) -> dict[str, object]:
        return {
            "sensors": ["sentinel-1-sar", "sentinel-2-eo"],
            "resolution_m": 10,
            "revisit_days": 6,
            "all_weather": True,
            "night_capable": True,
            "latency_hours": 3,
        }

    async def search(self, request: SceneSearchRequest) -> list[SceneRef]:
        refs: list[SceneRef] = []
        for scenario in SCENARIOS.values():
            if not _overlaps(scenario.aoi.as_list(), request.bbox.as_list()):
                continue
            base = scenario.sar_pass_at
            # a small time series so the historical-timeline feature has data to walk
            for offset_days, sensor in ((-6, request.sensor), (0, request.sensor), (6, request.sensor)):
                acquired = base + timedelta(days=offset_days)
                if not (request.start <= acquired <= request.end):
                    continue
                refs.append(
                    SceneRef(
                        id=f"{scenario.id}:{sensor}:{acquired:%Y%m%dT%H%M}",
                        provider_id=self.id,
                        sensor=sensor,
                        acquired_at=acquired,
                        bbox=scenario.aoi,
                        polarisations=["VV", "VH"] if "sar" in sensor else [],
                        cloud_cover_pct=None if "sar" in sensor else 12.0,
                        preview_url=f"/mock/scenes/{scenario.id}/{sensor}/{offset_days}.png",
                    )
                )
        return refs[: request.max_results]

    async def fetch_scene(self, scene_id: str) -> RasterTile:
        scenario_id = scene_id.split(":", 1)[0]
        scenario = SCENARIOS.get(scenario_id) or next(iter(SCENARIOS.values()))
        base = get_settings().public_base_url.rstrip("/")
        return RasterTile(
            scene_id=scene_id,
            bbox=scenario.aoi,
            width=1024,
            height=896,
            # a fetchable synthetic quicklook so the real CV / CNN segmenters run
            # on genuine pixels; a real provider serves the true CDSE quicklook here
            href=f"{base}/v1/detection/quicklook?scene={scene_id}",
            format="png",
            band_description="Sigma0 VV (dB), speckle-filtered" if "sar" in scene_id else "TCI",
        )


def _overlaps(a: list[float], b: list[float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])
