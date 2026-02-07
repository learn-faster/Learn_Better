"""Knowledge graph storage operations for Neo4j database."""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from src.models.schemas import GraphSchema, PrerequisiteLink, ConceptNode, UserNode, UserState
from .connections import neo4j_conn

logger = logging.getLogger(__name__)


class GraphStorage:
    """
    Handles all Neo4j knowledge graph storage operations.
    
    Provides methods for storing concepts, relationships, and user progress
    with proper constraint enforcement and duplicate handling using MERGE operations.
    """
    
    def __init__(self):
        """Initialize the graph storage manager."""
        self.connection = neo4j_conn
    
    def initialize_constraints(self) -> bool:
        """
        Initialize Neo4j constraints and indexes for the knowledge graph.
        
        Creates unique constraints for concept names and user IDs to enforce
        data integrity as specified in Requirements 5.1.
        
        Returns:
            True if constraints were successfully created or already exist
            
        Raises:
            Exception: If constraint creation fails
        """
        try:
            # Create unique constraint for concept names (Requirements 5.1)
            self.connection.execute_write_query(
                "CREATE CONSTRAINT concept_name_unique IF NOT EXISTS "
                "FOR (c:Concept) REQUIRE c.name IS UNIQUE"
            )
            
            # Create unique constraint for user IDs
            self.connection.execute_write_query(
                "CREATE CONSTRAINT user_uid_unique IF NOT EXISTS "
                "FOR (u:User) REQUIRE u.uid IS UNIQUE"
            )
            
            # Create index for faster prerequisite relationship queries
            self.connection.execute_write_query(
                "CREATE INDEX prerequisite_weight_index IF NOT EXISTS "
                "FOR ()-[r:PREREQUISITE]-() ON (r.weight)"
            )
            
            # Create index for user progress queries
            self.connection.execute_write_query(
                "CREATE INDEX completed_timestamp_index IF NOT EXISTS "
                "FOR ()-[r:COMPLETED]-() ON (r.finished_at)"
            )
            
            # Schema Nudge: Mention properties/labels that cause warnings if not present (Neo4j 5.x)
            # This "teaches" the metadata about these elements even when the DB is empty.
            # We create dummy nodes/rels and then immediately delete ALL of them (including the User).
            self.connection.execute_write_query(
                """
                MERGE (n:__SchemaNudge__ {id: 'nudge'})
                ON CREATE SET n.description = ''
                MERGE (u:User {uid: '__nudge__'})
                MERGE (u)-[:IN_PROGRESS]->(n)
                MERGE (u)-[:COMPLETED]->(n)
                DETACH DELETE n, u
                """
            )
            
            logger.info("Neo4j constraints and indexes initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Neo4j constraints: {str(e)}")
            raise Exception(f"Constraint initialization failed: {str(e)}") from e
    
    def verify_constraints(self) -> bool:
        """
        Verify that required constraints are properly enforced.
        
        Tests constraint enforcement by attempting to create duplicate concepts
        and verifying that the operation fails as expected.
        
        Returns:
            True if constraints are working properly
        """
        test_concept_name = "test_constraint_verification"
        
        try:
            # Clean up any existing test data
            self.connection.execute_write_query(
                "MATCH (c:Concept {name: $name}) DELETE c",
                {"name": test_concept_name}
            )
            
            # Create first concept
            self.connection.execute_write_query(
                "CREATE (c:Concept {name: $name})",
                {"name": test_concept_name}
            )
            
            # Try to create duplicate - this should fail if constraint exists
            try:
                self.connection.execute_write_query(
                    "CREATE (c:Concept {name: $name})",
                    {"name": test_concept_name}
                )
                # If we get here, constraint doesn't exist
                logger.warning("Concept uniqueness constraint not enforced")
                return False
                
            except Exception as constraint_error:
                # Expected - constraint prevented duplicate
                if "already exists" in str(constraint_error).lower() or "constraint" in str(constraint_error).lower():
                    logger.info("Concept uniqueness constraint is properly enforced")
                    return True
                else:
                    logger.error(f"Unexpected error testing constraint: {constraint_error}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error verifying constraints: {str(e)}")
            return False
            
        finally:
            # Clean up test data
            try:
                self.connection.execute_write_query(
                    "MATCH (c:Concept {name: $name}) DELETE c",
                    {"name": test_concept_name}
                )
            except Exception:
                pass  # Ignore cleanup errors
    
    def store_concept(self, concept: ConceptNode, document_id: Optional[int] = None) -> bool:
        """
        Store a single concept using MERGE to handle duplicates gracefully.
        
        Uses MERGE operation as specified in Requirements 6.5 to handle
        duplicate concepts without errors. Stores document provenance.
        
        Args:
            concept: ConceptNode to store
            document_id: Optional ID of the document this concept was extracted from
            
        Returns:
            True if concept was stored successfully
            
        Raises:
            ValueError: If concept data is invalid
        """
        if not concept.name or not concept.name.strip():
            raise ValueError("Concept name cannot be empty")
        
        try:
            # Normalize concept name to lowercase (Requirements 6.3)
            normalized_name = concept.name.strip().lower()
            
            # Use MERGE to handle duplicates gracefully (Requirements 6.5)
            # Track document provenance in source_docs list
            query = """
                MERGE (c:Concept {name: $name})
                ON CREATE SET 
                    c.description = $description,
                    c.depth_level = $depth_level,
                    c.created_at = datetime(),
                    c.source_docs = CASE WHEN $doc_id IS NOT NULL THEN [$doc_id] ELSE [] END
                ON MATCH SET
                    c.description = COALESCE($description, c.description),
                    c.depth_level = COALESCE($depth_level, c.depth_level),
                    c.updated_at = datetime(),
                    c.source_docs = CASE 
                        WHEN $doc_id IS NOT NULL AND NOT $doc_id IN c.source_docs 
                        THEN c.source_docs + $doc_id 
                        ELSE c.source_docs 
                    END
                RETURN c.name as name
            """
            
            result = self.connection.execute_query(query, {
                "name": normalized_name,
                "description": concept.description,
                "depth_level": concept.depth_level,
                "doc_id": document_id
            })
            
            if result:
                logger.debug(f"Stored concept: {normalized_name}")
                return True
            else:
                logger.error(f"Failed to store concept: {normalized_name}")
                return False
                
        except Exception as e:
            logger.error(f"Error storing concept '{concept.name}': {str(e)}")
            raise ValueError(f"Failed to store concept: {str(e)}") from e
    
    def store_concepts_batch(self, concepts: List[ConceptNode], document_id: Optional[int] = None) -> int:
        """
        Store multiple concepts in a batch operation.
        
        Args:
            concepts: List of ConceptNode objects to store
            document_id: Optional ID of the document these concepts were extracted from
            
        Returns:
            Number of concepts successfully stored
        """
        if not concepts:
            return 0
        
        stored_count = 0
        for concept in concepts:
            try:
                if self.store_concept(concept, document_id):
                    stored_count += 1
            except Exception as e:
                logger.warning(f"Failed to store concept in batch: {str(e)}")
                continue
        
        logger.info(f"Stored {stored_count}/{len(concepts)} concepts in batch")
        return stored_count
    
    def store_prerequisite_relationship(self, prerequisite: PrerequisiteLink, document_id: Optional[int] = None) -> bool:
        """
        Store a prerequisite relationship with weight and reasoning metadata.
        
        Uses MERGE operations to handle duplicate relationships gracefully
        and stores weight, reasoning, and document provenance as specified 
        in Requirements 5.2.
        
        Args:
            prerequisite: PrerequisiteLink with source, target, weight, and reasoning
            document_id: Optional ID of the document this relationship was extracted from
            
        Returns:
            True if relationship was stored successfully
            
        Raises:
            ValueError: If prerequisite data is invalid or concepts don't exist
        """
        if not prerequisite.source_concept or not prerequisite.target_concept:
            raise ValueError("Source and target concepts cannot be empty")
        
        if prerequisite.weight < 0.0 or prerequisite.weight > 1.0:
            raise ValueError("Prerequisite weight must be between 0.0 and 1.0")
        
        try:
            # Normalize concept names to lowercase
            source_name = prerequisite.source_concept.strip().lower()
            target_name = prerequisite.target_concept.strip().lower()
            
            # Verify both concepts exist before creating relationship
            verification_query = """
                MATCH (source:Concept {name: $source_name})
                MATCH (target:Concept {name: $target_name})
                RETURN source.name, target.name
            """
            
            verification_result = self.connection.execute_query(verification_query, {
                "source_name": source_name,
                "target_name": target_name
            })
            
            if not verification_result:
                raise ValueError(f"One or both concepts not found: {source_name}, {target_name}")
            
            # Store prerequisite relationship with metadata (Requirements 5.2)
            # Track document provenance in source_docs list
            relationship_query = """
                MATCH (source:Concept {name: $source_name})
                MATCH (target:Concept {name: $target_name})
                MERGE (source)-[r:PREREQUISITE]->(target)
                ON CREATE SET 
                    r.weight = $weight,
                    r.reasoning = $reasoning,
                    r.created_at = datetime(),
                    r.source_docs = CASE WHEN $doc_id IS NOT NULL THEN [$doc_id] ELSE [] END
                ON MATCH SET
                    r.weight = $weight,
                    r.reasoning = $reasoning,
                    r.updated_at = datetime(),
                    r.source_docs = CASE 
                        WHEN $doc_id IS NOT NULL AND NOT $doc_id IN r.source_docs 
                        THEN r.source_docs + $doc_id 
                        ELSE r.source_docs 
                    END
                RETURN r.weight as weight
            """
            
            result = self.connection.execute_query(relationship_query, {
                "source_name": source_name,
                "target_name": target_name,
                "weight": prerequisite.weight,
                "reasoning": prerequisite.reasoning,
                "doc_id": document_id
            })
            
            if result:
                logger.debug(f"Stored prerequisite: {source_name} -> {target_name} (weight: {prerequisite.weight})")
                return True
            else:
                logger.error(f"Failed to store prerequisite: {source_name} -> {target_name}")
                return False
                
        except Exception as e:
            logger.error(f"Error storing prerequisite relationship: {str(e)}")
            raise ValueError(f"Failed to store prerequisite relationship: {str(e)}") from e
    
    def store_graph_schema(self, schema: GraphSchema, document_id: Optional[int] = None) -> Dict[str, int]:
        """
        Store complete graph schema with concepts and prerequisite relationships.
        
        Handles the complete storage process using MERGE operations for
        duplicate handling as specified in Requirements 6.5.
        
        Args:
            schema: GraphSchema with concepts and prerequisites
            document_id: Optional ID of the document this schema was extracted from
            
        Returns:
            Dictionary with counts of stored concepts and relationships
            
        Raises:
            ValueError: If schema is invalid
        """
        if not schema.concepts:
            logger.warning("Schema contains no concepts - skipping graph storage")
            return {"concepts_stored": 0, "relationships_stored": 0}
        
        try:
            # Store concepts first
            concept_nodes = [ConceptNode(name=name) for name in schema.concepts]
            concepts_stored = self.store_concepts_batch(concept_nodes, document_id)
            
            # Store prerequisite relationships
            relationships_stored = 0
            for prerequisite in schema.prerequisites:
                try:
                    if self.store_prerequisite_relationship(prerequisite, document_id):
                        relationships_stored += 1
                except Exception as e:
                    logger.warning(f"Failed to store prerequisite in schema: {str(e)}")
                    continue
            
            result = {
                "concepts_stored": concepts_stored,
                "relationships_stored": relationships_stored
            }
            
            logger.info(f"Stored graph schema: {concepts_stored} concepts, {relationships_stored} relationships")
            return result
            
        except Exception as e:
            logger.error(f"Error storing graph schema: {str(e)}")
            raise ValueError(f"Failed to store graph schema: {str(e)}") from e
    
    def store_user(self, user: UserNode) -> bool:
        """
        Store a user node using MERGE to handle duplicates.
        
        Args:
            user: UserNode to store
            
        Returns:
            True if user was stored successfully
        """
        if not user.uid or not user.uid.strip():
            raise ValueError("User ID cannot be empty")
        
        try:
            query = """
                MERGE (u:User {uid: $uid})
                ON CREATE SET 
                    u.name = $name,
                    u.created_at = datetime()
                ON MATCH SET
                    u.name = COALESCE($name, u.name),
                    u.updated_at = datetime()
                RETURN u.uid as uid
            """
            
            result = self.connection.execute_query(query, {
                "uid": user.uid.strip(),
                "name": user.name
            })
            
            if result:
                logger.debug(f"Stored user: {user.uid}")
                return True
            else:
                logger.error(f"Failed to store user: {user.uid}")
                return False
                
        except Exception as e:
            logger.error(f"Error storing user '{user.uid}': {str(e)}")
            raise ValueError(f"Failed to store user: {str(e)}") from e
    
    def get_concept_count(self) -> int:
        """
        Get the total number of concepts in the knowledge graph.
        
        Returns:
            Number of concept nodes
        """
        try:
            result = self.connection.execute_query("MATCH (c:Concept) RETURN count(c) as count")
            return result[0]["count"] if result else 0
        except Exception as e:
            logger.error(f"Error getting concept count: {str(e)}")
            return 0
    
    def get_relationship_count(self) -> int:
        """
        Get the total number of prerequisite relationships.
        
        Returns:
            Number of PREREQUISITE relationships
        """
        try:
            result = self.connection.execute_query("MATCH ()-[r:PREREQUISITE]->() RETURN count(r) as count")
            return result[0]["count"] if result else 0
        except Exception as e:
            logger.error(f"Error getting relationship count: {str(e)}")
            return 0
    
    def concept_exists(self, concept_name: str) -> bool:
        """
        Check if a concept exists in the knowledge graph.
        
        Args:
            concept_name: Name of the concept to check
            
        Returns:
            True if concept exists
        """
        if not concept_name or not concept_name.strip():
            return False
        
        try:
            normalized_name = concept_name.strip().lower()
            result = self.connection.execute_query(
                "MATCH (c:Concept {name: $name}) RETURN c.name",
                {"name": normalized_name}
            )
            return len(result) > 0
        except Exception as e:
            logger.error(f"Error checking concept existence: {str(e)}")
            return False
    
    def remove_document_provenance(self, document_id: int) -> Dict[str, int]:
        """
        Removes a document's ID from all matching concepts and relationships.
        Prunes nodes and relationships that have no remaining source documents.
        
        Args:
            document_id: ID of the document to remove
            
        Returns:
            Dictionary with counts of modified/deleted items
        """
        try:
            # 1. Remove from relationships and delete orphans
            rel_query = """
                MATCH ()-[r:PREREQUISITE]->()
                WHERE $doc_id IN COALESCE(r.source_docs, [])
                SET r.source_docs = [d IN r.source_docs WHERE d <> $doc_id]
                WITH r
                WHERE size(COALESCE(r.source_docs, [])) = 0
                DELETE r
                RETURN count(*) as deleted_rels
            """
            rel_result = self.connection.execute_query(rel_query, {"doc_id": document_id})
            deleted_rels = rel_result[0]["deleted_rels"] if rel_result else 0
            
            # 2. Remove from nodes and delete orphans
            node_query = """
                MATCH (c:Concept)
                WHERE $doc_id IN COALESCE(c.source_docs, [])
                SET c.source_docs = [d IN c.source_docs WHERE d <> $doc_id]
                WITH c
                WHERE size(COALESCE(c.source_docs, [])) = 0
                DETACH DELETE c
                RETURN count(*) as deleted_nodes
            """
            node_result = self.connection.execute_query(node_query, {"doc_id": document_id})
            deleted_nodes = node_result[0]["deleted_nodes"] if node_result else 0
            
            logger.info(f"Cleanup for doc {document_id}: deleted {deleted_nodes} nodes, {deleted_rels} relationships")
            return {
                "deleted_nodes": deleted_nodes,
                "deleted_relationships": deleted_rels
            }
            
        except Exception as e:
            logger.error(f"Error removing document provenance for {document_id}: {str(e)}")
            raise

    def clear_all_data(self) -> bool:
        """
        Clear all data from the knowledge graph (for testing purposes).
        
        WARNING: This will delete all nodes and relationships.
        
        Returns:
            True if data was cleared successfully
        """
        try:
            self.connection.execute_write_query("MATCH (n) DETACH DELETE n")
            logger.info("Cleared all data from knowledge graph")
            return True
        except Exception as e:
            logger.error(f"Error clearing graph data: {str(e)}")
            return False


