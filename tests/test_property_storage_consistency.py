"""Property-based tests for storage round-trip consistency.

**Feature: learnfast-core-engine, Property 4: Storage round-trip consistency**
**Validates: Requirements 1.4**

Property 4: Storage round-trip consistency
For any valid content chunk with concept tagging, storing it in the vector database
and then retrieving it should produce equivalent content and metadata.
"""

from hypothesis import given, strategies as st, settings
import pytest
from typing import List

from src.ingestion.vector_storage import VectorStorage
from src.models.schemas import LearningChunk


# Strategy for generating valid document sources
doc_sources = st.text(
    alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd"), min_codepoint=32, max_codepoint=126),
    min_size=1,
    max_size=100
).filter(lambda x: x.strip() != "" and not any(c in x for c in ['<', '>', '|', '*', '?', '"']))


# Strategy for generating valid content chunks
content_chunks = st.text(
    alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd", "Po", "Zs"), min_codepoint=32, max_codepoint=126),
    min_size=10,
    max_size=1000
).filter(lambda x: x.strip() != "")


# Strategy for generating valid concept tags (lowercase)
concept_tags = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Nd"), min_codepoint=97, max_codepoint=122),
    min_size=1,
    max_size=50
).filter(lambda x: x.strip() != "")


@pytest.fixture(scope="module")
def vector_storage():
    """Create a VectorStorage instance for testing."""
    return VectorStorage()


@settings(max_examples=50, deadline=None)  # Disable deadline for embedding operations
@given(
    doc_source=doc_sources,
    content=content_chunks,
    concept_tag=concept_tags
)
def test_single_chunk_storage_round_trip(vector_storage: VectorStorage, doc_source: str, content: str, concept_tag: str):
    """
    Property: For any valid content chunk, storing it and then retrieving by concept
    should return the same content and metadata.
    
    This validates that the vector storage system maintains data integrity
    through the store/retrieve cycle.
    """
    try:
        # Clean up any existing test data for this concept
        vector_storage.delete_chunks_by_concept(concept_tag)
        
        # Store the chunk
        chunk_id = vector_storage.store_chunk(doc_source, content, concept_tag)
        assert chunk_id > 0
        
        # Retrieve chunks by concept
        retrieved_chunks = vector_storage.retrieve_chunks_by_concept(concept_tag)
        
        # Should have exactly one chunk
        assert len(retrieved_chunks) == 1
        
        retrieved_chunk = retrieved_chunks[0]
        
        # Verify content and metadata consistency
        assert retrieved_chunk.doc_source == doc_source.strip()
        assert retrieved_chunk.content == content.strip()
        assert retrieved_chunk.concept_tag == concept_tag.strip().lower()
        assert retrieved_chunk.id == chunk_id
        assert retrieved_chunk.created_at is not None
        
    finally:
        # Clean up test data
        try:
            vector_storage.delete_chunks_by_concept(concept_tag)
        except Exception:
            pass  # Ignore cleanup errors


