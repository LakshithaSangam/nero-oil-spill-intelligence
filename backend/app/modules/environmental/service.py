"""Environmental Impact Intelligence — v1 (milestone M5).

A rollup over the forecast: for each coastal / ecological receptor, join the forecast
landfall ETA + likelihood with the receptor's sensitivity and distance, then derive an
Environmental Priority Score and cleanup-cost / liability ranges from the spill volume
and whether a shoreline is threatened. Milestone M7+ deepens this (reefs, mangroves,
MPAs, fisheries as distinct receptor classes with per-class response models).
"""

from __future__ import annotations

import math

from app.core.logging import get_logger
from app.fixtures.geo_features import Receptor, receptors_for
from app.modules.detection.service import service as detection_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.schemas.common import GeoJSONFeature, GeoJSONFeatureCollection
from app.schemas.detection import SpillDetection
from app.schemas.environmental import EnvironmentalImpact, ReceptorThreat
from app.schemas.ocean_intelligence import ForecastResult

log = get_logger(__name__)


class EnvironmentalError(RuntimeError):
    pass


class EnvironmentalService:
    def __init__(self) -> None:
        self._store: dict[str, EnvironmentalImpact] = {}

    async def assess(self, detection_id: str) -> EnvironmentalImpact:
        detection = detection_service.get(detection_id)
        if detection is None:
            raise EnvironmentalError(f"no detection '{detection_id}'. Run detection first.")
        forecast = ocean_service.get_forecast(detection_id)
        if forecast is None:
            raise EnvironmentalError("run the forecast (Module 2) before the assessment")

        scenario_id = self._scenario_id(detection)
        receptors = receptors_for(scenario_id)
        by_name = {c.name: c for c in forecast.affected_coasts}
        cx, cy = detection.geometry.centroid

        threats: list[ReceptorThreat] = []
        for r in receptors:
            coast = by_name.get(r.name)
            lik = coast.likelihood if coast else 0.0
            threats.append(ReceptorThreat(
                receptor_id=r.id,
                name=r.name,
                kind=r.kind,  # type: ignore[arg-type]
                geometry=_line_fc(r),
                eta=coast.eta if coast else None,
                distance_km=round(_min_dist_km((cx, cy), r.line), 1),
                likelihood=lik,
                sensitivity=r.sensitivity,
                exposure=round(lik * r.sensitivity, 3),
                response_note=_RESPONSE.get(r.kind, _RESPONSE["coastline"]),
            ))

        shoreline_threat = any(t.likelihood > 0.2 for t in threats)
        # sensitive habitats (reef / mangrove / seagrass) count double toward priority
        weighted = [
            t.exposure * (1.6 if t.kind in ("coral-reef", "mangrove", "seagrass") else 1.0)
            for t in threats
        ]
        max_ls = max(weighted, default=0.0)
        habitat_threat = any(
            t.likelihood > 0 and t.kind in ("coral-reef", "mangrove", "seagrass")
            for t in threats
        )
        area = _peak_area(forecast, detection)
        v_lo = detection.characterisation.estimated_volume_bbl_low
        v_hi = detection.characterisation.estimated_volume_bbl_high

        priority = (
            0.55 * min(max_ls, 1.0)
            + 0.22 * min(area / 120.0, 1.0)
            + 0.15 * min(v_hi / 5000.0, 1.0)
            + (0.12 if habitat_threat else 0.0)
        )
        cost_lo = v_lo * 2_000
        cost_hi = v_hi * 12_000 * (2.6 if habitat_threat else 2.2 if shoreline_threat else 1.0)

        summary: dict[str, int] = {}
        for t in threats:
            if t.likelihood > 0:
                summary[t.kind] = summary.get(t.kind, 0) + 1

        biodiv, affected_pct, life_note = _marine_life(threats, round(min(priority, 0.99), 3))

        impact = EnvironmentalImpact(
            detection_id=detection_id,
            priority_score=round(min(priority, 0.99), 3),
            affected_area_km2_estimate=round(area, 1),
            marine_biodiversity=biodiv,
            marine_life_affected_pct=affected_pct,
            marine_life_note=life_note,
            receptors=sorted(threats, key=lambda t: (-t.exposure, t.distance_km)),
            receptor_summary=summary,
            estimated_cleanup_cost_usd_low=round(cost_lo, -3),
            estimated_cleanup_cost_usd_high=round(cost_hi, -3),
            estimated_liability_usd_low=round(cost_lo * 1.5, -3),
            estimated_liability_usd_high=round(cost_hi * 4.0, -3),
            response_guidance=_guidance(threats, habitat_threat, shoreline_threat),
            notes=_notes(threats, shoreline_threat),
        )
        self._store[detection_id] = impact
        log.info(
            "environmental %s: priority %.2f, %d receptor(s), %s",
            detection_id, impact.priority_score, len(threats),
            "shoreline threatened" if shoreline_threat else "no shoreline threat",
        )
        return impact

    def get(self, detection_id: str) -> EnvironmentalImpact | None:
        return self._store.get(detection_id)

    @staticmethod
    def _scenario_id(detection: SpillDetection) -> str | None:
        from app.fixtures.scenarios import SCENARIOS

        for sc in SCENARIOS.values():
            if sc.incident.id == detection.incident_id:
                return sc.id
        return None


def _peak_area(forecast: ForecastResult, detection: SpillDetection) -> float:
    vals = list(forecast.expected_area_km2_by_hour.values())
    return max(vals) if vals else detection.geometry.area_km2


