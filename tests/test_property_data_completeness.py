"""Property-based tests for data completeness validation.

**Feature: learnfast-core-engine, Property 20: Data completeness validation**
**Validates: Requirements 5.2, 5.3, 6.2**

Property 20: Data completeness validation
For any PrerequisiteLink or LearningChunk, all required metadata fields must be 
present and valid. PrerequisiteLinks must include weight and reasoning. 
LearningChunks must include embeddings, source metadata, and concept tags.
"""

from hypothesis import given, strategies as st, settings
from pydantic import ValidationError
import pytest

from src.models.schemas import PrerequisiteLink, LearningChunk


# Strategy for generating valid concept names
concept_names = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Nd"), min_codepoint=97, max_codepoint=122),
    min_size=1,
    max_size=50
).filter(lambda x: x.strip() != "")

# Strategy for generating valid reasoning text (non-whitespace)
reasoning_text = st.text(min_size=1, max_size=500).filter(lambda x: x.strip() != "")


@settings(max_examples=100)
@given(
    source=concept_names,
    target=concept_names,
    weight=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    reasoning=reasoning_text
)
def test_prerequisite_link_has_required_metadata(source: str, target: str, weight: float, reasoning: str):
    """
    Property: For any PrerequisiteLink, it must include weight (0.0-1.0) and 
    reasoning metadata.
    
    This validates Requirement 5.2: "WHEN storing prerequisite relationships, 
    THE Knowledge Graph SHALL include weight and reasoning metadata for each relationship"
    
    And Requirement 6.2: "WHEN extracting prerequisite relationships, THE Ingestion 
    Engine SHALL include dependency weight (0.0-1.0) and reasoning for each relationship"
    """
    if source == target:
        # Skip if source equals target
        return
    
    # Create PrerequisiteLink
    link = PrerequisiteLink(
        source_concept=source,
        target_concept=target,
        weight=weight,
        reasoning=reasoning
    )
    
    # Verify all required metadata is present
    assert link.weight is not None, "Weight metadata must be present"
    assert link.reasoning is not None, "Reasoning metadata must be present"
    assert link.reasoning.strip() != "", "Reasoning must not be empty"
    
    # Verify weight is in valid range
    assert 0.0 <= link.weight <= 1.0, "Weight must be between 0.0 and 1.0"
    
    # Verify concepts are present
    assert link.source_concept is not None, "Source concept must be present"
    assert link.target_concept is not None, "Target concept must be present"


@settings(max_examples=100)
@given(
    source=concept_names,
    target=concept_names,
    weight=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)
)
def test_prerequisite_link_requires_reasoning(source: str, target: str, weight: float):
    """
    Property: PrerequisiteLink creation should fail if reasoning is missing.
    
    This validates that reasoning metadata is mandatory.
    """
    if source == target:
        return
    
    # Attempting to create without reasoning should fail
    with pytest.raises((ValidationError, TypeError)):
        PrerequisiteLink(
            source_concept=source,
            target_concept=target,
            weight=weight
            # reasoning is missing
        )


@settings(max_examples=100)
@given(
    doc_source=st.text(min_size=1, max_size=200),
    content=st.text(min_size=1, max_size=1000),
    concept_tag=concept_names
)
def test_learning_chunk_has_required_metadata(doc_source: str, content: str, concept_tag: str):
    """
    Property: For any LearningChunk, it must include source metadata and concept tags.
    
    This validates Requirement 5.3: "WHEN storing content chunks, THE Vector Database 
    SHALL include embeddings, source metadata, and concept tags"
    
    Note: Embeddings are handled at the database layer, but the model must support
    the metadata structure.
    """
    # Create LearningChunk
    chunk = LearningChunk(
        doc_source=doc_source,
        content=content,
        concept_tag=concept_tag
    )
    
    # Verify all required metadata is present
    assert chunk.doc_source is not None, "Source metadata must be present"
    assert chunk.doc_source.strip() != "", "Source metadata must not be empty"
    assert chunk.content is not None, "Content must be present"
    assert chunk.content.strip() != "", "Content must not be empty"
    assert chunk.concept_tag is not None, "Concept tag must be present"
    assert chunk.concept_tag.strip() != "", "Concept tag must not be empty"


