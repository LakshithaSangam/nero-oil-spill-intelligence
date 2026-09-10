"""Micro-Leak Early Warning (advanced feature 5).

Flags a vessel with a pattern of small, recurring spills — the precursor to a major
event — before it escalates. Works off the platform's own prior small detections
(here, ``fixtures.vessel_history``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from app.fixtures.vessel_history import history_for
from app.schemas.common import LonLat
from app.schemas.risk_index import MicroLeakEvent

Trend = Literal["escalating", "steady", "sporadic", "none"]


@dataclass
class MicroLeakAssessment:
    events: list[MicroLeakEvent] = field(default_factory=list)
    recurring: bool = False
    count: int = 0
    span_days: float = 0.0
    trend: Trend = "none"
    headline: str = ""
    # split of the pollution signature: small repeated operational leaks vs the
    # chance the next event is a large / structural spill (0..1, sum to 1)
    micro_share: float = 0.5
    major_share: float = 0.5


def assess(mmsi: str, *, now: datetime | None = None) -> MicroLeakAssessment:
    now = now or datetime.now(UTC)
    leaks = sorted(
        (e for e in history_for(mmsi) if e.kind == "micro-leak"),
        key=lambda e: e.date,
    )
    if not leaks:
        return MicroLeakAssessment(
            headline="No history of small recurring leaks on record.",
            micro_share=0.5, major_share=0.5,
        )

    events = [
        MicroLeakEvent(
            date=e.date,
            location=e.location if isinstance(e.location, LonLat) else LonLat(**e.location),
            area_km2=e.area_km2,
            confidence=e.confidence,
            note=e.note,
        )
        for e in leaks
    ]
    span_days = (leaks[-1].date - leaks[0].date).total_seconds() / 86400.0
    recent = [e for e in leaks if (now - e.date).days <= 120]
    recurring = len(recent) >= 3 and span_days <= 120

    areas = [e.area_km2 or 0.0 for e in leaks]
    if len(areas) >= 3 and areas[-1] > areas[0] * 1.4 and areas[-1] >= areas[-2]:
        trend: Trend = "escalating"
    elif len(recent) >= 3:
        trend = "steady"
    elif len(leaks) >= 2:
        trend = "sporadic"
    else:
        trend = "none"

    if recurring:
        weeks = max(1, round(span_days / 7))
        headline = (
            f"{len(recent)} small leaks in {weeks} weeks along the same route"
            + (", each one bigger than the last" if trend == "escalating" else "")
            + ". Likely to escalate without intervention."
        )
    else:
        headline = f"{len(leaks)} small leak(s) on record, not yet a repeating pattern."

    # micro vs major split: most of the signature is small operational leaks,
    # shifted toward a major spill when the trend is escalating or the leaks
    # themselves are getting large.
    micro = 0.82
    if trend == "escalating":
        micro -= 0.30
    elif trend == "steady" and len(recent) >= 4:
        micro -= 0.12
    if areas and max(areas) >= 0.4:
        micro -= 0.10
    micro = round(max(0.15, min(0.95, micro)), 2)

    return MicroLeakAssessment(
        events=events, recurring=recurring, count=len(leaks),
        span_days=round(span_days, 1), trend=trend, headline=headline,
        micro_share=micro, major_share=round(1 - micro, 2),
    )
