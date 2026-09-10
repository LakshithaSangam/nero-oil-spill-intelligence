"""AIS contracts. Any vendor maps onto these; historical reconstruction is first-class."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import BBox, LonLat

VesselType = Literal[
    "tanker", "cargo", "bulk-carrier", "container", "fishing", "passenger",
    "tug", "offshore", "military", "pleasure", "other", "unknown",
]


class VesselStaticInfo(BaseModel):
    mmsi: str
    imo: str | None = None
    name: str | None = None
    call_sign: str | None = None
    vessel_type: VesselType = "unknown"
    length_m: float | None = None
    beam_m: float | None = None
    flag_state: str | None = None
    # Vessel & Company Intelligence (Advanced 8) — populated when the provider supports it
    owner: str | None = None
    operator_company: str | None = None
    home_port: str | None = None
    cargo_declared: str | None = None
    prior_violations: int | None = None


class AISPosition(BaseModel):
    time: datetime
    position: LonLat
    sog_kn: float | None = Field(default=None, description="speed over ground, knots")
    cog_deg: float | None = Field(default=None, ge=0, lt=360, description="course over ground")
    heading_deg: float | None = Field(default=None, ge=0, lt=360)
    nav_status: str | None = None


class VesselTrack(BaseModel):
    vessel: VesselStaticInfo
    positions: list[AISPosition]
    has_gaps: bool = False
    gap_intervals: list[tuple[datetime, datetime]] = Field(default_factory=list)


class AISQuery(BaseModel):
    bbox: BBox
    start: datetime
    end: datetime
    vessel_types: list[VesselType] | None = None
