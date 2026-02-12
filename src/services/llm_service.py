"""
LLM Service for AI-powered learning assistance.
Handles communication with various LLM providers to generate flashcards,
multiple-choice questions, and personalized learning paths.
"""
import json
import time
import httpx
import traceback
import re
import os
from typing import Optional
from openai import AsyncOpenAI, APIConnectionError, APIStatusError
from src.config import settings
from openai import (
    APIConnectionError,
    BadRequestError,
    AuthenticationError,
    PermissionDeniedError,
    NotFoundError,
    RateLimitError
)
from src.services.prompts import FLASHCARD_PROMPT_TEMPLATE, QUESTION_PROMPT_TEMPLATE, LEARNING_PATH_PROMPT_TEMPLATE, CONCEPT_EXTRACTION_PROMPT_TEMPLATE, FLASHCARD_TAGGING_PROMPT_TEMPLATE
from src.observability.opik import build_opik_config, init_opik, get_opik_context
from opik import track
from src.utils.logger import logger
from starlette.concurrency import run_in_threadpool

class RateLimitException(ValueError):
    def __init__(self, message: str, retry_after_seconds: Optional[int] = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def _extract_retry_after_seconds(error: Exception) -> Optional[int]:
    # Try standard header first
    retry_after = None
    try:
        if hasattr(error, "response") and error.response is not None:
            headers = getattr(error.response, "headers", {}) or {}
            retry_after = headers.get("retry-after") or headers.get("Retry-After")
    except Exception:
        retry_after = None
    if retry_after:
        try:
            return int(float(retry_after))
        except Exception:
            pass

    # Parse text like: "Please try again in 1m45.235199999s"
    try:
        msg = str(error)
        match = re.search(r"try again in\s+([0-9]+)m([0-9]+(?:\.[0-9]+)?)s", msg)
        if match:
            minutes = int(match.group(1))
            seconds = float(match.group(2))
            return int(minutes * 60 + seconds)
        match = re.search(r"try again in\s+([0-9]+(?:\.[0-9]+)?)s", msg)
        if match:
            return int(float(match.group(1)))
    except Exception:
        pass

    return None

class LLMService:
    """
    Main service for LLM interactions.
    Manages API clients for different providers and provides high-level methods 
    for common learning tasks.
    """
    
    def __init__(self):
        """Initializes the LLM service using global settings."""
        self.provider = settings.llm_provider.lower()
        self.base_url = settings.ollama_base_url if self.provider == "ollama" else None
        self.model = settings.llm_model
        self._embedding_client = None
        self._embedding_provider = None
        self._embedding_base_url = None
        self._embedding_api_key = None
        
        # Initialize API key based on provider
        if self.provider == "openai":
            self.api_key = settings.openai_api_key
        elif self.provider == "groq":
            self.api_key = settings.groq_api_key
        elif self.provider == "openrouter":
            self.api_key = settings.openrouter_api_key
        else:
            self.api_key = ""

        if settings.use_opik:
            try:
                init_opik(build_opik_config())
            except Exception as e:
                logger.warning(f"Opik configuration failed: {e}")

        # Create HTTP client with robust timeout (5 minutes for slow LLMs like Ollama)
        # trust_env=True is critical for users behind proxies/VPNs
        # Re-using a single client is better for performance and prevents resource leaks
        timeout = httpx.Timeout(300.0, connect=30.0)
        self.http_client = httpx.AsyncClient(timeout=timeout, trust_env=True)
        
        if self.provider == "openai":
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                http_client=self.http_client
            )
        elif self.provider == "groq":
             # Groq uses OpenAI-compatible client
            self.client = AsyncOpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=self.api_key,
                http_client=self.http_client
            )
        elif self.provider == "openrouter":
            # OpenRouter uses OpenAI-compatible API
            self.client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.api_key,
                http_client=self.http_client
            )
        elif self.provider == "ollama":
             # Ollama also has an OpenAI compatible endpoint
            self.client = AsyncOpenAI(
                base_url=f"{self.base_url.rstrip('/')}/v1" if self.base_url else "http://localhost:11434/v1",
                api_key="ollama", # required but unused
                http_client=self.http_client
            )
        else:
            # Fallback to OpenAI if provider unknown to avoid crash
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                http_client=self.http_client
            )


    async def close(self):
        """Closes the underlying HTTP client."""
        await self.http_client.aclose()


    def _get_client_for_config(self, config):
        """
        Creates a temporary AsyncOpenAI client based on overrides.
        Note: Reuses self.http_client to avoid resource leaks.
        
        Args:
            config: An optional Pydantic model containing provider-specific overrides.
            
        Returns:
            tuple[AsyncOpenAI, str]: A tuple of (client, model_name).
        """
        if not config:
            return self.client, self.model, self.provider

        # Support both objects (Pydantic) and dictionaries
        provider = (getattr(config, 'provider', None) or (config.get('provider') if isinstance(config, dict) else 'openai')).lower()
        api_key = getattr(config, 'api_key', None) or (config.get('api_key') if isinstance(config, dict) else None)
        base_url = getattr(config, 'base_url', None) or (config.get('base_url') if isinstance(config, dict) else None)
        model = getattr(config, 'model', None) or (config.get('model') if isinstance(config, dict) else self.model) or self.model

        # Determine effective base_url
        effective_base_url = base_url
        if provider == "huggingface" and not effective_base_url:
            raise ValueError("huggingface provider requires an OpenAI-compatible base_url")
        if not effective_base_url:
            if provider == "groq":
                effective_base_url = "https://api.groq.com/openai/v1"
            elif provider == "openrouter":
                effective_base_url = "https://openrouter.ai/api/v1"
            elif provider == "together":
                effective_base_url = "https://api.together.xyz/v1"
            elif provider == "fireworks":
                effective_base_url = "https://api.fireworks.ai/inference/v1"
            elif provider == "mistral":
                effective_base_url = "https://api.mistral.ai/v1"
            elif provider == "deepseek":
                effective_base_url = "https://api.deepseek.com/v1"
            elif provider == "perplexity":
                effective_base_url = "https://api.perplexity.ai"
            elif provider == "huggingface":
                effective_base_url = base_url
            elif provider == "ollama":
                effective_base_url = f"{settings.ollama_base_url.rstrip('/')}/v1"
            elif provider == "ollama_cloud":
                # For ollama cloud, we expect the base_url to be provided from settings or config
                # Fallback to a common default if not provided
                effective_base_url = base_url or "https://api.ollama.com/v1"
            # OpenAI default is handled by AsyncOpenAI internally if base_url is None
        
        if effective_base_url:
            effective_base_url = effective_base_url.rstrip('/')

        # Determine effective api_key
        effective_api_key = api_key
        if not effective_api_key:
            if provider == "openai":
                effective_api_key = settings.openai_api_key
            elif provider == "groq":
                effective_api_key = settings.groq_api_key
            elif provider == "openrouter":
                effective_api_key = settings.openrouter_api_key
            elif provider == "ollama":
                effective_api_key = "ollama"

        if provider in {"openai", "groq", "openrouter"} and not effective_api_key:
            raise ValueError(f"{provider} provider requires an API key.")

        return AsyncOpenAI(
            base_url=effective_base_url,
            api_key=effective_api_key or "",
            http_client=self.http_client
        ), model, provider




    def _update_opik_span(self, metadata=None, usage=None, model=None, provider=None):
        ctx = get_opik_context()
        if ctx is None:
            return
        try:
            ctx.update_current_span(
                metadata=metadata,
                usage=usage,
                model=model,
                provider=provider
            )
        except Exception:
            pass

    @track
    async def get_chat_completion(self, messages: list[dict], response_format: str = None, config=None) -> str:
        """
        Generic method to get chat completions from the configured LLM provider.
        """
        client, model, provider = self._get_client_for_config(config)
        
        try:
            start_ts = time.perf_counter()
            api_response_format = None
            if response_format == "json":
                api_response_format = {"type": "json_object"}
            
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                response_format=api_response_format
            )
            
            latency_ms = int((time.perf_counter() - start_ts) * 1000)
            usage = getattr(response, "usage", None)
            if usage is not None and hasattr(usage, "model_dump"):
                usage = usage.model_dump()
            self._update_opik_span(
                metadata={"latency_ms": latency_ms, "response_format": response_format},
                usage=usage,
                model=model,
                provider=provider
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM Chat Error: {type(e).__name__}: {e}")
            # Log more details if it's an OpenAI API error
            if hasattr(e, 'response'):
                try:
                    logger.error(f"DEBUG: Error Response Body: {e.response.text}")
                except Exception:
                    pass
            user_msg = self._format_llm_error(e)
            if isinstance(e, RateLimitError):
                retry_after = _extract_retry_after_seconds(e)
                raise RateLimitException(user_msg, retry_after_seconds=retry_after) from e
            raise ValueError(user_msg) from e

    @track
    async def get_vision_completion(self, prompt: str, image_path: str, config=None) -> str:
        """
        Get a completion for a multimodal (text + image) request.
        """
        import base64
        
        client, model, provider = self._get_client_for_config(config)
        start_ts = time.perf_counter()
        
        def _read_image():
            with open(image_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode("utf-8")
        
        base64_image = await run_in_threadpool(_read_image)
        
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ]
            )
            latency_ms = int((time.perf_counter() - start_ts) * 1000)
            usage = getattr(response, "usage", None)
            if usage is not None and hasattr(usage, "model_dump"):
                usage = usage.model_dump()
            self._update_opik_span(
                metadata={"latency_ms": latency_ms, "response_format": "multimodal"},
                usage=usage,
                model=model,
                provider=provider
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM Vision Error: {e}")
            user_msg = self._format_llm_error(e)
            raise ValueError(user_msg) from e

    def _format_llm_error(self, error: Exception) -> str:
        """
        Return a short, user-facing LLM error message.
        """
        if isinstance(error, APIStatusError):
            status = getattr(error, "status_code", None)
            body = getattr(error, "response", None)
            detail = ""
            if body is not None:
                try:
                    detail = str(body.json())
                except Exception:
                    detail = str(body)
            if status == 413 or "Request too large" in detail or "tokens per minute" in detail:
                return (
                    "LLM request too large for this model. Reduce chunk size or extraction window, "
                    "or switch to a larger-capacity model."
                )
        if isinstance(error, AuthenticationError):
            return "LLM authentication failed. Check your API key."
        if isinstance(error, PermissionDeniedError):
            return "LLM permission denied. Check your API key permissions."
        if isinstance(error, RateLimitError):
            return "LLM rate limit exceeded. Try again in a moment."
        if isinstance(error, NotFoundError):
            return "LLM endpoint not found (404). Check provider, base URL, and model."
        if isinstance(error, BadRequestError):
            return "LLM request rejected. Check the model name and settings."
        if isinstance(error, APIConnectionError):
            return "Cannot reach the LLM server. Check base URL and network."
        # Fallback
        return "LLM request failed. Check provider, model, and API credentials."


    async def _get_completion(self, prompt: str, system_prompt: str = "You are a helpful study assistant.", config=None):
        """
        Low-level helper to get a text completion from the LLM.
        
        Args:
            prompt (str): The user prompt.
            system_prompt (str): The system instructions.
            config: Optional configuration overrides.
            
        Returns:
            str: The raw text response from the LLM.
            
        Raises:
            Exception: If the API request fails.
        """
        return await self.get_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format="json", # Most internal calls use JSON system prompt
            config=config
        )

    def _extract_and_parse_json(self, text: str):
        """
        Robustly extract and parse JSON from LLM response text.
        Handles code blocks, trailing commas, and common formatting issues.
        """
        # 1. Basic extraction from code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        # 2. Find the first [ or { and last ] or } if still messy
        start_brace = text.find('{')
        start_bracket = text.find('[')
        
        if start_brace != -1 or start_bracket != -1:
            if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
                start = start_brace
                end = text.rfind('}')
            else:
                start = start_bracket
                end = text.rfind(']')
            
            if start != -1 and end != -1:
                text = text[start:end+1]

        # 3. Clean up common issues
        # Trailing commas in arrays or objects
        text = re.sub(r',\s*}', '}', text)
        text = re.sub(r',\s*\]', ']', text)
        
        if not text or not text.strip():
            raise ValueError("LLM returned an empty or whitespace-only response.")

        # Attempt to parse
        try:
            return json.loads(text)

        except json.JSONDecodeError as e:
            # Last ditch effort: if single quotes were used instead of double quotes
            # or if the JSON is over-escaped (e.g. \"key\": \"value\")
            try:
                # 1. Try resolving escaped quotes content
                # This fixes {\"key\": \"value\"} -> {"key": "value"}
                # AND handles newlines if present
                if '\\"' in text or '\\n' in text:
                    text_unescaped = text.replace('\\"', '"').replace('\\n', '\n')
                    return json.loads(text_unescaped)
                
                # 2. Try single quotes fix
                # Replace 'key': with "key":
                text_fixed = re.sub(r"'(\w+)':", r'"\1":', text)
                # Replace : 'value' with : "value"
                text_fixed = re.sub(r":\s*'([^']*)'", r': "\1"', text_fixed)
                return json.loads(text_fixed)
            except Exception:
                # 3. Last ditch: try full unescape
                try:
                    # This handles \t, \r, etc.
                    # Use a safe way to unescape without executing code
                    text_decoded = bytes(text, "utf-8").decode("unicode_escape")
                    return json.loads(text_decoded)
                except:
                   pass

                # 4. Fallback: If it looks like a valid markdown response, wrap it in a JSON structure
                # This prevents crashes when the model ignores JSON instructions but gives good content
                if text.strip().startswith('#') or 'module' in text.lower():
                    logger.warning("LLM returned raw markdown. Wrapping in fallback JSON.")
                    return {
                        "title": "Generated Curriculum",
                        "description": "Content generated from your request.",
                        "estimated_total_time": "30 mins",
                        "modules": [
                            {
                                "title": "Overview",
                                "description": "Key concepts and summary",
                                "module_type": "PRIMER",
                                "content": text,
                                "estimated_time": "15 mins"
                            }
                        ]
                    }

                # Re-raise original error with additional context if possible
                raise json.JSONDecodeError(
                    f"Failed to parse LLM response as JSON. Original error: {e.msg}\nRaw Text Preview: {text[:200]}...",
                    e.doc,
                    e.pos
                ) from None

    def _get_embedding_client(self):
        """
        Returns a client configured for embeddings based on settings.embedding_provider.
        """
        provider = settings.embedding_provider.lower()
        api_key = settings.embedding_api_key or ""
        base_url = settings.embedding_base_url

        if provider == "openai":
            effective_key = api_key or settings.openai_api_key
            if not effective_key:
                raise ValueError("OpenAI embedding provider selected but OPENAI_API_KEY is missing.")
            effective_base = None
            effective_api_key = effective_key
        elif provider == "ollama":
            effective_base = f"{(base_url or settings.ollama_base_url).rstrip('/')}/v1"
            effective_api_key = "ollama"
        elif provider in {"openrouter", "together", "fireworks", "mistral", "deepseek", "perplexity", "huggingface", "custom", "google"}:
            default_base = {
                "openrouter": "https://openrouter.ai/api/v1",
                "together": "https://api.together.xyz/v1",
                "fireworks": "https://api.fireworks.ai/inference/v1",
                "mistral": "https://api.mistral.ai/v1",
                "deepseek": "https://api.deepseek.com/v1",
                "perplexity": "https://api.perplexity.ai",
                "huggingface": None,
                "custom": None,
                "google": None
            }.get(provider)

            effective_base = (base_url or default_base)
            if not effective_base:
                raise ValueError(f"{provider} embedding provider requires a base_url.")
            if not api_key:
                raise ValueError(f"{provider} embedding provider requires an API key.")
            effective_api_key = api_key
        else:
            # Fallback to default client if same provider, or raise
            if provider == self.provider:
                return self.client
            raise ValueError(f"Unsupported Embedding provider: {provider}")

        if effective_base:
            effective_base = effective_base.rstrip('/')

        # Reuse cached embedding client when settings are unchanged.
        if (
            self._embedding_client
            and self._embedding_provider == provider
            and self._embedding_base_url == effective_base
            and self._embedding_api_key == effective_api_key
        ):
            return self._embedding_client

        self._embedding_provider = provider
        self._embedding_base_url = effective_base
        self._embedding_api_key = effective_api_key
        self._embedding_client = AsyncOpenAI(
            base_url=effective_base,
            api_key=effective_api_key or "",
            http_client=self.http_client
        )
        return self._embedding_client

    async def get_embedding(self, text: str) -> list[float]:
        """
        Generates an embedding vector for the input text.
        
        Args:
            text (str): The text to embed.
            
        Returns:
            list[float]: The embedding vector.
        """
        client = self._get_embedding_client()
        model = settings.embedding_model
        
        try:
            # Clean text
            text = text.replace("\n", " ")
            
            response = await client.embeddings.create(
                input=[text],
                model=model
            )
            return response.data[0].embedding
        except APIConnectionError as e:
            provider = settings.embedding_provider
            base_url = settings.embedding_base_url or settings.ollama_base_url
            msg = (
                "Embedding connection error. "
                f"Provider='{provider}', model='{model}', base_url='{base_url}'. "
                "Check the embedding server is running and reachable, or update EMBEDDING_BASE_URL."
            )
            logger.error(msg)
            logger.error(traceback.format_exc())
            raise ValueError(msg) from e
        except Exception as e:
            logger.error(f"Embedding Error: {e}")
            logger.error(traceback.format_exc())
            raise e

    @track
    async def generate_flashcards(self, text: str, count: int = 5, config=None):
        """
        Generates a list of flashcards from the provided text.
        
        Args:
            text (str): Source text content.
            count (int): Desired number of flashcards.
            config: Optional configuration overrides.
            
        Returns:
            list[dict]: A list of flashcard objects containing 'front' and 'back'.
        """
        prompt = FLASHCARD_PROMPT_TEMPLATE.format(text=text, count=count)
        response_text = await self._get_completion(prompt, system_prompt="You are a JSON-speaking flashcard generator.", config=config)
        return self._extract_and_parse_json(response_text)

    @track
    async def tag_flashcards(self, cards: list[dict], config=None) -> list[dict]:
        """
        Assign concept tags to multiple flashcards in a single LLM call.
        Returns a list of {"tags": [...]} aligned with the cards order.
        """
        serialized = json.dumps(
            [{"front": c.get("front", ""), "back": c.get("back", "")} for c in cards],
            ensure_ascii=False
        )
        prompt = FLASHCARD_TAGGING_PROMPT_TEMPLATE.format(cards=serialized)
        response_text = await self._get_completion(prompt, system_prompt="You are a JSON-speaking knowledge engineer.", config=config)
        data = self._extract_and_parse_json(response_text)
        if isinstance(data, dict) and "tags" in data:
            return [data]
        if not isinstance(data, list):
            raise ValueError("Unexpected tagging response format.")
        return data

    @track
    async def generate_questions(self, text: str, count: int = 5, config=None):
        """
        Generates multiple-choice quiz questions from the provided text.
        
        Args:
            text (str): Source text content.
            count (int): Desired number of questions.
            config: Optional configuration overrides.
            
        Returns:
            list[dict]: A list of question objects with options and correct answers.
        """
        prompt = QUESTION_PROMPT_TEMPLATE.format(text=text, count=count)
        response_text = await self._get_completion(prompt, system_prompt="You are a JSON-speaking quiz generator.", config=config)
        return self._extract_and_parse_json(response_text)

    @track
    async def generate_learning_path(self, text: str, goal: str, config=None):
        """
        Generates a structured learning path for a student goal.
        
        Args:
            text (str): Context or source material.
            goal (str): The student's learning objective.
            config: Optional configuration overrides.
            
        Returns:
            dict: A structured JSON object describing the learning path.
        """
        prompt = LEARNING_PATH_PROMPT_TEMPLATE.format(text=text, goal=goal)
        response_text = await self._get_completion(prompt, system_prompt="You are a JSON-speaking curriculum designer.", config=config)
        return self._extract_and_parse_json(response_text)

    @track
    async def extract_concepts(self, text: str, config=None):
        """
        Extracts structured concept data (nodes and edges) from text.
        """
        # Limit context to avoid overflow and extremely slow/empty responses
        # Use shared config so ingestion + AI extraction behave consistently
        max_chars = settings.extraction_max_chars
        prompt_text = text[:max_chars] if text else ""
        
        prompt = CONCEPT_EXTRACTION_PROMPT_TEMPLATE.format(text=prompt_text)
        response_text = await self._get_completion(prompt, system_prompt="You are a JSON-speaking knowledge engineer.", config=config)
        return self._extract_and_parse_json(response_text)

# Local singleton for global use
llm_service = LLMService()
