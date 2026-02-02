import logging
import os
from typing import List, Dict, Any, Optional
import logging
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

    def __init__(self):
        """Initialize the content retriever."""
        self.connection = postgres_conn
        
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

            # Create config override for rewrite
            config = LLMConfig(
                provider=settings.llm_provider,
                model=settings.rewrite_model if settings.rewrite_model else settings.llm_model,
                base_url=settings.ollama_base_url
            )

            response_content = await llm_service.get_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                response_format=None, # Standard text response
                config=config
            )
            
            return response_content.strip()
            
        except Exception as e:
            logger.error(f"LLM rewrite failed for {target_concept}: {e}")
            return raw_content # Fallback to raw content if LLM fails

    async def get_lesson_content(self, path_concepts: List[str], time_budget_minutes: int = 30) -> str:
        """
        Generate a complete formatted lesson for a learning path.
        
        Checks cache first, otherwise generates using LLM rewriting.
        
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
            return f"# {target_concept.title()}\n\n*No detailed content available for this concept.*"

        # 3. Rewrite with LLM
        logger.info(f"Generating new lesson for {target_concept} ({time_budget_minutes}m)")
        enhanced_lesson = await self._rewrite_with_llm(target_concept, time_budget_minutes, raw_full_content)

        # 4. Cache and Return
        self._cache_lesson(target_concept, time_budget_minutes, enhanced_lesson)

        return enhanced_lesson
