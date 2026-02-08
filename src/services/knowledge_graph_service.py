"""
Service layer for managing saved knowledge graphs.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from src.models.orm import KnowledgeGraph, KnowledgeGraphDocument, Document, UserSettings
from src.models.schemas import LLMConfig
from src.database.graph_storage import multi_doc_graph_storage
from src.ingestion.ingestion_engine import IngestionEngine


class KnowledgeGraphService:
    @staticmethod
    def list_graphs(db: Session, user_id: str) -> List[KnowledgeGraph]:
        return db.query(KnowledgeGraph).filter(KnowledgeGraph.user_id == user_id).order_by(KnowledgeGraph.created_at.desc()).all()

    @staticmethod
    def create_graph(db: Session, user_id: str, name: str, description: Optional[str], document_ids: List[int], llm_config: Optional[LLMConfig]) -> KnowledgeGraph:
        graph = KnowledgeGraph(
            user_id=user_id,
            name=name,
            description=description,
            llm_config=(llm_config.model_dump() if llm_config else {})
        )
        db.add(graph)
        db.flush()

        if document_ids:
            graph_docs = [
                KnowledgeGraphDocument(graph_id=graph.id, document_id=doc_id)
                for doc_id in document_ids
            ]
            db.add_all(graph_docs)

        db.commit()
        db.refresh(graph)
        return graph

    @staticmethod
    def update_graph(
        db: Session,
        graph: KnowledgeGraph,
        name: Optional[str],
        description: Optional[str],
        document_ids: Optional[List[int]],
        llm_config: Optional[LLMConfig]
    ) -> KnowledgeGraph:
        if name is not None:
            graph.name = name
        if description is not None:
            graph.description = description
        if llm_config is not None:
            graph.llm_config = llm_config.model_dump()

        if document_ids is not None:
            db.query(KnowledgeGraphDocument).filter(KnowledgeGraphDocument.graph_id == graph.id).delete()
            if document_ids:
                db.add_all([
                    KnowledgeGraphDocument(graph_id=graph.id, document_id=doc_id)
                    for doc_id in document_ids
                ])

        db.commit()
        db.refresh(graph)
        return graph

    @staticmethod
    def delete_graph(db: Session, graph: KnowledgeGraph) -> None:
        db.delete(graph)
        db.commit()

    @staticmethod
    def _resolve_llm_config(db: Session, user_id: str, override: Optional[LLMConfig], graph_config: Optional[Dict[str, Any]]) -> LLMConfig:
        if override:
            return override

        if graph_config:
            try:
                return LLMConfig(**graph_config)
            except Exception:
                pass

        # Fallback to user settings if present
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        if user_settings and user_settings.llm_config:
            try:
                clean_config = user_settings.llm_config if isinstance(user_settings.llm_config, dict) else {}
                return LLMConfig(**clean_config)
            except Exception:
                pass

        return LLMConfig()

    @staticmethod
    def build_graph(
        db: Session,
        graph: KnowledgeGraph,
        build_mode: str,
        llm_config_override: Optional[LLMConfig],
        ingestion_engine: IngestionEngine
    ) -> KnowledgeGraph:
        graph.status = "building"
        db.commit()

        doc_ids = [gd.document_id for gd in graph.documents]
        if not doc_ids:
            graph.status = "error"
            db.commit()
            raise ValueError("Graph has no documents")

        llm_config = KnowledgeGraphService._resolve_llm_config(db, graph.user_id, llm_config_override, graph.llm_config)

        if build_mode == "existing":
            # Ensure each document graph exists
            for doc_id in doc_ids:
                doc_graph = multi_doc_graph_storage.get_document_graph(doc_id)
                if not doc_graph or doc_graph.get("node_count", 0) == 0:
                    graph.status = "error"
                    db.commit()
                    raise ValueError(f"No scoped graph data found for document {doc_id}")
        elif build_mode == "rebuild":
            for doc_id in doc_ids:
                doc = db.query(Document).filter(Document.id == doc_id).first()
                if not doc or not doc.extracted_text:
                    graph.status = "error"
                    db.commit()
                    raise ValueError(f"Document {doc_id} has no extracted text")
                # Rebuild scoped graph from text
                # This is async; use loop from caller
        else:
            graph.status = "error"
            db.commit()
            raise ValueError("Invalid build_mode. Use 'existing' or 'rebuild'.")

        graph.status = "ready"
        graph.last_built_at = datetime.utcnow()
        db.commit()
        db.refresh(graph)
        return graph

    @staticmethod
    def get_graph_data(
        graph: KnowledgeGraph,
        include_connections: bool = True,
        target_graph_id: Optional[str] = None
    ) -> Dict[str, Any]:
        doc_ids = [gd.document_id for gd in graph.documents]
        nodes: List[Dict[str, Any]] = []
        links: List[Dict[str, Any]] = []

        for doc_id in doc_ids:
            doc_graph = multi_doc_graph_storage.get_document_graph(doc_id)
            if not doc_graph:
                continue
            for concept in doc_graph.get("concepts", []):
                nodes.append({
                    "id": concept["scoped_id"],
                    "name": concept["name"],
                    "description": concept.get("description") or "",
                    "document_id": doc_id,
                    "is_merged": concept.get("is_merged", False)
                })
            for rel in doc_graph.get("relationships", []):
                links.append({
                    "source": rel["source"],
                    "target": rel["target"],
                    "weight": rel.get("weight"),
                    "reasoning": rel.get("reasoning"),
                    "relationship": "prerequisite",
                    "document_id": doc_id
                })

        if include_connections:
            connections = multi_doc_graph_storage.get_cross_graph_links(graph.id, target_graph_id=target_graph_id)
            for conn in connections:
                links.append({
                    "source": conn["from_id"],
                    "target": conn["to_id"],
                    "confidence": conn.get("confidence"),
                    "context": conn.get("context"),
                    "relationship": "cross_graph",
                    "graph_a": conn.get("graph_a"),
                    "graph_b": conn.get("graph_b")
                })

        return {
            "nodes": nodes,
            "links": links,
            "node_count": len(nodes),
            "relationship_count": len(links),
            "graph_meta": {
                "id": graph.id,
                "name": graph.name,
                "status": graph.status,
                "document_ids": doc_ids,
                "last_built_at": graph.last_built_at
            }
        }
