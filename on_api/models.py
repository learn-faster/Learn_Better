from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from src.database.orm import get_db
from src.dependencies import get_request_user_id
from src.services.ai_settings import build_canonical_llm_config, default_embedding_config, get_or_create_user_settings, get_provider_registry

router = APIRouter(prefix="/models", tags=["models"])

@router.get("")
async def list_models():
    """List available LLM models."""
    return [
        {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "provider": "openai"},
        {"id": "claude-3-5-sonnet", "name": "Claude 3.5 Sonnet", "provider": "anthropic"},
        {"id": "llama3", "name": "Llama 3 (Local)", "provider": "ollama"}
    ]

@router.get("/defaults")
async def get_default_model_settings(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """Get default model and parameters."""
    settings_row = get_or_create_user_settings(db, user_id)
    canonical = build_canonical_llm_config(settings_row)
    chat_cfg = canonical.get("chat") or canonical.get("global") or {}
    return {
        "llm_config": chat_cfg,
        "embedding_config": canonical.get("embedding_config") or default_embedding_config(),
        "default_chat_model": chat_cfg.get("model"),
        "model": chat_cfg.get("model"),
        "temperature": chat_cfg.get("temperature", 0.7),
        "max_tokens": chat_cfg.get("max_tokens", 2048),
        "top_p": chat_cfg.get("top_p", 1.0)
    }

@router.get("/providers")
async def list_providers():
    """List supported AI providers."""
    return get_provider_registry()

@router.get("/{model_id}")
async def get_model_details(model_id: str):
    """Placeholder for detailed model info."""
    return {"id": model_id, "status": "active"}
