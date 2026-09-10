"""M7a — Pollution Risk Index + Micro-Leak Early Warning."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.modules.detection.service import service as detection_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.modules.risk_index.microleak import assess
from app.modules.risk_index.service import service as risk_service
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


def test_microleak_flags_recurring_behaviour() -> None:
    horizon = assess("374192000")
    assert horizon.recurring is True
    assert horizon.count >= 3
    assert "escalate" in horizon.headline.lower()
    # micro vs major split is populated and sums to 1
    assert 0.0 < horizon.micro_share < 1.0
    assert round(horizon.micro_share + horizon.major_share, 2) == 1.0

    falcon = assess("236887000")
    assert falcon.recurring is False
    assert falcon.count == 0


@pytest.mark.asyncio
async def test_fleet_index_ranks_the_recurring_discharger_top() -> None:
    idx = await risk_service.index()
    assert idx.vessels
    top = idx.vessels[0]
    assert top.mmsi == "374192000"
    assert top.tier in ("high", "critical")
    assert top.recurring_pollution is True
    # a clean transit vessel sits well below
    falcon = next(v for v in idx.vessels if v.mmsi == "236887000")
    assert falcon.risk_score < top.risk_score
    assert falcon.tier in ("low", "elevated")


@pytest.mark.asyncio
async def test_active_investigation_raises_risk() -> None:
    sc = get_scenario(None)
    det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    await investigation_service.run(InvestigationRequest(detection_id=det.id))

    profile = await risk_service.profile("374192000")
    assert profile is not None
    keys = {f.key for f in profile.factors}
    assert "recurring_microleaks" in keys
    assert "active_investigation" in keys
    assert profile.micro_leaks
    assert profile.linked_event_notes  # the MARPOL citations


def test_risk_endpoints(client: TestClient) -> None:
    idx = client.get("/v1/risk/index")
    assert idx.status_code == 200
    body = idx.json()
    assert body["vessels"][0]["mmsi"] == "374192000"

    prof = client.get("/v1/risk/vessel/374192000")
    assert prof.status_code == 200
    assert prof.json()["factors"]

    assert client.get("/v1/risk/vessel/000000000").status_code == 404
