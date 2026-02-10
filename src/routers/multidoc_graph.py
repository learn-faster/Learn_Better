"""
Multi-Document Graph API Router.

Provides endpoints for:
- Document-specific graph queries
- Cross-document concept discovery
- Graph statistics and visualization
"""

import logging
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any

from src.database.graph_storage import multi_doc_graph_storage
from src.navigation.navigation_engine import multi_doc_navigation
from src.ingestion.ingestion_engine import IngestionEngine
from src.database.orm import get_db, SessionLocal
from sqlalchemy.orm import Session
from src.models.orm import KnowledgeGraph, Document
from src.models.schemas import (
    KnowledgeGraphCreate,
    KnowledgeGraphUpdate,
    KnowledgeGraphResponse,
    KnowledgeGraphBuildRequest,
    KnowledgeGraphSuggestionRequest,
    KnowledgeGraphConnectionRequest,
    KnowledgeGraphDataResponse,
    LLMConfig
)
from src.services.knowledge_graph_service import KnowledgeGraphService
from src.dependencies import get_ingestion_engine, get_request_user_id
from src.services.llm_service import llm_service

logger = logging.getLogger(__name__)


def _to_response(graph: KnowledgeGraph) -> KnowledgeGraphResponse:
    """Helper to convert a KnowledgeGraph ORM object to API response."""
    return KnowledgeGraphResponse(
        id=graph.id,
        user_id=graph.user_id,
        name=graph.name,
        description=graph.description,
        status=graph.status,
        node_count=graph.node_count,
        relationship_count=graph.relationship_count,
        created_at=graph.created_at,
        updated_at=graph.updated_at,
        last_built_at=graph.last_built_at,
        document_ids=[gd.document_id for gd in graph.documents],
        llm_config=LLMConfig(**graph.llm_config) if graph.llm_config else None,
        error_message=getattr(graph, "error_message", None),
        build_progress=getattr(graph, "build_progress", None),
        build_stage=getattr(graph, "build_stage", None)
    )


router = APIRouter(prefix="/api/graphs", tags=["multi-document graphs"])


@router.get("/document/{document_id}")
async def get_document_graph(document_id: int):
    """
    Get the complete knowledge graph for a specific document.
    
    Returns all concepts and relationships scoped to this document.
    """
    try:
        graph = multi_doc_graph_storage.get_document_graph(document_id)
        
        if not graph:
            raise HTTPException(
                status_code=404,
                detail=f"No graph found for document {document_id}"
            )
        
        return graph
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve document graph")


@router.get("/document/{document_id}/roots")
async def get_document_roots(document_id: int):
    """
    Get root concepts for a document.
    
    Root concepts have no prerequisites within the document.
    """
    try:
        roots = multi_doc_navigation.get_document_root_concepts(document_id)
        return {"document_id": document_id, "root_concepts": roots}
        
    except Exception as e:
        logger.error(f"Error getting document roots: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve root concepts")


@router.get("/document/{document_id}/path")
async def get_document_path_preview(
    document_id: int,
    root_concept: str,
    depth: int = Query(default=3, ge=1, le=10)
):
    """
    Get a learning path preview within a document.
    """
    try:
        path = multi_doc_navigation.get_document_path_preview(
            document_id=document_id,
            root_concept=root_concept,
            depth=depth
        )
        return {
            "document_id": document_id,
            "root_concept": root_concept,
            "depth": depth,
            "path": path
        }
        
    except Exception as e:
        logger.error(f"Error getting path preview: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate path preview")


@router.get("/document/{document_id}/neighborhood")
async def get_document_neighborhood(
    document_id: int,
    concept_name: str
):
    """
    Get local neighborhood for a concept within a document.
    """
    try:
        neighborhood = multi_doc_navigation.get_document_neighborhood(
            document_id=document_id,
            concept_name=concept_name
        )
        return {
            "document_id": document_id,
            "concept": concept_name,
            **neighborhood
        }
        
    except Exception as e:
        logger.error(f"Error getting neighborhood: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve neighborhood")


@router.get("/document/{document_id}/cross-doc")
async def get_cross_document_connections(document_id: int):
    """
    Get concepts in this document that connect to other documents.
    """
    try:
        connections = multi_doc_navigation.get_cross_document_connections(document_id)
        return {
            "document_id": document_id,
            "connections": connections,
            "total_connections": len(connections)
        }
        
    except Exception as e:
        logger.error(f"Error getting cross-document connections: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve connections")


