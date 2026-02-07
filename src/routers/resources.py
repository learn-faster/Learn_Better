from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from src.database.orm import get_db
from src.services.concept_tutor import ConceptTutorService

router = APIRouter(prefix="/api/resources", tags=["resources"])

@router.get("/scout/{concept_name}", summary="Get Active Intel for a concept")
async def scout_resources(concept_name: str, user_id: str = "default_user", db: Session = Depends(get_db)):
    """
    Get 'Active Intel' (Analogy, Insight, Question) for a concept.
    Replaces old resource scout (books/courses).
    """
    return await ConceptTutorService.get_active_intel(concept_name, db, user_id)

