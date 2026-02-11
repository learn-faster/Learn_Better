"""Pydantic models for LearnFast Core Engine data structures."""

from datetime import datetime, date
from src.utils.time import utcnow
from typing import List, Optional, Dict, Any, Union

from pydantic import BaseModel, Field, ConfigDict

from src.models.enums import FileType, CardType


class PrerequisiteLink(BaseModel):
    """Represents a prerequisite relationship between concepts."""
    
    # Scoped IDs for document-specific relationships
    source_concept: str = Field(..., description="The fundamental concept (scoped ID)")
    target_concept: str = Field(..., description="The advanced concept (scoped ID)")
    source_doc_id: Optional[int] = Field(None, description="Document ID for source concept")
    target_doc_id: Optional[int] = Field(None, description="Document ID for target concept")
    
    weight: float = Field(..., ge=0.0, le=1.0, description="Dependency strength")
    reasoning: str = Field(..., description="Why source is needed for target")


class GraphSchema(BaseModel):
    """Schema for extracted knowledge graph structure."""
    
    concepts: List[str] = Field(..., description="List of extracted concepts")
    prerequisites: List[PrerequisiteLink] = Field(..., description="Concept dependencies")
    concept_mappings: Dict[str, List[int]] = Field({}, description="Mapping of concept name to list of chunk indices (0-based within the processed context)")
    document_id: Optional[int] = Field(None, description="Document ID for scoping")


class DocumentScopedConcept(BaseModel):
    """Represents a concept scoped to a specific document."""
    
    scoped_id: str = Field(..., description="Unique scoped ID: doc{_id}_{concept_name}")
    document_id: int = Field(..., description="Parent document ID")
    global_name: str = Field(..., description="Human-readable concept name (original case)")
    normalized_name: str = Field(..., description="Normalized name for searching")
    description: Optional[str] = Field(None, description="Concept description")
    depth_level: Optional[int] = Field(None, description="Depth in prerequisite hierarchy")
    chunk_ids: List[int] = Field(default_factory=list, description="Chunk indices where concept appears")
    is_merged: bool = Field(False, description="Whether this concept is merged with others")
    merged_with: Optional[Dict[str, str]] = Field(None, description="Mapping of doc_id -> scoped_id for merged concepts")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CrossDocumentConcept(BaseModel):
    """Represents a concept that spans multiple documents."""
    
    global_id: str = Field(..., description="Global concept identifier")
    global_name: str = Field(..., description="Canonical concept name")
    document_scoped_ids: List[str] = Field(..., description="All scoped IDs from different documents")
    similarity_score: float = Field(..., ge=0.0, le=1.0, description="Similarity between occurrences")
    merged: bool = Field(False, description="Whether documents agree this is the same concept")


class DocumentGraph(BaseModel):
    """Represents a document's complete knowledge graph."""
    
    document_id: int
    document_name: str
    concepts: List[DocumentScopedConcept]
    relationships: List[PrerequisiteLink]
    global_connections: List[CrossDocumentConcept] = Field(default_factory=list, description="Concepts that connect to other documents")
    node_count: int
    relationship_count: int


class GlobalConceptIndex(BaseModel):
    """Global semantic index for cross-document concept discovery."""
    
    global_id: str = Field(..., description="Global concept identifier")
    global_name: str = Field(..., description="Canonical name")
    document_ids: List[int] = Field(..., description="All documents containing this concept")
    occurrence_count: int
    avg_depth: float
    embeddings: Optional[List[float]] = Field(None, description="Semantic embedding for similarity")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


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
    ai_summary: Optional[str] = None
    ingestion_step: Optional[str] = "pending"
    ingestion_progress: float = 0.0


class DocumentCreate(DocumentBase):
    """Schema for creating a new document."""
    folder_id: Optional[str] = None


class DocumentLinkCreate(BaseModel):
    """Schema for adding an external link."""
    url: str
    title: str
    category: Optional[str] = None
    folder_id: Optional[str] = None
    tags: List[str] = []
    auto_ingest: Optional[bool] = False


