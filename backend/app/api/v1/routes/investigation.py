"""Module 3 — Maritime Investigation Engine."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.investigation.service import InvestigationError, service
from app.schemas.investigation import InvestigationRequest, SuspectRanking

router = APIRouter()


@router.post("/run", response_model=SuspectRanking)
async def run_investigation(request: InvestigationRequest) -> SuspectRanking:
    """Reconstruct AIS around the hindcast origin, analyse every vessel, and return a
    ranked list of Explainable Evidence Cards."""
    try:
        return await service.run(request)
    except InvestigationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{detection_id}", response_model=SuspectRanking)
async def get_ranking(detection_id: str) -> SuspectRanking:
    ranking = service.get(detection_id)
    if ranking is None:
        raise HTTPException(status_code=404, detail=f"no investigation for '{detection_id}'")
    return ranking
