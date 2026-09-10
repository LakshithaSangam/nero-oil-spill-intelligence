"""Copernicus Data Space Ecosystem — real PRIMARY imagery provider.

https://dataspace.copernicus.eu/  ·  Sentinel-1 SAR (primary), Sentinel-2 EO (validation)

* **search** hits the public OData catalogue (no auth) — real Sentinel-1 GRD /
  Sentinel-2 L2A acquisitions intersecting the AOI + window, with footprints,
  polarisations, cloud cover and (when present) a quicklook link.
* **fetch_scene** resolves one product by id and returns a ``RasterTile`` whose
  ``href`` is the product ``$value`` download endpoint (a bearer token is required to
  actually retrieve it — see ``_cdse_auth``).

Pixel-level oil detection still runs on the scenario mock; this provider supplies the
real scene *identity* the detection / historical-timeline / EO-validation steps hang
off. ``health`` reports ``degraded`` when the catalogue is reachable but no download
credentials are configured.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

import httpx

from app.core.logging import get_logger
from app.providers._http import get_json
from app.providers.base import BaseProvider
from app.providers.imagery._cdse_auth import CdseAuthError, credentials_configured, get_token
from app.schemas.common import BBox
from app.schemas.imagery import Polarisation, RasterTile, SceneRef, SceneSearchRequest
from app.schemas.provider import ProviderHealth

log = get_logger(__name__)

_ODATA = "https://catalogue.dataspace.copernicus.eu/odata/v1"
_DOWNLOAD = "https://download.dataspace.copernicus.eu/odata/v1"

_COLLECTION = {
    "sentinel-1-sar": "SENTINEL-1",
    "generic-sar": "SENTINEL-1",
    "sentinel-2-eo": "SENTINEL-2",
    "generic-optical": "SENTINEL-2",
}


class CopernicusDataSpaceImagery(BaseProvider):
    id = "copernicus-dataspace"
    domain = "imagery"
    display_name = "Copernicus Data Space Ecosystem"
    is_mock = False
    docs_url = "https://dataspace.copernicus.eu/"

    def capabilities(self) -> dict[str, object]:
        return {
            "sensors": ["sentinel-1-sar", "sentinel-2-eo"],
            "resolution_m": 10,
            "revisit_days": 6,
            "all_weather": True,
            "night_capable": True,
            "latency_hours": 3,
            "role": "primary",
            "catalogue": "public OData; token needed only for download",
        }

    async def health(self) -> ProviderHealth:
        now = datetime.now(UTC)
        started = time.perf_counter()
        try:
            await get_json(
                f"{_ODATA}/Products",
                params={"$filter": "Collection/Name eq 'SENTINEL-1'", "$top": "1"},
            )
        except httpx.HTTPError as exc:
            return ProviderHealth(state="unavailable", checked_at=now,
                                  detail=f"CDSE catalogue unreachable: {exc.__class__.__name__}")
        latency = round((time.perf_counter() - started) * 1000, 1)

        if not credentials_configured():
            return ProviderHealth(
                state="degraded", checked_at=now, latency_ms=latency,
                detail="catalogue search OK; set COPERNICUS_USERNAME/PASSWORD to fetch scenes",
            )
        try:
            await get_token()
        except CdseAuthError as exc:
            return ProviderHealth(state="degraded", checked_at=now, latency_ms=latency,
                                  detail=f"catalogue OK; auth failed: {str(exc)[:140]}")
        return ProviderHealth(state="ok", checked_at=now, latency_ms=latency,
                              detail="catalogue + download authenticated")

    async def search(self, request: SceneSearchRequest) -> list[SceneRef]:
        collection = _COLLECTION.get(request.sensor, "SENTINEL-1")
        b = request.bbox
        ring = (
            f"{b.west} {b.south},{b.east} {b.south},{b.east} {b.north},"
            f"{b.west} {b.north},{b.west} {b.south}"
        )
        clauses = [
            f"Collection/Name eq '{collection}'",
            f"OData.CSC.Intersects(area=geography'SRID=4326;POLYGON(({ring}))')",
            f"ContentDate/Start gt {_odata_dt(request.start)}",
            f"ContentDate/Start lt {_odata_dt(request.end)}",
        ]
        if collection == "SENTINEL-1":
            clauses.append("contains(Name,'GRD')")
            clauses.append("not contains(Name,'_COG')")
        else:
            clauses.append("contains(Name,'MSIL2A')")

        params = {
            "$filter": " and ".join(clauses),
            "$orderby": "ContentDate/Start desc",
            "$top": str(request.max_results),
            "$expand": "Attributes",  # this endpoint rejects multi-value $expand
        }
        payload = await get_json(f"{_ODATA}/Products", params=params)
        return [
            ref for p in payload.get("value", [])
            if (ref := _to_scene_ref(p, self.id, request.sensor)) is not None
        ]

    async def fetch_scene(self, scene_id: str) -> RasterTile:
        try:
            product = await get_json(
                f"{_ODATA}/Products({scene_id})", params={"$expand": "Assets"}
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise FileNotFoundError(f"CDSE product {scene_id} not found") from exc
            raise

        bbox = _footprint_bbox(product) or BBox(west=-1, south=-1, east=1, north=1)
        name = str(product.get("Name", scene_id))
        span_km = max((bbox.east - bbox.west), (bbox.north - bbox.south)) * 111.0
        px = max(1, int(span_km * 1000 / 10))  # ~10 m GSD estimate

        quicklook = _quicklook_url(product)
        return RasterTile(
            scene_id=scene_id,
            bbox=bbox,
            width=px,
            height=px,
            href=quicklook or f"{_DOWNLOAD}/Products({scene_id})/$value",
            format="png" if quicklook else "geotiff",
            band_description=f"{name} · {_pol_from_name(name)}",
        )


# ---- parsing helpers --------------------------------------------------------


def _odata_dt(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _attrs(product: dict) -> dict[str, object]:
    return {a["Name"]: a.get("Value") for a in product.get("Attributes", []) if "Name" in a}


def _footprint_bbox(product: dict) -> BBox | None:
    geo = product.get("GeoFootprint") or {}
    coords = geo.get("coordinates")
    if not coords:
        return None
    # Polygon -> [[[lon,lat],...]] ; MultiPolygon -> one level deeper
    ring = coords[0]
    if ring and isinstance(ring[0][0], list):
        ring = ring[0]
    lons = [pt[0] for pt in ring]
    lats = [pt[1] for pt in ring]
    try:
        return BBox(west=min(lons), south=min(lats), east=max(lons), north=max(lats))
    except Exception:  # noqa: BLE001 — degenerate footprint, skip it
        return None


def _quicklook_url(product: dict) -> str | None:
    for asset in product.get("Assets", []) or []:
        if str(asset.get("Type", "")).upper() == "QUICKLOOK" and asset.get("DownloadLink"):
            return str(asset["DownloadLink"])
    return None


# Sentinel-1 SAFE names encode polarisation as the 4-char class token 1S{S|D}{V|H}:
# S=single / D=dual, V=VV(+VH) / H=HH(+HV).
_POL_CODE = {"1SSV": "VV", "1SDV": "VV+VH", "1SSH": "HH", "1SDH": "HH+HV"}


def _pol_from_name(name: str) -> str:
    for code, label in _POL_CODE.items():
        if code in name:
            return label
    return "n/a"


def _to_scene_ref(product: dict, provider_id: str, sensor: str) -> SceneRef | None:
    pid = product.get("Id")
    start = (product.get("ContentDate") or {}).get("Start")
    bbox = _footprint_bbox(product)
    if not (pid and start and bbox):
        return None
    attrs = _attrs(product)

    pols: list[Polarisation] = []
    for token in str(attrs.get("polarisationChannels", "")).split("&"):
        token = token.strip().upper()
        if token in ("VV", "VH", "HH", "HV"):
            pols.append(token)  # type: ignore[arg-type]

    cloud = attrs.get("cloudCover")
    return SceneRef(
        id=str(pid),
        provider_id=provider_id,
        sensor=sensor,  # type: ignore[arg-type]
        acquired_at=datetime.fromisoformat(str(start).replace("Z", "+00:00")),
        bbox=bbox,
        polarisations=pols,
        cloud_cover_pct=float(cloud) if isinstance(cloud, int | float) else None,
        preview_url=_quicklook_url(product),
    )
