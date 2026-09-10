"""Real 2 m air-temperature field for the map's temperature heat-map layer.

Provider-independent — always keyless Open-Meteo (ERA5 archive for old windows,
forecast otherwise) for a coarse lattice over the requested map bounds, so the
layer shows each region's actual temperature, land and sea alike. Results are
cached briefly, keyed by a rounded bbox + hour. A smooth synthetic field stands
in when the free-tier quota is hit or the network is down.
"""

from __future__ import annotations

import math
import time
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.oceanography._temp import open_meteo_temp_2m
from app.schemas.common import BBox, LonLat
from app.schemas.weather import TempFieldResponse, TempSample

log = get_logger(__name__)

_CACHE: dict[str, tuple[float, TempFieldResponse]] = {}
_TTL_S = 600.0
_MAX_SPAN_DEG = 90.0


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


def _synth_temp(lon: float, lat: float, valid_at: datetime) -> float:
    """A plausible 2 m temperature (deg C): warm equator, cold poles, with a
    diurnal swing and mild longitudinal variation so panning reveals structure."""
    lat_r = math.radians(lat)
    base = 30.0 - 55.0 * (1.0 - math.cos(lat_r)) - 8.0 * math.sin(lat_r) ** 2
    diurnal = 4.0 * math.sin((valid_at.hour + valid_at.minute / 60.0) / 24.0 * 2 * math.pi - 1.4)
    ripple = 3.0 * math.sin(lon * 0.06 + lat_r * 2.1) + 2.0 * math.cos(lon * 0.021 - lat_r * 1.3)
    return round(base + diurnal + ripple, 2)


async def get_temp_field(
    bbox: BBox, at: datetime | None = None, *, cols: int = 8, rows: int = 6
) -> TempFieldResponse:
    cols = max(2, min(14, cols))
    rows = max(2, min(14, rows))
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
    field = None if get_settings().offline else await open_meteo_temp_2m(
        points, valid_at - timedelta(hours=1), valid_at + timedelta(hours=1)
    )
    live = bool(field and field.times)

    samples: list[TempSample] = []
    for i, p in enumerate(points):
        v = field.sample(valid_at, i) if live else None
        if v is None or v != v:  # None or NaN
            v = _synth_temp(p.lon, p.lat, valid_at)
        samples.append(TempSample(lon=p.lon, lat=p.lat, temp_c=round(float(v), 2)))

    resp = TempFieldResponse(
        bbox=bbox,
        valid_at=valid_at,
        source=(
            "open-meteo 2 m temperature (ERA5 / forecast)" if live
            else "synthesised pattern (live temperature data unavailable)"
        ),
        cols=cols,
        rows=rows,
        points=samples,
    )
    _CACHE[key] = (time.monotonic(), resp)
    return resp
