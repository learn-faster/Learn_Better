"""
LLM Service for AI-powered learning assistance.
Handles communication with various LLM providers to generate flashcards,
multiple-choice questions, and personalized learning paths.
"""
import json
import httpx
import traceback
import re
from openai import AsyncOpenAI
from src.config import settings
from src.services.prompts import FLASHCARD_PROMPT_TEMPLATE, QUESTION_PROMPT_TEMPLATE, LEARNING_PATH_PROMPT_TEMPLATE
from opik import configure, track

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
        if settings.use_opik:
            configure()

        if self.provider == "openai":
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            )
        elif self.provider == "groq":
             # Groq uses OpenAI-compatible client
            self.client = AsyncOpenAI(
                base_url="https://api.groq.com/openai/v1/",
                api_key=self.api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            )
        elif self.provider == "openrouter":
            # OpenRouter uses OpenAI-compatible API
            self.client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            )
        elif self.provider == "ollama":
             # Ollama also has an OpenAI compatible endpoint
            self.client = AsyncOpenAI(
                base_url=f"{self.base_url}/v1",
                api_key="ollama", # required but unused
                http_client=httpx.AsyncClient(trust_env=False)
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def _get_client_for_config(self, config):
        """
        Creates a temporary AsyncOpenAI client based on overrides.
        
        Args:
            config: An optional Pydantic model containing provider-specific overrides.
            
        Returns:
            tuple[AsyncOpenAI, str]: A tuple of (client, model_name).
        """
        if not config:
            return self.client, self.model

        provider = config.provider.lower()
        api_key = config.api_key
        base_url = config.base_url
        model = config.model or self.model

        if provider == "openai":
            return AsyncOpenAI(
                api_key=api_key or self.api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            ), model
        elif provider == "groq":
            return AsyncOpenAI(
                base_url="https://api.groq.com/openai/v1/",
                api_key=api_key or settings.groq_api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            ), model
        elif provider == "openrouter":
            return AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key or settings.openrouter_api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            ), model
        elif provider == "ollama":
             return AsyncOpenAI(
                base_url=f"{base_url or settings.ollama_base_url}/v1",
                api_key="ollama",
                http_client=httpx.AsyncClient(trust_env=False)
            ), model
        else:
             # Fallback to default
             return self.client, self.model

    @track
    async def get_chat_completion(self, messages: list[dict], response_format: str = None, config=None) -> str:
        """
        Generic method to get chat completions from the configured LLM provider.
        
        Args:
            messages (list[dict]): List of message objects (e.g., [{"role": "user", "content": "..."}]).
            response_format (str): Optional format, e.g. "json".
            config: Optional configuration overrides.
            
        Returns:
            str: The content of the response message.
        """
        client, model = self._get_client_for_config(config)
        
        try:
            # Determine correct response format param based on provider compatibility
            # OpenAI/Groq/Ollama-via-OpenAI-Client all support { "type": "json_object" } for JSON mode
            # provided the models support it.
            api_response_format = None
            if response_format == "json":
                api_response_format = {"type": "json_object"}
            
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                response_format=api_response_format
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"LLM Chat Error: {e}")
            traceback.print_exc()
            raise e

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
        
        # Attempt to parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Last ditch effort: if single quotes were used instead of double quotes
            # This is risky but often fixes LLM "JSON"
            try:
                # Replace 'key': with "key":
                text_fixed = re.sub(r"'(\w+)':", r'"\1":', text)
                # Replace : 'value' with : "value"
                text_fixed = re.sub(r":\s*'([^']*)'", r': "\1"', text_fixed)
                return json.loads(text_fixed)
            except:
                # Re-raise original error if fix fails
                raise

    def _get_embedding_client(self):
        """
        Returns a client configured for embeddings based on settings.embedding_provider.
        """
        provider = settings.embedding_provider.lower()
        
        if provider == "openai":
            return AsyncOpenAI(
                api_key=settings.openai_api_key,
                http_client=httpx.AsyncClient(trust_env=False)
            )
        elif provider == "ollama":
             return AsyncOpenAI(
                base_url=f"{settings.ollama_base_url}/v1",
                api_key="ollama",
                http_client=httpx.AsyncClient(trust_env=False)
            )
        else:
            # Fallback to default client if same provider, or raise
            if provider == self.provider:
                return self.client
            raise ValueError(f"Unsupported Embedding provider: {provider}")

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
        except Exception as e:
            print(f"Embedding Error: {e}")
            traceback.print_exc()
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

# Local singleton for global use
llm_service = LLMService()
