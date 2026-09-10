"""Copernicus Data Space Ecosystem OAuth2 — token acquisition + in-process cache.

CDSE issues bearer tokens from a Keycloak realm. Two grants are supported:

* **password** — ``COPERNICUS_USERNAME`` / ``COPERNICUS_PASSWORD`` against the
  built-in ``cdse-public`` client (no client registration needed).
* **client_credentials** — ``COPERNICUS_CLIENT_ID`` / ``COPERNICUS_CLIENT_SECRET``
  from a registered OAuth client.

Tokens last ~10 min; this caches the current one and refreshes ~30 s early. Only the
download / quicklook endpoints need a token — the OData catalogue search is public.
"""

from __future__ import annotations

import time

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers._http import http_client

log = get_logger(__name__)

_TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)
_PUBLIC_CLIENT = "cdse-public"

_cached_token: str | None = None
_cached_until: float = 0.0


class CdseAuthError(RuntimeError):
    pass


def credentials_configured() -> bool:
    s = get_settings()
    return bool((s.copernicus_username and s.copernicus_password)
                or (s.copernicus_client_id and s.copernicus_client_secret))


def _grant_body() -> dict[str, str]:
    s = get_settings()
    if s.copernicus_username and s.copernicus_password:
        return {
            "grant_type": "password",
            "client_id": _PUBLIC_CLIENT,
            "username": s.copernicus_username,
            "password": s.copernicus_password,
        }
    if s.copernicus_client_id and s.copernicus_client_secret:
        return {
            "grant_type": "client_credentials",
            "client_id": s.copernicus_client_id,
            "client_secret": s.copernicus_client_secret,
        }
    raise CdseAuthError(
        "no CDSE credentials — set COPERNICUS_USERNAME/PASSWORD or "
        "COPERNICUS_CLIENT_ID/SECRET"
    )


async def get_token(*, force: bool = False) -> str:
    """Return a valid bearer token, fetching a new one if the cache is cold/stale."""
    global _cached_token, _cached_until
    if not force and _cached_token and time.monotonic() < _cached_until:
        return _cached_token

    body = _grant_body()
    try:
        async with http_client() as client:
            resp = await client.post(
                _TOKEN_URL,
                data=body,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:200]
        raise CdseAuthError(f"CDSE token request failed ({exc.response.status_code}): {detail}") from exc
    except httpx.HTTPError as exc:
        raise CdseAuthError(f"CDSE token request failed: {exc.__class__.__name__}") from exc

    payload = resp.json()
    token = payload.get("access_token")
    if not token:
        raise CdseAuthError("CDSE token response had no access_token")
    _cached_token = token
    _cached_until = time.monotonic() + max(30.0, float(payload.get("expires_in", 600)) - 30.0)
    return token
