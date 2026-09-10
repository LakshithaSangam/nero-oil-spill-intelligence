from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app import __version__

router = APIRouter()


class Health(BaseModel):
    status: str
    version: str
    time: datetime


@router.get("/health", response_model=Health)
async def health() -> Health:
    return Health(status="ok", version=__version__, time=datetime.now(UTC))
