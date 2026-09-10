"""A small library of past spills with comparable 'signatures', for similarity search.

Real deployments back this with the NOAA Marine Pollution Monitoring archive and the
platform's own confirmed cases. Each record carries the features the similarity
engine compares against a fresh detection.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.schemas.common import LonLat


@dataclass(frozen=True)
class HistoricalSpill:
    id: str
    name: str
    date: datetime
    location: LonLat
    area_km2: float
    oil_type: str          # matches app.schemas.detection.OilType values
    thickness_class: str   # sheen|rainbow|metallic|discontinuous|continuous
    elongation: float      # slick length / mean width
    fragment_count: int
    cause: str             # matches app.schemas.report.SpillCause values
    likely_vessel_type: str | None
    outcome: str
    source: str = "NOAA archive (mock)"


CASE_LIBRARY: list[HistoricalSpill] = [
    HistoricalSpill(
        "hs-2021-arb-bilge-01", "Operational discharge, Gulf of Kutch approaches",
        datetime(2021, 8, 6, tzinfo=UTC), LonLat(lon=68.9, lat=20.7),
        area_km2=11.0, oil_type="crude", thickness_class="metallic",
        elongation=7.8, fragment_count=2, cause="illegal-bilge-dumping",
        likely_vessel_type="tanker",
        outcome="Tanker identified via SAR + AIS gap; flag state notified, fine issued.",
    ),
    HistoricalSpill(
        "hs-2019-arb-bilge-02", "Slop discharge on the tanker lane off Diu",
        datetime(2019, 9, 21, tzinfo=UTC), LonLat(lon=70.4, lat=20.6),
        area_km2=17.5, oil_type="heavy-fuel-oil", thickness_class="metallic",
        elongation=9.1, fragment_count=3, cause="maintenance-discharge",
        likely_vessel_type="bulk-carrier",
        outcome="No prosecution. The vessel left the area before confirmation.",
    ),
    HistoricalSpill(
        "hs-2018-arb-bilge-03", "Recurring sheen corridor, Mumbai High approaches",
        datetime(2018, 7, 14, tzinfo=UTC), LonLat(lon=71.6, lat=19.4),
        area_km2=6.2, oil_type="bilge-oily-water", thickness_class="rainbow",
        elongation=6.5, fragment_count=1, cause="illegal-bilge-dumping",
        likely_vessel_type="cargo",
        outcome="Pattern linked to a single operator after three detections.",
    ),
    HistoricalSpill(
        "hs-2017-arb-cargo-01", "Cargo tank breach on a laden VLCC, Arabian Sea",
        datetime(2017, 3, 2, tzinfo=UTC), LonLat(lon=64.2, lat=19.0),
        area_km2=92.0, oil_type="crude", thickness_class="continuous",
        elongation=2.4, fragment_count=1, cause="cargo-leak",
        likely_vessel_type="tanker",
        outcome="Structural failure; major response, IOPC claim.",
    ),
    HistoricalSpill(
        "hs-2016-arb-collision-01", "Tanker and container collision, Kamarajar approaches",
        datetime(2016, 1, 28, tzinfo=UTC), LonLat(lon=80.4, lat=13.2),
        area_km2=34.0, oil_type="heavy-fuel-oil", thickness_class="discontinuous",
        elongation=3.1, fragment_count=4, cause="tanker-collision",
        likely_vessel_type="tanker",
        outcome="Both masters prosecuted; shoreline mangrove impact.",
    ),
    HistoricalSpill(
        "hs-2015-arb-pipeline-01", "Subsea pipeline leak, Bombay High field",
        datetime(2015, 11, 9, tzinfo=UTC), LonLat(lon=71.9, lat=19.6),
        area_km2=21.0, oil_type="crude", thickness_class="metallic",
        elongation=1.6, fragment_count=1, cause="pipeline-rupture",
        likely_vessel_type=None,
        outcome="Fixed source; no vessel nearby. Operator remediation order.",
    ),
]
