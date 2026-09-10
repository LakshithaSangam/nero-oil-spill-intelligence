"""Composes the Vessel & Company Intelligence dossier from existing services."""

from __future__ import annotations

from collections import Counter

from app.core.logging import get_logger
from app.fixtures.vessel_history import history_for
from app.modules.investigation.service import service as investigation_service
from app.modules.risk_index.service import service as risk_service
from app.schemas.vessel_dossier import InvestigationAppearance, VesselDossier

log = get_logger(__name__)


class DossierError(RuntimeError):
    pass


async def build(mmsi: str) -> VesselDossier:
    risk = await risk_service.profile(mmsi)
    if risk is None:
        raise DossierError(f"unknown vessel '{mmsi}'")
    vessel = risk.vessel

    appearances: list[InvestigationAppearance] = []
    factor_kinds: Counter[str] = Counter()
    for det_id, ranking in investigation_service._store.items():  # noqa: SLF001
        for card in ranking.cards:
            if card.vessel.mmsi != mmsi:
                continue
            inc = [f for f in card.factors if f.polarity == "incriminating"]
            factor_kinds.update(f.kind for f in inc)
            appearances.append(InvestigationAppearance(
                detection_id=det_id, rank=card.rank,
                suspicion_score=card.suspicion_score,
                closest_approach_km=card.closest_approach_km,
                top_factors=[f.summary for f in inc[:3]],
                narrative=card.narrative,
            ))

    history_notes = [
        f"{e.date:%Y-%m-%d} · {e.kind} · {e.note}" for e in history_for(mmsi)
    ]

    behaviour_summary = _behaviour_summary(factor_kinds, risk)
    assessment = _assessment(vessel, risk, appearances)

    log.info("dossier %s: %d appearance(s), risk %s", mmsi, len(appearances), risk.tier)
    return VesselDossier(
        vessel=vessel, risk=risk, appearances=appearances,
        history_notes=history_notes, behaviour_summary=behaviour_summary,
        assessment=assessment,
    )


def _behaviour_summary(kinds: Counter[str], risk) -> str:  # noqa: ANN001
    if not kinds and not risk.recurring_pollution:
        return "No adverse AIS behaviour on record."
    parts: list[str] = []
    label = {
        "ais_gap": "AIS gaps", "speed_anomaly": "speed anomalies / loitering",
        "course_deviation": "course deviations", "route_deviation": "route detours",
        "drift_alignment": "drift-aligned tracks", "proximity": "close origin passes",
        "prior_history": "prior-history hits",
    }
    for kind, n in kinds.most_common(4):
        parts.append(f"{label.get(kind, kind)} (×{n})")
    if risk.recurring_pollution:
        parts.append(f"a recurring micro-leak pattern ({risk.micro_leak_count} events)")
    return "Observed: " + ", ".join(parts) + "."


def _assessment(vessel, risk, appearances) -> str:  # noqa: ANN001
    name = vessel.name or f"MMSI {vessel.mmsi}"
    if risk.tier in ("critical", "high") or any(a.suspicion_score >= 0.7 for a in appearances):
        return (
            f"{name} is a **priority-of-interest** vessel: {risk.headline} "
            f"Recommend a preservation notice on AIS/ECDIS/oil-record-book, a PSC "
            f"inspection at the next port, and a standing watch on subsequent transits."
        )
    if risk.tier == "elevated":
        return f"{name} warrants monitoring. {risk.headline}"
    return f"{name} shows a routine profile; no action beyond baseline monitoring."
