"""Advanced feature 7 output contract — environmental impact intelligence."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import GeoJSONFeatureCollection

ReceptorKind = Literal[
    "coral-reef", "mangrove", "marine-protected-area", "fishery", "coastline",
    "seagrass", "turtle-nesting", "desalination-intake",
]


class ReceptorThreat(BaseModel):
    receptor_id: str
    name: str
    kind: ReceptorKind
    geometry: GeoJSONFeatureCollection
    eta: datetime | None = None
    distance_km: float
    likelihood: float = Field(ge=0, le=1)
    sensitivity: float = Field(ge=0, le=1)
    exposure: float = Field(default=0.0, ge=0, le=1)  # likelihood × sensitivity
    response_note: str = ""


class EnvironmentalImpact(BaseModel):
    detection_id: str
    priority_score: float = Field(ge=0, le=1)
    affected_area_km2_estimate: float
    #: how rich the marine life is around the spill: "Dense" / "Moderate" / "Sparse"
    marine_biodiversity: str = "Moderate"
    #: estimated share of the local marine life affected by the spill (0..100)
    marine_life_affected_pct: float = Field(default=0.0, ge=0, le=100)
    marine_life_note: str = ""
    receptors: list[ReceptorThreat]
    receptor_summary: dict[str, int] = Field(default_factory=dict)  # kind -> count threatened
    estimated_cleanup_cost_usd_low: float
    estimated_cleanup_cost_usd_high: float
    estimated_liability_usd_low: float
    estimated_liability_usd_high: float
    response_guidance: list[str] = Field(default_factory=list)
    notes: str = ""
