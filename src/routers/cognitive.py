
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import httpx
from openai import AsyncOpenAI

from src.database.orm import get_db
from src.services.cognitive_service import cognitive_service
from src.services.llm_service import llm_service
from src.models.orm import UserSettings, Document
from src.config import settings as app_settings
from src.ingestion.ingestion_engine import IngestionEngine
from src.utils.logger import logger
from src.dependencies import get_request_user_id
from src.services.ai_settings import (
    apply_ai_settings_update,
    build_canonical_llm_config,
    default_embedding_config,
    get_or_create_user_settings,
    mark_llm_config_modified,
    sync_embedding_columns,
)

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
    embedding_dimensions: Optional[int] = None


class EmbeddingReindexRequest(BaseModel):
    document_ids: Optional[List[int]] = None
    chunk_size: Optional[int] = None


@router.get("/overview")
def get_cognitive_overview(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
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


@router.get("/recommendation")
async def get_recommendation(
    timezone: str = "UTC",
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    recommendation = await cognitive_service.get_neural_report(user_id=user_id, db=db, timezone=timezone)
    return {"recommendation": recommendation}


@router.get("/stability")
def get_stability(db: Session = Depends(get_db)):
    return cognitive_service.get_knowledge_stability(db)


@router.get("/frontier")
def get_frontier(user_id: str = Depends(get_request_user_id)):
    return cognitive_service.get_growth_frontier(user_id)


@router.get("/settings")
def get_settings(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """
    Returns user's current settings.
    """
    settings_row = get_or_create_user_settings(db, user_id)
    
    canonical = build_canonical_llm_config(settings_row)
    embedding_config = canonical.get("embedding_config") or default_embedding_config()
    embedding_dimensions = embedding_config.get("dimensions") or app_settings.embedding_dimensions

    return {
        "target_retention": settings_row.target_retention,
        "daily_new_limit": settings_row.daily_new_limit,
        "focus_duration": settings_row.focus_duration,
        "break_duration": settings_row.break_duration,
        
        # Notifications
        "email": settings_row.email,
        "resend_api_key": settings_row.resend_api_key,
        "email_daily_reminder": settings_row.email_daily_reminder,
        "email_streak_alert": settings_row.email_streak_alert,
        "email_weekly_digest": settings_row.email_weekly_digest,
        
        # AI Config
        "llm_config": canonical,
        "embedding_provider": getattr(settings_row, "embedding_provider", None),
        "embedding_model": getattr(settings_row, "embedding_model", None),
        "embedding_api_key": getattr(settings_row, "embedding_api_key", ""),
        "embedding_base_url": getattr(settings_row, "embedding_base_url", None),
        "embedding_dimensions": embedding_dimensions or app_settings.embedding_dimensions
    }


@router.patch("/settings")
def update_settings(
    data: SettingsUpdate,
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """
    Updates user's learning calibration settings.
    """
    settings_row = get_or_create_user_settings(db, user_id)
    
    # Apply updates
    if data.target_retention is not None:
        settings_row.target_retention = max(0.7, min(0.97, data.target_retention))
    if data.daily_new_limit is not None:
        settings_row.daily_new_limit = max(1, min(100, data.daily_new_limit))
    if data.focus_duration is not None:
        settings_row.focus_duration = max(5, min(120, data.focus_duration))
    if data.break_duration is not None:
        settings_row.break_duration = max(1, min(30, data.break_duration))
        
    # Notification updates
    if data.email is not None:
        settings_row.email = data.email
    if data.resend_api_key is not None:
        settings_row.resend_api_key = data.resend_api_key
    if data.email_daily_reminder is not None:
        settings_row.email_daily_reminder = data.email_daily_reminder
    if data.email_streak_alert is not None:
        settings_row.email_streak_alert = data.email_streak_alert
    if data.email_weekly_digest is not None:
        settings_row.email_weekly_digest = data.email_weekly_digest
    
    # AI Config update
    if data.llm_config is not None:
        merged, _ = apply_ai_settings_update(settings_row, {"llm": data.llm_config})
        settings_row.llm_config = merged
        mark_llm_config_modified(settings_row)

    # Embedding configuration (global runtime settings)
    if data.embedding_provider is not None:
        settings_row.embedding_provider = data.embedding_provider or None
    if data.embedding_model is not None:
        settings_row.embedding_model = data.embedding_model or None
    if data.embedding_api_key is not None:
        settings_row.embedding_api_key = data.embedding_api_key
    if data.embedding_base_url is not None:
        settings_row.embedding_base_url = data.embedding_base_url or None
    settings_row_embedding_dimensions = None
    if data.embedding_dimensions is not None:
        try:
            settings_row_embedding_dimensions = int(data.embedding_dimensions)
        except (TypeError, ValueError):
            settings_row_embedding_dimensions = None

    if data.embedding_provider is not None or data.embedding_model is not None or data.embedding_base_url is not None or data.embedding_dimensions is not None:
        embedding_payload = {
            "provider": data.embedding_provider,
            "model": data.embedding_model,
            "api_key": data.embedding_api_key,
            "base_url": data.embedding_base_url,
            "dimensions": settings_row_embedding_dimensions if data.embedding_dimensions is not None else None,
        }
        merged, _ = apply_ai_settings_update(settings_row, {"embedding_config": embedding_payload})
        settings_row.llm_config = merged
        mark_llm_config_modified(settings_row)
        canonical = build_canonical_llm_config(settings_row)
        sync_embedding_columns(settings_row, canonical.get("embedding_config", {}))
    
    db.commit()

    # Update in-memory runtime settings so ingestion uses latest embedding config
    if settings_row.embedding_provider is not None:
        setattr(app_settings, "embedding_provider", settings_row.embedding_provider)
    if settings_row.embedding_model is not None:
        setattr(app_settings, "embedding_model", settings_row.embedding_model)
    if settings_row.embedding_api_key is not None:
        setattr(app_settings, "embedding_api_key", settings_row.embedding_api_key)
    if settings_row.embedding_base_url is not None:
        setattr(app_settings, "embedding_base_url", settings_row.embedding_base_url)
    if data.embedding_dimensions is not None and settings_row_embedding_dimensions:
        setattr(app_settings, "embedding_dimensions", settings_row_embedding_dimensions)
    # Reset embedding client cache so new settings take effect immediately
    llm_service._embedding_client = None
    llm_service._embedding_provider = None
    llm_service._embedding_base_url = None
    llm_service._embedding_api_key = None
    return {"status": "ok", "message": "Settings updated successfully"}


@router.get("/embedding-health")
async def embedding_health(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    settings_row = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings_row:
        settings_row = UserSettings(user_id=user_id)
        db.add(settings_row)
        db.commit()

    provider = settings_row.embedding_provider or app_settings.embedding_provider
    model = settings_row.embedding_model or app_settings.embedding_model
    api_key = settings_row.embedding_api_key or app_settings.embedding_api_key
    base_url = settings_row.embedding_base_url or app_settings.embedding_base_url or app_settings.ollama_base_url

    if not provider:
        return {"ok": False, "provider": None, "model": model, "base_url": base_url, "detail": "Embedding provider not configured."}

    provider = provider.lower()

    if provider in {"openai", "openrouter", "together", "fireworks", "mistral", "deepseek", "perplexity", "huggingface", "custom"}:
        if not api_key:
            return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": "Missing API key for embedding provider."}
        if provider in {"huggingface", "custom"} and not base_url:
            return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": "Missing base URL for embedding provider."}

        effective_base = base_url
        if provider == "openrouter":
            effective_base = base_url or "https://openrouter.ai/api/v1"
        elif provider == "together":
            effective_base = base_url or "https://api.together.xyz/v1"
        elif provider == "fireworks":
            effective_base = base_url or "https://api.fireworks.ai/inference/v1"
        elif provider == "mistral":
            effective_base = base_url or "https://api.mistral.ai/v1"
        elif provider == "deepseek":
            effective_base = base_url or "https://api.deepseek.com/v1"
        elif provider == "perplexity":
            effective_base = base_url or "https://api.perplexity.ai"

        client = AsyncOpenAI(
            base_url=effective_base.rstrip("/") if effective_base else None,
            api_key=api_key
        )
        try:
            await client.models.list()
            return {"ok": True, "provider": provider, "model": model, "base_url": effective_base, "detail": "Connected"}
        except Exception as e:
            return {"ok": False, "provider": provider, "model": model, "base_url": effective_base, "detail": str(e)}

    if provider == "ollama":
        if not base_url:
            return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": "Missing base URL for Ollama."}
        url = base_url.rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{url}/api/tags")
            if resp.status_code >= 400:
                return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": f"Ollama responded with status {resp.status_code}."}
            data = resp.json()
            models = [m.get("name") for m in data.get("models", []) if isinstance(m, dict)]
            if model and models and model not in models:
                return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": f"Ollama reachable, but model '{model}' not found."}
        except httpx.HTTPError as e:
            return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": f"Ollama connection error: {str(e)}"}
        except Exception as e:
            return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": str(e)}
    return {"ok": True, "provider": provider, "model": model, "base_url": base_url, "detail": "Connected"}


@router.get("/llm-health")
async def llm_health(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    settings_row = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not settings_row:
        settings_row = UserSettings(user_id=user_id)
        db.add(settings_row)
        db.commit()

    stored_config = getattr(settings_row, "llm_config", None) or {}
    if isinstance(stored_config, dict) and stored_config.get("global"):
        stored_config = stored_config.get("global") or stored_config

    provider = (stored_config.get("provider") or app_settings.llm_provider or "openai").lower()
    model = stored_config.get("model") or app_settings.llm_model
    api_key = stored_config.get("api_key")
    base_url = stored_config.get("base_url")

    if provider in {"openai", "groq", "openrouter", "together", "fireworks", "mistral", "deepseek", "perplexity", "huggingface", "custom"}:
        if not api_key:
            return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": "Missing API key for LLM provider."}
    if provider in {"huggingface", "custom"} and not base_url:
        return {"ok": False, "provider": provider, "model": model, "base_url": base_url, "detail": "Missing base URL for LLM provider."}

    effective_base = base_url
    if provider == "groq":
        effective_base = base_url or "https://api.groq.com/openai/v1"
    elif provider == "openrouter":
        effective_base = base_url or "https://openrouter.ai/api/v1"
    elif provider == "together":
        effective_base = base_url or "https://api.together.xyz/v1"
    elif provider == "fireworks":
        effective_base = base_url or "https://api.fireworks.ai/inference/v1"
    elif provider == "mistral":
        effective_base = base_url or "https://api.mistral.ai/v1"
    elif provider == "deepseek":
        effective_base = base_url or "https://api.deepseek.com/v1"
    elif provider == "perplexity":
        effective_base = base_url or "https://api.perplexity.ai"
    elif provider == "ollama":
        effective_base = base_url or app_settings.ollama_base_url or "http://localhost:11434"

    client = AsyncOpenAI(
        base_url=effective_base.rstrip("/") if effective_base else None,
        api_key=api_key or "ollama"
    )
    try:
        await client.models.list()
    except httpx.HTTPError as e:
        return {"ok": False, "provider": provider, "model": model, "base_url": effective_base, "detail": f"Connection error: {str(e)}"}
    except Exception as e:
        return {"ok": False, "provider": provider, "model": model, "base_url": effective_base, "detail": str(e)}

    return {"ok": True, "provider": provider, "model": model, "base_url": effective_base, "detail": "Connected"}


@router.post("/reindex-embeddings")
async def reindex_embeddings(
    payload: EmbeddingReindexRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """
    Rebuild vector embeddings for documents using extracted text.
    """
    try:
        query = db.query(Document)
        if payload.document_ids:
            query = query.filter(Document.id.in_(payload.document_ids))
        docs = query.all()

        candidates = [d for d in docs if (d.filtered_extracted_text or d.extracted_text or d.raw_extracted_text)]
        if not candidates:
            return {"status": "no_documents", "documents_total": 0, "documents_queued": 0}

        engine = IngestionEngine()

        async def _reindex_single(doc_id: int, text: str, chunk_size: Optional[int]):
            try:
                await engine.reindex_document_vectors(text, doc_id, chunk_size=chunk_size)
            except Exception as e:
                logger.error(f"Reindex failed for doc {doc_id}: {e}")

        for doc in candidates:
            text = doc.filtered_extracted_text or doc.extracted_text or doc.raw_extracted_text or ""
            background_tasks.add_task(_reindex_single, doc.id, text, payload.chunk_size)

        return {
            "status": "started",
            "documents_total": len(candidates),
            "documents_queued": len(candidates)
        }
    except Exception as e:
        logger.error(f"Failed to start embedding reindex: {e}")
        raise HTTPException(status_code=500, detail="Failed to start reindexing.")
