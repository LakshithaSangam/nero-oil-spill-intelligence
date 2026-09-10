"""Spill Similarity Search (advanced feature 9).

Compares a fresh detection against a library of past spills across morphology, oil
type, film thickness, fragmentation, region and season, then infers the likely cause
and vessel type from the closest precedents.
"""

from __future__ import annotations

import math

from app.core.logging import get_logger
from app.fixtures.historical_spills import CASE_LIBRARY, HistoricalSpill
from app.modules.detection.service import service as detection_service
from app.modules.ocean_intelligence.service import service as ocean_service
from app.schemas.detection import SpillDetection
from app.schemas.similarity import SimilarCase, SimilaritySearchResult

log = get_logger(__name__)

_THICKNESS_ORDER = ["sheen", "rainbow", "metallic", "discontinuous", "continuous"]
_OIL_KIN = {
    "crude": {"heavy-fuel-oil": 0.6, "light-refined": 0.5, "condensate": 0.5},
    "heavy-fuel-oil": {"crude": 0.6, "bilge-oily-water": 0.4},
    "bilge-oily-water": {"light-refined": 0.5, "heavy-fuel-oil": 0.4},
}
_WEIGHTS = {
    "area": 0.24, "oil": 0.18, "thickness": 0.16,
    "elongation": 0.18, "fragments": 0.08, "region": 0.08, "season": 0.08,
}


class SimilarityService:
    def __init__(self) -> None:
        self._store: dict[str, SimilaritySearchResult] = {}

    async def search(self, detection_id: str, *, top: int = 4) -> SimilaritySearchResult:
        det = detection_service.get(detection_id)
        if det is None:
            raise SimilarityError(f"no detection '{detection_id}' — run Module 1 first")

        q = _query_vector(det)
        origin = None
        hc = ocean_service.get_hindcast(detection_id)
        if hc is not None:
            origin = (hc.origin.point.lon, hc.origin.point.lat)

        scored: list[SimilarCase] = []
        for case in CASE_LIBRARY:
            score, matched = _score(q, case, origin)
            scored.append(SimilarCase(
                id=case.id, name=case.name, date=case.date, location=case.location,
                area_km2=case.area_km2, oil_type=case.oil_type, cause=case.cause,
                likely_vessel_type=case.likely_vessel_type, outcome=case.outcome,
                source=case.source, similarity_score=round(score, 3),
                matched_features=matched,
            ))
        scored.sort(key=lambda c: c.similarity_score, reverse=True)
        top_cases = scored[:top]

        cause, cause_conf = _infer(top_cases, key=lambda c: c.cause)
        vtype, _ = _infer(
            [c for c in top_cases if c.likely_vessel_type], key=lambda c: c.likely_vessel_type or ""
        )
        result = SimilaritySearchResult(
            detection_id=detection_id,
            query_summary=(
                f"{q['area']:.0f} km², {q['oil']} / {q['thickness']}, "
                f"elongation {q['elongation']:.1f}, {q['fragments']} fragment(s)"
            ),
            cases=top_cases,
            inferred_cause=cause,
            inferred_cause_confidence=round(cause_conf, 3),
            inferred_vessel_type=vtype or None,
            narrative=_narrative(top_cases, cause, cause_conf, vtype),
        )
        self._store[detection_id] = result
        log.info("similarity %s: nearest %s (%.2f), infers %s",
                 detection_id, top_cases[0].id, top_cases[0].similarity_score, cause)
        return result

    def get(self, detection_id: str) -> SimilaritySearchResult | None:
        return self._store.get(detection_id)


class SimilarityError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
def _query_vector(det: SpillDetection) -> dict:
    g, c = det.geometry, det.characterisation
    width = g.area_km2 / max(g.slick_length_km or 1.0, 0.1)
    return {
        "area": g.area_km2,
        "oil": c.oil_type,
        "thickness": c.thickness_class,
        "elongation": (g.slick_length_km or 0.0) / max(width, 0.1),
        "fragments": g.fragment_count,
        "location": (g.centroid[0], g.centroid[1]),
        "month": det.detected_at.month,
    }


def _score(q: dict, case: HistoricalSpill, origin: tuple[float, float] | None) -> tuple[float, list[str]]:
    matched: list[str] = []

    area_sim = math.exp(-((math.log((q["area"] + 1) / (case.area_km2 + 1))) ** 2) / 0.6)
    if area_sim > 0.7:
        matched.append("comparable area")

    if q["oil"] == case.oil_type:
        oil_sim = 1.0
        matched.append("same oil type")
    else:
        oil_sim = _OIL_KIN.get(q["oil"], {}).get(case.oil_type, 0.15)

    t_diff = abs(_THICKNESS_ORDER.index(q["thickness"]) - _THICKNESS_ORDER.index(case.thickness_class))
    thick_sim = 1.0 - t_diff / 4.0
    if t_diff == 0:
        matched.append("same film thickness")

    el_sim = math.exp(-((q["elongation"] - case.elongation) ** 2) / 18.0)
    if abs(q["elongation"] - case.elongation) < 2.5:
        matched.append("similar morphology (elongated)" if case.elongation > 4 else "similar morphology (compact)")

    frag_sim = 1.0 - min(abs(q["fragments"] - case.fragment_count), 4) / 4.0

    ref = origin or q["location"]
    dist_km = math.hypot(
        (ref[0] - case.location.lon) * 104.0, (ref[1] - case.location.lat) * 110.6
    )
    region_sim = math.exp(-(dist_km ** 2) / (2 * 600.0 ** 2))
    if dist_km < 300:
        matched.append("same region")

    month_ang = 2 * math.pi * (q["month"] - case.date.month) / 12.0
    season_sim = (math.cos(month_ang) + 1) / 2.0
    if abs(q["month"] - case.date.month) <= 1:
        matched.append("same season")

    score = (
        _WEIGHTS["area"] * area_sim
        + _WEIGHTS["oil"] * oil_sim
        + _WEIGHTS["thickness"] * thick_sim
        + _WEIGHTS["elongation"] * el_sim
        + _WEIGHTS["fragments"] * frag_sim
        + _WEIGHTS["region"] * region_sim
        + _WEIGHTS["season"] * season_sim
    )
    return score, matched


def _infer(cases: list[SimilarCase], *, key) -> tuple[str, float]:  # noqa: ANN001
    if not cases:
        return "unknown", 0.0
    tally: dict[str, float] = {}
    for c in cases:
        tally[key(c)] = tally.get(key(c), 0.0) + c.similarity_score
    total = sum(tally.values()) or 1.0
    best = max(tally.items(), key=lambda kv: kv[1])
    return best[0], best[1] / total


def _narrative(cases: list[SimilarCase], cause: str, conf: float, vtype: str | None) -> str:
    if not cases:
        return "No comparable historical spill found."
    lead = cases[0]
    v = f" and typically a {vtype}" if vtype else ""
    return (
        f"Closest precedent: {lead.name} ({int(lead.similarity_score * 100)}% match, "
        f"{lead.date:%Y}). Across the {len(cases)} nearest cases the pattern points to "
        f"**{cause.replace('-', ' ')}** ({int(conf * 100)}%){v}. "
        f"Outcome there: {lead.outcome}"
    )


service = SimilarityService()
