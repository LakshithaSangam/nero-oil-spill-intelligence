"""Async engine + session factory. Imported lazily so the app runs without a DB in M0."""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


@lru_cache
def _engine():  # noqa: ANN202
    return create_async_engine(get_settings().database_url, pool_pre_ping=True, future=True)


@lru_cache
def _sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with _sessionmaker()() as session:
        yield session
