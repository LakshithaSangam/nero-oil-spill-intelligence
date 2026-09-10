"""Module 2 — Ocean Intelligence Engine (the physics engine).

Input : currents / wind / waves / tide / SST from the oceanography provider.
Hindcast : reverse particle advection from the detected polygon -> origin probability
           surface + release-time window.
Forecast : forward particle ensemble -> drift scenarios, expansion, coastal ETAs.
Output: app.schemas.ocean_intelligence.{HindcastResult, ForecastResult}. Milestone M3.
"""

from app.modules.ocean_intelligence.service import (
    OceanIntelligenceError,
    OceanIntelligenceService,
    service,
)

__all__ = ["OceanIntelligenceError", "OceanIntelligenceService", "service"]
