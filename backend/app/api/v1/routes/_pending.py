"""Helper for endpoints whose module logic arrives in a later milestone.

The route, its request body and its response model are declared now so the OpenAPI
surface (and the generated frontend types) is complete from M0. Calling it returns a
clear 501 naming the milestone that will implement it.
"""

from __future__ import annotations

from fastapi import HTTPException


def not_yet(module: str, milestone: str) -> HTTPException:
    return HTTPException(
        status_code=501,
        detail=f"{module} is scaffolded; logic lands in milestone {milestone}. "
        f"See docs/ROADMAP.md.",
    )
