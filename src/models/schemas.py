"""Pydantic models for LearnFast Core Engine data structures."""

from datetime import datetime
from typing import List, Optional, Dict, Any, Union

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
    concept_mappings: Dict[str, List[int]] = Field({}, description="Mapping of concept name to list of chunk indices (0-based within the processed context)")


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
    
    # Advanced Metrics
    reading_time_min: Optional[int] = None
    reading_time_max: Optional[int] = None
    reading_time_median: Optional[int] = None
    word_count: int = 0
    difficulty_score: Optional[float] = None
    language: Optional[str] = None
    scanned_prob: float = 0.0

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


class StudySessionCreate(BaseModel):
    """Schema for creating a new study session with a goal."""
    goal: Optional[str] = None
    study_type: str = "deep" # deep, practice
    document_id: Optional[int] = None

class StudySessionEnd(BaseModel):
    """Schema for ending a study session with reflection."""
    reflection: Optional[str] = None
    effectiveness_rating: Optional[int] = Field(None, ge=1, le=5)

class StudySessionResponse(BaseModel):
    """Schema for study session statistics."""
    id: str
    start_time: datetime
    end_time: Optional[datetime]
    cards_reviewed: int
    new_cards: int
    review_cards: int
    average_rating: Optional[float]
    goal: Optional[str]
    study_type: str
    reflection: Optional[str]
    effectiveness_rating: Optional[int]
    
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



# ========== Curriculum Schemas ==========

class CurriculumModuleBase(BaseModel):
    title: str
    description: Optional[str] = None
    module_type: str = "primer"
    order: int = 0
    estimated_time: Optional[str] = None


class CurriculumModuleResponse(CurriculumModuleBase):
    id: str
    is_completed: bool
    content: Optional[Any] = None

    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CurriculumBase(BaseModel):
    title: str
    description: Optional[str] = None
    target_concept: Optional[str] = None


class CurriculumCreate(CurriculumBase):
    document_id: Optional[int] = None
    user_id: str = "default_user"


class CurriculumResponse(CurriculumBase):
    id: str
    user_id: str
    document_id: Optional[int] = None
    goal_id: Optional[str] = None
    status: str
    progress: float
    created_at: datetime
    updated_at: datetime
    modules: List[CurriculumModuleResponse] = []

    class Config:
        from_attributes = True


# ========== Goal Schemas ==========

class GoalBase(BaseModel):
    """Base schema for goal data."""
    title: str
    description: Optional[str] = None
    domain: str = "learning"  # learning, health, career, project
    target_hours: float = 100.0
    deadline: Optional[datetime] = None
    priority: int = 1  # 1=high, 2=medium, 3=low
    email_reminders: bool = True
    reminder_frequency: str = "daily"  # daily, weekly, none


class GoalCreate(GoalBase):
    """Schema for creating a new goal."""
    pass


class GoalUpdate(BaseModel):
    """Schema for updating a goal."""
    title: Optional[str] = None
    description: Optional[str] = None
    domain: Optional[str] = None
    target_hours: Optional[float] = None
    deadline: Optional[datetime] = None
    priority: Optional[int] = None
    status: Optional[str] = None
    email_reminders: Optional[bool] = None
    reminder_frequency: Optional[str] = None


class GoalResponse(GoalBase):
    """Schema for goal API responses."""
    id: str
    user_id: str
    logged_hours: float = 0.0
    status: str = "active"
    created_at: datetime
    updated_at: datetime
    
    # Computed fields (set by API)
    progress_percent: Optional[float] = 0.0
    days_remaining: Optional[int] = None
    is_on_track: Optional[bool] = True

    class Config:
        from_attributes = True


# ========== Focus Session Schemas ==========

class FocusSessionCreate(BaseModel):
    """Schema for starting a focus session."""
    goal_id: Optional[str] = None
    session_type: str = "focus"


class FocusSessionEnd(BaseModel):
    """Schema for ending a focus session."""
    duration_minutes: int
    notes: Optional[str] = None


class FocusSessionResponse(BaseModel):
    """Schema for focus session responses."""
    id: str
    goal_id: Optional[str] = None
    user_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_minutes: int
    session_type: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True
