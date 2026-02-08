from fastapi import APIRouter, HTTPException, Depends
import os
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
import traceback
import time

from src.database.orm import get_db
from src.models.orm import Document, UserSettings
from src.services.llm_service import llm_service
from src.utils.logger import logger
from src.ingestion.document_processor import DocumentProcessor
from src.path_resolution.path_resolver import PathResolver
from src.models.schemas import LearningPath, PathRequest, LLMConfig
from src.dependencies import get_path_resolver

router = APIRouter(prefix="/api/ai", tags=["AI Generation"])
document_processor = DocumentProcessor()


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
async def generate_flashcards(request: GenerateRequest, db: Session = Depends(get_db)):
    """
    Generates flashcards from a document.
    """
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    text = document.extracted_text
    
    # If no text extracted yet, try to process on the fly (or re-process)
    if not text and document.file_path:
        try:
            text = document_processor.convert_to_markdown(document.file_path)
        except Exception as e:
            # If conversion fails, we can't proceed
            raise HTTPException(status_code=400, detail=f"Could not extract text from document: {str(e)}")
            
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content available for generation")
        
    try:
        # Fetch user settings for LLM config overrides
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == "default_user").first()
        
        # Merge request config with stored config (priority to request if provided, else stored)
        config = request.llm_config
        if not config and user_settings and user_settings.llm_config:
            # Parse stored JSON into LLMConfig object
            # Check for nested structure first
            stored_config = user_settings.llm_config.get("flashcards") or user_settings.llm_config.get("global")
            
            # Fallback to flat structure if nested keys missing but provider exists
            if not stored_config and "provider" in user_settings.llm_config:
                stored_config = user_settings.llm_config
                
            if stored_config:
                # Filter out empty keys
                clean_config = {k: v for k, v in stored_config.items() if v}
                config = LLMConfig(**clean_config)

        flashcards = await llm_service.generate_flashcards(text, request.count, config)
        return flashcards
    except Exception as e:
        logger.exception("Error generating flashcards")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-questions")
async def generate_questions(request: GenerateRequest, db: Session = Depends(get_db)):
    """
    Generates multiple-choice questions from a document.
    """
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
         raise HTTPException(status_code=404, detail="Document not found")
    
    text = document.extracted_text
    
    if not text and document.file_path:
        try:
            text = document_processor.convert_to_markdown(document.file_path)
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Could not extract text from document: {str(e)}")
             
    if not text:
        raise HTTPException(status_code=400, detail="Document has no text content")

    try:
        # Fetch user settings for LLM config
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == "default_user").first()
        
        config = request.llm_config
        if not config and user_settings and user_settings.llm_config:
            # Check for nested structure first
            stored_config = user_settings.llm_config.get("quiz") or user_settings.llm_config.get("global")
            
            # Fallback to flat structure
            if not stored_config and "provider" in user_settings.llm_config:
                stored_config = user_settings.llm_config
                
            if stored_config:
                clean_config = {k: v for k, v in stored_config.items() if v}
                config = LLMConfig(**clean_config)

        questions = await llm_service.generate_questions(text, request.count, config)
        return questions
    except Exception as e:
        logger.exception("Error generating flashcards")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/learning-path")
async def generate_learning_path(
    request: PathRequest, 
    db: Session = Depends(get_db),
    path_resolver: PathResolver = Depends(get_path_resolver)
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
        graph_path = path_resolver.resolve_path(
            request.user_id, 
            request.target_concept, 
            time_budget_minutes=request.time_budget_minutes
        )
        
        # If we found a valid path (even if empty but concept exists), 
        # return it if we want to avoid LLM fallback for known graph concepts.
        if graph_exists:
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
        document = db.query(Document).filter(Document.id == request.document_id).first()
        if document:
            text = document.extracted_text or ""
            if not text and document.file_path:
                try:
                    text = document_processor.convert_to_markdown(document.file_path)
                except:
                    pass

    if not request.target_concept:
         raise HTTPException(status_code=400, detail="Target concept (goal) is required")

    try:
        # Mapping target_concept to 'goal' for LLM
        # Fetch user settings for LLM config
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == "default_user").first()
        
        config = None
        if user_settings and user_settings.llm_config:
            # Check for nested structure first
            stored_config = user_settings.llm_config.get("curriculum") or user_settings.llm_config.get("global")
            
            # Fallback to flat structure
            if not stored_config and "provider" in user_settings.llm_config:
                stored_config = user_settings.llm_config
                
            if stored_config:
                clean_config = {k: v for k, v in stored_config.items() if v}
                config = LLMConfig(**clean_config)

        path = await llm_service.generate_learning_path(text, request.target_concept, config=config)
        return path
    except Exception as e:
        logger.exception("Error generating learning path")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-concepts")
async def extract_concepts(request: GenerateRequest, db: Session = Depends(get_db)):
    """
    Extracts concepts and relationships from a document and updates the graph.
    """
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    text = document.extracted_text
    file_path = document.file_path

    if not text and file_path:
        logger.debug(f"Attempting extraction for document {document.id} at path: {file_path}")
        
        # Robust path check: if file_path is relative, join with upload_dir
        if not os.path.exists(file_path):
            alt_path = os.path.join(settings.upload_dir, os.path.basename(file_path))
            logger.debug(f"Original path not found. Trying alt path: {alt_path}")
            if os.path.exists(alt_path):
                file_path = alt_path
            else:
                # If still not found, try stripping the ID prefix (DocumentStore pattern: docid_filename)
                # But document.file_path usually contains the whole thing.
                pass

        try:
            text = document_processor.convert_to_markdown(file_path)
            if text:
                logger.debug(f"Successfully extracted {len(text)} characters.")
                # Update document with extracted text so we don't do it again
                document.extracted_text = text
                db.commit()
            else:
                 logger.debug(f"MarkItDown returned empty text for {file_path}")
        except Exception as e:
            logger.error(f"Extraction failed for {file_path}: {str(e)}")
            
    if not text:
        raise HTTPException(
            status_code=400, 
            detail=f"Document has no text content. Path checked: {file_path}. Exists: {os.path.exists(file_path) if file_path else 'No file path'}"
        )

    try:
        # Fetch user settings for LLM config
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == "default_user").first()
        
        config = request.llm_config
        if not config and user_settings and user_settings.llm_config:
            # Check for nested structure first
            stored_config = user_settings.llm_config.get("extraction") or user_settings.llm_config.get("global")
            
            # Fallback to flat structure
            if not stored_config and "provider" in user_settings.llm_config:
                stored_config = user_settings.llm_config
                
            if stored_config:
                clean_config = {k: v for k, v in stored_config.items() if v}
                config = LLMConfig(**clean_config)

        # Extract structured data
        extraction = await llm_service.extract_concepts(text, config)
        
        # TODO: In a real implementation, we would save these to the knowledge graph (Neo4j/Graph Storage)
        # For now, we return the extraction results to the frontend to demonstrate the feature works.
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
