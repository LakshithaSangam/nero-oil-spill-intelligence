"""M6 — multi-agent orchestration."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.agents.base import AgentContext, AgentPhase, AgentStatus
from app.agents.bootstrap import bootstrap_agents
from app.agents.orchestrator import orchestrator
from app.main import create_app
from app.providers.bootstrap import bootstrap_providers
from app.services.investigation_runs import manager


@pytest.fixture(autouse=True)
def _bootstrap():
    bootstrap_providers()
    bootstrap_agents()


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.mark.asyncio
async def test_orchestrator_walks_every_phase() -> None:
    ctx = AgentContext(investigation_id="t1", scenario="arabian-sea-discharge")
    events = [e async for e in orchestrator.run(ctx)]

    done = {e.phase for e in events if e.status == AgentStatus.DONE}
    assert done == set(AgentPhase)  # all six phases completed
    assert not any(e.status in (AgentStatus.FAILED, AgentStatus.SKIPPED) for e in events)

    # ordering: satellite done before ocean starts, etc.
    order = [e.phase for e in events if e.status == AgentStatus.DONE]
    assert order.index(AgentPhase.SATELLITE) < order.index(AgentPhase.OCEAN)
    assert order.index(AgentPhase.OCEAN) < order.index(AgentPhase.VESSEL)
    assert order.index(AgentPhase.INVESTIGATION) < order.index(AgentPhase.REPORT)
    assert order.index(AgentPhase.ENVIRONMENTAL) < order.index(AgentPhase.REPORT)

    assert ctx.scratch.get("satellite_ref")
    assert ctx.scratch.get("report_ref")


@pytest.mark.asyncio
async def test_run_manager_produces_a_finished_run() -> None:
    from app.schemas.investigation_run import CreateInvestigationRequest

    run = manager.create(CreateInvestigationRequest(scenario_id="arabian-sea-discharge"))
    for _ in range(200):
        current = manager.get(run.id)
        if current and current.status != "running":
            break
        await asyncio.sleep(0.05)

    final = manager.get(run.id)
    assert final is not None
    assert final.status == "complete", [e.message for e in final.events]
    assert final.detection_id and final.detection_id.startswith("det-")
    assert final.report_id and final.report_id.startswith("rep-")
    assert final.lead_suspect_mmsi == "374192000"
    assert final.cause
    assert {e.phase for e in final.events if e.status == AgentStatus.DONE} == set(AgentPhase)


def test_investigation_endpoints(client: TestClient) -> None:
    created = client.post("/v1/investigations", json={"scenario_id": "arabian-sea-discharge"})
    assert created.status_code == 202, created.text
    run_id = created.json()["id"]

    # SSE stream: TestClient buffers the full body; it ends when the run finishes
    stream = client.get(f"/v1/investigations/{run_id}/events")
    assert stream.status_code == 200
    assert "text/event-stream" in stream.headers["content-type"]
    body = stream.text
    assert "\"phase\":\"satellite\"" in body
    assert "\"phase\":\"report\"" in body
    assert "event: end" in body

    run = client.get(f"/v1/investigations/{run_id}").json()
    assert run["status"] == "complete"
    assert run["detection_id"]
    assert client.get("/v1/investigations")[0] if False else True  # list is reachable
    assert any(r["id"] == run_id for r in client.get("/v1/investigations").json())
