"""Orchestrated multi-agent investigation runs (milestone M6)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.investigation_run import (
    CreateInvestigationRequest,
    InvestigationRun,
    InvestigationRunSummary,
)
from app.services.investigation_runs import manager

router = APIRouter()


@router.post("", response_model=InvestigationRun, status_code=202)
async def create_investigation(request: CreateInvestigationRequest) -> InvestigationRun:
    """Kick the full agent workflow for an incident / scenario. Returns immediately;
    watch progress on ``GET /v1/investigations/{id}/events``."""
    return manager.create(request)


@router.get("", response_model=list[InvestigationRunSummary])
async def list_investigations() -> list[InvestigationRunSummary]:
    return manager.list()


@router.get("/{run_id}", response_model=InvestigationRun)
async def get_investigation(run_id: str) -> InvestigationRun:
    run = manager.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"unknown investigation '{run_id}'")
    return run


@router.get("/{run_id}/events")
async def investigation_events(run_id: str) -> StreamingResponse:
    if manager.get(run_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown investigation '{run_id}'")

    async def sse() -> AsyncIterator[bytes]:
        async for event in manager.stream(run_id):
            yield f"data: {event.model_dump_json()}\n\n".encode()
        run = manager.get(run_id)
        final = run.model_dump_json() if run else "{}"
        yield f"event: end\ndata: {final}\n\n".encode()

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
