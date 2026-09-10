"""Pollution Risk Index service (advanced features 5 & 6).

Maintains a continuous risk score for every vessel the platform has seen, combining
prior history, recurring micro-leaks, live investigation exposure, cargo and routing.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.logging import get_logger
from app.fixtures.vessel_history import history_for
from app.modules.investigation.service import service as investigation_service
from app.modules.risk_index.index import score_vessel, tier_for
from app.modules.risk_index.microleak import assess
from app.providers.ais.base import AISProvider
from app.providers.registry import registry
from app.schemas.ais import VesselStaticInfo
from app.schemas.risk_index import (
    FleetRiskIndex,
    VesselRiskProfile,
    VesselRiskScore,
)

log = get_logger(__name__)


class RiskIndexService:
    async def index(self) -> FleetRiskIndex:
        vessels = await self._known_vessels()
        scores = [self._score(v) for v in vessels.values()]
        scores.sort(key=lambda s: s.risk_score, reverse=True)
        return FleetRiskIndex(generated_at=datetime.now(UTC), vessels=scores)

    async def profile(self, mmsi: str) -> VesselRiskProfile | None:
        vessels = await self._known_vessels()
        vessel = vessels.get(mmsi)
        if vessel is None:
            return None
        ml = assess(mmsi)
        suspicion = self._current_suspicion(mmsi)
        risk, factors, headline = score_vessel(vessel, ml, suspicion)
        micro, major, split_note = _leak_split(vessel, ml)
        notes = [
            f"{e.date:%Y-%m-%d} · {e.kind} · {e.note}"
            for e in history_for(mmsi)
            if e.kind != "micro-leak"
        ]
        return VesselRiskProfile(
            mmsi=mmsi, name=vessel.name, vessel_type=vessel.vessel_type,
            flag_state=vessel.flag_state, risk_score=risk, tier=tier_for(risk),
            headline=headline, recurring_pollution=ml.recurring,
            micro_leak_count=ml.count, prior_violations=vessel.prior_violations or 0,
            micro_leak_share=micro, major_leak_share=major, leak_split_note=split_note,
            updated_at=datetime.now(UTC),
            vessel=vessel, factors=factors, micro_leaks=ml.events, linked_event_notes=notes,
        )

    # -- internals -----------------------------------------------------
    def _score(self, vessel: VesselStaticInfo) -> VesselRiskScore:
        ml = assess(vessel.mmsi)
        suspicion = self._current_suspicion(vessel.mmsi)
        risk, _factors, headline = score_vessel(vessel, ml, suspicion)
        micro, major, split_note = _leak_split(vessel, ml)
        return VesselRiskScore(
            mmsi=vessel.mmsi, name=vessel.name, vessel_type=vessel.vessel_type,
            flag_state=vessel.flag_state, risk_score=risk, tier=tier_for(risk),
            headline=headline, recurring_pollution=ml.recurring,
            micro_leak_count=ml.count, prior_violations=vessel.prior_violations or 0,
            micro_leak_share=micro, major_leak_share=major, leak_split_note=split_note,
            updated_at=datetime.now(UTC),
        )

    async def _known_vessels(self) -> dict[str, VesselStaticInfo]:
        out: dict[str, VesselStaticInfo] = {}
        provider = registry.active("ais")
        if isinstance(provider, AISProvider):
            try:
                for v in await provider.fleet():
                    out[v.mmsi] = v
            except NotImplementedError:
                pass
        # also fold in any vessel seen in a stored investigation
        for ranking in investigation_service._store.values():  # noqa: SLF001
            for card in ranking.cards:
                out.setdefault(card.vessel.mmsi, card.vessel)
        return out

    @staticmethod
    def _current_suspicion(mmsi: str) -> float | None:
        best: float | None = None
        for ranking in investigation_service._store.values():  # noqa: SLF001
            for card in ranking.cards:
                if card.vessel.mmsi == mmsi:
                    best = card.suspicion_score if best is None else max(best, card.suspicion_score)
        return best


_OIL_CARGO = ("crude", "fuel", "bunker", "hfo", "oil", "diesel", "condensate")


def _leak_split(vessel: VesselStaticInfo, ml) -> tuple[float, float, str]:  # noqa: ANN001
    """Fold cargo + violations into the micro-leak assessment's base split."""
    micro = ml.micro_share
    cargo = (vessel.cargo_declared or "").lower()
    if any(k in cargo for k in _OIL_CARGO):
        micro -= 0.08
    if (vessel.prior_violations or 0) >= 2:
        micro -= 0.06
    micro = round(max(0.1, min(0.95, micro)), 2)
    major = round(1 - micro, 2)
    note = (
        f"About {int(micro * 100)}% of this vessel's pollution risk is small, repeated "
        f"operational leaks; about {int(major * 100)}% is the chance the next event is a "
        f"major spill"
        + (", and the pattern is escalating" if getattr(ml, "trend", "") == "escalating" else "")
        + "."
    )
    return micro, major, note


service = RiskIndexService()
