"""LLM-based graph extraction engine using Ollama for structured concept extraction."""

import json
import logging
import os
from typing import List, Optional, Tuple, Any, Dict
from pydantic import ValidationError

from dotenv import load_dotenv

from src.models.schemas import GraphSchema, PrerequisiteLink
from src.database.connections import neo4j_conn
from src.database.graph_storage import graph_storage
from src.database.graph_storage import graph_storage
from .vector_storage import VectorStorage
from .document_processor import DocumentProcessor

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
    EXTRACTION_PROMPT_TEMPLATE = """You are an expert educational content analyzer. Your task is to extract key learning concepts, their prerequisite relationships, and map them to the specific text chunks where they are defined.

Analyze the following NUMBERED text chunks and extract:
1. A list of key concepts
2. Prerequisite relationships
3. **Concept Mappings**: Which chunk numbers (e.g., [1, 3]) contain the primary definition or explanation of the concept.

Return your response as a JSON object with this EXACT structure:
{{
    "concepts": ["concept1", "concept2"],
    "prerequisites": [
        {{
            "source_concept": "concept1",
            "target_concept": "concept2",
            "weight": 0.8,
            "reasoning": "Explanation..."
        }}
    ],
    "concept_mappings": {{
        "concept1": [1, 2],
        "concept2": [3]
    }}
}}

Content to analyze:

{content}
"""
    
    
    def __init__(self):
        """
        Initialize the ingestion engine.
        Using global settings for configuration.
        """
        self.vector_storage = VectorStorage()
        self.document_processor = DocumentProcessor()
    
    def _normalize_concept_name(self, name: Any) -> str:
        """
        Normalize concept names to lowercase for consistent storage.
        Handles non-string inputs (like lists or None) gracefully.
        """
        if name is None:
            return ""
            
        if isinstance(name, list):
            # If it's a list, recursively join or take first
            if not name:
                return ""
            # Take the first element if it exists and normalize it
            return self._normalize_concept_name(name[0])
            
        # Convert to string and strip/lower
        return str(name).strip().lower()
    
    MAX_EXTRACTION_CHARS = 50000  # Conservative limit for extraction windows
    
    def _create_chunked_windows(self, chunks: List[str]) -> List[Tuple[str, int, int]]:
        """
        Group individual chunks into context windows.
        
        Args:
            chunks: List of text content chunks
            
        Returns:
            List of Tuples: (formatted_window_text, start_index, end_index)
            start_index and end_index are 0-based indices into the original chunks list.
        """
        windows = []
        current_window_text = []
        current_char_count = 0
        current_start_idx = 0
        
        for i, chunk in enumerate(chunks):
            # Format: [i] actual text
            # We use 0-based index matching the list, but LLM might prefer 1-based. 
            # Let's use 0-based in prompt for simplicity of mapping back, 
            # or explicit labeling like [Chunk 0].
            formatted_chunk = f"[Chunk {i}] {chunk}"
            chunk_len = len(formatted_chunk)
            
            if current_char_count + chunk_len > self.MAX_EXTRACTION_CHARS and current_window_text:
                # Close current window
                window_content = "\n\n".join(current_window_text)
                windows.append((window_content, current_start_idx, i - 1))
                
                # Start new window
                current_window_text = [formatted_chunk]
                current_char_count = chunk_len
                current_start_idx = i
            else:
                current_window_text.append(formatted_chunk)
                current_char_count += chunk_len
        
        # Add last window
        if current_window_text:
            window_content = "\n\n".join(current_window_text)
            windows.append((window_content, current_start_idx, len(chunks) - 1))
            
        return windows

    def _merge_schemas(self, schemas: List[GraphSchema]) -> GraphSchema:
        """
        Merge multiple partial GraphSchemas into a unified schema.
        
        Args:
            schemas: List of partial extraction results
            
        Returns:
            Unified GraphSchema
        """
        if not schemas:
            return GraphSchema(concepts=[], prerequisites=[], concept_mappings={})
            
        all_concepts = set()
        prereqs_map = {}  # Key: (source, target), Value: PrerequisiteLink
        merged_mappings = {} # Key: concept_name, Value: set of chunk_ids
        
        for schema in schemas:
            # Add concepts
            for concept in schema.concepts:
                all_concepts.add(concept)
                
            # Add prerequisites
            for prereq in schema.prerequisites:
                key = (prereq.source_concept, prereq.target_concept)
                if key in prereqs_map:
                    if prereq.weight > prereqs_map[key].weight:
                        prereqs_map[key] = prereq
                else:
                    prereqs_map[key] = prereq
            
            # Merge mappings
            if schema.concept_mappings:
                for concept, indices in schema.concept_mappings.items():
                    norm_concept = self._normalize_concept_name(concept)
                    if norm_concept not in merged_mappings:
                        merged_mappings[norm_concept] = set()
                    merged_mappings[norm_concept].update(indices)

        # Convert sets back to sorted lists
        final_mappings = {k: sorted(list(v)) for k, v in merged_mappings.items()}
                    
        return GraphSchema(
            concepts=sorted(list(all_concepts)),
            prerequisites=list(prereqs_map.values()),
            concept_mappings=final_mappings
        )

    async def extract_graph_structure(self, content_chunks: List[str]) -> GraphSchema:
        """
        Extract knowledge graph structure from content chunks using LLM.
        
        Args:
            content_chunks: List of text chunks
            
        Returns:
            GraphSchema with extracted concepts, prerequisites, and chunk mappings
        """
        if not content_chunks:
            raise ValueError("Cannot extract graph from empty content chunks")
            
        # Create numbered windows
        windows = self._create_chunked_windows(content_chunks)
        logger.info(f"Split document into {len(windows)} windows for extraction")
        
        schemas = []
        
        for i, (window_content, start_idx, end_idx) in enumerate(windows):
            logger.info(f"Processing extraction window {i+1}/{len(windows)}")
            
            prompt = self.EXTRACTION_PROMPT_TEMPLATE.format(content=window_content)
            
            try:
                # Import here to avoid circular dependency
                from src.services.llm_service import llm_service
                from src.routers.ai import LLMConfig
                from src.config import settings

                config = LLMConfig(
                    provider=settings.llm_provider,
                    model=settings.extraction_model if settings.extraction_model else settings.llm_model,
                    base_url=settings.ollama_base_url
                )

                response_text = await llm_service.get_chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    response_format="json",
                    config=config
                )
                
                try:
                    data = json.loads(response_text)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse LLM response in window {i+1}: {response_text}")
                    continue 
                
                if not isinstance(data, dict):
                    logger.error(f"LLM response is not a JSON object in window {i+1}")
                    continue
                
                # Normalize concepts
                if 'concepts' in data:
                    data['concepts'] = [self._normalize_concept_name(c) for c in data['concepts']]
                
                if 'prerequisites' in data:
                    for prereq in data['prerequisites']:
                        if 'source_concept' in prereq:
                            prereq['source_concept'] = self._normalize_concept_name(prereq['source_concept'])
                        if 'target_concept' in prereq:
                            prereq['target_concept'] = self._normalize_concept_name(prereq['target_concept'])

                # Normalize mappings and adjust indices
                # The LLM sees "Chunk 0" but that is relative to the start_idx of the window?
                # Actually, our _create_chunked_windows formats it as `[Chunk {i}]` where {i} is the GLOBAL index
                # So the LLM should return the global index if valid.
                
                if 'concept_mappings' in data:
                    normalized_mappings = {}
                    for concept, indices in data['concept_mappings'].items():
                        norm_c = self._normalize_concept_name(concept)
                        # Filter indices to ensure they are valid for this document
                        valid_indices = [idx for idx in indices if isinstance(idx, int) and 0 <= idx < len(content_chunks)]
                        normalized_mappings[norm_c] = valid_indices
                    data['concept_mappings'] = normalized_mappings
                
                # Validate schema
                try:
                    # Auto-fix: Ensure all concepts in prerequisites are in concepts list
                    # This handles the "structural hallucination" we saw earlier
                    if 'concepts' in data and 'prerequisites' in data:
                        concept_set = set(data['concepts'])
                        for p in data['prerequisites']:
                            if 'source_concept' in p and p['source_concept'] not in concept_set:
                                data['concepts'].append(p['source_concept'])
                                concept_set.add(p['source_concept'])
                            if 'target_concept' in p and p['target_concept'] not in concept_set:
                                data['concepts'].append(p['target_concept'])
                                concept_set.add(p['target_concept'])

                    schema = GraphSchema(**data)
                    schemas.append(schema)
                except ValidationError as e:
                    logger.error(f"Schema validation failed in window {i+1}: {e}")
                    continue
                    
            except Exception as e:
                logger.error(f"Graph extraction failed for window {i+1}: {str(e)}")
                continue
        
        if not schemas:
            # Fallback: create empty schema if all windows failed
            logger.warning("No valid schemas extracted, returning empty graph")
            return GraphSchema(concepts=[], prerequisites=[], concept_mappings={})
            
        final_schema = self._merge_schemas(schemas)
        logger.info(f"Merged {len(schemas)} partial schemas into final graph: {len(final_schema.concepts)} concepts")
        
        return final_schema
    
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
    
    def store_graph_data(self, schema: GraphSchema, document_id: Optional[int] = None) -> None:
        """
        Store extracted graph structure in Neo4j knowledge graph.
        
        Uses the dedicated GraphStorage module with MERGE operations to handle 
        duplicate concepts gracefully and stores prerequisite relationships 
        with weight, reasoning, and document provenance.
        
        Args:
            schema: GraphSchema with concepts and prerequisite relationships
            document_id: Optional ID of the document context
            
        Raises:
            ValueError: If schema is invalid or storage fails
        """
        if not self.validate_graph_structure(schema):
            raise ValueError("Invalid graph structure - prerequisite references unknown concepts")
        
        try:
            # Use the dedicated graph storage module
            result = graph_storage.store_graph_schema(schema, document_id)
            
            logger.info(f"Stored {result['concepts_stored']} concepts and {result['relationships_stored']} prerequisites")
            
        except Exception as e:
            logger.error(f"Failed to store graph data: {str(e)}")
            raise ValueError(f"Graph data storage failed: {str(e)}") from e
    
    async def store_vector_data(self, doc_source: str, content_chunks: List[str], concept_tags: List[str], document_id: Optional[int] = None) -> List[int]:
        """
        Store content chunks and their vectors in PostgreSQL.
        
        Args:
            doc_source: Source filename or URL
            content_chunks: List of text content chunks
            concept_tags: List of concept tags corresponding to chunks
            document_id: Optional ID of the parent document
            
        Returns:
            List of stored chunk IDs
        """
        try:
            # Prepare batch data
            # Each item is (doc_source, content, concept_tag, document_id)
            batch_data = []
            for i, content in enumerate(content_chunks):
                # Skip empty chunks
                if not content.strip():
                    continue

                tag = concept_tags[i] if i < len(concept_tags) else "general"
                # If tag is a Concept object (from schema), extract its name
                if hasattr(tag, 'name'):
                    tag = tag.name
                
                # Ensure tag is not empty after potential conversion
                if not tag or not str(tag).strip():
                    tag = "general"

                batch_data.append((doc_source, content, tag, document_id))
            
            if not batch_data:
                logger.warning("No valid chunks to store after filtering empty content")
                return []

            # Store using vector storage system
            chunk_ids = await self.vector_storage.store_chunks_batch(batch_data)
            logger.info(f"Stored {len(chunk_ids)} content chunks from '{doc_source}'")
            return chunk_ids
            
        except Exception as e:
            logger.error(f"Failed to store vector data: {str(e)}")
            raise ValueError(f"Vector data storage failed: {str(e)}") from e
    
    async def process_document_complete(self, doc_source: str, markdown: str, content_chunks: List, document_id: Optional[int] = None) -> Tuple[GraphSchema, List[int]]:
        """
        Complete document processing: extract graph structure and store both graph and vector data.
        """
        try:
            # Prepare chunks
            if content_chunks and isinstance(content_chunks[0], tuple):
                # Document processor returns (content, concept_tag) tuples
                final_chunks = [chunk[0] for chunk in content_chunks if chunk[0].strip()]
            else:
                final_chunks = [chunk for chunk in content_chunks if chunk.strip()]

            # Extract graph structure from chunks
            schema = await self.extract_graph_structure(final_chunks)
            
            # Store graph data in Neo4j with provenance
            self.store_graph_data(schema, document_id)
            
            # Tag chunks based on semantic mapping
            # Default to "general"
            chunk_tags = ["general"] * len(final_chunks)
            
            # If we have mappings, apply them
            if schema.concept_mappings:
                # We need to handle 1 chunk having multiple tags? Vector storage usually supports 1 main tag.
                # For now, let's just pick the last assigned tagging or "multi-tagged"?
                # Vector storage schema likely expects a single string.
                # Strategy: Map chunk index to list of concepts. Join with comma? Or just pick primary?
                # Let's pick the concept with the *longest name* (heuristic for specificity) 
                # or just the first one found.
                
                chunk_to_concepts = {}
                for concept, indices in schema.concept_mappings.items():
                    for idx in indices:
                        if idx not in chunk_to_concepts:
                            chunk_to_concepts[idx] = []
                        chunk_to_concepts[idx].append(concept)
                
                for idx, concepts in chunk_to_concepts.items():
                    if 0 <= idx < len(chunk_tags):
                        # Use the most specific concept (longest name) or just the first
                        # Let's use comma-separated for now if supported, else first
                        # PostgreSQL vector storage column is 'concept_tag' (String)
                        # Storing "Concept A, Concept B" allows partial matching if ILIKE used.
                        chunk_tags[idx] = concepts[0] # Pick first for simplicity/stability
            
            # Store vector data in PostgreSQL
            chunk_ids = await self.store_vector_data(doc_source, final_chunks, chunk_tags, document_id)
            
            logger.info(f"Complete document processing finished for '{doc_source}'")
            return schema, chunk_ids
            
        except Exception as e:
            logger.error(f"Complete document processing failed: {str(e)}")
            raise ValueError(f"Document processing failed: {str(e)}") from e

    async def process_document(self, file_path: str, document_id: Optional[int] = None) -> Tuple[GraphSchema, List[int]]:
        """
        Process a document file (PDF, DOCX, etc.) from start to finish.
        
        1. Convert file to markdown
        2. Chunk content
        3. Extract knowledge graph
        4. Store graph and vector data
        
        Args:
            file_path: Path to document file
            document_id: Optional ID of the document (if pre-saved)
            
        Returns:
            Tuple of (GraphSchema, list of chunk IDs)
        """
        try:
            # 1. Convert to markdown
            markdown = self.document_processor.convert_to_markdown(file_path)
            
            # 2. Chunk content
            # Note: We don't have concepts yet for tagging, so we pass empty tag
            # The store logic will handle tagging based on extracted concepts
            chunks = self.document_processor.chunk_content(markdown)
            
            # 3 & 4. Complete processing
            return await self.process_document_complete(
                doc_source=os.path.basename(file_path),
                markdown=markdown,
                content_chunks=chunks,
                document_id=document_id
            )
            
        except Exception as e:
            logger.error(f"Document processing failed for {file_path}: {str(e)}")
            raise
