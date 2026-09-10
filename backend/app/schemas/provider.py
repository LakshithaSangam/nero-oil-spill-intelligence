"""Contracts describing data providers themselves (for the /providers screen)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ProviderDomain = Literal["imagery", "incidents", "oceanography", "ais"]
HealthState = Literal["ok", "degraded", "unavailable", "mock"]


class ProviderHealth(BaseModel):
    state: HealthState
    checked_at: datetime
    latency_ms: float | None = None
    detail: str = ""


class ProviderInfo(BaseModel):
    id: str
    domain: ProviderDomain
    display_name: str
    is_mock: bool
    is_active: bool
    docs_url: str | None = None
    capabilities: dict[str, object] = Field(default_factory=dict)
    health: ProviderHealth | None = None


class ProviderRegistrySnapshot(BaseModel):
    selection: dict[str, str]
    providers: list[ProviderInfo]
