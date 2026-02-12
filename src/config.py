"""
Application configuration using Pydantic Settings.
Handles environment variables and global application parameters.
"""
import json
import os
from pydantic import ConfigDict, field_validator, PlainValidator
from pydantic_settings import BaseSettings
from typing import Annotated, List, Optional


def parse_cors_origins(origins_str: Optional[str]) -> List[str]:
    """Parse CORS origins from comma-separated string or return empty list."""
    if not origins_str or not origins_str.strip():
        return []
    try:
        # Handle JSON array format
        if origins_str.strip().startswith("["):
            import json
            return json.loads(origins_str)
    except json.JSONDecodeError:
        pass
    # Handle comma-separated format
    return [origin.strip() for origin in origins_str.split(",") if origin.strip()]


def get_frontend_url() -> Optional[str]:
    """Get frontend URL from environment or auto-detect."""
    url = os.getenv("FRONTEND_URL", "").strip()
    if url:
        return url
    # Auto-detect common frontend ports
    for port in ["5173", "3000", "4173"]:
        # Note: We can't actually test here due to circular imports
        # The actual auto-detection happens at connection time
        pass
    return None


def build_cors_origins() -> List[str]:
    """Build CORS origins list from environment or auto-detect."""
    # Check explicit CORS_ORIGINS first
    origins_str = os.getenv("CORS_ORIGINS", "").strip()
    origins = parse_cors_origins(origins_str)
    if origins:
        return origins

    # Build from FRONTEND_URL
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url:
        origins = [frontend_url]
        # Add variations with/without www and different localhost representations
        if "localhost" in frontend_url:
            origins.append(frontend_url.replace("localhost", "127.0.0.1"))
        return origins

    # Default fallbacks for development
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000"
    ]


class Settings(BaseSettings):
    """
    Application settings from environment variables.
    Uses Pydantic to validate and cast environment variables.
    """

    # Server Configuration
    port: int = 8001
    host: str = "0.0.0.0"

    # Frontend URL (for CORS, email links, OAuth callbacks)
    frontend_url: Optional[str] = None

    # Database
    database_url: str = "postgresql://learnfast:password@localhost:5433/learnfast"

    # Uploads
    upload_dir: str = "./data/documents"
    open_notebook_dir: Optional[str] = None

    # CORS origins - uses PlainValidator to handle string input directly
    cors_origins: Annotated[List[str], PlainValidator(lambda v: v if isinstance(v, list) and v else (parse_cors_origins(v) if isinstance(v, str) and v.strip() else build_cors_origins()))] = []

    # File upload limits
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_pdf_extensions: List[str] = [".pdf"]
    allowed_image_extensions: List[str] = [".jpg", ".jpeg", ".png"]

    # Content filtering settings
    filter_enable_llm: bool = True
    filter_llm_max_sections: int = 60
    filter_min_section_chars: int = 80

    # OCR settings
    ocr_mode: str = "local"  # local, cloud, disabled
    ocr_max_pages: int = 8
    ocr_cloud_fallback: bool = True
    ocr_language: str = "eng"
    markdown_inline_image_max_kb: int = 5120

    # Web extraction
    web_extraction_timeout: int = 20

    # LLM Settings
    llm_provider: str = "openai"  # openai, groq, ollama, openrouter
    openai_api_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "gpt-3.5-turbo"
    use_opik: bool = False
    opik_api_key: str = ""
    opik_workspace: str = ""
    opik_url_override: str = ""
    opik_project: str = ""
    opik_use_local: bool = False

    # Embedding Settings
    embedding_provider: str = "ollama"  # openai, ollama
    embedding_model: str = "embeddinggemma:latest"
    embedding_dimensions: int = 768
    ollama_embedding_model: Optional[str] = None  # Deprecated, alias for backward compat if needed
    embedding_api_key: str = ""
    embedding_base_url: Optional[str] = None
    embedding_concurrency: int = 4

    # Granular Model Settings (Optional - overrides llm_model if set)
    extraction_model: Optional[str] = None
    extraction_context_window: int = 100000
    extraction_max_chars: int = 50000
    rewrite_model: Optional[str] = None
    rewrite_context_window: int = 10000
    llm_rate_limit_retry_attempts: int = 3
    llm_rate_limit_max_cooldown_seconds: int = 300

    # Weekly Digest Scheduler (server-side)
    enable_weekly_digest_scheduler: bool = False
    weekly_digest_day: int = 6  # 0=Mon ... 6=Sun
    weekly_digest_hour: int = 18  # 24h UTC
    weekly_digest_minute: int = 0

    # SurrealDB Configuration
    surreal_url: str = "ws://localhost:8000/rpc"
    surreal_user: str = "root"
    surreal_password: str = "root"
    surreal_namespace: str = "open_notebook"
    surreal_database: str = "open_notebook"

    # Redis (Optional) - for background queue processing
    redis_url: Optional[str] = None
    redis_queue_name: str = "learnfast"
    redis_job_timeout: int = 3600

    # Background queue
    rq_enabled: bool = False
    local_extraction_concurrency: int = 2
    local_ingestion_concurrency: int = 1

    # Fitbit OAuth
    fitbit_redirect_uri: Optional[str] = None

    # Email inbound (reply-to) domain
    email_reply_domain: Optional[str] = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def validate_cors_origins(cls, v):
        """Validate and populate CORS origins from environment or defaults."""
        # Handle empty string (from env var set to empty value)
        if v is None or v == "":
            return build_cors_origins()
        # Already a list with values
        if isinstance(v, list) and len(v) > 0:
            return v
        # Empty list - build defaults
        if isinstance(v, list):
            return build_cors_origins()
        # Parse string value
        if isinstance(v, str):
            parsed = parse_cors_origins(v)
            if parsed:
                return parsed
            return build_cors_origins()
        return build_cors_origins()

    @field_validator("frontend_url", mode="before")
    @classmethod
    def validate_frontend_url(cls, v):
        """Validate frontend URL or return None for auto-detection."""
        if v and isinstance(v, str) and v.strip():
            return v.strip()
        return None

    @field_validator("fitbit_redirect_uri", mode="before")
    @classmethod
    def validate_fitbit_redirect(cls, v, info):
        """Build Fitbit redirect URI from frontend URL if not explicitly set."""
        if v and isinstance(v, str) and v.strip():
            return v.strip()
        # Try to build from frontend_url or environment
        frontend = info.data.get("frontend_url") if isinstance(info.data, dict) else None
        if not frontend:
            frontend = os.getenv("FRONTEND_URL", "").strip()
        if frontend:
            return f"{frontend.rstrip('/')}/api/fitbit/callback"
        return "http://localhost:5173/api/fitbit/callback"

    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"
    )


# Singleton instance of settings to be used across the application
settings = Settings()
