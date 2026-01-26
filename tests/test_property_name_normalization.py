"""Property-based tests for concept name normalization.

**Feature: learnfast-core-engine, Property 21: Name normalization consistency**
**Validates: Requirements 6.3**

Property 21: Name normalization consistency
For any concept name (regardless of case), normalizing it should produce a lowercase
version, and normalizing twice should produce the same result as normalizing once
(idempotence).
"""

from hypothesis import given, strategies as st, settings

from src.ingestion.ingestion_engine import IngestionEngine


# Strategy for generating concept names with mixed case
concept_names_mixed_case = st.text(
    alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd", "Zs")),
    min_size=1,
    max_size=100
).filter(lambda x: x.strip() != "")


@settings(max_examples=100)
@given(name=concept_names_mixed_case)
def test_normalize_concept_name_produces_lowercase(name: str):
    """
    Property: For any concept name, normalizing it should produce a lowercase version.
    
    This validates that concept name normalization converts all names to lowercase
    for consistent storage.
    """
    engine = IngestionEngine()
    
    normalized = engine._normalize_concept_name(name)
    
    # Verify the result is lowercase
    assert normalized == normalized.lower(), \
        f"Normalized name '{normalized}' is not lowercase"
    
    # Verify the result is stripped of leading/trailing whitespace
    assert normalized == normalized.strip(), \
        f"Normalized name '{normalized}' has leading/trailing whitespace"


@settings(max_examples=100)
@given(name=concept_names_mixed_case)
def test_normalize_concept_name_idempotence(name: str):
    """
    Property: Normalizing a concept name twice should produce the same result
    as normalizing once (idempotence).
    
    This validates that normalization is a stable operation.
    """
    engine = IngestionEngine()
    
    normalized_once = engine._normalize_concept_name(name)
    normalized_twice = engine._normalize_concept_name(normalized_once)
    
    # Verify idempotence
    assert normalized_once == normalized_twice, \
        f"Normalization is not idempotent: '{normalized_once}' != '{normalized_twice}'"


@settings(max_examples=100)
@given(
    name1=concept_names_mixed_case,
    name2=concept_names_mixed_case
)
def test_normalize_concept_name_case_insensitive_equality(name1: str, name2: str):
    """
    Property: Two concept names that differ only in case should normalize to the same value.
    
    This validates that normalization provides case-insensitive equality.
    """
    engine = IngestionEngine()
    
    # If the names are equal when lowercased, they should normalize to the same value
    if name1.strip().lower() == name2.strip().lower():
        normalized1 = engine._normalize_concept_name(name1)
        normalized2 = engine._normalize_concept_name(name2)
        
        assert normalized1 == normalized2, \
            f"Names with same lowercase form should normalize equally: '{normalized1}' != '{normalized2}'"


@settings(max_examples=100)
@given(name=st.text(min_size=1, max_size=100))
def test_normalize_preserves_content(name: str):
    """
    Property: Normalization should preserve the content of the name (except for case and whitespace).
    
    This validates that normalization doesn't remove or alter characters beyond case conversion.
    """
    engine = IngestionEngine()
    
    normalized = engine._normalize_concept_name(name)
    
    # The normalized version should be equivalent to strip + lower
    expected = name.strip().lower()
    
    assert normalized == expected, \
        f"Normalization altered content: expected '{expected}', got '{normalized}'"
