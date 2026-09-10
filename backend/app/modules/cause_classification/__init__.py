"""Advanced 4 — Spill Cause Classification.

Predict the most likely cause (illegal bilge dumping / cargo leak / tanker collision /
pipeline rupture / offshore drilling incident / maintenance discharge / unknown) with
confidence and supporting evidence. Feeds app.schemas.report.CauseAssessment.
v1 (rule-scorer) in M5; a learned classifier can slot in behind classify() at M7+.
"""

from app.modules.cause_classification.service import classify

__all__ = ["classify"]
