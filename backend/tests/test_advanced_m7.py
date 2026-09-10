"""M7c–e — historical timeline + recovery, deeper environmental, vessel dossier."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.modules.detection.service import service as detection_service
from app.modules.environmental.service import service as environmental_service
from app.modules.investigation.service import service as investigation_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.providers.bootstrap import bootstrap_providers
from app.schemas.detection import DetectionRequest
from app.schemas.investigation import InvestigationRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest
from app.services.vessel_dossier import build as build_dossier


@pytest.fixture(autouse=True)
def _providers():
    bootstrap_providers()


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


async def _pipeline() -> str:
    sc = get_scenario(None)
    det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    await ocean_service.forecast(DriftAnalysisRequest(detection_id=det.id, horizon_hours=72))
    await investigation_service.run(InvestigationRequest(detection_id=det.id))
    return det.id


@pytest.mark.asyncio
async def test_timeline_detects_expansion() -> None:
    did = await _pipeline()
    tl = await detection_service.timeline(did)

    assert len(tl.entries) >= 3
    areas = [e.area_km2 for e in tl.entries]
    assert areas[-1] > areas[0]  # scenario profile is expanding
    assert tl.trend == "expanding"
    assert tl.trend_rationale
    assert detection_service.get(did).trend == "expanding"  # backfilled


@pytest.mark.asyncio
async def test_environmental_depth() -> None:
    did = await _pipeline()
    env = await environmental_service.assess(did)

    kinds = {r.kind for r in env.receptors}
    assert {"coral-reef", "mangrove"} <= kinds
    assert all(0 <= r.exposure <= 1 for r in env.receptors)
    assert any(r.response_note for r in env.receptors)
    assert env.response_guidance
    assert env.receptor_summary  # at least one receptor threatened


@pytest.mark.asyncio
async def test_vessel_dossier_composes_everything() -> None:
    did = await _pipeline()
    dossier = await build_dossier("374192000")

    assert dossier.vessel.name == "MV HORIZON"
    assert dossier.risk.tier in ("high", "critical")
    assert dossier.appearances and dossier.appearances[0].detection_id == did
    assert dossier.appearances[0].suspicion_score >= 0.7
    assert dossier.history_notes
    assert "recurring" in dossier.behaviour_summary.lower() or "AIS" in dossier.behaviour_summary
    assert "priority" in dossier.assessment.lower()


def test_endpoints(client: TestClient) -> None:
    sc = get_scenario(None)
    did = client.post(
        "/v1/detection/run", json={"bbox": sc.aoi.model_dump(), "scenario": sc.id}
    ).json()["id"]
    client.post("/v1/ocean/hindcast", json={"detection_id": did})
    client.post("/v1/ocean/forecast", json={"detection_id": did, "horizon_hours": 60})
    client.post("/v1/investigation/run", json={"detection_id": did})

    tl = client.get(f"/v1/detection/{did}/timeline")
    assert tl.status_code == 200
    assert tl.json()["trend"] in ("expanding", "stable", "recovering", "new")

    env = client.post(f"/v1/environment/{did}").json()
    assert "response_guidance" in env

    dos = client.get("/v1/vessel/374192000/dossier")
    assert dos.status_code == 200
    assert dos.json()["vessel"]["name"] == "MV HORIZON"
    assert client.get("/v1/vessel/000/dossier").status_code == 404
