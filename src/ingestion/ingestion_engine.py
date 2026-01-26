"""LLM-based graph extraction engine using Ollama for structured concept extraction."""

import json
import logging
import os
from typing import List, Optional, Tuple
from pydantic import ValidationError
import ollama
from dotenv import load_dotenv

from src.models.schemas import GraphSchema, PrerequisiteLink
from src.database.connections import neo4j_conn
from src.database.graph_storage import graph_storage
from .vector_storage import VectorStorage

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


class IngestionEngine:
    """
    Handles LLM-based extraction of knowledge graph structures from markdown content.
    
    Uses Ollama with gpt-oss:20b-cloud model for structured extraction with Pydantic
    schema enforcement. Extracts concepts and prerequisite relationships with reasoning.
    """
    
    DEFAULT_MODEL = "gpt-oss:20b-cloud"
    EXTRACTION_PROMPT_TEMPLATE = """You are an expert educational content analyzer. Your task is to extract key learning concepts and their prerequisite relationships from the provided educational content.

Analyze the following markdown content and extract:
1. A list of key concepts (topics, skills, or ideas that a learner needs to understand)
2. Prerequisite relationships between concepts (which concepts must be learned before others)

For each prerequisite relationship, provide:
- source_concept: The fundamental concept that must be learned first
- target_concept: The advanced concept that requires the source
- weight: A value between 0.0 and 1.0 indicating dependency strength (1.0 = absolutely required, 0.5 = helpful but not critical)
- reasoning: A brief explanation of why the source concept is needed for the target

Return your response as a JSON object with this exact structure:
{{
    "concepts": ["concept1", "concept2", "concept3"],
    "prerequisites": [
        {{
            "source_concept": "concept1",
            "target_concept": "concept2",
            "weight": 0.8,
            "reasoning": "Understanding concept1 is essential for grasping concept2"
        }}
    ]
}}

IMPORTANT: 
- Concept names should be clear, concise, and descriptive
- Only include meaningful prerequisite relationships
- Ensure all concepts mentioned in prerequisites are also in the concepts list
- Return ONLY valid JSON, no additional text

Content to analyze:

{content}
"""
    
    def __init__(self, model: Optional[str] = None, ollama_host: Optional[str] = None):
        """
        Initialize the ingestion engine.
        
        Args:
            model: Ollama model name to use for extraction (default from env or gpt-oss:20b-cloud)
            ollama_host: Optional Ollama server host URL (default from env or localhost:11434)
        """
        self.model = model or os.getenv("OLLAMA_EXTRACTION_MODEL", self.DEFAULT_MODEL)
        
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
        self.vector_storage = VectorStorage(ollama_host=self.ollama_host)
    
    def _get_client(self):
        """Get or create Ollama client."""
        if self._client is None:
            self._client = ollama.Client(host=self.ollama_host)
        return self._client
    
    def _normalize_concept_name(self, name: str) -> str:
        """
        Normalize concept names to lowercase for consistent storage.
        
        Args:
            name: Original concept name
            
        Returns:
            Normalized lowercase concept name
        """
        return name.strip().lower()
    
    def extract_graph_structure(self, markdown: str) -> GraphSchema:
        """
        Extract knowledge graph structure from markdown content using LLM.
        
        Uses structured extraction with Pydantic schema enforcement to ensure
        valid JSON output conforming to GraphSchema. Normalizes concept names
        to lowercase for consistent storage.
        
        Args:
            markdown: Markdown content to analyze
            
        Returns:
            GraphSchema with extracted concepts and prerequisite relationships
            
        Raises:
            ValueError: If LLM returns invalid JSON or extraction fails
            ValidationError: If extracted data doesn't conform to GraphSchema
        """
        if not markdown or not markdown.strip():
            raise ValueError("Cannot extract graph structure from empty content")
        
        # Prepare the prompt
        prompt = self.EXTRACTION_PROMPT_TEMPLATE.format(content=markdown)
        
        try:
            # Call Ollama for structured extraction
            client = self._get_client()
            response = client.chat(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                format="json"  # Request JSON format
            )
            
            # Extract the response content
            response_text = response['message']['content']
            
            # Parse JSON response
            try:
                data = json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response as JSON: {response_text}")
                raise ValueError(f"LLM returned invalid JSON: {str(e)}") from e
            
            # Ensure data is a dictionary
            if not isinstance(data, dict):
                logger.error(f"LLM response is not a JSON object: {response_text}")
                raise ValueError(f"LLM returned invalid JSON: expected object, got {type(data).__name__}")
            
            # Normalize concept names to lowercase
            if 'concepts' in data:
                data['concepts'] = [self._normalize_concept_name(c) for c in data['concepts']]
            
            if 'prerequisites' in data:
                for prereq in data['prerequisites']:
                    if 'source_concept' in prereq:
                        prereq['source_concept'] = self._normalize_concept_name(prereq['source_concept'])
                    if 'target_concept' in prereq:
                        prereq['target_concept'] = self._normalize_concept_name(prereq['target_concept'])
            
            # Validate with Pydantic schema
            try:
                schema = GraphSchema(**data)
                return schema
            except ValidationError as e:
                logger.error(f"Schema validation failed: {e}")
                raise ValidationError(f"Extracted data doesn't conform to GraphSchema: {str(e)}") from e
                
        except Exception as e:
            if isinstance(e, (ValueError, ValidationError)):
                raise
            logger.error(f"Graph extraction failed: {str(e)}")
            raise ValueError(f"Failed to extract graph structure: {str(e)}") from e
    
    def validate_graph_structure(self, schema: GraphSchema) -> bool:
        """
        Validate that a GraphSchema is internally consistent.
        
        Checks that all concepts referenced in prerequisites exist in the concepts list.
        
        Args:
            schema: GraphSchema to validate
            
        Returns:
            True if valid, False otherwise
        """
        concept_set = set(schema.concepts)
        
        for prereq in schema.prerequisites:
            if prereq.source_concept not in concept_set:
                logger.warning(f"Prerequisite references unknown source concept: {prereq.source_concept}")
                return False
            if prereq.target_concept not in concept_set:
                logger.warning(f"Prerequisite references unknown target concept: {prereq.target_concept}")
                return False
        
        return True
    
    def store_graph_data(self, schema: GraphSchema) -> None:
        """
        Store extracted graph structure in Neo4j knowledge graph.
        
        Uses the dedicated GraphStorage module with MERGE operations to handle 
        duplicate concepts gracefully and stores prerequisite relationships 
        with weight and reasoning metadata.
        
        Args:
            schema: GraphSchema with concepts and prerequisite relationships
            
        Raises:
            ValueError: If schema is invalid or storage fails
        """
        if not self.validate_graph_structure(schema):
            raise ValueError("Invalid graph structure - prerequisite references unknown concepts")
        
        try:
            # Use the dedicated graph storage module
            result = graph_storage.store_graph_schema(schema)
            
            logger.info(f"Stored {result['concepts_stored']} concepts and {result['relationships_stored']} prerequisites")
            
        except Exception as e:
            logger.error(f"Failed to store graph data: {str(e)}")
            raise ValueError(f"Graph data storage failed: {str(e)}") from e
    
    def store_vector_data(self, doc_source: str, content_chunks: List[str], concept_tags: List[str]) -> List[int]:
        """
        Store content chunks with embeddings in PostgreSQL vector database.
        
        Args:
            doc_source: Source filename or URL
            content_chunks: List of markdown text chunks
            concept_tags: List of concept names corresponding to each chunk
            
        Returns:
            List of database IDs for stored chunks
            
        Raises:
            ValueError: If chunks and tags don't match or storage fails
        """
        if len(content_chunks) != len(concept_tags):
            raise ValueError("Number of content chunks must match number of concept tags")
        
        if not content_chunks:
            return []
        
        try:
            # Prepare batch data
            batch_data = []
            for chunk, concept_tag in zip(content_chunks, concept_tags):
                if chunk.strip() and concept_tag.strip():  # Skip empty chunks
                    batch_data.append((doc_source, chunk, concept_tag))
            
            if not batch_data:
                logger.warning("No valid chunks to store after filtering empty content")
                return []
            
            # Store using vector storage system
            chunk_ids = self.vector_storage.store_chunks_batch(batch_data)
            logger.info(f"Stored {len(chunk_ids)} content chunks from '{doc_source}'")
            return chunk_ids
            
        except Exception as e:
            logger.error(f"Failed to store vector data: {str(e)}")
            raise ValueError(f"Vector data storage failed: {str(e)}") from e
    
    def process_document_complete(self, doc_source: str, markdown: str, content_chunks: List) -> Tuple[GraphSchema, List[int]]:
        """
        Complete document processing: extract graph structure and store both graph and vector data.
        
        Args:
            doc_source: Source filename or URL
            markdown: Full markdown content for graph extraction
            content_chunks: List of content chunks (either strings or tuples from document processor)
            
        Returns:
            Tuple of (GraphSchema, list of chunk IDs)
            
        Raises:
            ValueError: If processing fails at any stage
        """
        try:
            # Extract graph structure from full markdown
            schema = self.extract_graph_structure(markdown)
            
            # Store graph data in Neo4j
            self.store_graph_data(schema)
            
            # Handle different chunk formats from document processor
            if content_chunks and isinstance(content_chunks[0], tuple):
                # Document processor returns (content, concept_tag) tuples
                chunk_contents = [chunk[0] for chunk in content_chunks if chunk[0].strip()]
                # Use extracted concepts for tagging since document processor concept tags might be empty
                if schema.concepts:
                    concept_tags = []
                    concepts_cycle = schema.concepts * ((len(chunk_contents) // len(schema.concepts)) + 1)
                    concept_tags = concepts_cycle[:len(chunk_contents)]
                else:
                    concept_tags = ["general"] * len(chunk_contents)
            else:
                # Simple list of content strings
                chunk_contents = [chunk for chunk in content_chunks if chunk.strip()]
                # Assign concept tags to chunks (simple strategy: distribute evenly)
                if chunk_contents and schema.concepts:
                    concept_tags = []
                    concepts_cycle = schema.concepts * ((len(chunk_contents) // len(schema.concepts)) + 1)
                    concept_tags = concepts_cycle[:len(chunk_contents)]
                else:
                    concept_tags = ["general"] * len(chunk_contents)
            
            # Store vector data in PostgreSQL
            chunk_ids = self.store_vector_data(doc_source, chunk_contents, concept_tags)
            
            logger.info(f"Complete document processing finished for '{doc_source}'")
            return schema, chunk_ids
            
        except Exception as e:
            logger.error(f"Complete document processing failed: {str(e)}")
            raise ValueError(f"Document processing failed: {str(e)}") from e
