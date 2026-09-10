"""Spill Cause Classification — v1 (milestone M5).

A transparent rule-scorer over the assembled evidence (detection morphology, hindcast
origin, forecast, suspect ranking). Returns the most likely cause with its probability,
the evidence behind it, and the runner-up hypotheses. Milestone M7+ can replace the
rules with a learned classifier behind the same signature.
"""

from __future__ import annotations

from app.schemas.detection import SpillDetection
from app.schemas.investigation import SuspectRanking
from app.schemas.ocean_intelligence import HindcastResult
from app.schemas.report import CauseAssessment
from app.schemas.similarity import SimilaritySearchResult

_CAUSES = [
    "illegal-bilge-dumping",
    "maintenance-discharge",
    "cargo-leak",
    "tanker-collision",
    "pipeline-rupture",
    "offshore-drilling-incident",
    "unknown",
]


def classify(
    detection: SpillDetection,
    hindcast: HindcastResult,
    suspects: SuspectRanking,
    similar: SimilaritySearchResult | None = None,
) -> CauseAssessment:
    g = detection.geometry
    c = detection.characterisation
    elongation = (g.slick_length_km or 0) / max((g.area_km2 / (g.slick_length_km or 1)), 0.1)
    vol_hi = c.estimated_volume_bbl_high
    lead = suspects.cards[0] if suspects.cards else None
    lead_score = lead.suspicion_score if lead else 0.0
    lead_kinds = {f.kind for f in lead.factors} if lead else set()
    near_vessels = [c_ for c_ in suspects.cards if (c_.closest_approach_km or 99) < 4]

    s: dict[str, float] = dict.fromkeys(_CAUSES, 0.0)
    ev: list[str] = []

    linear = elongation > 4 and g.fragment_count >= 1
    operational = (
        lead_score > 0.6
        and {"ais_gap", "speed_anomaly"} & lead_kinds
        and lead is not None
        and (lead.vessel.cargo_declared or "").lower().find("crude") >= 0
    )

    if operational:
        s["illegal-bilge-dumping"] += 0.55
        s["maintenance-discharge"] += 0.32
        ev.append(f"{lead.vessel.name} loitered at the origin with AIS off during the release window")
        ev.append(f"declared cargo: {lead.vessel.cargo_declared}")
    if linear:
        s["illegal-bilge-dumping"] += 0.2
        s["maintenance-discharge"] += 0.12
        ev.append(
            f"elongated slick (~{g.slick_length_km:.0f} km) aligned with drift, "
            "consistent with a moving discharge"
        )
    if c.thickness_class in ("sheen", "rainbow", "metallic") and vol_hi < 6000:
        s["illegal-bilge-dumping"] += 0.12
        s["maintenance-discharge"] += 0.1
        ev.append(f"thin film ({c.thickness_class}), volume ~{vol_hi:,.0f} bbl upper bound")

    if vol_hi >= 6000 and g.fragment_count <= 2 and lead_score > 0.4 and "ais_gap" not in lead_kinds:
        s["cargo-leak"] += 0.45
        ev.append("large, near-continuous slick from a single vessel with no AIS gap")

    if len(near_vessels) >= 2:
        s["tanker-collision"] += 0.4
        ev.append(f"{len(near_vessels)} vessels within 4 km of the origin in the release window")

    if not near_vessels and lead_score < 0.35:
        s["pipeline-rupture"] += 0.3
        s["offshore-drilling-incident"] += 0.2
        ev.append("no vessel near the estimated origin, which points to a fixed source")

    # precedent: nearest historical spills reinforce the most similar cause
    if similar and similar.cases:
        w = 0.28 * similar.inferred_cause_confidence + 0.12
        if similar.inferred_cause in s:
            s[similar.inferred_cause] += w
            ev.append(
                f"nearest precedent: {similar.cases[0].name} "
                f"({int(similar.cases[0].similarity_score * 100)}% match), which was "
                f"{similar.inferred_cause.replace('-', ' ')}"
            )

    total = sum(s.values())
    if total < 0.15:
        return CauseAssessment(
            cause="unknown", probability=0.4,
            supporting_evidence=["evidence is inconclusive for a specific cause"],
            alternatives={},
            category_confidence=_category_confidence({}, detection),
        )

    ranked = sorted(s.items(), key=lambda kv: kv[1], reverse=True)
    norm = {k: round(v / total, 3) for k, v in ranked if v > 0}
    top_cause, top_p = ranked[0][0], norm[ranked[0][0]]
    return CauseAssessment(
        cause=top_cause,  # type: ignore[arg-type]
        probability=top_p,
        supporting_evidence=ev or ["derived from spill morphology and vessel behaviour"],
        alternatives={k: v for k, v in list(norm.items())[1:4]},
        category_confidence=_category_confidence(norm, detection),
    )


# internal cause -> broad "how did it happen" category the report speaks in
_CATEGORY_OF = {
    "illegal-bilge-dumping": "Intentional dumping",
    "maintenance-discharge": "Human error / operations",
    "cargo-leak": "Shipping accident",
    "tanker-collision": "Shipping accident",
    "pipeline-rupture": "Pipeline or storage failure",
    "offshore-drilling-incident": "Offshore drilling",
}
_ALL_CATEGORIES = [
    "Shipping accident",
    "Offshore drilling",
    "Pipeline or storage failure",
    "Human error / operations",
    "Natural disaster",
    "Intentional dumping",
]


def _category_confidence(norm: dict[str, float], detection: SpillDetection) -> dict[str, float]:
    """Roll the internal cause probabilities up into the six broad categories."""
    buckets = dict.fromkeys(_ALL_CATEGORIES, 0.0)
    for cause, p in norm.items():
        cat = _CATEGORY_OF.get(cause)
        if cat:
            buckets[cat] += p
    # a spill detected in rough weather gets a small "natural disaster" prior
    checks = " ".join(getattr(detection, "false_positive_checks", []) or []).lower()
    if "wind 1" in checks or ">10 m/s" in checks or "storm" in checks:
        buckets["Natural disaster"] += 0.08
    tot = sum(buckets.values())
    if tot <= 0:
        # nothing resolved — spread it, leaning to the common operational causes
        return {
            "Shipping accident": 0.25, "Human error / operations": 0.3,
            "Intentional dumping": 0.25, "Pipeline or storage failure": 0.08,
            "Offshore drilling": 0.06, "Natural disaster": 0.06,
        }
    return {k: round(v / tot, 3) for k, v in sorted(buckets.items(), key=lambda kv: -kv[1]) if v > 0}