class DocumentResponse(DocumentBase):
    """Schema for document API responses."""
    id: int  # Adapted to int match learn-fast-core DB
    file_type: Optional[FileType] = FileType.OTHER
    display_type: Optional[str] = None
    file_path: Optional[str] = None
    upload_date: datetime
    status: str = "pending"
    extracted_text: Optional[str] = None
    raw_extracted_text: Optional[str] = None
    filtered_extracted_text: Optional[str] = None
    ai_summary: Optional[str] = None
    reading_progress: float = 0.0
    folder_id: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None
    content_profile: Optional[Dict[str, Any]] = None
    ocr_status: Optional[str] = None
    ocr_provider: Optional[str] = None

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
    ingestion_error: Optional[str] = None
    linked_to_graph: bool = False
    graph_link_count: int = 0
    ingestion_job_status: Optional[str] = None
    ingestion_job_phase: Optional[str] = None
    ingestion_job_message: Optional[str] = None
    ingestion_job_updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# ========== Tracking Schemas ==========

class TimeTrackingRequest(BaseModel):
    """Request schema for updating document reading time."""
    seconds_spent: int
    reading_progress: Optional[float] = None


class DocumentSectionResponse(BaseModel):
    id: str
    document_id: int
    section_index: int
    title: Optional[str] = None
    content: str
    excerpt: Optional[str] = None
    relevance_score: float = 0.0
    included: bool = True
    page_start: Optional[int] = None
    page_end: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentSectionUpdate(BaseModel):
    included: Optional[bool] = None


class DocumentQualityResponse(BaseModel):
    document_id: int
    raw_word_count: int = 0
    filtered_word_count: int = 0
    dedup_ratio: float = 0.0
    boilerplate_removed_lines: int = 0
    sections_total: int = 0
    sections_included: int = 0
    ocr_status: Optional[str] = None
    ocr_provider: Optional[str] = None
    notes: Optional[str] = None


class IngestionJobResponse(BaseModel):
    id: str
    document_id: int
    status: str
    phase: str
    progress: float
    message: Optional[str] = None
    partial_ready: bool = False
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


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
    
    model_config = ConfigDict(from_attributes=True)


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
    
    model_config = ConfigDict(from_attributes=True)


# ========== Analytics Schemas ==========

class DashboardPlanItem(BaseModel):
    id: str
    title: str
    item_type: str
    duration_minutes: int
    goal_id: Optional[str] = None
    notes: Optional[str] = None
    completed: bool
    completed_at: Optional[datetime] = None


class DashboardPlanSummary(BaseModel):
    items: List[DashboardPlanItem] = []
    total_count: int = 0
    completed_count: int = 0
    minutes_planned: int = 0
    minutes_completed: int = 0


class DashboardUpcomingReview(BaseModel):
    date: str
    count: int


class DashboardGoalPacingItem(BaseModel):
    goal_id: str
    title: str
    deadline: Optional[datetime] = None
    target_hours: float
    logged_hours: float
    remaining_hours: float
    required_minutes_per_day: int
    status: str
    days_remaining: Optional[int] = None


class DashboardFocusSummary(BaseModel):
    minutes_today: int
    minutes_last_7_days: int
    practice_minutes_today: int
    practice_minutes_last_7_days: int
    study_minutes_today: int
    study_minutes_last_7_days: int


class DashboardInsight(BaseModel):
    id: str
    title: str
    message: str
    action_label: Optional[str] = None
    action_route: Optional[str] = None
    severity: str = "info"


class DashboardOverviewResponse(BaseModel):
    today_plan: DashboardPlanSummary
    due_today: int
    upcoming_reviews: List[DashboardUpcomingReview] = []
    goal_pacing: List[DashboardGoalPacingItem] = []
    focus_summary: DashboardFocusSummary
    insights: List[DashboardInsight] = []
    retention_rate: float
    velocity: float
    streak_status: dict


class AnalyticsGoalProgressItem(BaseModel):
    goal_id: str
    title: str
    deadline: Optional[datetime] = None
    target_hours: float
    logged_hours: float
    progress_pct: float
    expected_progress_pct: Optional[float] = None
    pace_status: str
    required_minutes_per_day: int
    days_remaining: Optional[int] = None


