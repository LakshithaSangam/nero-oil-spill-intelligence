"""MarineCadastre — real US AIS from the NOAA/BOEM daily bulk archive.

https://marinecadastre.gov/accessais/  ·  no key.
``https://coast.noaa.gov/htdata/CMSP/AISDataHandler/<yyyy>/AIS_<yyyy>_<mm>_<dd>.zip``
— one ~300 MB zip per day, a single CSV inside with per-message positions.

Unlike Global Fishing Watch this gives true message-resolution tracks. But coverage
is **US waters only** and publication lags months, so for the Arabian Sea replay
scenario ``tracks()`` returns nothing — it is a regional alternative, not a drop-in.
Downloaded days are cached under ``MARINECADASTRE_CACHE_DIR``; the first query for a
date pays the download.
"""

from __future__ import annotations

import asyncio
import csv
import io
import zipfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers._http import http_client
from app.providers.base import BaseProvider
from app.schemas.ais import AISPosition, AISQuery, VesselStaticInfo, VesselTrack
from app.schemas.common import LonLat
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)

_BASE = "https://coast.noaa.gov/htdata/CMSP/AISDataHandler"
_MAX_DAYS = 4
_MAX_VESSELS = 80
_GAP_MINUTES = 45.0


def _ship_type(code: str) -> str:
    try:
        n = int(float(code))
    except (TypeError, ValueError):
        return "unknown"
    if n in (30, 1001, 1002):
        return "fishing"
    if n in (31, 32, 52):
        return "tug"
    if 60 <= n <= 69:
        return "passenger"
    if 70 <= n <= 79:
        return "cargo"
    if 80 <= n <= 89:
        return "tanker"
    if n in (35, 51):
        return "military"
    if n == 36 or n == 37:
        return "pleasure"
    return "other" if n else "unknown"


