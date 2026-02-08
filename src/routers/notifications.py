"""
Notifications Router for the Learning Assistant.
Triggers email notifications for learning events, goal progress, and streaks.

Note: In production, these endpoints would be called by a scheduler (cron job, 
Celery, etc.) rather than manually. They're exposed as endpoints for testing.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timedelta

from src.database.orm import get_db
from src.models.orm import Goal, FocusSession, Flashcard, StudyReview, UserSettings
from src.services.email_service import email_service
from src.services.weekly_digest_service import send_weekly_digest_for_user_id

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.post("/streak-check")
async def check_and_send_streak_alerts(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Checks for at-risk streaks and sends email alerts.
    Should be called once per day (e.g., at 7 PM).
    
    Logic: If user hasn't studied today and has a streak > 0, send alert.
    """
    user_settings = db.query(UserSettings).first()
    has_user_key = bool(user_settings.resend_api_key) if user_settings else False
    
    if not email_service.enabled and not has_user_key:
        return {"message": "Email service not configured", "emails_sent": 0}
    
    # Get user settings with email
    settings = db.query(UserSettings).filter(UserSettings.email.isnot(None)).all()
    emails_sent = 0
    
    for user_settings in settings:
        # Check if user has activity today
        today = datetime.utcnow().date()
        today_start = datetime.combine(today, datetime.min.time())
        
        today_reviews = db.query(StudyReview).filter(
            StudyReview.reviewed_at >= today_start
        ).count()
        
        today_sessions = db.query(FocusSession).filter(
            FocusSession.start_time >= today_start
        ).count()
        
        if today_reviews == 0 and today_sessions == 0:
            # User hasn't studied today - check their streak
            streak = user_settings.current_streak or 0
            if streak > 0:
                background_tasks.add_task(
                    email_service.send_streak_alert,
                    user_settings.email,
                    streak,
                    api_key=user_settings.resend_api_key
                )
                emails_sent += 1
    
    return {"message": "Streak check complete", "emails_sent": emails_sent}


@router.post("/goal-reminders")
async def send_goal_reminders(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Sends reminders for goals that are behind schedule.
    Should be called once per day.
    """
    if not email_service.enabled:
        return {"message": "Email service not configured", "emails_sent": 0}
    
    # Get goals with email reminders enabled that have deadlines
    goals = db.query(Goal).filter(
        Goal.status == "active",
        Goal.email_reminders == True,
        Goal.deadline.isnot(None)
    ).all()
    
    emails_sent = 0
    user_settings = db.query(UserSettings).first()
    has_user_key = bool(user_settings.resend_api_key) if user_settings else False
    
    if not email_service.enabled and not has_user_key:
        return {"message": "Email service not configured", "emails_sent": 0}
    
    if not user_settings or not user_settings.email:
        return {"message": "No user email configured", "emails_sent": 0}
    
    for goal in goals:
        # Calculate if behind schedule
        now = datetime.utcnow()
        days_elapsed = (now - goal.created_at).days
        days_total = (goal.deadline - goal.created_at).days
        days_left = (goal.deadline - now).days
        
        if days_total > 0 and days_left > 0:
            expected_progress = (days_elapsed / days_total) * goal.target_hours
            actual_progress = goal.logged_hours
            hours_behind = expected_progress - actual_progress
            
            if hours_behind > 1:  # More than 1 hour behind
                background_tasks.add_task(
                    email_service.send_goal_reminder,
                    user_settings.email,
                    goal.title,
                    hours_behind,
                    days_left,
                    api_key=user_settings.resend_api_key
                )
                emails_sent += 1
    
    return {"message": "Goal reminders sent", "emails_sent": emails_sent}


@router.post("/daily-quiz")
async def send_daily_quiz_reminder(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Sends daily flashcard review reminders.
    Should be called once per day (e.g., at 8 AM).
    """
    user_settings = db.query(UserSettings).first()
    has_user_key = bool(user_settings.resend_api_key) if user_settings else False
    
    if not email_service.enabled and not has_user_key:
        return {"message": "Email service not configured", "emails_sent": 0}
    
    if not user_settings or not user_settings.email:
        return {"message": "No user email configured", "emails_sent": 0}
    
    # Count cards due today
    now = datetime.utcnow()
    cards_due = db.query(Flashcard).filter(
        Flashcard.next_review <= now
    ).count()
    
    if cards_due == 0:
        return {"message": "No cards due", "emails_sent": 0}
    
    # Get a sample question
    sample_card = db.query(Flashcard).filter(
        Flashcard.next_review <= now
    ).first()
    sample_question = sample_card.question if sample_card else None
    
    background_tasks.add_task(
        email_service.send_daily_quiz,
        user_settings.email,
        cards_due,
        sample_question,
        api_key=user_settings.resend_api_key
    )
    
    return {"message": "Daily quiz reminder sent", "emails_sent": 1}


@router.post("/weekly-digest")
async def send_weekly_digest(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Sends weekly progress digest.
    Should be called once per week (e.g., Sunday evening).
    """
    user_settings = db.query(UserSettings).first()
    has_user_key = bool(user_settings.resend_api_key) if user_settings else False
    
    if not email_service.enabled and not has_user_key:
        return {"message": "Email service not configured", "emails_sent": 0}
    
    if not user_settings or not user_settings.email:
        return {"message": "No user email configured", "emails_sent": 0}
    
    background_tasks.add_task(
        send_weekly_digest_for_user_id,
        user_settings.user_id
    )
    
    return {"message": "Weekly digest sent", "emails_sent": 1}


@router.get("/status")
async def get_notification_status(db: Session = Depends(get_db)):
    """Check if notifications are enabled and configured."""
    user_settings = db.query(UserSettings).first()
    has_user_key = bool(user_settings.resend_api_key) if user_settings else False
    
    return {
        "email_enabled": email_service.enabled or has_user_key,
        "config_source": "user_settings" if has_user_key else ("env_var" if email_service.enabled else "none"),
        "from_email": email_service.from_email,
        "message": "Ready" if (email_service.enabled or has_user_key) else "Configure RESEND_API_KEY in Settings"
    }
