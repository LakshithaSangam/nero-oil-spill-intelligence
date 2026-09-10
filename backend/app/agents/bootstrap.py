"""Register every pipeline agent with the orchestrator. Called once at startup."""

from __future__ import annotations

from app.agents.orchestrator import orchestrator
from app.agents.pipeline_agents import ALL_AGENTS
from app.core.logging import get_logger

log = get_logger(__name__)


def bootstrap_agents() -> None:
    for agent in ALL_AGENTS:
        orchestrator.register(agent)
    log.info("agents registered: %s",
             ", ".join(p.value for p in orchestrator.registered_phases()))
