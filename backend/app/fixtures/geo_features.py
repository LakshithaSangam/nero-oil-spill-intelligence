"""Static coastal / environmental receptors near the replay scenarios.

M3 uses the coastline segments for forecast landfall ETAs. M7+ (environmental impact
intelligence) extends this with reefs, mangroves and marine protected areas, hence
the generic ``Receptor`` shape and ``kind`` field.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ReceptorKind = Literal[
    "coastline", "coral-reef", "mangrove", "marine-protected-area", "fishery",
    "seagrass", "turtle-nesting", "desalination-intake",
]

# A polyline in [lon, lat] pairs.
Line = list[list[float]]


@dataclass(frozen=True)
class Receptor:
    id: str
    name: str
    kind: ReceptorKind
    line: Line
    sensitivity: float = 0.5  # 0..1, ecological / socio-economic vulnerability
    tags: list[str] = field(default_factory=list)


# East of the Arabian Sea replay AOI: the Saurashtra peninsula south coast.
ARABIAN_SEA_RECEPTORS: list[Receptor] = [
    Receptor(
        id="veraval-coast",
        name="Veraval fishing coast",
        kind="fishery",
        line=[[70.28, 20.95], [70.40, 20.90], [70.52, 20.86]],
        sensitivity=0.72,
        tags=["fishing-harbour", "landing-sites"],
    ),
    Receptor(
        id="saurashtra-south-coast",
        name="Saurashtra south coast (Kodinar to Una)",
        kind="coastline",
        line=[[70.55, 20.82], [70.72, 20.79], [70.88, 20.74]],
        sensitivity=0.6,
        tags=["beaches", "settlements"],
    ),
    Receptor(
        id="diu-khambhat-approach",
        name="Diu headland & Gulf of Khambhat approach",
        kind="marine-protected-area",
        line=[[70.95, 20.71], [71.30, 20.80], [71.75, 20.95]],
        sensitivity=0.8,
        tags=["reef-patches", "protected"],
    ),
    Receptor(
        id="diu-patch-reefs",
        name="Diu patch reefs",
        kind="coral-reef",
        line=[[70.90, 20.68], [71.02, 20.66], [71.14, 20.67]],
        sensitivity=0.92,
        tags=["hard-coral", "no-recovery-if-oiled"],
    ),
    Receptor(
        id="khambhat-mangroves",
        name="Gulf of Khambhat mangrove belt",
        kind="mangrove",
        line=[[72.05, 21.05], [72.25, 21.25], [72.45, 21.50]],
        sensitivity=0.88,
        tags=["nursery-habitat", "slow-flush"],
    ),
]

RECEPTORS_BY_SCENARIO: dict[str, list[Receptor]] = {
    "arabian-sea-discharge": ARABIAN_SEA_RECEPTORS,
}


def receptors_for(scenario_id: str | None) -> list[Receptor]:
    return RECEPTORS_BY_SCENARIO.get(scenario_id or "", ARABIAN_SEA_RECEPTORS)
