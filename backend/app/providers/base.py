"""Common provider surface shared by every domain."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol, runtime_checkable

from app.schemas.provider import ProviderDomain, ProviderHealth


@runtime_checkable
class DataProvider(Protocol):
    """Every provider — mock or real — satisfies this."""

    id: str
    domain: ProviderDomain
    display_name: str
    is_mock: bool
    docs_url: str | None

    async def health(self) -> ProviderHealth: ...

    def capabilities(self) -> dict[str, object]: ...


class BaseProvider:
    """Convenience base with a default health check. Concrete providers may override."""

    id: str = "base"
    domain: ProviderDomain = "imagery"
    display_name: str = "Base Provider"
    is_mock: bool = False
    docs_url: str | None = None

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            state="mock" if self.is_mock else "ok",
            checked_at=datetime.now(UTC),
            detail="mock provider, synthetic data" if self.is_mock else "reachable",
        )

    def capabilities(self) -> dict[str, object]:
        return {}
