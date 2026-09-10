"""Manages orchestrated investigation runs: create one, drive the agent workflow in
the background, and expose the activity stream (past events + live) for SSE."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from app.agents.base import AgentContext, AgentEvent, AgentPhase, AgentStatus
from app.agents.orchestrator import orchestrator
from app.core.logging import get_logger
from app.fixtures.scenarios import SCENARIOS, get_scenario
from app.schemas.investigation_run import (
    CreateInvestigationRequest,
    InvestigationRun,
    InvestigationRunSummary,
)

log = get_logger(__name__)
_SENTINEL = object()


class _RunState:
    def __init__(self, model: InvestigationRun) -> None:
        self.model = model
        self.subscribers: list[asyncio.Queue] = []
        self.task: asyncio.Task | None = None

    def publish(self, item: object) -> None:
        for q in list(self.subscribers):
            q.put_nowait(item)


class InvestigationRunManager:
    def __init__(self) -> None:
        self._runs: dict[str, _RunState] = {}

    # -- create / drive --------------------------------------------------
    def create(self, req: CreateInvestigationRequest) -> InvestigationRun:
        scenario_id = req.scenario_id
        if not scenario_id and req.incident_id:
            scenario_id = next(
                (s.id for s in SCENARIOS.values() if s.incident.id == req.incident_id), None
            )
        scenario = get_scenario(scenario_id)
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        model = InvestigationRun(
            id=run_id,
            label=req.label or f"Agent run — {scenario.name}",
            scenario_id=scenario.id,
            incident_id=req.incident_id or scenario.incident.id,
            created_at=datetime.now(UTC),
        )
        state = _RunState(model)
        self._runs[run_id] = state
        state.task = asyncio.create_task(self._drive(state, scenario.id))
        log.info("investigation run %s created for scenario %s", run_id, scenario.id)
        return model

    async def _drive(self, state: _RunState, scenario_id: str) -> None:
        m = state.model
        ctx = AgentContext(
            investigation_id=m.id, incident_id=m.incident_id, scenario=scenario_id
        )
        try:
            async for event in orchestrator.run(ctx):
                m.events.append(event)
                if event.status == AgentStatus.RUNNING:
                    m.current_phase = event.phase
                elif event.status == AgentStatus.DONE:
                    m.completed_phases.append(event.phase)
                state.publish(event)
                await asyncio.sleep(0)  # let subscribers drain

            m.detection_id = ctx.scratch.get("satellite_ref")
            m.report_id = ctx.scratch.get("report_ref")
            data = ctx.scratch.get("data", {})
            m.lead_suspect_mmsi = data.get("investigation", {}).get("lead_mmsi")
            m.cause = data.get("report", {}).get("cause")
            failed = any(e.status == AgentStatus.FAILED for e in m.events)
            m.status = "failed" if failed else "complete"

            # extension: identify the responsible organisation + draft a
            # notification once the investigation is done. Non-fatal; the
            # dashboard also fetches this on demand.
            if not failed and m.detection_id:
                try:
                    from app.services.responsible_party import service as rp_service
                    await rp_service.identify(m.detection_id, investigation_id=m.id)
                except Exception as exc:  # noqa: BLE001
                    log.warning("responsible-party step for %s skipped: %s", m.id, exc)
        except Exception as exc:  # noqa: BLE001
            log.exception("investigation run %s crashed", m.id)
            m.status = "failed"
            m.events.append(AgentEvent(
                phase=m.current_phase or AgentPhase.SATELLITE,
                status=AgentStatus.FAILED, message=f"orchestrator error: {exc}",
            ))
        finally:
            m.current_phase = None
            m.finished_at = datetime.now(UTC)
            state.publish(_SENTINEL)

    # -- read ---------------------------------------------------------
    def get(self, run_id: str) -> InvestigationRun | None:
        state = self._runs.get(run_id)
        return state.model if state else None

    def list(self) -> list[InvestigationRunSummary]:
        return [
            InvestigationRunSummary(**s.model.model_dump(exclude={"events", "completed_phases"}))
            for s in sorted(self._runs.values(),
                            key=lambda s: s.model.created_at, reverse=True)
        ]

    async def stream(self, run_id: str) -> AsyncIterator[AgentEvent]:
        state = self._runs.get(run_id)
        if state is None:
            return
        # replay everything so far
        for event in list(state.model.events):
            yield event
        if state.model.status != "running":
            return
        q: asyncio.Queue = asyncio.Queue()
        state.subscribers.append(q)
        try:
            while True:
                item = await q.get()
                if item is _SENTINEL:
                    return
                assert isinstance(item, AgentEvent)
                yield item
        finally:
            state.subscribers.remove(q)


manager = InvestigationRunManager()
