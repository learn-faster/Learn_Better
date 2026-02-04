"""
Application configuration using Pydantic Settings.
Handles environment variables and global application parameters.
"""
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    """
    Application settings from environment variables.
    Uses Pydantic to validate and cast environment variables.
    """
    
    # Database
    database_url: str = "postgresql://learnfast:password@localhost:5433/learnfast"
    
    # Uploads
    upload_dir: str = "./data/documents"
    
    # CORS
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # File upload limits
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_pdf_extensions: List[str] = [".pdf"]
    allowed_image_extensions: List[str] = [".jpg", ".jpeg", ".png"]
    
    # LLM Settings
    llm_provider: str = "openai"  # openai, groq, ollama, openrouter
    openai_api_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "gpt-3.5-turbo" 
    use_opik: bool = False
    opik_api_key: str = ""

    # Embedding Settings
    embedding_provider: str = "ollama" # openai, ollama
    embedding_model: str = "embeddinggemma:latest" 
    ollama_embedding_model: Optional[str] = None # Deprecated, alias for backward compat if needed

    # Granular Model Settings (Optional - overrides llm_model if set)
    extraction_model: Optional[str] = None
    extraction_context_window: int = 100000
    rewrite_model: Optional[str] = None
    rewrite_context_window: int = 10000
    
    class Config:
        """Pydantic configuration dict."""
        env_file = ".env"
        case_sensitive = False
        extra = "ignore" # Ignore extra env vars


# Singleton instance of settings to be used across the application
settings = Settings()
