from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database.orm import get_db
from src.dependencies import get_request_user_id
from src.services.ai_settings import (
    apply_ai_settings_update,
    build_canonical_llm_config,
    default_embedding_config,
    default_llm_config,
    get_or_create_user_settings,
    get_provider_registry,
    mark_llm_config_modified,
    sync_embedding_columns,
)
from src.services.llm_service import llm_service
from src.config import settings as app_settings


router = APIRouter(prefix="/api/settings", tags=["AI Settings"])

VALID_EMBEDDING_OPTIONS = {"always", "ask", "never"}


def _get_default_embedding_option(canonical: Dict[str, Any], raw_config: Dict[str, Any]) -> str:
    embedding_cfg = canonical.get("embedding_config") or {}
    configured = (
        embedding_cfg.get("default_option")
        or embedding_cfg.get("default_embedding_option")
        or raw_config.get("default_embedding_option")
    )
    if configured in VALID_EMBEDDING_OPTIONS:
        return configured

    # Backward-compatible fallback: if embeddings are configured, let user choose at ingest time.
    has_embedding_provider = bool(embedding_cfg.get("provider"))
    return "ask" if has_embedding_provider else "never"


@router.get("/ai")
def get_ai_settings(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    settings_row = get_or_create_user_settings(db, user_id)
    canonical = build_canonical_llm_config(settings_row)

    return {
        "llm": canonical,
        "embeddings": canonical.get("embedding_config", {}),
        "providers": get_provider_registry(),
        "defaults": {
            "global": default_llm_config(),
            "embedding_config": default_embedding_config()
        },
        "overrides": {k: canonical.get(k, {}) for k in canonical if k not in {"global", "embedding_config"}}
    }


@router.get("")
def get_settings_compat(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """
    Backward-compatible settings endpoint used by source ingestion UI.
    """
    settings_row = get_or_create_user_settings(db, user_id)
    canonical = build_canonical_llm_config(settings_row)
    raw_config = settings_row.llm_config or {}

    return {
        "default_embedding_option": _get_default_embedding_option(canonical, raw_config),
        "embeddings": canonical.get("embedding_config", {}),
    }


@router.put("/ai")
def update_ai_settings(
    payload: Dict[str, Any],
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    settings_row = get_or_create_user_settings(db, user_id)
    merged_config, embeddings_updated = apply_ai_settings_update(settings_row, payload)

    settings_row.llm_config = merged_config
    mark_llm_config_modified(settings_row)

    canonical = build_canonical_llm_config(settings_row)
    embedding_cfg = canonical.get("embedding_config", {})
    sync_embedding_columns(settings_row, embedding_cfg)

    db.commit()

    if embedding_cfg.get("provider") is not None:
        app_settings.embedding_provider = embedding_cfg.get("provider")
    if embedding_cfg.get("model") is not None:
        app_settings.embedding_model = embedding_cfg.get("model")
    if embedding_cfg.get("api_key") is not None:
        app_settings.embedding_api_key = embedding_cfg.get("api_key")
    if embedding_cfg.get("base_url") is not None:
        app_settings.embedding_base_url = embedding_cfg.get("base_url")
    if embedding_cfg.get("dimensions") is not None:
        app_settings.embedding_dimensions = embedding_cfg.get("dimensions")

    if embeddings_updated:
        llm_service._embedding_client = None
        llm_service._embedding_provider = None
        llm_service._embedding_base_url = None
        llm_service._embedding_api_key = None

    return {"status": "ok", "llm": canonical}


@router.put("")
def update_settings_compat(
    payload: Dict[str, Any],
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    """
    Backward-compatible settings update endpoint used by source ingestion UI.
    """
    settings_row = get_or_create_user_settings(db, user_id)
    existing_option = (settings_row.llm_config or {}).get("default_embedding_option")

    default_embedding_option = payload.get("default_embedding_option")
    if default_embedding_option in VALID_EMBEDDING_OPTIONS:
        selected_option = default_embedding_option
    else:
        selected_option = existing_option

    merged_config, embeddings_updated = apply_ai_settings_update(settings_row, payload)
    if selected_option in VALID_EMBEDDING_OPTIONS:
        merged_config["default_embedding_option"] = selected_option
    settings_row.llm_config = merged_config
    mark_llm_config_modified(settings_row)

    canonical = build_canonical_llm_config(settings_row)
    embedding_cfg = canonical.get("embedding_config", {})
    sync_embedding_columns(settings_row, embedding_cfg)
    db.commit()

    if embeddings_updated:
        llm_service._embedding_client = None
        llm_service._embedding_provider = None
        llm_service._embedding_base_url = None
        llm_service._embedding_api_key = None

    return {
        "status": "ok",
        "default_embedding_option": _get_default_embedding_option(canonical, settings_row.llm_config or {}),
    }
