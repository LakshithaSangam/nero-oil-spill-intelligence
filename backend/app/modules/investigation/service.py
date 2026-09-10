"""Module 3 entrypoint — the maritime investigation engine.

    detection + hindcast origin/window
      ─▶ reconstruct AIS around the origin during the window
      ─▶ per vessel: behavioural analysis
      ─▶ score + explainable factors
      ─▶ ranked Evidence Cards
"""

from __future__ import annotations

import math

from app.core.logging import get_logger
from app.modules.detection.service import service as detection_service
from app.modules.investigation.behaviour import analyse
from app.modules.investigation.evidence import build_card
from app.modules.investigation.reconstruction import reconstruct
from app.modules.investigation.scoring import build_factors, score
from app.modules.ocean_intelligence.service import service as ocean_service
from app.schemas.common import LonLat
from app.schemas.investigation import InvestigationRequest, SuspectRanking

log = get_logger(__name__)


class InvestigationError(RuntimeError):
    pass


class InvestigationService:
    def __init__(self) -> None:
        self._store: dict[str, SuspectRanking] = {}

    async def run(self, req: InvestigationRequest) -> SuspectRanking:
        detection = detection_service.get(req.detection_id)
        if detection is None:
            raise InvestigationError(f"no detection '{req.detection_id}' — run Module 1 first")
        hindcast = ocean_service.get_hindcast(req.detection_id)
        if hindcast is None:
            raise InvestigationError("run the hindcast (Module 2) before the investigation")

        origin = hindcast.origin.point
        window = hindcast.origin.release_window
        cx, cy = detection.geometry.centroid
        drift_bearing = _bearing(origin, LonLat(lon=cx, lat=cy))

        tracks = await reconstruct(
            origin, window,
            radius_km=req.search_radius_km, padding_h=req.window_padding_hours,
        )

        scored: list[tuple[float, object, object]] = []
        for tr in tracks:
            metrics = analyse(tr, origin, window, drift_bearing)
            factors = build_factors(metrics, tr.vessel)
            s = score(factors)
            scored.append((s, tr, (metrics, factors)))

        scored.sort(key=lambda x: x[0], reverse=True)
        cards = [
            build_card(tr, mf[0], mf[1], s, rank)  # type: ignore[index,arg-type]
            for rank, (s, tr, mf) in enumerate(scored, start=1)
        ]

        ranking = SuspectRanking(
            detection_id=detection.id,
            origin_window_used=f"{window.start.isoformat()} to {window.end.isoformat()}",
            candidates_considered=len(tracks),
            cards=cards,
        )
        self._store[detection.id] = ranking
        top = cards[0] if cards else None
        log.info(
            "investigation %s: %d vessels, lead %s @ %.2f",
            detection.id, len(cards),
            top.vessel.name if top else "-", top.suspicion_score if top else 0.0,
        )
        return ranking

    def get(self, detection_id: str) -> SuspectRanking | None:
        return self._store.get(detection_id)


def _bearing(a: LonLat, b: LonLat) -> float:
    return (math.degrees(math.atan2(b.lon - a.lon, b.lat - a.lat)) + 360) % 360


service = InvestigationService()
