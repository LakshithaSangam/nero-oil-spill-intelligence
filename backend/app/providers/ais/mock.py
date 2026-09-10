"""Synthetic AIS reconstruction for the replay scenarios.

A small deterministic fleet around the AOI during the window: steady transit traffic,
a local fishing vessel, and one tanker whose track threads the source point —
slowing to a loiter, going AIS-dark across the release window, then resuming on an
altered course. That vessel is the ground truth the investigation engine should
recover; the data here is not a verdict.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from app.fixtures.scenarios import SCENARIOS, Scenario
from app.providers.base import BaseProvider
from app.schemas.ais import AISPosition, AISQuery, VesselStaticInfo, VesselTrack
from app.schemas.common import LonLat

_KM_LAT = 110.574


def _km_lon(lat: float) -> float:
    return 111.320 * math.cos(math.radians(lat))


def _at(base: LonLat, east_km: float, north_km: float) -> LonLat:
    return LonLat(
        lon=round(base.lon + east_km / _km_lon(base.lat), 5),
        lat=round(base.lat + north_km / _KM_LAT, 5),
    )


_FLEET: dict[str, VesselStaticInfo] = {
    "374192000": VesselStaticInfo(
        mmsi="374192000", imo="9531642", name="MV HORIZON", call_sign="3FKR7",
        vessel_type="tanker", length_m=183.0, beam_m=32.0, flag_state="Panama",
        owner="Meridian Tankers Ltd", operator_company="Blue Strait Ship Management",
        home_port="Panama City", cargo_declared="crude oil", prior_violations=2,
    ),
    "236887000": VesselStaticInfo(
        mmsi="236887000", imo="9412888", name="CAPE FALCON", call_sign="ZDLQ2",
        vessel_type="bulk-carrier", length_m=229.0, beam_m=38.0, flag_state="Gibraltar",
        owner="Falcon Dry Bulk SA", operator_company="Falcon Dry Bulk SA",
        home_port="Gibraltar", cargo_declared="iron ore", prior_violations=0,
    ),
    "477553000": VesselStaticInfo(
        mmsi="477553000", imo="9702241", name="EASTERN LOTUS", call_sign="VRPL8",
        vessel_type="container", length_m=294.0, beam_m=32.0, flag_state="Hong Kong",
        owner="Lotus Lines", operator_company="Lotus Lines", home_port="Hong Kong",
        cargo_declared="containers", prior_violations=0,
    ),
    "419001234": VesselStaticInfo(
        mmsi="419001234", imo=None, name="SAGAR RANI", call_sign="ATVX",
        vessel_type="fishing", length_m=24.0, beam_m=6.0, flag_state="India",
        owner="Veraval Fisheries Co-op", home_port="Veraval", prior_violations=0,
    ),
    # scenario suspects (Gulf of Kutch / Mumbai anchorage / Bombay High)
    "419772100": VesselStaticInfo(
        mmsi="419772100", imo="9284415", name="BD SAGARIKA", call_sign="AVKN",
        vessel_type="tanker", length_m=104.0, beam_m=18.0, flag_state="India",
        owner="Sagarika Bunkers Pvt Ltd", operator_company="Sagarika Bunkers Pvt Ltd",
        home_port="Kandla", cargo_declared="fuel oil (IFO 380)", prior_violations=1,
    ),
    "477281900": VesselStaticInfo(
        mmsi="477281900", imo="9645712", name="KOTA NIAGA", call_sign="VRME6",
        vessel_type="container", length_m=260.0, beam_m=32.0, flag_state="Hong Kong",
        owner="Pacific Eastern Lines", operator_company="Pacific Eastern Lines",
        home_port="Hong Kong", cargo_declared="containers", prior_violations=1,
    ),
    "419006200": VesselStaticInfo(
        mmsi="419006200", imo="9401233", name="OCEAN ORYX", call_sign="ATOX",
        vessel_type="tanker", length_m=68.0, beam_m=16.0, flag_state="India",
        owner="Coastal Offshore Services", operator_company="Coastal Offshore Services",
        home_port="Mumbai", cargo_declared="marine gas oil", prior_violations=0,
    ),
    # scenario suspects (North Sea / Gulf of Mexico / Sicily Strait)
    "636020341": VesselStaticInfo(
        mmsi="636020341", imo="9377019", name="STELLA MARIS", call_sign="D5QW3",
        vessel_type="tanker", length_m=183.0, beam_m=32.0, flag_state="Liberia",
        owner="Nordic Product Carriers AS", operator_company="Nordic Product Carriers AS",
        home_port="Bergen", cargo_declared="fuel oil (IFO 380)", prior_violations=1,
    ),
    "538008914": VesselStaticInfo(
        mmsi="538008914", imo="9411238", name="PECOS STAR", call_sign="V7XR9",
        vessel_type="tanker", length_m=250.0, beam_m=44.0, flag_state="Marshall Islands",
        owner="Lone Star Tankers LLC", operator_company="Gulfline Marine Management",
        home_port="Majuro", cargo_declared="crude oil", prior_violations=0,
    ),
    "356789000": VesselStaticInfo(
        mmsi="356789000", imo="9587332", name="ORION TRADER", call_sign="3EPQ8",
        vessel_type="bulk-carrier", length_m=229.0, beam_m=38.0, flag_state="Panama",
        owner="Aegean Dry Bulk Ltd", operator_company="Aegean Dry Bulk Ltd",
        home_port="Piraeus", cargo_declared="grain", prior_violations=1,
    ),
}

# (east_km, north_km, speed_kn) waypoints, relative to the scenario origin_hint
_Waypoint = tuple[float, float, float]


def _hash01(i: int, salt: int) -> float:
    """Deterministic pseudo-random in [-1, 1] — a bit of GPS wobble so the tracks
    don't look like glassy CAD curves."""
    x = math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
    return (x - math.floor(x)) * 2.0 - 1.0


