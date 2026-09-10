"""Satellite imagery contracts. Provider-agnostic."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import BBox

Sensor = Literal["sentinel-1-sar", "sentinel-2-eo", "generic-sar", "generic-optical"]
Polarisation = Literal["VV", "VH", "HH", "HV"]


class ImageryCapabilities(BaseModel):
    sensors: list[Sensor]
    resolution_m: float
    revisit_days: float
    all_weather: bool
    night_capable: bool
    latency_hours: float


class SceneRef(BaseModel):
    """A pointer to one acquisition — cheap to pass around, fetched on demand."""

    id: str
    provider_id: str
    sensor: Sensor
    acquired_at: datetime
    bbox: BBox
    polarisations: list[Polarisation] = Field(default_factory=list)
    cloud_cover_pct: float | None = None
    preview_url: str | None = None
    thumbnail_url: str | None = None


class RasterTile(BaseModel):
    """A retrieved raster, referenced by URL (COG / PNG) rather than inlined bytes."""

    scene_id: str
    bbox: BBox
    width: int
    height: int
    href: str
    format: Literal["cog", "png", "geotiff"] = "png"
    band_description: str = ""


class SceneSearchRequest(BaseModel):
    bbox: BBox
    start: datetime
    end: datetime
    sensor: Sensor = "sentinel-1-sar"
    max_results: int = Field(default=20, ge=1, le=200)
