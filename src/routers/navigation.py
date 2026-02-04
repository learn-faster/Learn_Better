from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from src.navigation.navigation_engine import NavigationEngine
from src.navigation.user_tracker import UserProgressTracker
from src.path_resolution.path_resolver import PathResolver
from src.path_resolution.content_retriever import ContentRetriever
from src.models.schemas import ProgressUpdate, UserState, ConceptNode
from src.dependencies import get_navigation_engine, get_user_tracker, get_path_resolver, get_content_retriever

router = APIRouter(prefix="/api", tags=["navigation"])

# --- Navigation Endpoints ---

@router.get("/concepts/roots", summary="Get root concepts", response_model=List[str])
async def get_root_concepts(
    navigation_engine: NavigationEngine = Depends(get_navigation_engine)
):
    """Get all concepts with no prerequisites."""
    return navigation_engine.find_root_concepts()


@router.get("/concepts/unlocked/{user_id}", summary="Get unlocked concepts for user", response_model=List[str])
async def get_unlocked_concepts(
    user_id: str,
    navigation_engine: NavigationEngine = Depends(get_navigation_engine)
):
    """Get concepts available for the user to start."""
    return navigation_engine.get_unlocked_concepts(user_id)


@router.get("/concepts/graph", summary="Get full knowledge graph")
async def get_concept_graph(
    navigation_engine: NavigationEngine = Depends(get_navigation_engine)
):
    """Get the full concept graph (nodes and edges)."""
    return navigation_engine.get_full_graph()


# --- Content Retrieval Endpoints ---

@router.get("/learning/lesson/{user_id}/{target_concept}", summary="Get formatted lesson content with flashcards")
async def get_lesson_content(
    user_id: str,
    target_concept: str,
    time_budget: int = Query(30),
    path_resolver: PathResolver = Depends(get_path_resolver),
    content_retriever: ContentRetriever = Depends(get_content_retriever)
):
    """
    Get full lesson content (text) and flashcards for a path to target.

    Returns:
        - target: The target concept name
        - path: List of concepts in the learning path
        - estimated_time: Estimated minutes for the lesson
        - content_markdown: The lesson content in Markdown
        - flashcards: List of flashcards with 'front' and 'back' fields
    """
    # Resolve path first
    path = path_resolver.resolve_path(user_id, target_concept, time_budget)

    # If no path found in graph, create a path with just the target concept
    # This allows generating content for concepts that aren't in the graph yet
    if not path or not path.concepts:
        # Create a minimal path with just the target concept
        concepts = [target_concept.lower()]
        estimated_time = time_budget
    else:
        concepts = path.concepts
        estimated_time = path.estimated_time_minutes

    # Retrieve formatted content WITH flashcards
    lesson_data = await content_retriever.get_lesson_with_flashcards(
        concepts,
        time_budget_minutes=time_budget
    )

    return {
        "target": target_concept,
        "path": concepts,
        "estimated_time": estimated_time,
        "content_markdown": lesson_data["content_markdown"],
        "flashcards": lesson_data["flashcards"]
    }


# --- Progress Tracking Endpoints ---

@router.post("/progress/start", summary="Mark concept in progress")
async def start_concept(
    update: ProgressUpdate,
    user_tracker: UserProgressTracker = Depends(get_user_tracker)
):
    """Mark a concept as started (IN_PROGRESS)."""
    success = user_tracker.mark_in_progress(update.user_id, update.concept_name)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark concept started (completed or prerequisites not met?)")
        
    return {"message": f"Started {update.concept_name}"}


@router.post("/progress/complete", summary="Mark concept completed")
async def complete_concept(
    update: ProgressUpdate,
    user_tracker: UserProgressTracker = Depends(get_user_tracker)
):
    """Mark a concept as COMPLETED."""
    success = user_tracker.mark_completed(update.user_id, update.concept_name)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark concept completed")
        
    return {"message": f"Completed {update.concept_name}"}


@router.get("/progress/{user_id}", summary="Get full user state", response_model=UserState)
async def get_user_progress(
    user_id: str,
    user_tracker: UserProgressTracker = Depends(get_user_tracker)
):
    """Get user's completed, in-progress, and available concepts."""
    state = user_tracker.get_user_state(user_id)
    if not state:
        raise HTTPException(status_code=404, detail="User not found")
        
    return state
