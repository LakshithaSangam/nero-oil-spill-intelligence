"""Real surface-current field for the map's ambient current layer.

Same pattern as ``wind_field.py``: independent of the selected oceanography
provider (the map's ambient layer should look real regardless of which provider
an investigation is actually running its drift science against), always pulls
keyless Open-Meteo Marine surface currents for a coarse lattice over the
requested map bounds, so every region renders its own real flow instead of a
decorative, made-up animation with no relation to actual conditions.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from app.core.logging import get_logger
from app.providers.oceanography._current import open_meteo_current_10m
from app.schemas.common import BBox, LonLat
from app.schemas.weather import CurrentFieldResponse, CurrentVector
from app.services._synthetic_flow import synth_flow

log = get_logger(__name__)

_CACHE: dict[str, tuple[float, CurrentFieldResponse]] = {}
_TTL_S = 600.0
_MAX_SPAN_DEG = 60.0


def _lattice(bbox: BBox, cols: int, rows: int) -> list[LonLat]:
    w, s, e, n = bbox.west, bbox.south, bbox.east, bbox.north
    out: list[LonLat] = []
    for r in range(rows):
        fy = (r + 0.5) / rows
        lat = s + (n - s) * fy
        for c in range(cols):
            fx = (c + 0.5) / cols
            lon = w + (e - w) * fx
            out.append(LonLat(lon=round(lon, 4), lat=round(lat, 4)))
    return out


async def get_current_field(
    bbox: BBox, at: datetime | None = None, *, cols: int = 7, rows: int = 6
) -> CurrentFieldResponse:
    cols = max(2, min(12, cols))
    rows = max(2, min(12, rows))
    valid_at = (at or datetime.now(UTC)).astimezone(UTC)

    if bbox.east - bbox.west > _MAX_SPAN_DEG or bbox.north - bbox.south > _MAX_SPAN_DEG:
        cx = (bbox.west + bbox.east) / 2
        cy = (bbox.south + bbox.north) / 2
        half = _MAX_SPAN_DEG / 2
        bbox = BBox(
            west=max(-179.9, cx - half), south=max(-89.9, cy - half),
            east=min(179.9, cx + half), north=min(89.9, cy + half),
        )

    key = (
        f"{bbox.west:.2f},{bbox.south:.2f},{bbox.east:.2f},{bbox.north:.2f}"
        f"|{valid_at:%Y%m%d%H}|{cols}x{rows}"
    )
    hit = _CACHE.get(key)
    if hit and time.monotonic() - hit[0] < _TTL_S:
        return hit[1]

    points = _lattice(bbox, cols, rows)
    field = await open_meteo_current_10m(points, valid_at - timedelta(hours=1), valid_at + timedelta(hours=1))
    live = bool(field.times)

    vectors: list[CurrentVector] = []
    for i, p in enumerate(points):
        if live:
            speed, going_to = field.sample(valid_at, i)
        else:
            # free-tier quota hit or offline: a smooth synthetic pattern so the
            # ambient layer still shows varied, direction-changing flow
            speed, going_to = synth_flow(p.lon, p.lat, valid_at, kind="current")
        vectors.append(CurrentVector(
            lon=p.lon, lat=p.lat,
            speed_ms=round(max(0.0, speed), 3),
            direction_deg=round(going_to % 360.0, 1),
        ))

    resp = CurrentFieldResponse(
        bbox=bbox,
        valid_at=valid_at,
        source="open-meteo marine surface currents" if live else "synthesised pattern (live current data unavailable)",
        cols=cols,
        rows=rows,
        points=vectors,
    )
    _CACHE[key] = (time.monotonic(), resp)
    return resp
