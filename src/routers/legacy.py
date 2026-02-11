from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from src.database.orm import get_db
from src.dependencies import (
    get_navigation_engine,
    get_user_tracker,
    get_path_resolver,
    get_request_user_id,
    get_ingestion_engine,
    get_document_store,
)
from src.models.schemas import PathRequest, ProgressUpdate
from src.navigation.navigation_engine import NavigationEngine
from src.navigation.user_tracker import UserProgressTracker
from src.path_resolution.path_resolver import PathResolver
from src.routers import ai as ai_router
from src.routers import documents as documents_router
from src.storage.document_store import DocumentStore
from src.ingestion.ingestion_engine import IngestionEngine
from src.ingestion.youtube_utils import extract_video_id, fetch_transcript

router = APIRouter(tags=["Legacy Compatibility"])


@router.get("/concepts/roots")
async def legacy_root_concepts(
    navigation_engine: NavigationEngine = Depends(get_navigation_engine),
):
    return navigation_engine.find_root_concepts()


@router.post("/progress/start")
async def legacy_progress_start(
    update: ProgressUpdate,
    user_tracker: UserProgressTracker = Depends(get_user_tracker),
):
    success = user_tracker.mark_in_progress(update.user_id, update.concept_name)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark concept started (completed or prerequisites not met?)")
    return {"message": f"Started {update.concept_name}"}


@router.post("/progress/complete")
async def legacy_progress_complete(
    update: ProgressUpdate,
    user_tracker: UserProgressTracker = Depends(get_user_tracker),
):
    success = user_tracker.mark_completed(update.user_id, update.concept_name)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to mark concept completed")
    return {"message": f"Completed {update.concept_name}"}


@router.post("/learning/path")
async def legacy_learning_path(
    request: PathRequest,
    db: Session = Depends(get_db),
    path_resolver: PathResolver = Depends(get_path_resolver),
    user_id: str = Depends(get_request_user_id),
):
    # Use the existing AI router handler for consistency.
    return await ai_router.generate_learning_path(
        request=request,
        db=db,
        path_resolver=path_resolver,
        user_id=user_id,
    )


@router.post("/ingest/youtube")
async def legacy_ingest_youtube(
    url: str = Body(..., embed=True),
    auto_ingest: bool = Body(False, embed=True),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    document_store: DocumentStore = Depends(get_document_store),
):
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    transcript = await run_in_threadpool(fetch_transcript, video_id)
    if not transcript or not transcript.strip():
        raise HTTPException(status_code=404, detail="Transcript not available for this video")

    doc_metadata = document_store.save_transcript(video_id, transcript)
    try:
        await ingestion_engine.process_document(doc_metadata.file_path, document_id=doc_metadata.id)
        document_store.update_status(doc_metadata.id, "completed")
    except Exception as e:
        document_store.update_status(doc_metadata.id, "failed")
        raise HTTPException(status_code=500, detail=f"YouTube ingestion failed: {str(e)}") from e

    return {
        "message": "YouTube transcript processed successfully",
        "document_id": doc_metadata.id,
    }
