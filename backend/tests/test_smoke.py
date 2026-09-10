"""M0 smoke tests — app boots, provider layer is wired, mock data flows."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.fixtures.scenarios import get_scenario
from app.main import create_app
from app.providers.bootstrap import bootstrap_providers
from app.providers.registry import registry
from app.schemas.ais import AISQuery
from app.schemas.imagery import SceneSearchRequest
from app.schemas.oceanography import OceanFieldRequest


@pytest.fixture(scope="module")
def client():
    # context-manager form runs the lifespan (provider bootstrap)
    with TestClient(create_app()) as c:
        yield c


def test_health(client: TestClient) -> None:
    r = client.get("/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_providers_snapshot_has_all_domains(client: TestClient) -> None:
    r = client.get("/v1/providers")
    assert r.status_code == 200
    body = r.json()
    domains = {p["domain"] for p in body["providers"]}
    assert domains == {"imagery", "incidents", "oceanography", "ais"}
    # exactly one active provider per domain
    active = [p for p in body["providers"] if p["is_active"]]
    assert {p["domain"] for p in active} == domains


def test_scenario_incident_listed(client: TestClient) -> None:
    r = client.get("/v1/incidents")
    assert r.status_code == 200
    ids = {i["id"] for i in r.json()}
    assert "noaa-2026-arb-0421" in ids


def test_module_requires_prerequisites(client: TestClient) -> None:
    # Every module is implemented; downstream ones 422 (not 501/500) without upstream data.
    r = client.post("/v1/reports", json={"detection_id": "does-not-exist"})
    assert r.status_code == 422
    assert "run these first" in r.json()["detail"]


@pytest.mark.asyncio
async def test_mock_providers_produce_coherent_scenario_data() -> None:
    bootstrap_providers()
    sc = get_scenario(None)
    win_start, win_end = sc.release_window

    imagery = registry.get("imagery", "mock")
    scenes = await imagery.search(SceneSearchRequest(
        bbox=sc.aoi, start=datetime(2026, 8, 1, tzinfo=UTC),
        end=datetime(2026, 9, 1, tzinfo=UTC), sensor="sentinel-1-sar"))
    assert scenes, "mock imagery returned no scenes for the scenario AOI"

    incidents = registry.get("incidents", "mock")
    found = await incidents.get(sc.incident.id)
    assert found is not None

    ocean = registry.get("oceanography", "mock")
    fields = await ocean.get_fields(OceanFieldRequest(
        bbox=sc.aoi, start=win_start, end=win_end, step_hours=3))
    assert fields.steps and fields.steps[0].surface_current

    ais = registry.get("ais", "mock")
    tracks = await ais.tracks(AISQuery(bbox=sc.aoi, start=win_start, end=win_end))
    assert any(t.vessel.mmsi == sc.suspect_mmsi and t.has_gaps for t in tracks), \
        "expected the scenario suspect vessel with an AIS gap"
