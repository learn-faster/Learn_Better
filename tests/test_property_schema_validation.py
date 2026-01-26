"""Property-based tests for schema validation.

**Feature: learnfast-core-engine, Property 3: JSON schema compliance**
**Validates: Requirements 1.3, 6.1**

Property 3: JSON schema compliance
For any valid GraphSchema data, the Pydantic model should successfully validate 
and serialize/deserialize without data loss or errors.
"""

from hypothesis import given, strategies as st, settings
from pydantic import ValidationError
import pytest

from src.models.schemas import GraphSchema, PrerequisiteLink, UserState, ConceptNode


# Strategy for generating valid concept names (lowercase strings)
concept_names = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Nd"), min_codepoint=97, max_codepoint=122),
    min_size=1,
    max_size=50
).filter(lambda x: x.strip() != "")


# Strategy for generating valid PrerequisiteLink objects
@st.composite
def prerequisite_link_strategy(draw):
    """Generate valid PrerequisiteLink instances."""
    source = draw(concept_names)
    target = draw(concept_names.filter(lambda x: x != source))  # Ensure source != target
    weight = draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
    reasoning = draw(st.text(min_size=1, max_size=200))
    
    return PrerequisiteLink(
        source_concept=source,
        target_concept=target,
        weight=weight,
        reasoning=reasoning
    )


# Strategy for generating valid GraphSchema objects
@st.composite
def graph_schema_strategy(draw):
    """Generate valid GraphSchema instances."""
    concepts = draw(st.lists(concept_names, min_size=1, max_size=20, unique=True))
    
    # Generate prerequisites that only reference concepts in the list
    num_prereqs = draw(st.integers(min_value=0, max_value=min(len(concepts) * 2, 50)))
    prerequisites = []
    
    for _ in range(num_prereqs):
        if len(concepts) < 2:
            break
        source = draw(st.sampled_from(concepts))
        target = draw(st.sampled_from([c for c in concepts if c != source]))
        weight = draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
        reasoning = draw(st.text(min_size=1, max_size=200))
        
        prerequisites.append(PrerequisiteLink(
            source_concept=source,
            target_concept=target,
            weight=weight,
            reasoning=reasoning
        ))
    
    return GraphSchema(concepts=concepts, prerequisites=prerequisites)


@settings(max_examples=100)
@given(schema=graph_schema_strategy())
def test_graph_schema_json_round_trip(schema: GraphSchema):
    """
    Property: For any valid GraphSchema, serializing to JSON and deserializing 
    should produce an equivalent schema.
    
    This validates that Pydantic models enforce strict JSON schema validation
    and maintain data integrity through serialization cycles.
    """
    # Serialize to JSON
    json_data = schema.model_dump()
    
    # Deserialize back to GraphSchema
    reconstructed = GraphSchema(**json_data)
    
    # Verify equivalence
    assert reconstructed.concepts == schema.concepts
    assert len(reconstructed.prerequisites) == len(schema.prerequisites)
    
    for orig, recon in zip(schema.prerequisites, reconstructed.prerequisites):
        assert recon.source_concept == orig.source_concept
        assert recon.target_concept == orig.target_concept
        assert abs(recon.weight - orig.weight) < 1e-9  # Float comparison with tolerance
        assert recon.reasoning == orig.reasoning


@settings(max_examples=100)
@given(link=prerequisite_link_strategy())
def test_prerequisite_link_validation(link: PrerequisiteLink):
    """
    Property: For any valid PrerequisiteLink, the weight must be between 0.0 and 1.0,
    and all required fields must be present.
    
    This validates that Pydantic enforces field constraints correctly.
    """
    # Verify weight constraint
    assert 0.0 <= link.weight <= 1.0
    
    # Verify required fields are present
    assert link.source_concept is not None
    assert link.target_concept is not None
    assert link.reasoning is not None
    
    # Verify source and target are different
    assert link.source_concept != link.target_concept


@settings(max_examples=100)
@given(
    source=concept_names,
    target=concept_names,
    weight=st.floats(min_value=-10.0, max_value=10.0, allow_nan=False, allow_infinity=False),
    reasoning=st.text(min_size=1, max_size=200)
)
def test_prerequisite_link_weight_validation(source: str, target: str, weight: float, reasoning: str):
    """
    Property: PrerequisiteLink should reject weights outside the [0.0, 1.0] range.
    
    This validates that Pydantic enforces the weight constraint.
    """
    if source == target:
        # Skip if source equals target (not testing that constraint here)
        return
    
    if 0.0 <= weight <= 1.0:
        # Should succeed
        link = PrerequisiteLink(
            source_concept=source,
            target_concept=target,
            weight=weight,
            reasoning=reasoning
        )
        assert link.weight == weight
    else:
        # Should fail validation
        with pytest.raises(ValidationError):
            PrerequisiteLink(
                source_concept=source,
                target_concept=target,
                weight=weight,
                reasoning=reasoning
            )


@settings(max_examples=100)
@given(
    user_id=st.text(min_size=1, max_size=50),
    completed=st.lists(concept_names, max_size=20, unique=True),
    in_progress=st.lists(concept_names, max_size=10, unique=True),
    available=st.lists(concept_names, max_size=20, unique=True)
)
def test_user_state_json_round_trip(user_id: str, completed: list, in_progress: list, available: list):
    """
    Property: For any valid UserState, serializing to JSON and deserializing 
    should produce an equivalent state.
    
    This validates UserState schema compliance.
    """
    state = UserState(
        user_id=user_id,
        completed_concepts=completed,
        in_progress_concepts=in_progress,
        available_concepts=available
    )
    
    # Serialize to JSON
    json_data = state.model_dump()
    
    # Deserialize back
    reconstructed = UserState(**json_data)
    
    # Verify equivalence
    assert reconstructed.user_id == state.user_id
    assert reconstructed.completed_concepts == state.completed_concepts
    assert reconstructed.in_progress_concepts == state.in_progress_concepts
    assert reconstructed.available_concepts == state.available_concepts
