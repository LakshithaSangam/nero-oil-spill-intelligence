"""M7b — spill similarity search + maritime knowledge graph."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.modules.detection.service import service as detection_service
from app.modules.environmental.service import service as environmental_service
from app.modules.investigation.service import service as investigation_service
from app.modules.knowledge_graph.service import service as graph_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.modules.similarity.service import service as similarity_service
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


async def _pipeline(full: bool = True) -> str:
    sc = get_scenario(None)
    det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    if full:
        await ocean_service.forecast(DriftAnalysisRequest(detection_id=det.id, horizon_hours=72))
        await investigation_service.run(InvestigationRequest(detection_id=det.id))
        await environmental_service.assess(det.id)
    else:
        await investigation_service.run(InvestigationRequest(detection_id=det.id))
    return det.id


@pytest.mark.asyncio
async def test_similarity_infers_operational_discharge() -> None:
    did = await _pipeline(full=False)
    res = await similarity_service.search(did)

    assert len(res.cases) >= 3
    assert all(
        a.similarity_score >= b.similarity_score
        for a, b in zip(res.cases, res.cases[1:], strict=False)
    )
    assert res.cases[0].similarity_score > 0.6
    assert res.inferred_cause in ("illegal-bilge-dumping", "maintenance-discharge")
    assert res.inferred_vessel_type in ("tanker", "bulk-carrier", "cargo")
    assert res.cases[0].matched_features
    assert "**" in res.narrative  # cause is emphasised


@pytest.mark.asyncio
async def test_knowledge_graph_connects_everything() -> None:
    did = await _pipeline(full=True)
    kg = await graph_service.build(did)

    kinds = {n.kind for n in kg.nodes}
    assert {"spill", "origin", "vessel", "company", "cargo", "cause", "weather"} <= kinds
    assert "precedent" in kinds  # similarity was lazily run

    ids = {n.id for n in kg.nodes}
    for e in kg.edges:
        assert e.source in ids and e.target in ids

    spill = next(n for n in kg.nodes if n.id == "spill")
    assert spill.ring == 0
    # the lead suspect vessel is linked from the origin
    assert any(e.source == "origin" and e.target.startswith("vessel:") for e in kg.edges)
    # evidence supports the spill node
    assert any(e.target == "spill" and e.kind == "supports" for e in kg.edges)


def test_endpoints(client: TestClient) -> None:
    sc = get_scenario(None)
    did = client.post(
        "/v1/detection/run", json={"bbox": sc.aoi.model_dump(), "scenario": sc.id}
    ).json()["id"]
    client.post("/v1/ocean/hindcast", json={"detection_id": did})
    client.post("/v1/investigation/run", json={"detection_id": did})

    sim = client.get(f"/v1/similarity/{did}")
    assert sim.status_code == 200
    assert sim.json()["cases"]

    kg = client.get(f"/v1/graph/{did}")
    assert kg.status_code == 200
    assert len(kg.json()["nodes"]) >= 8

    assert client.get("/v1/graph/nope").status_code == 422
