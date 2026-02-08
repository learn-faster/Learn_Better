"""
Flashcard Router for the Learning Assistant.
Handles the CRUD operations for flashcards and manages the retrieval 
of cards due for review based on the SRS schedule.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from src.database.orm import get_db
from src.models.orm import Flashcard, Document
from src.models.schemas import FlashcardCreate, FlashcardResponse, FlashcardUpdate

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.post("/", response_model=FlashcardResponse)
def create_flashcard(
    flashcard: FlashcardCreate,
    db: Session = Depends(get_db)
):
    """
    Creates a new flashcard in the database.
    
    Args:
        flashcard (FlashcardCreate): Schema containing front, back, and optional document_id.
        db (Session): Database session.
        
    Returns:
        FlashcardResponse: The created flashcard record.
        
    Raises:
        HTTPException: If the specified document_id does not exist.
    """
    # Verify document exists if document_id is provided
    if flashcard.document_id:
        document = db.query(Document).filter(Document.id == flashcard.document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
    
    # Create flashcard
    import uuid
    db_flashcard = Flashcard(
        id=str(uuid.uuid4()),
        document_id=flashcard.document_id,
        card_type=flashcard.card_type,
        front=flashcard.front,
        back=flashcard.back,
        tags=flashcard.tags
    )
    
    db.add(db_flashcard)
    db.commit()
    db.refresh(db_flashcard)
    
    # Log activity for 'Memory' feature
    from src.services.activity_service import ActivityService
    ActivityService.log_activity(
        db, 
        activity_type="create_flashcard", 
        description=f"Created a flashcard: '{db_flashcard.front[:30]}...'",
        document_id=db_flashcard.document_id
    )
    
    return db_flashcard


@router.get("/", response_model=List[FlashcardResponse])
def get_flashcards(
    skip: int = 0,
    limit: int = 100,
    document_id: Optional[int] = None,
    tag: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves flashcards with optional filtering by document or tag.
    """
    query = db.query(Flashcard)
    
    if document_id:
        query = query.filter(Flashcard.document_id == document_id)
    
    if tag:
        # Filter by tag (JSON array contains)
        # Note: JSON containment might require specific dialect support or cast
        # For simple workaround if JSON contains isn't working on all postgres versions easily via ORM:
        # query = query.filter(Flashcard.tags.contains([tag])) # Postgres specific
        # We'll use a safer approach if needed, but contains is standard for PG JSONB
        query = query.filter(Flashcard.tags.contains([tag]))
    
    flashcards = query.offset(skip).limit(limit).all()
    return flashcards


@router.get("/due", response_model=List[FlashcardResponse])
def get_due_flashcards(
    limit: int = 50,
    interleave: bool = False,
    group_by: str = "document",
    document_id: Optional[int] = None,
    tag: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves flashcards that are scheduled for review (next_review <= now).
    If interleave is true, cards are mixed across groups (document or tag).
    """
    now = datetime.utcnow()

    query = db.query(Flashcard).filter(Flashcard.next_review <= now)
    if document_id:
        query = query.filter(Flashcard.document_id == document_id)
    if tag:
        query = query.filter(Flashcard.tags.contains([tag]))

    if not interleave:
        return query.order_by(Flashcard.next_review).limit(limit).all()

    fetch_limit = max(limit * 4, 50)
    cards = query.order_by(Flashcard.next_review).limit(fetch_limit).all()
    if not cards:
        return []

    # Group cards
    groups = {}
    for card in cards:
        if group_by == "tag" and card.tags:
            key = card.tags[0]
        else:
            key = card.document_id or "unassigned"
        groups.setdefault(key, []).append(card)

    # Sort groups by earliest due card
    group_keys = sorted(groups.keys(), key=lambda k: groups[k][0].next_review)
    result = []
    while len(result) < limit and group_keys:
        new_keys = []
        for key in group_keys:
            bucket = groups.get(key, [])
            if bucket:
                result.append(bucket.pop(0))
                if len(result) >= limit:
                    break
            if bucket:
                new_keys.append(key)
        group_keys = new_keys

    return result


@router.get("/{flashcard_id}", response_model=FlashcardResponse)
def get_flashcard(flashcard_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a single flashcard by its ID.
    """
    flashcard = db.query(Flashcard).filter(Flashcard.id == flashcard_id).first()
    
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    return flashcard


@router.put("/{flashcard_id}", response_model=FlashcardResponse)
def update_flashcard(
    flashcard_id: str,
    flashcard_update: FlashcardUpdate,
    db: Session = Depends(get_db)
):
    """
    Updates the content (front, back, tags) of an existing flashcard.
    """
    flashcard = db.query(Flashcard).filter(Flashcard.id == flashcard_id).first()
    
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    if flashcard_update.front is not None:
        flashcard.front = flashcard_update.front
    if flashcard_update.back is not None:
        flashcard.back = flashcard_update.back
    if flashcard_update.tags is not None:
        flashcard.tags = flashcard_update.tags
    
    db.commit()
    db.refresh(flashcard)
    
    return flashcard


@router.delete("/{flashcard_id}")
def delete_flashcard(flashcard_id: str, db: Session = Depends(get_db)):
    """
    Permanently deletes a flashcard from the library.
    """
    flashcard = db.query(Flashcard).filter(Flashcard.id == flashcard_id).first()
    
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    db.delete(flashcard)
    db.commit()
    
    return {"message": "Flashcard deleted successfully"}
