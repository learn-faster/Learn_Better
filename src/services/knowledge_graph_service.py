"""
Service layer for managing saved knowledge graphs.
"""

from datetime import datetime
from src.utils.time import utcnow
import os
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from src.models.orm import KnowledgeGraph, KnowledgeGraphDocument, Document, UserSettings
from src.models.schemas import LLMConfig
from src.database.graph_storage import multi_doc_graph_storage
from src.ingestion.ingestion_engine import IngestionEngine
from src.services.model_limits import recommend_extraction_settings


class KnowledgeGraphService:
    @staticmethod
    def _is_large_source(doc: Document) -> bool:
        if doc.page_count and doc.page_count >= 40:
            return True
        if doc.word_count and doc.word_count >= 20000:
            return True
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                if os.path.getsize(doc.file_path) >= 20 * 1024 * 1024:
                    return True
            except OSError:
                pass
        return False

    @staticmethod
    def _build_processing_recommendation(
        doc: Document,
        llm_config: LLMConfig,
        requested_extraction_max_chars: Optional[int] = None,
        requested_chunk_size: Optional[int] = None
    ) -> Dict[str, Any]:
        provider = getattr(llm_config, "provider", None)
        model = getattr(llm_config, "model", None)
        rec = recommend_extraction_settings(provider, model)
        is_large = KnowledgeGraphService._is_large_source(doc)

        applied_extraction = requested_extraction_max_chars or (rec["recommended_extraction_max_chars"] if is_large else None)
        applied_chunk = requested_chunk_size or (rec["recommended_chunk_size"] if is_large else None)

        clamped = False
        max_input_chars = int(rec.get("max_input_chars") or 0)
        if max_input_chars and applied_extraction and applied_extraction > max_input_chars:
            applied_extraction = max_input_chars
            clamped = True
        if applied_chunk and applied_extraction and applied_chunk > applied_extraction:
            applied_chunk = max(400, int(applied_extraction / 4))
            clamped = True

        reason = "large_source_auto_safe" if is_large else "model_based_default"
        if clamped:
            reason = "clamped_to_model_limit"

        return {
            "provider": rec["provider"],
            "model": rec["model"],
            "context_tokens": rec["context_tokens"],
            "recommended_extraction_max_chars": rec["recommended_extraction_max_chars"],
            "recommended_chunk_size": rec["recommended_chunk_size"],
            "applied_extraction_max_chars": applied_extraction,
            "applied_chunk_size": applied_chunk,
            "is_large_source": is_large,
            "reason": reason
        }
    @staticmethod
    def _validate_document_ids(db: Session, document_ids: Optional[List[int]]) -> List[int]:
        if not document_ids:
            return []

        unique_doc_ids: List[int] = []
        seen = set()
        for doc_id in document_ids:
            if doc_id in seen:
                continue
            seen.add(doc_id)
            unique_doc_ids.append(doc_id)

        existing_ids = {
            row[0]
            for row in db.query(Document.id).filter(Document.id.in_(unique_doc_ids)).all()
        }
        missing = [doc_id for doc_id in unique_doc_ids if doc_id not in existing_ids]
        if missing:
            raise ValueError(f"Document IDs not found: {missing}")

        return unique_doc_ids

    @staticmethod
    def list_graphs(db: Session, user_id: str) -> List[KnowledgeGraph]:
        return db.query(KnowledgeGraph).filter(KnowledgeGraph.user_id == user_id).order_by(KnowledgeGraph.created_at.desc()).all()

    @staticmethod
    def create_graph(db: Session, user_id: str, name: str, description: Optional[str], document_ids: List[int], llm_config: Optional[LLMConfig], extraction_max_chars: Optional[int] = None, chunk_size: Optional[int] = None) -> KnowledgeGraph:
        valid_doc_ids = KnowledgeGraphService._validate_document_ids(db, document_ids)
        graph = KnowledgeGraph(
            user_id=user_id,
            name=name,
            description=description,
            llm_config=(llm_config.model_dump() if llm_config else {}),
            extraction_max_chars=extraction_max_chars,
            chunk_size=chunk_size
        )
        db.add(graph)
        db.flush()

        if valid_doc_ids:
            graph_docs = [
                KnowledgeGraphDocument(graph_id=graph.id, document_id=doc_id)
                for doc_id in valid_doc_ids
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
        llm_config: Optional[LLMConfig],
        extraction_max_chars: Optional[int] = None,
        chunk_size: Optional[int] = None
    ) -> KnowledgeGraph:
        if name is not None:
            graph.name = name
        if description is not None:
            graph.description = description
        if llm_config is not None:
            graph.llm_config = llm_config.model_dump()
        
        if extraction_max_chars is not None:
            graph.extraction_max_chars = extraction_max_chars
        if chunk_size is not None:
            graph.chunk_size = chunk_size

        if document_ids is not None:
            valid_doc_ids = KnowledgeGraphService._validate_document_ids(db, document_ids)
            db.query(KnowledgeGraphDocument).filter(KnowledgeGraphDocument.graph_id == graph.id).delete()
            if valid_doc_ids:
                db.add_all([
                    KnowledgeGraphDocument(graph_id=graph.id, document_id=doc_id)
                    for doc_id in valid_doc_ids
                ])

        db.commit()
        db.refresh(graph)
        return graph

    @staticmethod
    def delete_graph(db: Session, graph: KnowledgeGraph) -> None:
        db.delete(graph)
        db.commit()

    @staticmethod
    def _resolve_llm_config(db: Session, user_id: str, override: Optional[LLMConfig]) -> LLMConfig:
        """
        Resolve LLM config using the shared resolver.
        Knowledge maps use global overrides configured in Settings.
        """
        from src.services.llm_config_resolver import resolve_llm_config
        return resolve_llm_config(db, user_id, override=override, entity_config=None, config_type="knowledge_graph")

    @staticmethod
    async def build_graph(
        db: Session,
        graph: KnowledgeGraph,
        build_mode: str,
        source_mode: str,
        llm_config_override: Optional[LLMConfig],
        ingestion_engine: IngestionEngine,
        extraction_max_chars: Optional[int] = None,
        chunk_size: Optional[int] = None
    ) -> KnowledgeGraph:
        """
        Unified graph build logic.
        Uses provided overrides, or falls back to saved graph settings.
        """
        doc_ids = [gd.document_id for gd in graph.documents]
        if not doc_ids:
            graph.status = "error"
            graph.error_message = "Graph has no documents"
            db.commit()
            raise ValueError("Graph has no documents")

        graph.status = "building"
        graph.error_message = None
        graph.build_progress = 0.0
        graph.build_stage = "starting"
        db.commit()

        # Resolve LLM config
        llm_config = KnowledgeGraphService._resolve_llm_config(db, graph.user_id, llm_config_override)
        
        # Resolve extraction parameters (Request > Saved Graph > Defaults)
        requested_extraction_max_chars = extraction_max_chars or graph.extraction_max_chars
        requested_chunk_size = chunk_size or graph.chunk_size

        total_docs = max(1, len(doc_ids))

        def update_build(stage: str, progress: float):
            graph.build_stage = stage
            graph.build_progress = max(0.0, min(100.0, float(progress)))
            db.commit()

        try:
            if build_mode == "existing":
                update_build("validating", 5.0)
                for idx, doc_id in enumerate(doc_ids):
                    doc_graph = multi_doc_graph_storage.get_document_graph(doc_id)
                    if doc_graph and doc_graph.get("node_count", 0) > 0:
                        continue
                    
                    doc = db.query(Document).filter(Document.id == doc_id).first()
                    if not doc:
                        raise ValueError(f"Document {doc_id} not found")
                    
                    source_text = ""
                    if source_mode == "raw":
                        source_text = doc.raw_extracted_text or doc.extracted_text or ""
                    else:
                        source_text = doc.filtered_extracted_text or doc.extracted_text or doc.raw_extracted_text or ""
                    
                    if not source_text or not source_text.strip():
                        raise ValueError(f"Document {doc_id} has no extracted text")

                    processing_rec = KnowledgeGraphService._build_processing_recommendation(
                        doc,
                        llm_config,
                        requested_extraction_max_chars=requested_extraction_max_chars,
                        requested_chunk_size=requested_chunk_size
                    )

                    def _progress(step, pct, idx=idx):
                        base = 5.0 + (idx / total_docs) * 75.0
                        span = 75.0 / total_docs
                        update_build(step, base + (pct / 100.0) * span)

                    await ingestion_engine.process_document_scoped_from_text(
                        source_text,
                        doc_id,
                        llm_config=llm_config,
                        extraction_max_chars=processing_rec.get("applied_extraction_max_chars"),
                        chunk_size=processing_rec.get("applied_chunk_size"),
                        on_progress=_progress
                    )
            elif build_mode == "rebuild":
                for idx, doc_id in enumerate(doc_ids):
                    doc = db.query(Document).filter(Document.id == doc_id).first()
                    if not doc:
                        raise ValueError(f"Document {doc_id} not found")
                    
                    source_text = ""
                    if source_mode == "raw":
                        source_text = doc.raw_extracted_text or doc.extracted_text or ""
                    else:
                        source_text = doc.filtered_extracted_text or doc.extracted_text or doc.raw_extracted_text or ""
                    
                    if not source_text or not source_text.strip():
                        raise ValueError(f"Document {doc_id} has no extracted text")

                    processing_rec = KnowledgeGraphService._build_processing_recommendation(
                        doc,
                        llm_config,
                        requested_extraction_max_chars=requested_extraction_max_chars,
                        requested_chunk_size=requested_chunk_size
                    )

                    def _progress(step, pct, idx=idx):
                        base = 10.0 + (idx / total_docs) * 70.0
                        span = 70.0 / total_docs
                        update_build(step, base + (pct / 100.0) * span)

                    await ingestion_engine.process_document_scoped_from_text(
                        source_text,
                        doc_id,
                        llm_config=llm_config,
                        extraction_max_chars=processing_rec.get("applied_extraction_max_chars"),
                        chunk_size=processing_rec.get("applied_chunk_size"),
                        on_progress=_progress
                    )
            else:
                raise ValueError("Invalid build_mode. Use 'existing' or 'rebuild'.")

            graph.build_stage = "finalizing"
            graph.build_progress = 90.0
            db.commit()
            
            # Update graph metadata
            graph_data = KnowledgeGraphService.get_graph_data(graph, include_connections=False)
            graph.node_count = graph_data["node_count"]
            graph.relationship_count = graph_data["relationship_count"]
            graph.status = "ready"
            graph.last_built_at = utcnow()
            graph.build_progress = 100.0
            graph.build_stage = "complete"
            db.commit()
            db.refresh(graph)
            return graph
            
        except Exception as e:
            graph.status = "error"
            graph.error_message = str(e)
            graph.build_stage = "error"
            db.commit()
            raise e

    @staticmethod
    async def build_graph_background(
        graph_id: str,
        build_mode: str,
        source_mode: str,
        llm_config_override: Optional[LLMConfig],
        ingestion_engine: IngestionEngine,
        extraction_max_chars: Optional[int] = None,
        chunk_size: Optional[int] = None
    ):
        """
        Background wrapper for building a graph.
        Handles session management and error trapping.
        """
        from src.database.orm import SessionLocal
        db = SessionLocal()
        try:
            graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
            if not graph:
                return
            await KnowledgeGraphService.build_graph(
                db=db,
                graph=graph,
                build_mode=build_mode,
                source_mode=source_mode,
                llm_config_override=llm_config_override,
                ingestion_engine=ingestion_engine,
                extraction_max_chars=extraction_max_chars,
                chunk_size=chunk_size
            )
        except Exception as e:
            # Error handling is mostly inside build_graph, but we trap top-level issues here
            import logging
            logging.getLogger(__name__).error(f"Background build failed for graph {graph_id}: {e}")
        finally:
            db.close()

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
