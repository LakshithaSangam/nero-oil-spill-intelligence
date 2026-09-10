"""Advanced 9 — Spill Similarity Search.

Compare each detected spill against the NOAA ground-truth incident catalog; return
similarity score, nearest historical event, likely cause and likely vessel type.
Milestone M7b.
"""

from app.modules.similarity.service import SimilarityError, SimilarityService, service

__all__ = ["SimilarityError", "SimilarityService", "service"]
