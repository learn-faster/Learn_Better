"""
SQLAlchemy Models for LearnFast Core.
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float, Boolean, JSON, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.database.orm import Base

class Folder(Base):
    __tablename__ = "folders"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#3498db")
    icon = Column(String, default="folder")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    documents = relationship("Document", back_populates="folder")

class Document(Base):
    __tablename__ = "documents"
    
    # Existing columns (from init.sql / DocumentStore)
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    upload_date = Column(DateTime)
    status = Column(String, default="pending")
    file_path = Column(String)
    
    # New columns (from precursor)
    title = Column(String)  # Can be same as filename initially
    file_type = Column(String) # 'pdf', 'image', 'other'
    tags = Column(JSON, default=list) # Store as JSON array
    category = Column(String, nullable=True)
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True)
    
    extracted_text = Column(Text, nullable=True)
    page_count = Column(Integer, default=0)
    
    # Time tracking
    time_spent_reading = Column(Integer, default=0) # Seconds
    last_opened = Column(DateTime, nullable=True)
    first_opened = Column(DateTime, nullable=True)
    completion_estimate = Column(Integer, nullable=True) # Estimated seconds
    reading_progress = Column(Float, default=0.0) # 0.0 to 1.0

    # Relationships
    folder = relationship("Folder", back_populates="documents")
    flashcards = relationship("Flashcard", back_populates="document", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="document")

class Flashcard(Base):
    __tablename__ = "flashcards"
    
    id = Column(String, primary_key=True, index=True) # UUID
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    card_type = Column(String, default="basic") # basic, cloze
    tags = Column(JSON, default=list)
    
    # SRS Parameters (SM-2 Algorithm)
    repetitions = Column(Integer, default=0)
    interval = Column(Integer, default=0) # Days
    ease_factor = Column(Float, default=2.5)
    
    next_review = Column(DateTime, default=datetime.utcnow)
    last_review = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    document = relationship("Document", back_populates="flashcards")
    reviews = relationship("StudyReview", back_populates="flashcard")

class StudySession(Base):
    __tablename__ = "study_sessions"
    
    id = Column(String, primary_key=True, index=True) # UUID
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    
    cards_reviewed = Column(Integer, default=0)
    correct_count = Column(Integer, default=0) # Not strictly used in simple logic, but good metadata
    new_cards = Column(Integer, default=0)
    review_cards = Column(Integer, default=0)
    average_rating = Column(Float, default=0.0)
    
    # Relationships
    reviews = relationship("StudyReview", back_populates="session", cascade="all, delete-orphan")

class StudyReview(Base):
    __tablename__ = "study_reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("study_sessions.id"))
    flashcard_id = Column(String, ForeignKey("flashcards.id"))
    
    rating = Column(Integer) # 0-5
    time_taken = Column(Integer, default=0) # Seconds to answer
    reviewed_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    session = relationship("StudySession", back_populates="reviews")
    flashcard = relationship("Flashcard", back_populates="reviews")

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    activity_type = Column(String, index=True) # view_document, create_flashcard, etc.
    description = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    extra_data = Column(JSON, default=dict)
    
    # Relationships
    document = relationship("Document", back_populates="activity_logs")
