
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
    llm_config: Optional[Dict[str, Any]] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_api_key: Optional[str] = None
    embedding_base_url: Optional[str] = None


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
        "email_weekly_digest": settings.email_weekly_digest,
        
        # AI Config
        "llm_config": getattr(settings, "llm_config", None),
        "embedding_provider": getattr(settings, "embedding_provider", None),
        "embedding_model": getattr(settings, "embedding_model", None),
        "embedding_api_key": getattr(settings, "embedding_api_key", ""),
        "embedding_base_url": getattr(settings, "embedding_base_url", None)
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
    
    # AI Config update
    if data.llm_config is not None:
        current_config = getattr(settings, "llm_config", None)
        if current_config is None:
            setattr(settings, "llm_config", data.llm_config)
        else:
            new_config = dict(current_config)
            new_config.update(data.llm_config)
            setattr(settings, "llm_config", new_config)

    # Embedding configuration (global runtime settings)
    if data.embedding_provider:
        settings.embedding_provider = data.embedding_provider
    if data.embedding_model:
        settings.embedding_model = data.embedding_model
    if data.embedding_api_key is not None:
        settings.embedding_api_key = data.embedding_api_key
    if data.embedding_base_url:
        settings.embedding_base_url = data.embedding_base_url

    # Store embedding config in user settings for visibility
    if data.embedding_provider or data.embedding_model or data.embedding_base_url:
        config = getattr(settings, "llm_config", None) or {}
        config["embeddings"] = {
            "provider": data.embedding_provider or config.get("embeddings", {}).get("provider"),
            "model": data.embedding_model or config.get("embeddings", {}).get("model"),
            "base_url": data.embedding_base_url or config.get("embeddings", {}).get("base_url")
        }
        setattr(settings, "llm_config", config)
    
    db.commit()
    return {"status": "ok", "message": "Settings updated successfully"}
