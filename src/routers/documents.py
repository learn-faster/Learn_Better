"""
Documents Router for the Learning Assistant.
Handles document uploads, metadata updates, and time tracking sessions.
Note: This is the 'App' API. Core engine endpoints are also available at /documents.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Body, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Callable
import os
import shutil
import logging
import uuid
import json
import re
from src.utils.logger import logger
from pathlib import Path
from datetime import datetime

from src.database.orm import get_db
from src.models.orm import Document, UserSettings, DocumentQuizItem as DocumentQuizItemORM, DocumentQuizSession, DocumentQuizAttempt, DocumentStudySettings
from src.models.enums import FileType
from src.models.schemas import DocumentResponse, DocumentCreate, TimeTrackingRequest, DocumentLinkCreate, DocumentQuizGenerateRequest, DocumentQuizSessionCreate, DocumentQuizSessionResponse, DocumentQuizGradeRequest, DocumentQuizGradeResponse, DocumentStudySettingsPayload, DocumentStudySettingsResponse, DocumentQuizStatsResponse, DocumentQuizItem as DocumentQuizItemResponse, LLMConfig
from src.services.time_tracking_service import TimeTrackingService
from src.ingestion.document_processor import DocumentProcessor
from src.ingestion.ingestion_engine import IngestionEngine
from src.storage.document_store import DocumentStore
from src.ingestion.youtube_utils import extract_video_id, fetch_transcript
from src.dependencies import get_ingestion_engine, get_document_store
from src.config import settings
from src.services.reading_time import reading_time_estimator
from src.services.open_notebook_sync import sync_document_to_notebook
from src.services.llm_service import llm_service
from src.services.prompts import CLOZE_GENERATION_PROMPT_TEMPLATE, RECALL_GRADING_PROMPT_TEMPLATE

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Initialize services
document_processor = DocumentProcessor()

# Ensure upload directory exists for storing documents
os.makedirs(settings.upload_dir, exist_ok=True)


from fastapi import BackgroundTasks
from src.database.orm import SessionLocal

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
    db = db_session_factory()
    try:
        logger.debug(f"Extraction started for {doc_id}")
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document:
            return

        document.status = "processing"
        document.ingestion_step = "extracting"
        document.ingestion_progress = 10
        db.commit()

        # 1. Extract Text
        extracted_text = ""
        try:
            if file_type == FileType.PDF or os.path.exists(file_path):
                extracted_text, _ = document_processor.convert_to_markdown(file_path)
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.status = "failed"
                document.extracted_text = f"Extraction Failed: {str(e)}"
                db.commit()
            return

        # 2. Update DB
        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.extracted_text = extracted_text if extracted_text else ""
            document.page_count = 0 
            
            # Analyze reading time
            analysis = reading_time_estimator.analyze_document(file_path)
            document.reading_time_min = analysis.get("reading_time_min")
            document.reading_time_max = analysis.get("reading_time_max")
            document.reading_time_median = analysis.get("reading_time_median")
            document.word_count = analysis.get("word_count")
            document.difficulty_score = analysis.get("difficulty_score")
            document.language = analysis.get("language")
            document.scanned_prob = analysis.get("scanned_prob")
            
            # Mark as extracted (Ready for reading, but graph pending)
            document.status = "extracted" 
            document.ingestion_step = "ready_for_synthesis"
            document.ingestion_progress = 100
            db.commit()
            
            print(f"DEBUG: Extraction complete for {doc_id}")

            # Sync to Open Notebook
            try:
                await sync_document_to_notebook(
                    doc_id, 
                    document.title, 
                    extracted_text, 
                    file_path, 
                    str(file_type) if file_type else "text"
                )
            except Exception as e:
                print(f"ERROR: Sync to Open Notebook failed: {e}")

    except Exception as e:
        print(f"Critical Failure in Extraction: {e}")
        import traceback
        traceback.print_exc()
        try:
             document = db.query(Document).filter(Document.id == doc_id).first()
             if document:
                 document.status = "failed"
                 db.commit()
        except:
            pass
    finally:
        db.close()

async def process_ingestion_background(
    doc_id: int,
    file_path: str, # passed for filename ref
    document_processor: DocumentProcessor,
    ingestion_engine: IngestionEngine,
    document_store: DocumentStore,
    db_session_factory: Callable[[], Session] = SessionLocal
):
    """
    Background task for Phase 2: Knowledge Graph Ingestion.
    Slow, builds the graph incrementally.
    """
    db = db_session_factory()
    try:
        print(f"DEBUG: Ingestion started for {doc_id}")
        
        # 1. Load Document State
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document or not document.extracted_text:
            print(f"ERROR: Cannot ingest document {doc_id} - text missing.")
            return

        document.status = "ingesting" # New status for UI
        document.ingestion_step = "initializing"
        document.ingestion_progress = 0
        db.commit()

        # Callback for real-time updates
        def on_progress(step: str, progress: int):
            # We need a fresh session or careful management if async? 
            # SQLAlchemy sessions are not thread-safe but this is a single async task?
            # actually usually better to create short-lived sessions or reuse `db` carefully.
            # `db` is open for this task.
            try:
                # We need to refresh/merge?
                # Simple update statement might be safer to avoid stale object issues
                db.query(Document).filter(Document.id == doc_id).update({
                    "ingestion_step": step,
                    "ingestion_progress": progress
                })
                db.commit()
            except Exception as e:
                print(f"Progress update failed: {e}")
                db.rollback()

        # 2. Chunk Content
        chunks = document_processor.chunk_content(document.extracted_text)
        
        # 3. Run Ingestion (With Callbacks)
        await ingestion_engine.process_document_complete(
            doc_source=os.path.basename(file_path) if file_path else f"doc_{doc_id}",
            markdown=document.extracted_text,
            content_chunks=chunks,
            document_id=doc_id,
            on_progress=on_progress
        )

        # 4. Finalize
        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.status = "completed"
            document.ingestion_step = "complete"
            document.ingestion_progress = 100
            document_store.update_status(doc_id, "completed")
            db.commit()
            print(f"DEBUG: Ingestion complete for {doc_id}")

    except Exception as e:
        print(f"ERROR: Ingestion failed: {e}")
        import traceback
        traceback.print_exc()
        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.status = "failed" # Or back to 'extracted'?
            document.ingestion_step = f"Failed: {str(e)}"
            db.commit()
    finally:
        db.close()



@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    tags: Optional[str] = Form(""),
    category: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
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
        document.tags = tags.split(",") if tags else []
        document.category = category
        document.folder_id = folder_id
        document.file_type = file_type.value # Store string value
        document.status = "processing"
        
        db.commit()
        db.refresh(document)
        
        # 3. Queue Background Processing (Phase 1: Extraction Only)
        background_tasks.add_task(
            process_extraction_background,
            doc_id,
            file_path,
            file_type,
            document_processor
        )
        
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
        transcript = fetch_transcript(video_id)
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
            db.commit()

        # 3. Process document (extract graph and vectors)
        # We can pass the file path created by document_store
        await ingestion_engine.process_document(doc_metadata.file_path, document_id=doc_metadata.id)
        
        # 4. Update status (if document_store supports it)
        document_store.update_status(doc_metadata.id, "completed")
        
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
            transcript = fetch_transcript(video_id)
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
                     doc.tags = (link_data.tags or []) + ["youtube", "video"]
                     doc.file_type = FileType.VIDEO
                     doc.status = "processing"
                     db.commit()
                     
                 # Trigger processing
                 await ingestion_engine.process_document(doc_metadata.file_path, document_id=doc_metadata.id)
                 
                 # Finalize
                 document_store.update_status(doc_metadata.id, "completed")
                 db.refresh(doc)
                 return doc
        except Exception as e:
            print(f"YouTube processing failed, falling back to basic link: {e}")
            
    # Generic Link Handling
    try:
        content = f"# {link_data.title}\n\nURL: {link_data.url}\n\n(External Link)\n\n## Notes\n"
        # Use timestamp in filename
        ts = int(datetime.utcnow().timestamp())
        filename = f"link_{ts}.md"
        
        doc_metadata = document_store.save_text_document(filename, content, link_data.title)
        
        doc = db.query(Document).filter(Document.id == doc_metadata.id).first()
        if doc:
            doc.category = link_data.category
            doc.folder_id = link_data.folder_id
            doc.tags = (link_data.tags or []) + ["link"]
            doc.file_type = FileType.LINK
            doc.status = "processing"
            db.commit()
            
        # Trigger processing (Extract/Vectorize the placeholder content)
        await ingestion_engine.process_document(doc_metadata.file_path, document_id=doc_metadata.id)
        
        document_store.update_status(doc_metadata.id, "completed")
        db.refresh(doc)
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
    query = db.query(Document)
    
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
    return documents


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(document_id: int, db: Session = Depends(get_db)):
    """
    Retrieves a specific document's metadata.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


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
    db: Session = Depends(get_db),
    document_store: DocumentStore = Depends(get_document_store)
):
    """
    Deletes a document and its associated data across all stores.
    """
    try:
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
    db: Session = Depends(get_db),
    ingestion_engine: IngestionEngine = Depends(get_ingestion_engine),
    document_store: DocumentStore = Depends(get_document_store)
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

    # Queue ingestion
    background_tasks.add_task(
        process_ingestion_background,
        doc_id=document_id,
        file_path=document.file_path,
        document_processor=document_processor,
        ingestion_engine=ingestion_engine,
        document_store=document_store
    )
    
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
    background_tasks.add_task(
        process_extraction_background,
        document_id,
        document.file_path,
        file_type,
        document_processor
    )
    
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
        data = json.loads(response)
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
        data = json.loads(response)
        score = float(data.get("score", 0))
        feedback = data.get("feedback", "")
        llm_eval = data
    except Exception as e:
        logger.warning(f"Quiz grading failed, using fallback: {e}")
        # Fallback: simple overlap heuristic
        ref = " ".join(item.answer_key).lower()
        ans = response_text.lower()
        score = 0.3 if any(k in ans for k in ref.split()[:5]) else 0.1
        feedback = "Partial recall detected. Try to include key concepts."
        llm_eval = {"fallback": True}

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
