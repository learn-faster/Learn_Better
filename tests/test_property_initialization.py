"""Property-based tests for project initialization and concept uniqueness."""

import pytest
import uuid
from hypothesis import given, strategies as st, settings
from src.database.connections import neo4j_conn
from src.database.init_db import initialize_neo4j_constraints, check_concept_uniqueness_constraint


class TestProjectInitialization:
    """Property-based tests for project initialization."""
    
    @classmethod
    def setup_class(cls):
        """Set up test environment."""
        # Initialize constraints before running tests
        try:
            initialize_neo4j_constraints()
        except Exception as e:
            pytest.skip(f"Could not initialize Neo4j constraints: {e}")
        
        # Generate unique session ID for this test run
        cls.session_id = str(uuid.uuid4())[:8]
    
    def setup_method(self):
        """Clean up before each test."""
        try:
            # Clear any existing test data for this session
            neo4j_conn.execute_write_query(
                f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_' DETACH DELETE n"
            )
        except Exception:
            pass  # Ignore cleanup errors
    
    def teardown_method(self):
        """Clean up after each test."""
        try:
            # Clear test data for this session
            neo4j_conn.execute_write_query(
                f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_' DETACH DELETE n"
            )
        except Exception:
            pass  # Ignore cleanup errors
    
    @given(concept_names=st.lists(
        st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=1, max_size=50),
        min_size=2,
        max_size=10
    ))
    @settings(max_examples=100)
    def test_concept_uniqueness_enforcement(self, concept_names):
        """
        **Feature: learnfast-core-engine, Property 19: Concept uniqueness enforcement**
        **Validates: Requirements 5.1**
        
        For any list of concept names, attempting to create concepts with duplicate names
        should result in only one concept per unique name being stored in the graph.
        """
        # Skip if database is not available
        if not check_concept_uniqueness_constraint():
            pytest.skip("Concept uniqueness constraint not available")
        
        # Generate unique test ID for this iteration
        test_id = str(uuid.uuid4())[:8]
        
        # Normalize concept names to lowercase (as per requirements)
        normalized_names = [name.lower() for name in concept_names if name.strip()]
        
        if not normalized_names:
            return  # Skip empty lists
        
        # Add unique test prefix to avoid conflicts
        test_names = [f"test_{self.session_id}_{test_id}_{name}" for name in normalized_names]
        
        try:
            # Create concepts (some may be duplicates)
            for name in test_names:
                try:
                    neo4j_conn.execute_write_query(
                        "MERGE (c:Concept {name: $name}) SET c.description = $desc",
                        {"name": name, "desc": f"Test concept {name}"}
                    )
                except Exception as e:
                    # This is expected for duplicate names due to uniqueness constraint
                    continue
            
            # Query all created concepts for this test iteration
            result = neo4j_conn.execute_query(
                f"MATCH (c:Concept) WHERE c.name STARTS WITH 'test_{self.session_id}_{test_id}_' RETURN c.name as name"
            )
            
            created_names = [record['name'] for record in result]
            unique_expected_names = list(set(test_names))
            
            # Property: The number of concepts created should equal the number of unique names
            assert len(created_names) == len(unique_expected_names), (
                f"Expected {len(unique_expected_names)} unique concepts, "
                f"but found {len(created_names)} in database. "
                f"Created: {created_names}, Expected: {unique_expected_names}"
            )
            
            # Property: All created concepts should have unique names
            assert len(created_names) == len(set(created_names)), (
                "Duplicate concept names found in database, uniqueness constraint failed"
            )
            
            # Property: All unique expected names should be present
            for expected_name in unique_expected_names:
                assert expected_name in created_names, (
                    f"Expected concept '{expected_name}' not found in database"
                )
        
        finally:
            # Clean up this test iteration's data
            try:
                neo4j_conn.execute_write_query(
                    f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_{test_id}_' DETACH DELETE n"
                )
            except Exception:
                pass  # Ignore cleanup errors
    
    def test_constraint_initialization(self):
        """Test that database constraints are properly initialized."""
        # This is a basic unit test to ensure the constraint exists
        assert check_concept_uniqueness_constraint(), (
            "Concept uniqueness constraint should be initialized"
        )