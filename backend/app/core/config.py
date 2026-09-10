"""Runtime configuration, sourced from environment / .env.

The only place provider selection is resolved. Nothing in the AI pipeline reads env
directly — it asks the provider registry, which consults these settings.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = str


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- runtime ----
    env: Literal["local", "staging", "production"] = "local"
    log_level: str = "INFO"
    # Kept as a plain string so pydantic-settings does not force JSON parsing; read
    # the parsed form via ``cors_origin_list``. Accepts "a,b,c" or a JSON array.
    cors_origins: str = "http://localhost:3000"
    # Optional regex for allowed origins, applied in every env. Handy for Vercel,
    # whose preview deployments each get a fresh *.vercel.app hostname, e.g.
    #   CORS_ORIGIN_REGEX=https://.*\.vercel\.app
    cors_origin_regex: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw.startswith("["):
            return list(json.loads(raw))
        return [item.strip() for item in raw.split(",") if item.strip()]

    # ---- database ----
    database_url: str = "postgresql+asyncpg://neuro:neuro@localhost:5432/neuro"

    # ---- data provider selection ----
    imagery_provider: ProviderName = "mock"
    incident_provider: ProviderName = "mock"
    oceanography_provider: ProviderName = "mock"
    ais_provider: ProviderName = "mock"

    # ---- detection segmentation model ----
    # "mock"          deterministic scenario slick
    # "classical-sar" dark-spot detection on the real Sentinel-1 quicklook
    # "trained-unet"  a trained U-Net checkpoint (needs SEGMENTATION_WEIGHTS)
    # non-mock models fall back to "mock" when they produce nothing.
    segmentation_model: Literal["mock", "classical-sar", "trained-unet"] = "mock"
    # path to the .pt for "trained-unet"; defaults to the repo checkpoint if present
    segmentation_weights: str | None = "weights/oilspill_unet.pt"
    # where this API is reachable from itself — the mock imagery provider serves a
    # synthetic Sentinel-1 quicklook here so the CV / CNN segmenters have real pixels
    public_base_url: str = "http://localhost:8000"

    # ---- provider caches ----
    marinecadastre_cache_dir: str = ".cache/marinecadastre"  # daily AIS zips land here

    # ---- real provider credentials (optional) ----
    # Copernicus Data Space: either an account (password grant, "cdse-public" client)
    # or a registered OAuth client (client-credentials grant).
    copernicus_username: str | None = None
    copernicus_password: str | None = None
    copernicus_client_id: str | None = None
    copernicus_client_secret: str | None = None
    sentinelhub_client_id: str | None = None
    sentinelhub_client_secret: str | None = None
    earthdata_token: str | None = None
    cmems_username: str | None = None
    cmems_password: str | None = None
    ais_api_key: str | None = None

    @property
    def provider_selection(self) -> dict[str, str]:
        return {
            "imagery": self.imagery_provider,
            "incidents": self.incident_provider,
            "oceanography": self.oceanography_provider,
            "ais": self.ais_provider,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
