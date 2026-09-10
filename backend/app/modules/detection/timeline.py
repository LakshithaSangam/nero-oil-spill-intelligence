"""Historical Satellite Timeline + Before/After Recovery (advanced features 1 & 2).

Runs the segmentation over every SAR acquisition in a window around the detection,
compares the slick geometry through time, classifies the trend (new / expanding /
stable / recovering) and, when the slick is shrinking, quantifies the recovery.
"""

from __future__ import annotations

from datetime import timedelta

from app.core.logging import get_logger
from app.fixtures.scenarios import get_scenario
from app.modules.detection.geometry import build_geometry
from app.modules.detection.models import MockSegmentationModel
from app.providers.imagery.base import ImageryProvider
from app.providers.registry import registry
from app.schemas.common import LonLat
from app.schemas.detection import (
    RecoveryAnalysis,
    SpillDetection,
    SpillTimeline,
    SpillTimelineEntry,
)
from app.schemas.imagery import SceneSearchRequest

log = get_logger(__name__)
_KM_LAT = 110.574


class TimelineError(RuntimeError):
    pass


async def build_timeline(detection: SpillDetection) -> SpillTimeline:
    scenario = _scenario_for(detection)
    imagery = registry.active("imagery")
    if not isinstance(imagery, ImageryProvider):  # pragma: no cover
        raise TimelineError("active imagery provider does not implement ImageryProvider")

    scenes = await imagery.search(SceneSearchRequest(
        bbox=scenario.aoi,
        start=scenario.sar_pass_at - timedelta(days=20),
        end=scenario.sar_pass_at + timedelta(days=20),
        sensor="sentinel-1-sar",
        max_results=12,
    ))
    scenes = sorted(scenes, key=lambda s: s.acquired_at)
    if not scenes:
        raise TimelineError("no SAR scenes available for a timeline")

    import math

    ex, nx = scenario.slick_offset_km
    slick_center = LonLat(
        lon=scenario.origin_hint.lon + ex / (111.320 * math.cos(math.radians(scenario.origin_hint.lat))),
        lat=scenario.origin_hint.lat + nx / _KM_LAT,
    )

    entries: list[SpillTimelineEntry] = []
    prev_area: float | None = None
    for scene in scenes:
        offset_days = round((scene.acquired_at - scenario.sar_pass_at).total_seconds() / 86400.0)
        scale = _nearest_profile(scenario.timeline_profile, offset_days)
        model = MockSegmentationModel(center=slick_center, bearing_deg=88.0, area_scale=scale)
        tile = await imagery.fetch_scene(scene.id)
        seg = await model.infer(tile, scenario.aoi)
        geom = build_geometry(seg.mask)
        delta = None if prev_area is None else round((geom.area_km2 - prev_area) / max(prev_area, 0.01) * 100, 1)
        entries.append(SpillTimelineEntry(
            scene_id=scene.id, sensor=scene.sensor, acquired_at=scene.acquired_at,
            area_km2=geom.area_km2, perimeter_km=geom.perimeter_km,
            centroid=geom.centroid, area_delta_pct=delta,
        ))
        prev_area = geom.area_km2

    trend, rationale = _classify_trend(entries)
    recovery = _recovery(entries) if trend in ("recovering", "stable") else None
    log.info("timeline %s: %d scenes, trend=%s", detection.id, len(entries), trend)
    return SpillTimeline(
        detection_id=detection.id, entries=entries,
        trend=trend, trend_rationale=rationale, recovery=recovery,
    )


# --------------------------------------------------------------------------- #
def _scenario_for(detection: SpillDetection):
    from app.fixtures.scenarios import SCENARIOS

    for sc in SCENARIOS.values():
        if sc.incident.id == detection.incident_id:
            return sc
    return get_scenario(None)


def _nearest_profile(profile: dict[int, float], offset_days: int) -> float:
    if not profile:
        return 1.0
    key = min(profile, key=lambda k: abs(k - offset_days))
    # linear-ish interpolation toward the neighbour on the requested side
    lo = max((k for k in profile if k <= offset_days), default=key)
    hi = min((k for k in profile if k >= offset_days), default=key)
    if lo == hi:
        return profile[key]
    f = (offset_days - lo) / (hi - lo)
    return profile[lo] + (profile[hi] - profile[lo]) * f


def _classify_trend(entries: list[SpillTimelineEntry]) -> tuple[str, str]:
    if len(entries) < 2:
        return "new", "single observation, the first confirmed detection."
    areas = [e.area_km2 for e in entries]
    peak = max(areas)
    first, last = areas[0], areas[-1]
    # slope of a simple linear fit over index
    n = len(areas)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(areas) / n
    denom = sum((x - mean_x) ** 2 for x in xs) or 1.0
    slope = sum((xs[i] - mean_x) * (areas[i] - mean_y) for i in range(n)) / denom

    if last <= 0.35 * peak and slope < 0:
        return "recovering", (
            f"area down to {last:.1f} km² from a peak of {peak:.1f} km² "
            f"({(1 - last / peak) * 100:.0f}% reduction) and still falling."
        )
    if slope > 0.12 * mean_y:
        return "expanding", (
            f"area growing from {first:.1f} to {last:.1f} km² across "
            f"{n} passes ({(last / first - 1) * 100:.0f}% over the series)."
        )
    if last < 0.7 * peak:
        return "recovering", (
            f"past the peak ({peak:.1f} km²); latest {last:.1f} km², weathering / dispersing."
        )
    return "stable", f"area holding near {mean_y:.1f} km² across {n} passes."


def _recovery(entries: list[SpillTimelineEntry]) -> RecoveryAnalysis:
    areas = [e.area_km2 for e in entries]
    peak_i = max(range(len(areas)), key=lambda i: areas[i])
    baseline, latest = entries[0], entries[-1]
    peak_area = areas[peak_i]
    reduction = (1 - latest.area_km2 / peak_area) * 100 if peak_area else 0.0
    cleaned = max(peak_area - latest.area_km2, 0.0)
    if reduction >= 60:
        note = "Strong recovery. Keep monitoring for re sheening and residual shoreline oil."
    elif reduction >= 25:
        note = "Partial recovery underway; maintain response assets on station."
    else:
        note = "Little net change. Response is not yet effective, or the source is ongoing."
    return RecoveryAnalysis(
        baseline_scene_id=baseline.scene_id, latest_scene_id=latest.scene_id,
        baseline_area_km2=baseline.area_km2, peak_area_km2=round(peak_area, 2),
        latest_area_km2=latest.area_km2,
        reduction_from_peak_pct=round(reduction, 1),
        cleaned_area_km2=round(cleaned, 2),
        remaining_area_km2=latest.area_km2,
        assessment=note,
    )