@router.get("/search/{concept_name}")
async def search_concept_across_documents(concept_name: str):
    """
    Find a concept across all documents.
    """
    try:
        occurrences = multi_doc_navigation.find_concept_across_documents(concept_name)
        return {
            "concept": concept_name,
            "occurrences": occurrences,
            "document_count": len(occurrences)
        }
        
    except Exception as e:
        logger.error(f"Error searching concept: {e}")
        raise HTTPException(status_code=500, detail="Failed to search concept")


@router.get("/global/search")
async def search_global_concepts(
    query: str,
    limit: int = Query(default=10, ge=1, le=50)
):
    """
    Search global concepts that appear across multiple documents.
    """
    try:
        results = multi_doc_graph_storage.search_global_concepts(query, limit)
        return {
            "query": query,
            "results": results,
            "total_found": len(results)
        }
        
    except Exception as e:
        logger.error(f"Error searching global concepts: {e}")
        raise HTTPException(status_code=500, detail="Failed to search global concepts")


@router.post("/document/{document_id}/merge")
async def merge_cross_document_concepts(
    document_id: int,
    concept_name: str,
    similarity_threshold: float = Query(default=0.85, ge=0.0, le=1.0)
):
    """
    Merge the same concept across documents.
    
    This creates cross-document connections for semantic discovery.
    """
    try:
        from src.ingestion.ingestion_engine import IngestionEngine
        
        engine = IngestionEngine()
        result = engine.merge_cross_document_concepts(
            document_id=document_id,
            concept_name=concept_name,
            similarity_threshold=similarity_threshold
        )
        return result
        
    except Exception as e:
        logger.error(f"Error merging concepts: {e}")
        raise HTTPException(status_code=500, detail="Failed to merge concepts")


@router.post("/document/{document_id}/process")
async def process_document_scoped(
    document_id: int,
    file_path: str
):
    """
    Process a document using document-scoped graph storage.
    """
    try:
        engine = IngestionEngine()
        result = await engine.process_document_scoped(file_path, document_id)
        return result
        
    except Exception as e:
        logger.error(f"Error processing scoped document: {e}")
        raise HTTPException(status_code=500, detail="Failed to process document")


@router.get("/statistics")
async def get_graph_statistics():
    """
    Get overall statistics for the multi-document graph.
    """
    try:
        stats = multi_doc_graph_storage.get_graph_statistics()
        return stats
        
    except Exception as e:
        logger.error(f"Error getting graph statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")


# ===========================
# Saved Knowledge Graphs API
# ===========================

@router.get("", response_model=List[KnowledgeGraphResponse])
async def list_graphs(user_id: str = Depends(get_request_user_id), db: Session = Depends(get_db)):
    graphs = KnowledgeGraphService.list_graphs(db, user_id)
    return [_to_response(g) for g in graphs]


