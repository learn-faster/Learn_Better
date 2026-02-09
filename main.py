import os
import shutil
import logging
import subprocess
import asyncio
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
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
from src.services.weekly_digest_scheduler import run_weekly_digest_scheduler
from src.services.negotiation_scheduler import run_negotiation_scheduler
from src.database.connections import postgres_conn
from src.database.orm import SessionLocal
from src.models.orm import UserSettings
from src.queue.ingestion_queue import get_redis, get_queue_health
from src.observability.opik import build_opik_config, init_opik, get_trace_context_manager, get_opik_context

# Import new routers
from src.routers import (
    documents as documents_api_router,
    flashcards as flashcards_router,
    study as study_router,
    folders as folders_router,
    analytics as analytics_router,
    dashboard as dashboard_router,
    ai as ai_router,
    navigation as navigation_router,
    cognitive as cognitive_router,
    curriculum as curriculum_router,
    resources as resources_router,
    goals as goals_router,
    notifications as notifications_router,
    multidoc_graph as multidoc_graph_router,
    fitbit as fitbit_router,
    practice as practice_router
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
    
    # Initialize Opik settings from user profile if available
    try:
        db = SessionLocal()
        settings_row = db.query(UserSettings).filter_by(user_id="default_user").first()
        opik_cfg = build_opik_config(settings_row)
        init_opik(opik_cfg)
        app.state.opik_config = opik_cfg
    except Exception as e:
        logger.warning(f"Failed to initialize Opik: {e}")
        app.state.opik_config = {"enabled": False}
    finally:
        try:
            db.close()
        except Exception:
            pass

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Load user-level embedding settings (if present) into runtime config
    try:
        db = SessionLocal()
        settings_row = db.query(UserSettings).filter_by(user_id="default_user").first()
        if settings_row:
            if settings_row.embedding_provider is not None:
                settings.embedding_provider = settings_row.embedding_provider
            if settings_row.embedding_model is not None:
                settings.embedding_model = settings_row.embedding_model
            if settings_row.embedding_api_key is not None:
                settings.embedding_api_key = settings_row.embedding_api_key
            if settings_row.embedding_base_url is not None:
                settings.embedding_base_url = settings_row.embedding_base_url
    except Exception as e:
        logger.warning(f"Failed to load user embedding settings: {e}")
    finally:
        try:
            db.close()
        except Exception:
            pass
    
    logger.info("Components initialized successfully")

    # Start weekly digest scheduler (optional)
    weekly_task = None
    weekly_stop_event = None
    negotiation_task = None
    negotiation_stop_event = None
    if settings.enable_weekly_digest_scheduler:
        weekly_stop_event = asyncio.Event()
        weekly_task = asyncio.create_task(
            run_weekly_digest_scheduler(
                settings.weekly_digest_day,
                settings.weekly_digest_hour,
                settings.weekly_digest_minute,
                weekly_stop_event
            )
        )
        app.state.weekly_digest_task = weekly_task
        app.state.weekly_digest_stop = weekly_stop_event
        logger.info("Weekly digest scheduler started.")

    # Start daily negotiation scheduler
    negotiation_stop_event = asyncio.Event()
    negotiation_task = asyncio.create_task(
        run_negotiation_scheduler(negotiation_stop_event)
    )
    app.state.negotiation_task = negotiation_task
    app.state.negotiation_stop = negotiation_stop_event
    logger.info("Negotiation scheduler started.")
    
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
    
    if weekly_stop_event:
        weekly_stop_event.set()
    if weekly_task:
        try:
            await weekly_task
        except Exception:
            pass
    if negotiation_stop_event:
        negotiation_stop_event.set()
    if negotiation_task:
        try:
            await negotiation_task
        except Exception:
            pass

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

    try:
        from src.services.llm_service import llm_service
        await llm_service.close()
    except Exception:
        pass




class OpikTraceMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request, call_next):
        config = getattr(request.app.state, "opik_config", None) or {}
        enabled = bool(config.get("enabled"))
        trace_cm = get_trace_context_manager()
        if not enabled or trace_cm is None:
            return await call_next(request)

        trace_name = f"{request.method} {request.url.path}"
        user_id = request.query_params.get("user_id") or "default_user"
        metadata = {"path": request.url.path, "method": request.method, "user_id": user_id}

        with trace_cm(name=trace_name, metadata=metadata, tags=["api"]):
            response = await call_next(request)
            ctx = get_opik_context()
            if ctx is not None:
                trace = ctx.get_current_trace_data()
                if trace is not None:
                    response.headers["X-Opik-Trace-Id"] = trace.id
                    project_name = config.get("project_name")
                    if project_name:
                        response.headers["X-Opik-Project"] = project_name
            return response

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

# Configure CORS - uses settings.cors_origins which auto-detects from env or defaults
app.add_middleware(
    OpikTraceMiddleware
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(f"CORS configured with origins: {settings.cors_origins}")

# Include new Feature Routers
app.include_router(documents_api_router.router)
app.include_router(flashcards_router.router)
app.include_router(study_router.router)
app.include_router(folders_router.router)
app.include_router(analytics_router.router)
app.include_router(dashboard_router.router)
app.include_router(ai_router.router)
app.include_router(navigation_router.router)
app.include_router(cognitive_router.router)
app.include_router(curriculum_router.router)
app.include_router(resources_router.router)
app.include_router(goals_router.router)
app.include_router(notifications_router.router)
app.include_router(multidoc_graph_router.router)
app.include_router(practice_router.router)
app.include_router(fitbit_router.router, prefix="/api/fitbit")
app.include_router(notebook_router, prefix="/api")


# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount screenshots directory
os.makedirs("data/screenshots", exist_ok=True)
app.mount("/screenshots", StaticFiles(directory="data/screenshots"), name="screenshots")
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads") # Mount uploads
extracted_images_dir = "data/extracted_images"
os.makedirs(extracted_images_dir, exist_ok=True)
app.mount("/extracted_images", StaticFiles(directory=extracted_images_dir), name="extracted_images")  # Multimodal assets

@app.get("/")
async def root():
    return FileResponse("src/static/index.html")

@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "learnfast-core",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/config")
async def api_config():
    db_status = "unknown"
    try:
        postgres_conn.execute_query("SELECT 1")
        db_status = "online"
    except Exception:
        db_status = "offline"

    queue_info = get_queue_health()
    redis_status = queue_info.get("status")
    queue_workers = queue_info.get("workers")

    return {
        "version": app.version,
        "buildTime": None,
        "latestVersion": None,
        "hasUpdate": False,
        "dbStatus": db_status,
        "queueStatus": redis_status,
        "queueWorkers": queue_workers
    }

# --- Endpoint Migration Status ---
# /ingest -> Moved to /api/documents/upload
# /ingest/youtube -> Moved to /api/documents/youtube
# /documents/* -> Moved to /api/documents/*
# /concepts/*, /learning/lesson, /progress/* -> Moved to /api (served by navigation router)
# /learning/path -> Moved to /api/ai/learning-path
 
