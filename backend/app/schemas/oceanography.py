"""Oceanographic forcing contracts — the input to the physics engine."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import BBox, LonLat


class VectorSample(BaseModel):
    """A vector quantity (current or wind) at a point/time: magnitude + direction (deg, going-to)."""

    at: LonLat
    time: datetime
    speed_ms: float
    direction_deg: float = Field(ge=0, lt=360)


class ScalarSample(BaseModel):
    at: LonLat
    time: datetime
    value: float


class OceanConditions(BaseModel):
    """A snapshot bundle used by hindcast/forecast at one step."""

    time: datetime
    surface_current: list[VectorSample] = Field(default_factory=list)
    wind_10m: list[VectorSample] = Field(default_factory=list)
    wave_height_m: list[ScalarSample] = Field(default_factory=list)
    sea_surface_temp_c: list[ScalarSample] = Field(default_factory=list)
    tide_height_m: list[ScalarSample] = Field(default_factory=list)


class OceanFieldRequest(BaseModel):
    bbox: BBox
    start: datetime
    end: datetime
    step_hours: float = Field(default=3.0, ge=0.5, le=24)


class OceanFieldResponse(BaseModel):
    bbox: BBox
    provider_id: str
    steps: list[OceanConditions]
