"""Vector embedding and storage system using Ollama and PostgreSQL with pgvector."""

import logging
import os
from typing import List, Optional, Tuple
import ollama
from dotenv import load_dotenv
from src.database.connections import postgres_conn
from src.models.schemas import LearningChunk

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


class VectorStorage:
    """
    Handles vector embedding generation and storage using Ollama and PostgreSQL with pgvector.
    
    Uses Ollama with embeddinggemma:latest model for generating semantic embeddings
    and stores them in PostgreSQL with pgvector for efficient similarity search.
    """
    
    DEFAULT_EMBEDDING_MODEL = "embeddinggemma:latest"
    EMBEDDING_DIMENSION = 768  # Updated to match embeddinggemma:latest actual dimension
    
    def __init__(self, embedding_model: Optional[str] = None, ollama_host: Optional[str] = None):
        """
        Initialize the vector storage system.
        
        Args:
            embedding_model: Ollama model name for embeddings (default from env or embeddinggemma:latest)
            ollama_host: Optional Ollama server host URL (default from env or localhost:11434)
        """
        self.embedding_model = embedding_model or os.getenv("OLLAMA_EMBEDDING_MODEL", self.DEFAULT_EMBEDDING_MODEL)
        
        # Handle host configuration - use localhost when running outside Docker
        if ollama_host:
            self.ollama_host = ollama_host
        else:
            env_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
            # Convert docker internal host to localhost for local testing
            if "host.docker.internal" in env_host:
                self.ollama_host = env_host.replace("host.docker.internal", "localhost")
            else:
                self.ollama_host = env_host
        
        self._client = None
    
    def _get_client(self):
        """Get or create Ollama client."""
        if self._client is None:
            self._client = ollama.Client(host=self.ollama_host)
        return self._client
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate semantic embedding for text using Ollama embeddinggemma:latest model.
        
        Args:
            text: Text content to embed
            
        Returns:
            List of float values representing the semantic embedding
            
        Raises:
            ValueError: If text is empty or embedding generation fails
        """
        if not text or not text.strip():
            raise ValueError("Cannot generate embedding for empty text")
        
        try:
            client = self._get_client()
            response = client.embeddings(
                model=self.embedding_model,
                prompt=text.strip()
            )
            
            embedding = response['embedding']
            
            # Validate embedding dimension
            if len(embedding) != self.EMBEDDING_DIMENSION:
                raise ValueError(f"Expected embedding dimension {self.EMBEDDING_DIMENSION}, got {len(embedding)}")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Failed to generate embedding: {str(e)}")
            raise ValueError(f"Embedding generation failed: {str(e)}") from e
    
    def store_chunk(self, doc_source: str, content: str, concept_tag: str) -> int:
        """
        Store a content chunk with its embedding in PostgreSQL.
        
        Args:
            doc_source: Source filename or URL
            content: Markdown text chunk
            concept_tag: Associated concept name
            
        Returns:
            Database ID of the stored chunk
            
        Raises:
            ValueError: If required parameters are empty or storage fails
        """
        if not doc_source or not doc_source.strip():
            raise ValueError("doc_source cannot be empty")
        if not content or not content.strip():
            raise ValueError("content cannot be empty")
        if not concept_tag or not concept_tag.strip():
            raise ValueError("concept_tag cannot be empty")
        
        try:
            # Generate embedding for the content
            embedding = self.generate_embedding(content)
            
            # Store in PostgreSQL
            query = """
                INSERT INTO learning_chunks (doc_source, content, embedding, concept_tag)
                VALUES (%s, %s, %s::vector, %s)
                RETURNING id
            """
            
            result = postgres_conn.execute_query(
                query, 
                (doc_source.strip(), content.strip(), str(embedding), concept_tag.strip().lower())
            )
            
            if not result:
                raise ValueError("Failed to insert chunk - no ID returned")
            
            chunk_id = result[0]['id']
            logger.info(f"Stored chunk {chunk_id} for concept '{concept_tag}' from '{doc_source}'")
            return chunk_id
            
        except Exception as e:
            logger.error(f"Failed to store chunk: {str(e)}")
            raise ValueError(f"Chunk storage failed: {str(e)}") from e
    
    def store_chunks_batch(self, chunks: List[Tuple[str, str, str]]) -> List[int]:
        """
        Store multiple content chunks in batch for efficiency.
        
        Args:
            chunks: List of tuples (doc_source, content, concept_tag)
            
        Returns:
            List of database IDs for the stored chunks
            
        Raises:
            ValueError: If any chunk data is invalid or batch storage fails
        """
        if not chunks:
            return []
        
        try:
            chunk_ids = []
            
            # Generate embeddings for all chunks first
            embeddings = []
            for doc_source, content, concept_tag in chunks:
                if not doc_source or not content or not concept_tag:
                    raise ValueError("All chunk fields (doc_source, content, concept_tag) must be non-empty")
                
                embedding = self.generate_embedding(content)
                embeddings.append(embedding)
            
            # Prepare batch insert data
            insert_data = []
            for i, (doc_source, content, concept_tag) in enumerate(chunks):
                insert_data.append((
                    doc_source.strip(),
                    content.strip(),
                    embeddings[i],
                    concept_tag.strip().lower()
                ))
            
            # Execute batch insert
            query = """
                INSERT INTO learning_chunks (doc_source, content, embedding, concept_tag)
                VALUES (%s, %s, %s::vector, %s)
                RETURNING id
            """
            
            # PostgreSQL doesn't support RETURNING with executemany, so we'll insert one by one
            for i, data in enumerate(insert_data):
                # Convert embedding to string format for PostgreSQL
                data_with_vector = (data[0], data[1], str(data[2]), data[3])
                result = postgres_conn.execute_query(query, data_with_vector)
                if result:
                    chunk_ids.append(result[0]['id'])
                else:
                    raise ValueError("Failed to insert chunk - no ID returned")
            
            logger.info(f"Stored {len(chunk_ids)} chunks in batch")
            return chunk_ids
            
        except Exception as e:
            logger.error(f"Failed to store chunks in batch: {str(e)}")
            raise ValueError(f"Batch chunk storage failed: {str(e)}") from e
    
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
            
            result = postgres_conn.execute_query(query, (concept_tag.strip().lower(),))
            
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
    
    def similarity_search(self, query_text: str, limit: int = 10, concept_filter: Optional[str] = None) -> List[Tuple[LearningChunk, float]]:
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
            query_embedding = self.generate_embedding(query_text)
            
            # Build the similarity search query
            base_query = """
                SELECT id, doc_source, content, concept_tag, created_at,
                       1 - (embedding <=> %s::vector) as similarity
                FROM learning_chunks
            """
            
            params = [str(query_embedding)]
            
            if concept_filter:
                base_query += " WHERE concept_tag = %s"
                params.append(concept_filter.strip().lower())
            
            base_query += f" ORDER BY similarity DESC LIMIT {int(limit)}"
            
            result = postgres_conn.execute_query(base_query, params)
            
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
            result = postgres_conn.execute_query(query, (concept_tag.strip().lower(),))
            
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
            query = "DELETE FROM learning_chunks WHERE concept_tag = %s"
            deleted_count = postgres_conn.execute_query(query, (concept_tag.strip().lower(),))
            
            logger.info(f"Deleted {deleted_count} chunks for concept '{concept_tag}'")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to delete chunks for concept '{concept_tag}': {str(e)}")
            raise ValueError(f"Chunk deletion failed: {str(e)}") from e