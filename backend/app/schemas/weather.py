"""Weather-field contracts — surface wind sampled over a viewport lattice.

Feeds the map's wind layer: a coarse grid of real 10 m wind vectors for the
current map bounds and time, so each region shows its own prevailing direction
instead of one global arrow.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import BBox


class WindVector(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    speed_ms: float = Field(ge=0)
    #: going-to bearing in degrees clockwise from true north (0 = blowing toward N)
    direction_deg: float = Field(ge=0, lt=360)


class WindFieldResponse(BaseModel):
    bbox: BBox
    valid_at: datetime
    source: str
    cols: int
    rows: int
    #: row-major, ``rows * cols`` entries (south→north outer, west→east inner)
    points: list[WindVector]


class CurrentVector(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    speed_ms: float = Field(ge=0)
    #: going-to bearing in degrees clockwise from true north (0 = flowing toward N)
    direction_deg: float = Field(ge=0, lt=360)


class CurrentFieldResponse(BaseModel):
    bbox: BBox
    valid_at: datetime
    source: str
    cols: int
    rows: int
    #: row-major, ``rows * cols`` entries (south→north outer, west→east inner)
    points: list[CurrentVector]


class TempSample(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    #: 2 m air temperature in degrees Celsius
    temp_c: float


class TempFieldResponse(BaseModel):
    bbox: BBox
    valid_at: datetime
    source: str
    cols: int
    rows: int
    #: row-major, ``rows * cols`` entries (south→north outer, west→east inner)
    points: list[TempSample]
