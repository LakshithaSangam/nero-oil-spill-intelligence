"""Historical AIS reconstruction around the predicted origin.

Queries the active AIS provider for every vessel whose track passes through a box
around the hindcast origin during the release window (padded), and clips each track
to that window.
"""

from __future__ import annotations

from datetime import timedelta

from app.providers.ais.base import AISProvider
from app.providers.registry import registry
from app.schemas.ais import AISQuery, VesselTrack
from app.schemas.common import BBox, LonLat, TimeRange

_KM_LAT = 110.574


def _km_lon(lat: float) -> float:
    import math

    return 111.320 * math.cos(math.radians(lat))


async def reconstruct(
    origin: LonLat, window: TimeRange, *, radius_km: float, padding_h: float
) -> list[VesselTrack]:
    provider = registry.active("ais")
    if not isinstance(provider, AISProvider):  # pragma: no cover
        raise RuntimeError("active AIS provider does not implement AISProvider")

    dlat = radius_km / _KM_LAT
    dlon = radius_km / _km_lon(origin.lat)
    bbox = BBox(
        west=origin.lon - dlon, south=origin.lat - dlat,
        east=origin.lon + dlon, north=origin.lat + dlat,
    )
    q = AISQuery(
        bbox=bbox,
        start=window.start - timedelta(hours=padding_h),
        end=window.end + timedelta(hours=padding_h),
    )
    return await provider.tracks(q)