class MarineCadastreAISProvider(BaseProvider):
    id = "marine-cadastre"
    domain = "ais"
    display_name = "MarineCadastre (US AIS archive)"
    is_mock = False
    docs_url = "https://marinecadastre.gov/accessais/"

    def capabilities(self) -> dict[str, object]:
        return {
            "resolution": "per-message positions",
            "coverage": "US waters only",
            "latency": "published months in arrears",
            "granularity": "daily bulk zip (~300 MB, cached)",
            "api_key_required": False,
        }

    def _cache_dir(self) -> Path:
        d = Path(get_settings().marinecadastre_cache_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d

    async def health(self) -> ProviderHealth:
        now = datetime.now(UTC)
        probe = (now - timedelta(days=120)).date()
        url = f"{_BASE}/{probe.year}/AIS_{probe.year}_{probe.month:02d}_{probe.day:02d}.zip"
        try:
            async with http_client() as c:
                resp = await c.head(url)
        except httpx.HTTPError as exc:
            return ProviderHealth(state="degraded", checked_at=now,
                                  detail=f"archive unreachable: {exc.__class__.__name__}")
        state = "ok" if resp.status_code == 200 else "degraded"
        return ProviderHealth(state=state, checked_at=now,
                              detail=f"daily archive reachable (probe {probe}, {resp.status_code}); US only")

    async def tracks(self, q: AISQuery) -> list[VesselTrack]:
        days = _days(q.start.date(), q.end.date())
        paths: list[Path] = []
        for d in days:
            p = await self._ensure_day(d)
            if p is not None:
                paths.append(p)
        if not paths:
            log.info("marine-cadastre: no archive files for %s..%s (US only / not yet published)",
                     q.start.date(), q.end.date())
            return []
        return await asyncio.to_thread(_extract_tracks, paths, q)

    async def vessel(self, mmsi: str) -> VesselStaticInfo | None:
        for p in sorted(self._cache_dir().glob("AIS_*.zip"), reverse=True):
            info = await asyncio.to_thread(_scan_static, p, mmsi)
            if info is not None:
                return info
        return None

    async def fleet(self) -> list[VesselStaticInfo]:
        return []

    async def _ensure_day(self, d: date) -> Path | None:
        dest = self._cache_dir() / f"AIS_{d.year}_{d.month:02d}_{d.day:02d}.zip"
        if dest.exists() and dest.stat().st_size > 1024:
            return dest
        url = f"{_BASE}/{d.year}/AIS_{d.year}_{d.month:02d}_{d.day:02d}.zip"
        try:
            async with (
                http_client(timeout=httpx.Timeout(600.0, connect=15.0)) as c,
                c.stream("GET", url) as resp,
            ):
                if resp.status_code != 200:
                    return None
                tmp = dest.with_suffix(".part")
                with tmp.open("wb") as fh:
                    async for chunk in resp.aiter_bytes(1 << 20):
                        fh.write(chunk)
                tmp.replace(dest)
        except httpx.HTTPError as exc:
            log.warning("marine-cadastre: download %s failed (%s)", url, exc)
            return None
        return dest


# ---- blocking CSV work (worker thread) ------------------------------------


def _days(start: date, end: date) -> list[date]:
    out, cur = [], start
    while cur <= end and len(out) < _MAX_DAYS:
        out.append(cur)
        cur += timedelta(days=1)
    return out


def _open_csv(path: Path) -> io.TextIOWrapper:
    zf = zipfile.ZipFile(path)
    name = next((n for n in zf.namelist() if n.lower().endswith(".csv")), zf.namelist()[0])
    return io.TextIOWrapper(zf.open(name), encoding="utf-8", newline="")


def _parse_dt(raw: str) -> datetime | None:
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _extract_tracks(paths: list[Path], q: AISQuery) -> list[VesselTrack]:
    b = q.bbox
    by_mmsi: dict[str, dict] = {}
    for path in paths:
        with _open_csv(path) as fh:
            for row in csv.DictReader(fh):
                try:
                    lon, lat = float(row["LON"]), float(row["LAT"])
                except (KeyError, ValueError):
                    continue
                if not (b.west <= lon <= b.east and b.south <= lat <= b.north):
                    continue
                t = _parse_dt(row.get("BaseDateTime", ""))
                if t is None or not (q.start <= t <= q.end):
                    continue
                rec = by_mmsi.setdefault(row.get("MMSI", "?"), {"rows": [], "static": row})
                rec["rows"].append((t, lon, lat, row.get("SOG"), row.get("COG"), row.get("Heading")))

    tracks: list[VesselTrack] = []
    for mmsi, rec in by_mmsi.items():
        pts = sorted(rec["rows"], key=lambda r: r[0])
        positions = [
            AISPosition(
                time=t, position=LonLat(lon=lon, lat=lat),
                sog_kn=_num(sog), cog_deg=_deg(cog), heading_deg=_deg(hdg),
            )
            for t, lon, lat, sog, cog, hdg in pts
        ]
        if not positions:
            continue
        gaps = [
            (a.time, c.time)
            for a, c in zip(positions, positions[1:], strict=False)
            if (c.time - a.time).total_seconds() / 60.0 > _GAP_MINUTES
        ]
        tracks.append(VesselTrack(
            vessel=_static_from_row(rec["static"], mmsi),
            positions=positions, has_gaps=bool(gaps), gap_intervals=gaps,
        ))
    tracks.sort(key=lambda t: len(t.positions), reverse=True)
    return tracks[:_MAX_VESSELS]


def _scan_static(path: Path, mmsi: str) -> VesselStaticInfo | None:
    with _open_csv(path) as fh:
        for row in csv.DictReader(fh):
            if row.get("MMSI") == mmsi:
                return _static_from_row(row, mmsi)
    return None


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if f < 1000 else None


def _deg(v: object) -> float | None:
    f = _num(v)
    return f % 360 if f is not None and 0 <= f <= 720 else None


def _static_from_row(row: dict, mmsi: str) -> VesselStaticInfo:
    return VesselStaticInfo(
        mmsi=str(mmsi),
        imo=str(row["IMO"]).replace("IMO", "").strip() or None if row.get("IMO") else None,
        name=(row.get("VesselName") or "").strip() or None,
        call_sign=(row.get("CallSign") or "").strip() or None,
        vessel_type=_ship_type(row.get("VesselType", "")),
        length_m=_num(row.get("Length")),
        beam_m=_num(row.get("Width")),
    )
