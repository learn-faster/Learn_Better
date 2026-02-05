
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


@router.get("/overview")
async def get_cognitive_overview(user_id: str = "default_user", timezone: str = "UTC", db: Session = Depends(get_db)):
    """
    Returns a unified overview of the user's cognitive state.
    """
    try:
        focus = cognitive_service.get_focus_phase(timezone)
        stability = cognitive_service.get_knowledge_stability(db)
        frontier = cognitive_service.get_growth_frontier(user_id)
        report = await cognitive_service.get_neural_report(user_id, db, timezone)
        
        return {
            "focus": focus,
            "knowledge": stability,
            "frontier": frontier,
            "report": report
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommendation")
async def get_recommendation(timezone: str = "UTC"):
    return cognitive_service.get_focus_phase(timezone)

@router.get("/stability")
async def get_stability(db: Session = Depends(get_db)):
    return cognitive_service.get_knowledge_stability(db)

@router.get("/frontier")
async def get_frontier(user_id: str = "default_user"):
    return cognitive_service.get_growth_frontier(user_id)


@router.get("/settings")
async def get_settings(user_id: str = "default_user", db: Session = Depends(get_db)):
    """
    Returns user's learning calibration settings.
    Creates defaults if none exist.
    """
    settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return {
        "target_retention": settings.target_retention,
        "daily_new_limit": settings.daily_new_limit,
        "focus_duration": settings.focus_duration,
        "break_duration": settings.break_duration,
    }


@router.post("/settings")
async def update_settings(data: SettingsUpdate, user_id: str = "default_user", db: Session = Depends(get_db)):
    """
    Updates user's learning calibration settings.
    """
    settings = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
    
    # Apply updates
    if data.target_retention is not None:
        # Clamp to valid range
        settings.target_retention = max(0.7, min(0.97, data.target_retention))
    if data.daily_new_limit is not None:
        settings.daily_new_limit = max(1, min(100, data.daily_new_limit))
    if data.focus_duration is not None:
        settings.focus_duration = max(5, min(120, data.focus_duration))
    if data.break_duration is not None:
        settings.break_duration = max(1, min(30, data.break_duration))
    
    db.commit()
    return {"status": "ok", "message": "Settings updated successfully"}
