"""Property-based tests for LLM-based graph extraction.

**Feature: learnfast-core-engine, Property 2: Graph extraction structure validation**
**Validates: Requirements 1.2**

Property 2: Graph extraction structure validation
For any markdown content that successfully extracts to a GraphSchema, the schema must:
1. Contain valid JSON conforming to GraphSchema structure
2. Have all prerequisite source/target concepts present in the concepts list
3. Have all concept names normalized to lowercase
4. Have all prerequisite weights in the range [0.0, 1.0]
"""

from hypothesis import given, strategies as st, settings, assume
from pydantic import ValidationError
import pytest
from unittest.mock import Mock, patch

from src.ingestion.ingestion_engine import IngestionEngine
from src.models.schemas import GraphSchema, PrerequisiteLink


# Strategy for generating markdown-like content
markdown_content = st.text(
    alphabet=st.characters(blacklist_characters="\x00"),
    min_size=50,
    max_size=500
).filter(lambda x: x.strip() != "")


# Strategy for generating valid GraphSchema responses (what LLM would return)
@st.composite
def mock_llm_response_strategy(draw):
    """Generate mock LLM responses that should produce valid GraphSchemas."""
    # Generate concepts (lowercase)
    num_concepts = draw(st.integers(min_value=1, max_value=10))
    concepts = []
    for i in range(num_concepts):
        concept = draw(st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Nd", "Zs"), min_codepoint=97, max_codepoint=122),
            min_size=3,
            max_size=30
        ).filter(lambda x: x.strip() != ""))
        concepts.append(concept.lower().strip())
    
    concepts = list(set(concepts))  # Ensure uniqueness
    assume(len(concepts) >= 2)  # Need at least 2 for prerequisites
    
    # Generate prerequisites
    num_prereqs = draw(st.integers(min_value=0, max_value=min(len(concepts) * 2, 20)))
    prerequisites = []
    
    for _ in range(num_prereqs):
        source = draw(st.sampled_from(concepts))
        target = draw(st.sampled_from([c for c in concepts if c != source]))
        weight = draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
        reasoning = draw(st.text(min_size=5, max_size=100).filter(lambda x: x.strip() != ""))
        
        prerequisites.append({
            "source_concept": source,
            "target_concept": target,
            "weight": weight,
            "reasoning": reasoning
        })
    
    return {
        "concepts": concepts,
        "prerequisites": prerequisites
    }


@settings(max_examples=100)
@given(
    content=markdown_content,
    llm_response=mock_llm_response_strategy()
)
def test_graph_extraction_produces_valid_schema(content: str, llm_response: dict):
    """
    Property: For any markdown content, if extraction succeeds, the result must be
    a valid GraphSchema with all concepts in prerequisites present in the concepts list.
    
    This validates that the extraction process enforces schema compliance.
    """
    engine = IngestionEngine()
    
    # Mock the Ollama client to return our controlled response
    with patch.object(engine, '_get_client') as mock_client:
        mock_response = {
            'message': {
                'content': str(llm_response).replace("'", '"')  # Convert to JSON-like string
            }
        }
        mock_client.return_value.chat = Mock(return_value=mock_response)
        
        # Mock json.loads to return our structured data
        with patch('src.ingestion.ingestion_engine.json.loads', return_value=llm_response):
            try:
                schema = engine.extract_graph_structure(content)
                
                # Verify it's a valid GraphSchema
                assert isinstance(schema, GraphSchema)
                
                # Verify all concepts are lowercase
                for concept in schema.concepts:
                    assert concept == concept.lower(), f"Concept '{concept}' is not lowercase"
                
                # Verify all prerequisites reference valid concepts
                concept_set = set(schema.concepts)
                for prereq in schema.prerequisites:
                    assert prereq.source_concept in concept_set, \
                        f"Source concept '{prereq.source_concept}' not in concepts list"
                    assert prereq.target_concept in concept_set, \
                        f"Target concept '{prereq.target_concept}' not in concepts list"
                    
                    # Verify weight is in valid range
                    assert 0.0 <= prereq.weight <= 1.0, \
                        f"Weight {prereq.weight} is outside valid range [0.0, 1.0]"
                    
                    # Verify concepts are lowercase
                    assert prereq.source_concept == prereq.source_concept.lower()
                    assert prereq.target_concept == prereq.target_concept.lower()
                    
            except (ValueError, ValidationError):
                # If extraction fails, that's acceptable - we're testing that
                # successful extractions produce valid schemas
                pass


@settings(max_examples=100)
@given(llm_response=mock_llm_response_strategy())
def test_validate_graph_structure_consistency(llm_response: dict):
    """
    Property: For any GraphSchema, validate_graph_structure should return True
    if and only if all prerequisite concepts exist in the concepts list.
    
    This validates the internal consistency checking logic.
    """
    engine = IngestionEngine()
    
    # Create a valid schema from the response
    schema = GraphSchema(**llm_response)
    
    # Should validate successfully since our strategy ensures consistency
    assert engine.validate_graph_structure(schema) is True
    
    # Now test with an invalid schema (add a prerequisite with unknown concept)
    if schema.prerequisites:
        invalid_prereq = PrerequisiteLink(
            source_concept="nonexistent_concept_xyz",
            target_concept=schema.concepts[0] if schema.concepts else "another_nonexistent",
            weight=0.5,
            reasoning="Test invalid prerequisite"
        )
        invalid_schema = GraphSchema(
            concepts=schema.concepts,
            prerequisites=schema.prerequisites + [invalid_prereq]
        )
        
        # Should fail validation
        assert engine.validate_graph_structure(invalid_schema) is False


def test_empty_content_raises_error():
    """
    Property: Extracting from empty content should raise ValueError.
    
    This validates error handling for invalid inputs.
    """
    engine = IngestionEngine()
    
    with pytest.raises(ValueError, match="Cannot extract graph structure from empty content"):
        engine.extract_graph_structure("")
    
    with pytest.raises(ValueError, match="Cannot extract graph structure from empty content"):
        engine.extract_graph_structure("   \n\t  ")


@settings(max_examples=100)
@given(
    invalid_json=st.text(min_size=1, max_size=200).filter(
        lambda x: x.strip() and not x.strip().startswith('{')
    )
)
def test_invalid_json_response_raises_error(invalid_json: str):
    """
    Property: If the LLM returns invalid JSON, extract_graph_structure should
    raise ValueError with appropriate error message.
    
    This validates error handling for malformed LLM responses.
    """
    engine = IngestionEngine()
    
    # Mock the Ollama client to return invalid JSON
    with patch.object(engine, '_get_client') as mock_client:
        mock_response = {
            'message': {
                'content': invalid_json
            }
        }
        mock_client.return_value.chat = Mock(return_value=mock_response)
        
        with pytest.raises(ValueError, match="LLM returned invalid JSON"):
            engine.extract_graph_structure("Some markdown content")
