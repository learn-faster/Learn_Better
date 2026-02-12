"""
Shared LLM configuration resolver for consistent config resolution across the application.

Resolution order:
1. Explicit override (from request)
2. Entity-specific config (graph or document config)
3. User settings (from database)
4. System defaults (from environment/settings)
"""

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from src.models.schemas import LLMConfig
from src.config import settings
from src.services.ai_settings import build_canonical_llm_config, get_or_create_user_settings


def resolve_llm_config(
    db: Session,
    user_id: str,
    override: Optional[LLMConfig] = None,
    entity_config: Optional[Dict[str, Any]] = None,
    config_type: Optional[str] = None
) -> LLMConfig:
    """
    Resolve LLM configuration using a consistent fallback chain.
    
    Args:
        db: Database session for querying user settings
        user_id: User identifier for fetching user-specific settings
        override: Explicit override config (highest priority)
        entity_config: Entity-specific config dict (e.g., from graph or document)
        config_type: Optional key to look up in user_settings.llm_config (e.g. 'flashcards', 'curriculum')
    
    Returns:
        Resolved LLMConfig with provider, model, api_key, and base_url
    """
    # 1. Explicit override takes precedence
    if override:
        return override

    # 2. Entity-specific config (graph, document, etc.)
    if entity_config:
        try:
            return LLMConfig(**entity_config)
        except Exception:
            pass

    # 3. User settings from database
    try:
        user_settings = get_or_create_user_settings(db, user_id)
        canonical = build_canonical_llm_config(user_settings)
        if config_type:
            candidate = canonical.get(config_type) or {}
            if isinstance(candidate, dict) and candidate.get("provider"):
                return LLMConfig(**candidate)
        global_cfg = canonical.get("global") or {}
        if isinstance(global_cfg, dict) and global_cfg.get("provider"):
            return LLMConfig(**global_cfg)
    except Exception:
        pass

    # 4. System defaults
    return LLMConfig(
        provider=settings.llm_provider,
        model=settings.llm_model,
        base_url=settings.ollama_base_url if settings.llm_provider == "ollama" else None
    )


def resolve_embedding_config(
    db: Session,
    user_id: str,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None,
    override_dimensions: Optional[int] = None
) -> Dict[str, Any]:
    """
    Resolve embedding configuration for vector storage.
    
    Args:
        db: Database session
        user_id: User identifier
        override_provider: Explicit embedding provider override
        override_model: Explicit embedding model override
        override_dimensions: Explicit dimensions override
    
    Returns:
        Dict with embedding_provider, embedding_model, embedding_dimensions
    """
    # Start with system defaults
    config = {
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.embedding_model,
        "embedding_dimensions": getattr(settings, "embedding_dimensions", 768),
        "embedding_base_url": settings.embedding_base_url
    }
    
    # Try user settings
    try:
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        if user_settings:
            if user_settings.embedding_provider:
                config["embedding_provider"] = user_settings.embedding_provider
            if user_settings.embedding_model:
                config["embedding_model"] = user_settings.embedding_model
            # Check for consolidated embedding_config in JSON (New way)
            if user_settings.llm_config and isinstance(user_settings.llm_config, dict):
                embedding_cfg = user_settings.llm_config.get("embedding_config")
                if embedding_cfg:
                    if embedding_cfg.get("provider"): config["embedding_provider"] = embedding_cfg.get("provider")
                    if embedding_cfg.get("model"): config["embedding_model"] = embedding_cfg.get("model")
                    if embedding_cfg.get("dimensions"): config["embedding_dimensions"] = int(embedding_cfg.get("dimensions"))
                    if embedding_cfg.get("base_url"): config["embedding_base_url"] = embedding_cfg.get("base_url")
                
                # Check for legacy embedding dimensions in llm_config JSON
                elif "embedding_dimensions" in user_settings.llm_config:
                    config["embedding_dimensions"] = user_settings.llm_config["embedding_dimensions"]
    except Exception:
        pass
    
    # Apply explicit overrides
    if override_provider:
        config["embedding_provider"] = override_provider
    if override_model:
        config["embedding_model"] = override_model
    if override_dimensions:
        config["embedding_dimensions"] = override_dimensions
    
    return config
