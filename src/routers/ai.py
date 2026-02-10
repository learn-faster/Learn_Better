from fastapi import APIRouter, HTTPException, Depends
from starlette.concurrency import run_in_threadpool
import os
from typing import Optional
from pydantic import BaseModel
import os
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
import traceback
import time

from src.database.orm import get_db
from src.models.orm import Document, UserSettings
from src.services.llm_service import llm_service
from src.services.llm_config_resolver import resolve_llm_config
from src.services.document_service import document_service
from src.utils.logger import logger
from src.path_resolution.path_resolver import PathResolver
from src.models.schemas import LearningPath, PathRequest, LLMConfig
from src.dependencies import get_path_resolver, get_request_user_id
from src.config import settings

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
    text, did_update = await document_service.get_extracted_text(db, request.document_id)
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content available for generation")
    if did_update:
        db.commit()

    try:
        # Resolve LLM config using shared resolver
        config = resolve_llm_config(db, user_id, override=request.llm_config, config_type="flashcards")

        flashcards = await llm_service.generate_flashcards(text, request.count, config)
        return flashcards
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
    text, did_update = await document_service.get_extracted_text(db, request.document_id)
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content available for generation")
    if did_update:
        db.commit()

    try:
        # Resolve LLM config using shared resolver
        config = resolve_llm_config(db, user_id, override=request.llm_config, config_type="quiz")

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
    try:
        # Check if concept exists in graph first to decide on fallback
        concept_check = path_resolver.navigation.connection.execute_query(
             "MATCH (c:Concept {name: $name}) RETURN count(*) as cnt",
             {"name": request.target_concept.lower()}
        )
        graph_exists = concept_check and concept_check[0]["cnt"] > 0

        # Use provided time budget
        effective_user_id = request.user_id or user_id
        graph_path = path_resolver.resolve_path(
            effective_user_id,
            request.target_concept,
            time_budget_minutes=request.time_budget_minutes
        )

        # If we found a valid path (even if empty but concept exists),
        # return it if we want to avoid LLM fallback for known graph concepts.
        if graph_exists and graph_path:
            return graph_path

    except Exception as e:
        logger.error(f"Graph resolution failed: {e}")
        # Continue to fallback ONLY if concept doesn't exist in graph

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
