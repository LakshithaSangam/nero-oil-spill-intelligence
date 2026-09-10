"""Pollution Risk Index + Micro-Leak Early Warning contracts (advanced features 5 & 6)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ais import VesselStaticInfo
from app.schemas.common import LonLat

RiskTier = Literal["low", "elevated", "high", "critical"]


class RiskFactor(BaseModel):
    key: str
    label: str
    direction: Literal["raises", "lowers"]
    weight: float = Field(ge=0, le=1)
    detail: str
    value: float | int | str | None = None


class MicroLeakEvent(BaseModel):
    date: datetime
    location: LonLat
    area_km2: float | None = None
    confidence: float
    note: str


class VesselRiskScore(BaseModel):
    mmsi: str
    name: str | None = None
    vessel_type: str = "unknown"
    flag_state: str | None = None
    risk_score: float = Field(ge=0, le=1)
    tier: RiskTier
    headline: str
    recurring_pollution: bool = False
    micro_leak_count: int = 0
    prior_violations: int = 0
    #: how the pollution signature splits — small repeated operational leaks
    #: vs the chance the next event is a large / structural spill (sum to 1)
    micro_leak_share: float = Field(default=0.5, ge=0, le=1)
    major_leak_share: float = Field(default=0.5, ge=0, le=1)
    leak_split_note: str = ""
    updated_at: datetime


class VesselRiskProfile(VesselRiskScore):
    vessel: VesselStaticInfo
    factors: list[RiskFactor]
    micro_leaks: list[MicroLeakEvent]
    linked_event_notes: list[str] = Field(default_factory=list)


class FleetRiskIndex(BaseModel):
    generated_at: datetime
    vessels: list[VesselRiskScore]
