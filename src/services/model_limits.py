"""Model context limits and extraction recommendations."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Optional, Dict, Any


@dataclass(frozen=True)
class ModelLimit:
    provider: str
    pattern: str
    context_tokens: int


DEFAULT_CONTEXT_TOKENS = 8192

MODEL_LIMITS = [
    # OpenAI
    ModelLimit("openai", r"gpt-4o-mini", 128000),
    ModelLimit("openai", r"gpt-4o", 128000),
    ModelLimit("openai", r"gpt-4-turbo", 128000),
    ModelLimit("openai", r"gpt-4\.1", 128000),
    ModelLimit("openai", r"gpt-4", 8192),
    ModelLimit("openai", r"gpt-3\.5-turbo", 4096),
    # Anthropic
    ModelLimit("anthropic", r"claude-3\.5", 200000),
    ModelLimit("anthropic", r"claude-3", 200000),
    # Google / Gemini
    ModelLimit("google", r"gemini-1\.5", 128000),
    ModelLimit("google", r"gemini", 128000),
    # Mistral
    ModelLimit("mistral", r"mistral", 32768),
    # OpenRouter or custom providers: treat by model name only
    ModelLimit("openrouter", r"gpt-4o", 128000),
    ModelLimit("openrouter", r"gpt-4", 8192),
    ModelLimit("openrouter", r"claude-3\.5", 200000),
    ModelLimit("openrouter", r"claude-3", 200000),
    # Local / Ollama (unknown)
    ModelLimit("ollama", r".*", DEFAULT_CONTEXT_TOKENS),
]


def _normalize(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def get_context_tokens(provider: Optional[str], model: Optional[str]) -> int:
    provider_norm = _normalize(provider) or "openai"
    model_norm = _normalize(model)
    for entry in MODEL_LIMITS:
        if entry.provider != provider_norm:
            continue
        if re.search(entry.pattern, model_norm):
            return entry.context_tokens
    # Fallback: try model-only match across providers
    if model_norm:
        for entry in MODEL_LIMITS:
            if re.search(entry.pattern, model_norm):
                return entry.context_tokens
    return DEFAULT_CONTEXT_TOKENS


def recommend_extraction_settings(
    provider: Optional[str],
    model: Optional[str],
    *,
    char_per_token: int = 4,
    safety_factor: float = 0.6,
    min_chars: int = 4000,
    max_chars_cap: int = 40000,
    chunk_ratio: float = 0.25,
    chunk_min: int = 600,
    chunk_max: int = 1600,
) -> Dict[str, Any]:
    context_tokens = get_context_tokens(provider, model)
    max_input_tokens = int(context_tokens * safety_factor)
    max_input_chars = max_input_tokens * char_per_token
    recommended_extraction_max_chars = max(min_chars, min(max_chars_cap, max_input_chars))
    recommended_chunk_size = int(max(chunk_min, min(chunk_max, recommended_extraction_max_chars * chunk_ratio)))
    return {
        "provider": provider or "unknown",
        "model": model or "unknown",
        "context_tokens": context_tokens,
        "max_input_chars": max_input_chars,
        "recommended_extraction_max_chars": recommended_extraction_max_chars,
        "recommended_chunk_size": recommended_chunk_size,
        "char_per_token": char_per_token,
        "safety_factor": safety_factor,
    }
