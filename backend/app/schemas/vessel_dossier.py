"""Vessel & Company Intelligence dossier (advanced feature 8)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.ais import VesselStaticInfo
from app.schemas.risk_index import VesselRiskProfile


class InvestigationAppearance(BaseModel):
    detection_id: str
    rank: int
    suspicion_score: float
    closest_approach_km: float | None = None
    top_factors: list[str]
    narrative: str


class VesselDossier(BaseModel):
    vessel: VesselStaticInfo
    risk: VesselRiskProfile
    appearances: list[InvestigationAppearance] = Field(default_factory=list)
    history_notes: list[str] = Field(default_factory=list)
    behaviour_summary: str
    assessment: str
