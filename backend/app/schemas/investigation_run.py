"""Contracts for an orchestrated investigation run (multi-agent workflow)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.agents.base import AgentEvent, AgentPhase

RunStatus = Literal["running", "complete", "failed"]


class CreateInvestigationRequest(BaseModel):
    scenario_id: str | None = None
    incident_id: str | None = None
    label: str | None = None


class InvestigationRun(BaseModel):
    id: str
    label: str
    scenario_id: str
    incident_id: str | None = None
    created_at: datetime
    finished_at: datetime | None = None
    status: RunStatus = "running"
    current_phase: AgentPhase | None = None
    completed_phases: list[AgentPhase] = Field(default_factory=list)
    detection_id: str | None = None
    report_id: str | None = None
    lead_suspect_mmsi: str | None = None
    cause: str | None = None
    events: list[AgentEvent] = Field(default_factory=list)


class InvestigationRunSummary(BaseModel):
    id: str
    label: str
    scenario_id: str
    incident_id: str | None = None
    created_at: datetime
    status: RunStatus
    current_phase: AgentPhase | None = None
    detection_id: str | None = None
    report_id: str | None = None
    lead_suspect_mmsi: str | None = None
    cause: str | None = None