@router.post("", response_model=KnowledgeGraphResponse)
async def create_graph(
    payload: KnowledgeGraphCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    graph = KnowledgeGraphService.create_graph(
        db=db,
        user_id=user_id,
        name=payload.name,
        description=payload.description,
        document_ids=payload.document_ids,
        llm_config=payload.llm_config,
        extraction_max_chars=payload.extraction_max_chars,
        chunk_size=payload.chunk_size
    )
    return _to_response(graph)


@router.get("/{graph_id}", response_model=KnowledgeGraphResponse)
async def get_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    return _to_response(graph)


@router.put("/{graph_id}", response_model=KnowledgeGraphResponse)
async def update_graph(graph_id: str, payload: KnowledgeGraphUpdate, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    graph = KnowledgeGraphService.update_graph(
        db=db,
        graph=graph,
        name=payload.name,
        description=payload.description,
        document_ids=payload.document_ids,
        llm_config=payload.llm_config,
        extraction_max_chars=payload.extraction_max_chars,
        chunk_size=payload.chunk_size
    )

    return _to_response(graph)


@router.delete("/{graph_id}")
async def delete_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    KnowledgeGraphService.delete_graph(db, graph)
    return {"message": "Graph deleted"}


@router.post("/{graph_id}/build", response_model=KnowledgeGraphResponse)
async def build_graph(
    graph_id: str,
    payload: KnowledgeGraphBuildRequest,
    db: Session = Depends(get_db),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    wait: bool = Query(default=False),
    force: bool = Query(default=False)
):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    if graph.status == "building" and not force:
        raise HTTPException(status_code=409, detail="Graph build already in progress")

    if wait:
        try:
            await KnowledgeGraphService.build_graph(
                db=db,
                graph=graph,
                build_mode=payload.build_mode,
                source_mode=payload.source_mode,
                llm_config_override=payload.llm_config,
                ingestion_engine=ingestion_engine,
                extraction_max_chars=payload.extraction_max_chars,
                chunk_size=payload.chunk_size
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return _to_response(graph)

    # Background build
    asyncio.create_task(KnowledgeGraphService.build_graph_background(
        graph_id=graph.id,
        build_mode=payload.build_mode,
        source_mode=payload.source_mode,
        llm_config_override=payload.llm_config,
        ingestion_engine=ingestion_engine,
        extraction_max_chars=payload.extraction_max_chars,
        chunk_size=payload.chunk_size
    ))
    db.refresh(graph)
    return _to_response(graph)


@router.get("/{graph_id}/data", response_model=KnowledgeGraphDataResponse)
async def get_graph_data(
    graph_id: str,
    include_connections: bool = True,
    target_graph_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    data = KnowledgeGraphService.get_graph_data(graph, include_connections=include_connections, target_graph_id=target_graph_id)
    return KnowledgeGraphDataResponse(
        graph_id=graph.id,
        nodes=data["nodes"],
        links=data["links"],
        node_count=data["node_count"],
        relationship_count=data["relationship_count"],
        graph_meta=data["graph_meta"]
    )


@router.post("/{graph_id}/connections/suggest")
async def suggest_connections(
    graph_id: str,
    payload: KnowledgeGraphSuggestionRequest,
    db: Session = Depends(get_db)
):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    target_graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == payload.target_graph_id).first()
    if not graph or not target_graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    source_data = KnowledgeGraphService.get_graph_data(graph, include_connections=False)
    target_data = KnowledgeGraphService.get_graph_data(target_graph, include_connections=False)

    source_concepts = [{"id": n["id"], "name": n["name"]} for n in source_data["nodes"]]
    target_concepts = [{"id": n["id"], "name": n["name"]} for n in target_data["nodes"]]

    if not source_concepts or not target_concepts:
        return {"connections": [], "message": "No concepts available to compare"}

    llm_config = KnowledgeGraphService._resolve_llm_config(db, graph.user_id, payload.llm_config, graph.llm_config)

    prompt = f"""
You are a knowledge graph alignment assistant.
User context: {payload.context}

Source concepts (graph A):
{json.dumps(source_concepts[:150])}

Target concepts (graph B):
{json.dumps(target_concepts[:150])}

Select the best cross-graph connections based on the context.
Return JSON: {{"connections":[{{"from_scoped_id":"", "to_scoped_id":"", "confidence":0.0, "rationale":""}}]}}
Limit to at most {payload.max_links} connections.
"""
    try:
        response_text = await llm_service.get_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format="json",
            config=llm_config
        )
        data = llm_service._extract_and_parse_json(response_text)
        if not isinstance(data, dict):
            data = {}
        connections = data.get("connections", [])
        return {"connections": connections}
    except Exception as e:
        logger.error(f"Connection suggestion failed: {e}")
        return {"connections": [], "message": "Failed to generate suggestions"}


@router.post("/{graph_id}/connections")
async def save_connections(
    graph_id: str,
    payload: KnowledgeGraphConnectionRequest,
    db: Session = Depends(get_db)
):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    target_graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == payload.target_graph_id).first()
    if not graph or not target_graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    created = multi_doc_graph_storage.create_cross_graph_links(
        connections=[c.model_dump() for c in payload.connections],
        context=payload.context,
        graph_a=graph.id,
        graph_b=target_graph.id,
        method=payload.method,
        created_by=graph.user_id
    )
    return {"created": created}


@router.get("/{graph_id}/connections")
async def get_connections(
    graph_id: str,
    target_graph_id: Optional[str] = None
):
    connections = multi_doc_graph_storage.get_cross_graph_links(graph_id, target_graph_id=target_graph_id)
    return {"connections": connections}