# Global graph storage instance
graph_storage = GraphStorage()


# ========== Multi-Document Graph Handling ==========


class MultiDocGraphStorage:
    """
    Handles multi-document knowledge graph storage with document isolation.
    
    Each document gets its own concept namespace (doc{id}_{concept_name}) while
    maintaining a global semantic index for cross-document discovery.
    """
    
    def __init__(self):
        self.connection = neo4j_conn
        self.graph_storage = graph_storage
    
    @staticmethod
    def generate_scoped_id(document_id: int, concept_name: str) -> str:
        """Generate a document-scoped concept ID."""
        normalized = concept_name.strip().lower().replace(" ", "_")
        return f"doc{document_id}_{normalized}"
    
    def store_document_concept(
        self,
        document_id: int,
        concept_name: str,
        description: Optional[str] = None,
        depth_level: Optional[int] = None,
        chunk_ids: Optional[List[int]] = None
    ) -> bool:
        """
        Store a concept scoped to a specific document.
        
        Creates: doc{id}_concept_name node with document relationship.
        """
        scoped_id = self.generate_scoped_id(document_id, concept_name)
        normalized = concept_name.strip().lower()
        
        try:
            query = """
                MERGE (dc:DocumentConcept {id: $scoped_id})
                ON CREATE SET
                    dc.global_name = $global_name,
                    dc.normalized_name = $normalized,
                    dc.description = $description,
                    dc.depth_level = $depth_level,
                    dc.chunk_ids = COALESCE($chunk_ids, []),
                    dc.is_merged = false,
                    dc.created_at = datetime()
                ON MATCH SET
                    dc.description = COALESCE($description, dc.description),
                    dc.depth_level = COALESCE($depth_level, dc.depth_level),
                    dc.chunk_ids = CASE
                        WHEN $chunk_ids IS NOT NULL THEN dc.chunk_ids + $chunk_ids
                        ELSE dc.chunk_ids
                    END,
                    dc.updated_at = datetime()
                
                WITH dc
                MERGE (d:Document {id: $document_id})
                MERGE (d)-[:CONTAINS]->(dc)
                RETURN dc.id as id
            """
            
            result = self.connection.execute_query(query, {
                "scoped_id": scoped_id,
                "global_name": concept_name.strip(),
                "normalized_name": normalized,
                "description": description,
                "depth_level": depth_level,
                "chunk_ids": chunk_ids,
                "document_id": document_id
            })
            
            return bool(result)
            
        except Exception as e:
            logger.error(f"Error storing document concept: {e}")
            return False
    
    def store_document_relationship(
        self,
        document_id: int,
        source_concept: str,
        target_concept: str,
        weight: float,
        reasoning: str
    ) -> bool:
        """
        Store a prerequisite relationship within a document.
        
        Uses scoped IDs to maintain document isolation.
        """
        source_scoped = self.generate_scoped_id(document_id, source_concept)
        target_scoped = self.generate_scoped_id(document_id, target_concept)
        
        try:
            query = """
                MATCH (source:DocumentConcept {id: $source_id})
                MATCH (target:DocumentConcept {id: $target_id})
                MERGE (source)-[r:PREREQUISITE {
                    document_id: $document_id,
                    weight: $weight,
                    reasoning: $reasoning
                }]->(target)
                ON CREATE SET r.created_at = datetime()
                ON MATCH SET r.updated_at = datetime()
                RETURN r.weight as weight
            """
            
            result = self.connection.execute_query(query, {
                "source_id": source_scoped,
                "target_id": target_scoped,
                "document_id": document_id,
                "weight": weight,
                "reasoning": reasoning
            })
            
            return bool(result)
            
        except Exception as e:
            logger.error(f"Error storing document relationship: {e}")
            return False
    
    def get_document_graph(self, document_id: int) -> Optional[Dict[str, Any]]:
        """
        Retrieve complete graph for a specific document.
        
        Returns all concepts and relationships scoped to this document.
        """
        try:
            concepts_query = """
                MATCH (d:Document {id: $doc_id})-[:CONTAINS]->(dc:DocumentConcept)
                RETURN dc.id as scoped_id, dc.global_name as name,
                       dc.normalized_name as normalized, dc.description,
                       dc.depth_level, dc.chunk_ids, dc.is_merged
                ORDER BY dc.global_name
            """
            
            relationships_query = """
                MATCH (dc1:DocumentConcept)-[r:PREREQUISITE]->(dc2:DocumentConcept)
                WHERE r.document_id = $doc_id
                RETURN dc1.id as source, dc2.id as target,
                       r.weight, r.reasoning
                ORDER BY r.weight DESC
            """
            
            concepts = self.connection.execute_query(concepts_query, {"doc_id": document_id})
            relationships = self.connection.execute_query(relationships_query, {"doc_id": document_id})
            
            doc_info_query = """
                MATCH (d:Document {id: $doc_id})
                RETURN d.id as id, properties(d) as props
            """
            doc_info = self.connection.execute_query(doc_info_query, {"doc_id": document_id})
            
            return {
                "document_id": document_id,
                "document_name": doc_info[0]["props"].get("name", f"Document {document_id}") if doc_info else f"Document {document_id}",
                "concepts": [
                    {
                        "scoped_id": c["scoped_id"],
                        "name": c["name"],
                        "normalized": c["normalized"],
                        "description": c["description"],
                        "depth_level": c["depth_level"],
                        "chunk_ids": c["chunk_ids"],
                        "is_merged": c["is_merged"]
                    }
                    for c in concepts
                ],
                "relationships": [
                    {
                        "source": r["source"],
                        "target": r["target"],
                        "weight": r["weight"],
                        "reasoning": r["reasoning"]
                    }
                    for r in relationships
                ],
                "node_count": len(concepts),
                "relationship_count": len(relationships)
            }
            
        except Exception as e:
            logger.error(f"Error getting document graph: {e}")
            return None
    
    def find_cross_document_concepts(self, normalized_name: str) -> List[Dict[str, Any]]:
        """
        Find all occurrences of a concept across different documents.
        
        Useful for discovering when the same concept appears in multiple sources.
        """
        try:
            query = """
                MATCH (dc:DocumentConcept {normalized_name: $normalized_name})
                MATCH (d:Document)-[:CONTAINS]->(dc)
                RETURN d.id as document_id, dc.id as scoped_id,
                       dc.global_name as name, dc.description,
                       dc.chunk_ids, dc.is_merged, dc.merged_with
                ORDER BY d.id
            """
            
            result = self.connection.execute_query(query, {"normalized_name": normalized_name.lower()})
            
            return [
                {
                    "document_id": r["document_id"],
                    "scoped_id": r["scoped_id"],
                    "name": r["name"],
                    "description": r["description"],
                    "chunk_ids": r["chunk_ids"],
                    "is_merged": r["is_merged"],
                    "merged_with": r["merged_with"]
                }
                for r in result
            ]
            
        except Exception as e:
            logger.error(f"Error finding cross-document concepts: {e}")
            return []
    
    def merge_cross_document_concepts(
        self,
        scoped_ids: List[str],
        global_name: str
    ) -> bool:
        """
        Mark multiple document-scoped concepts as the same global concept.
        
        Creates cross-document connections for semantic discovery.
        """
        if len(scoped_ids) < 2:
            return False
        
        try:
            # Create merge mapping
            merge_mapping = {}
            for scoped_id in scoped_ids:
                # Extract document ID from scoped_id
                doc_id = int(scoped_id.split("_")[0].replace("doc", ""))
                merge_mapping[doc_id] = scoped_id
            
            # Update each concept to mark as merged
            for scoped_id in scoped_ids:
                query = """
                    MATCH (dc:DocumentConcept {id: $scoped_id})
                    SET dc.is_merged = true,
                        dc.merged_with = $mapping,
                        dc.updated_at = datetime()
                """
                self.connection.execute_query(query, {
                    "scoped_id": scoped_id,
                    "mapping": merge_mapping
                })
            
            # Create global concept index node
            global_id = f"global_{global_name.strip().lower().replace(' ', '_')}"
            index_query = """
                MERGE (gc:GlobalConcept {id: $global_id})
                ON CREATE SET
                    gc.global_name = $global_name,
                    gc.occurrence_count = 0,
                    gc.created_at = datetime()
                ON MATCH SET
                    gc.occurrence_count = gc.occurrence_count + 1,
                    gc.updated_at = datetime()
                RETURN gc.id as id
            """
            self.connection.execute_query(index_query, {
                "global_id": global_id,
                "global_name": global_name
            })
            
            # Link all document concepts to global index
            for scoped_id in scoped_ids:
                link_query = """
                    MATCH (dc:DocumentConcept {id: $scoped_id})
                    MATCH (gc:GlobalConcept {id: $global_id})
                    MERGE (dc)-[:MERGED_INTO]->(gc)
                """
                self.connection.execute_query(link_query, {
                    "scoped_id": scoped_id,
                    "global_id": global_id
                })
            
            return True
            
        except Exception as e:
            logger.error(f"Error merging cross-document concepts: {e}")
            return False
    
    def search_global_concepts(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search global concepts across all documents.
        
        Returns concepts that appear in multiple documents.
        """
        try:
            search_query = """
                MATCH (gc:GlobalConcept)
                WHERE toLower(gc.global_name) CONTAINS toLower($query)
                MATCH (dc:DocumentConcept)-[:MERGED_INTO]->(gc)
                MATCH (d:Document)-[:CONTAINS]->(dc)
                RETURN gc.id as global_id, gc.global_name as name,
                       gc.occurrence_count,
                       collect(DISTINCT d.id) as document_ids,
                       collect(DISTINCT dc.global_name) as local_names
                ORDER BY gc.occurrence_count DESC
                LIMIT $limit
            """
            
            result = self.connection.execute_query(search_query, {
                "query": query,
                "limit": limit
            })
            
            return [
                {
                    "global_id": r["global_id"],
                    "name": r["name"],
                    "occurrence_count": r["occurrence_count"],
                    "document_ids": r["document_ids"],
                    "local_names": r["local_names"]
                }
                for r in result
            ]
            
        except Exception as e:
            logger.error(f"Error searching global concepts: {e}")
            return []
    
    def get_graph_statistics(self) -> Dict[str, int]:
        """Get overall statistics for the multi-document graph."""
        try:
            doc_count = self.connection.execute_query(
                "MATCH (d:Document) RETURN count(d) as count"
            )[0]["count"]
            
            concept_count = self.connection.execute_query(
                "MATCH (dc:DocumentConcept) RETURN count(dc) as count"
            )[0]["count"]
            
            global_concept_count = self.connection.execute_query(
                "MATCH (gc:GlobalConcept) RETURN count(gc) as count"
            )[0]["count"]
            
            relationship_count = self.connection.execute_query(
                "MATCH ()-[r:PREREQUISITE]->() RETURN count(r) as count"
            )[0]["count"]
            
            merged_count = self.connection.execute_query(
                "MATCH (dc:DocumentConcept {is_merged: true}) RETURN count(dc) as count"
            )[0]["count"]
            
            return {
                "document_count": doc_count,
                "concept_count": concept_count,
                "global_concept_count": global_concept_count,
                "relationship_count": relationship_count,
                "merged_concepts": merged_count
            }
            
        except Exception as e:
            logger.error(f"Error getting graph statistics: {e}")
            return {}


# Global multi-document graph storage instance
multi_doc_graph_storage = MultiDocGraphStorage()