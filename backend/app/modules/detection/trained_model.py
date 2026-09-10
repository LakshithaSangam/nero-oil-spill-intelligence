"""Inference wrapper for a trained oil-spill U-Net.

``SEGMENTATION_MODEL=trained-unet`` + ``SEGMENTATION_WEIGHTS=<checkpoint.pt>``.
Loads the checkpoint written by ``app.ml.train``, runs the model over the raster in
overlapping tiles, thresholds the probability map, and vectorises blobs to geo
polygons (reusing the SAR segmenter's geocoding).

The model is trained on calibrated 2048x2048x2 sigma0 dB. Given only the keyless
8-bit quicklook it runs on a min-max stretch of the single channel duplicated to two
- a real inference path, but the calibrated full-resolution GRD is what it is meant
for. The detection service falls back to the scenario model if the checkpoint is
missing or the map comes back empty.
"""

from __future__ import annotations

import functools

import cv2
import numpy as np

from app.core.config import get_settings
from app.core.logging import get_logger
from app.modules.detection.sar_segmenter import SarQuicklookUnavailable, _component_ring
from app.modules.detection.types import Mask, SegmentationResult
from app.providers._http import http_client
from app.schemas.common import BBox
from app.schemas.imagery import RasterTile

log = get_logger(__name__)

_TILE = 512
_OVERLAP = 64
_PROB_THR = 0.5
_MIN_AREA_PX = 6
_MAX_CANDIDATES = 3


class TrainedModelUnavailable(RuntimeError):
    pass


@functools.lru_cache(maxsize=2)
def _load_model(weights_path: str):
    import torch

    from app.ml.unet import UNet

    ckpt = torch.load(weights_path, map_location="cpu")
    model = UNet(in_ch=int(ckpt.get("in_ch", 2)), base=int(ckpt.get("base", 32)))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    log.info("loaded segmentation checkpoint %s (val_iou=%s)", weights_path, ckpt.get("val_iou"))
    return model


class TrainedUNetSegmentationModel:
    id = "trained-unet-v1"

    def __init__(self, weights_path: str | None = None) -> None:
        self._weights = weights_path or get_settings().segmentation_weights
        if not self._weights:
            raise TrainedModelUnavailable("SEGMENTATION_WEIGHTS not set")

    async def infer(self, tile: RasterTile, aoi: BBox) -> SegmentationResult:
        import torch

        model = _load_model(self._weights)
        img = await self._load(tile.href)
        H, W = img.shape

        x = self._to_tensor(img)  # 1,2,H,W in [-1,1]
        prob = np.zeros((H, W), np.float32)
        acc = np.zeros((H, W), np.float32)
        step = _TILE - _OVERLAP
        with torch.no_grad():
            for y in range(0, max(1, H - _OVERLAP), step):
                for xx in range(0, max(1, W - _OVERLAP), step):
                    y1, x1 = min(y + _TILE, H), min(xx + _TILE, W)
                    y0, x0 = max(0, y1 - _TILE), max(0, x1 - _TILE)
                    patch = x[:, :, y0:y1, x0:x1]
                    ph, pw = patch.shape[-2:]
                    # U-Net needs dims divisible by 2**depth; pad, infer, crop back
                    pad_h, pad_w = (-ph) % 16, (-pw) % 16
                    if pad_h or pad_w:
                        patch = torch.nn.functional.pad(patch, (0, pad_w, 0, pad_h), mode="reflect")
                    out = torch.sigmoid(model(patch))[0, 0, :ph, :pw].cpu().numpy()
                    prob[y0:y1, x0:x1] += out
                    acc[y0:y1, x0:x1] += 1.0
        prob /= np.maximum(acc, 1.0)

        binary = (prob > _PROB_THR).astype(np.uint8)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

        # The keyless quicklook carries a black swath / no-data wedge the model
        # never saw in training and reads as the darkest possible "slick".
        # Drop near-black pixels (eroded so a genuine dark slick edge survives).
        valid = (img > 6).astype(np.uint8)
        valid = cv2.erode(valid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        binary &= valid

        # An out-of-domain frame can push the model to flag a huge low-wind area;
        # that is not a spill, so raise the bar until the positive fraction is
        # physically sane rather than emit a bogus geometry.
        thr = _PROB_THR
        while binary.sum() > 0.12 * binary.size and thr < 0.95:
            thr += 0.05
            binary = ((prob > thr).astype(np.uint8) & valid)
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

        n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)

        blobs: list[tuple[float, np.ndarray]] = []
        for i in range(1, n_labels):
            area = int(stats[i, 4])
            if area < _MIN_AREA_PX:
                continue
            comp = labels == i
            blobs.append((float(prob[comp].mean()) * area, comp))
        if not blobs:
            return SegmentationResult(
                model_id=self.id, mask=[], pixel_confidence=0.0, dark_spot_contrast_db=0.0,
                notes=f"trained-unet: no pixels above {_PROB_THR} on {W}x{H} raster",
            )

        blobs.sort(key=lambda b: b[0], reverse=True)
        mask: Mask = []
        mean_probs: list[float] = []
        selected = np.zeros((H, W), bool)
        for _, comp in blobs[:_MAX_CANDIDATES]:
            ring = _component_ring(comp, tile.bbox, W, H)
            if ring:
                mask.append([ring])
                mean_probs.append(float(prob[comp].mean()))
                selected |= comp
        if not mask:
            return SegmentationResult(
                model_id=self.id, mask=[], pixel_confidence=0.0, dark_spot_contrast_db=0.0,
                notes="trained-unet: contours degenerate after simplification",
            )

        conf = float(np.mean(mean_probs))
        # approximate backscatter drop (dark slick vs. surrounding sea) for the scorer
        fg = img[selected].astype(np.float32)
        bg = img[~selected].astype(np.float32)
        contrast_db = 20.0 * np.log10(
            max(float(bg.mean()) if bg.size else 1.0, 1.0) / max(float(fg.mean()) if fg.size else 1.0, 1.0)
        )
        return SegmentationResult(
            model_id=self.id,
            mask=mask,
            pixel_confidence=round(min(0.98, max(0.2, conf)), 3),
            dark_spot_contrast_db=round(float(max(contrast_db, 0.0)), 2),
            notes=(f"trained-unet on {W}x{H} raster; {len(blobs)} blob(s) above "
                   f"{_PROB_THR}, mean prob {conf:.2f}"),
        )

    async def _load(self, href: str) -> np.ndarray:
        if not href.startswith("http"):
            raise SarQuicklookUnavailable(f"non-fetchable raster href: {href[:60]}")
        async with http_client() as client:
            resp = await client.get(href)
            resp.raise_for_status()
        arr = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_GRAYSCALE)
        if arr is None:
            raise SarQuicklookUnavailable("raster bytes did not decode as an image")
        return arr

    @staticmethod
    def _to_tensor(img: np.ndarray):
        import torch

        v = img.astype(np.float32)
        lo, hi = float(np.percentile(v, 1)), float(np.percentile(v, 99))
        v = np.clip((v - lo) / max(hi - lo, 1e-6), 0.0, 1.0) * 2.0 - 1.0
        stacked = np.stack([v, v], axis=0)[None, ...]  # 1,2,H,W
        return torch.from_numpy(np.ascontiguousarray(stacked)).float()
