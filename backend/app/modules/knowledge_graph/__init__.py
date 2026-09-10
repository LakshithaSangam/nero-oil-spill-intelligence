"""Advanced 10 — Maritime Knowledge Graph.

Build a clickable relationship graph: ship -> company -> cargo -> AIS history ->
weather -> origin -> oil spill -> protected areas -> evidence. Serialised for the
frontend graph view. Milestone M7b.
"""

from app.modules.knowledge_graph.service import (
    KnowledgeGraphError,
    KnowledgeGraphService,
    service,
)

__all__ = ["KnowledgeGraphError", "KnowledgeGraphService", "service"]
