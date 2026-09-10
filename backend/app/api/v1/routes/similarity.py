"""Spill Similarity Search (advanced feature 9)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.similarity.service import SimilarityError, service
from app.schemas.similarity import SimilaritySearchResult

router = APIRouter()


@router.get("/{detection_id}", response_model=SimilaritySearchResult)
async def similar_spills(detection_id: str) -> SimilaritySearchResult:
    """Nearest historical spills to this detection, with an inferred cause / vessel type."""
    try:
        return await service.search(detection_id)
    except SimilarityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
