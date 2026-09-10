"""M2 — Module 1 detection & characterisation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.modules.detection.service import DetectionService
from app.providers.bootstrap import bootstrap_providers
from app.schemas.detection import DetectionRequest


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(autouse=True)
def _providers():
    bootstrap_providers()


@pytest.mark.asyncio
async def test_run_detection_produces_coherent_output() -> None:
    sc = get_scenario(None)
    det = await DetectionService().run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))

    g = det.geometry
    assert g.polygon.type in {"Polygon", "MultiPolygon"}
    assert 3 < g.area_km2 < 60, g.area_km2
    assert g.perimeter_km > 0
    assert g.fragment_count >= 1
    assert g.slick_length_km and g.slick_length_km > 5

    c = det.characterisation
    assert c.estimated_volume_bbl_low < c.estimated_volume_bbl_high
    assert c.spill_age_hours_low < c.spill_age_hours_high
    assert c.oil_type == "crude"  # scenario suspect declares crude
    assert 0 <= c.oil_type_confidence.score <= 1

    assert 0 < det.detection_confidence.score <= 1
    assert det.detection_confidence.rationale
    assert det.sar_scene_id
    assert det.eo_validated is True
    assert det.false_positive_checks


@pytest.mark.asyncio
async def test_centroid_inside_aoi() -> None:
    sc = get_scenario(None)
    det = await DetectionService().run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))
    cx, cy = det.geometry.centroid
    assert sc.aoi.west <= cx <= sc.aoi.east
    assert sc.aoi.south <= cy <= sc.aoi.north


def test_detection_endpoints(client: TestClient) -> None:
    sc = get_scenario(None)
    r = client.post(
        "/v1/detection/run",
        json={"bbox": sc.aoi.model_dump(), "scenario": sc.id},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    did = body["id"]
    assert body["geometry"]["area_km2"] > 0

    r2 = client.get(f"/v1/detection/{did}")
    assert r2.status_code == 200
    assert r2.json()["id"] == did

    r3 = client.get("/v1/detection/scenes", params={"scenario": sc.id})
    assert r3.status_code == 200
    sensors = {s["sensor"] for s in r3.json()}
    assert "sentinel-1-sar" in sensors and "sentinel-2-eo" in sensors

    assert client.get("/v1/detection/does-not-exist").status_code == 404
