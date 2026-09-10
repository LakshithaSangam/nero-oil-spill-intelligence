"""Imagery provider interface. Implemented by Copernicus Data Space, Sentinel Hub,
NASA Earthdata, USGS EarthExplorer — and the mock."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.providers.base import DataProvider
from app.schemas.imagery import RasterTile, SceneRef, SceneSearchRequest


@runtime_checkable
class ImageryProvider(DataProvider, Protocol):
    async def search(self, request: SceneSearchRequest) -> list[SceneRef]:
        """Return acquisitions intersecting the AOI + time range for the sensor."""
        ...

    async def fetch_scene(self, scene_id: str) -> RasterTile:
        """Materialise a scene as a displayable / analysable raster reference."""
        ...
