from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from src.config import settings as app_settings
from src.models.orm import UserSettings


LLM_SECTION_KEYS = [
    "global",
    "chat",
    "flashcards",
    "quiz",
    "curriculum",
    "extraction",
    "agent",
    "vision",
]


PROVIDER_REGISTRY: List[Dict[str, Any]] = [
    {
        "id": "openai",
        "label": "OpenAI",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": None,
        "supports_embeddings": True,
        "supports_vision": True,
        "supports_openai_compatible": True,
    },
    {
        "id": "anthropic",
        "label": "Anthropic",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": None,
        "supports_embeddings": False,
        "supports_vision": True,
        "supports_openai_compatible": False,
    },
    {
        "id": "groq",
        "label": "Groq",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://api.groq.com/openai/v1",
        "supports_embeddings": False,
        "supports_vision": False,
        "supports_openai_compatible": True,
    },
    {
        "id": "openrouter",
        "label": "OpenRouter",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://openrouter.ai/api/v1",
        "supports_embeddings": True,
        "supports_vision": True,
        "supports_openai_compatible": True,
    },
    {
        "id": "ollama",
        "label": "Ollama (Local)",
        "requires_api_key": False,
        "requires_base_url": True,
        "default_base_url": "http://localhost:11434",
        "supports_embeddings": True,
        "supports_vision": True,
        "supports_openai_compatible": True,
    },
    {
        "id": "google",
        "label": "Google (Gemini)",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": None,
        "supports_embeddings": True,
        "supports_vision": True,
        "supports_openai_compatible": False,
    },
    {
        "id": "together",
        "label": "Together",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://api.together.xyz/v1",
        "supports_embeddings": True,
        "supports_vision": False,
        "supports_openai_compatible": True,
    },
    {
        "id": "mistral",
        "label": "Mistral",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://api.mistral.ai/v1",
        "supports_embeddings": True,
        "supports_vision": True,
        "supports_openai_compatible": True,
    },
    {
        "id": "huggingface",
        "label": "HuggingFace",
        "requires_api_key": True,
        "requires_base_url": True,
        "default_base_url": None,
        "supports_embeddings": True,
        "supports_vision": False,
        "supports_openai_compatible": True,
    },
    {
        "id": "fireworks",
        "label": "Fireworks",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://api.fireworks.ai/inference/v1",
        "supports_embeddings": True,
        "supports_vision": False,
        "supports_openai_compatible": True,
    },
    {
        "id": "deepseek",
        "label": "DeepSeek",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://api.deepseek.com/v1",
        "supports_embeddings": True,
        "supports_vision": False,
        "supports_openai_compatible": True,
    },
    {
        "id": "perplexity",
        "label": "Perplexity",
        "requires_api_key": True,
        "requires_base_url": False,
        "default_base_url": "https://api.perplexity.ai",
        "supports_embeddings": True,
        "supports_vision": False,
        "supports_openai_compatible": True,
    },
    {
        "id": "custom",
        "label": "Custom OpenAI-Compatible",
        "requires_api_key": True,
        "requires_base_url": True,
        "default_base_url": None,
        "supports_embeddings": True,
        "supports_vision": True,
        "supports_openai_compatible": True,
    },
]


def get_provider_registry() -> List[Dict[str, Any]]:
    return PROVIDER_REGISTRY


def _clean_dict(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if v is not None}