def _catmull(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
    """One axis of a centripetal-ish Catmull-Rom spline through p1..p2."""
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )


def _sail(
    waypoints: list[_Waypoint],
    origin: LonLat,
    *,
    anchor_index: int,
    anchor_time: datetime,
    step_min: float = 10.0,
    drop: tuple[datetime, datetime] | None = None,
    wobble_km: float = 0.045,
) -> list[AISPosition]:
    """A smooth vessel track: a Catmull-Rom curve through the waypoints (rounded
    turns, gentle legs) sampled at ~constant time step, with light positional
    noise and course from the local tangent. ``waypoints[anchor_index]`` is
    visited at ``anchor_time``."""
    n_wp = len(waypoints)
    # cumulative hours to reach each waypoint (straight-line distance / speed)
    cum_h = [0.0]
    for a, b in zip(waypoints[:-1], waypoints[1:], strict=False):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        cum_h.append(cum_h[-1] + d / max(b[2] * 1.852, 0.1))
    t0 = anchor_time - timedelta(hours=cum_h[anchor_index])

    # first pass: smoothed (east, north, speed) samples per segment
    pts: list[tuple[float, float, float, datetime]] = []
    for seg in range(n_wp - 1):
        a = waypoints[seg]
        b = waypoints[seg + 1]
        p0 = waypoints[max(0, seg - 1)]
        p3 = waypoints[min(n_wp - 1, seg + 2)]
        h0, h1 = cum_h[seg], cum_h[seg + 1]
        leg_h = h1 - h0
        # sample the curve densely enough that the turns read as smooth, even on
        # slow / short legs where the time-step alone would give only 2 points
        n = max(14, int(leg_h * 60 / step_min))
        for i in range(n):
            f = i / n
            ex = _catmull(p0[0], a[0], b[0], p3[0], f)
            ey = _catmull(p0[1], a[1], b[1], p3[1], f)
            spd = a[2] + (b[2] - a[2]) * f
            tt = t0 + timedelta(hours=h0 + leg_h * f)
            pts.append((ex, ey, spd, tt))
    pts.append((waypoints[-1][0], waypoints[-1][1], waypoints[-1][2],
                t0 + timedelta(hours=cum_h[-1])))

    out: list[AISPosition] = []
    for i, (ex, ey, spd, tt) in enumerate(pts):
        if drop and drop[0] <= tt <= drop[1]:
            continue
        jx = _hash01(i, 1) * wobble_km
        jy = _hash01(i, 2) * wobble_km
        nxt = pts[min(i + 1, len(pts) - 1)]
        prv = pts[max(i - 1, 0)]
        brg = (math.degrees(math.atan2(nxt[0] - prv[0], nxt[1] - prv[1])) + 360) % 360
        out.append(AISPosition(
            time=tt,
            position=_at(origin, ex + jx, ey + jy),
            sog_kn=round(max(0.0, spd + _hash01(i, 3) * 0.25), 1),
            cog_deg=round(brg, 1),
            heading_deg=round(brg, 1),
            nav_status="under way using engine",
        ))
    return out


