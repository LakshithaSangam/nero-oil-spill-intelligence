"""M3 — Module 2 ocean intelligence: hindcast + forecast."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import numpy as np

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.modules.detection.service import service as detection_service
from app.modules.ocean_intelligence.land_mask import on_land
from app.modules.ocean_intelligence.service import service as ocean_service
from app.providers.bootstrap import bootstrap_providers
from app.schemas.detection import DetectionRequest
from app.schemas.ocean_intelligence import DriftAnalysisRequest


@pytest.fixture(autouse=True)
def _providers():
    bootstrap_providers()


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


async def _run_detection():
    sc = get_scenario(None)
    return await detection_service.run(DetectionRequest(bbox=sc.aoi, scenario=sc.id))


@pytest.mark.asyncio
async def test_hindcast_origin_upstream_and_windowed() -> None:
    det = await _run_detection()
    hc = await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    o = hc.origin

    assert o.release_window.start < o.release_window.end <= det.detected_at
    cx, _ = det.geometry.centroid
    assert o.point.lon < cx + 0.02, (o.point.lon, cx)  # origin up-drift (west) of slick
    assert o.probability_surface.features
    assert hc.backtrack_paths.features
    assert 0 < o.confidence.score <= 1
    assert ocean_service.get_hindcast(det.id) is not None


@pytest.mark.asyncio
async def test_forecast_scenarios_and_expansion() -> None:
    det = await _run_detection()
    fc = await ocean_service.forecast(
        DriftAnalysisRequest(detection_id=det.id, horizon_hours=72)
    )

    assert {s.id for s in fc.scenarios} == {"nominal", "wind-driven", "current-dominated"}
    assert abs(sum(s.probability for s in fc.scenarios) - 1.0) < 1e-6
    for s in fc.scenarios:
        assert s.track.features

    areas = fc.expected_area_km2_by_hour
    assert areas["0"] > 0
    last = areas[max(areas, key=lambda k: int(k))]
    assert last >= areas["0"]

    assert any(c.eta is not None and c.likelihood > 0 for c in fc.affected_coasts)


@pytest.mark.asyncio
async def test_drift_paths_stay_off_land() -> None:
    """advect() has no notion of a coastline on its own — hindcast/forecast must
    stop each particle at the shore (land_mask.on_land) rather than let a path
    run straight across dry land."""
    det = await _run_detection()
    hc = await ocean_service.hindcast(DriftAnalysisRequest(detection_id=det.id))
    fc = await ocean_service.forecast(DriftAnalysisRequest(detection_id=det.id, horizon_hours=72))

    def assert_no_land(coords) -> None:
        lons = np.array([c[0] for c in coords])
        lats = np.array([c[1] for c in coords])
        assert not on_land(lons, lats).any(), coords

    for f in hc.backtrack_paths.features:
        if f.geometry.type == "LineString":
            assert_no_land(f.geometry.coordinates)

    for s in fc.scenarios:
        for f in s.track.features:
            if f.geometry.type == "LineString":
                assert_no_land(f.geometry.coordinates)


def test_ocean_endpoints(client: TestClient) -> None:
    sc = get_scenario(None)
    did = client.post(
        "/v1/detection/run", json={"bbox": sc.aoi.model_dump(), "scenario": sc.id}
    ).json()["id"]

    hc = client.post("/v1/ocean/hindcast", json={"detection_id": did})
    assert hc.status_code == 200, hc.text
    assert hc.json()["origin"]["point"]["lon"]

    fc = client.post("/v1/ocean/forecast", json={"detection_id": did, "horizon_hours": 60})
    assert fc.status_code == 200, fc.text
    assert len(fc.json()["scenarios"]) == 3

    assert client.get(f"/v1/ocean/hindcast/{did}").status_code == 200
    assert client.post("/v1/ocean/hindcast", json={"detection_id": "nope"}).status_code == 422
