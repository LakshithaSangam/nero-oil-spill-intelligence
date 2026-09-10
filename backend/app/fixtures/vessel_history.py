"""Synthetic per-vessel history behind the Pollution Risk Index.

Real deployments would draw this from the incident database, port-state-control
records and the platform's own prior detections. Here it is a small fixture so the
risk index and micro-leak early-warning have a signal to work with.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.schemas.common import LonLat

PriorKind = Literal["micro-leak", "violation", "port-state-detention"]


@dataclass(frozen=True)
class PriorEvent:
    date: datetime
    kind: PriorKind
    location: LonLat
    area_km2: float | None
    confidence: float
    note: str


# MV HORIZON — a recurring low-level discharger in the same Arabian Sea corridor.
_HORIZON = [
    PriorEvent(datetime(2026, 7, 15, 3, 20, tzinfo=UTC), "micro-leak",
               LonLat(lon=69.11, lat=20.49), 0.6, 0.61,
               "Short sheen on the same tanker lane; unattributed at the time."),
    PriorEvent(datetime(2026, 7, 29, 1, 5, tzinfo=UTC), "micro-leak",
               LonLat(lon=69.04, lat=20.41), 0.9, 0.58,
               "Sheen coincident with a 40-min AIS gap."),
    PriorEvent(datetime(2026, 8, 12, 4, 40, tzinfo=UTC), "micro-leak",
               LonLat(lon=69.19, lat=20.52), 1.3, 0.67,
               "Linear film along drift; slow transit recorded before the gap."),
    PriorEvent(datetime(2024, 11, 2, 0, 0, tzinfo=UTC), "violation",
               LonLat(lon=55.3, lat=25.1), None, 0.9,
               "MARPOL Annex I citation for bypassing the oily water separator (Fujairah)."),
    PriorEvent(datetime(2023, 6, 18, 0, 0, tzinfo=UTC), "violation",
               LonLat(lon=72.9, lat=18.9), None, 0.9,
               "Deficiency: oil record book entries inconsistent (Mumbai PSC)."),
]

VESSEL_HISTORY: dict[str, list[PriorEvent]] = {
    "374192000": _HORIZON,
    "236887000": [],
    "477553000": [],
    "419001234": [
        PriorEvent(datetime(2025, 2, 9, 0, 0, tzinfo=UTC), "port-state-detention",
                   LonLat(lon=70.36, lat=20.9), None, 0.8,
                   "Detained at Veraval over an expired IOPP certificate; released after survey."),
    ],
}

# Vessels whose regular route runs through a corridor with elevated discharge history.
HIGH_RISK_ROUTE: dict[str, bool] = {
    "374192000": True,
    "236887000": False,
    "477553000": False,
    "419001234": False,
}


def history_for(mmsi: str) -> list[PriorEvent]:
    return VESSEL_HISTORY.get(mmsi, [])
