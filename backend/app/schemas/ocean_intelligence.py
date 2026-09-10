"""Module 2 output contract — hindcast origin + forecast drift."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import Confidence, GeoJSONFeatureCollection, LonLat, TimeRange


class OriginEstimate(BaseModel):
    """Where + when the spill most likely began."""

    point: LonLat
    probability_surface: GeoJSONFeatureCollection  # graded polygons / grid cells
    release_window: TimeRange
    confidence: Confidence
    method: str = "reverse particle advection"


class DriftScenario(BaseModel):
    id: str
    label: str
    probability: float = Field(ge=0, le=1)
    track: GeoJSONFeatureCollection  # timestamped LineString + centroid points
    forcing_note: str = ""


class AffectedCoast(BaseModel):
    name: str
    geometry: GeoJSONFeatureCollection
    eta: datetime | None = None
    likelihood: float = Field(ge=0, le=1)


class HindcastResult(BaseModel):
    detection_id: str
    origin: OriginEstimate
    backtrack_paths: GeoJSONFeatureCollection


class ForecastResult(BaseModel):
    detection_id: str
    horizon_hours: float
    scenarios: list[DriftScenario]
    expected_area_km2_by_hour: dict[str, float] = Field(default_factory=dict)
    affected_coasts: list[AffectedCoast] = Field(default_factory=list)
    #: which environmental forcings were combined for this run (for the report / UI)
    forcing_factors: list[str] = Field(default_factory=list)


class DriftAnalysisRequest(BaseModel):
    detection_id: str
    horizon_hours: float = 72.0
    ensemble_size: int = Field(default=200, ge=10, le=5000)
