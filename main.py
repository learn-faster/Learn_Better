import os
import shutil
import logging
import subprocess
from typing import List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.storage.document_store import DocumentStore
from src.utils.logger import logger

# Configure logging (Removed old basicConfig)
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger("learnfast-core")

# Import core components
from src.ingestion.ingestion_engine import IngestionEngine
from src.navigation.navigation_engine import NavigationEngine
from src.navigation.user_tracker import UserProgressTracker
from src.path_resolution.path_resolver import PathResolver
from src.path_resolution.content_retriever import ContentRetriever
from src.database.init_db import initialize_databases
from src.models.schemas import LearningPath
from src.ingestion.youtube_utils import extract_video_id, fetch_transcript
from src.config import settings  # Added

# Import new routers
from src.routers import (
    documents as documents_api_router,
    flashcards as flashcards_router,
    study as study_router,
    folders as folders_router,
    analytics as analytics_router,
    ai as ai_router,
    navigation as navigation_router,
    cognitive as cognitive_router,
    curriculum as curriculum_router,
    resources as resources_router,
    goals as goals_router,
    notifications as notifications_router,
    multidoc_graph as multidoc_graph_router,
    fitbit as fitbit_router
)

# Import Open Notebook components
from on_api.router_main import router as notebook_router, init_surrealdb



# Component instances (global)
ingestion_engine: Optional[IngestionEngine] = None
navigation_engine: Optional[NavigationEngine] = None
user_tracker: Optional[UserProgressTracker] = None
path_resolver: Optional[PathResolver] = None
content_retriever: Optional[ContentRetriever] = None
document_store: Optional[DocumentStore] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    Initializes databases and components.
    """
    global ingestion_engine, navigation_engine, user_tracker, path_resolver, content_retriever, document_store
    
    logger.info("Initializing LearnFast Core Engine...")
    
    # Initialize databases (Postgres, Neo4j, ORM)
    if not initialize_databases():
        logger.error("Failed to initialize databases")
    
    # Initialize Open Notebook (SurrealDB)
    try:
        await init_surrealdb()
    except Exception as e:
        logger.error(f"Failed to initialize Open Notebook: {e}")
        # Continue execution, but Open Notebook features might fail
    
    # Initialize components
    ingestion_engine = IngestionEngine()
    navigation_engine = NavigationEngine()
    user_tracker = UserProgressTracker()
    path_resolver = PathResolver()
    content_retriever = ContentRetriever()
    document_store = DocumentStore()
    
    # helper for dependency injection
    app.state.ingestion_engine = ingestion_engine
    app.state.document_store = document_store
    app.state.navigation_engine = navigation_engine
    app.state.user_tracker = user_tracker
    app.state.path_resolver = path_resolver
    app.state.content_retriever = content_retriever
    
    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    logger.info("Components initialized successfully")
    
    # Start Open Notebook Command Worker
    worker_process = None
    try:
        logger.info("Starting Open Notebook Command Worker...")
        # Check if commands module exists at expected path
        if os.path.exists("open_notebook/commands"):
            worker_command = ["uv", "run", "surreal-commands-worker", "--import-modules", "open_notebook.commands"]
            worker_process = subprocess.Popen(
                worker_command,
                cwd=os.getcwd(),
                # stdout=subprocess.DEVNULL, # Keep stdout for debugging for now
                env=os.environ.copy()
            )
            logger.info(f"Worker started with PID {worker_process.pid}")
        else:
            logger.warning("open_notebook/commands not found, skipping worker startup")
    except Exception as e:
        logger.error(f"Failed to start worker: {e}")

    yield
    
    # Shutdown worker
    if worker_process:
        logger.info("Stopping Open Notebook Command Worker...")
        worker_process.terminate()
        try:
            worker_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            worker_process.kill()
        logger.info("Worker stopped")
        
    logger.info("Shutting down LearnFast Core Engine...")


app = FastAPI(
    title="LearnFast Core Engine",
    description="Hybrid Graph-RAG Learning Platform API",
    version="0.1.0",
    lifespan=lifespan
)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global Exception Handler: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc)},
    )

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include new Feature Routers
app.include_router(documents_api_router.router)
app.include_router(flashcards_router.router)
app.include_router(study_router.router)
app.include_router(folders_router.router)
app.include_router(analytics_router.router)
app.include_router(ai_router.router)
app.include_router(navigation_router.router)
app.include_router(cognitive_router.router)
app.include_router(curriculum_router.router)
app.include_router(resources_router.router)
app.include_router(goals_router.router)
app.include_router(notifications_router.router)
app.include_router(multidoc_graph_router.router)
app.include_router(fitbit_router.router, prefix="/api/fitbit")
app.include_router(notebook_router, prefix="/api")


# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount screenshots directory
os.makedirs("data/screenshots", exist_ok=True)
app.mount("/screenshots", StaticFiles(directory="data/screenshots"), name="screenshots")
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads") # Mount uploads
app.mount("/extracted_images", StaticFiles(directory="data/extracted_images"), name="extracted_images")  # Multimodal assets

@app.get("/")
async def root():
    return FileResponse("src/static/index.html")

# --- Endpoint Migration Status ---
# /ingest -> Moved to /api/documents/upload
# /ingest/youtube -> Moved to /api/documents/youtube
# /documents/* -> Moved to /api/documents/*
# /concepts/*, /learning/lesson, /progress/* -> Moved to /api (served by navigation router)
# /learning/path -> Moved to /api/ai/learning-path
 
