"""Live integration check for the real Copernicus Data Space imagery provider.

The CDSE OData catalogue is public, so ``search`` / ``fetch_scene`` are exercised
against the network with no credentials. The whole module skips if CDSE is
unreachable. Download-token behaviour is only asserted when COPERNICUS_* creds are
configured.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.providers.bootstrap import bootstrap_providers
from app.providers.imagery.copernicus_dataspace import CopernicusDataSpaceImagery
from app.providers.registry import registry
from app.schemas.common import BBox
from app.schemas.detection import DetectionRequest
from app.schemas.imagery import SceneSearchRequest

pytestmark = pytest.mark.asyncio

_AOI = BBox(west=70.4, south=17.9, east=71.6, north=19.1)
_START = datetime(2026, 8, 1, tzinfo=UTC)
_END = datetime(2026, 9, 6, tzinfo=UTC)


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


async def _provider_or_skip() -> CopernicusDataSpaceImagery:
    provider = CopernicusDataSpaceImagery()
    health = await provider.health()
    if health.state == "unavailable":
        pytest.skip(f"CDSE catalogue unreachable ({health.detail})")
    return provider


async def test_search_returns_real_sentinel1_scenes() -> None:
    provider = await _provider_or_skip()
    scenes = await provider.search(
        SceneSearchRequest(bbox=_AOI, start=_START, end=_END, sensor="sentinel-1-sar", max_results=10)
    )
    assert scenes, "expected at least one Sentinel-1 GRD scene over the Arabian Sea AOI"
    for s in scenes:
        assert s.provider_id == "copernicus-dataspace"
        assert s.sensor == "sentinel-1-sar"
        assert _START <= s.acquired_at <= _END
        assert s.bbox.east > s.bbox.west and s.bbox.north > s.bbox.south
        assert set(s.polarisations) <= {"VV", "VH", "HH", "HV"}
    assert scenes == sorted(scenes, key=lambda s: s.acquired_at, reverse=True)


async def test_fetch_scene_resolves_metadata() -> None:
    provider = await _provider_or_skip()
    scenes = await provider.search(
        SceneSearchRequest(bbox=_AOI, start=_START, end=_END, sensor="sentinel-1-sar", max_results=1)
    )
    if not scenes:
        pytest.skip("no S1 scene to fetch")
    tile = await provider.fetch_scene(scenes[0].id)
    assert tile.scene_id == scenes[0].id
    assert tile.width > 0 and tile.height > 0
    assert tile.href.startswith("https://")
    assert tile.format in ("png", "geotiff")


async def test_detection_runs_on_real_imagery() -> None:
    provider = await _provider_or_skip()
    _ = provider
    from app.modules.detection.service import service as detection_service

    registry.set_selection({"imagery": "copernicus-dataspace"})
    try:
        det = await detection_service.run(DetectionRequest(bbox=_AOI, scenario="arabian-sea-discharge"))
        assert det.id
        assert det.geometry.area_km2 > 0  # slick geometry still synthesised from the scenario
        scenes = await detection_service.scenes("arabian-sea-discharge")
        assert any(s.sensor == "sentinel-1-sar" for s in scenes)
    finally:
        registry.set_selection({"imagery": "mock"})
