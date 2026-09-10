"""Primitive spatial / temporal contracts. CRS is EPSG:4326 everywhere."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class LonLat(BaseModel):
    """A single position, GeoJSON axis order (lon, lat)."""

    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)

    def as_tuple(self) -> tuple[float, float]:
        return (self.lon, self.lat)


class BBox(BaseModel):
    """Axis-aligned bounding box, [west, south, east, north]."""

    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @field_validator("east")
    @classmethod
    def _east_gt_west(cls, v: float, info: Any) -> float:  # noqa: ANN401
        west = info.data.get("west")
        if west is not None and v <= west:
            raise ValueError("east must be greater than west")
        return v

    def as_list(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]


class TimeRange(BaseModel):
    start: datetime
    end: datetime

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, v: datetime, info: Any) -> datetime:  # noqa: ANN401
        start = info.data.get("start")
        if start is not None and v < start:
            raise ValueError("end must be at or after start")
        return v


GeometryType = Literal[
    "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"
]


class GeoJSONGeometry(BaseModel):
    """RFC 7946 geometry object. Coordinates are validated structurally, not semantically."""

    type: GeometryType
    coordinates: list[Any]


class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: GeoJSONGeometry
    properties: dict[str, Any] = Field(default_factory=dict)


class GeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature] = Field(default_factory=list)


class Confidence(BaseModel):
    """A 0–1 score with the reason it landed where it did."""

    score: float = Field(ge=0, le=1)
    rationale: str = ""
