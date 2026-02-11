"""LLM-based graph extraction engine using Ollama for structured concept extraction."""

import json
import logging
import os
import asyncio
from typing import List, Optional, Tuple, Any, Dict, Callable

from pydantic import ValidationError

try:
    import ollama  # type: ignore
except Exception:
    class _OllamaStub:
        class Client:  # pragma: no cover - used only for tests/mocking
            pass
    ollama = _OllamaStub()
from dotenv import load_dotenv

from src.models.schemas import GraphSchema, PrerequisiteLink
from src.database.neo4j_conn import neo4j_conn
from src.database.graph_storage import graph_storage
from .vector_storage import VectorStorage
from .document_processor import DocumentProcessor
from src.services.llm_service import llm_service, RateLimitException
from src.models.schemas import LLMConfig
from src.config import settings

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
    
    
    def __init__(self, ollama_host: Optional[str] = None, model: Optional[str] = None):
        """
        Initialize the ingestion engine.
        Using global settings for configuration.
        """
        if ollama_host:
            settings.ollama_base_url = ollama_host
        if model:
            settings.llm_model = model
        self.vector_storage = VectorStorage()
        self.document_processor = DocumentProcessor()

        # Backwards-compat: allow env override used in older tests/configs
        env_window = os.getenv("OLLAMA_CONTEXT_WINDOW_CHARS", "").strip()
        if env_window.isdigit():
            self.MAX_EXTRACTION_CHARS = int(env_window)
    
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
    
    MAX_EXTRACTION_CHARS = settings.extraction_max_chars  # Default limit for extraction windows
    MAX_WINDOW_FAILURE_RATIO = 0.4
    MAX_WINDOW_FAILURES = 3
    
    def _create_chunked_windows(self, chunks: List[str], max_chars: Optional[int] = None) -> List[Tuple[str, int, int]]:
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
        
        limit = max_chars or self.MAX_EXTRACTION_CHARS
        for i, chunk in enumerate(chunks):
            # Format: [i] actual text
            # We use 0-based index matching the list, but LLM might prefer 1-based. 
            # Let's use 0-based in prompt for simplicity of mapping back, 
            # or explicit labeling like [Chunk 0].
            formatted_chunk = f"[Chunk {i}] {chunk}"
            chunk_len = len(formatted_chunk)
            
            if current_char_count + chunk_len > limit and current_window_text:
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

    # Backwards-compat helper for legacy tests that pass a single string.
    def _create_extraction_windows(self, content: str, max_chars: Optional[int] = None) -> List[str]:
        if content is None:
            return []
        text = str(content)
        if not text.strip():
            return []

        limit = max_chars or self.MAX_EXTRACTION_CHARS
        if len(text) <= limit:
            return [text]

        paragraphs = [p for p in text.split("\n\n") if p]
        windows: List[str] = []
        current: List[str] = []
        current_len = 0
        for para in paragraphs:
            para_len = len(para)
            if current and current_len + para_len > limit:
                windows.append("\n\n".join(current))
                overlap = current[-1:]
                current = overlap + [para]
                current_len = sum(len(p) for p in current)
            else:
                current.append(para)
                current_len += para_len
        if current:
            windows.append("\n\n".join(current))
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

    async def extract_graph_structure(
        self,
        content_chunks: List[str],
        on_progress: Optional[Any] = None, # Callable[[str, int], None]
        on_partial_schema: Optional[Any] = None, # Callable[[GraphSchema], None]
        llm_config: Optional[Any] = None,
        extraction_max_chars: Optional[int] = None,
        resume_from_window: int = 0,
        on_window_complete: Optional[Callable[[int, int], None]] = None
    ) -> GraphSchema:
        """
        Extract knowledge graph structure from content chunks using LLM.
        Supports incremental updates via callbacks.
        """
        if not content_chunks:
            raise ValueError("Cannot extract graph from empty content chunks")
            
        # Create numbered windows
        windows = self._create_chunked_windows(content_chunks, max_chars=extraction_max_chars)
        logger.info(f"Split document into {len(windows)} windows for extraction")
        
        schemas = []
        total_windows = len(windows)
        window_errors: List[str] = []
        
        last_error = None
        resume_from_window = max(0, min(resume_from_window, total_windows - 1))
        for i in range(resume_from_window, total_windows):
            window_content, start_idx, end_idx = windows[i]
            logger.info(f"Processing extraction window {i+1}/{total_windows}")
            
            # Report Progress
            if on_progress:
                progress_pct = int(((i) / total_windows) * 80) # Extraction is 80% of work
                on_progress(f"Extracting concepts from window {i+1}/{total_windows}", progress_pct)
            
            prompt = self.EXTRACTION_PROMPT_TEMPLATE.format(content=window_content)
            
            try:
                base_url = None
                if settings.llm_provider == "ollama":
                    base_url = settings.ollama_base_url
                config = llm_config or LLMConfig(
                    provider=settings.llm_provider,
                    model=settings.extraction_model if settings.extraction_model else settings.llm_model,
                    base_url=base_url
                )

                retry_attempts = 0
                max_retries = max(0, int(getattr(settings, "llm_rate_limit_retry_attempts", 3)))
                max_cooldown = max(5, int(getattr(settings, "llm_rate_limit_max_cooldown_seconds", 300)))
                while True:
                    try:
                        response_text = await llm_service.get_chat_completion(
                            messages=[{"role": "user", "content": prompt}],
                            response_format="json",
                            config=config
                        )
                        break
                    except RateLimitException as rl:
                        retry_attempts += 1
                        cooldown = rl.retry_after_seconds or 90
                        cooldown = max(5, min(cooldown, max_cooldown))
                        logger.warning(f"Rate limit hit. Cooling down for {cooldown}s (attempt {retry_attempts})")
                        if on_progress:
                            on_progress("cooldown", int(((i) / total_windows) * 80))
                        await asyncio.sleep(cooldown)
                        if retry_attempts >= max_retries:
                            raise
                
                try:
                    # Use robust parsing from llm_service
                    data = llm_service._extract_and_parse_json(response_text)
                except Exception as e:
                    logger.error(f"Failed to parse LLM response in window {i+1}: {e}")
                    window_errors.append(f"window {i+1}: parse_error")
                    continue 
                
                if not isinstance(data, dict):
                    logger.error(f"LLM response is not a JSON object in window {i+1}")
                    window_errors.append(f"window {i+1}: non_json")
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
                if 'concept_mappings' in data:
                    normalized_mappings = {}
                    total_chunks = len(content_chunks)
                    for concept, indices in data['concept_mappings'].items():
                        norm_c = self._normalize_concept_name(concept)
                        valid_indices = []
                        for idx in indices:
                            if not isinstance(idx, int):
                                continue
                            if 0 <= idx < total_chunks:
                                valid_indices.append(idx)
                                continue
                            # If LLM returns 1-based indices, map to 0-based
                            if 1 <= idx <= total_chunks:
                                valid_indices.append(idx - 1)
                        normalized_mappings[norm_c] = valid_indices
                    data['concept_mappings'] = normalized_mappings
                
                # Validate schema
                try:
                    # Auto-fix: Ensure all concepts in prerequisites are in concepts list
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
                    if on_window_complete:
                        try:
                            on_window_complete(i, total_windows)
                        except Exception as e:
                            logger.error(f"Window completion callback failed: {e}")
                        
                        # Incremental Callback
                        if on_partial_schema:
                            try:
                                on_partial_schema(schema)
                            except Exception as e:
                                logger.error(f"Partial schema callback failed: {e}")

                except ValidationError as e:
                    logger.error(f"Schema validation failed in window {i+1}: {e}")
                    window_errors.append(f"window {i+1}: validation_error")
                    continue
                    
            except Exception as e:
                last_error = e
                logger.error(f"Graph extraction failed for window {i+1}: {str(e)}")
                window_errors.append(f"window {i+1}: {type(e).__name__}")
                continue
        
        if not schemas:
            msg = str(last_error) if last_error else "Graph extraction failed for all windows"
            logger.error("No valid schemas extracted")
            raise ValueError(msg)

        failure_ratio = len(window_errors) / max(1, total_windows)
        if len(window_errors) >= self.MAX_WINDOW_FAILURES and failure_ratio >= self.MAX_WINDOW_FAILURE_RATIO:
            msg = (
                f"Partial extraction failure: {len(window_errors)}/{total_windows} windows failed. "
                "Graph build aborted to avoid fragmented data."
            )
            logger.error(msg)
            raise ValueError(msg)
        if window_errors:
            logger.warning(
                "Partial extraction success: %s/%s windows failed (%s%%).",
                len(window_errors),
                total_windows,
                int(failure_ratio * 100)
            )
            
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

    async def reindex_document_vectors(
        self,
        extracted_text: str,
        document_id: int,
        chunk_size: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Rebuild vector embeddings for a single document using extracted text.
        """
        if not extracted_text or not extracted_text.strip():
            raise ValueError("No extracted text available for reindexing.")

        try:
            processor = self.document_processor if not chunk_size else DocumentProcessor(chunk_size=chunk_size)
            chunks = processor.chunk_content(extracted_text or "")
            if chunks and isinstance(chunks[0], tuple):
                chunks = [c[0] for c in chunks if c and c[0]]

            if not chunks:
                raise ValueError("No valid chunks produced for reindexing.")

            # Remove existing vectors for this document
            try:
                self.vector_storage.delete_document_chunks(document_id)
            except Exception as e:
                logger.warning(f"Failed to delete old vectors for doc {document_id}: {e}")

            # Store fresh vectors
            chunk_tags = ["general"] * len(chunks)
            stored_chunk_ids = await self.store_vector_data(
                doc_source=f"doc_{document_id}",
                content_chunks=chunks,
                concept_tags=chunk_tags,
                document_id=document_id
            )

            return {
                "document_id": document_id,
                "chunks_stored": len(stored_chunk_ids)
            }
        except Exception as e:
            logger.error(f"Vector reindex failed for doc {document_id}: {e}")
            raise
    
    async def process_document_complete(
        self, 
        doc_source: str, 
        markdown: str, 
        content_chunks: List, 
        document_id: Optional[int] = None,
        llm_config: Optional[Any] = None,
        on_progress: Optional[Any] = None # Callable[[str, int], None] 
    ) -> Tuple[GraphSchema, List[int]]:
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
            # Pass incremental callbacks and llm_config
            schema = await self.extract_graph_structure(
                final_chunks, 
                on_progress=on_progress,
                on_partial_schema=None,
                llm_config=llm_config
            )
            
            # Store final unified graph data (ensure everything is consistent)
            self.store_graph_data(schema, document_id)
            
            # Tag chunks based on semantic mapping
            # Default to "general"
            chunk_tags = ["general"] * len(final_chunks)
            
            # If we have mappings, apply them
            if schema.concept_mappings:
                chunk_to_concepts = {}
                for concept, indices in schema.concept_mappings.items():
                    for idx in indices:
                        if idx not in chunk_to_concepts:
                            chunk_to_concepts[idx] = []
                        chunk_to_concepts[idx].append(concept)
                
                for idx, concepts in chunk_to_concepts.items():
                    if 0 <= idx < len(chunk_tags):
                        chunk_tags[idx] = concepts[0] # Pick first for simplicity/stability
            
            # Update Progress for Vector Storage
            if on_progress:
                on_progress("Indexing content vectors...", 90)

            # Store vector data in PostgreSQL
            chunk_ids = await self.store_vector_data(doc_source, final_chunks, chunk_tags, document_id)
            
            if on_progress:
                on_progress("Processing complete", 100)

            logger.info(f"Complete document processing finished for '{doc_source}'")
            return schema, chunk_ids
            
        except Exception as e:
            logger.error(f"Complete document processing failed: {str(e)}")
            raise ValueError(f"Document processing failed: {str(e)}") from e

    async def process_document(
        self, 
        file_path: str, 
        document_id: Optional[int] = None,
        on_progress: Optional[Any] = None
    ) -> Tuple[GraphSchema, List[int]]:
        """
        Process a document file (PDF, DOCX, etc.) from start to finish.
        """
        try:
            # 1. Convert to markdown
            if on_progress:
                on_progress("Converting PDF to Text", 5)
            markdown, image_metadata = self.document_processor.convert_to_markdown(file_path)
            
            # 2. Chunk content
            if on_progress:
                on_progress("Chunking content", 10)
            chunks = self.document_processor.chunk_content(markdown)
            
            # 3 & 4. Complete processing
            return await self.process_document_complete(
                doc_source=os.path.basename(file_path),
                markdown=markdown,
                content_chunks=chunks,
                document_id=document_id,
                on_progress=on_progress
            )
            
        except Exception as e:
            logger.error(f"Document processing failed for {file_path}: {str(e)}")
            raise
    
    # ========== Multi-Document Graph Ingestion ==========
    
    async def extract_graph_structure_for_document(
        self,
        content_chunks: List[str],
        document_id: int,
        llm_config: Optional[Any] = None,
        extraction_max_chars: Optional[int] = None,
        on_progress: Optional[Any] = None,
        resume_from_window: int = 0,
        on_window_complete: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, Any]:
        """
        Extract and store graph structure with document scoping.
        
        This is an enhanced version of extract_graph_structure that also stores
        concepts and relationships using document-scoped IDs.
        
        Args:
            content_chunks: List of text chunks
            document_id: The document ID for scoping
            
        Returns:
            Dict with extraction stats
        """
        from src.database.graph_storage import multi_doc_graph_storage
        
        # Extract graph structure
        schema = await self.extract_graph_structure(
            content_chunks,
            on_progress=on_progress,
            llm_config=llm_config,
            extraction_max_chars=extraction_max_chars,
            resume_from_window=resume_from_window,
            on_window_complete=on_window_complete
        )
        
        concepts_stored = 0
        relationships_stored = 0
        
        # Store concepts with document scoping
        for concept_name in schema.concepts:
            chunk_ids = schema.concept_mappings.get(concept_name, [])
            
            success = multi_doc_graph_storage.store_document_concept(
                document_id=document_id,
                concept_name=concept_name,
                description=None,  # Could extract from chunks if needed
                depth_level=None,
                chunk_ids=chunk_ids
            )
            if success:
                concepts_stored += 1
        
        # Store relationships with document scoping
        for prereq in schema.prerequisites:
            success = multi_doc_graph_storage.store_document_relationship(
                document_id=document_id,
                source_concept=prereq.source_concept,
                target_concept=prereq.target_concept,
                weight=prereq.weight,
                reasoning=prereq.reasoning
            )
            if success:
                relationships_stored += 1
        
        return {
            "document_id": document_id,
            "concepts_stored": concepts_stored,
            "relationships_stored": relationships_stored,
            "concepts_total": len(schema.concepts),
            "relationships_total": len(schema.prerequisites)
        }
    
    async def process_document_scoped(self, file_path: str, document_id: int, llm_config: Optional[Any] = None) -> Dict[str, Any]:
        """
        Process a document using document-scoped graph storage.
        """
        try:
            # 1. Convert to markdown
            markdown, image_metadata = self.document_processor.convert_to_markdown(file_path)
            
            # 2. Chunk content
            chunks = self.document_processor.chunk_content(markdown)
            if chunks and isinstance(chunks[0], tuple):
                chunks = [c[0] for c in chunks if c and c[0]]
            
            # 3. Extract and store scoped graph
            result = await self.extract_graph_structure_for_document(chunks, document_id, llm_config=llm_config)
            
            # 4. Store vector data (still uses original storage)
            chunk_tags = ["general"] * len(chunks)
            stored_chunk_ids = await self.store_vector_data(
                doc_source=os.path.basename(file_path),
                content_chunks=chunks,
                concept_tags=chunk_tags,
                document_id=document_id
            )
            
            result["chunks_stored"] = len(stored_chunk_ids)
            result["filename"] = os.path.basename(file_path)
            
            return result
            
        except Exception as e:
            logger.error(f"Scoped document processing failed for {file_path}: {e}")
            raise

    async def process_document_scoped_from_text(
        self,
        extracted_text: str,
        document_id: int,
        llm_config: Optional[Any] = None,
        extraction_max_chars: Optional[int] = None,
        chunk_size: Optional[int] = None,
        on_progress: Optional[Any] = None,
        resume_from_window: int = 0,
        on_window_complete: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, Any]:
        """
        Process a document using already extracted text (no file IO),
        using document-scoped graph storage.
        """
        try:
            processor = self.document_processor if not chunk_size else DocumentProcessor(chunk_size=chunk_size)
            chunks = processor.chunk_content(extracted_text or "")
            if chunks and isinstance(chunks[0], tuple):
                chunks = [c[0] for c in chunks if c and c[0]]
            result = await self.extract_graph_structure_for_document(
                chunks,
                document_id,
                llm_config=llm_config,
                extraction_max_chars=extraction_max_chars,
                on_progress=on_progress,
                resume_from_window=resume_from_window,
                on_window_complete=on_window_complete
            )

            # Store vector data for this document
            chunk_tags = ["general"] * len(chunks)
            stored_chunk_ids = await self.store_vector_data(
                doc_source=f"doc_{document_id}",
                content_chunks=chunks,
                concept_tags=chunk_tags,
                document_id=document_id
            )

            result["chunks_stored"] = len(stored_chunk_ids)
            return result
        except Exception as e:
            logger.error(f"Scoped document processing failed (text) for doc {document_id}: {e}")
            raise
    
    def merge_cross_document_concepts(
        self,
        document_id: int,
        concept_name: str,
        similarity_threshold: float = 0.85
    ) -> Dict[str, Any]:
        """
        Find and merge the same concept across documents.
        
        Uses the LLM to determine if concepts from different documents
        are semantically similar enough to merge.
        
        Args:
            document_id: The document to check
            concept_name: Concept to find across documents
            similarity_threshold: Minimum similarity to merge
            
        Returns:
            Dict with merge result
        """
        from src.database.graph_storage import multi_doc_graph_storage
        
        # Find concept across documents
        occurrences = multi_doc_graph_storage.find_cross_document_concepts(concept_name)
        
        if len(occurrences) < 2:
            return {
                "status": "no_merge_needed",
                "occurrences": len(occurrences),
                "message": "Concept appears in only one document or no duplicates found"
            }
        
        # For now, auto-merge if found in multiple documents
        # In production, this would use LLM to verify semantic similarity
        scoped_ids = [o["scoped_id"] for o in occurrences]
        
        success = multi_doc_graph_storage.merge_cross_document_concepts(
            scoped_ids=scoped_ids,
            global_name=concept_name
        )
        
        if success:
            return {
                "status": "merged",
                "global_name": concept_name,
                "merged_documents": [o["document_id"] for o in occurrences],
                "scoped_ids": scoped_ids
            }
        else:
            return {
                "status": "failed",
                "message": "Merge operation failed"
            }
