"""M4 — Module 3 maritime investigation engine."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.modules.detection.service import service as detection_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.providers.bootstrap import bootstrap_providers
from app.schemas.detection import DetectionRequest
from app.schemas.investigation import InvestigationRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest


@pytest.fixture(autouse=True)
def _providers():
    bootstrap_providers()


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


async def _prepare() -> str:
    sc = get_scenario(None)
    det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    return det.id


@pytest.mark.asyncio
async def test_investigation_surfaces_the_suspect() -> None:
    did = await _prepare()
    ranking = await investigation_service.run(InvestigationRequest(detection_id=did))

    assert ranking.candidates_considered >= 2
    assert ranking.cards
    assert [c.rank for c in ranking.cards] == list(range(1, len(ranking.cards) + 1))
    assert all(
        a.suspicion_score >= b.suspicion_score
        for a, b in zip(ranking.cards, ranking.cards[1:], strict=False)
    )

    lead = ranking.cards[0]
    assert lead.vessel.name == "MV HORIZON"
    assert lead.suspicion_score >= 0.7
    kinds = {f.kind for f in lead.factors}
    assert {"proximity", "ais_gap"} <= kinds
    assert any(f.kind == "cargo_match" and f.polarity == "incriminating" for f in lead.factors)
    assert lead.closest_approach_km is not None and lead.closest_approach_km < 3
    assert lead.track.features
    assert lead.narrative

    # the lead should be a clear standout, and the pure transit traffic scores low
    by_mmsi = {c.vessel.mmsi: c for c in ranking.cards}
    assert lead.suspicion_score - ranking.cards[1].suspicion_score > 0.3
    assert by_mmsi["236887000"].suspicion_score < 0.25  # CAPE FALCON, bulk transit
    assert by_mmsi["477553000"].suspicion_score < 0.25  # EASTERN LOTUS, container transit


@pytest.mark.asyncio
async def test_requires_hindcast_first() -> None:
    from app.modules.investigation.service import InvestigationError

    sc = get_scenario(None)
    det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    ocean_service._hindcast.pop(det.id, None)  # ensure no hindcast for this detection

    with pytest.raises(InvestigationError):
        await investigation_service.run(InvestigationRequest(detection_id=det.id))


def test_investigation_endpoints(client: TestClient) -> None:
    sc = get_scenario(None)
    did = client.post(
        "/v1/detection/run", json={"bbox": sc.aoi.model_dump(), "scenario": sc.id}
    ).json()["id"]
    client.post("/v1/ocean/hindcast", json={"detection_id": did})

    r = client.post("/v1/investigation/run", json={"detection_id": did})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cards"][0]["vessel"]["name"] == "MV HORIZON"

    assert client.get(f"/v1/investigation/{did}").status_code == 200
    assert client.post("/v1/investigation/run", json={"detection_id": "nope"}).status_code == 422
