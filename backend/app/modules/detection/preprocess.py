"""SAR preprocessing hook.

Real pipeline (SNAP / snappy or equivalent): apply-orbit-file → thermal-noise
removal → radiometric calibration to sigma0 → speckle filtering → range-Doppler
terrain correction → dB scaling. The mock reports what *would* have run so the UI
can show the provenance chain; it does not touch pixels.
"""

from __future__ import annotations

from app.modules.detection.types import PreprocessReport
from app.schemas.imagery import RasterTile


async def preprocess_sar(tile: RasterTile) -> PreprocessReport:
    return PreprocessReport(
        steps=[
            "apply precise orbit file",
            "thermal noise removal",
            "radiometric calibration to sigma0",
            "Refined Lee speckle filter (7×7)",
            "range-Doppler terrain correction (SRTM 1Sec)",
            "convert to dB",
        ],
        speckle_filter="Refined Lee 7×7",
        calibrated_to="sigma0 (dB), VV",
        effective_resolution_m=20.0,
    )
