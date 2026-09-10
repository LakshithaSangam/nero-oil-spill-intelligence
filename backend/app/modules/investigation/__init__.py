"""Module 3 — Maritime Investigation Engine.

Query AIS around the hindcast origin +/- window; per vessel score proximity, speed
profile, heading, route deviation, AIS gaps, cargo, type, behavioural anomalies and
time correlation; emit an Explainable Evidence Card per vessel.
Output: app.schemas.investigation.SuspectRanking. Milestone M4.
"""

from app.modules.investigation.service import (
    InvestigationError,
    InvestigationService,
    service,
)

__all__ = ["InvestigationError", "InvestigationService", "service"]
