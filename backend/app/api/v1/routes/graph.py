"""Maritime Knowledge Graph (advanced feature 10)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.knowledge_graph.service import KnowledgeGraphError, service
from app.schemas.knowledge_graph import KnowledgeGraph

router = APIRouter()


@router.get("/{detection_id}", response_model=KnowledgeGraph)
async def knowledge_graph(detection_id: str) -> KnowledgeGraph:
    """The relationship graph for a completed investigation."""
    try:
        return await service.build(detection_id)
    except KnowledgeGraphError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