class AnalyticsGoalProgressResponse(BaseModel):
    items: List[AnalyticsGoalProgressItem]


class AnalyticsTimeAllocationItem(BaseModel):
    date: str
    focus_minutes: int
    practice_minutes: int
    study_minutes: int
    total_minutes: int


class AnalyticsTimeAllocationResponse(BaseModel):
    items: List[AnalyticsTimeAllocationItem]


class AnalyticsConsistencyResponse(BaseModel):
    active_days: int
    total_days: int
    longest_streak: int
    missed_days: int


class AnalyticsRecommendation(BaseModel):
    id: str
    title: str
    message: str
    action_label: Optional[str] = None
    action_route: Optional[str] = None
    severity: str = "info"


class AnalyticsRecommendationsResponse(BaseModel):
    items: List[AnalyticsRecommendation]



# ========== Practice Schemas ==========

class PracticeSessionCreate(BaseModel):
    mode: str = "focus"  # quick, focus, deep
    goal_id: Optional[str] = None
    curriculum_id: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=5, le=180)
    concept_filters: Optional[List[str]] = None


class PracticeSessionItem(BaseModel):
    id: str
    item_type: str
    prompt: str
    expected_answer: Optional[str] = None
    source_id: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class PracticeSessionStartResponse(BaseModel):
    session_id: str
    target_duration_minutes: int
    items: List[PracticeSessionItem]
    source_mix: Dict[str, int] = {}


class PracticeItemSubmit(BaseModel):
    item_id: str
    response_text: Optional[str] = None
    rating: Optional[int] = Field(None, ge=0, le=5)
    time_taken: Optional[int] = None


class PracticeItemResult(BaseModel):
    score: float
    feedback: Optional[str] = None
    next_review: Optional[datetime] = None


class PracticeSessionEnd(BaseModel):
    reflection: Optional[str] = None
    effectiveness_rating: Optional[int] = Field(None, ge=1, le=5)


class PracticeSessionSummary(BaseModel):
    session_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    mode: str
    target_duration_minutes: int
    items_completed: int
    average_score: float
    total_time_seconds: int
    reflection: Optional[str] = None
    effectiveness_rating: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PracticeHistoryItem(BaseModel):
    session_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    mode: str
    items_completed: int
    average_score: float


class PracticeHistoryResponse(BaseModel):
    items: List[PracticeHistoryItem]

class ActivityLogResponse(BaseModel):
    """Schema for user activity log entries."""
    id: int
    activity_type: str
    description: str
    timestamp: datetime
    document_id: Optional[int] = None
    extra_data: dict = {}

    model_config = ConfigDict(from_attributes=True)


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



# ========== Configuration Schemas ==========

class LLMConfig(BaseModel):
    """Configuration for LLM provider overrides."""
    provider: str = "openai"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


# ========== Knowledge Graph Schemas ==========

class KnowledgeGraphBase(BaseModel):
    name: str
    description: Optional[str] = None


class KnowledgeGraphCreate(KnowledgeGraphBase):
    user_id: str = "default_user"
    document_ids: List[int] = []
    llm_config: Optional[LLMConfig] = None
    extraction_max_chars: Optional[int] = None
    chunk_size: Optional[int] = None


class KnowledgeGraphUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    document_ids: Optional[List[int]] = None
    llm_config: Optional[LLMConfig] = None
    extraction_max_chars: Optional[int] = None
    chunk_size: Optional[int] = None


class KnowledgeGraphResponse(KnowledgeGraphBase):
    id: str
    user_id: str
    status: str
    node_count: int
    relationship_count: int
    created_at: datetime
    updated_at: datetime
    last_built_at: Optional[datetime] = None
    document_ids: List[int] = []
    llm_config: Optional[LLMConfig] = None
    error_message: Optional[str] = None
    build_progress: Optional[float] = None
    build_stage: Optional[str] = None
    extraction_max_chars: Optional[int] = None
    chunk_size: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeGraphBuildRequest(BaseModel):
    build_mode: str = Field(..., description="existing or rebuild")
    llm_config: Optional[LLMConfig] = None
    source_mode: str = Field("filtered", description="filtered or raw")
    extraction_max_chars: Optional[int] = Field(None, description="Max chars per LLM extraction window")
    chunk_size: Optional[int] = Field(None, description="Chunk size for document splitting")


