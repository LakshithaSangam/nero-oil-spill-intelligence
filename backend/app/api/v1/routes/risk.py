"""Pollution Risk Index + Micro-Leak Early Warning (advanced features 5 & 6)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.risk_index.service import service
from app.schemas.risk_index import FleetRiskIndex, VesselRiskProfile

router = APIRouter()


@router.get("/index", response_model=FleetRiskIndex)
async def fleet_risk_index() -> FleetRiskIndex:
    """Every known vessel ranked by continuous pollution-risk score."""
    return await service.index()


@router.get("/vessel/{mmsi}", response_model=VesselRiskProfile)
async def vessel_risk_profile(mmsi: str) -> VesselRiskProfile:
    """One vessel's risk score with the full factor breakdown and micro-leak timeline."""
    profile = await service.profile(mmsi)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"unknown vessel '{mmsi}'")
    return profile
