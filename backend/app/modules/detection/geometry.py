"""Boundary vectorisation and geometry.

Takes the segmentation mask (rings in lon/lat) and produces the public
``SpillGeometry``: a cleaned MultiPolygon plus geodesic area / perimeter, centroid,
slick length and fragment count. Areas and lengths use the WGS84 ellipsoid via
``pyproj.Geod`` — no projection choice to get wrong.
"""

from __future__ import annotations

from pyproj import Geod
from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.ops import unary_union

from app.modules.detection.types import Mask
from app.schemas.common import BBox, GeoJSONGeometry
from app.schemas.detection import SpillGeometry

_GEOD = Geod(ellps="WGS84")


def build_geometry(mask: Mask) -> SpillGeometry:
    polys: list[Polygon] = []
    for shape in mask:
        if not shape:
            continue
        exterior = shape[0]
        holes = shape[1:]
        poly = Polygon(exterior, holes).buffer(0)  # buffer(0) fixes self-touching rings
        if poly.is_empty:
            continue
        if isinstance(poly, MultiPolygon):
            polys.extend(p for p in poly.geoms)
        else:
            polys.append(poly)

    if not polys:
        raise ValueError("segmentation mask produced no valid polygons")

    merged = unary_union(polys)
    parts: list[Polygon] = (
        list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]  # type: ignore[list-item]
    )

    area_m2 = 0.0
    perim_m = 0.0
    for p in parts:
        a, per = _GEOD.geometry_area_perimeter(p)
        area_m2 += abs(a)
        perim_m += per

    minx, miny, maxx, maxy = merged.bounds
    centroid = merged.centroid
    biggest = max(parts, key=lambda p: p.area)

    geom = GeoJSONGeometry(
        type="MultiPolygon" if len(parts) > 1 else "Polygon",
        coordinates=(
            [list(mapping(p)["coordinates"]) for p in parts]
            if len(parts) > 1
            else list(mapping(biggest)["coordinates"])
        ),
    )

    return SpillGeometry(
        polygon=geom,
        bbox=BBox(west=minx, south=miny, east=maxx, north=maxy),
        area_km2=round(area_m2 / 1e6, 3),
        perimeter_km=round(perim_m / 1e3, 3),
        centroid=(round(centroid.x, 5), round(centroid.y, 5)),
        slick_length_km=round(_max_extent_km(biggest), 2),
        fragment_count=len(parts),
    )


def _max_extent_km(poly: Polygon) -> float:
    """Longest chord of the exterior ring — a proxy for slick length."""
    coords = list(poly.exterior.coords)
    best = 0.0
    step = max(1, len(coords) // 48)
    sampled = coords[::step]
    for i in range(len(sampled)):
        for j in range(i + 1, len(sampled)):
            lon1, lat1 = sampled[i]
            lon2, lat2 = sampled[j]
            _, _, dist = _GEOD.inv(lon1, lat1, lon2, lat2)
            best = max(best, dist)
    return best / 1e3
