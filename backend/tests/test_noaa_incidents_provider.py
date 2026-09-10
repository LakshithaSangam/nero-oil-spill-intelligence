"""Live check for the real NOAA IncidentNews provider + the hybrid incidents provider.

The IncidentNews Atom feed is keyless, so this hits the network; the whole module
skips if the feed is unreachable.
"""

from __future__ import annotations

import pytest

from app.fixtures.scenarios import get_scenario
from app.providers.bootstrap import bootstrap_providers
from app.providers.incidents.base import IncidentProvider
from app.providers.incidents.hybrid import HybridIncidentProvider
from app.providers.incidents.noaa import NoaaIncidentProvider
from app.schemas.common import BBox
from app.schemas.incidents import IncidentQuery

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="module", autouse=True)
def _providers() -> None:
    bootstrap_providers()


async def _noaa_or_skip() -> NoaaIncidentProvider:
    provider = NoaaIncidentProvider()
    health = await provider.health()
    if health.state != "ok":
        pytest.skip(f"IncidentNews unreachable ({health.detail})")
    return provider


async def test_noaa_feed_parses_to_incidents() -> None:
    provider = await _noaa_or_skip()
    items = await provider.query(IncidentQuery(limit=20))
    assert items, "expected some incidents in the IncidentNews feed"
    for i in items:
        assert i.source == "NOAA IncidentNews"
        assert i.id.startswith("noaa-incidentnews-")
        assert -90 <= i.location.lat <= 90 and -180 <= i.location.lon <= 180
        assert i.external_url and i.external_url.startswith("https://")
    # round-trips through get()
    assert (await provider.get(items[0].id)) is not None
    assert (await provider.get("noaa-incidentnews-does-not-exist")) is None


async def test_noaa_bbox_filter() -> None:
    provider = await _noaa_or_skip()
    # a box off West Africa that the US-centric feed will not populate
    empty = await provider.query(
        IncidentQuery(bbox=BBox(west=-20, south=0, east=0, north=20), limit=20)
    )
    assert empty == []


async def test_hybrid_keeps_scenario_incident_resolvable() -> None:
    hybrid = HybridIncidentProvider()
    assert isinstance(hybrid, IncidentProvider)

    sc = get_scenario(None)
    got = await hybrid.get(sc.incident.id)
    assert got is not None and got.name == sc.incident.name  # mock wins, KG stays intact

    combined = await hybrid.query(IncidentQuery(limit=50))
    ids = {i.id for i in combined}
    assert sc.incident.id in ids
    # NOAA entries are appended when the feed is reachable
    if (await NoaaIncidentProvider().health()).state == "ok":
        assert any(i.id.startswith("noaa-incidentnews-") for i in combined)
