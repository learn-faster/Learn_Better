import logging
import json
import os
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

from src.database.connections import postgres_conn
from src.models.schemas import LearningChunk
from src.services.llm_service import llm_service
from src.routers.ai import LLMConfig
from src.config import settings

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


class ContentRetriever:
    """
    Retrieves and formats learning content with LLM-enhanced rewriting and caching.
    Generates multiple flashcards per concept for spaced repetition learning.
    """

    REWRITE_PROMPT_TEMPLATE = """You are an expert pedagogical writer. Your goal is to take a set of raw information chunks about a specific topic and rewrite them into a high-quality, coherent, and engaging educational lesson.

Topic: {topic}
Target Time: {time_budget} minutes

Guidelines:
1.  **Structure**: Create a logical flow with an introduction, detailed explanation, and a summary.
2.  **Clarity**: Use clear, concise language. Explain complex terms if they appear.
3.  **Engagement**: Use a helpful and encouraging tone.
4.  **Markdown**: Use proper Markdown formatting (headers, lists, bold text) to make the content readable.
5.  **Conciseness**: Ensure the content is appropriate for a {time_budget}-minute reading session. Do not include irrelevant fluff.
6.  **Formatting**: Use proper Markdown (headers, lists, etc.). Use LaTeX for math notation (e.g. \( ... \) for inline, \[ ... \] for block equations).
7.  **Accuracy**: Stick to the facts provided in the chunks. Do not hallucinate external information unless it's common knowledge used for analogies.

Raw Chunks:
{raw_chunks}

High-Quality Lesson:
"""

    GENERATE_LESSON_PROMPT_TEMPLATE = """You are an expert pedagogical writer and educator. Create a comprehensive educational lesson on the following topic from your knowledge.

Topic: {topic}
Target Time: {time_budget} minutes

Guidelines:
1.  **Structure**: Create a logical flow with an introduction, detailed explanation, examples, and a summary.
2.  **Clarity**: Use clear, concise language. Define key terms.
3.  **Engagement**: Use a helpful and encouraging tone.
4.  **Markdown**: Use proper Markdown formatting (headers, lists, bold text, code blocks if relevant) to make the content readable.
5.  **Depth**: Cover the topic thoroughly but appropriately for a {time_budget}-minute lesson.
6.  **Examples**: Include practical examples or analogies to help understanding.

Create a high-quality educational lesson on "{topic}":
"""

    FLASHCARD_GENERATION_PROMPT = """You are an expert tutor creating flashcards for spaced repetition learning.

Based on the following lesson content, create exactly {count} flashcards that cover the key concepts, definitions, and important facts.

Requirements for each flashcard:
- Focus on a single, atomic concept
- The "front" should be a clear question or term
- The "back" should be a concise but complete answer
- Cover different aspects: definitions, examples, applications, comparisons, formulas

Lesson Content:
{content}

IMPORTANT: You MUST return a JSON object with a "flashcards" key containing an array of exactly {count} flashcard objects.
Each flashcard object must have "front" and "back" string fields.

Example format:
{{"flashcards": [
  {{"front": "What is X?", "back": "X is..."}},
  {{"front": "How do you Y?", "back": "To Y, you..."}},
  {{"front": "Define Z", "back": "Z means..."}}
]}}

Return ONLY the JSON object, no other text:"""

    def __init__(self):
        """Initialize the content retriever."""
        self.connection = postgres_conn

    def _calculate_flashcard_count(self, time_budget_minutes: int) -> int:
        """
        Calculate number of flashcards to generate based on time budget.
        Rule of thumb: ~1 card per 3 minutes of content, minimum 3, maximum 10.
        """
        count = max(3, min(10, time_budget_minutes // 3))
        return count

    def retrieve_chunks_by_concept(self, concept: str) -> List[LearningChunk]:
        """
        Retrieve all content chunks associated with a specific concept.
        
        Args:
            concept: Concept name
            
        Returns:
            List of LearningChunk objects
        """
        if not concept:
            return []
            
        try:
            query = """
                SELECT id, doc_source, content, concept_tag, created_at
                FROM learning_chunks
                WHERE lower(concept_tag) = lower(%s)
                ORDER BY id ASC
            """
            
            results = self.connection.execute_query(query, (concept,))
            
            chunks = []
            for row in results:
                chunks.append(LearningChunk(
                    id=row['id'],
                    doc_source=row['doc_source'],
                    content=row['content'],
                    concept_tag=row['concept_tag'],
                    created_at=row['created_at']
                ))
                
            return chunks
            
        except Exception as e:
            logger.error(f"Error retrieving chunks for concept '{concept}': {str(e)}")
            return []

    def _get_cached_lesson(self, concept_name: str, time_budget: int) -> Optional[str]:
        """Check if a lesson is already cached."""
        try:
            query = """
                SELECT content_markdown 
                FROM cached_lessons 
                WHERE lower(concept_name) = lower(%s) AND time_budget = %s
                LIMIT 1
            """
            result = self.connection.execute_query(query, (concept_name, time_budget))
            if result:
                return result[0]['content_markdown']
        except Exception as e:
            logger.error(f"Error checking lesson cache: {e}")
        return None

    def _cache_lesson(self, concept_name: str, time_budget: int, content: str):
        """Save a generated lesson to the cache."""
        try:
            query = """
                INSERT INTO cached_lessons (concept_name, time_budget, content_markdown)
                VALUES (%s, %s, %s)
            """
            self.connection.execute_query(query, (concept_name, time_budget, content))
        except Exception as e:
            logger.error(f"Error caching lesson: {e}")

    def _get_llm_config(self) -> LLMConfig:
        """Get the LLM configuration using the main model (not rewrite_model which may be invalid)."""
        return LLMConfig(
            provider=settings.llm_provider,
            model=settings.llm_model,  # Use main model, not rewrite_model which may be invalid
            base_url=settings.ollama_base_url
        )

    async def _rewrite_with_llm(self, target_concept: str, time_budget: int, raw_content: str) -> str:
        """Use LLM to rewrite raw content into a coherent lesson."""
        try:
            # Enforce context window limit
            context_window = settings.rewrite_context_window
            truncated_content = raw_content[:context_window]
            if len(raw_content) > context_window:
                logger.warning(f"Truncated content for LLM rewrite for {target_concept} (budget: {time_budget}m)")

            prompt = self.REWRITE_PROMPT_TEMPLATE.format(
                topic=target_concept.title(),
                time_budget=time_budget,
                raw_chunks=truncated_content
            )

            config = self._get_llm_config()

            response_content = await llm_service.get_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                response_format=None,  # Standard text response
                config=config
            )

            return response_content.strip()

        except Exception as e:
            logger.error(f"LLM rewrite failed for {target_concept}: {e}")
            return raw_content  # Fallback to raw content if LLM fails

    async def _generate_lesson_from_scratch(self, target_concept: str, time_budget: int) -> str:
        """Generate lesson content from scratch using LLM when no chunks exist."""
        try:
            prompt = self.GENERATE_LESSON_PROMPT_TEMPLATE.format(
                topic=target_concept.title(),
                time_budget=time_budget
            )

            config = self._get_llm_config()

            logger.info(f"Generating lesson from scratch for {target_concept} ({time_budget}m)")

            response_content = await llm_service.get_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                response_format=None,
                config=config
            )

            return response_content.strip()

        except Exception as e:
            logger.error(f"LLM lesson generation failed for {target_concept}: {e}")
            return f"# {target_concept.title()}\n\nUnable to generate lesson content. Please try again later."

    async def _generate_flashcards(self, content: str, count: int) -> List[Dict[str, str]]:
        """Generate flashcards from lesson content using LLM."""
        try:
            prompt = self.FLASHCARD_GENERATION_PROMPT.format(
                content=content[:8000],  # Limit content to avoid token limits
                count=count
            )

            config = self._get_llm_config()

            logger.info(f"Generating {count} flashcards from lesson content")

            response_text = await llm_service.get_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                response_format="json",
                config=config
            )

            # Clean up response if it has markdown code blocks
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            flashcards = json.loads(response_text.strip())

            # Validate and normalize structure
            # Handle both array of flashcards and single flashcard object
            if isinstance(flashcards, dict):
                # Single flashcard returned - wrap in list
                if "front" in flashcards and "back" in flashcards:
                    flashcards = [flashcards]
                # Possibly wrapped in a key like "flashcards" or "cards"
                elif "flashcards" in flashcards:
                    flashcards = flashcards["flashcards"]
                elif "cards" in flashcards:
                    flashcards = flashcards["cards"]
                else:
                    flashcards = []

            if isinstance(flashcards, list):
                return [
                    {"front": fc.get("front", ""), "back": fc.get("back", "")}
                    for fc in flashcards
                    if isinstance(fc, dict) and "front" in fc and "back" in fc
                ]

            return []

        except Exception as e:
            logger.error(f"Flashcard generation failed: {e}")
            return []

    async def get_lesson_content(self, path_concepts: List[str], time_budget_minutes: int = 30) -> str:
        """
        Generate a complete formatted lesson for a learning path.

        Checks cache first, otherwise generates using LLM rewriting.
        Falls back to generating from scratch if no chunks exist.

        Args:
            path_concepts: Ordered list of concept names
            time_budget_minutes: Total time available for the lesson

        Returns:
            Formatted Markdown string
        """
        if not path_concepts:
            return ""

        target_concept = path_concepts[-1]

        # 1. Check Cache
        cached = self._get_cached_lesson(target_concept, time_budget_minutes)
        if cached:
            logger.info(f"Returning cached lesson for {target_concept} ({time_budget_minutes}m)")
            return cached

        # 2. Gather All Raw Content
        lesson_parts = []
        for concept in path_concepts:
            chunks = self.retrieve_chunks_by_concept(concept)
            for chunk in chunks:
                lesson_parts.append(f"Source: {chunk.doc_source}\n\nContent: ```\n{chunk.content}\n```")
        
        raw_full_content = "\n\n".join([f"### {i+1}\n{part}" for i,part in enumerate(lesson_parts)])

        if not raw_full_content.strip():
            # No chunks exist - generate lesson from scratch
            logger.info(f"No chunks found for {target_concept}, generating from scratch")
            enhanced_lesson = await self._generate_lesson_from_scratch(target_concept, time_budget_minutes)
        else:
            # Rewrite existing chunks into coherent lesson
            logger.info(f"Generating new lesson for {target_concept} ({time_budget_minutes}m)")
            enhanced_lesson = await self._rewrite_with_llm(target_concept, time_budget_minutes, raw_full_content)

        # 3. Rewrite with LLM
        logger.info(f"Generating new lesson for {target_concept} ({time_budget_minutes}m)")
        enhanced_lesson = await self._rewrite_with_llm(target_concept, time_budget_minutes, raw_full_content)

        # 4. Cache and Return
        self._cache_lesson(target_concept, time_budget_minutes, enhanced_lesson)

        return enhanced_lesson

    async def get_lesson_with_flashcards(
        self,
        path_concepts: List[str],
        time_budget_minutes: int = 30
    ) -> Dict[str, Any]:
        """
        Generate a complete lesson with multiple flashcards for spaced repetition.

        Args:
            path_concepts: Ordered list of concept names
            time_budget_minutes: Total time available for the lesson

        Returns:
            Dict containing:
                - content_markdown: The lesson text
                - flashcards: List of flashcard dicts with 'front' and 'back'
        """
        if not path_concepts:
            return {"content_markdown": "", "flashcards": []}

        target_concept = path_concepts[-1]

        # Get or generate the lesson content
        lesson_content = await self.get_lesson_content(path_concepts, time_budget_minutes)

        # Generate flashcards from the lesson content
        card_count = self._calculate_flashcard_count(time_budget_minutes)
        flashcards = await self._generate_flashcards(lesson_content, card_count)

        return {
            "content_markdown": lesson_content,
            "flashcards": flashcards
        }
