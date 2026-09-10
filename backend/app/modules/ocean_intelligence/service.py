"""Module 2 entrypoint — the ocean intelligence engine.

    detection ─▶ resolve scenario + AOI
              ─▶ oceanography provider: currents / wind / waves / tide / SST
              ─▶ FieldSampler
                 ├─ hindcast: reverse age-graded advection ─▶ origin + release window
                 └─ forecast: forward forcing ensemble ─▶ drift scenarios, expansion,
                                                          coastal ETAs
"""

from __future__ import annotations

from datetime import timedelta

from app.core.logging import get_logger
from app.fixtures.geo_features import receptors_for
from app.fixtures.scenarios import SCENARIOS
from app.modules.detection.service import service as detection_service
from app.modules.ocean_intelligence.fields import FieldSampler
from app.modules.ocean_intelligence.forecast import run_forecast
from app.modules.ocean_intelligence.hindcast import run_hindcast
from app.providers.oceanography.base import OceanographyProvider
from app.providers.registry import registry
from app.schemas.common import BBox
from app.schemas.detection import SpillDetection
from app.schemas.ocean_intelligence import (
    DriftAnalysisRequest,
    ForecastResult,
    HindcastResult,
)
from app.schemas.oceanography import OceanFieldRequest

log = get_logger(__name__)


class OceanIntelligenceError(RuntimeError):
    pass


class OceanIntelligenceService:
    def __init__(self) -> None:
        self._hindcast: dict[str, HindcastResult] = {}
        self._forecast: dict[str, ForecastResult] = {}

    async def hindcast(self, req: DriftAnalysisRequest) -> HindcastResult:
        detection = self._detection(req.detection_id)
        age_hi = max(detection.characterisation.spill_age_hours_high, 6.0)
        sampler = await self._sampler(
            detection,
            start_offset_h=-(age_hi + 12.0),
            end_offset_h=2.0,
            pad=(1.6, 1.0, 1.2, 1.0),  # W, S, E, N
        )
        result = run_hindcast(detection, sampler)
        self._hindcast[detection.id] = result
        o = result.origin
        log.info(
            "hindcast %s: origin %.3f,%.3f  window %s → %s  conf %.2f",
            detection.id, o.point.lon, o.point.lat,
            o.release_window.start.isoformat(), o.release_window.end.isoformat(),
            o.confidence.score,
        )
        return result

    async def forecast(self, req: DriftAnalysisRequest) -> ForecastResult:
        detection = self._detection(req.detection_id)
        horizon = req.horizon_hours
        sampler = await self._sampler(
            detection,
            start_offset_h=-2.0,
            end_offset_h=horizon + 12.0,
            pad=(0.6, 1.2, 3.0, 1.4),
        )
        scenario_id = self._scenario_id(detection)
        result = run_forecast(
            detection, sampler, horizon_hours=horizon, receptors=receptors_for(scenario_id)
        )
        self._forecast[detection.id] = result
        reached = [c for c in result.affected_coasts if c.eta is not None]
        log.info(
            "forecast %s: %d/%d scenarios, %d coast(s) reached within %.0f h",
            detection.id, len(result.scenarios), len(result.scenarios),
            len(reached), horizon,
        )
        return result

    def get_hindcast(self, detection_id: str) -> HindcastResult | None:
        return self._hindcast.get(detection_id)

    def get_forecast(self, detection_id: str) -> ForecastResult | None:
        return self._forecast.get(detection_id)

    # -- internals --------------------------------------------------------
    @staticmethod
    def _detection(detection_id: str) -> SpillDetection:
        det = detection_service.get(detection_id)
        if det is None:
            raise OceanIntelligenceError(
                f"no detection '{detection_id}' — run Module 1 first"
            )
        return det

    @staticmethod
    def _scenario_id(detection: SpillDetection) -> str | None:
        for sc in SCENARIOS.values():
            if sc.incident.id == detection.incident_id:
                return sc.id
        return None

    async def _sampler(
        self,
        detection: SpillDetection,
        *,
        start_offset_h: float,
        end_offset_h: float,
        pad: tuple[float, float, float, float],
    ) -> FieldSampler:
        provider = registry.active("oceanography")
        if not isinstance(provider, OceanographyProvider):  # pragma: no cover
            raise OceanIntelligenceError("active oceanography provider is invalid")
        b = detection.geometry.bbox
        w, s, e, n = pad
        bbox = BBox(
            west=b.west - w, south=b.south - s, east=b.east + e, north=b.north + n
        )
        fields = await provider.get_fields(
            OceanFieldRequest(
                bbox=bbox,
                start=detection.detected_at + timedelta(hours=start_offset_h),
                end=detection.detected_at + timedelta(hours=end_offset_h),
                step_hours=3.0,
            )
        )
        return FieldSampler(fields)


service = OceanIntelligenceService()
