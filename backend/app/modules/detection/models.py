"""Segmentation model interface + a deterministic mock.

A trained PyTorch model (U-Net / DeepLabv3+ on Sentinel-1 sigma0 patches) drops in
behind ``SegmentationModel`` with no change to the rest of the pipeline. The mock
synthesises a physically plausible slick: an elongated main body aligned with the
local drift, plus a thin detached sheen fragment down-drift.
"""

from __future__ import annotations

import math
from typing import Protocol, runtime_checkable

from app.modules.detection.types import Mask, Ring, SegmentationResult
from app.schemas.common import BBox, LonLat
from app.schemas.imagery import RasterTile

_KM_PER_DEG_LAT = 110.574


def _km_per_deg_lon(lat: float) -> float:
    return 111.320 * math.cos(math.radians(lat))


def _offset(origin: LonLat, east_km: float, north_km: float) -> list[float]:
    return [
        origin.lon + east_km / _km_per_deg_lon(origin.lat),
        origin.lat + north_km / _KM_PER_DEG_LAT,
    ]


@runtime_checkable
class SegmentationModel(Protocol):
    id: str

    async def infer(self, tile: RasterTile, aoi: BBox) -> SegmentationResult: ...


class MockSegmentationModel:
    id = "mock-unet-synthetic-v0"

    def __init__(
        self,
        center: LonLat | None = None,
        bearing_deg: float = 135.0,
        area_scale: float = 1.0,
    ) -> None:
        self._center = center
        self._bearing = bearing_deg
        self._area_scale = max(area_scale, 0.02)

    async def infer(self, tile: RasterTile, aoi: BBox) -> SegmentationResult:
        c = self._center or LonLat(
            lon=(aoi.west + aoi.east) / 2, lat=(aoi.south + aoi.north) / 2
        )
        brg = math.radians(self._bearing)
        # unit vectors: along-drift (a) and cross-drift (x), in km-space
        ax, ay = math.sin(brg), math.cos(brg)
        xx, xy = math.cos(brg), -math.sin(brg)
        s = math.sqrt(self._area_scale)  # area ∝ length × width

        main = _blob(c, (ax, ay), (xx, xy), half_len_km=6.8 * s, half_wid_km=0.58 * s,
                     lobe=0.22, n=72, seed=17)
        # detached sheen further down-drift, smaller and thinner
        frag_center = LonLat(
            lon=c.lon + (ax * 11.0 * s) / _km_per_deg_lon(c.lat),
            lat=c.lat + (ay * 11.0 * s) / _KM_PER_DEG_LAT,
        )
        frag = _blob(frag_center, (ax, ay), (xx, xy), half_len_km=1.8 * s, half_wid_km=0.4 * s,
                     lobe=0.4, n=40, seed=42)

        mask: Mask = [[main], [frag]]
        contrast = round(3.4 * (0.72 + 0.28 * min(self._area_scale, 1.5)), 2)
        return SegmentationResult(
            model_id=self.id,
            mask=mask,
            pixel_confidence=round(0.88 * (0.82 + 0.18 * min(self._area_scale, 1.4)), 3),
            dark_spot_contrast_db=contrast,
            notes="elongated low-backscatter feature aligned with drift; trailing sheen fragment",
        )


def _blob(
    center: LonLat,
    along: tuple[float, float],
    cross: tuple[float, float],
    *,
    half_len_km: float,
    half_wid_km: float,
    lobe: float,
    n: int,
    seed: int,
) -> Ring:
    """A closed, mildly irregular ellipse in km-space, returned as [lon,lat] ring."""
    ring: Ring = []
    for i in range(n):
        t = 2 * math.pi * i / n
        # base ellipse + a couple of low-frequency lobes for an organic edge
        wobble = 1.0 + lobe * 0.5 * (
            math.sin(3 * t + seed) + 0.5 * math.sin(5 * t + seed * 2)
        ) / 1.5
        a = half_len_km * math.cos(t) * wobble
        w = half_wid_km * math.sin(t) * wobble
        east_km = along[0] * a + cross[0] * w
        north_km = along[1] * a + cross[1] * w
        ring.append(_offset(center, east_km, north_km))
    ring.append(ring[0])  # close
    return ring
