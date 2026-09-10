"""Internal behaviour metrics for the investigation pipeline.

The public output is ``app.schemas.investigation.SuspectRanking`` (Explainable
Evidence Cards). These raw per-vessel metrics feed the scorer.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class BehaviourMetrics:
    mmsi: str
    n_positions: int
    duration_h: float

    closest_km: float
    closest_at: datetime | None
    closest_in_window: bool

    min_sog_kn: float
    mean_sog_kn: float
    transit_sog_kn: float          # median speed away from the origin
    speed_drop_kn: float           # transit - min, near the origin
    loiter_minutes: float          # time spent within LOITER_RADIUS_KM of the origin

    max_course_change_deg: float   # sharpest heading change along the track
    detour_ratio: float            # path length / direct distance

    gap_minutes: float
    gap_overlaps_window: bool

    drift_alignment_deg: float | None   # |course near origin - slick drift bearing|
