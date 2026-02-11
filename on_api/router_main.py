from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
import logging
from surrealdb import AsyncSurreal
from src.config import settings
from src.dependencies import get_request_user_id

logger = logging.getLogger("learnfast-core.on_api")

router = APIRouter()

_surreal_db: AsyncSurreal | None = None
_surreal_ready: bool = False

async def init_surrealdb():
    global _surreal_db, _surreal_ready
    if _surreal_db is None:
        _surreal_db = AsyncSurreal(settings.surreal_url)

    try:
        await _surreal_db.signin({"username": settings.surreal_user, "password": settings.surreal_password})
        await _surreal_db.use(settings.surreal_namespace, settings.surreal_database)
        logger.info(f"Connected to SurrealDB at {settings.surreal_url}")
        _surreal_ready = True
    except Exception as e:
        logger.error(f"SurrealDB connection failed: {e}")
        # Don't raise - allow app to start with degraded functionality
        logger.warning("SurrealDB features will be unavailable")
        _surreal_ready = False

async def get_surreal_db() -> AsyncSurreal:
    global _surreal_ready
    if _surreal_ready is False or _surreal_db is None:
        await init_surrealdb()
    if not _surreal_ready or _surreal_db is None:
        raise HTTPException(status_code=503, detail="SurrealDB is unavailable")
    return _surreal_db

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
from typing import Dict, Any
from sqlalchemy.orm import Session
from src.database.orm import get_db
from src.models.orm import UserSettings
from src.services.ai_settings import (
    apply_ai_settings_update,
    build_canonical_llm_config,
    get_or_create_user_settings,
    mark_llm_config_modified,
)

class LLMConfigUpdate(BaseModel):
    config: Dict[str, Any]

@router.get("/config/llm")
async def get_llm_config(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """Get LLM configuration for the specified user."""
    user_settings = get_or_create_user_settings(db, user_id)
    canonical = build_canonical_llm_config(user_settings)
    return canonical.get("global", {}) or {}

@router.post("/config/llm")
async def update_llm_config(
    update: LLMConfigUpdate,
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """Update LLM configuration."""
    user_settings = get_or_create_user_settings(db, user_id)
    merged, _ = apply_ai_settings_update(user_settings, {"global": update.config})
    user_settings.llm_config = merged
    mark_llm_config_modified(user_settings)

    try:
        db.commit()
        return {"status": "success", "config": update.config}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
