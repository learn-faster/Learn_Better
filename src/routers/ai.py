from fastapi import APIRouter, HTTPException, Depends
from starlette.concurrency import run_in_threadpool
import os
from typing import Optional, List
from pydantic import BaseModel
import os
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
import traceback
import time

from src.database.orm import get_db
from src.models.orm import Document, UserSettings, DocumentSection
from src.services.llm_service import llm_service
from src.services.llm_config_resolver import resolve_llm_config
from src.services.document_service import document_service
from src.utils.logger import logger
from src.path_resolution.path_resolver import PathResolver
from src.models.schemas import LearningPath, PathRequest, LLMConfig
from src.dependencies import get_path_resolver, get_request_user_id
from src.config import settings
from src.database.graph_storage import graph_storage
from src.ingestion.youtube_utils import extract_video_id, fetch_transcript_segments


def _parse_time_seconds(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    raw = str(value).strip()
    if raw.isdigit():
        return int(raw)
    parts = raw.split(":")
    try:
        parts = [int(p) for p in parts]
    except Exception:
        return None
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return None


def _slice_transcript_by_time(source_url: Optional[str], start_time: Optional[str], end_time: Optional[str]) -> Optional[str]:
    if not source_url:
        return None
    video_id = extract_video_id(source_url)
    if not video_id:
        return None
    start_s = _parse_time_seconds(start_time)
    end_s = _parse_time_seconds(end_time)
    if start_s is None and end_s is None:
        return None
    segments = fetch_transcript_segments(video_id)
    if not segments:
        return None
    start_ms = (start_s or 0) * 1000
    end_ms = (end_s * 1000) if end_s is not None else None
    selected = []
    for seg in segments:
        seg_start = seg.get("start_ms", 0)
        seg_end = seg_start + seg.get("duration_ms", 0)
        if end_ms is not None and seg_start > end_ms:
            break
        if seg_end >= start_ms and (end_ms is None or seg_start <= end_ms):
            selected.append(seg.get("text", ""))
    text = " ".join([t for t in selected if t])
    return text.strip() if text else None


def _slice_text_by_pages(text: str, start_page: int, end_page: int) -> str:
    if not text or start_page > end_page:
        return ""
    if "## Page" not in text and "## page" not in text:
        return text
    lines = text.splitlines()
    current_page = None
    bucket = []
    for line in lines:
        if line.strip().lower().startswith("## page"):
            try:
                parts = line.strip().split()
                page_num = int(parts[-1])
            except Exception:
                page_num = None
            current_page = page_num
        if current_page is None:
            continue
        if start_page <= current_page <= end_page:
            bucket.append(line)
    return "\n".join(bucket).strip()


def _strip_metadata_lines(text: str) -> str:
    if not text:
        return text
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        lower = line.strip().lower()
        if not lower:
            cleaned.append(line)
            continue
        if any(key in lower for key in ["isbn", "copyright", "all rights reserved", "publisher", "edition"]):
            continue
        if lower.startswith("author:") or lower.startswith("by "):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)

router = APIRouter(prefix="/api/ai", tags=["AI Generation"])


@router.get("/test")
async def test_endpoint():
    """Simple health check for the AI router."""
    return {"message": "AI Router is working"}


class GenerateRequest(BaseModel):
    """Request schema for flashcard/question generation."""
    document_id: int
    count: int = 5
    llm_config: Optional[LLMConfig] = None
    text: Optional[str] = None
    retrieval_mode: Optional[str] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    section_ids: Optional[List[str]] = None


