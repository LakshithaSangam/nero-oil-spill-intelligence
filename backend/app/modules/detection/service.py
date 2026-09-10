"""Module 1 entrypoint — orchestrates the detection pipeline.

    imagery provider ──▶ SAR scene search + fetch
                    │
        preprocess (SAR) ─▶ segmentation model ─▶ EO validation
                                            │
                    boundary vectorisation (geometry) ─▶ characterisation
                                            │
                                    SpillDetection (+ confidence)

Deterministic for the mock providers; the same code path runs against real
Copernicus / Sentinel Hub imagery and a trained model once those are wired.
"""

from __future__ import annotations

import hashlib
import math
from datetime import datetime, timedelta

from app.core.config import get_settings
from app.core.logging import get_logger
from app.fixtures.scenarios import Scenario, get_scenario
from app.modules.detection.characterisation import characterise
from app.modules.detection.geometry import build_geometry
from app.modules.detection.models import MockSegmentationModel
from app.modules.detection.preprocess import preprocess_sar
from app.modules.detection.sar_segmenter import SarDarkSpotSegmenter
from app.modules.detection.validation import validate_with_eo
from app.providers.imagery.base import ImageryProvider
from app.providers.registry import registry
from app.schemas.common import Confidence, LonLat
from app.schemas.detection import DetectionRequest, SpillDetection
from app.schemas.imagery import SceneRef, SceneSearchRequest

log = get_logger(__name__)

# Drift speed used for spill-age estimation until Module 2 supplies a real field
# (monsoon-season Arabian Sea surface drift is ~0.6 m/s).
_NOMINAL_DRIFT_MS = 0.6
_KM_LAT = 110.574


class DetectionError(RuntimeError):
    pass


