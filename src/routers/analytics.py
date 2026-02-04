"""
Analytics Router for the Learning Assistant.
Provides endpoints for calculating and retrieving key performance indicators, 
activity logs, and study habits visualization data.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List

from src.database.orm import get_db
from src.models.orm import Document, Flashcard, StudySession, StudyReview
from src.models.schemas import AnalyticsOverview, StudyStats, ActivityLogResponse
from src.services.time_tracking_service import TimeTrackingService
from src.services.activity_service import ActivityService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/activity", response_model=List[ActivityLogResponse])
def get_recent_activity(limit: int = 10, db: Session = Depends(get_db)):
    """
    Retrieves the most recent activity log entries.
    """
    return ActivityService.get_recent_activity(db, limit)


@router.get("/overview", response_model=AnalyticsOverview)
def get_analytics_overview(db: Session = Depends(get_db)):
    """
    Compiles an overview of all learning metrics for the dashboard.
    
    Includes totals for documents/flashcards, current study streak, 
    retention rate, and SRS distribution.
    
    Args:
        db (Session): Database session.
        
    Returns:
        AnalyticsOverview: Aggregated stats for the user's dashboard.
    """
    
    # Count totals
    total_documents = db.query(func.count(Document.id)).scalar()
    total_flashcards = db.query(func.count(Flashcard.id)).scalar()
    total_reviews = db.query(func.count(StudyReview.id)).scalar()
    
    # Cards due today
    now = datetime.utcnow()
    cards_due_today = db.query(func.count(Flashcard.id))\
        .filter(Flashcard.next_review <= now)\
        .scalar()
    
    # Calculate study streak
    study_streak = calculate_study_streak(db)
    
    # Calculate retention rate
    retention_rate = calculate_retention_rate(db)
    
    # Calculate time metrics
    # Note: time_spent_reading might be null if not initialized, so we use coalesce or python logic
    total_time_spent = db.query(func.sum(Document.time_spent_reading)).scalar() or 0
    
    # Avg completion time (using service)
    avg_completion_time = TimeTrackingService.get_average_completion_time(db)
    
    # Calculate SRS Distribution
    new_cards = db.query(func.count(Flashcard.id)).filter(Flashcard.repetitions == 0).scalar()
    learning_cards = db.query(func.count(Flashcard.id)).filter(Flashcard.repetitions > 0, Flashcard.interval <= 21).scalar()
    mastered_cards = db.query(func.count(Flashcard.id)).filter(Flashcard.interval > 21).scalar()

    return AnalyticsOverview(
        total_documents=total_documents or 0,
        total_flashcards=total_flashcards or 0,
        total_reviews=total_reviews or 0,
        cards_due_today=cards_due_today or 0,
        study_streak=study_streak,
        retention_rate=retention_rate,
        total_time_spent=total_time_spent,
        avg_completion_time=avg_completion_time,
        srs_distribution={
            "new": new_cards or 0,
            "learning": learning_cards or 0,
            "mastered": mastered_cards or 0
        }
    )


@router.get("/performance", response_model=List[StudyStats])
def get_performance_trends(
    days: int = 30,
    db: Session = Depends(get_db)
):
    """
    Retrieves performance trends (reviews and ratings) over a period of time.
    """
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get sessions grouped by date
    sessions = db.query(StudySession)\
        .filter(StudySession.start_time >= start_date)\
        .order_by(StudySession.start_time)\
        .all()
    
    # Group by date
    stats_by_date = {}
    for session in sessions:
        date_key = session.start_time.date().isoformat()
        
        if date_key not in stats_by_date:
            stats_by_date[date_key] = {
                "date": date_key,
                "cards_reviewed": 0,
                "new_cards": 0,
                "ratings": []
            }
        
        stats_by_date[date_key]["cards_reviewed"] += session.cards_reviewed
        stats_by_date[date_key]["new_cards"] += session.new_cards
        if session.average_rating:
            stats_by_date[date_key]["ratings"].append(session.average_rating)
    
    # Calculate averages
    result = []
    for date_key, data in stats_by_date.items():
        avg_rating = sum(data["ratings"]) / len(data["ratings"]) if data["ratings"] else 0
        result.append(StudyStats(
            date=data["date"],
            cards_reviewed=data["cards_reviewed"],
            new_cards=data["new_cards"],
            average_rating=avg_rating
        ))
    
    return sorted(result, key=lambda x: x.date)


@router.get("/heatmap")
def get_study_heatmap(
    days: int = 365,
    db: Session = Depends(get_db)
):
    """
    Retrieves study activity data for a heatmap visualization .
    
    Returns:
        dict: Mapping of ISO dates to review counts.
    """
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get all reviews in date range
    reviews = db.query(
        func.date(StudyReview.reviewed_at).label('date'),
        func.count(StudyReview.id).label('count')
    ).filter(StudyReview.reviewed_at >= start_date)\
     .group_by(func.date(StudyReview.reviewed_at))\
     .all()
    
    # Convert to dictionary
    heatmap_data = {
        review.date.isoformat() if hasattr(review.date, 'isoformat') else str(review.date): review.count
        for review in reviews
    }
    
    return heatmap_data


@router.get("/retention")
def get_retention_metrics(db: Session = Depends(get_db)):
    """
    Retrieves detailed retention statistics, including successful vs failure 
    review ratios and rating distribution.
    """
    
    # Get all reviews
    total_reviews = db.query(func.count(StudyReview.id)).scalar()
    
    # Count successful reviews (rating >= 3)
    successful_reviews = db.query(func.count(StudyReview.id))\
        .filter(StudyReview.rating >= 3)\
        .scalar()
    
    # Calculate retention rate
    retention_rate = (successful_reviews / total_reviews * 100) if total_reviews > 0 else 0
    
    # Get rating distribution
    rating_distribution = db.query(
        StudyReview.rating,
        func.count(StudyReview.id).label('count')
    ).group_by(StudyReview.rating).all()
    
    distribution = {
        str(rating.rating): rating.count
        for rating in rating_distribution
    }
    
    return {
        "total_reviews": total_reviews,
        "successful_reviews": successful_reviews,
        "retention_rate": retention_rate,
        "rating_distribution": distribution
    }


@router.get("/time-tracking")
def get_time_tracking_stats(db: Session = Depends(get_db)):
    """
    Retrieves reading time and estimated completion stats for all documents.
    """
    documents = db.query(Document).filter(Document.time_spent_reading > 0).all()
    
    stats = []
    for doc in documents:
        stats.append({
            "id": doc.id,
            "title": doc.title or doc.filename,
            "time_spent": doc.time_spent_reading,
            "progress": doc.reading_progress,
            "completion_estimate": doc.completion_estimate
        })
    
    return stats


def calculate_study_streak(db: Session) -> int:
    """
    Calculates the current consecutive daily study streak.
    
    Args:
        db (Session): Database session.
        
    Returns:
        int: Number of consecutive days the user has studied.
    """
    
    # Get all unique study dates (in reverse order)
    study_dates = db.query(func.date(StudySession.start_time).label('date'))\
        .group_by(func.date(StudySession.start_time))\
        .order_by(func.date(StudySession.start_time).desc())\
        .all()
    
    if not study_dates:
        return 0
    
    # Check for streak
    streak = 0
    current_date = datetime.utcnow().date()
    
    for study_date in study_dates:
        # study_date is likely a Row or KeyedTuple with 'date' attribute
        date_val = study_date.date
        if isinstance(date_val, datetime):
            date_val = date_val.date()
        elif hasattr(date_val, 'date'): # if it's a string, might need parsing, but from DATE func should be date
             # If using sqlite it returns str, postgres date. 
             pass
        
        # Check if this date is consecutive
        if date_val == current_date or date_val == current_date - timedelta(days=1):
            streak += 1
            current_date = date_val
        else:
            break
    
    return streak


def calculate_retention_rate(db: Session) -> float:
    """
    Calculates the overall percentage of successful recalls.
    """
    
    total_reviews = db.query(func.count(StudyReview.id)).scalar()
    
    if not total_reviews or total_reviews == 0:
        return 0.0
    
    successful_reviews = db.query(func.count(StudyReview.id))\
        .filter(StudyReview.rating >= 3)\
        .scalar()
    
    return round((successful_reviews / total_reviews) * 100, 2)
