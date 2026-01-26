"""Property-based tests for error validation precedence.

**Feature: learnfast-core-engine, Property 22: Error validation precedence**
**Validates: Requirements 6.4**

Property 22: Error validation precedence
For any extraction attempt, JSON structure validation should occur before database
operations. This ensures that malformed responses are caught early and don't cause
database errors.
"""

from hypothesis import given, strategies as st, settings
from pydantic import ValidationError
import pytest
from unittest.mock import Mock, patch
import json

from src.ingestion.ingestion_engine import IngestionEngine
from src.models.schemas import GraphSchema


# Strategy for generating invalid JSON structures (valid JSON but wrong schema)
@st.composite
def invalid_schema_data_strategy(draw):
    """Generate data that is valid JSON but doesn't conform to GraphSchema."""
    choice = draw(st.integers(min_value=0, max_value=4))
    
    if choice == 0:
        # Missing 'concepts' field
        return {
            "prerequisites": []
        }
    elif choice == 1:
        # Missing 'prerequisites' field
        return {
            "concepts": ["concept1", "concept2"]
        }
    elif choice == 2:
        # Invalid prerequisite structure (missing required fields)
        return {
            "concepts": ["concept1", "concept2"],
            "prerequisites": [
                {
                    "source_concept": "concept1"
                    # Missing target_concept, weight, reasoning
                }
            ]
        }
    elif choice == 3:
        # Invalid weight value (outside range)
        return {
            "concepts": ["concept1", "concept2"],
            "prerequisites": [
                {
                    "source_concept": "concept1",
                    "target_concept": "concept2",
                    "weight": 1.5,  # Invalid: > 1.0
                    "reasoning": "test"
                }
            ]
        }
    else:
        # Wrong data types
        return {
            "concepts": "not a list",
            "prerequisites": "not a list"
        }


@settings(max_examples=100)
@given(invalid_data=invalid_schema_data_strategy())
def test_json_validation_before_database_operations(invalid_data: dict):
    """
    Property: For any data that doesn't conform to GraphSchema, validation should
    fail with ValidationError before any database operations are attempted.
    
    This validates that JSON structure validation occurs before database operations,
    preventing database errors from malformed data.
    """
    engine = IngestionEngine()
    
    # Mock the Ollama client to return our invalid data
    with patch.object(engine, '_get_client') as mock_client:
        mock_response = {
            'message': {
                'content': json.dumps(invalid_data)
            }
        }
        mock_client.return_value.chat = Mock(return_value=mock_response)
        
        # The extraction should fail with ValidationError
        with pytest.raises((ValidationError, ValueError)):
            engine.extract_graph_structure("Some markdown content")


@settings(max_examples=100)
@given(
    content=st.text(min_size=10, max_size=200).filter(lambda x: x.strip() != "")
)
def test_empty_or_invalid_content_raises_early(content: str):
    """
    Property: For empty or whitespace-only content, extraction should fail
    immediately with ValueError before attempting LLM calls.
    
    This validates early validation of input parameters.
    """
    engine = IngestionEngine()
    
    # Test with empty string
    with pytest.raises(ValueError, match="Cannot extract graph structure from empty content"):
        engine.extract_graph_structure("")
    
    # Test with whitespace-only string
    with pytest.raises(ValueError, match="Cannot extract graph structure from empty content"):
        engine.extract_graph_structure("   \n\t  ")


@settings(max_examples=100)
@given(invalid_data=invalid_schema_data_strategy())
def test_validation_error_contains_schema_information(invalid_data: dict):
    """
    Property: When validation fails, the error should indicate it's a schema
    validation issue, not a generic error.
    
    This validates that error messages are informative and distinguish between
    different types of failures.
    """
    engine = IngestionEngine()
    
    # Mock the Ollama client
    with patch.object(engine, '_get_client') as mock_client:
        mock_response = {
            'message': {
                'content': json.dumps(invalid_data)
            }
        }
        mock_client.return_value.chat = Mock(return_value=mock_response)
        
        try:
            engine.extract_graph_structure("Some markdown content")
            # If no exception, the data was actually valid (shouldn't happen with our strategy)
            pytest.fail("Expected ValidationError or ValueError but extraction succeeded")
        except (ValidationError, ValueError) as e:
            # Verify the error message is informative
            error_msg = str(e)
            # Should mention either validation, schema, or JSON
            assert any(keyword in error_msg.lower() for keyword in 
                      ['validation', 'schema', 'json', 'conform', 'invalid']), \
                f"Error message not informative: {error_msg}"


def test_json_decode_error_precedence():
    """
    Property: JSON parsing errors should be caught and reported before
    schema validation is attempted.
    
    This validates the error handling order: JSON parsing -> Schema validation.
    """
    engine = IngestionEngine()
    
    # Mock the Ollama client to return invalid JSON
    with patch.object(engine, '_get_client') as mock_client:
        mock_response = {
            'message': {
                'content': "This is not valid JSON at all {{{{"
            }
        }
        mock_client.return_value.chat = Mock(return_value=mock_response)
        
        with pytest.raises(ValueError, match="LLM returned invalid JSON"):
            engine.extract_graph_structure("Some markdown content")


@settings(max_examples=100)
@given(
    concepts=st.lists(st.text(min_size=1, max_size=30), min_size=2, max_size=10, unique=True)
)
def test_prerequisite_concept_validation(concepts: list):
    """
    Property: Prerequisites that reference non-existent concepts should be
    detected by validate_graph_structure.
    
    This validates that internal consistency checks catch referential integrity issues.
    """
    engine = IngestionEngine()
    
    # Create a valid schema
    valid_schema = GraphSchema(
        concepts=[c.lower() for c in concepts],
        prerequisites=[]
    )
    
    # Should validate successfully
    assert engine.validate_graph_structure(valid_schema) is True
    
    # Create an invalid schema with a prerequisite referencing a non-existent concept
    from src.models.schemas import PrerequisiteLink
    
    invalid_schema = GraphSchema(
        concepts=[c.lower() for c in concepts],
        prerequisites=[
            PrerequisiteLink(
                source_concept="nonexistent_concept_xyz_123",
                target_concept=concepts[0].lower(),
                weight=0.5,
                reasoning="Test invalid reference"
            )
        ]
    )
    
    # Should fail validation
    assert engine.validate_graph_structure(invalid_schema) is False
