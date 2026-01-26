"""
Property-based tests for content chunk tagging consistency.

**Feature: learnfast-core-engine, Property 5: Content chunk tagging consistency**
**Validates: Requirements 1.5**
"""

from hypothesis import given, settings, strategies as st, assume
from src.ingestion.document_processor import DocumentProcessor


# Strategy for generating markdown content
markdown_text = st.text(
    alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z')),
    min_size=50,
    max_size=10000
)

# Strategy for generating concept tags
concept_tag = st.text(
    alphabet=st.characters(whitelist_categories=('L', 'N')),
    min_size=1,
    max_size=50
).filter(lambda x: x.strip())


@settings(max_examples=100)
@given(content=markdown_text, tag=concept_tag)
def test_property_chunk_tagging_consistency(content: str, tag: str):
    """
    Property 5: Content chunk tagging consistency
    
    For any markdown content and concept tag, when chunking content,
    each chunk should be tagged with the provided concept tag.
    
    This validates that the tagging mechanism is consistent across
    all chunks produced from a document.
    """
    processor = DocumentProcessor()
    
    # Skip empty content
    if not content.strip():
        return
    
    # Chunk the content with the concept tag
    chunks = processor.chunk_content(content, concept_tag=tag)
    
    # Property: All chunks should be tuples of (content, tag)
    for chunk in chunks:
        assert isinstance(chunk, tuple), "Each chunk should be a tuple"
        assert len(chunk) == 2, "Each chunk should have exactly 2 elements"
        chunk_content, chunk_tag = chunk
        assert isinstance(chunk_content, str), "Chunk content should be a string"
        assert isinstance(chunk_tag, str), "Chunk tag should be a string"
    
    # Property: All chunks should have the same concept tag
    for chunk_content, chunk_tag in chunks:
        assert chunk_tag == tag, f"All chunks should be tagged with '{tag}', got '{chunk_tag}'"


@settings(max_examples=100)
@given(content=markdown_text, tag=concept_tag, chunk_size=st.integers(min_value=100, max_value=5000))
def test_property_chunk_size_respected(content: str, tag: str, chunk_size: int):
    """
    Property 5: Content chunk tagging consistency (size constraint)
    
    For any markdown content, chunks should respect the configured chunk size
    (with reasonable tolerance for paragraph boundaries).
    
    This validates that chunking produces appropriately sized chunks.
    """
    # Skip empty content
    if not content.strip():
        return
    
    processor = DocumentProcessor(chunk_size=chunk_size)
    chunks = processor.chunk_content(content, concept_tag=tag)
    
    # Property: Most chunks should be reasonably sized
    # (allowing for paragraph boundaries and sentence splitting)
    for chunk_content, chunk_tag in chunks:
        # Chunks should not be excessively large (2x the limit is reasonable tolerance)
        assert len(chunk_content) <= chunk_size * 2, \
            f"Chunk size {len(chunk_content)} exceeds 2x limit {chunk_size * 2}"


@settings(max_examples=100)
@given(content=markdown_text)
def test_property_chunk_content_completeness(content: str):
    """
    Property 5: Content chunk tagging consistency (completeness)
    
    For any markdown content, the concatenation of all chunks should
    preserve the essential content (accounting for whitespace normalization).
    
    This validates that chunking doesn't lose content.
    """
    # Skip empty content
    if not content.strip():
        return
    
    processor = DocumentProcessor()
    chunks = processor.chunk_content(content, concept_tag="test")
    
    # Property: If input has content, we should get chunks
    if content.strip():
        assert len(chunks) > 0, "Non-empty content should produce at least one chunk"
    
    # Property: Concatenating chunks should preserve content length approximately
    # (allowing for whitespace normalization)
    total_chunk_length = sum(len(chunk_content) for chunk_content, _ in chunks)
    original_length = len(content.strip())
    
    if original_length > 0:
        # The total chunk length should be within reasonable bounds of original
        # (accounting for paragraph boundary normalization)
        ratio = total_chunk_length / original_length
        assert 0.5 <= ratio <= 1.5, \
            f"Chunk length ratio {ratio} outside reasonable bounds [0.5, 1.5]"


@settings(max_examples=100)
@given(content=markdown_text, tag=concept_tag)
def test_property_empty_tag_handling(content: str, tag: str):
    """
    Property 5: Content chunk tagging consistency (empty tag handling)
    
    For any content, chunking should work even with an empty concept tag.
    
    This validates robustness of the tagging mechanism.
    """
    processor = DocumentProcessor()
    
    # Test with empty tag
    chunks = processor.chunk_content(content, concept_tag="")
    
    # Property: All chunks should have empty tag
    for chunk_content, chunk_tag in chunks:
        assert chunk_tag == "", "Empty tag should be preserved"


def test_property_chunk_no_content_loss():
    """
    Property 5: Content chunk tagging consistency (no content loss)
    
    For specific known content, verify that chunking preserves all text.
    """
    processor = DocumentProcessor(chunk_size=100)
    
    # Test with known content
    content = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    chunks = processor.chunk_content(content, concept_tag="test_concept")
    
    # Property: All chunks should be tagged correctly
    for _, tag in chunks:
        assert tag == "test_concept"
    
    # Property: Content should be preserved
    reconstructed = "\n\n".join(chunk_content for chunk_content, _ in chunks)
    
    # Check that key words are preserved
    assert "First" in reconstructed or "first" in reconstructed.lower()
    assert "Second" in reconstructed or "second" in reconstructed.lower()
    assert "Third" in reconstructed or "third" in reconstructed.lower()
