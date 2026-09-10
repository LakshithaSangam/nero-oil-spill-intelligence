"""Canonical replay scenarios.

M0 ships one fully specified case. Mock providers derive their synthetic output from
these constants so every module sees a coherent, deterministic world.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.schemas.common import BBox, LonLat
from app.schemas.incidents import Incident


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    summary: str
    aoi: BBox
    origin_hint: LonLat
    # where the slick is *observed*, as (east_km, north_km) from origin_hint — the
    # slick has drifted downstream of its source by the time the satellite sees it.
    slick_offset_km: tuple[float, float]
    sar_pass_at: datetime
    release_window: tuple[datetime, datetime]
    incident: Incident
    suspect_mmsi: str
    tags: list[str] = field(default_factory=list)
    # day-offset from the SAR pass -> slick-area multiplier, for the historical timeline
    timeline_profile: dict[int, float] = field(
        default_factory=lambda: {-6: 0.32, 0: 1.0, 6: 1.48}
    )


_ARABIAN_SEA = Scenario(
    id="arabian-sea-discharge",
    name="Arabian Sea tanker discharge",
    summary=(
        "A ~14 km oily slick detected by Sentinel-1 on a busy tanker lane ~120 NM "
        "west of Gujarat. Morphology and drift are consistent with an underway "
        "operational discharge rather than a single point structural failure."
    ),
    aoi=BBox(west=68.55, south=20.15, east=69.35, north=20.85),
    origin_hint=LonLat(lon=69.02, lat=20.44),
    slick_offset_km=(13.0, 1.5),
    sar_pass_at=datetime(2026, 8, 28, 5, 41, tzinfo=UTC),
    release_window=(
        datetime(2026, 8, 27, 18, 0, tzinfo=UTC),
        datetime(2026, 8, 28, 2, 0, tzinfo=UTC),
    ),
    incident=Incident(
        id="noaa-2026-arb-0421",
        source="NOAA (mock ground truth)",
        name="Suspected discharge on the Arabian Sea shipping lane",
        location=LonLat(lon=69.02, lat=20.44),
        reported_at=datetime(2026, 8, 28, 9, 15, tzinfo=UTC),
        severity="moderate",
        status="confirmed",
        substance="crude oil (suspected)",
        estimated_volume_bbl=480,
        description=(
            "Slick reported from routine SAR screening; surface vessel tasked for "
            "confirmation. Recurrent low level sheen observed in this corridor over "
            "the preceding 6 weeks."
        ),
    ),
    suspect_mmsi="374192000",
    tags=["operational-discharge", "tanker-lane", "recurrent", "SAR-primary"],
)


_KUTCH_BUNKER = Scenario(
    id="kutch-bunker-overfill",
    name="Gulf of Kutch bunker overfill",
    summary=(
        "A ~6 km fuel-oil sheen off the Vadinar terminal, consistent with a "
        "ship-to-ship bunker transfer overfill. Contained but drifting toward the "
        "Marine National Park mangroves on the ebb tide."
    ),
    aoi=BBox(west=69.55, south=22.20, east=70.15, north=22.75),
    origin_hint=LonLat(lon=69.82, lat=22.42),
    slick_offset_km=(4.5, 2.0),
    sar_pass_at=datetime(2026, 9, 3, 6, 12, tzinfo=UTC),
    release_window=(
        datetime(2026, 9, 3, 1, 30, tzinfo=UTC),
        datetime(2026, 9, 3, 4, 15, tzinfo=UTC),
    ),
    incident=Incident(
        id="noaa-2026-kutch-0517",
        source="NOAA (mock ground truth)",
        name="Bunker sheen off Vadinar, Gulf of Kutch",
        location=LonLat(lon=69.82, lat=22.42),
        reported_at=datetime(2026, 9, 3, 8, 0, tzinfo=UTC),
        severity="moderate",
        status="confirmed",
        substance="heavy fuel oil (IFO 380)",
        estimated_volume_bbl=120,
        description=(
            "Sheen reported by a terminal launch during a scheduled STS bunkering. "
            "Transfer paused; boom deployed. Coastal park and mangroves ~11 km "
            "down-tide."
        ),
    ),
    suspect_mmsi="419772100",
    tags=["bunkering", "sts-transfer", "coastal", "mangrove-risk"],
)

_MUMBAI_BILGE = Scenario(
    id="mumbai-anchorage-bilge",
    name="Mumbai anchorage bilge discharge",
    summary=(
        "A thin ~9 km oily-water trail in the outer anchorage off Mumbai, the "
        "signature of an overnight bilge discharge by a vessel at anchor while "
        "awaiting a berth."
    ),
    aoi=BBox(west=72.55, south=18.75, east=73.05, north=19.15),
    origin_hint=LonLat(lon=72.78, lat=18.93),
    slick_offset_km=(7.5, -1.0),
    sar_pass_at=datetime(2026, 9, 6, 1, 22, tzinfo=UTC),
    release_window=(
        datetime(2026, 9, 5, 18, 0, tzinfo=UTC),
        datetime(2026, 9, 5, 23, 30, tzinfo=UTC),
    ),
    incident=Incident(
        id="noaa-2026-mum-0604",
        source="NOAA (mock ground truth)",
        name="Oily-water trail in the Mumbai outer anchorage",
        location=LonLat(lon=72.78, lat=18.93),
        reported_at=datetime(2026, 9, 6, 4, 45, tzinfo=UTC),
        severity="minor",
        status="reported",
        substance="bilge water / lube oil",
        estimated_volume_bbl=35,
        description=(
            "Narrow reflective trail on the SAR quicklook aligned with the "
            "anchored-fleet grid. No structural-failure morphology. City beaches "
            "~18 km east."
        ),
    ),
    suspect_mmsi="477281900",
    tags=["bilge-discharge", "anchorage", "night", "recurrent"],
)

_BOMBAY_HIGH = Scenario(
    id="bombay-high-microleak",
    name="Bombay High platform micro-leak",
    summary=(
        "A faint, repeatedly-imaged 3–5 km sheen tethered to a wellhead platform "
        "in the Bombay High field — a slow flowline weep rather than a discrete "
        "release."
    ),
    aoi=BBox(west=71.20, south=19.35, east=71.85, north=19.95),
    origin_hint=LonLat(lon=71.52, lat=19.63),
    slick_offset_km=(3.0, 1.0),
    sar_pass_at=datetime(2026, 9, 1, 6, 3, tzinfo=UTC),
    release_window=(
        datetime(2026, 8, 31, 12, 0, tzinfo=UTC),
        datetime(2026, 9, 1, 6, 0, tzinfo=UTC),
    ),
    incident=Incident(
        id="noaa-2026-bh-0428",
        source="NOAA (mock ground truth)",
        name="Persistent sheen at a Bombay High wellhead",
        location=LonLat(lon=71.52, lat=19.63),
        reported_at=datetime(2026, 9, 1, 9, 0, tzinfo=UTC),
        severity="minor",
        status="confirmed",
        substance="crude oil (light)",
        estimated_volume_bbl=60,
        description=(
            "Sheen present on 5 of the last 7 Sentinel-1 passes, always anchored "
            "to the same platform. Consistent with a subsea flowline weep; "
            "operator notified for inspection."
        ),
    ),
    suspect_mmsi="419006200",
    tags=["micro-leak", "offshore-platform", "recurrent", "infrastructure"],
    timeline_profile={-12: 0.78, -6: 0.9, 0: 1.0, 6: 1.12, 12: 1.2},
)


# ---------------------------------------------------------------------------
# International replay scenarios — the pipeline is not region-specific; these
# exercise it in different current regimes, jurisdictions and spill types.
# ---------------------------------------------------------------------------

_NORTH_SEA = Scenario(
    id="north-sea-bunker-spill",
    name="North Sea bunkering spill",
    summary=(
        "A ~11 km band of heavy fuel oil across the Maas approaches traffic "
        "separation scheme, consistent with a hose failure during an offshore "
        "bunker transfer. Strong tidal streams are setting it toward the Dutch "
        "coast."
    ),
    aoi=BBox(west=3.30, south=52.00, east=4.10, north=52.70),
    origin_hint=LonLat(lon=3.66, lat=52.32),
    slick_offset_km=(6.0, 4.5),
    sar_pass_at=datetime(2026, 9, 8, 5, 52, tzinfo=UTC),
    release_window=(
        datetime(2026, 9, 7, 22, 0, tzinfo=UTC),
        datetime(2026, 9, 8, 3, 30, tzinfo=UTC),
    ),
    incident=Incident(
        id="cnsn-2026-ns-1187",
        source="EMSA CleanSeaNet (mock ground truth)",
        name="HFO band across the Maas approaches TSS",
        location=LonLat(lon=3.66, lat=52.32),
        reported_at=datetime(2026, 9, 8, 7, 10, tzinfo=UTC),
        severity="moderate",
        status="confirmed",
        substance="heavy fuel oil (IFO 380)",
        estimated_volume_bbl=310,
        description=(
            "CleanSeaNet alert on the 05:52 Sentinel-1 pass; Netherlands "
            "Coastguard aircraft confirmed a continuous slick. Rotterdam "
            "approaches ~28 km ENE."
        ),
    ),
    suspect_mmsi="636020341",
    tags=["bunker-transfer", "TSS", "tidal", "SAR-primary", "north-sea"],
    timeline_profile={-9: 0.4, -3: 0.82, 0: 1.0, 6: 1.35, 12: 1.7},
)

_GULF_MEXICO = Scenario(
    id="gulf-mexico-flowline",
    name="Gulf of Mexico flowline rupture",
    summary=(
        "A ~17 km crude slick anchored to a subsea flowline corridor off the "
        "Mississippi Delta. Timing lines up with a laden tanker that dragged "
        "anchor across the right-of-way overnight during a squall."
    ),
    aoi=BBox(west=-89.75, south=28.30, east=-88.85, north=29.05),
    origin_hint=LonLat(lon=-89.28, lat=28.66),
    slick_offset_km=(11.0, -3.0),
    sar_pass_at=datetime(2026, 9, 9, 0, 12, tzinfo=UTC),
    release_window=(
        datetime(2026, 9, 8, 12, 30, tzinfo=UTC),
        datetime(2026, 9, 8, 20, 30, tzinfo=UTC),
    ),
    incident=Incident(
        id="nrc-2026-1402233",
        source="NOAA / USCG NRC (mock ground truth)",
        name="Crude slick over a Delta flowline corridor",
        location=LonLat(lon=-89.28, lat=28.66),
        reported_at=datetime(2026, 9, 9, 3, 40, tzinfo=UTC),
        severity="major",
        status="responding",
        substance="crude oil (medium sour)",
        estimated_volume_bbl=1900,
        description=(
            "Persistent sheen with a bright central band on consecutive "
            "Sentinel-1 passes, co-located with a pipeline right-of-way. USCG "
            "Sector New Orleans coordinating response; barrier islands ~24 km NW."
        ),
    ),
    suspect_mmsi="538008914",
    tags=["anchor-drag", "pipeline-corridor", "storm", "gulf-of-mexico"],
    timeline_profile={-18: 0.5, -6: 0.78, 0: 1.0, 6: 1.22, 18: 1.55},
)

_SICILY_BILGE = Scenario(
    id="sicily-strait-bilge",
    name="Sicily Strait night bilge dumping",
    summary=(
        "A pin-straight ~22 km oily-water trail across the Malta–Sicily channel, "
        "the classic signature of a vessel de-slopping its bilge on passage. "
        "Aligned with the eastbound Gibraltar–Suez transit lane."
    ),
    aoi=BBox(west=13.40, south=35.10, east=14.35, north=35.95),
    origin_hint=LonLat(lon=13.92, lat=35.58),
    slick_offset_km=(9.0, -2.0),
    sar_pass_at=datetime(2026, 9, 7, 4, 38, tzinfo=UTC),
    release_window=(
        datetime(2026, 9, 6, 23, 30, tzinfo=UTC),
        datetime(2026, 9, 7, 3, 45, tzinfo=UTC),
    ),
    incident=Incident(
        id="rempec-2026-med-0642",
        source="REMPEC / EMSA CleanSeaNet (mock ground truth)",
        name="Linear oily-water trail, Malta–Sicily channel",
        location=LonLat(lon=13.92, lat=35.58),
        reported_at=datetime(2026, 9, 7, 6, 15, tzinfo=UTC),
        severity="moderate",
        status="reported",
        substance="bilge water / waste oil",
        estimated_volume_bbl=90,
        description=(
            "Narrow, unusually straight slick ~40 km long on the 04:38 pass, no "
            "structural-failure morphology, coincident with the eastbound transit "
            "lane. Italian Coast Guard requested an overflight."
        ),
    ),
    suspect_mmsi="356789000",
    tags=["bilge-discharge", "transit-lane", "night", "mediterranean", "enforcement"],
    timeline_profile={-6: 0.55, 0: 1.0, 6: 1.28, 12: 1.5, 24: 1.72},
)


SCENARIOS: dict[str, Scenario] = {
    s.id: s
    for s in (
        _ARABIAN_SEA,
        _KUTCH_BUNKER,
        _MUMBAI_BILGE,
        _BOMBAY_HIGH,
        _NORTH_SEA,
        _GULF_MEXICO,
        _SICILY_BILGE,
    )
}
DEFAULT_SCENARIO_ID = _ARABIAN_SEA.id


def get_scenario(scenario_id: str | None) -> Scenario:
    return SCENARIOS[scenario_id or DEFAULT_SCENARIO_ID]
