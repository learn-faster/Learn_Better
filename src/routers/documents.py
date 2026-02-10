"""
Documents Router for the Learning Assistant.
Handles document uploads, metadata updates, and time tracking sessions.
Note: This is the 'App' API. Core engine endpoints are also available at /documents.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Body, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session, defer
from sqlalchemy import func
from sqlalchemy.orm.exc import ObjectDeletedError
from typing import List, Optional, Callable
import os
import shutil
import logging
import uuid
import json
import re
import asyncio
from src.utils.logger import logger
from pathlib import Path
from datetime import datetime

from src.database.orm import get_db
from src.dependencies import get_request_user_id
from src.models.orm import Document, UserSettings, DocumentQuizItem as DocumentQuizItemORM, DocumentQuizSession, DocumentQuizAttempt, DocumentStudySettings, DocumentSection, IngestionJob, KnowledgeGraphDocument
from src.models.enums import FileType
from src.models.schemas import DocumentResponse, DocumentCreate, TimeTrackingRequest, DocumentLinkCreate, DocumentQuizGenerateRequest, DocumentQuizSessionCreate, DocumentQuizSessionResponse, DocumentQuizGradeRequest, DocumentQuizGradeResponse, DocumentStudySettingsPayload, DocumentStudySettingsResponse, DocumentQuizStatsResponse, DocumentQuizItem as DocumentQuizItemResponse, LLMConfig, DocumentSectionResponse, DocumentSectionUpdate, DocumentQualityResponse, IngestionJobResponse
from src.services.time_tracking_service import TimeTrackingService
from src.ingestion.document_processor import DocumentProcessor
from src.ingestion.ingestion_engine import IngestionEngine
from src.storage.document_store import DocumentStore
from src.ingestion.youtube_utils import extract_video_id, fetch_transcript
from src.dependencies import get_ingestion_engine, get_document_store
from src.config import settings
from src.services.reading_time import reading_time_estimator
from src.services.open_notebook_sync import sync_document_to_notebook
from src.services.llm_service import llm_service, RateLimitException
from src.observability.opik import get_opik_context
from src.services.prompts import CLOZE_GENERATION_PROMPT_TEMPLATE, RECALL_GRADING_PROMPT_TEMPLATE
from src.services.content_filter import filter_document_content, rebuild_filtered_from_sections
from src.services.ocr_service import ocr_service
from src.services.web_extractor import extract_web_content
from src.queue.ingestion_queue import enqueue_extraction, enqueue_ingestion
from src.services.ingestion_orchestrator import schedule_extraction, schedule_ingestion

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Initialize services
document_processor = DocumentProcessor()

# Ensure upload directory exists for storing documents
os.makedirs(settings.upload_dir, exist_ok=True)


from fastapi import BackgroundTasks
from src.database.orm import SessionLocal


def _attach_ingestion_errors(db: Session, documents: List[Document]) -> List[DocumentResponse]:
    if not documents:
        return []

    doc_ids = [d.id for d in documents]
    jobs = db.query(IngestionJob).filter(IngestionJob.document_id.in_(doc_ids)).order_by(
        IngestionJob.document_id.asc(), IngestionJob.created_at.desc()
    ).all()
    graph_links = db.query(
        KnowledgeGraphDocument.document_id,
        func.count(KnowledgeGraphDocument.id).label("link_count")
    ).filter(
        KnowledgeGraphDocument.document_id.in_(doc_ids)
    ).group_by(
        KnowledgeGraphDocument.document_id
    ).all()
    graph_counts = {row.document_id: int(row.link_count) for row in graph_links}

    latest_by_doc = {}
    for job in jobs:
        if job.document_id not in latest_by_doc:
            latest_by_doc[job.document_id] = job

    def _sanitize_message(message: Optional[str]) -> Optional[str]:
        if not message:
            return message
        cleaned = " ".join(str(message).split())
        if len(cleaned) > 180:
            return cleaned[:177] + "..."
        return cleaned

    results = []
    for doc in documents:
        resp = DocumentResponse.model_validate(doc, from_attributes=True)
        resp.display_type = _infer_display_type(doc)
        job = latest_by_doc.get(doc.id)
        link_count = graph_counts.get(doc.id, 0)
        resp.graph_link_count = link_count
        resp.linked_to_graph = link_count > 0
        if job:
            resp.ingestion_job_status = job.status
            resp.ingestion_job_phase = job.phase
            resp.ingestion_job_message = job.message
            resp.ingestion_job_updated_at = job.updated_at
            if job.status == "failed":
                resp.ingestion_error = _sanitize_message(job.message)
            # Use job progress/phase if it's ahead of the document fields
            if job.status in ("running", "pending"):
                job_progress = float(job.progress or 0)
                if job_progress > (resp.ingestion_progress or 0):
                    resp.ingestion_progress = job_progress
                if job.phase and (not resp.ingestion_step or resp.ingestion_step in ("pending", "queued", "extracting")):
                    resp.ingestion_step = job.phase
        results.append(resp)
    return results


def _infer_display_type(document: Document) -> str:
    file_type = (document.file_type or "").lower().strip()
    source_type = (document.source_type or "").lower().strip()

    if file_type in ("pdf", "image", "link", "video", "markdown", "text"):
        return file_type

    if source_type == "youtube":
        return "video"
    if source_type == "link":
        return "link"

    ext = ""
    if document.filename:
        ext = Path(document.filename).suffix.lower()
    if not ext and document.file_path:
        ext = Path(document.file_path).suffix.lower()

    if ext == ".pdf":
        return "pdf"
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"):
        return "image"
    if ext in (".md", ".markdown"):
        return "markdown"
    if ext in (".txt", ".text", ".csv", ".tsv", ".rtf"):
        return "text"
    if ext in (".mp4", ".mp3", ".wav", ".m4a", ".mov", ".avi", ".webm", ".mkv"):
        return "video"

    if file_type:
        return file_type
    return "other"


async def _extraction_heartbeat(
    doc_id: int,
    stop_event: asyncio.Event,
    db_session_factory: Callable[[], Session] = SessionLocal,
    interval_seconds: int = 45
):
    while not stop_event.is_set():
        try:
            db = db_session_factory()
            try:
                job = db.query(IngestionJob).filter(
                    IngestionJob.document_id == doc_id
                ).order_by(IngestionJob.created_at.desc()).first()
                if job and job.status in ("running", "pending") and job.phase in ("extracting", "ocr", "filtering"):
                    job.updated_at = datetime.utcnow()
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to heartbeat ingestion job for {doc_id}: {e}")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue


def _get_or_create_job(db: Session, doc_id: int) -> IngestionJob:
    job = db.query(IngestionJob).filter(IngestionJob.document_id == doc_id).order_by(IngestionJob.created_at.desc()).first()
    if job:
        return job
    job = IngestionJob(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        status="pending",
        phase="queued",
        progress=0.0,
        message="Queued"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _create_job(db: Session, doc_id: int) -> IngestionJob:
    job = IngestionJob(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        status="pending",
        phase="queued",
        progress=0.0,
        message="Queued"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _update_job(
    db: Session,
    job: IngestionJob,
    status: Optional[str] = None,
    phase: Optional[str] = None,
    progress: Optional[float] = None,
    message: Optional[str] = None,
    partial_ready: Optional[bool] = None,
    completed: bool = False
):
    job_id = getattr(job, "id", None)
    if not job_id:
        return
    try:
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            return
        if status:
            job.status = status
        if phase:
            job.phase = phase
        if progress is not None:
            job.progress = float(progress)
        if message:
            job.message = message
        if partial_ready is not None:
            job.partial_ready = partial_ready
        if completed:
            job.completed_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        if job.started_at is None and status == "running":
            job.started_at = datetime.utcnow()
        db.commit()
    except ObjectDeletedError:
        db.rollback()
        return
    except Exception as e:
        logger.warning(f"Failed to update ingestion job {job_id}: {e}")
        db.rollback()

def _mark_local_start(
    db: Session,
    doc_id: int,
    job: IngestionJob,
    status: str,
    phase: str,
    step: str,
    progress: float,
    message: str
):
    try:
        _update_job(db, job, status="running", phase=phase, progress=progress, message=message)
        db.query(Document).filter(Document.id == doc_id).update({
            "status": status,
            "ingestion_step": step,
            "ingestion_progress": float(progress)
        })
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to mark local start for doc {doc_id}: {e}")
        db.rollback()


def _schedule_extraction_background(
    doc_id: int,
    file_path: str,
    file_type: FileType,
    document_processor: DocumentProcessor
):
    schedule_extraction(
        process_extraction_background(
            doc_id,
            file_path,
            file_type,
            document_processor
        )
    )


def _schedule_ingestion_background(
    doc_id: int,
    file_path: str,
    document_processor: DocumentProcessor,
    ingestion_engine: IngestionEngine,
    document_store: DocumentStore,
    user_id: str = "default_user"
):
    schedule_ingestion(
        process_ingestion_background(
            doc_id=doc_id,
            file_path=file_path,
            document_processor=document_processor,
            ingestion_engine=ingestion_engine,
            document_store=document_store,
            user_id=user_id
        )
    )

def _basic_text_analysis(text: str, scanned_prob: float = 0.0, page_count: int = 1) -> dict:
    words = text.split() if text else []
    word_count = len(words)
    wpm = 275
    wpm_fast = wpm * 1.25
    wpm_slow = wpm * 0.75
    reading_time_median = int(word_count / wpm) if word_count else 0
    reading_time_min = int(word_count / wpm_fast) if word_count else 0
    reading_time_max = int(word_count / wpm_slow) if word_count else 0
    return {
        "reading_time_median": reading_time_median,
        "reading_time_min": reading_time_min,
        "reading_time_max": reading_time_max,
        "word_count": word_count,
        "difficulty_score": None,
        "language": None,
        "scanned_prob": scanned_prob,
        "page_count": page_count,
        "metrics": {}
    }

async def process_extraction_background(
    doc_id: int,
    file_path: str,
    file_type: FileType,
    document_processor: DocumentProcessor,
    db_session_factory: Callable[[], Session] = SessionLocal
):
    """
    Background task for Phase 1: Text Extraction & Analysis.
    Fast, enables immediate reading.
    """
    heartbeat_event = asyncio.Event()
    heartbeat_task = None
    
    def _get_db():
        return db_session_factory()

    try:
        logger.debug(f"Extraction started for {doc_id}")
        
        # 0. Initial Status
        db = _get_db()
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if not document:
                return
            job = _get_or_create_job(db, doc_id)
            _update_job(db, job, status="running", phase="extracting", progress=10, message="Extracting text")
            
            document.status = "processing"
            document.ingestion_step = "extracting"
            document.ingestion_progress = 10
            db.commit()
        finally:
            db.close()

        heartbeat_task = asyncio.create_task(
            _extraction_heartbeat(doc_id, heartbeat_event, db_session_factory)
        )

        document.status = "processing"
        document.ingestion_step = "extracting"
        document.ingestion_progress = 10
        db.commit()

        def _update_doc_progress(step: str, progress: float):
            db = _get_db()
            try:
                db.query(Document).filter(Document.id == doc_id).update({
                    "ingestion_step": step,
                    "ingestion_progress": float(progress)
                })
                db.commit()
            except Exception as e:
                logger.warning(f"Failed to update document progress: {e}")
                db.rollback()
            finally:
                db.close()

        def _get_job_and_update(status=None, phase=None, progress=None, message=None, completed=False):
            db = _get_db()
            try:
                job = db.query(IngestionJob).filter(IngestionJob.document_id == doc_id).order_by(IngestionJob.created_at.desc()).first()
                if job:
                    _update_job(db, job, status=status, phase=phase, progress=progress, message=message, completed=completed)
            finally:
                db.close()

        # 1. Extract Text
        extracted_text = ""
        try:
            if file_type == FileType.IMAGE:
                extracted_text = await ocr_service.ocr_image(file_path, mode=settings.ocr_mode)
                if not extracted_text or not extracted_text.strip():
                    extracted_text = f"[OCR failed for {os.path.basename(file_path)}. Image may be unreadable.]"
            elif os.path.exists(file_path):
                extracted_text, _ = await run_in_threadpool(document_processor.convert_to_markdown, file_path)
            
            _get_job_and_update(phase="extracting", progress=25, message="Text extracted")
            _update_doc_progress("extracting", 25)
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            db = _get_db()
            try:
                document = db.query(Document).filter(Document.id == doc_id).first()
                if document:
                    document.status = "failed"
                    document.extracted_text = f"Extraction Failed: {str(e)}"
                    db.commit()
                job = db.query(IngestionJob).filter(IngestionJob.document_id == doc_id).order_by(IngestionJob.created_at.desc()).first()
                if job:
                    _update_job(db, job, status="failed", phase="extracting", progress=0, message=str(e), completed=True)
            finally:
                db.close()
            return

        if file_type == FileType.PDF and os.path.exists(file_path):
            analysis = await run_in_threadpool(reading_time_estimator.analyze_document, file_path)
        elif file_type == FileType.IMAGE:
            analysis = _basic_text_analysis(extracted_text, scanned_prob=1.0, page_count=1)
        else:
            analysis = _basic_text_analysis(extracted_text, scanned_prob=0.0, page_count=1)

        # 2. OCR fallback for scanned or empty extraction (LONG RUNNING)
        ocr_status = "not_required"
        ocr_provider = None
        if file_type == FileType.PDF and (analysis.get("scanned_prob", 0) > 0.7 or "Text extraction failed" in (extracted_text or "")):
            ocr_status = "pending"
            _get_job_and_update(phase="ocr", progress=25, message="Running OCR")
            _update_doc_progress("ocr", 25)
            ocr_text = await ocr_service.ocr_pdf(file_path, mode=settings.ocr_mode)
            if ocr_text and ocr_text.strip():
                extracted_text = ocr_text
                ocr_status = "completed"
                ocr_provider = settings.ocr_mode
            else:
                if settings.ocr_cloud_fallback and settings.ocr_mode != "cloud":
                    ocr_text = await ocr_service.ocr_pdf(file_path, mode="cloud")
                    if ocr_text and ocr_text.strip():
                        extracted_text = ocr_text
                        ocr_status = "completed"
                        ocr_provider = "cloud"
                    else:
                        ocr_status = "failed"
                else:
                    ocr_status = "failed"
        elif file_type == FileType.IMAGE:
            ocr_status = "completed" if extracted_text and extracted_text.strip() else "failed"
            ocr_provider = settings.ocr_mode if ocr_status == "completed" else None

        # 3. Filter main content (LONG RUNNING)
        _get_job_and_update(phase="filtering", progress=60, message="Filtering main content")
        _update_doc_progress("filtering", 60)
        filter_result = await filter_document_content(extracted_text, page_count=analysis.get("page_count", 1))

        # 4. Update DB (Finalize)
        db = _get_db()
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                existing_profile = document.content_profile or {}
                auto_ingest = bool(existing_profile.get("auto_ingest"))
                document.raw_extracted_text = extracted_text if extracted_text else ""
                document.filtered_extracted_text = filter_result.filtered_text
                document.extracted_text = filter_result.filtered_text or document.raw_extracted_text
                document.page_count = analysis.get("page_count", 0)

                document.reading_time_min = analysis.get("reading_time_min")
                document.reading_time_max = analysis.get("reading_time_max")
                document.reading_time_median = analysis.get("reading_time_median")
                document.word_count = analysis.get("word_count")
                document.difficulty_score = analysis.get("difficulty_score")
                document.language = analysis.get("language")
                document.scanned_prob = analysis.get("scanned_prob")
                document.ocr_status = ocr_status
                document.ocr_provider = ocr_provider
                document.content_profile = {
                    **(filter_result.stats or {}),
                    **({"auto_ingest": True} if auto_ingest else {})
                }

                document.status = "extracted"
                document.ingestion_step = "ready_for_synthesis"
                document.ingestion_progress = 100
                db.commit()

                db.query(DocumentSection).filter(DocumentSection.document_id == doc_id).delete()
                for section in filter_result.sections:
                    db.add(DocumentSection(
                        id=str(uuid.uuid4()),
                        document_id=doc_id,
                        section_index=section.get("section_index", 0),
                        title=section.get("title"),
                        content=section.get("content", ""),
                        excerpt=section.get("excerpt"),
                        relevance_score=section.get("relevance_score", 0.0),
                        included=section.get("included", True),
                        page_start=section.get("page_start"),
                        page_end=section.get("page_end")
                    ))
                db.commit()

                job = db.query(IngestionJob).filter(IngestionJob.document_id == doc_id).order_by(IngestionJob.created_at.desc()).first()
                if job:
                    _update_job(db, job, status="completed", phase="ready", progress=100, message="Extraction complete", partial_ready=True, completed=True)

                logger.debug(f"Extraction complete for {doc_id}")

                # Sync to Open Notebook (Fast)
                try:
                    await sync_document_to_notebook(
                        doc_id,
                        document.title,
                        document.extracted_text or "",
                        file_path,
                        str(file_type) if file_type else "text"
                    )
                except Exception as e:
                    logger.error(f"Sync to Open Notebook failed: {e}")

                if auto_ingest:
                    try:
                        await _auto_enqueue_ingestion(doc_id, document.file_path)
                    except Exception as e:
                        logger.error(f"Auto-ingest failed for document {doc_id}: {e}")
        finally:
            db.close()

    except Exception as e:
        logger.exception(f"Critical Failure in Extraction: {e}")
        db = _get_db()
        try:
             document = db.query(Document).filter(Document.id == doc_id).first()
             if document:
                 document.status = "failed"
                 db.commit()
        except:
            pass
        finally:
            db.close()
    finally:
        heartbeat_event.set()
        if heartbeat_task:
            try:
                await heartbeat_task
            except Exception:
                pass

async def _auto_enqueue_ingestion(
    doc_id: int,
    file_path: Optional[str],
    db_session_factory: Callable[[], Session] = SessionLocal
):
    if not file_path:
        return
    db = db_session_factory()
    try:
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document:
            return
        if not (document.filtered_extracted_text or document.extracted_text or document.raw_extracted_text):
            return

        job = _create_job(db, doc_id)
        _update_job(db, job, status="pending", phase="queued", progress=0, message="Queued for ingestion")
        job_id = enqueue_ingestion(doc_id, file_path, user_id="default_user")

        if not job_id:
            _mark_local_start(
                db=db,
                doc_id=doc_id,
                job=job,
                status="ingesting",
                phase="ingesting",
                step="ingesting",
                progress=5,
                message="Running locally"
            )
            ingestion_engine = IngestionEngine()
            document_store = DocumentStore()
            schedule_ingestion(
                process_ingestion_background(
                    doc_id=doc_id,
                    file_path=file_path,
                    document_processor=document_processor,
                    ingestion_engine=ingestion_engine,
                    document_store=document_store
                )
            )
        else:
            document.status = "ingesting"
            document.ingestion_step = "queued"
            document.ingestion_progress = 0
            db.commit()
    finally:
        db.close()

async def process_ingestion_background(
    doc_id: int,
    file_path: str, # passed for filename ref
    document_processor: DocumentProcessor,
    ingestion_engine: IngestionEngine,
    document_store: DocumentStore,
    user_id: str = "default_user",
    db_session_factory: Callable[[], Session] = SessionLocal
):
    """
    Background task for Phase 2: Knowledge Graph Ingestion.
    Refactored to use short-lived sessions.
    """
    def _get_db():
        return db_session_factory()

    job_id = None
    try:
        logger.debug(f"Ingestion started for {doc_id}")
        
        # 1. Load Document State and Resolve Config
        db = _get_db()
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if not document or not (document.filtered_extracted_text or document.extracted_text or document.raw_extracted_text):
                logger.error(f"Cannot ingest document {doc_id} - text missing.")
                if document:
                    document.status = "failed"
                    document.ingestion_step = "text_missing"
                    document.ingestion_progress = 0
                    db.commit()
                job = _create_job(db, doc_id)
                _update_job(db, job, status="failed", phase="ingesting", progress=0, message="Text missing", completed=True)
                return

            profile = document.content_profile or {}
            resume_enabled = profile.get("graph_extraction_resume", True)
            checkpoint = profile.get("graph_extraction_checkpoint") or {}
            resume_from_window = checkpoint.get("next_window", 0) if resume_enabled else 0

            document.status = "ingesting" 
            document.ingestion_step = "initializing"
            document.ingestion_progress = 0
            db.commit()
            
            job = _get_or_create_job(db, doc_id)
            job_id = job.id
            _update_job(db, job, status="running", phase="ingesting", progress=5, message="Building knowledge graph")

            # Resolve LLM config
            from src.services.llm_config_resolver import resolve_llm_config
            llm_config = resolve_llm_config(db, user_id)
            
            source_text = document.filtered_extracted_text or document.extracted_text or document.raw_extracted_text or ""
        finally:
            db.close()

        # 2. Chunk Content (Fast)
        chunks = document_processor.chunk_content(source_text)
        
        # 3. Callbacks
        last_progress = {"value": -1, "step": None}

        def on_progress(step: str, progress: int):
            try:
                if step != last_progress["step"] or progress - last_progress["value"] >= 5:
                    last_progress["step"] = step
                    last_progress["value"] = progress
                else:
                    return
                progress_db = _get_db()
                try:
                    progress_db.query(Document).filter(Document.id == doc_id).update({
                        "ingestion_step": step,
                        "ingestion_progress": progress
                    })
                    if job_id:
                        progress_db.query(IngestionJob).filter(IngestionJob.id == job_id).update({
                            "phase": step,
                            "progress": float(progress),
                            "status": "running",
                            "message": step,
                            "updated_at": datetime.utcnow()
                        })
                    progress_db.commit()
                finally:
                    progress_db.close()
            except Exception as e:
                logger.warning(f"Progress update failed: {e}")

        def on_window_complete(window_index: int, total_windows: int):
            try:
                progress_db = _get_db()
                try:
                    doc = progress_db.query(Document).filter(Document.id == doc_id).first()
                    if not doc:
                        return
                    profile = doc.content_profile or {}
                    profile["graph_extraction_checkpoint"] = {
                        "next_window": window_index + 1,
                        "total_windows": total_windows,
                        "updated_at": datetime.utcnow().isoformat()
                    }
                    doc.content_profile = profile
                    progress_db.commit()
                finally:
                    progress_db.close()
            except Exception as e:
                logger.warning(f"Failed to persist graph extraction checkpoint: {e}")

        # 4. Run Ingestion (LONG RUNNING)
        await ingestion_engine.process_document_scoped_from_text(
            extracted_text=source_text,
            document_id=doc_id,
            llm_config=llm_config,
            extraction_max_chars=settings.extraction_max_chars,
            on_progress=on_progress,
            resume_from_window=resume_from_window,
            on_window_complete=on_window_complete
        )

        # 5. Finalize
        db = _get_db()
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                profile = document.content_profile or {}
                profile.pop("graph_extraction_checkpoint", None)
                profile.pop("graph_extraction_resume", None)
                document.content_profile = profile
                document.status = "completed"
                document.ingestion_step = "complete"
                document.ingestion_progress = 100
                document_store.update_status(doc_id, "completed")
                db.commit()
                
                job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
                if job:
                    _update_job(db, job, status="completed", phase="complete", progress=100, message="Graph build complete", completed=True)
                logger.debug(f"Ingestion complete for {doc_id}")
        finally:
            db.close()

    except RateLimitException as e:
        logger.warning(f"Ingestion rate limited for doc {doc_id}: {e}")
        db = _get_db()
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.status = "extracted"
                document.ingestion_step = "rate_limited"
                db.commit()
            if job_id:
                job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
                if job:
                    _update_job(db, job, status="paused", phase="rate_limited", progress=0, message=str(e), completed=False)
        finally:
            db.close()

    except Exception as e:
        logger.exception(f"Ingestion failed: {e}")
        db = _get_db()
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.status = "failed" 
                document.ingestion_step = f"Failed: {str(e)}"
                db.commit()
            if job_id:
                job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
                if job:
                    _update_job(db, job, status="failed", phase="ingesting", progress=0, message=str(e), completed=True)
        finally:
            db.close()
    finally:
        pass



@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    tags: Optional[str] = Form(""),
    category: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
    auto_ingest: Optional[bool] = Form(False),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    document_store: DocumentStore = Depends(get_document_store)
):
    """
    Uploads a new study document and extracts its content asynchronously.

    TODO: Add rate limiting to prevent abuse of upload endpoint.
    """
    # Validate file type
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext in settings.allowed_pdf_extensions:
        file_type = FileType.PDF
    elif file_ext in settings.allowed_image_extensions:
        file_type = FileType.IMAGE
    else:
        file_type = FileType.OTHER
    
    # Size check
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > settings.max_file_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum limit of {settings.max_file_size / (1024*1024)}MB"
        )
    
    try:
        # 1. Initial Save (Synchronous, fast)
        doc_metadata = document_store.save_document(file)
        doc_id = doc_metadata.id
        file_path = doc_metadata.file_path
        
        # 2. Update Metadata
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document:
             raise HTTPException(status_code=500, detail="Document created but not found in DB")
        
        # 3. Update Metadata
        document.title = title or doc_metadata.filename
        document.tags = _normalize_tags_str(tags)
        document.category = category
        document.folder_id = folder_id
        document.file_type = file_type.value # Store string value
        document.status = "processing"
        document.source_type = "upload"
        document.content_profile = {
            **(document.content_profile or {}),
            "auto_ingest": bool(auto_ingest)
        }
        
        db.commit()
        db.refresh(document)
        
        # 3. Queue Background Processing (Phase 1: Extraction Only)
        _enqueue_extraction_job(db, doc_id, file_path, file_type, background_tasks)
        
        return document

    except Exception as e:
        import traceback
        traceback.print_exc()
        # Cleanup: delete file if it was saved but something went wrong
        if 'file_path' in locals() and file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"Cleaned up orphaned file: {file_path}")
            except Exception as cleanup_error:
                print(f"Failed to cleanup file {file_path}: {cleanup_error}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")



@router.post("/youtube", summary="Ingest transcripts from a YouTube video", response_model=DocumentResponse)
async def ingest_youtube(
    url: str = Body(..., embed=True),
    auto_ingest: Optional[bool] = Body(False, embed=True),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    document_store: DocumentStore = Depends(get_document_store),
    # db dependency implicit in document_store usage if it uses its own session, 
    # but here we might want to return a DocumentResponse so we need standard DB access?
    # document_store methods return DocumentMetadata (pydantic?) or ORM?
    # let's check document_store returns.
    db: Session = Depends(get_db)
):
    """
    Ingest transcripts from a YouTube URL.
    Fetches transcript, saves as a virtual document, and processes it.
    """
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
    try:
        # 1. Fetch transcript
        transcript = await run_in_threadpool(fetch_transcript, video_id)
        if not transcript or not transcript.strip():
            raise HTTPException(status_code=404, detail="Transcript not available for this video")
            
        # 2. Save transcript as virtual document
        # DocumentStore handles saving to DB + creating file placeholder
        doc_metadata = document_store.save_transcript(video_id, transcript)
        
        # Initialize metadata for the record
        doc = db.query(Document).filter(Document.id == doc_metadata.id).first()
        if doc:
            doc.title = f"YouTube: {video_id}"
            doc.tags = ["youtube", "transcript"]
            doc.status = "processing"
            doc.file_type = FileType.OTHER.value
            doc.source_type = "youtube"
            doc.source_url = url
            doc.content_profile = {
                **(doc.content_profile or {}),
                "auto_ingest": bool(auto_ingest)
            }
            db.commit()

        # 3. Queue background extraction
        _enqueue_extraction_job(db, doc_metadata.id, doc_metadata.file_path, FileType.OTHER, background_tasks)
        
        # Return the document record
        doc = db.query(Document).filter(Document.id == doc_metadata.id).first()
        return doc
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"YouTube ingestion failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"YouTube ingestion failed: {str(e)}")


@router.post("/link", response_model=DocumentResponse)
async def ingest_link(
    link_data: DocumentLinkCreate,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    document_store: DocumentStore = Depends(get_document_store),
    db: Session = Depends(get_db)
):
    """
    Ingest a document from an external link (YouTube or Generic).
    """
    video_id = extract_video_id(link_data.url)
    
    if video_id:
        # YouTube Logic
        try:
            transcript = await run_in_threadpool(fetch_transcript, video_id)
            if not transcript or not transcript.strip():
                 # Valid video but no transcript? fall through to generic link
                 pass
            else:
                 # It's a valid YouTube video with transcript
                 doc_metadata = document_store.save_transcript(video_id, transcript)
                 
                 # Update Metadata
                 doc = db.query(Document).filter(Document.id == doc_metadata.id).first()
                 if doc:
                     doc.title = link_data.title or f"YouTube: {video_id}"
                     doc.category = link_data.category
                     doc.folder_id = link_data.folder_id
                     # Add user tags plus system tags
                     doc.tags = _normalize_tag_list(link_data.tags) + ["youtube", "video"]
                     doc.file_type = FileType.VIDEO.value
                     doc.status = "processing"
                     doc.source_type = "youtube"
                     doc.source_url = link_data.url
                     doc.content_profile = {
                         **(doc.content_profile or {}),
                         "auto_ingest": bool(link_data.auto_ingest)
                     }
                     db.commit()
                     
                 # Trigger extraction
                 _enqueue_extraction_job(db, doc_metadata.id, doc_metadata.file_path, FileType.OTHER, background_tasks)
                 return doc
        except Exception as e:
            print(f"YouTube processing failed, falling back to basic link: {e}")
            
    # Generic Link Handling
    try:
        title = link_data.title or "Web Source"
        content = f"# {title}\n\nURL: {link_data.url}\n\n[Fetching content...]\n"
        # Use timestamp in filename
        ts = int(datetime.utcnow().timestamp())
        filename = f"link_{ts}.md"
        
        doc_metadata = document_store.save_text_document(filename, content, title)
        
        doc = db.query(Document).filter(Document.id == doc_metadata.id).first()
        if doc:
            doc.title = title
            doc.category = link_data.category
            doc.folder_id = link_data.folder_id
            doc.tags = _normalize_tag_list(link_data.tags) + ["link", "web"]
            doc.file_type = FileType.LINK.value
            doc.status = "processing"
            doc.source_type = "link"
            doc.source_url = link_data.url
            doc.content_profile = {
                **(doc.content_profile or {}),
                "auto_ingest": bool(link_data.auto_ingest)
            }
            db.commit()
            
        # Fetch and extract in background
        background_tasks.add_task(
            _process_link_background,
            doc_metadata.id,
            link_data.url,
            title,
            link_data.category,
            link_data.folder_id,
            _normalize_tag_list(link_data.tags)
        )
        return doc
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Link ingestion failed: {str(e)}")


@router.get("", response_model=List[DocumentResponse])
def get_documents(
    folder_id: Optional[str] = None,
    tag: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieves a list of documents with optional filtering.
    """
    query = db.query(Document).options(
        defer(Document.extracted_text),
        defer(Document.raw_extracted_text),
        defer(Document.filtered_extracted_text)
    )
    
    if folder_id == "unfiled":
        query = query.filter(Document.folder_id == None)
    elif folder_id:
        query = query.filter(Document.folder_id == folder_id)
        
    if tag:
        # Simple string match for tags if stored as JSON list
        # query = query.filter(Document.tags.contains([tag])) 
        # Fallback for now if dialect issues
        pass
        
    documents = query.order_by(Document.upload_date.desc()).all()
    return _attach_ingestion_errors(db, documents)


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(document_id: int, db: Session = Depends(get_db)):
    """
    Retrieves a specific document's metadata.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    enriched = _attach_ingestion_errors(db, [document])
    return enriched[0] if enriched else document


@router.get("/{document_id}/sections", response_model=List[DocumentSectionResponse])
def get_document_sections(
    document_id: int,
    include_all: bool = True,
    db: Session = Depends(get_db)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    query = db.query(DocumentSection).filter(DocumentSection.document_id == document_id)
    if not include_all:
        query = query.filter(DocumentSection.included == True)
    sections = query.order_by(DocumentSection.section_index.asc()).all()
    return sections


@router.patch("/{document_id}/sections/{section_id}", response_model=DocumentSectionResponse)
def update_document_section(
    document_id: int,
    section_id: str,
    payload: DocumentSectionUpdate,
    db: Session = Depends(get_db)
):
    section = db.query(DocumentSection).filter(
        DocumentSection.id == section_id,
        DocumentSection.document_id == document_id
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    if payload.included is not None:
        section.included = payload.included
        db.commit()
        db.refresh(section)

        # Rebuild filtered text
        sections = db.query(DocumentSection).filter(DocumentSection.document_id == document_id).all()
        section_dicts = [
            {
                "section_index": s.section_index,
                "content": s.content,
                "included": s.included
            }
            for s in sections
        ]
        filtered_text = rebuild_filtered_from_sections(section_dicts)

        document = db.query(Document).filter(Document.id == document_id).first()
        if document:
            document.filtered_extracted_text = filtered_text
            document.extracted_text = filtered_text or document.raw_extracted_text or document.extracted_text
            if document.content_profile:
                document.content_profile["sections_included"] = len([s for s in sections if s.included])
            db.commit()

    return section


@router.get("/{document_id}/quality", response_model=DocumentQualityResponse)
def get_document_quality(document_id: int, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    profile = document.content_profile or {}
    raw_text = document.raw_extracted_text or document.extracted_text or ""
    filtered_text = document.filtered_extracted_text or document.extracted_text or ""

    raw_word_count = profile.get("raw_word_count")
    filtered_word_count = profile.get("filtered_word_count")
    if raw_word_count is None:
        raw_word_count = len(re.findall(r"\\b[\\w'-]+\\b", raw_text))
    if filtered_word_count is None:
        filtered_word_count = len(re.findall(r"\\b[\\w'-]+\\b", filtered_text))

    sections_total = profile.get("sections_total")
    sections_included = profile.get("sections_included")
    if sections_total is None or sections_included is None:
        sections = db.query(DocumentSection).filter(DocumentSection.document_id == document_id).all()
        sections_total = len(sections)
        sections_included = len([s for s in sections if s.included])

    return DocumentQualityResponse(
        document_id=document_id,
        raw_word_count=raw_word_count or 0,
        filtered_word_count=filtered_word_count or 0,
        dedup_ratio=profile.get("dedup_ratio") or 0.0,
        boilerplate_removed_lines=profile.get("boilerplate_removed_lines") or 0,
        sections_total=sections_total or 0,
        sections_included=sections_included or 0,
        ocr_status=document.ocr_status,
        ocr_provider=document.ocr_provider,
        notes=profile.get("notes")
    )


@router.get("/{document_id}/ingestion", response_model=IngestionJobResponse)
def get_ingestion_job(document_id: int, db: Session = Depends(get_db)):
    job = db.query(IngestionJob).filter(IngestionJob.document_id == document_id).order_by(IngestionJob.created_at.desc()).first()
    if not job:
        raise HTTPException(status_code=404, detail="No ingestion job found")
    return job


@router.get("/{document_id}/download")
async def download_document(document_id: int, db: Session = Depends(get_db)):
    """
    Downloads a document file.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = document.file_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path, filename=document.filename)


