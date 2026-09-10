"""Per-vessel behavioural analysis — turns a raw AIS track into ``BehaviourMetrics``."""

from __future__ import annotations

import math
import statistics

from app.modules.investigation.types import BehaviourMetrics
from app.schemas.ais import AISPosition, VesselTrack
from app.schemas.common import LonLat, TimeRange

_KM_LAT = 110.574
LOITER_RADIUS_KM = 3.0
NEAR_ORIGIN_KM = 5.0


def _km(a: LonLat, b: LonLat) -> float:
    dx = (a.lon - b.lon) * 111.320 * math.cos(math.radians((a.lat + b.lat) / 2))
    dy = (a.lat - b.lat) * _KM_LAT
    return math.hypot(dx, dy)


def analyse(
    track: VesselTrack, origin: LonLat, window: TimeRange, drift_bearing_deg: float | None
) -> BehaviourMetrics:
    pts = sorted(track.positions, key=lambda p: p.time)
    dists = [_km(p.position, origin) for p in pts]
    ci = min(range(len(pts)), key=lambda i: dists[i])
    closest_km = dists[ci]
    closest_at = pts[ci].time
    closest_in_window = window.start <= closest_at <= window.end

    sogs = [p.sog_kn for p in pts if p.sog_kn is not None]
    near_sogs = [p.sog_kn for p, d in zip(pts, dists, strict=True)
                 if p.sog_kn is not None and d <= NEAR_ORIGIN_KM]
    far_sogs = [p.sog_kn for p, d in zip(pts, dists, strict=True)
                if p.sog_kn is not None and d > NEAR_ORIGIN_KM]
    transit_sog = statistics.median(far_sogs) if far_sogs else (
        statistics.median(sogs) if sogs else 0.0)
    min_near = min(near_sogs) if near_sogs else (min(sogs) if sogs else 0.0)

    loiter_minutes = _time_within(pts, dists, LOITER_RADIUS_KM)

    max_course_change = _max_course_change(pts)
    detour_ratio = _detour_ratio(pts)

    gap_minutes = sum((b - a).total_seconds() / 60.0 for a, b in track.gap_intervals)
    gap_overlaps_window = any(
        a <= window.end and b >= window.start for a, b in track.gap_intervals
    )

    drift_alignment = None
    if drift_bearing_deg is not None:
        course_here = _course_near(pts, dists)
        if course_here is not None:
            d = abs((course_here - drift_bearing_deg + 180) % 360 - 180)
            drift_alignment = round(d, 1)

    return BehaviourMetrics(
        mmsi=track.vessel.mmsi,
        n_positions=len(pts),
        duration_h=round((pts[-1].time - pts[0].time).total_seconds() / 3600.0, 2),
        closest_km=round(closest_km, 3),
        closest_at=closest_at,
        closest_in_window=closest_in_window,
        min_sog_kn=round(min_near, 1),
        mean_sog_kn=round(statistics.fmean(sogs), 1) if sogs else 0.0,
        transit_sog_kn=round(transit_sog, 1),
        speed_drop_kn=round(max(transit_sog - min_near, 0.0), 1),
        loiter_minutes=round(loiter_minutes, 0),
        max_course_change_deg=round(max_course_change, 0),
        detour_ratio=round(detour_ratio, 3),
        gap_minutes=round(gap_minutes, 0),
        gap_overlaps_window=gap_overlaps_window,
        drift_alignment_deg=drift_alignment,
    )


# --------------------------------------------------------------------------- #
def _time_within(pts: list[AISPosition], dists: list[float], radius_km: float) -> float:
    minutes = 0.0
    for (p0, d0), (p1, d1) in zip(zip(pts, dists, strict=True),
                                  zip(pts[1:], dists[1:], strict=True), strict=False):
        if d0 <= radius_km and d1 <= radius_km:
            minutes += (p1.time - p0.time).total_seconds() / 60.0
    return minutes


def _max_course_change(pts: list[AISPosition]) -> float:
    cogs = [p.cog_deg for p in pts if p.cog_deg is not None]
    worst = 0.0
    for a, b in zip(cogs, cogs[1:], strict=False):
        worst = max(worst, abs((b - a + 180) % 360 - 180))
    return worst


def _detour_ratio(pts: list[AISPosition]) -> float:
    if len(pts) < 2:
        return 1.0
    path = sum(_km(a.position, b.position) for a, b in zip(pts, pts[1:], strict=False))
    direct = _km(pts[0].position, pts[-1].position)
    return path / direct if direct > 0.2 else 1.0


def _course_near(pts: list[AISPosition], dists: list[float]) -> float | None:
    near = [p.cog_deg for p, d in zip(pts, dists, strict=True)
            if p.cog_deg is not None and d <= NEAR_ORIGIN_KM]
    if not near:
        return None
    # circular mean
    s = sum(math.sin(math.radians(c)) for c in near)
    c = sum(math.cos(math.radians(c)) for c in near)
    return (math.degrees(math.atan2(s, c)) + 360) % 360


def bearing(a: LonLat, b: LonLat) -> float:
    return (math.degrees(math.atan2(b.lon - a.lon, b.lat - a.lat)) + 360) % 360
