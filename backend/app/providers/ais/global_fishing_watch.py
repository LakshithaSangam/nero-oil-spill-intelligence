"""Global Fishing Watch — real AIS provider.

https://globalfishingwatch.org/our-apis/  ·  auth: ``AIS_API_KEY`` (bearer JWT)
Base: ``https://gateway.api.globalfishingwatch.org/v3``

GFW's public API does not expose raw position tracks, so ``tracks`` is built from the
**4wings presence report** (``POST /4wings/report``, ``group-by=VESSEL_ID``,
``temporal-resolution=HOURLY``): one coarse hourly position per vessel per cell it was
seen in, inside the query bbox + window. AIS gaps are inferred from hour-to-hour
discontinuities in that series. ``vessel`` uses ``GET /vessels/search``.

Good enough for source attribution — the investigation module ranks on presence near
the origin during the release window and on AIS-gap behaviour, both of which this
carries. It will not reproduce minute-resolution manoeuvres.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers._http import http_client, request_json
from app.providers.base import BaseProvider
from app.schemas.ais import AISPosition, AISQuery, VesselStaticInfo, VesselTrack
from app.schemas.common import LonLat
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)

_BASE = "https://gateway.api.globalfishingwatch.org/v3"
_IDENTITY_DS = "public-global-vessel-identity:latest"
_PRESENCE_DS = "public-global-presence:latest"

_MAX_VESSELS = 60
_GAP_HOURS = 3.0  # a jump this large in the hourly presence series counts as an AIS gap

_GEARTYPE_MAP = {
    "TANKER": "tanker",
    "CARGO": "cargo",
    "CARGO_VESSEL": "cargo",
    "BULK_CARRIER": "bulk-carrier",
    "CONTAINER_REEFER": "container",
    "CONTAINER": "container",
    "FISHING": "fishing",
    "TUG": "tug",
    "PASSENGER": "passenger",
    "SUPPLY_VESSEL": "offshore",
    "SEISMIC_VESSEL": "offshore",
    "OTHER": "other",
}


class GlobalFishingWatchAISProvider(BaseProvider):
    id = "global-fishing-watch"
    domain = "ais"
    display_name = "Global Fishing Watch"
    is_mock = False
    docs_url = "https://globalfishingwatch.org/our-apis/"

    def capabilities(self) -> dict[str, object]:
        return {
            "resolution": "hourly presence cells (no raw tracks on the public API)",
            "identity": "AIS + 40+ vessel registries",
            "events": "gaps inferred from presence discontinuity",
            "api_key_required": True,
        }

    def _key(self) -> str:
        key = get_settings().ais_api_key
        if not key:
            raise RuntimeError("AIS_API_KEY not set")
        return key

    def _client(self) -> httpx.AsyncClient:
        return http_client(headers={"Authorization": f"Bearer {self._key()}"})

    async def health(self) -> ProviderHealth:
        now = datetime.now(UTC)
        try:
            key = self._key()
        except RuntimeError as exc:
            return ProviderHealth(state="unavailable", checked_at=now, detail=str(exc))
        started = time.perf_counter()
        try:
            async with http_client(headers={"Authorization": f"Bearer {key}"}) as c:
                await request_json(
                    "GET", f"{_BASE}/vessels/search", client=c,
                    params={"query": "test", "datasets[0]": _IDENTITY_DS, "limit": 1},
                )
        except httpx.HTTPStatusError as exc:
            state = "unavailable" if exc.response.status_code in (401, 403) else "degraded"
            return ProviderHealth(state=state, checked_at=now,
                                  detail=f"GFW {exc.response.status_code}: {exc.response.text[:120]}")
        except httpx.HTTPError as exc:
            return ProviderHealth(state="degraded", checked_at=now,
                                  detail=f"GFW unreachable: {exc.__class__.__name__}")
        return ProviderHealth(state="ok", checked_at=now,
                              latency_ms=round((time.perf_counter() - started) * 1000, 1),
                              detail="authenticated")

    async def tracks(self, q: AISQuery) -> list[VesselTrack]:
        self._key()
        b = q.bbox
        geojson = {
            "type": "Polygon",
            "coordinates": [[
                [b.west, b.south], [b.east, b.south], [b.east, b.north],
                [b.west, b.north], [b.west, b.south],
            ]],
        }
        params = {
            "datasets[0]": _PRESENCE_DS,
            "date-range": f"{q.start.date().isoformat()},{(q.end + timedelta(days=1)).date().isoformat()}",
            "spatial-resolution": "HIGH",
            "temporal-resolution": "HOURLY",
            "group-by": "VESSEL_ID",
            "format": "JSON",
        }
        async with self._client() as c:
            payload = await request_json(
                "POST", f"{_BASE}/4wings/report", client=c, params=params, json={"geojson": geojson}
            )

        rows = _report_rows(payload)
        by_vessel: dict[str, list[dict]] = {}
        for row in rows:
            vid = str(row.get("vesselId") or row.get("mmsi") or "")
            if vid:
                by_vessel.setdefault(vid, []).append(row)

        tracks: list[VesselTrack] = []
        for vid, vrows in by_vessel.items():
            positions = _positions(vrows, q.start, q.end)
            if not positions:
                continue
            gaps = _gap_intervals(positions)
            tracks.append(VesselTrack(
                vessel=_static_from_row(vrows[0], vid),
                positions=positions,
                has_gaps=bool(gaps),
                gap_intervals=gaps,
            ))
        tracks.sort(key=lambda t: len(t.positions), reverse=True)
        return tracks[:_MAX_VESSELS]

    async def vessel(self, mmsi: str) -> VesselStaticInfo | None:
        try:
            self._key()
        except RuntimeError:
            return None
        async with self._client() as c:
            payload = await request_json(
                "GET", f"{_BASE}/vessels/search", client=c,
                params={"query": mmsi, "datasets[0]": _IDENTITY_DS, "limit": 1},
            )
        entries = payload.get("entries") or []
        if not entries:
            return None
        return _static_from_identity(entries[0], fallback_mmsi=mmsi)

    async def fleet(self) -> list[VesselStaticInfo]:
        return []  # GFW has no bounded fleet; the risk index falls back to live suspicion


# ---- parsing ---------------------------------------------------------------


def _report_rows(payload: object) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    entries = payload.get("entries") or []
    rows: list[dict] = []
    for block in entries:
        if isinstance(block, dict):
            for value in block.values():
                if isinstance(value, list):
                    rows.extend(r for r in value if isinstance(r, dict))
    return rows


def _row_time(row: dict) -> datetime | None:
    raw = row.get("entryTimestamp") or row.get("date")
    if not raw:
        return None
    text = str(raw).replace("Z", "+00:00")
    for candidate in (text, text.replace(" ", "T")):
        try:
            dt = datetime.fromisoformat(candidate)
            return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _positions(rows: list[dict], start: datetime, end: datetime) -> list[AISPosition]:
    """One position per hour: the centroid of every presence cell the vessel hit that hour."""
    buckets: dict[datetime, list[tuple[float, float]]] = {}
    for row in rows:
        t = _row_time(row)
        lat, lon = row.get("lat"), row.get("lon")
        if t is None or lat is None or lon is None:
            continue
        if not (start - timedelta(hours=1) <= t <= end + timedelta(hours=1)):
            continue
        hour = t.replace(minute=0, second=0, microsecond=0)
        buckets.setdefault(hour, []).append((float(lon), float(lat)))

    out: list[AISPosition] = []
    for hour in sorted(buckets):
        pts = buckets[hour]
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out.append(AISPosition(time=hour, position=LonLat(lon=round(lon, 4), lat=round(lat, 4))))
    return out


def _gap_intervals(positions: list[AISPosition]) -> list[tuple[datetime, datetime]]:
    gaps: list[tuple[datetime, datetime]] = []
    for a, b in zip(positions, positions[1:], strict=False):
        if (b.time - a.time).total_seconds() / 3600.0 > _GAP_HOURS:
            gaps.append((a.time, b.time))
    return gaps


def _vessel_type(value: object) -> str:
    return _GEARTYPE_MAP.get(str(value or "").upper(), "unknown")


def _static_from_row(row: dict, vid: str) -> VesselStaticInfo:
    return VesselStaticInfo(
        mmsi=str(row.get("mmsi") or vid),
        imo=str(row["imo"]) if row.get("imo") else None,
        name=row.get("shipName") or row.get("shipname"),
        call_sign=row.get("callsign"),
        vessel_type=_vessel_type(row.get("vesselType") or row.get("geartype")),
        flag_state=row.get("flag"),
    )


def _static_from_identity(entry: dict, *, fallback_mmsi: str) -> VesselStaticInfo:
    self_reported = (entry.get("selfReportedInfo") or [{}])[0]
    combined = (entry.get("combinedSourcesInfo") or [{}])[0]
    shiptype = None
    for coll in ("shiptypes", "geartypes"):
        items = combined.get(coll) or []
        if items:
            shiptype = items[0].get("name")
            break
    return VesselStaticInfo(
        mmsi=str(self_reported.get("ssvid") or fallback_mmsi),
        imo=str(self_reported["imo"]) if self_reported.get("imo") else None,
        name=self_reported.get("shipname"),
        call_sign=self_reported.get("callsign"),
        vessel_type=_vessel_type(shiptype),
        flag_state=self_reported.get("flag"),
    )