@router.put("/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: int,
    document_base: DocumentCreate,
    db: Session = Depends(get_db)
):
    """
    Updates document metadata (title, tags, category, folder).
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    document.title = document_base.title
    document.tags = document_base.tags
    document.category = document_base.category
    document.folder_id = document_base.folder_id
    
    db.commit()
    db.refresh(document)
    return document


@router.put("/{document_id}/move")
def move_document(
    document_id: int,
    folder_id: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db)
):
    """
    Moves a document to a different folder (or unfiles it).
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    document.folder_id = folder_id if (folder_id and folder_id != "") else None
    db.commit()
    return {"message": "Document moved successfully", "folder_id": document.folder_id}


@router.post("/{document_id}/start-session")
def start_reading_session(document_id: int, db: Session = Depends(get_db)):
    """
    Starts a time tracking session for a document.
    """
    doc = TimeTrackingService.start_session(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Session started", "last_opened": doc.last_opened}


@router.post("/{document_id}/end-session")
async def end_reading_session(
    document_id: int,
    request: Request,
    payload: Optional[TimeTrackingRequest] = Body(None),
    db: Session = Depends(get_db)
):
    """
    Ends a time tracking session and updates progress.
    Accepts JSON body or sendBeacon plain text payload.
    """
    seconds_spent = 0
    reading_progress = 0.0

    if payload:
        seconds_spent = payload.seconds_spent
        reading_progress = payload.reading_progress or 0.0
    else:
        try:
            raw = await request.body()
            if raw:
                data = json.loads(raw.decode("utf-8"))
                seconds_spent = int(data.get("seconds_spent", 0))
                reading_progress = float(data.get("reading_progress", 0.0) or 0.0)
        except Exception:
            seconds_spent = 0
            reading_progress = 0.0

    doc = TimeTrackingService.end_session(
        db,
        document_id,
        seconds_spent,
        reading_progress
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return doc


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    remove_graph_links: bool = False,
    db: Session = Depends(get_db),
    document_store: DocumentStore = Depends(get_document_store)
):
    """
    Deletes a document and its associated data across all stores.
    """
    try:
        linked_graphs = db.query(KnowledgeGraphDocument).filter(
            KnowledgeGraphDocument.document_id == document_id
        ).count()
        if linked_graphs and not remove_graph_links:
            raise HTTPException(
                status_code=409,
                detail="Document is linked to a knowledge graph. Choose whether to keep or remove graph links before deleting."
            )
        if linked_graphs and remove_graph_links:
            db.query(KnowledgeGraphDocument).filter(
                KnowledgeGraphDocument.document_id == document_id
            ).delete(synchronize_session=False)
            db.commit()
        # standardizing on document_store for coordinated cleanup
        document_store.delete_document(document_id)
        return {"message": "Document and associated metadata/vectors deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete document {document_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal deletion failure")

@router.post("/{document_id}/synthesize", response_model=DocumentResponse)
async def synthesize_document(
    document_id: int,
    background_tasks: BackgroundTasks,
    resume: bool = True,
    db: Session = Depends(get_db),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    document_store: DocumentStore = Depends(get_document_store),
    user_id: str = Depends(get_request_user_id)
):
    """
    Triggers the Knowledge Graph ingestion (Phase 2) for a document.
    Must be in 'extracted' or 'failed' state to retry.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if not document.extracted_text:
        raise HTTPException(status_code=400, detail="Document has no extracted text. Reprocess extraction first.")

    profile = document.content_profile or {}
    if resume:
        profile["graph_extraction_resume"] = True
    else:
        profile.pop("graph_extraction_checkpoint", None)
        profile["graph_extraction_resume"] = False
    document.content_profile = profile
    db.commit()

    # Queue ingestion
    job = _create_job(db, document_id)
    _update_job(db, job, status="pending", phase="queued", progress=0, message="Queued for ingestion")
    job_id = enqueue_ingestion(document_id, document.file_path, user_id=user_id)
    if not job_id:
        _mark_local_start(
            db=db,
            doc_id=document_id,
            job=job,
            status="ingesting",
            phase="ingesting",
            step="ingesting",
            progress=5,
            message="Running locally"
        )
        background_tasks.add_task(
            _schedule_ingestion_background,
            doc_id=document_id,
            file_path=document.file_path,
            document_processor=document_processor,
            ingestion_engine=ingestion_engine,
            document_store=document_store,
            user_id=user_id
        )
    
    if job_id:
        document.status = "ingesting"
        document.ingestion_step = "queued"
        document.ingestion_progress = 0
    db.commit()
    db.refresh(document)
    
    return document


@router.post("/{document_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Re-triggers text extraction (Phase 1) for a document.
    Useful when extraction failed or returned empty text.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.file_path:
        raise HTTPException(status_code=400, detail="Document has no associated file")
    
    # Determine file type from extension
    from pathlib import Path
    file_ext = Path(document.file_path).suffix.lower()
    if file_ext == '.pdf':
        file_type = FileType.PDF
    elif file_ext in ['.jpg', '.jpeg', '.png']:
        file_type = FileType.IMAGE
    else:
        file_type = FileType.OTHER
    
    # Queue re-extraction
    job = _create_job(db, document_id)
    _update_job(db, job, status="pending", phase="queued", progress=0, message="Queued for extraction")
    job_id = enqueue_extraction(document_id, document.file_path, file_type.value)
    if not job_id:
        _mark_local_start(
            db=db,
            doc_id=document_id,
            job=job,
            status="processing",
            phase="extracting",
            step="extracting",
            progress=5,
            message="Running locally"
        )
        background_tasks.add_task(
            _schedule_extraction_background,
            document_id,
            document.file_path,
            file_type,
            document_processor
        )
    
    if job_id:
        document.status = "processing"
        document.ingestion_step = "queued_extraction"
        document.ingestion_progress = 0
    db.commit()
    db.refresh(document)
    
    return document


# =======================
# Document Recall / Quiz
# =======================

def _default_reveal_config():
    return {
        "total_duration_sec": 30,
        "step_seconds": 5,
        "start_delay_sec": 2,
        "reveal_percent_per_step": 12
    }


def _fallback_generate_items(text: str, count: int):
    # Simple fallback: split into paragraphs, pick short ones
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if len(p.strip()) > 80]
    items = []
    for p in paragraphs[:count]:
        words = p.split()
        masked = []
        for w in words:
            if len(w) > 6 and len(masked) < 3:
                masked.append("[[blank]]")
            else:
                masked.append(w)
        items.append({
            "passage_markdown": p,
            "masked_markdown": " ".join(masked),
            "answer_key": ["Key ideas from passage"],
        })
    return items


@router.get("/{document_id}/study-settings", response_model=DocumentStudySettingsResponse)
def get_document_study_settings(document_id: int, db: Session = Depends(get_db)):
    settings_row = db.query(DocumentStudySettings).filter(
        DocumentStudySettings.document_id == document_id
    ).first()
    if not settings_row:
        return DocumentStudySettingsResponse(
            reveal_config=_default_reveal_config(),
            llm_config=None,
            voice_mode_enabled=False
        )
    llm_cfg = None
    if settings_row.llm_config:
        try:
            llm_cfg = LLMConfig(**settings_row.llm_config)
        except Exception:
            llm_cfg = None
    return DocumentStudySettingsResponse(
        reveal_config=settings_row.reveal_config or _default_reveal_config(),
        llm_config=llm_cfg,
        voice_mode_enabled=settings_row.voice_mode_enabled or False
    )


@router.websocket("/ws")
async def documents_updates(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            db = SessionLocal()
            try:
                docs = db.query(Document).options(
                    defer(Document.extracted_text),
                    defer(Document.raw_extracted_text),
                    defer(Document.filtered_extracted_text)
                ).order_by(Document.upload_date.desc()).all()
                enriched = _attach_ingestion_errors(db, docs)
                payload = {"documents": [d.model_dump() for d in enriched]}
            finally:
                db.close()
            await websocket.send_json(payload)
            await asyncio.sleep(6)
    except WebSocketDisconnect:
        return
    except Exception:
        return


@router.post("/{document_id}/study-settings", response_model=DocumentStudySettingsResponse)
def update_document_study_settings(
    document_id: int,
    payload: DocumentStudySettingsPayload,
    db: Session = Depends(get_db)
):
    settings_row = db.query(DocumentStudySettings).filter(
        DocumentStudySettings.document_id == document_id
    ).first()
    if not settings_row:
        settings_row = DocumentStudySettings(
            id=str(uuid.uuid4()),
            document_id=document_id,
            user_id="default_user"
        )
        db.add(settings_row)

    settings_row.reveal_config = payload.reveal_config or _default_reveal_config()
    settings_row.voice_mode_enabled = payload.voice_mode_enabled or False
    settings_row.llm_config = payload.llm_config.model_dump() if payload.llm_config else settings_row.llm_config
    db.commit()

    llm_cfg = None
    if settings_row.llm_config:
        try:
            llm_cfg = LLMConfig(**settings_row.llm_config)
        except Exception:
            llm_cfg = None
    return DocumentStudySettingsResponse(
        reveal_config=settings_row.reveal_config or _default_reveal_config(),
        llm_config=llm_cfg,
        voice_mode_enabled=settings_row.voice_mode_enabled or False
    )


@router.post("/{document_id}/quiz/generate", response_model=List[DocumentQuizItemResponse])
async def generate_document_quiz_items(
    document_id: int,
    request: DocumentQuizGenerateRequest,
    db: Session = Depends(get_db)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    text = document.extracted_text
    if request.source_mode == "selection":
        if not request.selection_text or not request.selection_text.strip():
            raise HTTPException(status_code=400, detail="Selection text is required for selection mode")
        text = request.selection_text
    if not text:
        raise HTTPException(status_code=400, detail="Document has no extracted text")

    llm_config = request.llm_config
    if not llm_config:
        settings_row = db.query(DocumentStudySettings).filter(
            DocumentStudySettings.document_id == document_id
        ).first()
        if settings_row and settings_row.llm_config:
            try:
                llm_config = LLMConfig(**settings_row.llm_config)
            except Exception:
                llm_config = None

    prompt = CLOZE_GENERATION_PROMPT_TEMPLATE.format(
        count=request.count,
        text=text[:12000]
    )
    prompt += f"\nPassage limit: {request.max_length} characters."

    items = []
    try:
        response = await llm_service.get_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format="json",
            config=llm_config
        )
        data = llm_service._extract_and_parse_json(response)
        if isinstance(data, dict):
            data = data.get("items") or []
        for raw in data:
            passage = raw.get("passage_markdown") or ""
            if request.max_length and len(passage) > request.max_length:
                passage = passage[:request.max_length].rstrip()
            masked = raw.get("masked_markdown") or passage
            answer_key = raw.get("answer_key") or []
            items.append({
                "passage_markdown": passage,
                "masked_markdown": masked,
                "answer_key": answer_key
            })
    except Exception as e:
        logger.warning(f"Quiz generation failed, using fallback: {e}")
        items = _fallback_generate_items(text, request.count)

    saved_items = []
    for item in items[:request.count]:
        quiz_item = DocumentQuizItemORM(
            id=str(uuid.uuid4()),
            document_id=document_id,
            mode=request.mode,
            passage_markdown=item.get("passage_markdown") or "",
            masked_markdown=item.get("masked_markdown"),
            answer_key=item.get("answer_key") or [],
            tags=[],
            difficulty=request.difficulty,
            source_span={"source": request.source_mode, "selection": (request.selection_text[:200] if request.selection_text else None)}
        )
        db.add(quiz_item)
        saved_items.append(quiz_item)

    db.commit()
    return saved_items


@router.post("/{document_id}/quiz/session", response_model=DocumentQuizSessionResponse)
def create_document_quiz_session(
    document_id: int,
    request: DocumentQuizSessionCreate,
    db: Session = Depends(get_db)
):
    item_ids = request.item_ids or []
    if not item_ids:
        items = db.query(DocumentQuizItemORM).filter(
            DocumentQuizItemORM.document_id == document_id,
            DocumentQuizItemORM.mode == request.mode
        ).order_by(DocumentQuizItemORM.created_at.desc()).limit(5).all()
    else:
        items = db.query(DocumentQuizItemORM).filter(DocumentQuizItemORM.id.in_(item_ids)).all()

    if not items:
        raise HTTPException(status_code=400, detail="No quiz items available")

    session = DocumentQuizSession(
        id=str(uuid.uuid4()),
        document_id=document_id,
        mode=request.mode,
        settings=request.settings or _default_reveal_config(),
        status="active"
    )
    db.add(session)
    db.commit()

    return DocumentQuizSessionResponse(
        id=session.id,
        document_id=document_id,
        mode=session.mode,
        settings=session.settings or {},
        status=session.status,
        items=items
    )


@router.get("/{document_id}/quiz/session/{session_id}", response_model=DocumentQuizSessionResponse)
def get_document_quiz_session(
    document_id: int,
    session_id: str,
    db: Session = Depends(get_db)
):
    session = db.query(DocumentQuizSession).filter(
        DocumentQuizSession.id == session_id,
        DocumentQuizSession.document_id == document_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    items = db.query(DocumentQuizItemORM).filter(
        DocumentQuizItemORM.document_id == document_id
    ).order_by(DocumentQuizItemORM.created_at.desc()).limit(10).all()

    return DocumentQuizSessionResponse(
        id=session.id,
        document_id=document_id,
        mode=session.mode,
        settings=session.settings or {},
        status=session.status,
        items=items
    )


@router.post("/{document_id}/quiz/grade", response_model=DocumentQuizGradeResponse)
async def grade_document_quiz_item(
    document_id: int,
    request: DocumentQuizGradeRequest,
    db: Session = Depends(get_db)
):
    item = db.query(DocumentQuizItemORM).filter(DocumentQuizItemORM.id == request.quiz_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Quiz item not found")

    response_text = request.transcript or request.answer_text
    if not response_text:
        raise HTTPException(status_code=400, detail="Response text is required")

    llm_config = request.llm_config
    if not llm_config:
        settings_row = db.query(DocumentStudySettings).filter(
            DocumentStudySettings.document_id == document_id
        ).first()
        if settings_row and settings_row.llm_config:
            try:
                llm_config = LLMConfig(**settings_row.llm_config)
            except Exception:
                llm_config = None

    prompt = RECALL_GRADING_PROMPT_TEMPLATE.format(
        passage=item.passage_markdown,
        answer_key=json.dumps(item.answer_key),
        response=response_text
    )

    score = 0.0
    feedback = ""
    llm_eval = {}

    try:
        response = await llm_service.get_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format="json",
            config=llm_config
        )
        data = llm_service._extract_and_parse_json(response)
        if not isinstance(data, dict):
            raise ValueError("LLM grading response was not a JSON object")
        score = float(data.get("score", 0))
        feedback = data.get("feedback", "")
        llm_eval = data
        ctx = get_opik_context()
        trace = ctx.get_current_trace_data() if ctx else None
        if trace is not None:
            llm_eval["opik_trace_id"] = trace.id
    except Exception as e:
        logger.warning(f"Quiz grading failed, using fallback: {e}")
        # Fallback: simple overlap heuristic
        ref = " ".join(item.answer_key).lower()
        ans = response_text.lower()
        score = 0.3 if any(k in ans for k in ref.split()[:5]) else 0.1
        feedback = "Partial recall detected. Try to include key concepts."
        llm_eval = {"fallback": True}
        ctx = get_opik_context()
        trace = ctx.get_current_trace_data() if ctx else None
        if trace is not None:
            llm_eval["opik_trace_id"] = trace.id

    attempt = DocumentQuizAttempt(
        id=str(uuid.uuid4()),
        session_id=request.session_id,
        quiz_item_id=item.id,
        user_answer=request.answer_text,
        transcript=request.transcript,
        score=score,
        feedback=feedback,
        llm_eval=llm_eval
    )
    db.add(attempt)
    db.commit()

    return DocumentQuizGradeResponse(score=score, feedback=feedback, llm_eval=llm_eval)


@router.get("/{document_id}/quiz/stats", response_model=DocumentQuizStatsResponse)
def get_document_quiz_stats(document_id: int, db: Session = Depends(get_db)):
    from sqlalchemy import func
    base_q = db.query(DocumentQuizAttempt).join(DocumentQuizSession, DocumentQuizAttempt.session_id == DocumentQuizSession.id)
    base_q = base_q.filter(DocumentQuizSession.document_id == document_id)

    total_attempts = base_q.count()
    avg_score = base_q.with_entities(func.avg(DocumentQuizAttempt.score)).scalar() or 0.0
    best_score = base_q.with_entities(func.max(DocumentQuizAttempt.score)).scalar() or 0.0
    last_attempt = base_q.with_entities(func.max(DocumentQuizAttempt.created_at)).scalar()

    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=7)
    recent_q = base_q.filter(DocumentQuizAttempt.created_at >= cutoff)
    attempts_7d = recent_q.count()
    avg_7d = recent_q.with_entities(func.avg(DocumentQuizAttempt.score)).scalar() or 0.0

    return DocumentQuizStatsResponse(
        document_id=document_id,
        total_attempts=total_attempts,
        average_score=float(avg_score),
        best_score=float(best_score),
        last_attempt_at=last_attempt,
        attempts_last_7d=attempts_7d,
        average_score_last_7d=float(avg_7d)
    )
def _normalize_tag_list(tags: Optional[List[str]]) -> List[str]:
    if not tags:
        return []
    return [t.strip() for t in tags if isinstance(t, str) and t.strip()]


def _normalize_tags_str(tags: Optional[str]) -> List[str]:
    if not tags:
        return []
    return [t.strip() for t in tags.split(",") if t.strip()]


def _enqueue_extraction_job(
    db: Session,
    doc_id: int,
    file_path: str,
    file_type: FileType,
    background_tasks: Optional[BackgroundTasks] = None
):
    job = _get_or_create_job(db, doc_id)
    _update_job(db, job, status="pending", phase="queued", progress=0, message="Queued for extraction")
    job_id = enqueue_extraction(doc_id, file_path, file_type.value)
    if not job_id:
        _mark_local_start(
            db=db,
            doc_id=doc_id,
            job=job,
            status="processing",
            phase="extracting",
            step="extracting",
            progress=5,
            message="Running locally"
        )
        if background_tasks is not None:
            background_tasks.add_task(
                _schedule_extraction_background,
                doc_id,
                file_path,
                file_type,
                document_processor
            )
        else:
            schedule_extraction(
                process_extraction_background(
                    doc_id,
                    file_path,
                    file_type,
                    document_processor
                )
            )


async def _process_link_background(
    doc_id: int,
    url: str,
    title: str,
    category: Optional[str],
    folder_id: Optional[str],
    tags: List[str],
    db_session_factory: Callable[[], Session] = SessionLocal
):
    db = db_session_factory()
    try:
        extracted = await run_in_threadpool(extract_web_content, url)
        resolved_title = title or (extracted.get("title") if extracted else None) or "Web Source"
        body = extracted.get("content") if extracted else ""
        if not body or not body.strip():
            body = "(External link content could not be extracted. Consider adding notes manually.)"
        content = f"# {resolved_title}\n\nURL: {url}\n\n{body}\n"

        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc or not doc.file_path:
            return

        with open(doc.file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc.title = resolved_title
        doc.category = category
        doc.folder_id = folder_id
        doc.tags = tags + ["link", "web"]
        doc.file_type = FileType.LINK.value
        doc.status = "processing"
        doc.source_type = "link"
        doc.source_url = url
        db.commit()

        _enqueue_extraction_job(db, doc_id, doc.file_path, FileType.LINK, None)
    except Exception as e:
        logger.error(f"Link background extraction failed for {doc_id}: {e}")
    finally:
        db.close()
