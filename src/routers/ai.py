from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
import traceback

from src.database.orm import get_db
from src.models.orm import Document
from src.services.llm_service import llm_service
from src.ingestion.document_processor import DocumentProcessor
from src.path_resolution.path_resolver import PathResolver
from src.models.schemas import LearningPath, PathRequest
from src.dependencies import get_path_resolver

router = APIRouter(prefix="/api/ai", tags=["AI Generation"])
document_processor = DocumentProcessor()


@router.get("/test")
async def test_endpoint():
    """Simple health check for the AI router."""
    return {"message": "AI Router is working"}


class LLMConfig(BaseModel):
    """Configuration overrides for LLM generation."""
    provider: str = "openai"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


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
        flashcards = await llm_service.generate_flashcards(text, request.count, request.llm_config)
        return flashcards
    except Exception as e:
        traceback.print_exc()
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
        questions = await llm_service.generate_questions(text, request.count, request.llm_config)
        return questions
    except Exception as e:
        traceback.print_exc()
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
        print(f"Graph resolution failed: {e}")
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
        path = await llm_service.generate_learning_path(text, request.target_concept)
        return path
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
