"""Classical dark-spot segmentation on a real Sentinel-1 quicklook.

Not a trained CNN — the operational pre-CNN approach: adaptive thresholding of low
backscatter, morphological cleanup, connected components, then shape / contrast /
context filtering. It runs on the keyless CDSE quicklook PNG (a coarse ~1 km/px
amplitude preview), so the geometry is approximate and north-up is assumed. For a
precision result you need the calibrated full-resolution GRD (credentialled, ~1 GB).

Selected with ``SEGMENTATION_MODEL=classical-sar``. The detection service falls back
to the scenario model when this finds no credible candidate, so the pipeline always
completes.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from app.core.logging import get_logger
from app.modules.detection.types import Mask, Ring, SegmentationResult
from app.providers._http import http_client
from app.schemas.common import BBox
from app.schemas.imagery import RasterTile

log = get_logger(__name__)

_MIN_AREA_PX = 6           # a coherent slick is a connected blob, not salt-and-pepper texture
_MAX_AREA_FRAC = 0.30      # a component larger than this is land / swath, not a slick
_MIN_CONTRAST_DB = 1.5     # component must be this much darker than its dilated surroundings
_MAX_CANDIDATES = 3
_ADAPT_C = 8               # how much below the local mean a pixel must sit to read as "dark"


class SarQuicklookUnavailable(RuntimeError):
    pass


class SarDarkSpotSegmenter:
    id = "classical-sar-darkspot-v1"

    async def infer(self, tile: RasterTile, aoi: BBox) -> SegmentationResult:
        img = await self._load(tile.href)
        H, W = img.shape
        valid = img > 0                       # 0 = SAR swath no-data border
        if valid.sum() < 0.2 * H * W:
            raise SarQuicklookUnavailable("quicklook is mostly no-data")

        blur = cv2.GaussianBlur(img, (5, 5), 0)
        sea = blur[valid].astype(np.float32)
        bg_mean, bg_std = float(sea.mean()), float(sea.std() or 1.0)

        # Quicklooks are contrast-stretched previews, so a global mean-k*std cut is
        # useless. Use an adaptive threshold (locally darker than the neighbourhood,
        # robust to the swath brightness gradient); morphology + a min connected area
        # + a per-component contrast test then reject texture. A real slick is a
        # coherent dark blob that survives all three.
        block = max(15, (min(H, W) // 8) | 1)
        local = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, _ADAPT_C
        )
        dark = ((local > 0) & valid).astype(np.uint8)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, kernel)
        dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel, iterations=2)

        n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
        valid_area = int(valid.sum())
        cands: list[tuple[float, np.ndarray, float]] = []
        for i in range(1, n_labels):
            x, y, w, h, area = (int(v) for v in stats[i])
            if area < _MIN_AREA_PX or area > _MAX_AREA_FRAC * valid_area:
                continue
            comp = labels == i
            ring_mask = _dilate(comp, 3) & valid & ~comp
            spot = float(blur[comp].mean())
            local_bg = float(blur[ring_mask].mean()) if ring_mask.any() else bg_mean
            contrast_db = 20.0 * math.log10(max(local_bg, 1.0) / max(spot, 1.0))
            if contrast_db < _MIN_CONTRAST_DB:
                continue
            elong = max(w, h) / max(min(w, h), 1)
            edge = x == 0 or y == 0 or x + w >= W or y + h >= H
            score = contrast_db * (1.0 + 0.15 * min(elong, 6.0)) * (0.5 if edge else 1.0)
            cands.append((score, comp, contrast_db))

        if not cands:
            return SegmentationResult(
                model_id=self.id, mask=[], pixel_confidence=0.0, dark_spot_contrast_db=0.0,
                notes=f"no dark-spot candidate on {W}x{H} quicklook (sea mean={bg_mean:.0f})",
            )

        cands.sort(key=lambda c: c[0], reverse=True)
        mask: Mask = []
        for _, comp, _ in cands[:_MAX_CANDIDATES]:
            ring = _component_ring(comp, tile.bbox, W, H)
            if ring:
                mask.append([ring])
        if not mask:
            return SegmentationResult(
                model_id=self.id, mask=[], pixel_confidence=0.0, dark_spot_contrast_db=0.0,
                notes="candidate contours degenerate after simplification",
            )

        best_db = cands[0][2]
        confidence = min(0.95, max(0.15, (best_db - 1.0) / 6.0))
        return SegmentationResult(
            model_id=self.id,
            mask=mask,
            pixel_confidence=round(confidence, 3),
            dark_spot_contrast_db=round(best_db, 2),
            notes=(f"classical dark-spot on Sentinel-1 quicklook {W}x{H}; "
                   f"{len(cands)} candidate(s), sea mean={bg_mean:.0f} std={bg_std:.0f}"),
        )

    async def _load(self, href: str) -> np.ndarray:
        if not href.startswith("http"):
            raise SarQuicklookUnavailable(f"non-fetchable raster href: {href[:60]}")
        async with http_client() as client:
            resp = await client.get(href)
            resp.raise_for_status()
        arr = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_GRAYSCALE)
        if arr is None:
            raise SarQuicklookUnavailable("quicklook bytes did not decode as an image")
        return arr


def _dilate(mask_bool: np.ndarray, size: int) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    return cv2.dilate(mask_bool.astype(np.uint8), k).astype(bool)


def _component_ring(comp: np.ndarray, bbox: BBox, width: int, height: int) -> Ring:
    contours, _ = cv2.findContours(comp.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    cnt = max(contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(cnt, 1.5, closed=True).reshape(-1, 2)
    if len(approx) < 3:
        return []
    dlon = bbox.east - bbox.west
    dlat = bbox.north - bbox.south
    ring: Ring = [
        [bbox.west + (px / width) * dlon, bbox.north - (py / height) * dlat]
        for px, py in approx
    ]
    ring.append(ring[0])
    return ring
