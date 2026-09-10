"""Pollution Risk Index scoring (advanced feature 6).

A continuous per-vessel risk score from prior spills & violations, recurring
micro-leaks, current investigation exposure, cargo, and high-risk routing. The score
is a logistic squash of signed, weighted factors, so it is always explainable.
"""

from __future__ import annotations

import math

from app.fixtures.vessel_history import HIGH_RISK_ROUTE
from app.modules.risk_index.microleak import MicroLeakAssessment
from app.schemas.ais import VesselStaticInfo
from app.schemas.risk_index import RiskFactor, RiskTier

_OIL_CARGO = ("crude", "fuel", "bunker", "hfo", "oil", "condensate", "diesel")


def score_vessel(
    vessel: VesselStaticInfo,
    ml: MicroLeakAssessment,
    current_suspicion: float | None,
) -> tuple[float, list[RiskFactor], str]:
    f: list[RiskFactor] = []

    pv = vessel.prior_violations or 0
    if pv:
        f.append(RiskFactor(
            key="prior_violations", label="Prior MARPOL violations", direction="raises",
            weight=min(0.3 + 0.2 * pv, 0.8),
            detail=f"{pv} pollution-related citation(s) on record.", value=pv,
        ))

    if ml.recurring:
        f.append(RiskFactor(
            key="recurring_microleaks", label="Recurring small leaks", direction="raises",
            weight=0.9 if ml.trend == "escalating" else 0.75,
            detail=ml.headline, value=ml.count,
        ))
    elif ml.count:
        f.append(RiskFactor(
            key="microleak_history", label="Micro-leak history", direction="raises",
            weight=min(0.15 * ml.count, 0.45),
            detail=f"{ml.count} small leak(s) on record, no repeating pattern yet.",
            value=ml.count,
        ))

    if current_suspicion is not None and current_suspicion >= 0.5:
        f.append(RiskFactor(
            key="active_investigation", label="Active investigation exposure",
            direction="raises", weight=min(current_suspicion, 0.95),
            detail=f"Named as a suspect at {current_suspicion * 100:.0f}% in a live case.",
            value=round(current_suspicion, 2),
        ))

    cargo = (vessel.cargo_declared or "").lower()
    if any(k in cargo for k in _OIL_CARGO):
        f.append(RiskFactor(
            key="cargo", label="Carries oil cargo", direction="raises", weight=0.45,
            detail=f"Carries {vessel.cargo_declared}, a pollutant that lingers.",
        ))
    elif cargo and vessel.vessel_type in ("bulk-carrier", "container", "cargo"):
        f.append(RiskFactor(
            key="cargo", label="Non-oil cargo", direction="lowers", weight=0.25,
            detail=f"Carries {vessel.cargo_declared}; lower spill consequence.",
        ))
    if vessel.vessel_type == "fishing":
        f.append(RiskFactor(
            key="vessel_type", label="Small fishing vessel", direction="lowers", weight=0.3,
            detail="Limited bunker volume; discharge would be minor.",
        ))

    if HIGH_RISK_ROUTE.get(vessel.mmsi):
        f.append(RiskFactor(
            key="route", label="Busy discharge corridor", direction="raises", weight=0.35,
            detail="Regular route runs through a lane with elevated discharge history.",
        ))

    if not pv and ml.count == 0 and (current_suspicion or 0) < 0.4:
        f.append(RiskFactor(
            key="clean_record", label="Clean record", direction="lowers", weight=0.4,
            detail="No prior violations, small leaks or active exposure.",
        ))

    x = sum((1.0 if fa.direction == "raises" else -1.0) * fa.weight for fa in f)
    risk = round(1.0 / (1.0 + math.exp(-1.25 * (x - 0.35))), 3)
    headline = _headline(risk, ml, f)
    return risk, f, headline


def tier_for(risk: float) -> RiskTier:
    if risk >= 0.78:
        return "critical"
    if risk >= 0.58:
        return "high"
    if risk >= 0.38:
        return "elevated"
    return "low"


def _headline(risk: float, ml: MicroLeakAssessment, factors: list[RiskFactor]) -> str:
    if ml.recurring:
        return ml.headline
    raisers = [fa for fa in factors if fa.direction == "raises"]
    if risk >= 0.58 and raisers:
        top = max(raisers, key=lambda fa: fa.weight)
        return f"{tier_for(risk).title()} pollution risk, driven mainly by {top.label.lower()}."
    if risk < 0.38:
        return "Low pollution risk; routine operating profile."
    return "Elevated pollution risk; monitor."
