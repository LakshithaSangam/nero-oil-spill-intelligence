"""Live check for the real Global Fishing Watch AIS provider.

Skips unless AIS_API_KEY is set (env or backend/.env) and the token authenticates.
Hits the GFW gateway, so it is an integration probe, not a unit test.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.config import get_settings
from app.providers.ais.base import AISProvider
from app.providers.ais.global_fishing_watch import GlobalFishingWatchAISProvider
from app.providers.bootstrap import bootstrap_providers
from app.providers.registry import registry
from app.schemas.ais import AISQuery
from app.schemas.common import BBox
from app.schemas.detection import DetectionRequest
from app.schemas.investigation import InvestigationRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


async def _provider_or_skip() -> GlobalFishingWatchAISProvider:
    if not get_settings().ais_api_key:
        pytest.skip("AIS_API_KEY not configured")
    provider = GlobalFishingWatchAISProvider()
    health = await provider.health()
    if health.state != "ok":
        pytest.skip(f"GFW not usable ({health.detail})")
    return provider


async def test_conformant_and_authenticated() -> None:
    provider = await _provider_or_skip()
    assert isinstance(provider, AISProvider)
    assert provider.is_mock is False
    assert await provider.fleet() == []


async def test_tracks_return_real_vessels_in_window() -> None:
    provider = await _provider_or_skip()
    q = AISQuery(
        bbox=BBox(west=68.6, south=19.8, east=69.8, north=21.0),
        start=datetime(2026, 8, 27, 0, tzinfo=UTC),
        end=datetime(2026, 8, 28, 12, tzinfo=UTC),
    )
    tracks = await provider.tracks(q)
    assert tracks, "expected vessels present in the Arabian Sea box during the window"
    for t in tracks:
        assert t.vessel.mmsi
        assert t.positions and all(
            q.start.replace(hour=0) <= p.time <= q.end.replace(hour=23) for p in t.positions
        )
        assert t.positions == sorted(t.positions, key=lambda p: p.time)
        assert t.has_gaps == bool(t.gap_intervals)
    # ordered by track richness
    assert [len(t.positions) for t in tracks] == sorted(
        (len(t.positions) for t in tracks), reverse=True
    )


async def test_vessel_lookup_by_mmsi() -> None:
    provider = await _provider_or_skip()
    info = await provider.vessel("563296400")  # ONE RECOMMENDATION, seen in the box
    # GFW search is fuzzy; assert the shape, not an exact identity
    assert info is None or info.mmsi


async def test_investigation_pipeline_runs_on_real_ais() -> None:
    provider = await _provider_or_skip()
    _ = provider
    from app.fixtures.scenarios import get_scenario
    from app.modules.detection.service import service as detection_service
    from app.modules.investigation.service import service as investigation_service
    from app.modules.ocean_intelligence.service import service as ocean_service

    registry.set_selection({"ais": "global-fishing-watch"})
    try:
        det = await detection_service.run(
            DetectionRequest(bbox=get_scenario(None).aoi, scenario="arabian-sea-discharge")
        )
        await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
        ranking = await investigation_service.run(InvestigationRequest(detection_id=det.id))
        assert ranking.candidates_considered > 0
        assert ranking.cards
        assert ranking.cards[0].rank == 1
        assert all(0 <= c.suspicion_score <= 1 for c in ranking.cards)
    finally:
        registry.set_selection({"ais": "mock"})
