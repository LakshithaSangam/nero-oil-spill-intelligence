"""Module 1 output contract — spill detection & characterisation."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import BBox, Confidence, GeoJSONGeometry

OilType = Literal[
    "crude", "heavy-fuel-oil", "light-refined", "bilge-oily-water",
    "vegetable-or-biogenic", "unknown",
]
SpillTrend = Literal["new", "expanding", "stable", "recovering", "unknown"]


class SpillGeometry(BaseModel):
    polygon: GeoJSONGeometry  # Polygon or MultiPolygon, EPSG:4326
    bbox: BBox
    area_km2: float
    perimeter_km: float
    centroid: tuple[float, float]
    slick_length_km: float | None = None
    fragment_count: int = 1


class SpillCharacterisation(BaseModel):
    estimated_volume_bbl_low: float
    estimated_volume_bbl_high: float
    oil_type: OilType
    oil_type_confidence: Confidence
    spill_age_hours_low: float
    spill_age_hours_high: float
    thickness_class: Literal["sheen", "rainbow", "metallic", "discontinuous", "continuous"]


class SpillDetection(BaseModel):
    id: str
    incident_id: str | None = None
    detected_at: datetime
    sar_scene_id: str
    eo_scene_id: str | None = None
    eo_validated: bool = False
    geometry: SpillGeometry
    characterisation: SpillCharacterisation
    detection_confidence: Confidence
    false_positive_checks: list[str] = Field(default_factory=list)
    trend: SpillTrend = "unknown"
    #: which segmenter produced the mask, and its own note
    segmentation_model_id: str = "mock-scenario-v1"
    segmentation_notes: str = ""


class DetectionRequest(BaseModel):
    incident_id: str | None = None
    bbox: BBox
    at: datetime | None = None
    scenario: str | None = None
    # override the configured segmentation model for this run
    segmentation_model: Literal["mock", "classical-sar", "trained-unet"] | None = None


class SpillTimelineEntry(BaseModel):
    scene_id: str
    sensor: str
    acquired_at: datetime
    area_km2: float
    perimeter_km: float
    centroid: tuple[float, float]
    area_delta_pct: float | None = None  # vs the previous entry


class RecoveryAnalysis(BaseModel):
    baseline_scene_id: str
    latest_scene_id: str
    baseline_area_km2: float
    peak_area_km2: float
    latest_area_km2: float
    reduction_from_peak_pct: float
    cleaned_area_km2: float
    remaining_area_km2: float
    assessment: str


class SpillTimeline(BaseModel):
    detection_id: str
    entries: list[SpillTimelineEntry]
    trend: SpillTrend
    trend_rationale: str
    recovery: RecoveryAnalysis | None = None
