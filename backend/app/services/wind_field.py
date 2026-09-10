"""Real surface-wind field for the map's wind layer.

Independent of the selected oceanography provider: always pulls keyless Open-Meteo
10 m wind (ERA5 archive for old windows, forecast API otherwise) for a coarse
lattice over the requested map bounds, so every region renders its own wind
direction and speed. Results are cached briefly, keyed by a rounded bbox + hour.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.oceanography._wind import open_meteo_wind_10m
from app.schemas.common import BBox, LonLat
from app.schemas.weather import WindFieldResponse, WindVector
from app.services._synthetic_flow import synth_flow

log = get_logger(__name__)

_CACHE: dict[str, tuple[float, WindFieldResponse]] = {}
_TTL_S = 600.0
_MAX_SPAN_DEG = 60.0  # clamp absurd bounds so the lattice stays small


def _lattice(bbox: BBox, cols: int, rows: int) -> list[LonLat]:
    w, s, e, n = bbox.west, bbox.south, bbox.east, bbox.north
    # cell centres, south→north outer, west→east inner
    out: list[LonLat] = []
    for r in range(rows):
        fy = (r + 0.5) / rows
        lat = s + (n - s) * fy
        for c in range(cols):
            fx = (c + 0.5) / cols
            lon = w + (e - w) * fx
            out.append(LonLat(lon=round(lon, 4), lat=round(lat, 4)))
    return out


async def get_wind_field(
    bbox: BBox, at: datetime | None = None, *, cols: int = 7, rows: int = 6
) -> WindFieldResponse:
    cols = max(2, min(12, cols))
    rows = max(2, min(12, rows))
    valid_at = (at or datetime.now(UTC)).astimezone(UTC)

    # keep the lattice sane for huge / zoomed-out bounds
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
    field = None if get_settings().offline else await open_meteo_wind_10m(
        points, valid_at - timedelta(hours=1), valid_at + timedelta(hours=1)
    )
    live = bool(field and field.times)

    vectors: list[WindVector] = []
    for i, p in enumerate(points):
        if live:
            speed, going_to = field.sample(valid_at, i)
        else:
            # free-tier quota hit or offline: a smooth synthetic pattern so the
            # arrows still vary in direction and speed across the view
            speed, going_to = synth_flow(p.lon, p.lat, valid_at, kind="wind")
        vectors.append(WindVector(
            lon=p.lon, lat=p.lat,
            speed_ms=round(max(0.0, speed), 2),
            direction_deg=round(going_to % 360.0, 1),
        ))

    resp = WindFieldResponse(
        bbox=bbox,
        valid_at=valid_at,
        source=(
            "open-meteo 10 m wind (ERA5 / forecast)" if live
            else "synthesised pattern (live wind data unavailable)"
        ),
        cols=cols,
        rows=rows,
        points=vectors,
    )
    _CACHE[key] = (time.monotonic(), resp)
    return resp
