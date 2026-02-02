"""
User Progress Tracker for LearnFast Core.

Handles user state management, progress recording, and state queries.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

from src.database.connections import neo4j_conn
from src.models.schemas import UserState, UserNode
from src.database.graph_storage import graph_storage
from src.navigation.navigation_engine import NavigationEngine

logger = logging.getLogger(__name__)


class UserProgressTracker:
    """
    Manages user progress tracking and state retrieval.
    """
    
    def __init__(self):
        """Initialize the user progress tracker."""
        self.connection = neo4j_conn
        self.navigation = NavigationEngine()
        
    def ensure_user_exists(self, user_id: str, name: str = "Learner") -> bool:
        """
        Ensure a user node exists in the database.
        
        Args:
            user_id: Unique user identifier
            name: Display name (default "Learner")
            
        Returns:
            True if user exists or was created successfully
        """
        try:
            user = UserNode(uid=user_id, name=name)
            return graph_storage.store_user(user)
        except Exception as e:
            logger.error(f"Error ensuring user existence: {str(e)}")
            return False

    def mark_in_progress(self, user_id: str, concept: str) -> bool:
        """
        Mark a concept as IN_PROGRESS for a user.
        
        Args:
            user_id: Unique user identifier
            concept: Concept name to start
            
        Returns:
            True if operation succeeded
        """
        if not user_id or not concept:
            return False
            
        try:
            # First ensure user exists (lazy creation with default name if needed)
            if not self.ensure_user_exists(user_id):
                return False
                
            normalized_concept = concept.strip().lower()
            
            # Verify concept exists
            if not graph_storage.concept_exists(normalized_concept):
                logger.warning(f"Cannot mark unknown concept in progress: {concept}")
                return False
            
            # Check prerequisites check before allowing start?
            # Relaxed for Path Generator: Allow starting even if prerequisites aren't met
            # because the generated lesson is expected to cover them.
            if not self.navigation.validate_prerequisites(user_id, normalized_concept):
                logger.warning(f"Prerequisites not met for user {user_id} starting {concept} - proceeding anyway (path mode)")
                # Return True anyway to allow progress
                
            query = """
                MATCH (u:User {uid: $user_id})
                MATCH (c:Concept {name: $concept_name})
                MERGE (u)-[r:IN_PROGRESS]->(c)
                ON CREATE SET r.started_at = datetime()
                RETURN r.started_at
            """
            
            self.connection.execute_write_query(query, {
                "user_id": user_id,
                "concept_name": normalized_concept
            })
            
            logger.info(f"User {user_id} started concept {normalized_concept}")
            return True
            
        except Exception as e:
            logger.error(f"Error marking in-progress for user '{user_id}', concept '{concept}': {str(e)}")
            return False
            
    def mark_completed(self, user_id: str, concept: str) -> bool:
        """
        Mark a concept as COMPLETED for a user.
        
        Removes any IN_PROGRESS status for the same concept.
        
        Args:
            user_id: Unique user identifier
            concept: Concept name to complete
            
        Returns:
            True if operation succeeded
        """
        if not user_id or not concept:
            return False
            
        try:
            if not self.ensure_user_exists(user_id):
                return False
                
            normalized_concept = concept.strip().lower()
            
            if not graph_storage.concept_exists(normalized_concept):
                logger.warning(f"Cannot mark unknown concept completed: {concept}")
                return False
                
            # Create COMPLETED relationship and delete IN_PROGRESS if exists
            query = """
                MATCH (u:User {uid: $user_id})
                MATCH (c:Concept {name: $concept_name})
                MERGE (u)-[r:COMPLETED]->(c)
                ON CREATE SET r.finished_at = datetime()
                ON MATCH SET r.finished_at = datetime()
                WITH u, c
                MATCH (u)-[ip:IN_PROGRESS]->(c)
                DELETE ip
                RETURN u.uid
            """
            
            self.connection.execute_write_query(query, {
                "user_id": user_id,
                "concept_name": normalized_concept
            })
            
            logger.info(f"User {user_id} completed concept {normalized_concept}")
            return True
            
        except Exception as e:
            logger.error(f"Error marking completed for user '{user_id}', concept '{concept}': {str(e)}")
            return False
            
    def get_user_state(self, user_id: str) -> Optional[UserState]:
        """
        Get the full state of a user (completed, in-progress, and available concepts).
        
        Args:
            user_id: Unique user identifier
            
        Returns:
            UserState object or None if user not found/error
        """
        try:
            # Get completed concepts
            completed_query = """
                MATCH (:User {uid: $user_id})-[:COMPLETED]->(c:Concept)
                RETURN c.name as name
            """
            completed_result = self.connection.execute_query(completed_query, {"user_id": user_id})
            completed_concepts = [r["name"] for r in completed_result]
            
            # Get in-progress concepts
            in_progress_query = """
                MATCH (:User {uid: $user_id})-[:IN_PROGRESS]->(c:Concept)
                RETURN c.name as name
            """
            in_progress_result = self.connection.execute_query(in_progress_query, {"user_id": user_id})
            in_progress_concepts = [r["name"] for r in in_progress_result]
            
            # Get available (unlocked) concepts
            # Using NavigationEngine logic
            available_concepts = self.navigation.get_unlocked_concepts(user_id)
            
            return UserState(
                user_id=user_id,
                completed_concepts=completed_concepts,
                in_progress_concepts=in_progress_concepts,
                available_concepts=available_concepts
            )
            
        except Exception as e:
            logger.error(f"Error retrieving user state for '{user_id}': {str(e)}")
            return None
