"""Deterministic synthetic wind / current field.

The map's ambient wind and current layers pull real data from the keyless
Open-Meteo APIs. Those have a daily request cap on the free tier, and when it is
hit (or the network is down) the real fetch returns nothing, which used to leave
the layer as a dead, uniform, zero-vector wash. This builds a smooth,
spatially-varying stand-in from the coordinates alone so the layer always shows
plausible, direction-changing flow. It is a pattern, not a forecast, and the
response's ``source`` says so.
"""

from __future__ import annotations

import math
from datetime import datetime


def synth_flow(lon: float, lat: float, valid_at: datetime, *, kind: str) -> tuple[float, float]:
    """(speed_ms, going_to_deg) for one point.

    ``kind`` is ``"wind"`` (a few m/s to ~12) or ``"current"`` (a few cm/s to
    ~0.6 m/s). Direction and speed both vary with position, with a slow drift
    over the day, so panning the map reveals different flow rather than a
    constant field.
    """
    # slow diurnal phase so the field is not frozen across a session
    phase = (valid_at.hour + valid_at.minute / 60.0) * (math.pi / 12.0)

    lat_r = math.radians(lat)
    # streamfunction-style superposition -> a rotational, non-uniform field
    a = math.sin(lat_r * 2.6 + lon * 0.075 + phase)
    b = math.cos(lon * 0.052 - lat_r * 1.9 - phase * 0.6)
    c = math.sin(lon * 0.11 + lat_r * 0.7 + phase * 1.3)

    u = a + 0.6 * b            # eastward component
    v = -b + 0.5 * c           # northward component
    # broad easterly / trade-wind bias through the tropics
    if abs(lat) < 25.0:
        u -= 0.8 * math.cos(lat_r * 3.0)

    going_to = math.degrees(math.atan2(u, v)) % 360.0

    swing = 0.5 + 0.5 * math.sin(lat_r * 3.3 + lon * 0.09 - phase)
    # wind ~2 to 11 m/s; current ~0.04 to 0.54 m/s
    speed = 2.0 + 9.0 * swing if kind == "wind" else 0.04 + 0.5 * swing

    return round(speed, 3), round(going_to, 1)
