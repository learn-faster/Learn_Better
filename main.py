# ... (existing imports)
import os
import shutil
import logging
from typing import List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware  # Added
from pydantic import BaseModel

from src.storage.document_store import DocumentStore

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
    curriculum as curriculum_router
)


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("learnfast-core")

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
    
    yield
    
    logger.info("Shutting down LearnFast Core Engine...")


app = FastAPI(
    title="LearnFast Core Engine",
    description="Hybrid Graph-RAG Learning Platform API",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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


# Mount static files
app.mount("/static", StaticFiles(directory="src/static"), name="static")
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads") # Mount uploads

@app.get("/")
async def root():
    return FileResponse("src/static/index.html")

# --- Endpoint Migration Status ---
# /ingest -> Moved to /api/documents/upload
# /ingest/youtube -> Moved to /api/documents/youtube
# /documents/* -> Moved to /api/documents/*
# /concepts/*, /learning/lesson, /progress/* -> Moved to /api (served by navigation router)
# /learning/path -> Moved to /api/ai/learning-path
 
