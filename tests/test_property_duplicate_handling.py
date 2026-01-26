"""Property-based tests for duplicate concept handling in graph storage operations."""

import pytest
import uuid
from hypothesis import given, strategies as st, settings
from src.database.graph_storage import graph_storage
from src.models.schemas import ConceptNode, GraphSchema, PrerequisiteLink


class TestDuplicateHandling:
    """Property-based tests for duplicate concept handling."""
    
    @classmethod
    def setup_class(cls):
        """Set up test environment."""
        # Initialize constraints before running tests
        try:
            graph_storage.initialize_constraints()
        except Exception as e:
            pytest.skip(f"Could not initialize Neo4j constraints: {e}")
        
        # Generate unique session ID for this test run
        cls.session_id = str(uuid.uuid4())[:8]
    
    def setup_method(self):
        """Clean up before each test."""
        try:
            # Clear any existing test data for this session
            graph_storage.connection.execute_write_query(
                f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_' DETACH DELETE n"
            )
        except Exception:
            pass  # Ignore cleanup errors
    
    def teardown_method(self):
        """Clean up after each test."""
        try:
            # Clear test data for this session
            graph_storage.connection.execute_write_query(
                f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_' DETACH DELETE n"
            )
        except Exception:
            pass  # Ignore cleanup errors
    
    @given(concept_names=st.lists(
        st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Pc')), min_size=1, max_size=30),
        min_size=1,
        max_size=20
    ))
    @settings(max_examples=100, deadline=None)
    def test_concept_uniqueness_enforcement(self, concept_names):
        """
        **Feature: learnfast-core-engine, Property 19: Concept uniqueness enforcement**
        **Validates: Requirements 5.1, 6.5**
        
        For any list of concept names (including duplicates), storing them using MERGE operations
        should result in only one concept per unique normalized name being stored in the graph,
        with graceful handling of duplicates.
        """
        # Skip if database is not available
        if not graph_storage.verify_constraints():
            pytest.skip("Graph storage constraints not available")
        
        # Generate unique test ID for this iteration
        test_id = str(uuid.uuid4())[:8]
        
        # Filter out empty names and normalize
        valid_names = [name.strip() for name in concept_names if name.strip()]
        if not valid_names:
            return  # Skip empty lists
        
        # Add unique test prefix to avoid conflicts with other tests
        test_names = [f"test_{self.session_id}_{test_id}_{name}" for name in valid_names]
        
        # Create ConceptNode objects (some may have duplicate names)
        concept_nodes = [ConceptNode(name=name, description=f"Test concept {name}") for name in test_names]
        
        try:
            # Store concepts using the graph storage module (handles duplicates with MERGE)
            stored_count = graph_storage.store_concepts_batch(concept_nodes)
            
            # Query all created concepts for this test iteration
            result = graph_storage.connection.execute_query(
                f"MATCH (c:Concept) WHERE c.name STARTS WITH 'test_{self.session_id}_{test_id}_' RETURN c.name as name"
            )
            
            created_names = [record['name'] for record in result]
            
            # Normalize expected names to lowercase (as per Requirements 6.3)
            normalized_test_names = [name.lower() for name in test_names]
            unique_expected_names = list(set(normalized_test_names))
            
            # Property 1: The number of concepts created should equal the number of unique normalized names
            assert len(created_names) == len(unique_expected_names), (
                f"Expected {len(unique_expected_names)} unique concepts, "
                f"but found {len(created_names)} in database. "
                f"Created: {created_names}, Expected unique: {unique_expected_names}"
            )
            
            # Property 2: All created concepts should have unique names (no duplicates in database)
            assert len(created_names) == len(set(created_names)), (
                "Duplicate concept names found in database, uniqueness constraint failed"
            )
            
            # Property 3: All unique expected names should be present in the database
            created_names_set = set(created_names)
            for expected_name in unique_expected_names:
                assert expected_name in created_names_set, (
                    f"Expected concept '{expected_name}' not found in database"
                )
            
            # Property 4: The stored count should be equal to the number of concepts attempted
            # (MERGE operations always succeed, even for duplicates)
            assert stored_count == len(concept_nodes), (
                f"Stored count {stored_count} should match attempted concepts count {len(concept_nodes)}"
            )
            
            # Property 5: All stored concepts should exist in the database
            for expected_name in unique_expected_names:
                assert graph_storage.concept_exists(expected_name), (
                    f"Concept '{expected_name}' should exist according to concept_exists method"
                )
        
        finally:
            # Clean up this test iteration's data
            try:
                graph_storage.connection.execute_write_query(
                    f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_{test_id}_' DETACH DELETE n"
                )
            except Exception:
                pass  # Ignore cleanup errors
    
    @given(
        concepts=st.lists(
            st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=1, max_size=20),
            min_size=2,
            max_size=10
        ),
        weights=st.lists(st.floats(min_value=0.0, max_value=1.0), min_size=1, max_size=5)
    )
    @settings(max_examples=50, deadline=None)
    def test_duplicate_relationship_handling(self, concepts, weights):
        """
        Test that duplicate prerequisite relationships are handled gracefully with MERGE operations.
        
        For any set of concepts and relationships, storing duplicate relationships should
        result in only one relationship per concept pair, with the latest metadata.
        """
        # Skip if database is not available
        if not graph_storage.verify_constraints():
            pytest.skip("Graph storage constraints not available")
        
        # Generate unique test ID for this iteration
        test_id = str(uuid.uuid4())[:8]
        
        # Filter and prepare concepts
        valid_concepts = [name.strip() for name in concepts if name.strip()]
        if len(valid_concepts) < 2:
            return  # Need at least 2 concepts for relationships
        
        # Add unique test prefix
        test_concepts = [f"test_{self.session_id}_{test_id}_{name}" for name in valid_concepts[:5]]  # Limit to 5
        
        try:
            # First, create the concepts
            concept_nodes = [ConceptNode(name=name) for name in test_concepts]
            graph_storage.store_concepts_batch(concept_nodes)
            
            # Create some prerequisite relationships (including potential duplicates)
            relationships = []
            for i in range(min(len(test_concepts) - 1, 3)):  # Limit relationships
                source = test_concepts[i]
                target = test_concepts[i + 1]
                weight = weights[i % len(weights)]
                
                # Create the same relationship multiple times with different weights/reasoning
                for j in range(2):  # Create duplicate relationships
                    relationships.append(PrerequisiteLink(
                        source_concept=source,
                        target_concept=target,
                        weight=weight,
                        reasoning=f"Test reasoning {j} for {source} -> {target}"
                    ))
            
            if not relationships:
                return  # Skip if no relationships to test
            
            # Store all relationships (including duplicates)
            stored_count = 0
            for relationship in relationships:
                try:
                    if graph_storage.store_prerequisite_relationship(relationship):
                        stored_count += 1
                except Exception:
                    continue  # Some may fail due to duplicates, which is expected
            
            # Query the actual relationships in the database
            result = graph_storage.connection.execute_query(f"""
                MATCH (source:Concept)-[r:PREREQUISITE]->(target:Concept)
                WHERE source.name STARTS WITH 'test_{self.session_id}_{test_id}_'
                RETURN source.name as source, target.name as target, r.weight as weight
            """)
            
            # Property: Each unique concept pair should have exactly one relationship
            relationship_pairs = set()
            for record in result:
                pair = (record['source'], record['target'])
                assert pair not in relationship_pairs, (
                    f"Duplicate relationship found for pair {pair}, MERGE operation failed"
                )
                relationship_pairs.add(pair)
            
            # Property: The number of stored relationships should match unique pairs
            unique_pairs = set()
            for rel in relationships:
                source_norm = rel.source_concept.lower()
                target_norm = rel.target_concept.lower()
                unique_pairs.add((source_norm, target_norm))
            
            assert len(result) == len(unique_pairs), (
                f"Expected {len(unique_pairs)} unique relationships, found {len(result)}"
            )
        
        finally:
            # Clean up this test iteration's data
            try:
                graph_storage.connection.execute_write_query(
                    f"MATCH (n:Concept) WHERE n.name STARTS WITH 'test_{self.session_id}_{test_id}_' DETACH DELETE n"
                )
            except Exception:
                pass  # Ignore cleanup errors
    
    def test_graph_storage_constraint_verification(self):
        """Test that graph storage constraint verification works correctly."""
        # This is a basic unit test to ensure the constraint verification works
        assert graph_storage.verify_constraints(), (
            "Graph storage constraints should be properly verified"
        )
    
    def test_graph_storage_initialization(self):
        """Test that graph storage initialization works correctly."""
        # Test that initialization can be called multiple times without error
        assert graph_storage.initialize_constraints(), (
            "Graph storage constraint initialization should succeed"
        )
        
        # Verify constraints are working after initialization
        assert graph_storage.verify_constraints(), (
            "Constraints should be verified after initialization"
        )