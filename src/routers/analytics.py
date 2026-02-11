"""
Analytics Router for the Learning Assistant.
Provides endpoints for calculating and retrieving key performance indicators, 
activity logs, and study habits visualization data.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, date as date_type
from src.utils.time import utcnow
from typing import List, Optional, Tuple

from src.database.orm import get_db
from src.models.orm import Document, Flashcard, StudySession, StudyReview, Goal, FocusSession, PracticeSession
from src.models.schemas import (
    AnalyticsOverview,
    StudyStats,
    ActivityLogResponse,
    AnalyticsGoalProgressResponse,
    AnalyticsGoalProgressItem,
    AnalyticsTimeAllocationResponse,
    AnalyticsTimeAllocationItem,
    AnalyticsConsistencyResponse,
    AnalyticsRecommendationsResponse,
    AnalyticsRecommendation,
)
from src.services.time_tracking_service import TimeTrackingService
from src.services.activity_service import ActivityService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _parse_date(date_str: Optional[str], end: bool = False) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        parsed = datetime.fromisoformat(date_str)
        return parsed
    except ValueError:
        try:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None
        if end:
            return datetime.combine(parsed_date + timedelta(days=1), datetime.min.time())
        return datetime.combine(parsed_date, datetime.min.time())


def _get_date_range(date_from: Optional[str], date_to: Optional[str], default_days: int = 30) -> Tuple[datetime, datetime]:
    end = _parse_date(date_to, end=True) or utcnow() + timedelta(days=1)
    start = _parse_date(date_from) or (end - timedelta(days=default_days))
    return start, end


def _goal_title(db: Session, goal_id: Optional[str]) -> Optional[str]:
    if not goal_id:
        return None
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    return goal.title if goal else None


@router.get("/activity", response_model=List[ActivityLogResponse])
def get_recent_activity(limit: int = 10, db: Session = Depends(get_db)):
    """
    Retrieves the most recent activity log entries.
    """
    return ActivityService.get_recent_activity(db, limit)


@router.get("/overview", response_model=AnalyticsOverview)
def get_analytics_overview(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    goal_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Compiles an overview of all learning metrics for the dashboard.
    
    Includes totals for documents/flashcards, current study streak, 
    retention rate, and SRS distribution.
    
    Args:
        db (Session): Database session.
        
    Returns:
        AnalyticsOverview: Aggregated stats for the user's dashboard.
    """
    
    start, end = _get_date_range(date_from, date_to)
    goal_title = _goal_title(db, goal_id)

    # Count totals (global for now)
    total_documents = db.query(func.count(Document.id)).scalar()
    total_flashcards = db.query(func.count(Flashcard.id)).scalar()
    reviews_query = db.query(StudyReview).filter(StudyReview.reviewed_at >= start, StudyReview.reviewed_at < end)
    total_reviews = reviews_query.count()
    
    # Cards due today
    now = utcnow()
    cards_due_today = db.query(func.count(Flashcard.id))\
        .filter(Flashcard.next_review <= now)\
        .scalar()
    
    # Calculate study streak (global)
    study_streak = calculate_study_streak(db)
    
    # Calculate retention rate
    retention_rate = calculate_retention_rate(db, start, end)
    
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
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    goal_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves performance trends (reviews and ratings) over a period of time.
    """
    
    start_date, end_date = _get_date_range(date_from, date_to)
    goal_title = _goal_title(db, goal_id)
    
    # Get sessions grouped by date
    sessions = db.query(StudySession)\
        .filter(StudySession.start_time >= start_date)\
        .filter(StudySession.start_time < end_date)\
        .order_by(StudySession.start_time)\
        .all()

    if goal_title:
        sessions = [s for s in sessions if s.goal == goal_title]
    
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
    
    start_date = utcnow() - timedelta(days=days)
    
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
def get_retention_metrics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves detailed retention statistics, including successful vs failure 
    review ratios and rating distribution.
    """
    
    # Get all reviews
    start, end = _get_date_range(date_from, date_to)
    total_reviews = db.query(func.count(StudyReview.id))\
        .filter(StudyReview.reviewed_at >= start, StudyReview.reviewed_at < end)\
        .scalar()
    
    # Count successful reviews (rating >= 3)
    successful_reviews = db.query(func.count(StudyReview.id))\
        .filter(StudyReview.reviewed_at >= start, StudyReview.reviewed_at < end)\
        .filter(StudyReview.rating >= 3)\
        .scalar()
    
    # Calculate retention rate
    retention_rate = (successful_reviews / total_reviews * 100) if total_reviews > 0 else 0
    
    # Get rating distribution
    rating_distribution = db.query(
        StudyReview.rating,
        func.count(StudyReview.id).label('count')
    ).filter(StudyReview.reviewed_at >= start, StudyReview.reviewed_at < end)\
     .group_by(StudyReview.rating).all()
    
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
def get_time_tracking_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves reading time and estimated completion stats for all documents.
    """
    start, end = _get_date_range(date_from, date_to)
    documents = db.query(Document).filter(Document.time_spent_reading > 0)
    if date_from or date_to:
        documents = documents.filter(Document.last_opened.isnot(None))
        documents = documents.filter(Document.last_opened >= start, Document.last_opened < end)
    documents = documents.all()
    
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
    current_date = utcnow().date()
    
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


def calculate_retention_rate(db: Session, start: Optional[datetime] = None, end: Optional[datetime] = None) -> float:
    """
    Calculates the overall percentage of successful recalls.
    """
    
    query = db.query(StudyReview)
    if start:
        query = query.filter(StudyReview.reviewed_at >= start)
    if end:
        query = query.filter(StudyReview.reviewed_at < end)
    total_reviews = query.count()
    
    if not total_reviews or total_reviews == 0:
        return 0.0
    
    successful_reviews = query.filter(StudyReview.rating >= 3).count()
    
    return round((successful_reviews / total_reviews) * 100, 2)


@router.get("/velocity")
def get_learning_velocity(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Calculates learning velocity: cards mastered per study hour.
    
    This is a key indicator of personal learning rate, allowing users
    to track their efficiency over time.
    """
    
    start, end = _get_date_range(date_from, date_to)

    # Count mastered cards (interval > 21 days = long-term memory)
    mastered_cards = db.query(func.count(Flashcard.id))\
        .filter(Flashcard.interval > 21)\
        .scalar() or 0
    
    # Total study hours from document reading + session time
    total_reading_seconds = db.query(func.sum(Document.time_spent_reading)).scalar() or 0

    # Count session durations in range
    sessions = db.query(StudySession)\
        .filter(StudySession.start_time >= start, StudySession.start_time < end)\
        .filter(StudySession.end_time.isnot(None)).all()
    total_session_seconds = sum(
        (s.end_time - s.start_time).total_seconds() 
        for s in sessions if s.end_time and s.start_time
    )
    
    total_hours = (total_reading_seconds + total_session_seconds) / 3600
    velocity = mastered_cards / max(total_hours, 0.1)  # Avoid division by zero
    
    return {
        "mastered_cards": mastered_cards,
        "study_hours": round(total_hours, 1),
        "velocity": round(velocity, 1),
        "description": f"You master ~{round(velocity, 1)} cards per study hour"
    }