class DetectionService:
    def __init__(self) -> None:
        self._store: dict[str, SpillDetection] = {}
        # scenario_id -> detection_id, so re-running a scenario is idempotent-ish
        self._by_scenario: dict[str, str] = {}
        self._timelines: dict[str, object] = {}

    # -- public ----------------------------------------------------------------
    async def run(self, req: DetectionRequest) -> SpillDetection:
        scenario = self._resolve_scenario(req)
        imagery = registry.active("imagery")
        if not isinstance(imagery, ImageryProvider):  # pragma: no cover - config guard
            raise DetectionError("active imagery provider does not implement ImageryProvider")

        at = req.at or scenario.sar_pass_at
        seg_choice = req.segmentation_model or get_settings().segmentation_model
        # real segmentation needs a fetchable raster, so prefer a real scene
        # (mock scene ids carry a ':') when a non-mock model is active
        prefer_real = seg_choice != "mock"
        sar = await self._pick_scene(imagery, scenario, at, "sentinel-1-sar", prefer_real=prefer_real)
        if sar is None:
            raise DetectionError("no Sentinel-1 SAR scene available for the AOI / time window")

        tile = await imagery.fetch_scene(sar.id)
        prep = await preprocess_sar(tile)

        # the slick is observed down-drift of its source
        ex, nx = scenario.slick_offset_km
        slick_center = LonLat(
            lon=scenario.origin_hint.lon
            + ex / (111.320 * math.cos(math.radians(scenario.origin_hint.lat))),
            lat=scenario.origin_hint.lat + nx / _KM_LAT,
        )
        mock_model = MockSegmentationModel(center=slick_center, bearing_deg=88.0)
        seg = await mock_model.infer(tile, scenario.aoi)
        real_model = self._real_segmenter(seg_choice)
        if real_model is not None:
            try:
                real_seg = await real_model.infer(tile, scenario.aoi)
            except Exception as exc:  # noqa: BLE001 — any fetch/decode/model failure -> scenario model
                log.warning("%s segmentation failed (%s); using scenario model",
                            real_model.id, exc)
                seg.notes = f"{real_model.id} failed to run ({exc}); scenario mask shown"
            else:
                if real_seg.mask and self._plausible(real_seg.mask, scenario.aoi):
                    seg = real_seg
                    log.info("detection %s: %s", sar.id, real_seg.notes)
                elif real_seg.mask:
                    log.info("%s mask implausible (%s); using scenario model",
                             real_model.id, real_seg.notes)
                    seg.notes = (
                        f"{real_model.id} ran on the quicklook ({real_seg.notes}); "
                        "geometry outside the plausibility gate — calibrated scenario mask shown"
                    )
                    seg.model_id = f"{real_model.id} (gated → scenario)"
                else:
                    log.info("%s produced nothing (%s); using scenario model",
                             real_model.id, real_seg.notes)
                    seg.notes = f"{real_model.id} found no slick on the quicklook; scenario mask shown"
                    seg.model_id = f"{real_model.id} (empty → scenario)"

        eo = await validate_with_eo(imagery, scenario.aoi, at, wind_speed_ms=7.5)

        geometry = build_geometry(seg.mask)
        characterisation = characterise(
            geometry,
            contrast_db=seg.dark_spot_contrast_db,
            drift_speed_ms=_NOMINAL_DRIFT_MS,
            declared_cargo=scenario.incident.substance,
        )

        confidence = self._score(seg.pixel_confidence, seg.dark_spot_contrast_db, prep, eo)
        detection_id = self._make_id(scenario.id, sar.id)

        detection = SpillDetection(
            id=detection_id,
            incident_id=req.incident_id or scenario.incident.id,
            # timestamped by the SAR acquisition, not wall-clock — hindcast/forecast
            # windows are relative to when the scene was captured.
            detected_at=sar.acquired_at,
            sar_scene_id=sar.id,
            eo_scene_id=eo.eo_scene_id,
            eo_validated=eo.corroborates,
            geometry=geometry,
            characterisation=characterisation,
            detection_confidence=confidence,
            false_positive_checks=eo.checks,
            trend="unknown",  # requires the historical timeline (advanced feature 1)
            segmentation_model_id=seg.model_id,
            segmentation_notes=seg.notes,
        )
        self._store[detection_id] = detection
        self._by_scenario[scenario.id] = detection_id
        self._timelines.pop(detection_id, None)
        log.info(
            "detection %s: %.1f km² over %d fragment(s), conf %.2f",
            detection_id, geometry.area_km2, geometry.fragment_count, confidence.score,
        )
        return detection

    def get(self, detection_id: str) -> SpillDetection | None:
        return self._store.get(detection_id)

    async def timeline(self, detection_id: str):  # -> SpillTimeline
        from app.modules.detection.timeline import build_timeline

        detection = self._store.get(detection_id)
        if detection is None:
            raise DetectionError(f"no detection '{detection_id}'")
        cached = self._timelines.get(detection_id)
        if cached is None:
            cached = await build_timeline(detection)
            self._timelines[detection_id] = cached
            detection.trend = cached.trend  # backfill the single-pass placeholder
        return cached

    async def scenes(self, scenario_id: str | None) -> list[SceneRef]:
        scenario = get_scenario(scenario_id)
        imagery = registry.active("imagery")
        out: list[SceneRef] = []
        for sensor in ("sentinel-1-sar", "sentinel-2-eo"):
            out += await imagery.search(  # type: ignore[attr-defined]
                SceneSearchRequest(
                    bbox=scenario.aoi,
                    start=scenario.sar_pass_at - timedelta(days=10),
                    end=scenario.sar_pass_at + timedelta(days=10),
                    sensor=sensor,  # type: ignore[arg-type]
                    max_results=10,
                )
            )
        return sorted(out, key=lambda s: s.acquired_at)

    # -- internals ----------------------------------------------------------
    def _resolve_scenario(self, req: DetectionRequest) -> Scenario:
        if req.scenario:
            return get_scenario(req.scenario)
        # fall back to the scenario whose AOI contains the request bbox centre
        cx = (req.bbox.west + req.bbox.east) / 2
        cy = (req.bbox.south + req.bbox.north) / 2
        from app.fixtures.scenarios import SCENARIOS

        for sc in SCENARIOS.values():
            a = sc.aoi
            if a.west <= cx <= a.east and a.south <= cy <= a.north:
                return sc
            if req.incident_id and sc.incident.id == req.incident_id:
                return sc
        return get_scenario(None)

    @staticmethod
    async def _pick_scene(
        imagery: ImageryProvider, scenario: Scenario, at: datetime, sensor: str,
        *, prefer_real: bool = False,
    ) -> SceneRef | None:
        scenes = await imagery.search(
            SceneSearchRequest(
                bbox=scenario.aoi,
                start=at - timedelta(days=7),
                end=at + timedelta(days=7),
                sensor=sensor,  # type: ignore[arg-type]
                max_results=20,
            )
        )
        if not scenes:
            return None
        pool = [s for s in scenes if ":" not in s.id] if prefer_real else []
        return min(pool or scenes, key=lambda s: abs((s.acquired_at - at).total_seconds()))

    @staticmethod
    def _plausible(mask, aoi) -> bool:
        """A real slick is a small fraction of the scene, not a handful of specks
        and not half the ocean. Guards against a mis-calibrated CV / CNN result.

        A fresh, single-source spill is typically < ~1% of a 1° AOI and holds
        together as a few connected fragments; anything larger is the segmenter
        latching onto wind shadow / low-wind glass, so we fall back to the
        calibrated scenario mask rather than show a bogus geometry."""
        try:
            geom = build_geometry(mask)
        except Exception:  # noqa: BLE001
            return False
        aoi_km2 = (
            (aoi.east - aoi.west) * 111.32 * math.cos(math.radians((aoi.north + aoi.south) / 2))
            * (aoi.north - aoi.south) * _KM_LAT
        )
        upper = min(0.06 * aoi_km2, 220.0)
        return 0.4 <= geom.area_km2 <= upper and geom.fragment_count <= 5

    @staticmethod
    def _real_segmenter(choice: str | None = None):
        """The requested non-mock segmenter, or None. Import lazily — torch is heavy."""
        choice = choice or get_settings().segmentation_model
        if choice == "classical-sar":
            return SarDarkSpotSegmenter()
        if choice == "trained-unet":
            try:
                from app.modules.detection.trained_model import (
                    TrainedModelUnavailable,
                    TrainedUNetSegmentationModel,
                )

                return TrainedUNetSegmentationModel()
            except TrainedModelUnavailable as exc:
                log.warning("trained-unet unavailable (%s); using scenario model", exc)
        return None

    @staticmethod
    def _score(
        pixel_conf: float, contrast_db: float, prep, eo
    ) -> Confidence:
        # base on segmentation posterior, reward strong dark-spot contrast, add EO delta
        contrast_term = min(max((contrast_db - 1.0) / 6.0, 0.0), 0.18)
        score = 0.60 * pixel_conf + contrast_term + eo.confidence_delta + 0.06
        score = round(min(max(score, 0.05), 0.98), 3)
        parts = [
            f"segmentation posterior {pixel_conf:.2f}",
            f"SAR dark-spot contrast {contrast_db:.1f} dB below background",
            "speckle-filtered, terrain-corrected sigma0",
        ]
        parts.append(
            "EO corroborated" if eo.corroborates
            else ("EO partial (cloud)" if eo.eo_scene_id else "SAR-only (no clear optical)")
        )
        return Confidence(score=score, rationale="; ".join(parts))

    @staticmethod
    def _make_id(scenario_id: str, sar_scene_id: str) -> str:
        h = hashlib.sha1(f"{scenario_id}:{sar_scene_id}".encode()).hexdigest()[:8]
        return f"det-{scenario_id}-{h}"


service = DetectionService()
