from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.fixtures.scenarios import SCENARIOS, get_scenario
from app.schemas.common import BBox, LonLat
from app.schemas.incidents import Incident

router = APIRouter()


class ScenarioSummary(BaseModel):
    id: str
    name: str
    summary: str
    aoi: BBox
    origin_hint: LonLat
    incident: Incident
    tags: list[str]


def _to_summary(sid: str) -> ScenarioSummary:
    s = get_scenario(sid)
    return ScenarioSummary(
        id=s.id, name=s.name, summary=s.summary, aoi=s.aoi,
        origin_hint=s.origin_hint, incident=s.incident, tags=s.tags,
    )


@router.get("", response_model=list[ScenarioSummary])
async def list_scenarios() -> list[ScenarioSummary]:
    return [_to_summary(sid) for sid in SCENARIOS]


@router.get("/{scenario_id}", response_model=ScenarioSummary)
async def get_scenario_detail(scenario_id: str) -> ScenarioSummary:
    if scenario_id not in SCENARIOS:
        raise HTTPException(404, f"unknown scenario '{scenario_id}'")
    return _to_summary(scenario_id)
