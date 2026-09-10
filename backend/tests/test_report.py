"""M5 — environmental rollup, cause classification, and the report generator."""

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
from app.schemas.report import ReportRequest
from app.services.report_generator import service as report_service


@pytest.fixture(autouse=True)
def _providers():
    bootstrap_providers()


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


async def _full_pipeline() -> str:
    sc = get_scenario(None)
    det = await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    await ocean_service.forecast(DriftAnalysisRequest(detection_id=det.id, horizon_hours=72))
    await investigation_service.run(InvestigationRequest(detection_id=det.id))
    return det.id


@pytest.mark.asyncio
async def test_environmental_rollup() -> None:
    did = await _full_pipeline()
    env = await environmental_service.assess(did)
    assert 0 <= env.priority_score <= 1
    assert env.receptors
    assert env.affected_area_km2_estimate > 0
    assert env.estimated_cleanup_cost_usd_low < env.estimated_cleanup_cost_usd_high
    assert env.estimated_liability_usd_high >= env.estimated_cleanup_cost_usd_high
    assert any(t.likelihood > 0 for t in env.receptors)


@pytest.mark.asyncio
async def test_report_assembles_everything() -> None:
    did = await _full_pipeline()
    report = await report_service.generate(ReportRequest(detection_id=did, investigation_id="INV-X"))

    assert report.detection_id == did
    assert report.investigation_id == "INV-X"
    assert report.lead_suspect_mmsi == "374192000"
    assert report.executive_summary
    assert report.environmental is not None
    assert {s.key for s in report.sections} == {
        "detection", "origin", "forecast", "attribution", "environmental",
        "cause", "recommendations",
    }
    assert report.cause.cause in {
        "illegal-bilge-dumping", "maintenance-discharge", "cargo-leak",
        "tanker-collision", "pipeline-rupture", "offshore-drilling-incident", "unknown",
    }
    assert report.cause.cause == "illegal-bilge-dumping"
    assert report.cause.supporting_evidence

    html = report_service.render_html(report)
    assert html.startswith("<!doctype html>")
    assert "MV HORIZON" in html
    assert "Environmental" in html


def test_report_endpoints(client: TestClient) -> None:
    sc = get_scenario(None)
    did = client.post(
        "/v1/detection/run", json={"bbox": sc.aoi.model_dump(), "scenario": sc.id}
    ).json()["id"]
    client.post("/v1/ocean/hindcast", json={"detection_id": did})
    client.post("/v1/ocean/forecast", json={"detection_id": did, "horizon_hours": 60})
    client.post("/v1/investigation/run", json={"detection_id": did})

    r = client.post("/v1/reports", json={"detection_id": did})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    assert client.get(f"/v1/reports/{rid}").status_code == 200

    html = client.get(f"/v1/reports/{rid}/render.html")
    assert html.status_code == 200
    assert "text/html" in html.headers["content-type"]

    env = client.post(f"/v1/environment/{did}")
    assert env.status_code == 200
    assert env.json()["priority_score"] >= 0

    assert client.post("/v1/reports", json={"detection_id": "nope"}).status_code == 422
