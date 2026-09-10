"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.agents.bootstrap import bootstrap_agents
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.providers.bootstrap import bootstrap_providers

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    configure_logging()
    bootstrap_providers()
    bootstrap_agents()
    log.info("Nero backend %s ready", __version__)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Nero",
        version=__version__,
        summary="Maritime Oil Spill Intelligence Platform API",
        description=(
            "Detect, characterise, hindcast the origin, reconstruct AIS, rank suspects, "
            "forecast the drift, assess the environment, report. Every stage is an "
            "independent module behind a typed contract."
        ),
        lifespan=lifespan,
    )
    # In local dev, accept any localhost port so the Next dev server (whatever port it
    # lands on) can talk to the API. Staging/production use the explicit allowlist only.
    cors_kwargs: dict = {
        "allow_origins": settings.cors_origin_list,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if settings.env == "local":
        # localhost (any port) + Cloudflare quick-tunnel hostnames for demo hosting
        cors_kwargs["allow_origin_regex"] = (
            r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
            r"|https://[a-z0-9-]+\.trycloudflare\.com"
        )
    app.add_middleware(CORSMiddleware, **cors_kwargs)
    app.include_router(api_router, prefix="/v1")

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {"name": "Nero", "version": __version__, "docs": "/docs"}

    return app


app = create_app()
