"""Investigation Report Generator (milestone M5)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.schemas.report import InvestigationReport, ReportRequest
from app.services.report_generator import ReportError, service

router = APIRouter()


@router.post("", response_model=InvestigationReport)
async def generate_report(request: ReportRequest) -> InvestigationReport:
    """Assemble detection + hindcast + forecast + suspects + environmental impact into a
    structured investigation report."""
    try:
        return await service.generate(request)
    except ReportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{report_id}", response_model=InvestigationReport)
async def get_report(report_id: str) -> InvestigationReport:
    report = service.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"unknown report '{report_id}'")
    return report


@router.get("/{report_id}/render.html", response_class=HTMLResponse)
async def render_report(report_id: str) -> str:
    report = service.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"unknown report '{report_id}'")
    return service.render_html(report)