@router.get("/forgetting-curve")
def get_forgetting_curve(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns data for visualizing the forgetting curve.
    
    Shows theoretical memory decay vs. actual retention based on review ratings.
    This helps users understand *why* spaced repetition works.
    """
    
    start_date, end_date = _get_date_range(date_from, date_to)
    
    # Get reviews with their intervals and ratings
    reviews = db.query(StudyReview)\
        .filter(StudyReview.reviewed_at >= start_date)\
        .filter(StudyReview.reviewed_at < end_date)\
        .order_by(StudyReview.reviewed_at)\
        .all()
    
    if not reviews:
        # Return sample theoretical curve for new users
        return {
            "has_data": False,
            "theoretical": [
                {"day": 0, "retention": 100},
                {"day": 1, "retention": 58},
                {"day": 2, "retention": 44},
                {"day": 7, "retention": 33},
                {"day": 14, "retention": 27},
                {"day": 30, "retention": 21}
            ],
            "message": "Complete some reviews to see your personal curve"
        }
    
    # Calculate actual retention by day offset
    retention_by_day = {}
    for review in reviews:
        # Get the flashcard's interval to determine "days since last review"
        flashcard = db.query(Flashcard).filter(Flashcard.id == review.flashcard_id).first()
        if flashcard and flashcard.interval:
            day_bucket = min(flashcard.interval, 30)  # Cap at 30 days
            if day_bucket not in retention_by_day:
                retention_by_day[day_bucket] = {"success": 0, "total": 0}
            retention_by_day[day_bucket]["total"] += 1
            if review.rating >= 3:
                retention_by_day[day_bucket]["success"] += 1
    
    # Convert to curve data
    actual_curve = []
    for day, data in sorted(retention_by_day.items()):
        retention = (data["success"] / data["total"]) * 100 if data["total"] > 0 else 0
        actual_curve.append({"day": day, "retention": round(retention, 1)})
    
    # Theoretical Ebbinghaus curve (simplified)
    theoretical = [
        {"day": 0, "retention": 100},
        {"day": 1, "retention": 58},
        {"day": 2, "retention": 44},
        {"day": 7, "retention": 33},
        {"day": 14, "retention": 27},
        {"day": 30, "retention": 21}
    ]
    
    return {
        "has_data": True,
        "theoretical": theoretical,
        "actual": actual_curve,
        "average_retention": round(
            sum(p["retention"] for p in actual_curve) / max(len(actual_curve), 1), 1
        )
    }


@router.get("/streak-status")
def get_streak_status(db: Session = Depends(get_db)):
    """
    Returns current streak status and whether it's at risk.
    
    A streak is "at risk" if the user hasn't studied today but has an active streak.
    """
    
    streak = calculate_study_streak(db)
    
    # Check if user studied today
    today = utcnow().date()
    studied_today = db.query(StudySession)\
        .filter(func.date(StudySession.start_time) == today)\
        .first() is not None
    
    at_risk = streak > 0 and not studied_today
    
    return {
        "streak": streak,
        "studied_today": studied_today,
        "at_risk": at_risk,
        "message": "🔥 Study now to protect your streak!" if at_risk else (
            f"🔥 {streak} day streak!" if streak > 0 else "Start your streak today!"
        )
    }


@router.get("/goal-progress", response_model=AnalyticsGoalProgressResponse)
def get_goal_progress(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    goals = db.query(Goal).filter(Goal.user_id == user_id, Goal.status == "active").order_by(Goal.priority.asc()).all()
    today = utcnow().date()
    items: List[AnalyticsGoalProgressItem] = []

    for goal in goals:
        progress_pct = 0.0
        if goal.target_hours > 0:
            progress_pct = min((goal.logged_hours / goal.target_hours) * 100, 100)

        expected_progress_pct = None
        pace_status = "on_track"
        required_minutes_per_day = 0
        days_remaining = None

        if goal.deadline:
            total_days = max((goal.deadline.date() - goal.created_at.date()).days, 1)
            elapsed_days = max((today - goal.created_at.date()).days, 0)
            expected_progress_pct = min((elapsed_days / total_days) * 100, 100)
            remaining_hours = max(goal.target_hours - goal.logged_hours, 0)
            days_remaining = max((goal.deadline.date() - today).days, 0)
            if days_remaining > 0:
                required_minutes_per_day = int(round((remaining_hours * 60) / max(days_remaining, 1)))
            else:
                required_minutes_per_day = int(round(remaining_hours * 60))

            if goal.deadline.date() < today and remaining_hours > 0:
                pace_status = "overdue"
            elif expected_progress_pct is not None and progress_pct + 5 < expected_progress_pct:
                pace_status = "at_risk"
            else:
                pace_status = "on_track"
        else:
            pace_status = "no_deadline"

        items.append(AnalyticsGoalProgressItem(
            goal_id=goal.id,
            title=goal.title,
            deadline=goal.deadline,
            target_hours=goal.target_hours,
            logged_hours=goal.logged_hours,
            progress_pct=round(progress_pct, 1),
            expected_progress_pct=round(expected_progress_pct, 1) if expected_progress_pct is not None else None,
            pace_status=pace_status,
            required_minutes_per_day=required_minutes_per_day,
            days_remaining=days_remaining
        ))

    return AnalyticsGoalProgressResponse(items=items)


@router.get("/time-allocation", response_model=AnalyticsTimeAllocationResponse)
def get_time_allocation(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    start, end = _get_date_range(date_from, date_to)
    bucket: Dict[str, Dict[str, int]] = {}

    focus_sessions = db.query(FocusSession).filter(
        FocusSession.user_id == user_id,
        FocusSession.start_time >= start,
        FocusSession.start_time < end,
        FocusSession.end_time.isnot(None)
    ).all()
    for session in focus_sessions:
        day = session.start_time.date().isoformat()
        bucket.setdefault(day, {"focus": 0, "practice": 0, "study": 0})
        bucket[day]["focus"] += int(session.duration_minutes or 0)

    practice_sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == user_id,
        PracticeSession.start_time >= start,
        PracticeSession.start_time < end
    ).all()
    for session in practice_sessions:
        day = session.start_time.date().isoformat()
        bucket.setdefault(day, {"focus": 0, "practice": 0, "study": 0})
        if session.end_time and session.start_time:
            minutes = int(round((session.end_time - session.start_time).total_seconds() / 60))
        else:
            minutes = int(session.target_duration_minutes or 0)
        bucket[day]["practice"] += minutes

    study_sessions = db.query(StudySession).filter(
        StudySession.start_time >= start,
        StudySession.start_time < end,
        StudySession.end_time.isnot(None)
    ).all()
    for session in study_sessions:
        day = session.start_time.date().isoformat()
        bucket.setdefault(day, {"focus": 0, "practice": 0, "study": 0})
        if session.end_time and session.start_time:
            minutes = int(round((session.end_time - session.start_time).total_seconds() / 60))
        else:
            minutes = 0
        bucket[day]["study"] += minutes

    items = []
    for day in sorted(bucket.keys()):
        focus_minutes = bucket[day]["focus"]
        practice_minutes = bucket[day]["practice"]
        study_minutes = bucket[day]["study"]
        total = focus_minutes + practice_minutes + study_minutes
        items.append(AnalyticsTimeAllocationItem(
            date=day,
            focus_minutes=focus_minutes,
            practice_minutes=practice_minutes,
            study_minutes=study_minutes,
            total_minutes=total
        ))

    return AnalyticsTimeAllocationResponse(items=items)


@router.get("/consistency", response_model=AnalyticsConsistencyResponse)
def get_consistency_metrics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    start, end = _get_date_range(date_from, date_to)
    total_days = max((end.date() - start.date()).days, 1)

    active_dates = set()

    focus_sessions = db.query(FocusSession).filter(
        FocusSession.user_id == user_id,
        FocusSession.start_time >= start,
        FocusSession.start_time < end
    ).all()
    active_dates.update({s.start_time.date() for s in focus_sessions})

    practice_sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == user_id,
        PracticeSession.start_time >= start,
        PracticeSession.start_time < end
    ).all()
    active_dates.update({s.start_time.date() for s in practice_sessions})

    study_sessions = db.query(StudySession).filter(
        StudySession.start_time >= start,
        StudySession.start_time < end
    ).all()
    active_dates.update({s.start_time.date() for s in study_sessions})

    active_days = len(active_dates)
    missed_days = max(total_days - active_days, 0)

    sorted_dates = sorted(active_dates)
    longest = 0
    current = 0
    prev = None
    for d in sorted_dates:
        if prev is None or d == prev + timedelta(days=1):
            current += 1
        else:
            longest = max(longest, current)
            current = 1
        prev = d
    longest = max(longest, current)

    return AnalyticsConsistencyResponse(
        active_days=active_days,
        total_days=total_days,
        longest_streak=longest,
        missed_days=missed_days
    )


@router.get("/recommendations", response_model=AnalyticsRecommendationsResponse)
def get_analytics_recommendations(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    start, end = _get_date_range(date_from, date_to)
    due_today = db.query(func.count(Flashcard.id)).filter(Flashcard.next_review <= utcnow()).scalar() or 0
    retention_rate = calculate_retention_rate(db, start, end)

    consistency = get_consistency_metrics(date_from, date_to, user_id, db)
    goal_progress = get_goal_progress(user_id, db)

    items: List[AnalyticsRecommendation] = []

    if due_today >= 20:
        items.append(AnalyticsRecommendation(
            id="due-backlog",
            title="Review backlog",
            message=f"{due_today} cards are due. A 20‑minute review will keep spacing healthy.",
            action_label="Start reviews",
            action_route="/practice",
            severity="warning"
        ))

    if retention_rate < 70 and retention_rate > 0:
        items.append(AnalyticsRecommendation(
            id="retention",
            title="Recall quality slipping",
            message="Consider slower reviews and more self‑explanation on difficult items.",
            action_label="View retention",
            action_route="/analytics",
            severity="warning"
        ))

    if consistency.active_days < max(int(consistency.total_days * 0.4), 3):
        items.append(AnalyticsRecommendation(
            id="consistency",
            title="Consistency gap",
            message="Your study cadence is uneven. Aim for 3 short sessions this week.",
            action_label="Plan sessions",
            action_route="/practice",
            severity="info"
        ))

    if any(item.pace_status in ["at_risk", "overdue"] for item in goal_progress.items):
        items.append(AnalyticsRecommendation(
            id="goal-risk",
            title="Goal pacing risk",
            message="One or more goals are behind schedule. Adjust daily minutes or deadlines.",
            action_label="Review goals",
            action_route="/learning-path",
            severity="warning"
        ))

    return AnalyticsRecommendationsResponse(items=items[:4])


