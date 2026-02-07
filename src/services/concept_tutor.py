import json
import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from src.models.orm import UserSettings
from src.models.schemas import LLMConfig
from src.services.llm_service import llm_service

logger = logging.getLogger(__name__)

class ConceptTutorService:
    """
    Agent V2: providing "Active Intel" for concepts.
    Generates analogies, insights, and Socratic questions to deepen understanding.
    """
    
    @staticmethod
    async def get_active_intel(concept_name: str, db: Session = None, user_id: str = "default_user") -> Optional[Dict[str, Any]]:
        """
        Generate active learning tailored for the concept.
        
        Returns:
            Dict with keys: 'analogy', 'insight', 'question'
        """
        try:
            logger.info(f"Concept Tutor engaging for: {concept_name}")
            
            # Get User LLM Config
            llm_config = None
            if db:
                user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
                if user_settings and user_settings.llm_config:
                    try:
                        # Check for nested structure first
                        # For Concept Tutor, we can use a 'tutor' key or global fallback
                        stored_config = user_settings.llm_config.get("tutor") or user_settings.llm_config.get("global")
                        
                        # Fallback to flat structure
                        if not stored_config and "provider" in user_settings.llm_config:
                            stored_config = user_settings.llm_config
                            
                        if stored_config:
                            clean_config = {k: v for k, v in stored_config.items() if v}
                            if clean_config:
                                llm_config = LLMConfig(**clean_config)
                    except Exception as e:
                        logger.warning(f"Error parsing user LLM config: {e}")

            prompt = f"""
            You are an expert tutor specialized in explaining complex topics simply.
            For the concept: "{concept_name}", provide distinct "Active Intel" to help a student learn faster.
            
            Return ONLY a JSON object with exactly these keys:
            1. "analogy": A concrete, real-world mental model or analogy (1 sentence).
            2. "insight": One non-obvious, high-value fact or connection (1 sentence).
            3. "question": A challenging Socratic question to test deep understanding (1 sentence).
            
            Make it high-quality, dense, and "aha!" inducing.
            """
            
            response = await llm_service._get_completion(
                prompt=prompt,
                system_prompt="You are a master educator. Output JSON only.",
                config=llm_config
            )
            
            # Parse the JSON response
            try:
                import re
                # Extract JSON from response
                text = response
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0]
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0]
                start_brace = text.find('{')
                if start_brace != -1:
                    text = text[start_brace:text.rfind('}')+1]
                response_data = json.loads(text)
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Failed to parse LLM response as JSON: {e}")
                response_data = {}
            
            if not response:
                return ConceptTutorService._get_fallback_intel(concept_name)
                
            return {
                "analogy": response.get("analogy", "Think of it like a puzzle piece."),
                "insight": response.get("insight", "It connects foundational ideas."),
                "question": response.get("question", "How does this relate to what you already know?")
            }
            
        except Exception as e:
            logger.error(f"Error in Concept Tutor: {e}")
            return ConceptTutorService._get_fallback_intel(concept_name)

    @staticmethod
    def _get_fallback_intel(concept_name: str) -> Dict[str, str]:
        return {
            "analogy": f"Imagine {concept_name} as a building block in your knowledge.",
            "insight": "Mastering this unlocks more advanced topics.",
            "question": f"Can you explain {concept_name} in your own words?"
        }
