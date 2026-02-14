"""Vector embedding and storage system using Ollama and PostgreSQL with pgvector."""

import logging
import os
import asyncio
from typing import List, Optional, Tuple, Dict, Any
from dotenv import load_dotenv
from src.database.connections import postgres_conn
from src.models.schemas import LearningChunk
from src.config import settings

try:
    import ollama  # type: ignore
except Exception:
    class _OllamaStub:
        class Client:  # pragma: no cover - used only for tests/mocking
            pass
    ollama = _OllamaStub()

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


class EmbeddingDimensionMismatchError(ValueError):
    """Raised when embedding model output does not match vector index dimension."""

    def __init__(
        self,
        expected_db_dimensions: int,
        actual_model_dimensions: int,
        configured_dimensions: Optional[int],
        provider: str,
        model: str,
        base_url: Optional[str],
    ):
        self.expected_db_dimensions = expected_db_dimensions
        self.actual_model_dimensions = actual_model_dimensions
        self.configured_dimensions = configured_dimensions
        self.provider = provider
        self.model = model
        self.base_url = base_url
        super().__init__(
            f"Embedding dimension mismatch: model produced {actual_model_dimensions}, "
            f"but vector index expects {expected_db_dimensions}."
        )

    def to_payload(self) -> Dict[str, Any]:
        return {
            "code": "EMBEDDING_DIMENSION_MISMATCH",
            "message": str(self),
            "expected_db_dimensions": self.expected_db_dimensions,
            "actual_model_dimensions": self.actual_model_dimensions,
            "configured_dimensions": self.configured_dimensions,
            "provider": self.provider,
            "model": self.model,
            "base_url": self.base_url,
            "action": "update_dimensions_and_reindex",
            "recommendation": (
                "Update embedding dimensions to match your vector index and reindex embeddings."
            ),
        }


