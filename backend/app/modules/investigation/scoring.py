"""Suspicion scoring — behaviour metrics + vessel profile → explainable factors + score.

Every factor carries a kind, a polarity (incriminating / mitigating), a 0–1 weight
and a plain-language summary. The score is a logistic squash of the signed,
importance-weighted factor sum, so it is always defensible by pointing at its inputs.
"""

from __future__ import annotations

import math

from app.modules.investigation.types import BehaviourMetrics
from app.schemas.ais import VesselStaticInfo
from app.schemas.investigation import EvidenceFactor

# how much each kind of evidence moves the needle
_IMPORTANCE: dict[str, float] = {
    "proximity": 1.15,
    "ais_gap": 1.25,
    "time_correlation": 0.95,
    "speed_anomaly": 0.9,
    "course_deviation": 0.6,
    "route_deviation": 0.55,
    "drift_alignment": 0.7,
    "cargo_match": 0.7,
    "prior_history": 0.5,
    "behavioural_anomaly": 0.8,
}

_OIL_CARGO = ("crude", "fuel", "bunker", "hfo", "oil", "diesel", "condensate")


def build_factors(m: BehaviourMetrics, vessel: VesselStaticInfo) -> list[EvidenceFactor]:
    f: list[EvidenceFactor] = []

    # -- proximity -------------------------------------------------------
    if m.closest_km <= 3.0:
        w = _clamp((3.0 - m.closest_km) / 3.0 + 0.15, 0.15, 1.0)
        f.append(EvidenceFactor(
            kind="proximity", polarity="incriminating", weight=round(w, 2),
            summary=f"Passed within {m.closest_km:.1f} km of the estimated origin",
            value=m.closest_km,
        ))
    elif m.closest_km >= 12.0:
        f.append(EvidenceFactor(
            kind="proximity", polarity="mitigating", weight=0.5,
            summary=f"Nearest approach {m.closest_km:.0f} km, outside the search area",
            value=m.closest_km,
        ))

    # -- AIS gap ------------------------------------------------------
    if m.gap_overlaps_window and m.gap_minutes > 15:
        f.append(EvidenceFactor(
            kind="ais_gap", polarity="incriminating",
            weight=_clamp(0.55 + m.gap_minutes / 400.0, 0.55, 1.0),
            summary=f"AIS silent for {m.gap_minutes:.0f} min, spanning the release window",
            detail="Transmission resumed after the window with the vessel repositioned.",
            value=m.gap_minutes,
        ))

    # -- time correlation ------------------------------------------
    if m.closest_in_window:
        f.append(EvidenceFactor(
            kind="time_correlation", polarity="incriminating", weight=0.8,
            summary="Closest approach falls inside the estimated release window",
            value=m.closest_at.isoformat() if m.closest_at else None,
        ))

    # -- speed anomaly ------------------------------------------------
    if m.speed_drop_kn >= 4.0 and m.min_sog_kn <= 5.0:
        f.append(EvidenceFactor(
            kind="speed_anomaly", polarity="incriminating",
            weight=_clamp(0.4 + m.speed_drop_kn / 20.0, 0.4, 1.0),
            summary=(f"Slowed from ~{m.transit_sog_kn:.0f} kn to {m.min_sog_kn:.1f} kn near "
                     f"the origin ({m.loiter_minutes:.0f} min loiter)"),
            value=m.speed_drop_kn,
        ))

    # -- course / route deviation --------------------------------
    if m.max_course_change_deg >= 20:
        f.append(EvidenceFactor(
            kind="course_deviation", polarity="incriminating",
            weight=_clamp(m.max_course_change_deg / 90.0, 0.2, 0.9),
            summary=f"Altered course by {m.max_course_change_deg:.0f}° at the origin",
            value=m.max_course_change_deg,
        ))
    if m.detour_ratio >= 1.15:
        f.append(EvidenceFactor(
            kind="route_deviation", polarity="incriminating",
            weight=_clamp((m.detour_ratio - 1.0) * 1.5, 0.2, 0.9),
            summary=f"Track is {m.detour_ratio:.2f}x the direct route, a deliberate detour",
            value=m.detour_ratio,
        ))

    # -- drift alignment -------------------------------------------
    if m.drift_alignment_deg is not None and m.drift_alignment_deg <= 30:
        f.append(EvidenceFactor(
            kind="drift_alignment", polarity="incriminating",
            weight=_clamp((30 - m.drift_alignment_deg) / 30.0, 0.2, 0.9),
            summary=f"Course at the origin aligns with the slick drift (Δ {m.drift_alignment_deg:.0f}°)",
            value=m.drift_alignment_deg,
        ))

    # -- cargo ------------------------------------------------------
    cargo = (vessel.cargo_declared or "").lower()
    if any(k in cargo for k in _OIL_CARGO):
        f.append(EvidenceFactor(
            kind="cargo_match", polarity="incriminating", weight=0.7,
            summary=f"Declared cargo: {vessel.cargo_declared}",
        ))
    elif cargo:
        f.append(EvidenceFactor(
            kind="cargo_match", polarity="mitigating", weight=0.45,
            summary=f"Declared cargo ({vessel.cargo_declared}) is not an oil product",
        ))

    # -- prior history --------------------------------------------
    if (vessel.prior_violations or 0) > 0:
        f.append(EvidenceFactor(
            kind="prior_history", polarity="incriminating",
            weight=_clamp(0.3 + 0.2 * vessel.prior_violations, 0.3, 0.9),
            summary=f"{vessel.prior_violations} prior pollution violation(s) on record",
            value=vessel.prior_violations,
        ))

    # -- vessel-type context (mitigating for routine loiterers) --
    if vessel.vessel_type == "fishing":
        f.append(EvidenceFactor(
            kind="behavioural_anomaly", polarity="mitigating", weight=0.55,
            summary="Fishing vessel; slow, meandering tracks near here are routine",
        ))
    elif vessel.vessel_type in ("tug", "offshore", "pleasure") and m.closest_km > 4:
        f.append(EvidenceFactor(
            kind="behavioural_anomaly", polarity="mitigating", weight=0.3,
            summary=f"{vessel.vessel_type.title()} on a routine track",
        ))

    return f


def score(factors: list[EvidenceFactor]) -> float:
    x = 0.0
    for fa in factors:
        imp = _IMPORTANCE.get(fa.kind, 0.5)
        sign = 1.0 if fa.polarity == "incriminating" else -1.0 if fa.polarity == "mitigating" else 0.0
        x += sign * imp * fa.weight
    return round(1.0 / (1.0 + math.exp(-1.15 * (x - 0.85))), 3)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))