class MockAISProvider(BaseProvider):
    id = "mock"
    domain = "ais"
    display_name = "Mock AIS Reconstruction"
    is_mock = True

    def capabilities(self) -> dict[str, object]:
        return {"historical": True, "message_types": [1, 2, 3, 5, 18, 19],
                "typical_gap_minutes": 4, "vessel_metadata": True}

    async def tracks(self, q: AISQuery) -> list[VesselTrack]:
        sc = _match_scenario(q.bbox)
        rw0, rw1 = sc.release_window
        o = sc.origin_hint
        suspect = _FLEET.get(sc.suspect_mmsi, _FLEET["374192000"])
        gap = (rw0 + timedelta(minutes=20), rw0 + timedelta(hours=3, minutes=20))

        raw: list[VesselTrack] = [
            # SUSPECT — inbound at 12 kn, decelerate to a ~1.8 kn loiter at the source,
            # AIS-dark across the release window, resume at 11 kn on a kinked course.
            VesselTrack(
                vessel=suspect,
                positions=_sail(
                    [
                        (-38, 28, 12.0),
                        (-11, 8, 11.0),
                        (-2.5, 2, 3.2),
                        (0.0, 0.0, 1.8),     # loiter at the source
                        (1.5, -2.5, 1.8),
                        (5, -6, 3.2),
                        (22, -15, 11.0),
                        (40, -21, 12.0),
                    ],
                    o, anchor_index=3, anchor_time=rw0 + timedelta(hours=1),
                    drop=gap,
                ),
                has_gaps=True,
                gap_intervals=[gap],
            ),
            # CAPE FALCON — steady bulk-carrier transit passing ~16 km south
            VesselTrack(
                vessel=_FLEET["236887000"],
                positions=_sail(
                    [(-52, -14, 13.0), (2, -17, 13.0), (58, -21, 13.0)],
                    o, anchor_index=1, anchor_time=rw0 + timedelta(hours=1),
                    step_min=15,
                ),
            ),
            # EASTERN LOTUS — fast container transit crossing ~19 km north
            VesselTrack(
                vessel=_FLEET["477553000"],
                positions=_sail(
                    [(52, 21, 18.5), (-4, 24, 18.5), (-58, 27, 18.5)],
                    o, anchor_index=1, anchor_time=rw0 + timedelta(hours=2),
                    step_min=12,
                ),
            ),
            # SAGAR RANI — local trawler working a lawn-mower search pattern ~8 km
            # NE of the source at ~3 kn (curved passes, not a hard box)
            VesselTrack(
                vessel=_FLEET["419001234"],
                positions=_sail(
                    [
                        (3.0, 4.5, 3.4), (10.5, 5.6, 3.1), (11.2, 7.4, 2.6),
                        (3.4, 8.2, 3.2), (2.8, 10.2, 2.7), (10.8, 11.4, 3.1),
                        (11.0, 13.0, 2.6), (4.2, 13.4, 3.3), (7.5, 8.5, 3.0),
                    ],
                    o, anchor_index=3, anchor_time=rw0 + timedelta(hours=1),
                    step_min=12, wobble_km=0.07,
                ),
            ),
        ]

        out: list[VesselTrack] = []
        for tr in raw:
            pts = [p for p in tr.positions if q.start <= p.time <= q.end and _in_bbox(p, q)]
            if len(pts) < 2:
                continue
            if q.vessel_types and tr.vessel.vessel_type not in q.vessel_types:
                continue
            gaps = [g for g in tr.gap_intervals if g[0] <= q.end and g[1] >= q.start]
            out.append(VesselTrack(
                vessel=tr.vessel, positions=pts,
                has_gaps=bool(gaps), gap_intervals=gaps,
            ))
        return out

    async def vessel(self, mmsi: str) -> VesselStaticInfo | None:
        return _FLEET.get(mmsi)

    async def fleet(self) -> list[VesselStaticInfo]:
        return list(_FLEET.values())


def _match_scenario(bbox) -> Scenario:
    """Which replay scenario does this AIS query belong to? The investigation
    engine queries around a scenario's hindcast origin, so pick the scenario
    whose origin is closest to the query-box centre."""
    cx = (bbox.west + bbox.east) / 2
    cy = (bbox.south + bbox.north) / 2
    return min(
        SCENARIOS.values(),
        key=lambda s: (s.origin_hint.lon - cx) ** 2 + (s.origin_hint.lat - cy) ** 2,
    )


def _in_bbox(p: AISPosition, q: AISQuery) -> bool:
    b = q.bbox
    return b.west <= p.position.lon <= b.east and b.south <= p.position.lat <= b.north
