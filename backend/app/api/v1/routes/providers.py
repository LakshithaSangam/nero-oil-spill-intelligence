from __future__ import annotations

from fastapi import APIRouter

from app.providers.registry import registry
from app.schemas.provider import ProviderRegistrySnapshot

router = APIRouter()


@router.get("", response_model=ProviderRegistrySnapshot)
async def list_providers() -> ProviderRegistrySnapshot:
    """Every registered provider across all four domains, with live health and the
    currently active selection. Backs the dashboard's 'Data Providers' screen."""
    return await registry.snapshot()
