"""Directed investigation workflow.

The DAG is fixed; each node is an Agent wrapping one module. ``run()`` walks the graph
in dependency order and yields AgentEvents so the UI can render a live activity feed.
If a phase fails, every phase that depends (transitively) on it is SKIPPED.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.agents.base import Agent, AgentContext, AgentEvent, AgentPhase, AgentStatus
from app.core.logging import get_logger

log = get_logger(__name__)

# phase -> phases that must complete first
WORKFLOW: dict[AgentPhase, tuple[AgentPhase, ...]] = {
    AgentPhase.SATELLITE: (),
    AgentPhase.OCEAN: (AgentPhase.SATELLITE,),
    AgentPhase.VESSEL: (AgentPhase.OCEAN,),
    AgentPhase.INVESTIGATION: (AgentPhase.VESSEL,),
    AgentPhase.ENVIRONMENTAL: (AgentPhase.OCEAN,),
    AgentPhase.REPORT: (AgentPhase.INVESTIGATION, AgentPhase.ENVIRONMENTAL),
}


def _topo_order() -> list[AgentPhase]:
    resolved: list[AgentPhase] = []
    while len(resolved) < len(WORKFLOW):
        for phase, deps in WORKFLOW.items():
            if phase not in resolved and all(d in resolved for d in deps):
                resolved.append(phase)
    return resolved


class Orchestrator:
    def __init__(self) -> None:
        self._agents: dict[AgentPhase, Agent] = {}

    def register(self, agent: Agent) -> None:
        self._agents[agent.phase] = agent

    def registered_phases(self) -> list[AgentPhase]:
        return [p for p in _topo_order() if p in self._agents]

    async def run(self, ctx: AgentContext) -> AsyncIterator[AgentEvent]:
        done: set[AgentPhase] = set()
        failed: set[AgentPhase] = set()

        for phase in _topo_order():
            deps = WORKFLOW[phase]
            blocked = [d for d in deps if d in failed]
            agent = self._agents.get(phase)

            if agent is None:
                yield AgentEvent(phase=phase, status=AgentStatus.SKIPPED,
                                 message=f"no {phase.value} agent registered")
                failed.add(phase)
                continue
            if blocked:
                yield AgentEvent(
                    phase=phase, status=AgentStatus.SKIPPED,
                    message=f"upstream phase failed: {', '.join(b.value for b in blocked)}",
                )
                failed.add(phase)
                continue

            yield AgentEvent(phase=phase, status=AgentStatus.RUNNING,
                             message=_intro(phase))
            try:
                result = await agent.run(ctx)
            except Exception as exc:  # noqa: BLE001 - surface any agent failure as an event
                log.exception("agent %s crashed", phase.value)
                failed.add(phase)
                yield AgentEvent(phase=phase, status=AgentStatus.FAILED,
                                 message=f"{type(exc).__name__}: {exc}", progress=1.0)
                continue

            if result.output_ref:
                ctx.scratch[f"{phase.value}_ref"] = result.output_ref
            ctx.scratch.setdefault("data", {})[phase.value] = result.data

            if result.ok:
                done.add(phase)
                yield AgentEvent(phase=phase, status=AgentStatus.DONE,
                                 message=result.rationale, progress=1.0)
            else:
                failed.add(phase)
                yield AgentEvent(phase=phase, status=AgentStatus.FAILED,
                                 message=result.rationale, progress=1.0)


def _intro(phase: AgentPhase) -> str:
    return {
        AgentPhase.SATELLITE: "Retrieving Sentinel-1 SAR and running spill detection…",
        AgentPhase.OCEAN: "Reconstructing the origin and forecasting the drift…",
        AgentPhase.VESSEL: "Reconstructing AIS traffic around the origin…",
        AgentPhase.INVESTIGATION: "Weighing the evidence and ranking suspects…",
        AgentPhase.ENVIRONMENTAL: "Assessing receptor exposure and response cost…",
        AgentPhase.REPORT: "Assembling the investigation report…",
    }[phase]


orchestrator = Orchestrator()
