from fastapi import APIRouter
import logging
import os
from surrealdb import AsyncSurreal
from src.config import settings

logger = logging.getLogger("learnfast-core.on_api")

router = APIRouter()

# Use AsyncSurreal for async compatibility with settings from environment
db = AsyncSurreal(settings.surreal_url)

async def init_surrealdb():
    try:
        await db.signin({"username": settings.surreal_user, "password": settings.surreal_password})
        await db.use(settings.surreal_namespace, settings.surreal_database)
        logger.info(f"Connected to SurrealDB at {settings.surreal_url}")
    except Exception as e:
        logger.error(f"SurrealDB connection failed: {e}")
        # Don't raise - allow app to start with degraded functionality
        logger.warning("SurrealDB features will be unavailable")

# Import and include sub-routers
# (We'll create these files next)
from .notebooks import router as notebooks_router
from .sources import router as sources_router
from .notes import router as notes_router
from .chat import router as chat_router
from .models import router as models_router

router.include_router(notebooks_router)
router.include_router(sources_router)
router.include_router(notes_router)
router.include_router(chat_router)
router.include_router(models_router)

@router.get("/config")
@router.head("/config")
async def get_config():
    return {
        "version": "0.1.0",
        "dbStatus": "connected"
    }

from pydantic import BaseModel
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException
from src.database.orm import get_db
from src.models.orm import UserSettings

class LLMConfigUpdate(BaseModel):
    config: Dict[str, Any]

@router.get("/config/llm")
async def get_llm_config(user_id: str = "default_user", db: Session = Depends(get_db)):
    """Get LLM configuration for the specified user."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        # Create default settings if not exists
        user_settings = UserSettings(user_id=user_id, llm_config={})
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)
    
    return user_settings.llm_config or {}

@router.post("/config/llm")
async def update_llm_config(update: LLMConfigUpdate, user_id: str = "default_user", db: Session = Depends(get_db)):
    """Update LLM configuration."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        user_settings = UserSettings(user_id=user_id, llm_config=update.config)
        db.add(user_settings)
    else:
        user_settings.llm_config = update.config
    
    try:
        db.commit()
        return {"status": "success", "config": user_settings.llm_config}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
