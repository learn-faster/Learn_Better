"""
Study Router for the Learning Assistant.
Manages active study sessions, review submissions, and schedules 
for upcoming spaced repetition reviews.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from src.utils.time import utcnow

from src.database.orm import get_db
from src.dependencies import get_request_user_id
from src.models.orm import StudySession, StudyReview, Flashcard
from src.models.schemas import (
    StudyReviewCreate, 
    StudySessionResponse, 
    FlashcardResponse,
    StudySessionCreate,
    StudySessionEnd
)
from src.services.srs_service import SRSService

router = APIRouter(prefix="/api/study", tags=["study"])
srs_service = SRSService()


@router.post("/session", response_model=StudySessionResponse)
def start_study_session(
    session_data: StudySessionCreate = None,
    db: Session = Depends(get_db)
):
    """
    Initializes a new study session.
    """
    import uuid
    session_id = str(uuid.uuid4())
    
    session = StudySession(
        id=session_id,
        goal=session_data.goal if session_data else None,
        study_type=session_data.study_type if session_data else "deep"
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session


@router.post("/session/{session_id}/review")
def submit_review(
    session_id: str,
    review: StudyReviewCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """
    Submits a review for a flashcard and updates its SRS parameters.
    
    Calculates the next review date using the SM-2 algorithm based on 
    the user's rating for the card.
    
    Args:
        session_id (str): ID of the active study session.
        review (StudyReviewCreate): Review data including card ID and recall rating.
        db (Session): Database session.
        
    Returns:
        dict: Success message and new SRS status for the card.
        
    Raises:
        HTTPException: If session or flashcard is not found, or rating is invalid.
    """
    
    # Verify session exists
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Study session not found")
    
    # Verify flashcard exists
    flashcard = db.query(Flashcard).filter(Flashcard.id == review.flashcard_id).first()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    
    # Validate rating
    if review.rating < 0 or review.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 0 and 5")
    
    # Store original state BEFORE calculating new SRS values
    # This is critical for correctly counting new vs review cards
    was_new_card = flashcard.repetitions == 0
    
    # Get user's target retention from settings
    from src.models.orm import UserSettings
    user_settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    target_retention = user_settings.target_retention if user_settings else 0.9
    
    # Calculate new SRS parameters with user's target retention
    new_ease_factor, new_interval, new_repetitions, next_review_date = srs_service.calculate_next_review(
        ease_factor=flashcard.ease_factor,
        interval=flashcard.interval,
        repetitions=flashcard.repetitions,
        rating=review.rating,
        target_retention=target_retention
    )

    
    # Update flashcard
    flashcard.ease_factor = new_ease_factor
    flashcard.interval = new_interval
    flashcard.repetitions = new_repetitions
    flashcard.next_review = next_review_date
    flashcard.last_review = utcnow()
    
    # Create review record
    study_review = StudyReview(
        session_id=session_id,
        flashcard_id=review.flashcard_id,
        rating=review.rating,
        time_taken=review.time_taken
    )
    
    # Update session stats
    session.cards_reviewed += 1
    if was_new_card:
        session.new_cards += 1
    else:
        session.review_cards += 1
    
    db.add(study_review)
    db.commit()
    
    return {
        "message": "Review submitted successfully",
        "next_review": next_review_date,
        "interval_days": new_interval,
        "ease_factor": new_ease_factor
    }


@router.post("/session/{session_id}/end", response_model=StudySessionResponse)
def end_study_session(
    session_id: str, 
    end_data: StudySessionEnd = None,
    db: Session = Depends(get_db)
):
    """
    Finalizes a study session and calculates aggregate performance stats.
    """
    
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Study session not found")
    
    # Set end time
    session.end_time = utcnow()
    
    # Update reflection and rating if provided
    if end_data:
        if end_data.reflection:
            session.reflection = end_data.reflection
        if end_data.effectiveness_rating:
            session.effectiveness_rating = end_data.effectiveness_rating
    
    # Calculate average rating
    if session.reviews:
        total_rating = sum(review.rating for review in session.reviews)
        session.average_rating = total_rating / len(session.reviews)
    
    db.commit()
    db.refresh(session)
    
    return session


@router.get("/sessions", response_model=List[StudySessionResponse])
def get_study_sessions(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Retrieves a historical list of study sessions.
    """
    sessions = db.query(StudySession)\
        .order_by(StudySession.start_time.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    
    return sessions


@router.get("/upcoming")
def get_upcoming_reviews(
    days: int = 7,
    db: Session = Depends(get_db)
):
    """
    Forecasts upcoming reviews for the specified date range.
    
    Args:
        days (int): Number of days to look ahead (default: 7).
        db (Session): Database session.
        
    Returns:
        dict: A schedule mapping ISO dates to lists of due flashcards.
    """
    from datetime import timedelta
    from sqlalchemy import func
    
    now = utcnow()
    end_date = now + timedelta(days=days)
    
    # Get flashcards due within the date range
    flashcards = db.query(Flashcard)\
        .filter(Flashcard.next_review >= now)\
        .filter(Flashcard.next_review <= end_date)\
        .order_by(Flashcard.next_review)\
        .all()
    
    # Group by date
    schedule = {}
    for flashcard in flashcards:
        date_key = flashcard.next_review.date().isoformat()
        if date_key not in schedule:
            schedule[date_key] = []
        schedule[date_key].append({
            "flashcard_id": flashcard.id,
            "front": flashcard.front,
            "next_review": flashcard.next_review
        })
    
    return schedule

