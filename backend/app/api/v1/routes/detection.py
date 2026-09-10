"""Module 1 — AI Spill Detection & Characterisation."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response

from app.modules.detection.service import DetectionError, service
from app.schemas.detection import DetectionRequest, SpillDetection, SpillTimeline
from app.schemas.imagery import SceneRef
from app.services.synthetic_sar import quicklook_png, scene_to_scenario

router = APIRouter()


@router.get("/quicklook")
async def quicklook(scene: str = Query(..., description="scene id, e.g. '<scenario>:sentinel-1-sar:...'")):
    """The Sentinel-1 quicklook the segmenters analyse. With IMAGERY_PROVIDER=mock this
    is a synthetic but physically plausible amplitude preview (dark slick on speckled
    ocean); a real provider serves the true CDSE quicklook at the same contract."""
    sensor = "sentinel-2-eo" if "sentinel-2" in scene or ":eo" in scene else "sentinel-1-sar"
    png = quicklook_png(scene_to_scenario(scene), sensor)
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@router.post("/run", response_model=SpillDetection)
async def run_detection(request: DetectionRequest) -> SpillDetection:
    """Run SAR segmentation + EO validation over an AOI and return the spill polygon,
    geometry, characterisation (volume / oil type / age) and a confidence score."""
    try:
        return await service.run(request)
    except DetectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/scenes", response_model=list[SceneRef])
async def list_scenes(scenario: str | None = Query(default=None)) -> list[SceneRef]:
    """SAR + EO acquisitions available for a scenario's AOI — backs the imagery pane."""
    return await service.scenes(scenario)


@router.get("/{detection_id}/timeline", response_model=SpillTimeline)
async def detection_timeline(detection_id: str) -> SpillTimeline:
    """Historical satellite timeline — slick area through time, trend (new / expanding /
    stable / recovering), and a before/after recovery breakdown when it is shrinking."""
    try:
        return await service.timeline(detection_id)  # type: ignore[return-value]
    except DetectionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{detection_id}", response_model=SpillDetection)
async def get_detection(detection_id: str) -> SpillDetection:
    detection = service.get(detection_id)
    if detection is None:
        raise HTTPException(status_code=404, detail=f"unknown detection '{detection_id}'")
    return detection