def _min_dist_km(pt: tuple[float, float], line: list[list[float]]) -> float:
    lat0 = pt[1]
    kx = 111.320 * math.cos(math.radians(lat0))
    ky = 110.574
    px, py = pt[0] * kx, pt[1] * ky
    best = math.inf
    for i in range(len(line) - 1):
        ax, ay = line[i][0] * kx, line[i][1] * ky
        bx, by = line[i + 1][0] * kx, line[i + 1][1] * ky
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy or 1e-9
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
        qx, qy = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(px - qx, py - qy))
    return best


def _line_fc(r: Receptor) -> GeoJSONFeatureCollection:
    return GeoJSONFeatureCollection(features=[GeoJSONFeature(
        geometry={"type": "LineString", "coordinates": r.line},  # type: ignore[arg-type]
        properties={"id": r.id, "kind": r.kind, "sensitivity": r.sensitivity},
    )])


_RESPONSE: dict[str, str] = {
    "coral-reef": "No effective on reef cleanup. Prioritise offshore recovery and "
                  "deflection booming; oiling here is effectively permanent.",
    "mangrove": "Do not enter to clean; passive sorbents at the fringe only. Long "
                "residence time, so plan monitoring across several seasons.",
    "seagrass": "Avoid prop-wash and trampling; light sorbent recovery on a falling tide.",
    "marine-protected-area": "Notify the park authority; stage assets outside the "
                             "boundary and pre-position boom at the entrances.",
    "fishery": "Coordinate a precautionary fishing closure and a landing-site inspection "
               "regime; prepare a compensation baseline.",
    "coastline": "Shoreline clean-up assessment teams on standby; boom the amenity and "
                 "settlement frontages first.",
    "turtle-nesting": "Night patrols and nest relocation ahead of the ETA.",
    "desalination-intake": "Alert the plant operator to switch to stored water and "
                           "close the intake before the ETA.",
}


def _guidance(threats: list[ReceptorThreat], habitat: bool, shoreline: bool) -> list[str]:
    reached = sorted(
        (t for t in threats if t.likelihood > 0 and t.eta is not None),
        key=lambda t: t.eta,  # type: ignore[arg-type]
    )
    out: list[str] = []
    if reached:
        lead = reached[0]
        out.append(
            f"Priority receptor: {lead.name}, ETA {lead.eta:%d %b %H:%MZ}, "
            f"{int(lead.likelihood * 100)}% of drift scenarios. {lead.response_note}"
        )
    if habitat:
        out.append("At least one habitat that cannot recover (reef or mangrove) is exposed. "
                   "shift the response objective from shoreline recovery to at-sea "
                   "containment and dispersant evaluation.")
    if not reached:
        out.append("No receptor contact projected within the horizon. Hold assets at "
                   "readiness and re-task SAR for the next pass.")
    out.append("Escalate to the National Oil Spill Disaster Contingency Plan tier "
               "matching the priority score; issue a NAVAREA warning for the drift corridor.")
    return out


def _notes(threats: list[ReceptorThreat], shoreline: bool) -> str:
    reached = [t for t in threats if t.likelihood > 0 and t.eta is not None]
    if not reached:
        return ("No shoreline contact projected within the forecast horizon; impact "
                "confined to open water. Priority driven by spill volume and area.")
    lead = min(reached, key=lambda t: t.eta)  # type: ignore[arg-type]
    return (f"Shoreline contact projected at {lead.name} "
            f"({int(lead.likelihood * 100)}% of ensemble); mobilise coastal response and "
            f"pre-position boom near the {lead.kind.replace('-', ' ')}.")


_RICH_KINDS = {"coral-reef", "mangrove", "seagrass", "marine-protected-area", "turtle-nesting"}


def _marine_life(threats: list[ReceptorThreat], priority: float) -> tuple[str, float, str]:
    """How rich is the marine life around the spill, and roughly how much of it is hit."""
    reached = [t for t in threats if t.likelihood > 0.15]
    rich_hits = sum(1 for t in reached if t.kind in _RICH_KINDS)
    max_exp = max((t.exposure for t in reached), default=0.0)
    near = min((t.distance_km for t in reached), default=float("inf"))

    if rich_hits >= 2 or (rich_hits >= 1 and near < 40):
        biodiv, weight = "Dense", 1.0
    elif reached:
        biodiv, weight = "Moderate", 0.55
    else:
        biodiv, weight = "Sparse", 0.2

    affected = 100.0 * (0.5 * max_exp + 0.3 * priority + 0.2 * weight)
    affected = round(max(2.0, min(95.0, affected)), 0)

    if biodiv == "Dense":
        note = (
            f"The spill area holds dense marine life, with {rich_hits} sensitive "
            f"habitat(s) (reef, mangrove, seagrass or protected water) in the drift "
            f"path. An estimated {affected:.0f}% of local marine life is affected; "
            f"begin cleanup immediately."
        )
    elif biodiv == "Moderate":
        note = (
            f"The spill area holds a moderate amount of marine life. An estimated "
            f"{affected:.0f}% of it is affected. Early containment still limits the damage."
        )
    else:
        note = (
            f"Marine life around the spill is sparse and no sensitive habitat is in the "
            f"drift path. An estimated {affected:.0f}% of local marine life is affected; "
            f"there is more time before serious ecological harm."
        )
    return biodiv, affected, note


service = EnvironmentalService()
