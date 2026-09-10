"""The hybrid imagery provider: scenario mock scenes + real Copernicus Data Space.

Uses the public CDSE catalogue (no credentials). If CDSE is unreachable the provider
must degrade to mock-only rather than fail — that path is asserted here too, and the
test never fails just because the network is down.
"""

from __future__ import annotations

import pytest

from app.fixtures.scenarios import get_scenario
from app.providers.bootstrap import bootstrap_providers
from app.providers.imagery.base import ImageryProvider
from app.providers.imagery.hybrid import HybridImageryProvider
from app.providers.registry import registry
from app.schemas.detection import DetectionRequest

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


async def test_registered_and_conformant() -> None:
    provider = registry.get("imagery", "hybrid")
    assert isinstance(provider, ImageryProvider)
    assert provider.is_mock is False


async def test_search_always_includes_every_mock_scene() -> None:
    provider = HybridImageryProvider()
    sc = get_scenario(None)
    from datetime import timedelta

    from app.schemas.imagery import SceneSearchRequest

    req = SceneSearchRequest(
        bbox=sc.aoi,
        start=sc.sar_pass_at - timedelta(days=10),
        end=sc.sar_pass_at + timedelta(days=10),
        sensor="sentinel-1-sar",
        max_results=20,
    )
    mock_only = await provider._mock.search(req)
    combined = await provider.search(req)

    mock_ids = {s.id for s in mock_only}
    assert mock_ids, "scenario should yield at least one mock SAR scene"
    assert mock_ids <= {s.id for s in combined}  # none dropped
    assert combined == sorted(combined, key=lambda s: s.acquired_at)


async def test_detection_stays_deterministic_under_hybrid() -> None:
    registry.set_selection({"imagery": "hybrid"})
    try:
        from app.modules.detection.service import service as detection_service

        sc = get_scenario(None)
        det = await detection_service.run(
            DetectionRequest(bbox=sc.aoi, scenario="arabian-sea-discharge")
        )
        # the canonical replay pass sits exactly on sar_pass_at and must still win
        assert det.detected_at == sc.sar_pass_at
        assert det.geometry.area_km2 > 0
    finally:
        registry.set_selection({"imagery": "mock"})


async def test_fetch_scene_routes_by_id_shape() -> None:
    provider = HybridImageryProvider()
    sc = get_scenario(None)
    from datetime import timedelta

    from app.schemas.imagery import SceneSearchRequest

    mock_scenes = await provider._mock.search(
        SceneSearchRequest(
            bbox=sc.aoi,
            start=sc.sar_pass_at - timedelta(days=1),
            end=sc.sar_pass_at + timedelta(days=1),
            sensor="sentinel-1-sar",
        )
    )
    assert mock_scenes
    tile = await provider.fetch_scene(mock_scenes[0].id)  # ':' in id -> mock branch
    assert tile.scene_id == mock_scenes[0].id
