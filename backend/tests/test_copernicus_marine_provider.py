"""Live integration check for the real Copernicus Marine (CMEMS) oceanography provider.

Skips entirely unless CMEMS_USERNAME / CMEMS_PASSWORD are set (in the environment or
backend/.env) AND the copernicusmarine toolbox is importable AND the service
authenticates. It hits the network and the CMEMS catalogue, so it is an integration
probe, not a unit test — and it is slow (tens of seconds).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import get_settings
from app.fixtures.scenarios import get_scenario
from app.modules.detection.service import service as detection_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.providers.bootstrap import bootstrap_providers
from app.providers.registry import registry
from app.schemas.common import BBox
from app.schemas.detection import DetectionRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest
from app.schemas.oceanography import OceanFieldRequest

pytestmark = pytest.mark.asyncio

pytest.importorskip("copernicusmarine", reason="copernicusmarine toolbox not installed")


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


def _provider():
    s = get_settings()
    if not (s.cmems_username and s.cmems_password):
        pytest.skip("CMEMS_USERNAME / CMEMS_PASSWORD not configured")
    from app.providers.oceanography.copernicus_marine import CopernicusMarineProvider

    return CopernicusMarineProvider()


async def _require_authenticated(provider) -> None:
    health = await provider.health()
    if health.state != "ok":
        pytest.skip(f"CMEMS not usable ({health.detail})")


async def test_get_fields_shape_and_units() -> None:
    provider = _provider()
    await _require_authenticated(provider)

    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    resp = await provider.get_fields(
        OceanFieldRequest(
            bbox=BBox(west=70.4, south=17.9, east=71.6, north=19.1),
            start=now - timedelta(hours=24),
            end=now + timedelta(hours=6),
            step_hours=3.0,
        )
    )

    assert resp.provider_id == "copernicus-marine"
    assert len(resp.steps) >= 4
    step = resp.steps[0]
    assert len(step.surface_current) == 25  # 5x5 lattice
    assert all(0.0 <= s.speed_ms < 5.0 for s in step.surface_current)
    assert all(0.0 <= s.direction_deg < 360.0 for s in step.surface_current)
    assert all(15.0 < s.value < 40.0 for s in step.sea_surface_temp_c)  # Arabian Sea SST degC
    assert all(a.time < b.time for a, b in zip(resp.steps, resp.steps[1:], strict=False))


async def test_hindcast_runs_on_real_cmems_fields() -> None:
    provider = _provider()
    await _require_authenticated(provider)

    registry.set_selection({"oceanography": "copernicus-marine"})
    try:
        sc = get_scenario(None)
        det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
        hc = await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))

        o = hc.origin
        cx, _ = det.geometry.centroid
        assert o.release_window.start < o.release_window.end <= det.detected_at
        assert o.point.lon < cx + 0.05  # origin up-drift of the slick
        assert 0 < o.confidence.score <= 1
        assert hc.backtrack_paths.features
    finally:
        registry.set_selection({"oceanography": "mock"})
