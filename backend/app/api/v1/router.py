"""Aggregate every v1 route module."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.routes import (
    detection,
    environment,
    graph,
    health,
    incidents,
    investigation,
    investigations,
    ocean,
    providers,
    reports,
    responsible_party,
    risk,
    scenarios,
    similarity,
    vessel,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["meta"])
api_router.include_router(providers.router, prefix="/providers", tags=["providers"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
api_router.include_router(detection.router, prefix="/detection", tags=["module 1 · detection"])
api_router.include_router(ocean.router, prefix="/ocean", tags=["module 2 · ocean intelligence"])
api_router.include_router(
    investigation.router, prefix="/investigation", tags=["module 3 · investigation"]
)
api_router.include_router(environment.router, prefix="/environment", tags=["environmental"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(risk.router, prefix="/risk", tags=["pollution risk index"])
api_router.include_router(similarity.router, prefix="/similarity", tags=["spill similarity"])
api_router.include_router(graph.router, prefix="/graph", tags=["knowledge graph"])
api_router.include_router(vessel.router, prefix="/vessel", tags=["vessel intelligence"])
api_router.include_router(
    investigations.router, prefix="/investigations", tags=["multi-agent orchestration"]
)
api_router.include_router(
    responsible_party.router, prefix="/responsible-party", tags=["responsible party"]
)
