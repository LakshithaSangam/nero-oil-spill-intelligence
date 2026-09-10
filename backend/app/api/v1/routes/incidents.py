from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.providers.registry import registry
from app.schemas.incidents import Incident, IncidentQuery, IncidentSeverity

router = APIRouter()


@router.get("", response_model=list[Incident])
async def list_incidents(
    west: float | None = None,
    south: float | None = None,
    east: float | None = None,
    north: float | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    severity: IncidentSeverity | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[Incident]:
    provider = registry.active("incidents")
    bbox = None
    if None not in (west, south, east, north):
        from app.schemas.common import BBox

        bbox = BBox(west=west, south=south, east=east, north=north)  # type: ignore[arg-type]
    return await provider.query(  # type: ignore[attr-defined]
        IncidentQuery(bbox=bbox, start=start, end=end, severity=severity, limit=limit)
    )


@router.get("/{incident_id}", response_model=Incident)
async def get_incident(incident_id: str) -> Incident:
    provider = registry.active("incidents")
    incident = await provider.get(incident_id)  # type: ignore[attr-defined]
    if incident is None:
        raise HTTPException(404, f"unknown incident '{incident_id}'")
    return incident
