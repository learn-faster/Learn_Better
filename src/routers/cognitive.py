
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from src.database.orm import get_db
from src.services.cognitive_service import cognitive_service
from src.models.orm import UserSettings

router = APIRouter(prefix="/api/cognitive", tags=["Cognitive Space"])


class SettingsUpdate(BaseModel):
    target_retention: Optional[float] = None
    daily_new_limit: Optional[int] = None
    focus_duration: Optional[int] = None
    break_duration: Optional[int] = None
    
    # Notification Settings
    email: Optional[str] = None
    resend_api_key: Optional[str] = None
    email_daily_reminder: Optional[bool] = None
    email_streak_alert: Optional[bool] = None
    email_weekly_digest: Optional[bool] = None


@router.get("/overview")
def get_cognitive_overview(user_id: str = "default_user", db: Session = Depends(get_db)):
    """
    Returns high-level cognitive metrics for the dashboard.
    """
    settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
    
    retention_rate = 85.5 # Placeholder (real logic in service)
    study_streak = 3      # Placeholder
    
    return {
        "retention_rate": retention_rate,
        "study_streak": study_streak,
        "daily_limit": settings.daily_new_limit,
        "focus_duration": settings.focus_duration
    }


@router.get("/settings")
def get_settings(user_id: str = "default_user", db: Session = Depends(get_db)):
    """
    Returns user's current settings.
    """
    settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
    
    return {
        "target_retention": settings.target_retention,
        "daily_new_limit": settings.daily_new_limit,
        "focus_duration": settings.focus_duration,
        "break_duration": settings.break_duration,
        
        # Notifications
        "email": settings.email,
        "resend_api_key": settings.resend_api_key,
        "email_daily_reminder": settings.email_daily_reminder,
        "email_streak_alert": settings.email_streak_alert,
        "email_weekly_digest": settings.email_weekly_digest
    }


@router.patch("/settings")
def update_settings(
    data: SettingsUpdate,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """
    Updates user's learning calibration settings.
    """
    settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
    
    # Apply updates
    if data.target_retention is not None:
        settings.target_retention = max(0.7, min(0.97, data.target_retention))
    if data.daily_new_limit is not None:
        settings.daily_new_limit = max(1, min(100, data.daily_new_limit))
    if data.focus_duration is not None:
        settings.focus_duration = max(5, min(120, data.focus_duration))
    if data.break_duration is not None:
        settings.break_duration = max(1, min(30, data.break_duration))
        
    # Notification updates
    if data.email is not None:
        settings.email = data.email
    if data.resend_api_key is not None:
        settings.resend_api_key = data.resend_api_key
    if data.email_daily_reminder is not None:
        settings.email_daily_reminder = data.email_daily_reminder
    if data.email_streak_alert is not None:
        settings.email_streak_alert = data.email_streak_alert
    if data.email_weekly_digest is not None:
        settings.email_weekly_digest = data.email_weekly_digest
    
    db.commit()
    return {"status": "ok", "message": "Settings updated successfully"}
