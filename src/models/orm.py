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
    
    # Advanced Reading Metrics
    reading_time_min = Column(Integer, nullable=True) # Minutes (range low)
    reading_time_max = Column(Integer, nullable=True) # Minutes (range high)
    reading_time_median = Column(Integer, nullable=True) # Minutes
    word_count = Column(Integer, default=0)
    difficulty_score = Column(Float, nullable=True) # Flesch-Kincaid
    language = Column(String, nullable=True) # e.g. 'en'
    scanned_prob = Column(Float, default=0.0) # Probability of being a scanned doc

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
    
    # New focus session fields
    goal = Column(Text, nullable=True)
    study_type = Column(String, default="deep") # deep, practice
    reflection = Column(Text, nullable=True)
    effectiveness_rating = Column(Integer, nullable=True) # 1-5
    
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


class UserSettings(Base):
    """
    User-specific settings for learning calibration.
    These settings directly impact SRS scheduling and focus timers.
    """
    __tablename__ = "user_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True, default="default_user")
    
    # Email for notifications
    email = Column(String, nullable=True)
    resend_api_key = Column(String, nullable=True) # User-provided API key
    
    # Streak tracking
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_activity_date = Column(DateTime, nullable=True)
    
    # SRS Settings
    target_retention = Column(Float, default=0.9)  # 0.7 - 0.97
    daily_new_limit = Column(Integer, default=20)  # Max new cards per day
    
    # Focus Timer Settings (Pomodoro)
    focus_duration = Column(Integer, default=25)   # Minutes
    break_duration = Column(Integer, default=5)    # Minutes
    
    # Notification preferences
    email_daily_reminder = Column(Boolean, default=True)
    email_streak_alert = Column(Boolean, default=True)
    email_weekly_digest = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Curriculum(Base):
    """
    A persistent learning path/curriculum for a specific goal.
    """
    __tablename__ = "curriculums"
    
    id = Column(String, primary_key=True, index=True) # UUID
    user_id = Column(String, index=True, default="default_user")
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    goal_id = Column(String, ForeignKey("goals.id"), nullable=True)
    
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    target_concept = Column(String, nullable=True)
    
    status = Column(String, default="active") # active, completed, archvied
    progress = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    modules = relationship("CurriculumModule", back_populates="curriculum", cascade="all, delete-orphan")
    document = relationship("Document")
    goal = relationship("Goal", back_populates="curriculums")


class CurriculumModule(Base):
    """
    An individual stage/step within a curriculum.
    """
    __tablename__ = "curriculum_modules"
    
    id = Column(String, primary_key=True, index=True) # UUID
    curriculum_id = Column(String, ForeignKey("curriculums.id"))
    
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    module_type = Column(String, default="primer") # primer, reading, practice, srs
    
    order = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    
    # Content can be a long markdown string or structured JSON (quiz etc)
    content = Column(JSON, nullable=True)
    estimated_time = Column(String, nullable=True) # e.g. "15 mins"
    
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    curriculum = relationship("Curriculum", back_populates="modules")


class Goal(Base):
    """
    A user's learning or life goal with tracking.
    Goals are the central organizing principle of the app.
    """
    __tablename__ = "goals"
    
    id = Column(String, primary_key=True, index=True)  # UUID
    user_id = Column(String, index=True, default="default_user")
    
    title = Column(String, nullable=False)  # "Learn Machine Learning"
    description = Column(Text, nullable=True)
    domain = Column(String, default="learning")  # learning, health, career, project
    
    # Time targets
    target_hours = Column(Float, default=100.0)  # Total hours to complete
    logged_hours = Column(Float, default=0.0)  # Hours logged so far
    
    # Deadline & Priority
    deadline = Column(DateTime, nullable=True)
    priority = Column(Integer, default=1)  # 1=high, 2=medium, 3=low
    
    # Status
    status = Column(String, default="active")  # active, paused, completed, archived
    
    # Agent settings
    email_reminders = Column(Boolean, default=True)
    reminder_frequency = Column(String, default="daily")  # daily, weekly, none
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    focus_sessions = relationship("FocusSession", back_populates="goal", cascade="all, delete-orphan")
    curriculums = relationship("Curriculum", back_populates="goal")


class FocusSession(Base):
    """
    A timed focus session attributed to a goal.
    """
    __tablename__ = "focus_sessions"
    
    id = Column(String, primary_key=True, index=True)  # UUID
    goal_id = Column(String, ForeignKey("goals.id"), nullable=True)
    user_id = Column(String, index=True, default="default_user")
    
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, default=0)
    
    session_type = Column(String, default="focus")  # focus, break
    notes = Column(Text, nullable=True)
    
    # Relationships
    goal = relationship("Goal", back_populates="focus_sessions")
