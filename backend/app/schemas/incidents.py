"""Ground-truth incident contracts (NOAA Marine Pollution Monitoring & equivalents)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import BBox, LonLat

IncidentSeverity = Literal["minor", "moderate", "major", "catastrophic", "unknown"]
IncidentStatus = Literal["reported", "confirmed", "responding", "recovered", "archived"]


class Incident(BaseModel):
    id: str
    source: str = "NOAA"
    name: str
    location: LonLat
    reported_at: datetime
    severity: IncidentSeverity = "unknown"
    status: IncidentStatus = "reported"
    substance: str | None = None
    estimated_volume_bbl: float | None = None
    description: str = ""
    external_url: str | None = None


class IncidentQuery(BaseModel):
    bbox: BBox | None = None
    start: datetime | None = None
    end: datetime | None = None
    severity: IncidentSeverity | None = None
    limit: int = Field(default=100, ge=1, le=1000)