class KnowledgeGraphConnectionSuggestion(BaseModel):
    from_scoped_id: str
    to_scoped_id: str
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: Optional[str] = None


class KnowledgeGraphConnectionRequest(BaseModel):
    target_graph_id: str
    context: str
    connections: List[KnowledgeGraphConnectionSuggestion]
    method: str = "llm"


class KnowledgeGraphSuggestionRequest(BaseModel):
    target_graph_id: str
    context: str
    max_links: int = 20
    llm_config: Optional[LLMConfig] = None


class KnowledgeGraphDataResponse(BaseModel):
    graph_id: str
    nodes: List[Dict[str, Any]]
    links: List[Dict[str, Any]]
    node_count: int
    relationship_count: int
    graph_meta: Dict[str, Any]


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

    model_config = ConfigDict(from_attributes=True)


class CurriculumBase(BaseModel):
    title: str
    description: Optional[str] = None
    target_concept: Optional[str] = None


class CurriculumCreate(CurriculumBase):
    document_id: Optional[int] = None
    user_id: str = "default_user"
    llm_config: Optional[LLMConfig] = None


class CurriculumGenerateRequest(CurriculumBase):
    user_id: str = "default_user"
    document_id: Optional[int] = None
    document_ids: List[int] = []
    time_budget_hours_per_week: int = 5
    duration_weeks: int = 4
    start_date: Optional[date] = None
    llm_enhance: bool = False
    llm_config: Optional[LLMConfig] = None
    gating_mode: Optional[str] = Field(default="recommend", description="recommend or strict")


class CurriculumTaskResponse(BaseModel):
    id: str
    week_id: str
    title: str
    task_type: str = "reading"
    linked_doc_id: Optional[int] = None
    linked_module_id: Optional[str] = None
    estimate_minutes: int = 30
    notes: Optional[str] = None
    status: str = "pending"
    action_metadata: Optional[Dict[str, Any]] = None
    gated: bool = False
    gate_reason: Optional[str] = None
    mastery_score: Optional[float] = None
    mastery_required: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class CurriculumCheckpointResponse(BaseModel):
    id: str
    week_id: str
    title: str
    success_criteria: Optional[str] = None
    linked_doc_ids: List[int] = []
    linked_module_ids: List[str] = []
    assessment_type: str = "recall"
    due_date: Optional[date] = None
    status: str = "pending"

    model_config = ConfigDict(from_attributes=True)


class CurriculumWeekResponse(BaseModel):
    id: str
    curriculum_id: str
    week_index: int
    goal: Optional[str] = None
    focus_concepts: List[str] = []
    estimated_hours: float = 0.0
    status: str = "planned"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    tasks: List[CurriculumTaskResponse] = []
    checkpoints: List[CurriculumCheckpointResponse] = []

    model_config = ConfigDict(from_attributes=True)


class CurriculumTimelineResponse(BaseModel):
    curriculum_id: str
    weeks: List[CurriculumWeekResponse] = []


class CurriculumMetricsResponse(BaseModel):
    curriculum_id: str
    weeks_total: int = 0
    weeks_completed: int = 0
    tasks_total: int = 0
    tasks_completed: int = 0
    progress_percent: float = 0.0
    last_activity_at: Optional[datetime] = None
    next_checkpoint_title: Optional[str] = None
    next_checkpoint_due: Optional[date] = None


class CurriculumWeekReportResponse(BaseModel):
    week_id: str
    curriculum_id: str
    week_index: int
    title: str
    markdown: str
    stats: Dict[str, Any] = {}


