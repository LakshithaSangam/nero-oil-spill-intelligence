"""Responsible-Party Identification & Notification — investigation extension."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.responsible_party import ResponsibleParty
from app.services.responsible_party import ResponsiblePartyError, service

router = APIRouter()


@router.get("/{detection_id}", response_model=ResponsibleParty)
async def get_responsible_party(
    detection_id: str,
    investigation_id: str | None = Query(None),
    refresh: bool = Query(False, description="rebuild even if already computed"),
) -> ResponsibleParty:
    """Identify the organisation behind the lead suspect and draft a notification.

    Runs only after the investigation has ranked suspects. Returns a review-only
    email draft; nothing is sent.
    """
    if not refresh:
        cached = service.get(detection_id)
        if cached is not None:
            return cached
    try:
        return await service.identify(detection_id, investigation_id=investigation_id)
    except ResponsiblePartyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
