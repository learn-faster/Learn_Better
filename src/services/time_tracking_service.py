"""
Time Tracking Service for document engagement.
Handles session management, updates reading progress, and calculates 
estimated time to complete documents.
"""
from datetime import datetime
from src.utils.time import utcnow
from typing import Optional
from sqlalchemy.orm import Session
from src.models.orm import Document

class TimeTrackingService:
    """
    Service for tracking time spent on documents and calculating reading metrics.
    Provides logic for session start/end and progress-based estimations.
    """
    
    @staticmethod
    def start_session(db: Session, document_id: int) -> Optional[Document]:
        """
        Starts a new reading session for a document.
        Updates the 'last_opened' and 'first_opened' (if first time) timestamps.
        
        Args:
            db (Session): Database session.
            document_id (int): ID of the document being opened.
            
        Returns:
            Document, optional: The updated document object, or None if not found.
        """
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return None
        
        now = utcnow()
        if not document.first_opened:
            document.first_opened = now
        
        document.last_opened = now
        db.commit()
        db.refresh(document)
        return document

    @staticmethod
    def end_session(db: Session, document_id: int, seconds_spent: int, current_progress: float) -> Optional[Document]:
        """
        Ends a reading session and updates engagement metrics.
        Calculates a new completion estimate based on historical reading speed.
        
        Args:
            db (Session): Database session.
            document_id (int): ID of the document being closed.
            seconds_spent (int): Duration of the session in seconds.
            current_progress (float): Current reading progress as a fraction (0.0 to 1.0).
            
        Returns:
            Document, optional: The updated document object, or None if not found.
        """
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return None
        
        # Update total time spent
        document.time_spent_reading = (document.time_spent_reading or 0) + seconds_spent
        
        # Update progress if provided
        if current_progress > document.reading_progress:
            document.reading_progress = current_progress
            
        # Calculate/Update completion estimate
        if document.reading_progress > 0 and document.reading_progress < 1.0:
            # Simple linear extrapolation: (total_time / progress) - total_time
            total_estimated_time = document.time_spent_reading / document.reading_progress
            remaining_time = total_estimated_time - document.time_spent_reading
            document.completion_estimate = int(remaining_time)
        elif document.reading_progress < 1.0 and (document.page_count or 0) > 0:
            # Baseline: 2 minutes (120s) per page if no progress yet
            # Subtract any time already spent
            estimated_total = (document.page_count or 0) * 120
            remaining_time = max(0, estimated_total - (document.time_spent_reading or 0))
            document.completion_estimate = int(remaining_time)
        elif document.reading_progress >= 1.0:
            document.completion_estimate = 0
            
        db.commit()
        db.refresh(document)
        return document

    @staticmethod
    def get_average_completion_time(db: Session, category: Optional[str] = None) -> float:
        """
        Calculates the average time taken to complete documents in a specific category.
        Only considers documents that have reached 100% progress.
        
        Args:
            db (Session): Database session.
            category (str, optional): Filter by category.
            
        Returns:
            float: Average completion time in seconds, or 0 if no documents match.
        """
        query = db.query(Document).filter(Document.reading_progress >= 1.0)
        if category:
            query = query.filter(Document.category == category)
            
        completed_docs = query.all()
        if not completed_docs:
            return 0
            
        total_time = sum((doc.time_spent_reading or 0) for doc in completed_docs)
        return total_time / len(completed_docs)
