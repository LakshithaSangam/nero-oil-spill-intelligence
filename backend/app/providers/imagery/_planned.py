"""Shared base for imagery providers whose real clients land in milestone M∞.

Keeps the folder structure aligned with ARCHITECTURE.md while making it explicit,
via /providers health, that these are not yet wired to live data.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.providers.base import BaseProvider
from app.schemas.imagery import RasterTile, SceneRef, SceneSearchRequest
from app.schemas.provider import ProviderHealth


class PlannedImageryProvider(BaseProvider):
    domain = "imagery"
    is_mock = False
    required_env: tuple[str, ...] = ()

    async def health(self) -> ProviderHealth:
        from app.core.config import get_settings

        s = get_settings()
        missing = [k for k in self.required_env if not getattr(s, k.lower(), None)]
        return ProviderHealth(
            state="unavailable",
            checked_at=datetime.now(UTC),
            detail=(f"missing env: {', '.join(missing)}" if missing
                    else "credentials present; client planned for M∞"),
        )

    async def search(self, request: SceneSearchRequest) -> list[SceneRef]:  # pragma: no cover
        raise NotImplementedError(f"{self.display_name} client is planned for milestone M∞")

    async def fetch_scene(self, scene_id: str) -> RasterTile:  # pragma: no cover
        raise NotImplementedError(f"{self.display_name} client is planned for milestone M∞")
