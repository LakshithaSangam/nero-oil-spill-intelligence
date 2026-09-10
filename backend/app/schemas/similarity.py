"""Spill Similarity Search contracts (advanced feature 9)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import LonLat


class SimilarCase(BaseModel):
    id: str
    name: str
    date: datetime
    location: LonLat
    area_km2: float
    oil_type: str
    cause: str
    likely_vessel_type: str | None = None
    outcome: str
    source: str
    similarity_score: float = Field(ge=0, le=1)
    matched_features: list[str]


class SimilaritySearchResult(BaseModel):
    detection_id: str
    query_summary: str
    cases: list[SimilarCase]
    inferred_cause: str
    inferred_cause_confidence: float = Field(ge=0, le=1)
    inferred_vessel_type: str | None = None
    narrative: str
