"""Environmental Impact Intelligence — v1 (M5); deepened in M7+."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.modules.environmental.service import EnvironmentalError, service
from app.schemas.common import BBox
from app.schemas.environmental import EnvironmentalImpact
from app.schemas.weather import CurrentFieldResponse, TempFieldResponse, WindFieldResponse
from app.services.current_field import get_current_field
from app.services.temp_field import get_temp_field
from app.services.wind_field import get_wind_field

router = APIRouter()


@router.get("/windfield", response_model=WindFieldResponse)
async def wind_field(
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    at: datetime | None = None,
    cols: int = Query(7, ge=2, le=12),
    rows: int = Query(6, ge=2, le=12),
) -> WindFieldResponse:
    """A coarse lattice of real 10 m wind vectors for the given map bounds and time.

    Provider-independent (always keyless Open-Meteo / ERA5) so the map's wind layer
    shows each region's actual prevailing wind rather than one global direction.
    """
    if east <= west:
        raise HTTPException(status_code=422, detail="east must be greater than west")
    if north <= south:
        raise HTTPException(status_code=422, detail="north must be greater than south")
    bbox = BBox(west=west, south=south, east=east, north=north)
    return await get_wind_field(bbox, at, cols=cols, rows=rows)


@router.get("/currentfield", response_model=CurrentFieldResponse)
async def current_field(
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    at: datetime | None = None,
    cols: int = Query(7, ge=2, le=12),
    rows: int = Query(6, ge=2, le=12),
) -> CurrentFieldResponse:
    """A coarse lattice of real surface-current vectors for the given map bounds and time.

    Provider-independent (always keyless Open-Meteo Marine) so the map's current
    layer shows each region's actual flow rather than a decorative animation.
    """
    if east <= west:
        raise HTTPException(status_code=422, detail="east must be greater than west")
    if north <= south:
        raise HTTPException(status_code=422, detail="north must be greater than south")
    bbox = BBox(west=west, south=south, east=east, north=north)
    return await get_current_field(bbox, at, cols=cols, rows=rows)


@router.get("/tempfield", response_model=TempFieldResponse)
async def temp_field(
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    at: datetime | None = None,
    cols: int = Query(8, ge=2, le=14),
    rows: int = Query(6, ge=2, le=14),
) -> TempFieldResponse:
    """A coarse lattice of real 2 m air temperature (deg C) for the given map
    bounds and time — feeds the optional temperature heat-map layer. Keyless
    Open-Meteo (ERA5 archive for old windows); land and sea alike."""
    if east <= west:
        raise HTTPException(status_code=422, detail="east must be greater than west")
    if north <= south:
        raise HTTPException(status_code=422, detail="north must be greater than south")
    bbox = BBox(west=west, south=south, east=east, north=north)
    return await get_temp_field(bbox, at, cols=cols, rows=rows)


@router.post("/{detection_id}", response_model=EnvironmentalImpact)
async def assess_environment(detection_id: str) -> EnvironmentalImpact:
    """ETA to reefs / mangroves / MPAs / fisheries / coastline, environmental priority
    score, affected area and cleanup-cost / liability ranges."""
    try:
        return await service.assess(detection_id)
    except EnvironmentalError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{detection_id}", response_model=EnvironmentalImpact)
async def get_environment(detection_id: str) -> EnvironmentalImpact:
    impact = service.get(detection_id)
    if impact is None:
        raise HTTPException(status_code=404, detail=f"no assessment for '{detection_id}'")
    return impact
