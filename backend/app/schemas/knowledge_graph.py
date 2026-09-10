"""Maritime Knowledge Graph contracts (advanced feature 10)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    # kind ∈ spill | origin | incident | weather | vessel | company | cargo |
    #        flag | evidence | cause | receptor | risk | precedent
    id: str
    kind: str
    group: str
    ring: int = 1                 # 0 = centre, higher = further out
    label: str
    sublabel: str = ""
    score: float | None = None    # 0..1 where meaningful (suspicion, risk, similarity)
    detail: dict[str, str] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: str
    label: str = ""


class KnowledgeGraph(BaseModel):
    detection_id: str
    generated_at: datetime
    nodes: list[GraphNode]
    edges: list[GraphEdge]
