"""Shared async HTTP plumbing for the real (non-mock) providers.

One place for the timeout policy, a polite User-Agent, and a small retry-with-backoff
around transient failures (connect errors, 429, 5xx). Mock providers never touch this.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.logging import get_logger

log = get_logger(__name__)

USER_AGENT = "Nero/0.1 (+maritime-oil-spill-intelligence)"
DEFAULT_TIMEOUT = httpx.Timeout(25.0, connect=10.0)

_RETRY_STATUS = {429, 500, 502, 503, 504}


def http_client(**kwargs: Any) -> httpx.AsyncClient:
    """An ``httpx.AsyncClient`` with Neuro's defaults already applied.

    Callers own the lifecycle — use ``async with http_client() as c: ...``.
    """
    headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
    kwargs.setdefault("follow_redirects", True)
    return httpx.AsyncClient(headers=headers, **kwargs)


async def request_json(
    method: str,
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    retries: int = 2,
    backoff: float = 0.6,
    **kwargs: Any,
) -> Any:
    """Issue a request and return parsed JSON, retrying transient failures.

    Passing ``client`` reuses a caller-managed session; otherwise a short-lived one is
    opened for the call. Raises ``httpx.HTTPStatusError`` on a non-retryable 4xx/5xx and
    ``httpx.HTTPError`` if every attempt fails.
    """
    own = client is None
    c = client or http_client()
    try:
        last_exc: Exception | None = None
        for attempt in range(retries + 1):
            try:
                resp = await c.request(method, url, **kwargs)
                if resp.status_code in _RETRY_STATUS and attempt < retries:
                    raise httpx.HTTPStatusError(
                        f"retryable {resp.status_code}", request=resp.request, response=resp
                    )
                resp.raise_for_status()
                return resp.json()
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_exc = exc
                if attempt >= retries or (
                    isinstance(exc, httpx.HTTPStatusError)
                    and exc.response.status_code not in _RETRY_STATUS
                ):
                    raise
                sleep = backoff * (2**attempt)
                log.warning("%s %s failed (%s); retry %d/%d in %.1fs",
                            method, url, exc.__class__.__name__, attempt + 1, retries, sleep)
                await asyncio.sleep(sleep)
        assert last_exc is not None
        raise last_exc
    finally:
        if own:
            await c.aclose()


async def get_json(url: str, **kwargs: Any) -> Any:
    return await request_json("GET", url, **kwargs)
