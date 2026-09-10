"""Live integration check for the real Open-Meteo Marine oceanography provider.

Open-Meteo is keyless, so this actually hits the network. If the network is
unavailable the whole module is skipped rather than failed — it is an integration
probe, not a unit test of Neuro logic.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.fixtures.scenarios import get_scenario
from app.modules.detection.service import service as detection_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.providers.bootstrap import bootstrap_providers
from app.providers.oceanography.open_meteo_marine import OpenMeteoMarineProvider
from app.providers.registry import registry
from app.schemas.common import BBox
from app.schemas.detection import DetectionRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest
from app.schemas.oceanography import OceanFieldRequest

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


async def _require_online(provider: OpenMeteoMarineProvider) -> None:
    health = await provider.health()
    if health.state != "ok":
        pytest.skip(f"open-meteo unreachable ({health.detail}); skipping live probe")


async def test_get_fields_shape_and_units() -> None:
    provider = OpenMeteoMarineProvider()
    await _require_online(provider)

    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    resp = await provider.get_fields(
        OceanFieldRequest(
            bbox=BBox(west=70.4, south=17.9, east=71.6, north=19.1),
            start=now - timedelta(hours=24),
            end=now + timedelta(hours=12),
            step_hours=3.0,
        )
    )

    assert resp.provider_id == "open-meteo-marine"
    assert len(resp.steps) >= 6
    step = resp.steps[0]
    assert len(step.surface_current) == 9  # 3x3 lattice
    assert len(step.wind_10m) == 9
    # currents are converted km/h -> m/s: an ocean surface current well under 5 m/s
    assert all(0.0 <= s.speed_ms < 5.0 for s in step.surface_current)
    assert all(0.0 <= s.direction_deg < 360.0 for s in step.surface_current)
    assert all(0.0 <= w.speed_ms < 60.0 for w in step.wind_10m)
    assert all(s.value > 0 for s in step.sea_surface_temp_c)  # Arabian Sea SST in degC
    # steps are ordered and inside the requested window
    assert step.time >= now - timedelta(hours=25)
    assert resp.steps[-1].time <= now + timedelta(hours=13)
    assert all(a.time < b.time for a, b in zip(resp.steps, resp.steps[1:], strict=False))


async def test_hindcast_runs_on_real_fields() -> None:
    provider = OpenMeteoMarineProvider()
    await _require_online(provider)

    registry.set_selection({"oceanography": "open-meteo-marine"})
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
        assert o.probability_surface.features
    finally:
        registry.set_selection({"oceanography": "mock"})
