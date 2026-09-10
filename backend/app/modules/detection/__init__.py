"""Module 1 — AI Spill Detection & Characterisation.

Input : Sentinel-1 SAR tile (+ Sentinel-2 EO tile), AOI.
Steps : SAR preprocessing -> segmentation model -> EO cross-validation ->
        boundary vectorisation (Shapely) -> geometry + characterisation.
Output: app.schemas.detection.SpillDetection
        (polygon, area, perimeter, est. volume, oil type, spill age, confidence).

Model access is via a SegmentationModel Protocol; the mock returns a plausible mask,
a trained PyTorch network drops in behind the same interface. Built in milestone M2.
"""

from app.modules.detection.service import DetectionError, DetectionService, service

__all__ = ["DetectionError", "DetectionService", "service"]