def _derive_global_from_root(config: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(config, dict):
        return {}
    keys = ["provider", "model", "api_key", "base_url", "temperature", "max_tokens"]
    derived = {k: config.get(k) for k in keys if config.get(k) is not None}
    return derived


def default_llm_config() -> Dict[str, Any]:
    base_url = app_settings.ollama_base_url if app_settings.llm_provider == "ollama" else None
    return {
        "provider": app_settings.llm_provider,
        "model": app_settings.llm_model,
        "api_key": "",
        "base_url": base_url,
    }


def default_embedding_config() -> Dict[str, Any]:
    return {
        "provider": app_settings.embedding_provider,
        "model": app_settings.embedding_model,
        "api_key": app_settings.embedding_api_key,
        "base_url": app_settings.embedding_base_url,
        "dimensions": getattr(app_settings, "embedding_dimensions", 768),
    }


def _merge_embedding_config(
    existing: Dict[str, Any],
    updates: Optional[Dict[str, Any]] = None,
    user_settings: Optional[UserSettings] = None,
) -> Dict[str, Any]:
    merged = dict(existing) if isinstance(existing, dict) else {}
    if updates and isinstance(updates, dict):
        for key in ["provider", "model", "api_key", "base_url", "dimensions"]:
            if key in updates:
                merged[key] = updates.get(key)

    if user_settings:
        if user_settings.embedding_provider:
            merged.setdefault("provider", user_settings.embedding_provider)
        if user_settings.embedding_model:
            merged.setdefault("model", user_settings.embedding_model)
        if user_settings.embedding_api_key:
            merged.setdefault("api_key", user_settings.embedding_api_key)
        if user_settings.embedding_base_url:
            merged.setdefault("base_url", user_settings.embedding_base_url)

    if merged.get("dimensions") is None:
        merged["dimensions"] = getattr(app_settings, "embedding_dimensions", 768)

    if merged.get("provider") is None:
        merged["provider"] = app_settings.embedding_provider
    if merged.get("model") is None:
        merged["model"] = app_settings.embedding_model
    if merged.get("api_key") is None:
        merged["api_key"] = app_settings.embedding_api_key
    if merged.get("base_url") is None:
        merged["base_url"] = app_settings.embedding_base_url

    return merged


def build_canonical_llm_config(user_settings: UserSettings) -> Dict[str, Any]:
    raw = user_settings.llm_config or {}
    if not isinstance(raw, dict):
        raw = {}

    canonical: Dict[str, Any] = {k: {} for k in LLM_SECTION_KEYS}

    global_cfg = _clean_dict(raw.get("global")) or _derive_global_from_root(raw)
    canonical["global"] = global_cfg

    agent_settings = raw.get("agent_settings", {}) if isinstance(raw.get("agent_settings"), dict) else {}
    agent_llm = raw.get("agent_llm", {}) if isinstance(raw.get("agent_llm"), dict) else {}

    for key in LLM_SECTION_KEYS:
        if key == "global":
            continue
        cfg = _clean_dict(raw.get(key))
        if key == "agent" and not cfg:
            cfg = _clean_dict(agent_settings.get("llm_config")) or _clean_dict(agent_llm)
        if key == "vision" and not cfg:
            cfg = _clean_dict(agent_settings.get("vision_llm_config")) or _clean_dict(agent_settings.get("llm_config")) or _clean_dict(agent_llm)
        canonical[key] = cfg

    embedding_cfg = _clean_dict(raw.get("embedding_config")) or _clean_dict(raw.get("embeddings"))
    embedding_cfg = _merge_embedding_config(embedding_cfg, user_settings=user_settings)
    canonical["embedding_config"] = embedding_cfg

    if not canonical["global"]:
        canonical["global"] = default_llm_config()

    return canonical


def merge_canonical_into_raw(raw: Dict[str, Any], canonical: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(raw) if isinstance(raw, dict) else {}
    for key in LLM_SECTION_KEYS:
        if key in canonical:
            merged[key] = canonical[key] if canonical[key] is not None else {}

    if "embedding_config" in canonical:
        merged["embedding_config"] = canonical["embedding_config"]
        if canonical["embedding_config"].get("dimensions") is not None:
            merged["embedding_dimensions"] = canonical["embedding_config"].get("dimensions")

    # Sync legacy agent settings for backward compatibility
    agent_settings = merged.get("agent_settings", {}) if isinstance(merged.get("agent_settings"), dict) else {}
    if canonical.get("agent"):
        agent_settings["llm_config"] = canonical["agent"]
        merged["agent_llm"] = canonical["agent"]
    if canonical.get("vision"):
        agent_settings["vision_llm_config"] = canonical["vision"]
    if agent_settings:
        merged["agent_settings"] = agent_settings

    return merged


def apply_ai_settings_update(
    user_settings: UserSettings,
    payload: Dict[str, Any]
) -> Tuple[Dict[str, Any], bool]:
    """
    Apply partial updates to the canonical LLM config.
    Returns (merged_raw_config, embeddings_updated).
    """
    raw = user_settings.llm_config or {}
    if not isinstance(raw, dict):
        raw = {}

    canonical = build_canonical_llm_config(user_settings)

    llm_payload = None
    if isinstance(payload.get("llm"), dict):
        llm_payload = payload.get("llm")
    elif isinstance(payload.get("llm_config"), dict):
        llm_payload = payload.get("llm_config")
    elif isinstance(payload.get("config"), dict):
        llm_payload = payload.get("config")

    if llm_payload:
        if any(key in llm_payload for key in LLM_SECTION_KEYS):
            for key in LLM_SECTION_KEYS:
                if key in llm_payload:
                    canonical[key] = _clean_dict(llm_payload.get(key))
        else:
            canonical["global"] = _clean_dict(llm_payload)
    else:
        for key in LLM_SECTION_KEYS:
            if key in payload:
                canonical[key] = _clean_dict(payload.get(key))

    embeddings_updated = False
    embedding_payload = None
    if isinstance(payload.get("embeddings"), dict):
        embedding_payload = payload.get("embeddings")
    elif isinstance(payload.get("embedding_config"), dict):
        embedding_payload = payload.get("embedding_config")

    if embedding_payload is not None:
        canonical["embedding_config"] = _merge_embedding_config(canonical.get("embedding_config", {}), embedding_payload, user_settings=user_settings)
        embeddings_updated = True

    merged = merge_canonical_into_raw(raw, canonical)
    return merged, embeddings_updated


def sync_embedding_columns(user_settings: UserSettings, embedding_config: Dict[str, Any]) -> None:
    user_settings.embedding_provider = embedding_config.get("provider") or None
    user_settings.embedding_model = embedding_config.get("model") or None
    user_settings.embedding_api_key = embedding_config.get("api_key") or ""
    user_settings.embedding_base_url = embedding_config.get("base_url") or None


def mark_llm_config_modified(user_settings: UserSettings) -> None:
    flag_modified(user_settings, "llm_config")


def get_or_create_user_settings(db: Session, user_id: str) -> UserSettings:
    settings_row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not settings_row:
        settings_row = UserSettings(user_id=user_id)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row
