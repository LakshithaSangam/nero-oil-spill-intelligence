"""Land test for the drift/backtrack advection.

``advect`` in this package integrates pure current + wind + wave physics with no
notion of a coastline, so left alone it happily draws a hindcast or forecast path
straight across dry land. This module gives it something to check against: a
small clip of Natural Earth's public-domain 1:50m land polygons, cut down to the
NW Indian Ocean / Arabian Sea region the replay scenarios live in, so the check
stays cheap without bundling a global coastline dataset.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape

_DATA_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "data" / "land_nw_indian_ocean.geojson"

_land_geom: shapely.Geometry | None = None


def _land() -> shapely.Geometry:
    global _land_geom
    if _land_geom is None:
        with open(_DATA_PATH, encoding="utf-8") as f:
            data = json.load(f)
        _land_geom = shape(data["features"][0]["geometry"])
    return _land_geom


def on_land(lons: np.ndarray, lats: np.ndarray) -> np.ndarray:
    """Vectorised point-in-land test. ``lons``/``lats`` are (N,) arrays; returns (N,) bool.

    Points outside the bundled region's coverage are treated as open water rather
    than land, so a scenario outside the NW Indian Ocean clip degrades to today's
    unmasked behaviour instead of freezing every particle immediately.
    """
    return shapely.contains_xy(_land(), lons, lats)
