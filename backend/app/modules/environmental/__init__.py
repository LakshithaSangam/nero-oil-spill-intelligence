"""Advanced 7 — Environmental Impact Intelligence.

ETA to coral reefs / mangroves / MPAs / fisheries / coastline; Environmental Priority
Score; affected area, cleanup cost and liability ranges.
Output: app.schemas.environmental.EnvironmentalImpact. v1 in M5; deepened in M7+.
"""

from app.modules.environmental.service import (
    EnvironmentalError,
    EnvironmentalService,
    service,
)

__all__ = ["EnvironmentalError", "EnvironmentalService", "service"]