class CurriculumResponse(CurriculumBase):
    id: str
    user_id: str
    document_id: Optional[int] = None
    document_ids: List[int] = []
    goal_id: Optional[str] = None
    status: str
    progress: float
    start_date: Optional[date] = None
    duration_weeks: int = 4
    time_budget_hours_per_week: int = 5
    llm_enhance: bool = False
    gating_mode: str = "recommend"
    created_at: datetime
    updated_at: datetime
    modules: List[CurriculumModuleResponse] = []

    model_config = ConfigDict(from_attributes=True)


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
    short_term_goals: List[str] = []
    near_term_goals: List[str] = []
    long_term_goals: List[str] = []


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
    short_term_goals: Optional[List[str]] = None
    near_term_goals: Optional[List[str]] = None
    long_term_goals: Optional[List[str]] = None


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

    model_config = ConfigDict(from_attributes=True)


class DailyPlanItem(BaseModel):
    id: str
    title: str
    item_type: str = "study"
    duration_minutes: int = 30
    source_id: Optional[str] = None
    notes: Optional[str] = None
    completed: Optional[bool] = False
    completed_at: Optional[datetime] = None


class DailyPlanResponse(BaseModel):
    date: date
    items: List[DailyPlanItem] = []
    readiness_score: Optional[float] = None
    biometrics_mode: Optional[str] = None


class DailyPlanEntryUpdate(BaseModel):
    completed: bool = True


class DailyPlanEntryCreate(BaseModel):
    title: str
    item_type: str = "study"
    duration_minutes: int = 30
    notes: Optional[str] = None
    goal_id: Optional[str] = None
    date: Optional[date] = None


class DailyPlanHistoryItem(BaseModel):
    id: str
    date: date
    title: str
    item_type: str
    duration_minutes: int
    goal_id: Optional[str] = None
    notes: Optional[str] = None
    completed: bool = False
    completed_at: Optional[datetime] = None


class DailyPlanHistoryResponse(BaseModel):
    items: List[DailyPlanHistoryItem] = []


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

    model_config = ConfigDict(from_attributes=True)



class DocumentQuizItem(BaseModel):
    id: str
    document_id: int
    mode: str = "cloze"
    passage_markdown: str
    masked_markdown: Optional[str] = None
    answer_key: List[str] = []
    tags: List[str] = []
    difficulty: int = 3
    source_span: Dict[str, Any] = {}
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentQuizGenerateRequest(BaseModel):
    mode: str = "cloze"
    count: int = 5
    max_length: int = 450
    difficulty: int = 3
    source_mode: str = "auto"
    selection_text: Optional[str] = None
    llm_config: Optional[LLMConfig] = None

class DocumentQuizSessionCreate(BaseModel):
    mode: str = "cloze"
    item_ids: Optional[List[str]] = None
    settings: Optional[Dict[str, Any]] = None

class DocumentQuizSessionResponse(BaseModel):
    id: str
    document_id: int
    mode: str
    settings: Dict[str, Any] = {}
    status: str = "active"
    items: List[DocumentQuizItem] = []

class DocumentQuizGradeRequest(BaseModel):
    session_id: str
    quiz_item_id: str
    answer_text: str
    transcript: Optional[str] = None
    llm_config: Optional[LLMConfig] = None

class DocumentQuizGradeResponse(BaseModel):
    score: float
    feedback: str
    llm_eval: Dict[str, Any] = {}

class DocumentStudySettingsPayload(BaseModel):
    reveal_config: Dict[str, Any] = Field(default_factory=dict)
    llm_config: Optional[LLMConfig] = None
    voice_mode_enabled: bool = False

class DocumentStudySettingsResponse(BaseModel):
    reveal_config: Dict[str, Any] = Field(default_factory=dict)
    llm_config: Optional[LLMConfig] = None
    voice_mode_enabled: bool = False


class DocumentQuizStatsResponse(BaseModel):
    document_id: int
    total_attempts: int = 0
    average_score: float = 0.0
    best_score: float = 0.0
    last_attempt_at: Optional[datetime] = None
    attempts_last_7d: int = 0
    average_score_last_7d: float = 0.0

