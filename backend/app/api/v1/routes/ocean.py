"""Module 2 — Ocean Intelligence Engine (hindcast + forecast)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.ocean_intelligence.service import OceanIntelligenceError, service
from app.schemas.ocean_intelligence import (
    DriftAnalysisRequest,
    ForecastResult,
    HindcastResult,
)

router = APIRouter()


@router.post("/hindcast", response_model=HindcastResult)
async def hindcast(request: DriftAnalysisRequest) -> HindcastResult:
    """Reverse-advect the detected slick to estimate origin location + release window."""
    try:
        return await service.hindcast(request)
    except OceanIntelligenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/forecast", response_model=ForecastResult)
async def forecast(request: DriftAnalysisRequest) -> ForecastResult:
    """Forward particle ensemble → drift scenarios, expansion, affected-coast ETAs."""
    try:
        return await service.forecast(request)
    except OceanIntelligenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/hindcast/{detection_id}", response_model=HindcastResult)
async def get_hindcast(detection_id: str) -> HindcastResult:
    result = service.get_hindcast(detection_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"no hindcast for '{detection_id}'")
    return result


@router.get("/forecast/{detection_id}", response_model=ForecastResult)
async def get_forecast(detection_id: str) -> ForecastResult:
    result = service.get_forecast(detection_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"no forecast for '{detection_id}'")
    return result
