"""Pydantic models for LearnFast Core Engine data structures."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from src.models.enums import FileType, CardType


class PrerequisiteLink(BaseModel):
    """Represents a prerequisite relationship between concepts."""
    
    source_concept: str = Field(..., description="The fundamental concept")
    target_concept: str = Field(..., description="The advanced concept")
    weight: float = Field(..., ge=0.0, le=1.0, description="Dependency strength")
    reasoning: str = Field(..., description="Why source is needed for target")


class GraphSchema(BaseModel):
    """Schema for extracted knowledge graph structure."""
    
    concepts: List[str] = Field(..., description="List of extracted concepts")
    prerequisites: List[PrerequisiteLink] = Field(..., description="Concept dependencies")


class UserState(BaseModel):
    """Represents current user progress and available options."""
    
    user_id: str
    completed_concepts: List[str]
    in_progress_concepts: List[str]
    available_concepts: List[str]


class ConceptNode(BaseModel):
    """Represents a concept node in the knowledge graph."""
    
    name: str = Field(..., description="Unique concept name (lowercase)")
    description: Optional[str] = Field(None, description="Concept description")
    depth_level: Optional[int] = Field(None, description="Depth in prerequisite hierarchy")


class UserNode(BaseModel):
    """Represents a user node in the knowledge graph."""
    
    uid: str = Field(..., description="Unique user identifier")
    name: str = Field(..., description="User display name")


class LearningChunk(BaseModel):
    """Represents a content chunk stored in the vector database."""
    
    id: Optional[int] = Field(None, description="Database ID")
    doc_source: str = Field(..., description="Source filename or URL")
    content: str = Field(..., description="Markdown text chunk")
    concept_tag: str = Field(..., description="Associated concept name")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")


class LearningPath(BaseModel):
    """Represents a resolved learning path with time estimates."""
    
    concepts: List[str] = Field(..., description="Ordered list of concepts to learn")
    estimated_time_minutes: int = Field(..., description="Total estimated learning time")
    target_concept: str = Field(..., description="Final concept to reach")
    pruned: bool = Field(False, description="Whether path was pruned due to time constraints")


class DocumentMetadata(BaseModel):
    """Metadata for an ingested document."""
    
    id: int = Field(..., description="Database ID")
    filename: str = Field(..., description="Original filename")
    upload_date: datetime = Field(..., description="Upload timestamp")
    status: str = Field("pending", description="Processing status")
    file_path: Optional[str] = Field(None, description="Local storage path")


# ========== Precursor / New Feature Schemas ==========


# ========== Document Schemas ==========

class DocumentBase(BaseModel):
    """Base schema for document data."""
    title: Optional[str] = None
    filename: Optional[str] = None
    status: Optional[str] = "pending"
    tags: Optional[List[str]] = []
    category: Optional[str] = None


class DocumentCreate(DocumentBase):
    """Schema for creating a new document."""
    folder_id: Optional[str] = None


class DocumentResponse(DocumentBase):
    """Schema for document API responses."""
    id: int  # Adapted to int match learn-fast-core DB
    file_type: Optional[FileType] = FileType.OTHER
    file_path: Optional[str] = None
    upload_date: datetime
    status: str = "pending"
    extracted_text: Optional[str] = None
    reading_progress: float = 0.0
    folder_id: Optional[str] = None

    # Time tracking fields
    time_spent_reading: int = 0
    last_opened: Optional[datetime] = None
    first_opened: Optional[datetime] = None
    completion_estimate: Optional[int] = None
    page_count: int = 0

    class Config:
        from_attributes = True


# ========== Folder Schemas ==========

class FolderBase(BaseModel):
    """Base schema for folder data."""
    name: str
    color: str = "#8b5cf6"
    icon: str = "folder"


class FolderCreate(FolderBase):
    """Schema for creating a new folder."""
    pass


class FolderUpdate(BaseModel):
    """Schema for updating an existing folder."""
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class FolderResponse(FolderBase):
    """Schema for folder API responses."""
    id: str
    created_at: datetime
    document_count: int = 0

    class Config:
        from_attributes = True


# ========== Tracking Schemas ==========

class TimeTrackingRequest(BaseModel):
    """Request schema for updating document reading time."""
    seconds_spent: int
    reading_progress: Optional[float] = None


# ========== Flashcard Schemas ==========

class FlashcardBase(BaseModel):
    """Base schema for flashcard data."""
    front: str
    back: str
    card_type: CardType = CardType.BASIC
    tags: List[str] = []


class FlashcardCreate(FlashcardBase):
    """Schema for creating a new flashcard."""
    document_id: Optional[int] = None


class FlashcardUpdate(BaseModel):
    """Schema for updating an existing flashcard."""
    front: Optional[str] = None
    back: Optional[str] = None
    tags: Optional[List[str]] = None


class FlashcardResponse(FlashcardBase):
    """Schema for flashcard API responses, including SRS data."""
    id: str
    document_id: Optional[int]
    created_at: datetime
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime
    last_review: Optional[datetime]
    
    class Config:
        from_attributes = True


# ========== Study Schemas ==========

class StudyReviewCreate(BaseModel):
    """Schema for submitting a card review."""
    flashcard_id: str
    rating: int = Field(..., ge=0, le=5)
    time_taken: Optional[int] = None


class StudySessionResponse(BaseModel):
    """Schema for study session statistics."""
    id: str
    start_time: datetime
    end_time: Optional[datetime]
    cards_reviewed: int
    new_cards: int
    review_cards: int
    average_rating: Optional[float]
    
    class Config:
        from_attributes = True


# ========== Analytics Schemas ==========

class ActivityLogResponse(BaseModel):
    """Schema for user activity log entries."""
    id: int
    activity_type: str
    description: str
    timestamp: datetime
    document_id: Optional[int] = None
    extra_data: dict = {}

    class Config:
        from_attributes = True


class AnalyticsOverview(BaseModel):
    """Global statistics and overview data."""
    total_documents: int
    total_flashcards: int
    total_reviews: int
    cards_due_today: int
    study_streak: int
    retention_rate: float
    total_time_spent: int = 0
    avg_completion_time: float = 0
    srs_distribution: dict = {"new": 0, "learning": 0, "mastered": 0}


class StudyStats(BaseModel):
    """Daily study performance statistics."""
    date: str
    cards_reviewed: int
    new_cards: int
    average_rating: float


# ========== Navigation/AI Schemas ==========

class PathRequest(BaseModel):
    """Request for generating a learning path."""
    user_id: str
    target_concept: str
    time_budget_minutes: int = 60
    document_id: Optional[int] = None


class ProgressUpdate(BaseModel):
    """Request for updating concept progress."""
    user_id: str
    concept_name: str