"""The provider registry — the pipeline's only door to external data."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from app.core.logging import get_logger
from app.schemas.provider import (
    ProviderDomain,
    ProviderInfo,
    ProviderRegistrySnapshot,
)

if TYPE_CHECKING:
    from app.providers.base import DataProvider

log = get_logger(__name__)


class ProviderNotFound(KeyError):
    pass


class ProviderRegistry:
    def __init__(self) -> None:
        # domain -> {provider_id -> provider}
        self._providers: dict[str, dict[str, DataProvider]] = {}
        self._selection: dict[str, str] = {}

    # -- registration -------------------------------------------------------
    def register(self, provider: DataProvider) -> None:
        domain = provider.domain
        self._providers.setdefault(domain, {})[provider.id] = provider
        log.info("registered %s provider: %s%s", domain, provider.id,
                 " (mock)" if provider.is_mock else "")

    def set_selection(self, selection: dict[str, str]) -> None:
        self._selection.update(selection)

    # -- lookup -----------------------------------------------------------
    def get(self, domain: ProviderDomain, name: str | None = None) -> DataProvider:
        name = name or self._selection.get(domain, "mock")
        try:
            return self._providers[domain][name]
        except KeyError as exc:
            available = list(self._providers.get(domain, {}))
            raise ProviderNotFound(
                f"no '{name}' provider for domain '{domain}'. available: {available}"
            ) from exc

    def active(self, domain: ProviderDomain) -> DataProvider:
        return self.get(domain, self._selection.get(domain))

    def list_domain(self, domain: ProviderDomain) -> list[DataProvider]:
        return list(self._providers.get(domain, {}).values())

    # -- introspection --------------------------------------------------
    async def snapshot(self) -> ProviderRegistrySnapshot:
        infos: list[ProviderInfo] = []
        for domain, providers in self._providers.items():
            active_id = self._selection.get(domain, "mock")
            healths = await asyncio.gather(
                *(p.health() for p in providers.values()), return_exceptions=True
            )
            for provider, health in zip(providers.values(), healths, strict=True):
                infos.append(
                    ProviderInfo(
                        id=provider.id,
                        domain=domain,  # type: ignore[arg-type]
                        display_name=provider.display_name,
                        is_mock=provider.is_mock,
                        is_active=provider.id == active_id,
                        docs_url=provider.docs_url,
                        capabilities=provider.capabilities(),
                        health=health if not isinstance(health, BaseException) else None,
                    )
                )
        return ProviderRegistrySnapshot(selection=dict(self._selection), providers=infos)


registry = ProviderRegistry()
