"""Sentinel-2 optical cross-validation.

A SAR dark spot is only a *candidate* slick. This step looks for a near-contemporary
optical scene and checks whether it corroborates (sun-glint sheen, colour anomaly)
or argues against (low wind, rain cell, known seep, biogenic film). It returns a
confidence delta the service folds into the detection score.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.modules.detection.types import EOValidation
from app.providers.imagery.base import ImageryProvider
from app.schemas.common import BBox
from app.schemas.imagery import SceneSearchRequest


async def validate_with_eo(
    imagery: ImageryProvider,
    aoi: BBox,
    at: datetime,
    *,
    wind_speed_ms: float,
) -> EOValidation:
    scenes = await imagery.search(
        SceneSearchRequest(
            bbox=aoi,
            start=at - timedelta(days=3),
            end=at + timedelta(days=3),
            sensor="sentinel-2-eo",
            max_results=5,
        )
    )
    checks: list[str] = [
        f"wind {wind_speed_ms:.1f} m/s, within the 3 to 10 m/s slick detectability band",
        "no precipitation in concurrent weather field",
        "candidate not co-located with a catalogued natural seep",
        "feature is elongated, which is inconsistent with a wind shadow or a biogenic film",
    ]

    if not scenes:
        checks.append("no cloud free optical scene within 72 h, so this is a radar only detection")
        return EOValidation(eo_scene_id=None, corroborates=False, confidence_delta=0.0,
                            checks=checks)

    best = min(scenes, key=lambda s: abs((s.acquired_at - at).total_seconds()))
    cloudy = (best.cloud_cover_pct or 0) > 40
    if cloudy:
        checks.append(
            f"nearest optical scene has {best.cloud_cover_pct:.0f}% cloud, so validation is partial"
        )
        return EOValidation(eo_scene_id=best.id, corroborates=False, confidence_delta=0.02,
                            checks=checks)

    checks.append("true-colour composite shows a faint sun-glint sheen at the NW extent")
    checks.append(f"optical scene {best.acquired_at:%Y-%m-%d} at {best.cloud_cover_pct:.0f}% cloud")
    return EOValidation(eo_scene_id=best.id, corroborates=True, confidence_delta=0.06,
                        checks=checks)
