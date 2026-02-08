"""
Memory Service for Goal Manifestation Agent.
Handles:
1. Structured Memory (Key-Value) via AgentMemory ORM.
2. Semantic Memory (Vector Search) via VectorStorage.
3. Scratchpad (Persistent text buffer).
"""
import logging
from typing import Optional, List, Any, Dict
from datetime import datetime
from src.database.connections import postgres_conn
from src.ingestion.vector_storage import VectorStorage
from src.models.orm import AgentMemory, AgentMemoryEpisodic, AgentMemorySemantic, AgentMemoryProcedural
from src.database.orm import SessionLocal

logger = logging.getLogger(__name__)

class MemoryService:
    """
    Unified interface for Agent Memory.
    """
    
    def __init__(self):
        self.vector_storage = VectorStorage()
        
    # --- Structured Memory (CRUD) ---
    
    def get_memory(self, key: str, user_id: str = "default_user") -> Optional[Any]:
        """Retrieve a structured memory value by key."""
        session = SessionLocal()
        try:
            memory = session.query(AgentMemory).filter_by(user_id=user_id, key=key).first()
            if memory:
                return memory.value
            return None
        except Exception as e:
            logger.error(f"Error getting memory {key}: {e}")
            return None
        finally:
            session.close()

    def set_memory(self, key: str, value: Any, user_id: str = "default_user", category: str = "general"):
        """Set or update a structured memory value."""
        session = SessionLocal()
        try:
            memory = session.query(AgentMemory).filter_by(user_id=user_id, key=key).first()
            if memory:
                memory.value = value
                memory.category = category
                memory.updated_at = datetime.utcnow()
            else:
                memory = AgentMemory(user_id=user_id, key=key, value=value, category=category)
                session.add(memory)
            session.commit()
        except Exception as e:
            logger.error(f"Error setting memory {key}: {e}")
            session.rollback()
        finally:
            session.close()

    def delete_memory(self, key: str, user_id: str = "default_user"):
        """Delete a structured memory item."""
        session = SessionLocal()
        try:
            session.query(AgentMemory).filter_by(user_id=user_id, key=key).delete()
            session.commit()
        except Exception as e:
            logger.error(f"Error deleting memory {key}: {e}")
            session.rollback()
        finally:
            session.close()

    # --- Scratchpad ---

    def get_scratchpad(self, user_id: str = "default_user") -> str:
        """Get the current scratchpad content."""
        val = self.get_memory("scratchpad", user_id)
        return val if isinstance(val, str) else ""

    def update_scratchpad(self, content: str, user_id: str = "default_user"):
        """Update the scratchpad content."""
        self.set_memory("scratchpad", content, user_id, category="scratchpad")
        
    def append_to_scratchpad(self, content: str, user_id: str = "default_user"):
        """Append text to the scratchpad."""
        current = self.get_scratchpad(user_id)
        new_content = f"{current}\n{content}".strip()
        self.update_scratchpad(new_content, user_id)

    # --- Chat History ---

    def get_chat_history(self, user_id: str = "default_user", limit: int = 20) -> List[Dict[str, str]]:
        """Retrieve the recent chat history for an agent conversation."""
        import json
        raw = self.get_memory("chat_history", user_id)
        if raw and isinstance(raw, str):
            try:
                history = json.loads(raw)
                return history[-limit:] if isinstance(history, list) else []
            except json.JSONDecodeError:
                return []
        return []
    
    def save_chat_message(self, role: str, content: str, user_id: str = "default_user"):
        """Append a message to the chat history."""
        import json
        history = self.get_chat_history(user_id, limit=50)  # Keep last 50
        history.append({"role": role, "content": content})
        self.set_memory("chat_history", json.dumps(history), user_id, category="chat")
    
    def clear_chat_history(self, user_id: str = "default_user"):
        """Clear the chat history."""
        self.delete_memory("chat_history", user_id)

    # --- Layered Memory (Relational) ---

    def save_episodic_memory(
        self,
        summary: str,
        user_id: str = "default_user",
        context: Optional[Dict[str, Any]] = None,
        goal_id: Optional[str] = None,
        tags: Optional[List[str]] = None
    ):
        session = SessionLocal()
        try:
            record = AgentMemoryEpisodic(
                user_id=user_id,
                summary=summary,
                context=context or {},
                goal_id=goal_id,
                tags=tags or []
            )
            session.add(record)
            session.commit()
            return record
        except Exception as e:
            logger.error(f"Error saving episodic memory: {e}")
            session.rollback()
            return None
        finally:
            session.close()

    def save_semantic_memory_structured(
        self,
        key: str,
        value: Any,
        user_id: str = "default_user",
        confidence: float = 0.7,
        source: Optional[str] = None,
        tags: Optional[List[str]] = None
    ):
        session = SessionLocal()
        try:
            record = session.query(AgentMemorySemantic).filter_by(user_id=user_id, key=key).first()
            if record:
                record.value = value
                record.confidence = confidence
                record.source = source
                record.tags = tags or []
                record.updated_at = datetime.utcnow()
            else:
                record = AgentMemorySemantic(
                    user_id=user_id,
                    key=key,
                    value=value,
                    confidence=confidence,
                    source=source,
                    tags=tags or []
                )
                session.add(record)
            session.commit()
            return record
        except Exception as e:
            logger.error(f"Error saving semantic memory: {e}")
            session.rollback()
            return None
        finally:
            session.close()

    def save_procedural_memory(
        self,
        strategy: str,
        user_id: str = "default_user",
        effectiveness_score: float = 0.0,
        last_used: Optional[datetime] = None,
        tags: Optional[List[str]] = None
    ):
        session = SessionLocal()
        try:
            record = AgentMemoryProcedural(
                user_id=user_id,
                strategy=strategy,
                effectiveness_score=effectiveness_score,
                last_used=last_used,
                tags=tags or []
            )
            session.add(record)
            session.commit()
            return record
        except Exception as e:
            logger.error(f"Error saving procedural memory: {e}")
            session.rollback()
            return None
        finally:
            session.close()

    def get_recent_episodic(self, user_id: str = "default_user", limit: int = 10):
        session = SessionLocal()
        try:
            return (
                session.query(AgentMemoryEpisodic)
                .filter_by(user_id=user_id)
                .order_by(AgentMemoryEpisodic.timestamp.desc())
                .limit(limit)
                .all()
            )
        except Exception as e:
            logger.error(f"Error fetching episodic memory: {e}")
            return []
        finally:
            session.close()

    def get_semantic(self, key: str, user_id: str = "default_user"):
        session = SessionLocal()
        try:
            return session.query(AgentMemorySemantic).filter_by(user_id=user_id, key=key).first()
        except Exception as e:
            logger.error(f"Error fetching semantic memory: {e}")
            return None
        finally:
            session.close()

    # --- Semantic Memory (Vector) ---

    async def save_semantic_memory(self, text: str, tags: str = "agent_memory"):
        """
        Save a text snippet to semantic memory (vector store).
        Tags are stored in 'concept_tag' for filtering.
        """
        try:
            # We use 'agent_memory' as the concept_tag/category
            await self.vector_storage.store_chunk(
                doc_source="agent_memory",
                content=text,
                concept_tag=tags
            )
            return True
        except Exception as e:
            logger.error(f"Error saving semantic memory: {e}")
            return False

    async def search_semantic_memory(self, query: str, limit: int = 5) -> List[str]:
        """
        Search semantic memory for relevant context.
        """
        try:
            results = await self.vector_storage.similarity_search(
                query_text=query,
                limit=limit,
                concept_filter="agent_memory" 
            )
            # Return just the content text
            return [chunk.content for chunk, score in results]
        except Exception as e:
            logger.error(f"Error searching semantic memory: {e}")
            return []

# Singleton
memory_service = MemoryService()
