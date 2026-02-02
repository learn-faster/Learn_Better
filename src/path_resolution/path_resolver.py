"""
Path Resolution Engine for LearnFast Core.

Handles generation of optimized learning paths, time estimation, and constraint satisfaction.
"""

import logging
from typing import List, Optional, Tuple
from src.database.connections import neo4j_conn, postgres_conn
from src.models.schemas import LearningPath
from src.navigation.navigation_engine import NavigationEngine

logger = logging.getLogger(__name__)

# Constants
MINUTES_PER_CHUNK = 2


class PathResolver:
    """
    Resolves optimized learning paths based on user state and constraints.
    """
    
    def __init__(self):
        """Initialize the path resolver."""
        self.connection = neo4j_conn
        self.pg_connection = postgres_conn
        self.navigation = NavigationEngine()
        
    def estimate_learning_time(self, concepts: List[str]) -> int:
        """
        Estimate learning time for a list of concepts.
        
        Formula: sum(chunks_per_concept) * MINUTES_PER_CHUNK
        
        Args:
            concepts: List of concept names
            
        Returns:
            Estimated time in minutes
        """
        if not concepts:
            return 0
            
        try:
            # We need to count chunks for these concepts from PostgreSQL
            # We can do this in one query
            placeholders = ",".join(["%s"] * len(concepts))
            query = f"""
                SELECT count(*) as chunk_count 
                FROM learning_chunks 
                WHERE lower(concept_tag) IN ({placeholders})
            """
            
            # Normalize names for query
            normalized_concepts = [c.lower() for c in concepts]
            
            result = self.pg_connection.execute_query(query, tuple(normalized_concepts))
            
            if result and result[0]:
                chunk_count = result[0]['chunk_count']
                return max(1, chunk_count) * MINUTES_PER_CHUNK
            
            # If no chunks found, return a baseline instead of 0
            return MINUTES_PER_CHUNK
            
        except Exception as e:
            logger.error(f"Error estimating time for concepts: {str(e)}")
            # Fallback: return 0 or default? Let's return 0 and log error
            return 0

    def resolve_path(self, user_id: str, target_concept: str, time_budget_minutes: int) -> Optional[LearningPath]:
        """
        Find an optimized learning path from user's current state to the target concept,
        respecting the time budget.
        
        Args:
            user_id: Unique user identifier
            target_concept: Target concept name
            time_budget_minutes: Maximum time allowed in minutes
            
        Returns:
            LearningPath object or None if no path found
        """
        if not user_id or not target_concept:
            return None
            
        try:
            normalized_target = target_concept.strip().lower()
            
            # 1. Find start nodes (concepts user has completed that connect to target)
            # OR find if user has no progress, start from roots.
            # Actually, standard pathfinding:
            # Source: User's completed concepts ("frontier") or Roots if none
            # Target: target_concept
            # We want the shortest weighted path.
            
            # Simplified approach:
            # Find the path from ANY of user's completed concepts (or roots) to target.
            # We can use Neo4j's shortestPath.
            # But wait, we need to learn UNKNOWN stuff.
            # So the path should consist of INCOMPLETE concepts.
            # Start node should be a completed concept (frontier) or a Root (if path starts there).
            
            # Let's query for the FULL path from roots to target first.
            # Then filter out what's already completed.
            
            # But wait, there might be multiple paths. We want the "best" one.
            # Dijkstra on weighted prerequisites (weights represent dependency strength/cost?).
            # Spec says: "resolve_path ... find lowest cost path" (implied).
            # Actually spec says "shortest path".
            
            # Check if target is a root (has no prerequisites) first
            # This prevents shortestPath from failing when start==end node
            check_root_query = """
                MATCH (c:Concept {name: $name})<-[:PREREQUISITE]-() 
                RETURN count(*) as cnt
            """
            check_root_res = self.connection.execute_query(check_root_query, {"name": normalized_target})
            is_root = check_root_res and check_root_res[0]["cnt"] == 0
            
            if is_root:
                # If target is a root, the path from a root to it is just itself
                full_path_names = [normalized_target]
            else:
                # Find shortest path from ANY root to the target
                path_query = """
                    MATCH (target:Concept {name: $target_name})
                    MATCH path = shortestPath((root:Concept)-[:PREREQUISITE*]->(target))
                    WHERE NOT ()-[:PREREQUISITE]->(root)  // Ensure starts at a root
                    RETURN [n IN nodes(path) | n.name] as concepts
                    ORDER BY length(path) ASC
                    LIMIT 1
                """
                
                result = self.connection.execute_query(path_query, {"target_name": normalized_target})
                
                if not result:
                    logger.warning(f"No path found to {target_concept}")
                    return None
                else:
                    full_path_names = result[0]['concepts']
            
            # 2. Filter out completed concepts
            # Get user's completed concepts
            active_path = []
            
            # Check completion status for each
            for concept in full_path_names:
                # We need to check if user completed it.
                # Inefficient to query one by one. get_user_state does it all.
                # Or just query specific check.
                
                check_query = """
                    MATCH (:User {uid: $user_id})-[:COMPLETED]->(:Concept {name: $concept})
                    RETURN count(*) as cnt
                """
                check = self.connection.execute_query(check_query, {
                    "user_id": user_id, 
                    "concept": concept
                })
                
                is_completed = check and check[0]['cnt'] > 0
                
                if not is_completed:
                    active_path.append(concept)
            
            if not active_path:
                # Everything completed?
                logger.info(f"User {user_id} has already completed everything up to {target_concept}")
                return LearningPath(
                    concepts=[], 
                    estimated_time_minutes=0, 
                    target_concept=normalized_target,
                    pruned=False
                )

            # 3. Calculate time for active path
            total_time = self.estimate_learning_time(active_path)
            
            # 4. Prune if exceeds budget
            pruned = False
            final_path = active_path
            
            if total_time > time_budget_minutes:
                final_path, new_time = self.prune_path_by_time(active_path, time_budget_minutes)
                total_time = new_time
                pruned = True
                
                if not final_path:
                    # Budget too small for even the first concept?
                    # Return empty or partial?
                    # Spec: "prune the path and suggest an intermediate concept as the new goal"
                    # If empty, we can't really suggest anything specific other than "nothing fits".
                    pass
                else:
                    # Update target to the last concept in pruned path
                    # Actually LearningPath.target_concept should probably remain original request?
                    # Or reflect the NEW goal?
                    # Spec Requirement 3.3: "prune ... and suggest an intermediate concept as the new goal"
                    # So we should update target_concept in the response or add a field.
                    # The LearningPath model has `target_concept`. Let's update it to the distinct sub-goal.
                    normalized_target = final_path[-1]

            return LearningPath(
                concepts=final_path,
                estimated_time_minutes=total_time,
                target_concept=normalized_target,
                pruned=pruned
            )
            
        except Exception as e:
            logger.error(f"Error resolving path for {target_concept}: {str(e)}")
            return None

    def prune_path_by_time(self, path: List[str], time_limit: int) -> Tuple[List[str], int]:
        """
        Truncate path to fit within time limit.
        
        Args:
            path: Ordered list of concept names
            time_limit: Max minutes
            
        Returns:
            Tuple of (pruned_path, new_estimated_time)
        """
        if not path:
            return [], 0
            
        current_path = []
        current_time = 0
        
        for concept in path:
            concept_time = self.estimate_learning_time([concept])
            
            if current_time + concept_time <= time_limit:
                current_path.append(concept)
                current_time += concept_time
            else:
                # Cannot fit this concept
                break
                
        return current_path, current_time