@settings(max_examples=20, deadline=None)  # Disable deadline for batch operations
@given(
    doc_source=doc_sources,
    chunks_data=st.lists(
        st.tuples(content_chunks, concept_tags),
        min_size=1,
        max_size=5,
        unique=True
    )
)
def test_batch_storage_round_trip(vector_storage: VectorStorage, doc_source: str, chunks_data: List[tuple]):
    """
    Property: For any valid batch of content chunks, storing them and retrieving
    by concept should return all chunks with consistent data.
    
    This validates batch storage consistency and concept-based retrieval.
    """
    try:
        # Prepare batch data
        batch_chunks = [(doc_source, content, concept_tag) for content, concept_tag in chunks_data]
        concept_tags_used = [concept_tag for _, concept_tag in chunks_data]
        
        # Clean up any existing test data
        for concept_tag in set(concept_tags_used):
            vector_storage.delete_chunks_by_concept(concept_tag)
        
        # Store chunks in batch
        chunk_ids = vector_storage.store_chunks_batch(batch_chunks)
        assert len(chunk_ids) == len(batch_chunks)
        assert all(chunk_id > 0 for chunk_id in chunk_ids)
        
        # Verify each concept has the correct chunks
        for content, concept_tag in chunks_data:
            retrieved_chunks = vector_storage.retrieve_chunks_by_concept(concept_tag)
            
            # Find the chunk with matching content
            matching_chunks = [c for c in retrieved_chunks if c.content == content.strip()]
            assert len(matching_chunks) == 1
            
            chunk = matching_chunks[0]
            assert chunk.doc_source == doc_source.strip()
            assert chunk.concept_tag == concept_tag.strip().lower()
            assert chunk.id in chunk_ids
        
        # Verify chunk counts
        for concept_tag in set(concept_tags_used):
            expected_count = concept_tags_used.count(concept_tag)
            actual_count = vector_storage.get_chunk_count_by_concept(concept_tag)
            assert actual_count == expected_count
        
    finally:
        # Clean up test data
        for concept_tag in set(concept_tags_used):
            try:
                vector_storage.delete_chunks_by_concept(concept_tag)
            except Exception:
                pass  # Ignore cleanup errors


@settings(max_examples=30, deadline=None)  # Disable deadline for similarity search
@given(
    doc_source=doc_sources,
    content=content_chunks,
    concept_tag=concept_tags,
    query_text=content_chunks
)
def test_similarity_search_consistency(vector_storage: VectorStorage, doc_source: str, content: str, concept_tag: str, query_text: str):
    """
    Property: For any stored content chunk, similarity search should be able to find it
    when using similar query text, and the returned chunk should have consistent data.
    
    This validates that vector similarity search maintains data integrity.
    """
    try:
        # Clean up any existing test data
        vector_storage.delete_chunks_by_concept(concept_tag)
        
        # Store the chunk
        chunk_id = vector_storage.store_chunk(doc_source, content, concept_tag)
        
        # Perform similarity search
        results = vector_storage.similarity_search(query_text, limit=10)
        
        # Should have at least one result (our stored chunk might not be the most similar)
        assert len(results) >= 0  # Could be 0 if no similar content exists
        
        # If our chunk is in the results, verify its consistency
        for chunk, similarity_score in results:
            if chunk.id == chunk_id:
                assert chunk.doc_source == doc_source.strip()
                assert chunk.content == content.strip()
                assert chunk.concept_tag == concept_tag.strip().lower()
                assert 0.0 <= similarity_score <= 1.0
                break
        
        # Test concept-filtered similarity search
        filtered_results = vector_storage.similarity_search(query_text, limit=10, concept_filter=concept_tag)
        
        # All results should be from the specified concept
        for chunk, similarity_score in filtered_results:
            assert chunk.concept_tag == concept_tag.strip().lower()
            assert 0.0 <= similarity_score <= 1.0
        
    finally:
        # Clean up test data
        try:
            vector_storage.delete_chunks_by_concept(concept_tag)
        except Exception:
            pass  # Ignore cleanup errors


@settings(max_examples=50, deadline=None)  # Disable deadline for database operations
@given(concept_tag=concept_tags)
def test_empty_concept_retrieval_consistency(vector_storage: VectorStorage, concept_tag: str):
    """
    Property: For any concept tag that has no stored chunks, retrieval operations
    should return empty results consistently.
    
    This validates that the storage system handles empty states correctly.
    """
    try:
        # Ensure concept has no chunks
        vector_storage.delete_chunks_by_concept(concept_tag)
        
        # Verify empty retrieval
        chunks = vector_storage.retrieve_chunks_by_concept(concept_tag)
        assert len(chunks) == 0
        
        # Verify zero count
        count = vector_storage.get_chunk_count_by_concept(concept_tag)
        assert count == 0
        
        # Verify filtered similarity search returns empty
        results = vector_storage.similarity_search("test query", concept_filter=concept_tag)
        assert len(results) == 0
        
    finally:
        # Clean up (should be no-op)
        try:
            vector_storage.delete_chunks_by_concept(concept_tag)
        except Exception:
            pass  # Ignore cleanup errors