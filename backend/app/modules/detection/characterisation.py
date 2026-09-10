"""Spill characterisation — volume, oil type, age, thickness class.

Mock heuristics that are dimensionally honest:
  * volume  = area × thickness range for the inferred appearance class
              (Bonn Agreement Oil Appearance Code brackets), converted to barrels.
  * oil type = SAR damping is weakly discriminating; a declared-cargo hint nudges it.
  * age     = slick length divided by the local drift speed, with a wide band.
"""

from __future__ import annotations

from app.schemas.common import Confidence
from app.schemas.detection import OilType, SpillCharacterisation, SpillGeometry

_M3_TO_BBL = 6.2898

# appearance class -> (low, high) film thickness in metres  (Bonn Agreement)
_THICKNESS_M: dict[str, tuple[float, float]] = {
    "sheen": (5e-8, 3e-7),
    "rainbow": (3e-7, 5e-6),
    "metallic": (5e-6, 5e-5),
    "discontinuous": (5e-5, 2e-4),
    "continuous": (2e-4, 1e-3),
}


def _appearance_class(contrast_db: float, area_km2: float) -> str:
    # SAR backscatter contrast is the primary cue for film thickness; a very large
    # slick nudges the estimate up one class.
    if contrast_db >= 6.0 or (contrast_db >= 4.5 and area_km2 >= 60):
        return "discontinuous"
    if contrast_db >= 2.8:
        return "metallic"
    if contrast_db >= 1.2:
        return "rainbow"
    return "sheen"


def characterise(
    geom: SpillGeometry,
    *,
    contrast_db: float,
    drift_speed_ms: float,
    declared_cargo: str | None,
) -> SpillCharacterisation:
    cls = _appearance_class(contrast_db, geom.area_km2)
    t_low, t_high = _THICKNESS_M[cls]
    area_m2 = geom.area_km2 * 1e6
    vol_low_bbl = area_m2 * t_low * _M3_TO_BBL
    vol_high_bbl = area_m2 * t_high * _M3_TO_BBL

    oil_type, oil_conf = _infer_oil_type(declared_cargo, contrast_db)

    length_km = geom.slick_length_km or 1.0
    drift_kmh = max(drift_speed_ms, 0.05) * 3.6
    age_mid_h = length_km / drift_kmh
    age_low = round(max(age_mid_h * 0.6, 1.0), 1)
    age_high = round(age_mid_h * 1.7, 1)

    return SpillCharacterisation(
        estimated_volume_bbl_low=round(vol_low_bbl, 1),
        estimated_volume_bbl_high=round(vol_high_bbl, 1),
        oil_type=oil_type,
        oil_type_confidence=oil_conf,
        spill_age_hours_low=age_low,
        spill_age_hours_high=age_high,
        thickness_class=cls,  # type: ignore[arg-type]
    )


def _infer_oil_type(declared_cargo: str | None, contrast_db: float) -> tuple[OilType, Confidence]:
    cargo = (declared_cargo or "").lower()
    if "crude" in cargo:
        return "crude", Confidence(
            score=0.55,
            rationale="SAR damping and morphology consistent with a medium crude; "
            "nearest vessel declares crude cargo. Optical not conclusive.",
        )
    if "fuel" in cargo or "bunker" in cargo or "hfo" in cargo:
        return "heavy-fuel-oil", Confidence(
            score=0.5, rationale="Persistent high-contrast film; declared HFO cargo nearby."
        )
    if "bilge" in cargo:
        return "bilge-oily-water", Confidence(
            score=0.45, rationale="Thin, short-lived film typical of an operational bilge discharge."
        )
    if contrast_db < 1.5:
        return "unknown", Confidence(
            score=0.3, rationale="Low SAR contrast; could be a thin mineral oil film or a natural look alike."
        )
    return "unknown", Confidence(
        score=0.35, rationale="No corroborating cargo or spectral evidence for a specific oil class."
    )
