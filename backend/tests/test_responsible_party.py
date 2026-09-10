"""Responsible-party identification + notification draft (investigation extension)."""

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
from app.services.responsible_party import ResponsiblePartyError, service


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
async def test_identify_company_and_draft() -> None:
    did = await _full_pipeline()
    rp = await service.identify(did, investigation_id="INV-RP")

    assert rp.detection_id == did
    assert rp.investigation_id == "INV-RP"
    assert rp.vessel_mmsi == "374192000"
    assert rp.organization  # a name, not empty
    assert rp.org_type in {
        "private_company", "government", "naval_coast_guard", "other_operator", "unknown",
    }
    assert 0.0 <= rp.confidence <= 1.0
    assert rp.recipient_kind in {"company", "authority"}
    assert "@" in rp.contact_email
    assert rp.status == "draft"

    d = rp.email_draft
    assert d.to == rp.contact_email
    assert "INV-RP" in d.subject
    assert "INV-RP" in d.body
    assert rp.vessel_name in d.body
    # every mandated fact is present
    for token in ("Detected:", "Spill position:", "Estimated size:", "Estimated origin:",
                  "Suspected vessel:", "Attribution confidence:", "Cleanup urgency:",
                  "Supporting evidence:", "Environmental impact:", "Predicted spread:"):
        assert token in d.body, token
    # no em / en dashes or arrows in user-facing text
    for bad in ("—", "–", "→", "km²"):
        assert bad not in d.body
        assert bad not in d.subject


@pytest.mark.asyncio
async def test_scenario_fleet_resolves_to_company() -> None:
    did = await _full_pipeline()
    rp = await service.identify(did)
    # MV HORIZON is operated by a named private company on the Panama register
    assert rp.org_type == "private_company"
    assert rp.country == "Panama"
    assert rp.recipient_kind == "company"
    assert rp.contact_email.startswith("hse.compliance@")
    assert "not verified" in rp.authority_note.lower()


@pytest.mark.asyncio
async def test_identify_requires_a_finished_investigation() -> None:
    with pytest.raises(ResponsiblePartyError):
        await service.identify("det-does-not-exist")


@pytest.mark.asyncio
async def test_route_serves_cached_then_refreshes(client: TestClient) -> None:
    did = await _full_pipeline()
    await service.identify(did, investigation_id="INV-ROUTE")

    r1 = client.get(f"/v1/responsible-party/{did}")
    assert r1.status_code == 200
    assert r1.json()["investigation_id"] == "INV-ROUTE"

    r2 = client.get(f"/v1/responsible-party/{did}", params={"refresh": True})
    assert r2.status_code == 200
    assert r2.json()["detection_id"] == did

    r3 = client.get("/v1/responsible-party/det-missing")
    assert r3.status_code == 422