@settings(max_examples=100)
@given(
    content=st.text(min_size=1, max_size=1000),
    concept_tag=concept_names
)
def test_learning_chunk_requires_source_metadata(content: str, concept_tag: str):
    """
    Property: LearningChunk creation should fail if source metadata is missing.
    
    This validates that source metadata is mandatory.
    """
    # Attempting to create without doc_source should fail
    with pytest.raises((ValidationError, TypeError)):
        LearningChunk(
            content=content,
            concept_tag=concept_tag
            # doc_source is missing
        )


@settings(max_examples=100)
@given(
    doc_source=st.text(min_size=1, max_size=200),
    content=st.text(min_size=1, max_size=1000)
)
def test_learning_chunk_requires_concept_tag(doc_source: str, content: str):
    """
    Property: LearningChunk creation should fail if concept tag is missing.
    
    This validates that concept tags are mandatory for retrieval.
    """
    # Attempting to create without concept_tag should fail
    with pytest.raises((ValidationError, TypeError)):
        LearningChunk(
            doc_source=doc_source,
            content=content
            # concept_tag is missing
        )


@settings(max_examples=100)
@given(
    source=concept_names,
    target=concept_names,
    reasoning=reasoning_text
)
def test_prerequisite_link_requires_weight(source: str, target: str, reasoning: str):
    """
    Property: PrerequisiteLink creation should fail if weight is missing.
    
    This validates that weight metadata is mandatory.
    """
    if source == target:
        return
    
    # Attempting to create without weight should fail
    with pytest.raises((ValidationError, TypeError)):
        PrerequisiteLink(
            source_concept=source,
            target_concept=target,
            reasoning=reasoning
            # weight is missing
        )


@settings(max_examples=100)
@given(
    source=concept_names,
    target=concept_names,
    weight=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    reasoning=reasoning_text
)
def test_prerequisite_link_completeness_invariant(source: str, target: str, weight: float, reasoning: str):
    """
    Property: For any valid PrerequisiteLink, serializing and deserializing must 
    preserve all metadata fields without loss.
    
    This validates data completeness through round-trip operations.
    """
    if source == target:
        return
    
    # Create original link
    original = PrerequisiteLink(
        source_concept=source,
        target_concept=target,
        weight=weight,
        reasoning=reasoning
    )
    
    # Serialize to dict
    data = original.model_dump()
    
    # Deserialize back
    reconstructed = PrerequisiteLink(**data)
    
    # Verify all metadata is preserved
    assert reconstructed.source_concept == original.source_concept
    assert reconstructed.target_concept == original.target_concept
    assert abs(reconstructed.weight - original.weight) < 1e-9
    assert reconstructed.reasoning == original.reasoning
    
    # Verify no fields are None
    assert reconstructed.source_concept is not None
    assert reconstructed.target_concept is not None
    assert reconstructed.weight is not None
    assert reconstructed.reasoning is not None


@settings(max_examples=100)
@given(
    doc_source=st.text(min_size=1, max_size=200),
    content=st.text(min_size=1, max_size=1000),
    concept_tag=concept_names
)
def test_learning_chunk_completeness_invariant(doc_source: str, content: str, concept_tag: str):
    """
    Property: For any valid LearningChunk, serializing and deserializing must 
    preserve all metadata fields without loss.
    
    This validates data completeness through round-trip operations.
    """
    # Create original chunk
    original = LearningChunk(
        doc_source=doc_source,
        content=content,
        concept_tag=concept_tag
    )
    
    # Serialize to dict
    data = original.model_dump()
    
    # Deserialize back
    reconstructed = LearningChunk(**data)
    
    # Verify all metadata is preserved
    assert reconstructed.doc_source == original.doc_source
    assert reconstructed.content == original.content
    assert reconstructed.concept_tag == original.concept_tag
    
    # Verify no required fields are None
    assert reconstructed.doc_source is not None
    assert reconstructed.content is not None
    assert reconstructed.concept_tag is not None
