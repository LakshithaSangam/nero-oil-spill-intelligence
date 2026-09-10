"""Module 3 output contract — suspect ranking with explainable evidence."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ais import VesselStaticInfo
from app.schemas.common import Confidence, GeoJSONFeatureCollection

EvidenceKind = Literal[
    "proximity", "ais_gap", "drift_alignment", "speed_anomaly", "course_deviation",
    "cargo_match", "time_correlation", "route_deviation", "behavioural_anomaly", "prior_history",
]
EvidencePolarity = Literal["incriminating", "mitigating", "neutral"]


class EvidenceFactor(BaseModel):
    kind: EvidenceKind
    polarity: EvidencePolarity
    weight: float = Field(ge=0, le=1)
    summary: str
    detail: str = ""
    value: float | str | None = None


class EvidenceCard(BaseModel):
    vessel: VesselStaticInfo
    suspicion_score: float = Field(ge=0, le=1)
    rank: int
    closest_approach_km: float | None = None
    closest_approach_at: datetime | None = None
    track: GeoJSONFeatureCollection
    factors: list[EvidenceFactor]
    narrative: str = ""
    confidence: Confidence


class SuspectRanking(BaseModel):
    detection_id: str
    origin_window_used: str
    candidates_considered: int
    cards: list[EvidenceCard]


class InvestigationRequest(BaseModel):
    detection_id: str
    search_radius_km: float = 40.0
    window_padding_hours: float = 12.0