@router.post("/generate-flashcards")
async def generate_flashcards(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """
    Generates flashcards from a document.
    """
    # Get text using centralized service
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    text, did_update = await document_service.get_extracted_text(db, request.document_id)
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content available for generation")
    if did_update:
        db.commit()

    try:
        # Resolve LLM config using shared resolver
        config = resolve_llm_config(db, user_id, override=request.llm_config, config_type="flashcards")
        extraction_config = resolve_llm_config(db, user_id, config_type="extraction")

        if request.text:
            text = request.text
        elif request.section_ids:
            sections = (
                db.query(DocumentSection)
                .filter(DocumentSection.document_id == request.document_id)
                .filter(DocumentSection.id.in_(request.section_ids))
                .order_by(DocumentSection.section_index.asc())
                .all()
            )
            if not sections:
                raise HTTPException(status_code=400, detail="No sections found for that selection.")
            text = "\n\n".join([s.content for s in sections if s.content]).strip()

        # Slice by page range if provided and text has page markers
        if request.start_page and request.end_page:
            text = _slice_text_by_pages(text, request.start_page, request.end_page)
            if not text:
                raise HTTPException(status_code=400, detail="No content found for that page range.")

        # Slice by video time range if provided
        if (request.start_time or request.end_time) and document.source_type == "youtube":
            segment_text = _slice_transcript_by_time(document.source_url, request.start_time, request.end_time)
            if segment_text:
                text = segment_text
            else:
                raise HTTPException(status_code=400, detail="Unable to resolve transcript for that time range.")

        text = _strip_metadata_lines(text)
        flashcards = await llm_service.generate_flashcards(text, request.count, config)
        doc_concepts = graph_storage.get_document_concepts(request.document_id, limit=6)

        enriched = []
        tag_results = []
        try:
            tag_results = await llm_service.tag_flashcards(flashcards, extraction_config)
        except Exception:
            tag_results = []

        for idx, card in enumerate(flashcards):
            if not isinstance(card, dict):
                enriched.append(card)
                continue
            tags = []
            if idx < len(tag_results) and isinstance(tag_results[idx], dict):
                tags = tag_results[idx].get("tags") or []
            if not tags:
                tags = doc_concepts or []
            tags = [t for t in tags if t][:3]
            enriched.append({**card, "tags": tags})

        return enriched
    except Exception as e:
        logger.exception("Error generating flashcards")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-questions")
async def generate_questions(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """
    Generates multiple-choice questions from a document.
    """
    # Get text using centralized service
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    text, did_update = await document_service.get_extracted_text(db, request.document_id)
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content available for generation")
    if did_update:
        db.commit()

    try:
        # Resolve LLM config using shared resolver
        config = resolve_llm_config(db, user_id, override=request.llm_config, config_type="quiz")

        if request.text:
            text = request.text
        elif request.section_ids:
            sections = (
                db.query(DocumentSection)
                .filter(DocumentSection.document_id == request.document_id)
                .filter(DocumentSection.id.in_(request.section_ids))
                .order_by(DocumentSection.section_index.asc())
                .all()
            )
            if not sections:
                raise HTTPException(status_code=400, detail="No sections found for that selection.")
            text = "\n\n".join([s.content for s in sections if s.content]).strip()

        if request.start_page and request.end_page:
            text = _slice_text_by_pages(text, request.start_page, request.end_page)
            if not text:
                raise HTTPException(status_code=400, detail="No content found for that page range.")

        if (request.start_time or request.end_time) and document.source_type == "youtube":
            segment_text = _slice_transcript_by_time(document.source_url, request.start_time, request.end_time)
            if segment_text:
                text = segment_text
            else:
                raise HTTPException(status_code=400, detail="Unable to resolve transcript for that time range.")

        text = _strip_metadata_lines(text)
        questions = await llm_service.generate_questions(text, request.count, config)
        return questions
    except Exception as e:
        logger.exception("Error generating questions") # Changed from flashcards to questions
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning-path")
async def generate_learning_path(
    request: PathRequest,
    db: Session = Depends(get_db),
    path_resolver: PathResolver = Depends(get_path_resolver),
    user_id: str = Depends(get_request_user_id)
):
    """
    Generates a structured learning path/curriculum.

    Attempts to resolve path using Knowledge Graph first.
    Falls back to LLM generation if no graph path found or if document context provided.
    """
    # 1. Try Graph Resolution
    # PathRequest requires user_id, so we always try this if not explicitly skipped (future flag?)
    graph_exists = False
    graph_path = None
    try:
        # Use provided time budget
        effective_user_id = request.user_id or user_id
        graph_path = path_resolver.resolve_path(
            effective_user_id,
            request.target_concept,
            time_budget_minutes=request.time_budget_minutes
        )

        # If graph resolver returned a valid path, prefer it and avoid LLM fallback.
        if graph_path:
            return graph_path

        # Check if concept exists in graph first to decide on fallback
        concept_check = path_resolver.navigation.connection.execute_query(
             "MATCH (c:Concept {name: $name}) RETURN count(*) as cnt",
             {"name": request.target_concept.lower()}
        )
        cnt = 0
        if isinstance(concept_check, list) and concept_check:
            first = concept_check[0]
            if isinstance(first, dict):
                try:
                    cnt = int(first.get("cnt", 0))
                except (TypeError, ValueError):
                    cnt = 0
        graph_exists = cnt > 0

    except Exception as e:
        logger.error(f"Graph resolution failed: {e}")
        # If resolver produced a path before the graph check failed, still return it.
        if graph_path:
            return graph_path
        # Continue to fallback only when no graph path was available.

    # 2. Fallback to LLM Generation (Only if NOT in graph or graph resolution failed and concept is new)
    if graph_exists:
        # If it's in the graph but we got here, it's either an error or empty path.
        # We already returned above if graph_exists.
        pass

    text = ""
    if request.document_id:
        text, did_update = await document_service.get_extracted_text(db, request.document_id)
        if did_update:
            db.commit()
        text = text or ""

    if not request.target_concept:
         raise HTTPException(status_code=400, detail="Target concept (goal) is required")

    try:
        # Mapping target_concept to 'goal' for LLM
        # Resolve LLM config using shared resolver
        effective_user_id = request.user_id or user_id
        config = resolve_llm_config(db, effective_user_id, config_type="curriculum")

        path = await llm_service.generate_learning_path(text, request.target_concept, config=config)
        return path
    except Exception as e:
        logger.exception("Error generating learning path")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-concepts")
async def extract_concepts(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """
    Extracts concepts and relationships from a document and updates the graph.
    """
    # Get text using centralized service
    text, did_update = await document_service.get_extracted_text(db, request.document_id)
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content available for extraction")
    if did_update:
        db.commit()

    try:
        # Resolve LLM config using shared resolver
        config = resolve_llm_config(db, user_id, override=request.llm_config, config_type="extraction")

        # Extract structured data
        extraction = await llm_service.extract_concepts(text, config)
        
        # Note: Optimization - In a fully integrated graph system, we would trigger 
        # graph_storage.save_graph here. Currently returns results for frontend display.
        return {
            "status": "success",
            "message": "Concepts extracted and synthesized.",
            "data": extraction
        }
    except Exception as e:
        logger.exception("Error during concept extraction")
        raise HTTPException(status_code=500, detail=str(e))


class TestLLMRequest(BaseModel):
    prompt: str
    llm_config: Optional[LLMConfig] = None


@router.post("/test-llm")
async def test_llm(request: TestLLMRequest):
    start = time.time()
    output = await llm_service.get_chat_completion(
        messages=[{"role": "user", "content": request.prompt}],
        config=request.llm_config
    )
    latency_ms = int((time.time() - start) * 1000)
    return {
        "ok": True,
        "latency_ms": latency_ms,
        "output_sample": output[:500]
    }
