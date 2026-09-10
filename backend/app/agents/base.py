"""Agent base types shared by the orchestrator and every specialised agent."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol

from pydantic import BaseModel, Field


class AgentPhase(str, Enum):
    SATELLITE = "satellite"
    OCEAN = "ocean"
    VESSEL = "vessel"
    INVESTIGATION = "investigation"
    ENVIRONMENTAL = "environmental"
    REPORT = "report"


class AgentStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"


class AgentEvent(BaseModel):
    """Streamed to the frontend as 'investigation activity'."""

    phase: AgentPhase
    status: AgentStatus
    at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    message: str = ""
    progress: float | None = Field(default=None, ge=0, le=1)


class AgentResult(BaseModel):
    phase: AgentPhase
    ok: bool
    rationale: str
    output_ref: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class AgentContext(BaseModel):
    investigation_id: str
    incident_id: str | None = None
    scenario: str | None = None
    scratch: dict[str, Any] = Field(default_factory=dict)


class Agent(Protocol):
    phase: AgentPhase

    async def run(self, ctx: AgentContext) -> AgentResult: ...
