"""Advanced 5 + 6 — Micro-Leak Early Warning & Pollution Risk Index.

microleak.py : detect recurring small spills from the same vessel; flag recurring
               pollution behaviour before it escalates.
index.py     : maintain a continuous per-vessel risk score from prior spills, AIS
               anomalies, behavioural deviations, cargo, high-risk routes, micro-leaks.
Milestone M7a.
"""

from app.modules.risk_index.service import RiskIndexService, service

__all__ = ["RiskIndexService", "service"]
