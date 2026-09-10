"""Vessel & Company Intelligence dossier (advanced feature 8)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.vessel_dossier import VesselDossier
from app.services.vessel_dossier import DossierError, build

router = APIRouter()


@router.get("/{mmsi}/dossier", response_model=VesselDossier)
async def vessel_dossier(mmsi: str) -> VesselDossier:
    """Static particulars, company, flag, prior record, risk score and every
    investigation this vessel has featured in."""
    try:
        return await build(mmsi)
    except DossierError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
