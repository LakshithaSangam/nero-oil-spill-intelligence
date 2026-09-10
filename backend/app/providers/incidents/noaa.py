"""NOAA IncidentNews — real ground-truth incident provider.

https://incidentnews.noaa.gov/  ·  keyless Atom feed of incidents the NOAA Office of
Response and Restoration has been called out to (oil / chemical spills, sunken
vessels, sheens). The feed carries the ~10 most recent incidents with a georss
point, published date and an HTML summary — US-centric and shallow, but real.

Scoped honestly: this is "recent NOAA-responded incidents", not a full historical
archive. Pair it with the scenario mock via the ``hybrid`` incidents provider.
"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import UTC, datetime

import httpx

from app.core.logging import get_logger
from app.providers._http import http_client
from app.providers.base import BaseProvider
from app.schemas.common import LonLat
from app.schemas.incidents import Incident, IncidentQuery
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)

_FEED_URL = "https://incidentnews.noaa.gov/incidents.atom"
_ATOM = "{http://www.w3.org/2005/Atom}"
_GEORSS = "{http://www.georss.org/georss}"
_TAG_RE = re.compile(r"<[^>]+>")

_CACHE_TTL_S = 600.0
_cache: tuple[float, list[Incident]] | None = None


class NoaaIncidentProvider(BaseProvider):
    id = "noaa"
    domain = "incidents"
    display_name = "NOAA IncidentNews"
    is_mock = False
    docs_url = "https://incidentnews.noaa.gov/"

    def capabilities(self) -> dict[str, object]:
        return {
            "coverage": "recent NOAA OR&R responses (US-centric)",
            "feed": "Atom, ~10 most recent",
            "fields": ["name", "location", "reported_at", "summary"],
            "api_key_required": False,
        }

    async def health(self) -> ProviderHealth:
        now = datetime.now(UTC)
        started = time.perf_counter()
        try:
            async with http_client() as client:
                resp = await client.get(_FEED_URL)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            return ProviderHealth(state="unavailable", checked_at=now,
                                  detail=f"IncidentNews feed unreachable: {exc.__class__.__name__}")
        return ProviderHealth(
            state="ok", checked_at=now,
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
            detail="Atom feed reachable",
        )

    async def _incidents(self) -> list[Incident]:
        global _cache
        if _cache is not None and time.monotonic() - _cache[0] < _CACHE_TTL_S:
            return _cache[1]
        async with http_client() as client:
            resp = await client.get(_FEED_URL)
        resp.raise_for_status()
        incidents = _parse_feed(resp.text)
        _cache = (time.monotonic(), incidents)
        return incidents

    async def query(self, q: IncidentQuery) -> list[Incident]:
        out = await self._incidents()
        if q.bbox:
            b = q.bbox
            out = [i for i in out
                   if b.west <= i.location.lon <= b.east and b.south <= i.location.lat <= b.north]
        if q.start:
            out = [i for i in out if i.reported_at >= q.start]
        if q.end:
            out = [i for i in out if i.reported_at <= q.end]
        if q.severity:
            out = [i for i in out if i.severity == q.severity]
        return out[: q.limit]

    async def get(self, incident_id: str) -> Incident | None:
        return next((i for i in await self._incidents() if i.id == incident_id), None)


def _parse_feed(xml: str) -> list[Incident]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:  # pragma: no cover - malformed upstream
        log.warning("IncidentNews feed did not parse: %s", exc)
        return []

    incidents: list[Incident] = []
    for entry in root.findall(f"{_ATOM}entry"):
        link_el = entry.find(f"{_ATOM}link")
        href = link_el.get("href") if link_el is not None else None
        point_el = entry.findtext(f"{_GEORSS}point")
        if not href or not point_el:
            continue
        try:
            lat_s, lon_s = point_el.split()
            location = LonLat(lon=float(lon_s), lat=float(lat_s))
        except (ValueError, TypeError):
            continue

        slug = href.rstrip("/").rsplit("/", 1)[-1]
        published = entry.findtext(f"{_ATOM}published") or entry.findtext(f"{_ATOM}updated")
        summary = _TAG_RE.sub("", entry.findtext(f"{_ATOM}summary") or "").strip()
        incidents.append(Incident(
            id=f"noaa-incidentnews-{slug}",
            source="NOAA IncidentNews",
            name=(entry.findtext(f"{_ATOM}title") or f"NOAA incident {slug}").strip(),
            location=location,
            reported_at=_parse_dt(published),
            severity="unknown",
            status="reported",
            description=summary[:1000],
            external_url=href,
        ))
    return incidents


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(UTC)
