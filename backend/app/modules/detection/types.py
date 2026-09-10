"""Internal contracts for the detection pipeline. Not exposed over the API — the
public output is ``app.schemas.detection.SpillDetection``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# A polygon ring is a list of [lon, lat] pairs; a shape is a list of rings
# (exterior first, then holes). A mask is a list of shapes (multi-part slick).
Ring = list[list[float]]
Shape = list[Ring]
Mask = list[Shape]


@dataclass
class PreprocessReport:
    steps: list[str]
    speckle_filter: str
    calibrated_to: str
    effective_resolution_m: float


@dataclass
class SegmentationResult:
    model_id: str
    mask: Mask
    pixel_confidence: float  # 0..1, mean posterior over slick pixels
    dark_spot_contrast_db: float  # SAR backscatter drop vs local background
    notes: str = ""


@dataclass
class EOValidation:
    eo_scene_id: str | None
    corroborates: bool
    confidence_delta: float
    checks: list[str] = field(default_factory=list)
