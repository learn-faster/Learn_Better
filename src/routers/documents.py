"""
Documents Router for the Learning Assistant.
Handles document uploads, metadata updates, and time tracking sessions.
Note: This is the 'App' API. Core engine endpoints are also available at /documents.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from pathlib import Path
from datetime import datetime

from src.database.orm import get_db
from src.models.orm import Document
from src.models.enums import FileType
from src.models.schemas import DocumentResponse, DocumentCreate, TimeTrackingRequest
from src.services.time_tracking_service import TimeTrackingService
from src.ingestion.document_processor import DocumentProcessor
from src.ingestion.ingestion_engine import IngestionEngine
from src.storage.document_store import DocumentStore
from src.ingestion.youtube_utils import extract_video_id, fetch_transcript
from src.dependencies import get_ingestion_engine, get_document_store
from src.config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Initialize services
document_processor = DocumentProcessor()

# Ensure upload directory exists for storing documents
os.makedirs(settings.upload_dir, exist_ok=True)


from fastapi import BackgroundTasks
from src.database.orm import SessionLocal

async def process_document_background(
    doc_id: int,
    file_path: str,
    file_type: FileType,
    document_processor: DocumentProcessor,
    ingestion_engine: IngestionEngine,
    document_store: DocumentStore
):
    """Background task for document processing."""
    # Create a fresh database session for this background task
    db = SessionLocal()
    try:
        print(f"DEBUG: Background processing started for {doc_id}...")

        # 1. Extract Text
        extracted_text = ""
        try:
            if file_type == FileType.PDF or os.path.exists(file_path):
                extracted_text = document_processor.convert_to_markdown(file_path)
                print(f"DEBUG: Extraction complete for {doc_id}")

            # Update DB with extracted text
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.extracted_text = extracted_text
                document.page_count = 0 # Placeholder
                db.commit()

        except Exception as e:
            print(f"Extraction failed: {e}")
            import traceback
            traceback.print_exc()
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.status = "failed"
                document.extracted_text = ""
                db.commit()
            return

        # 2. Trigger Full Ingestion
        try:
            if extracted_text:
                print(f"DEBUG: Triggering IngestionEngine for document {doc_id}...")
                chunks = document_processor.chunk_content(extracted_text)
                await ingestion_engine.process_document_complete(
                    doc_source=os.path.basename(file_path),
                    markdown=extracted_text,
                    content_chunks=chunks,
                    document_id=doc_id
                )
                print("DEBUG: IngestionEngine processing complete.")

                # Update status to completed
                # Re-fetch is good practice in long running tasks
                document = db.query(Document).filter(Document.id == doc_id).first()
                if document:
                    document.status = "completed"
                    document_store.update_status(doc_id, "completed")
                    db.commit()
                    print(f"DEBUG: Document {doc_id} marked as completed.")
            else:
                # No content extracted, mark as failed
                document = db.query(Document).filter(Document.id == doc_id).first()
                if document:
                    document.status = "failed"
                    db.commit()
        except Exception as e:
            print(f"ERROR: IngestionEngine failed: {e}")
            import traceback
            traceback.print_exc()
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.status = "failed"
                db.commit()

    except Exception as e:
        print(f"Background process critical failure: {e}")
        import traceback
        traceback.print_exc()
        # Attempt to mark document as failed
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document:
                document.status = "failed"
                db.commit()
        except Exception as cleanup_error:
            print(f"Failed to update status during cleanup: {cleanup_error}")
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
        
        # 3. Queue Background Processing
        background_tasks.add_task(
            process_document_background,
            doc_id,
            file_path,
            file_type,
            document_processor,
            ingestion_engine,
            document_store
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


@router.get("/", response_model=List[DocumentResponse])
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
    folder_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Moves a document to a different folder (or unfiles it).
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    document.folder_id = folder_id if folder_id != "" else None
    db.commit()
    return {"message": "Document moved successfully"}


@router.post("/{document_id}/session/start")
def start_reading_session(document_id: int, db: Session = Depends(get_db)):
    """
    Starts a time tracking session for a document.
    """
    doc = TimeTrackingService.start_session(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Session started", "last_opened": doc.last_opened}


@router.post("/{document_id}/session/end")
def end_reading_session(
    document_id: int,
    request: TimeTrackingRequest,
    db: Session = Depends(get_db)
):
    """
    Ends a time tracking session and updates progress.
    """
    doc = TimeTrackingService.end_session(
        db, 
        document_id, 
        request.seconds_spent, 
        request.reading_progress or 0.0
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
