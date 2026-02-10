"""
Shared Document Service for managing document-related business logic.
"""
import os
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from src.models.orm import Document
from src.ingestion.document_processor import DocumentProcessor
from src.config import settings
from src.utils.logger import logger


class DocumentService:
    """
    Centralized service for document operations across routers.
    """
    
    def __init__(self, processor: Optional[DocumentProcessor] = None):
        self.processor = processor or DocumentProcessor()

    async def get_extracted_text(self, db: Session, doc_id: int, auto_process: bool = True) -> Tuple[Optional[str], bool]:
        """
        Retrieves extracted text for a document. 
        If text is missing and auto_process is True, attempts to extract it from the file.
        
        Args:
            db: Database session
            doc_id: Document ID
            auto_process: Whether to attempt extraction if text is missing
            
        Returns:
            Tuple of (extracted text or None, did_update flag)
        """
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document:
            logger.warning(f"Document {doc_id} not found in database.")
            return None, False
        
        # Return existing text if available
        # Check filtered text first as it's the highest quality (post-OCR/cleaning)
        text = document.filtered_extracted_text or document.extracted_text or document.raw_extracted_text
        if text:
            return text, False
            
        if not auto_process:
            return None, False
            
        file_path = document.file_path
        if not file_path:
            logger.warning(f"Document {doc_id} has no associated file path.")
            return None, False
            
        # Robust path resolution
        resolved_path = file_path
        if not os.path.exists(resolved_path):
            alt_path = os.path.join(settings.upload_dir, os.path.basename(file_path))
            if os.path.exists(alt_path):
                resolved_path = alt_path
                logger.debug(f"Resolved alternative path for document {doc_id}: {resolved_path}")
            else:
                logger.error(f"Document file not found: {file_path}")
                return None, False
                
        try:
            logger.info(f"Auto-processing extraction for document {doc_id}...")
            # DocumentProcessor conversion is sync, so offload to threadpool
            text, _ = await run_in_threadpool(self.processor.convert_to_markdown, resolved_path)
            
            if text:
                document.extracted_text = text
                return text, True
            else:
                logger.warning(f"Extraction returned empty text for document {doc_id}")
        except Exception as e:
            logger.error(f"Background extraction failed for document {doc_id}: {str(e)}")
            
        return None, False


# Global singleton
document_service = DocumentService()