class VectorStorage:
    """
    Handles vector embedding generation and storage using Ollama and PostgreSQL with pgvector.
    
    Uses Ollama with embeddinggemma:latest model for generating semantic embeddings
    and stores them in PostgreSQL with pgvector for efficient similarity search.
    """
    
    
    # We will fetch dimension dynamically if possible or assume default
    # but for now we keep the constant or use config
    
    def __init__(self, db_connection=None):
        """
        Initialize the vector storage system.
        """
        self.db_conn = db_connection or postgres_conn
        self._expected_vector_dim: Optional[int] = None
        self._dimension_warning_emitted = False
        
    def _sanitize_text(self, text: str) -> str:
        """Remove null bytes from text to prevent PostgreSQL errors."""
        if not text:
            return text
        return text.replace('\x00', '')

    def _get_expected_vector_dimension(self) -> Optional[int]:
        """
        Read vector dimension constraint from learning_chunks.embedding.
        Returns None when column is unconstrained (vector).
        """
        if self._expected_vector_dim is not None:
            return self._expected_vector_dim

        try:
            result = self.db_conn.execute_query(
                """
                SELECT
                    a.atttypmod AS typmod,
                    format_type(a.atttypid, a.atttypmod) AS ftype
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relname = 'learning_chunks'
                  AND a.attname = 'embedding'
                LIMIT 1
                """
            )
            dim = None
            source = None
            if result:
                row = result[0]
                ftype = str(row.get("ftype") or "")
                if ftype == "vector":
                    # Unconstrained vector supports mixed dimensions.
                    dim = None
                    source = "unconstrained"
                elif ftype.startswith("vector(") and ftype.endswith(")"):
                    try:
                        dim = int(ftype[7:-1])
                        source = "format_type"
                    except Exception:
                        dim = None

            if isinstance(dim, int) and dim > 0:
                self._expected_vector_dim = dim
                logger.info("Using vector dimension %s from %s", dim, source or "schema")
            elif source == "unconstrained":
                self._expected_vector_dim = None
                logger.info("Using unconstrained vector column: mixed embedding dimensions enabled")
            else:
                # Unknown schema shape: don't enforce local validation, let DB handle it.
                self._expected_vector_dim = None
                logger.warning(
                    "Could not determine vector dimension from schema; disabling strict dimension validation"
                )
        except Exception as e:
            logger.warning(f"Unable to determine pgvector dimension; disabling strict validation: {e}")
            self._expected_vector_dim = None

        return self._expected_vector_dim

    def _validate_embedding_dimension(self, embedding: List[float]) -> None:
        """Validate embedding length against the DB vector index dimension."""
        expected = self._get_expected_vector_dimension()
        if not expected or expected <= 0:
            return

        actual = len(embedding)
        if actual == expected:
            return

        if not self._dimension_warning_emitted:
            logger.warning(
                "Embedding dimension mismatch detected (expected=%s, actual=%s). "
                "Blocking vector write and requiring explicit settings/index alignment.",
                expected,
                actual
            )
            self._dimension_warning_emitted = True

        provider = (getattr(settings, "embedding_provider", None) or "").lower()
        model = getattr(settings, "embedding_model", None) or ""
        base_url = getattr(settings, "embedding_base_url", None)
        if provider == "ollama" and not base_url:
            base_url = getattr(settings, "ollama_base_url", None)
        configured = getattr(settings, "embedding_dimensions", None)
        raise EmbeddingDimensionMismatchError(
            expected_db_dimensions=expected,
            actual_model_dimensions=actual,
            configured_dimensions=configured,
            provider=provider,
            model=model,
            base_url=base_url,
        )

    
    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate semantic embedding for text using LLMService.
        """
        if not text or not text.strip():
            raise ValueError("Cannot generate embedding for empty text")
        
        try:
            # Import here to avoid circular dependency if any, 
            # though usually safe at top if structured correctly.
            from src.services.llm_service import llm_service
            
            embedding = await llm_service.get_embedding(text)
            self._validate_embedding_dimension(embedding)
            return embedding
            
        except EmbeddingDimensionMismatchError:
            raise
        except Exception as e:
            logger.error(f"Failed to generate embedding: {str(e)}")
            raise ValueError(f"Embedding generation failed: {str(e)}") from e
    
    async def store_chunk(self, doc_source: str, content: str, concept_tag: str, document_id: Optional[int] = None) -> int:
        """
        Store a content chunk with its embedding in PostgreSQL.
        
        Args:
            doc_source: Source filename or URL
            content: Markdown text chunk
            concept_tag: Associated concept name
            document_id: Optional ID of the parent document
            
        Returns:
            Database ID of the stored chunk
        """
        if not doc_source or not doc_source.strip():
            raise ValueError("doc_source cannot be empty")
        if not content or not content.strip():
            raise ValueError("content cannot be empty")
        if not concept_tag or not concept_tag.strip():
            raise ValueError("concept_tag cannot be empty")
        
        try:
            # Generate embedding for the content
            embedding = await self.generate_embedding(content)
            
            # Store in PostgreSQL
            query = """
                INSERT INTO learning_chunks (doc_source, content, embedding, concept_tag, document_id, embedding_dimensions)
                VALUES (%s, %s, %s::vector, %s, %s, %s)
                RETURNING id
            """
            
            result = self.db_conn.execute_query(
                query,
                (
                    self._sanitize_text(doc_source.strip()),
                    self._sanitize_text(content.strip()),
                    str(embedding),
                    self._sanitize_text(concept_tag.strip().lower()),
                    document_id,
                    len(embedding)
                )
            )
            
            if not result:
                raise ValueError("Failed to insert chunk - no ID returned")
            
            chunk_id = result[0]['id']
            # logger.info(f"Stored chunk {chunk_id} for concept '{concept_tag}' from '{doc_source}'")
            return chunk_id
            
        except EmbeddingDimensionMismatchError:
            raise
        except Exception as e:
            err_text = str(e)
            if "expected" in err_text.lower() and "dimensions" in err_text.lower() and "not" in err_text.lower():
                import re
                m = re.search(r"expected\s+(\d+)\s+dimensions,?\s+not\s+(\d+)", err_text, flags=re.IGNORECASE)
                if m:
                    expected = int(m.group(1))
                    actual = int(m.group(2))
                    provider = (getattr(settings, "embedding_provider", None) or "").lower()
                    model = getattr(settings, "embedding_model", None) or ""
                    base_url = getattr(settings, "embedding_base_url", None)
                    if provider == "ollama" and not base_url:
                        base_url = getattr(settings, "ollama_base_url", None)
                    configured = getattr(settings, "embedding_dimensions", None)
                    raise EmbeddingDimensionMismatchError(
                        expected_db_dimensions=expected,
                        actual_model_dimensions=actual,
                        configured_dimensions=configured,
                        provider=provider,
                        model=model,
                        base_url=base_url,
                    ) from e
            msg = f"Chunk storage failed: {str(e)}"
            logger.error(msg)
            if isinstance(e, ValueError) and "Embedding connection error" in str(e):
                raise ValueError(str(e)) from e
            raise ValueError(msg) from e
            
    async def store_chunks_batch(self, chunks: List[Tuple[str, str, str, Optional[int]]]) -> List[int]:
        """
        Store multiple content chunks in batch for efficiency.
        
        Args:
            chunks: List of tuples (doc_source, content, concept_tag, document_id)
            
        Returns:
            List of database IDs for the stored chunks
        """
        if not chunks:
            return []
        
        try:
            chunk_ids = []
            semaphore = asyncio.Semaphore(max(1, int(getattr(settings, "embedding_concurrency", 4))))

            async def embed_content(content: str) -> List[float]:
                async with semaphore:
                    return await self.generate_embedding(content)

            # Generate embeddings for all chunks first (limited concurrency)
            contents: List[str] = []
            for item in chunks:
                if len(item) == 3:
                    doc_source, content, concept_tag = item
                else:
                    doc_source, content, concept_tag, _ = item

                if not doc_source or not content or not concept_tag:
                    raise ValueError("All chunk fields must be non-empty")
                contents.append(content)

            embeddings = await asyncio.gather(*(embed_content(c) for c in contents))
            
            insert_query = """
                INSERT INTO learning_chunks (doc_source, content, embedding, concept_tag, document_id, embedding_dimensions)
                VALUES (%s, %s, %s::vector, %s, %s, %s)
                RETURNING id
            """

            # Use a single connection for batch insert to reduce overhead.
            if hasattr(self.db_conn, "connect") and callable(getattr(self.db_conn, "connect", None)):
                conn = self.db_conn.connect()
                try:
                    with conn.cursor() as cursor:
                        for i, item in enumerate(chunks):
                            document_id = None
                            if len(item) == 4:
                                doc_source, content, concept_tag, document_id = item
                            else:
                                doc_source, content, concept_tag = item

                            embedding_str = str(embeddings[i])
                            cursor.execute(
                                insert_query,
                                (
                                    self._sanitize_text(doc_source.strip()),
                                    self._sanitize_text(content.strip()),
                                    embedding_str,
                                    self._sanitize_text(concept_tag.strip().lower()),
                                    document_id,
                                    len(embeddings[i]),
                                ),
                            )
                            row = cursor.fetchone()
                            if row:
                                chunk_ids.append(row[0])
                        conn.commit()
                except Exception:
                    conn.rollback()
                    raise
                finally:
                    self.db_conn.close(conn)
            else:
                # Fallback for mocked db connections in tests.
                for i, item in enumerate(chunks):
                    document_id = None
                    if len(item) == 4:
                        doc_source, content, concept_tag, document_id = item
                    else:
                        doc_source, content, concept_tag = item
                    embedding_str = str(embeddings[i])
                    row = self.db_conn.execute_query(
                        insert_query,
                        (
                            self._sanitize_text(doc_source.strip()),
                            self._sanitize_text(content.strip()),
                            embedding_str,
                            self._sanitize_text(concept_tag.strip().lower()),
                            document_id,
                            len(embeddings[i]),
                        ),
                    )
                    if row:
                        chunk_ids.append(row[0]["id"] if isinstance(row[0], dict) else row[0])
            
            logger.info(f"Stored {len(chunk_ids)} chunks in batch")
            return chunk_ids
            
        except EmbeddingDimensionMismatchError:
            raise
        except Exception as e:
            err_text = str(e)
            if "expected" in err_text.lower() and "dimensions" in err_text.lower() and "not" in err_text.lower():
                import re
                m = re.search(r"expected\s+(\d+)\s+dimensions,?\s+not\s+(\d+)", err_text, flags=re.IGNORECASE)
                if m:
                    expected = int(m.group(1))
                    actual = int(m.group(2))
                    provider = (getattr(settings, "embedding_provider", None) or "").lower()
                    model = getattr(settings, "embedding_model", None) or ""
                    base_url = getattr(settings, "embedding_base_url", None)
                    if provider == "ollama" and not base_url:
                        base_url = getattr(settings, "ollama_base_url", None)
                    configured = getattr(settings, "embedding_dimensions", None)
                    raise EmbeddingDimensionMismatchError(
                        expected_db_dimensions=expected,
                        actual_model_dimensions=actual,
                        configured_dimensions=configured,
                        provider=provider,
                        model=model,
                        base_url=base_url,
                    ) from e
            msg = f"Batch chunk storage failed: {str(e)}"
            logger.error(msg)
            if isinstance(e, ValueError) and "Embedding connection error" in str(e):
                raise ValueError(str(e)) from e
            raise ValueError(msg) from e
    
    def retrieve_chunks_by_concept(self, concept_tag: str, limit: Optional[int] = None) -> List[LearningChunk]:
        """
        Retrieve all content chunks for a specific concept.
        
        Args:
            concept_tag: Concept name to retrieve chunks for
            limit: Optional limit on number of chunks to return
            
        Returns:
            List of LearningChunk objects
            
        Raises:
            ValueError: If concept_tag is empty
        """
        if not concept_tag or not concept_tag.strip():
            raise ValueError("concept_tag cannot be empty")
        
        try:
            query = """
                SELECT id, doc_source, content, concept_tag, created_at
                FROM learning_chunks
                WHERE concept_tag = %s
                ORDER BY created_at ASC
            """
            
            if limit:
                query += f" LIMIT {int(limit)}"
            
            result = self.db_conn.execute_query(query, (concept_tag.strip().lower(),))
            
            chunks = []
            for row in result:
                chunk = LearningChunk(
                    id=row['id'],
                    doc_source=row['doc_source'],
                    content=row['content'],
                    concept_tag=row['concept_tag'],
                    created_at=row['created_at']
                )
                chunks.append(chunk)
            
            logger.info(f"Retrieved {len(chunks)} chunks for concept '{concept_tag}'")
            return chunks
            
        except Exception as e:
            logger.error(f"Failed to retrieve chunks for concept '{concept_tag}': {str(e)}")
            raise ValueError(f"Chunk retrieval failed: {str(e)}") from e
    
    async def similarity_search(self, query_text: str, limit: int = 10, concept_filter: Optional[str] = None) -> List[Tuple[LearningChunk, float]]:
        """
        Perform vector similarity search to find relevant content chunks.
        
        Args:
            query_text: Text to search for similar content
            limit: Maximum number of results to return
            concept_filter: Optional concept name to filter results
            
        Returns:
            List of tuples (LearningChunk, similarity_score) ordered by similarity
            
        Raises:
            ValueError: If query_text is empty or search fails
        """
        if not query_text or not query_text.strip():
            raise ValueError("query_text cannot be empty")
        
        try:
            # Generate embedding for the query
            query_embedding = await self.generate_embedding(query_text)
            query_dim = len(query_embedding)
            
            # Build the similarity search query
            base_query = """
                SELECT id, doc_source, content, concept_tag, created_at,
                       1 - (embedding <=> %s::vector) as similarity
                FROM learning_chunks
            """
            
            params = [str(query_embedding), int(query_dim)]
            base_query += " WHERE embedding_dimensions = %s"
            
            if concept_filter:
                base_query += " AND concept_tag = %s"
                params.append(concept_filter.strip().lower())
            
            base_query += f" ORDER BY similarity DESC LIMIT {int(limit)}"
            
            result = self.db_conn.execute_query(base_query, params)
            
            results = []
            for row in result:
                chunk = LearningChunk(
                    id=row['id'],
                    doc_source=row['doc_source'],
                    content=row['content'],
                    concept_tag=row['concept_tag'],
                    created_at=row['created_at']
                )
                similarity_score = float(row['similarity'])
                results.append((chunk, similarity_score))
            
            logger.info(f"Found {len(results)} similar chunks for query")
            return results
            
        except Exception as e:
            logger.error(f"Similarity search failed: {str(e)}")
            raise ValueError(f"Similarity search failed: {str(e)}") from e
    
    def get_chunk_count_by_concept(self, concept_tag: str) -> int:
        """
        Get the number of content chunks for a specific concept.
        
        Args:
            concept_tag: Concept name to count chunks for
            
        Returns:
            Number of chunks for the concept
            
        Raises:
            ValueError: If concept_tag is empty
        """
        if not concept_tag or not concept_tag.strip():
            raise ValueError("concept_tag cannot be empty")
        
        try:
            query = "SELECT COUNT(*) as count FROM learning_chunks WHERE concept_tag = %s"
            result = self.db_conn.execute_query(query, (concept_tag.strip().lower(),))
            
            count = result[0]['count'] if result else 0
            return count
            
        except Exception as e:
            logger.error(f"Failed to count chunks for concept '{concept_tag}': {str(e)}")
            raise ValueError(f"Chunk count failed: {str(e)}") from e
    
    def delete_chunks_by_concept(self, concept_tag: str) -> int:
        """
        Delete all content chunks for a specific concept.
        
        Args:
            concept_tag: Concept name to delete chunks for
            
        Returns:
            Number of chunks deleted
            
        Raises:
            ValueError: If concept_tag is empty
        """
        if not concept_tag or not concept_tag.strip():
            raise ValueError("concept_tag cannot be empty")
        
        try:
            query = "DELETE FROM learning_chunks WHERE concept_tag = %s RETURNING id"
            deleted_rows = self.db_conn.execute_query(query, (concept_tag.strip().lower(),))
            deleted_count = len(deleted_rows) if deleted_rows else 0
            
            logger.info(f"Deleted {deleted_count} chunks for concept '{concept_tag}'")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to delete chunks for concept '{concept_tag}': {str(e)}")
            raise ValueError(f"Chunk deletion failed: {str(e)}") from e
    def delete_document_chunks(self, document_id: int) -> int:
        """
        Delete all content chunks for a specific document.
        
        Args:
            document_id: Database ID of the document
            
        Returns:
            Number of chunks deleted
        """
        try:
            query = "DELETE FROM learning_chunks WHERE document_id = %s RETURNING id"
            deleted_rows = self.db_conn.execute_query(query, (document_id,))
            deleted_count = len(deleted_rows) if deleted_rows else 0
            
            logger.info(f"Deleted {deleted_count} chunks for document {document_id}")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to delete chunks for document {document_id}: {str(e)}")
            raise ValueError(f"Document chunk deletion failed: {str(e)}") from e
