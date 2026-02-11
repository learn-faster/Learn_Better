"""
SQLAlchemy Models for LearnFast Core.
"""
from datetime import datetime
from src.utils.time import utcnow
from typing import List, Optional
import uuid
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Date, Float, Boolean, JSON, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.database.orm import Base
from .fitbit import FitbitToken

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
    raw_extracted_text = Column(Text, nullable=True)
    filtered_extracted_text = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    page_count = Column(Integer, default=0)
    source_url = Column(String, nullable=True)
    source_type = Column(String, nullable=True)  # upload, youtube, link
    content_profile = Column(JSON, default=dict)
    ocr_status = Column(String, default="not_required")  # not_required, pending, completed, failed
    ocr_provider = Column(String, nullable=True)
    
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

    # Ingestion Status (Real-time Construction)
    ingestion_step = Column(String, default="pending") 
    ingestion_progress = Column(Float, default=0.0) # 0.0 to 100.0


    # Relationships
    folder = relationship("Folder", back_populates="documents")
    flashcards = relationship("Flashcard", back_populates="document", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="document")
    sections = relationship("DocumentSection", back_populates="document", cascade="all, delete-orphan")


class DocumentSection(Base):
    """
    A filtered/structured section extracted from a document.
    Enables inclusion/exclusion for graph and study pipelines.
    """
    __tablename__ = "document_sections"

    id = Column(String, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), index=True, nullable=False)
    section_index = Column(Integer, default=0)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    excerpt = Column(Text, nullable=True)
    relevance_score = Column(Float, default=0.0)
    included = Column(Boolean, default=True)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    document = relationship("Document", back_populates="sections")


class IngestionJob(Base):
    """
    Tracks long-running ingestion tasks and progressive availability.
    """
    __tablename__ = "ingestion_jobs"

    id = Column(String, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    phase = Column(String, default="queued")  # queued, extracting, filtering, ocr, ingesting
    progress = Column(Float, default=0.0)
    message = Column(Text, nullable=True)
    partial_ready = Column(Boolean, default=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

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
    
    next_review = Column(DateTime, default=utcnow)
    last_review = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    
    # Relationships
    document = relationship("Document", back_populates="flashcards")
    reviews = relationship("StudyReview", back_populates="flashcard")

class StudySession(Base):
    __tablename__ = "study_sessions"
    
    id = Column(String, primary_key=True, index=True) # UUID
    start_time = Column(DateTime, default=utcnow)
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
    reviewed_at = Column(DateTime, default=utcnow)
    
    # Relationships
    session = relationship("StudySession", back_populates="reviews")
    flashcard = relationship("Flashcard", back_populates="reviews")

class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    goal_id = Column(String, nullable=True)
    curriculum_id = Column(String, nullable=True)
    mode = Column(String, default="focus")
    target_duration_minutes = Column(Integer, default=25)
    start_time = Column(DateTime, default=utcnow)
    end_time = Column(DateTime, nullable=True)
    effectiveness_rating = Column(Integer, nullable=True)
    reflection = Column(Text, nullable=True)
    stats_json = Column(JSON, default=dict)

    items = relationship("PracticeItem", back_populates="session", cascade="all, delete-orphan")


class PracticeItem(Base):
    __tablename__ = "practice_items"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("practice_sessions.id"))

    item_type = Column(String, default="flashcard")  # flashcard, curriculum_task, graph_prompt, llm_drill
    source_id = Column(String, nullable=True)
    prompt = Column(Text, nullable=False)
    expected_answer = Column(Text, nullable=True)
    response = Column(Text, nullable=True)
    score = Column(Float, default=0.0)
    time_taken = Column(Integer, default=0)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    session = relationship("PracticeSession", back_populates="items")

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    activity_type = Column(String, index=True) # view_document, create_flashcard, etc.
    description = Column(String)
    timestamp = Column(DateTime, default=utcnow)
    
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    extra_data = Column(JSON, default=dict)
    
    # Relationships
    document = relationship("Document", back_populates="activity_logs")


class DailyPlanEntry(Base):
    __tablename__ = "daily_plan_entries"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    date = Column(Date, index=True)
    item_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    item_type = Column(String, default="study")
    goal_id = Column(String, nullable=True)
    planned_minutes = Column(Integer, default=30)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AgentEmailMessage(Base):
    __tablename__ = "agent_email_messages"
    
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    direction = Column(String, default="outbound")  # inbound/outbound
    thread_id = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    from_email = Column(String, nullable=True)
    to_email = Column(String, nullable=True)
    body_text = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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
    resend_reply_domain = Column(String, nullable=True)
    timezone = Column(String, default="UTC")
    
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
    weekly_digest_day = Column(Integer, default=6)  # 0=Mon ... 6=Sun
    weekly_digest_hour = Column(Integer, default=18)
    weekly_digest_minute = Column(Integer, default=0)
    weekly_digest_last_sent_at = Column(DateTime, nullable=True)
    
    # Biometric Integration
    use_biometrics = Column(Boolean, default=False)
    fitbit_client_id = Column(String, nullable=True)
    fitbit_client_secret = Column(String, nullable=True)
    fitbit_redirect_uri = Column(String, nullable=True)
    bedtime = Column(String, nullable=True)
    email_negotiation_enabled = Column(Boolean, default=True)
    email_negotiation_last_sent_at = Column(DateTime, nullable=True)
    
    # LLM Configuration (JSON)
    # Stores provider settings and component-specific overrides
    llm_config = Column(JSON, default=dict)

    # Embedding configuration overrides
    embedding_provider = Column(String, nullable=True)
    embedding_model = Column(String, nullable=True)
    embedding_api_key = Column(String, nullable=True)
    embedding_base_url = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


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
    start_date = Column(Date, server_default=func.current_date())
    duration_weeks = Column(Integer, default=4)
    time_budget_hours_per_week = Column(Integer, default=5)
    llm_enhance = Column(Boolean, default=False)
    llm_config = Column(JSON, default=dict)
    gating_mode = Column(String, default="recommend")  # recommend, strict
    
    status = Column(String, default="active") # active, completed, archvied
    progress = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # Relationships
    modules = relationship("CurriculumModule", back_populates="curriculum", cascade="all, delete-orphan")
    weeks = relationship("CurriculumWeek", back_populates="curriculum", cascade="all, delete-orphan")
    documents = relationship("CurriculumDocument", back_populates="curriculum", cascade="all, delete-orphan")
    document = relationship("Document")
    goal = relationship("Goal", back_populates="curriculums")

    @property
    def document_ids(self):
        return [link.document_id for link in self.documents] if self.documents else []


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


class CurriculumDocument(Base):
    """
    Join table linking curriculums to multiple documents.
    """
    __tablename__ = "curriculum_documents"

    id = Column(Integer, primary_key=True, index=True)
    curriculum_id = Column(String, ForeignKey("curriculums.id"))
    document_id = Column(Integer, ForeignKey("documents.id"))
    added_at = Column(DateTime, default=utcnow)

    curriculum = relationship("Curriculum", back_populates="documents")
    document = relationship("Document")


class CurriculumWeek(Base):
    """
    Weekly plan segment for a curriculum.
    """
    __tablename__ = "curriculum_weeks"

    id = Column(String, primary_key=True, index=True)
    curriculum_id = Column(String, ForeignKey("curriculums.id"))

    week_index = Column(Integer, default=1)
    goal = Column(Text, nullable=True)
    focus_concepts = Column(JSON, default=list)
    estimated_hours = Column(Float, default=0.0)
    status = Column(String, default="planned")  # planned, active, completed
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    curriculum = relationship("Curriculum", back_populates="weeks")
    tasks = relationship("CurriculumTask", back_populates="week", cascade="all, delete-orphan")
    checkpoints = relationship("CurriculumCheckpoint", back_populates="week", cascade="all, delete-orphan")


class CurriculumTask(Base):
    """
    A concrete task for a curriculum week.
    """
    __tablename__ = "curriculum_tasks"

    id = Column(String, primary_key=True, index=True)
    week_id = Column(String, ForeignKey("curriculum_weeks.id"))

    title = Column(Text, nullable=False)
    task_type = Column(String, default="reading")  # reading, practice, quiz, graph, review
    linked_doc_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    linked_module_id = Column(String, ForeignKey("curriculum_modules.id"), nullable=True)
    estimate_minutes = Column(Integer, default=30)
    notes = Column(Text, nullable=True)
    status = Column(String, default="pending")  # pending, done
    action_metadata = Column(JSON, default=dict)

    week = relationship("CurriculumWeek", back_populates="tasks")
    document = relationship("Document")
    module = relationship("CurriculumModule")


class CurriculumCheckpoint(Base):
    """
    A weekly checkpoint with success criteria.
    """
    __tablename__ = "curriculum_checkpoints"

    id = Column(String, primary_key=True, index=True)
    week_id = Column(String, ForeignKey("curriculum_weeks.id"))

    title = Column(Text, nullable=False)
    success_criteria = Column(Text, nullable=True)
    linked_doc_ids = Column(JSON, default=list)
    linked_module_ids = Column(JSON, default=list)
    assessment_type = Column(String, default="recall")
    due_date = Column(Date, nullable=True)
    status = Column(String, default="pending")  # pending, completed

    week = relationship("CurriculumWeek", back_populates="checkpoints")


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

    # Goal ladder (short / near / long)
    short_term_goals = Column(JSON, default=list)
    near_term_goals = Column(JSON, default=list)
    long_term_goals = Column(JSON, default=list)
    
    # Deadline & Priority
    deadline = Column(DateTime, nullable=True)
    priority = Column(Integer, default=1)  # 1=high, 2=medium, 3=low
    
    # Status
    status = Column(String, default="active")  # active, paused, completed, archived
    
    # Agent settings
    email_reminders = Column(Boolean, default=True)
    reminder_frequency = Column(String, default="daily")  # daily, weekly, none
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
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
    
    start_time = Column(DateTime, default=utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, default=0)
    
    session_type = Column(String, default="focus")  # focus, break
    notes = Column(Text, nullable=True)
    
    # Relationships
    goal = relationship("Goal", back_populates="focus_sessions")

class AgentMemory(Base):
    """
    Key-Value store for Agent's long-term structured memory and scratchpad.
    """
    __tablename__ = "agent_memory"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    
    key = Column(String, index=True) # e.g. "scratchpad", "user_profile", "current_plan"
    value = Column(JSON, nullable=True)
    
    category = Column(String, default="general") # general, scratchpad, preference
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Composite unique constraint on user_id and key could be added in __table_args__
    # but for now we will handle it in application logic or assume uniqueness


class AgentMemoryEpisodic(Base):
    """
    Episodic memory for the agent (daily activities, sessions, outcomes).
    """
    __tablename__ = "agent_memory_episodic"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    timestamp = Column(DateTime, default=utcnow, index=True)
    summary = Column(Text, nullable=False)
    context = Column(JSON, default=dict)
    goal_id = Column(String, nullable=True)
    tags = Column(ARRAY(String), default=list)


class AgentMemorySemantic(Base):
    """
    Semantic memory for stable user facts and preferences.
    """
    __tablename__ = "agent_memory_semantic"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    key = Column(String, index=True)
    value = Column(JSON, nullable=True)
    confidence = Column(Float, default=0.7)
    source = Column(String, nullable=True)
    tags = Column(ARRAY(String), default=list)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class AgentMemoryProcedural(Base):
    """
    Procedural memory for strategies that worked in the past.
    """
    __tablename__ = "agent_memory_procedural"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    strategy = Column(Text, nullable=False)
    effectiveness_score = Column(Float, default=0.0)
    last_used = Column(DateTime, nullable=True)
    tags = Column(ARRAY(String), default=list)


class KnowledgeGraph(Base):
    """
    Saved knowledge graph definition and metadata.
    Backed by document-scoped concepts in Neo4j.
    """
    __tablename__ = "knowledge_graphs"

    id = Column(String, primary_key=True, index=True, default=lambda: uuid.uuid4().hex)
    user_id = Column(String, index=True, default="default_user")
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="draft")  # draft, building, ready, error

    llm_config = Column(JSON, default=dict)
    error_message = Column(Text, nullable=True)
    build_progress = Column(Float, default=0.0)
    build_stage = Column(String, nullable=True)
    extraction_max_chars = Column(Integer, nullable=True)
    chunk_size = Column(Integer, nullable=True)

    node_count = Column(Integer, default=0)
    relationship_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    last_built_at = Column(DateTime, nullable=True)

    documents = relationship("KnowledgeGraphDocument", back_populates="graph", cascade="all, delete-orphan")


class KnowledgeGraphDocument(Base):
    """
    Join table linking knowledge graphs to documents.
    """
    __tablename__ = "knowledge_graph_documents"

    id = Column(Integer, primary_key=True, index=True)
    graph_id = Column(String, ForeignKey("knowledge_graphs.id"), index=True, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), index=True, nullable=False)
    added_at = Column(DateTime, default=utcnow)

    graph = relationship("KnowledgeGraph", back_populates="documents")
    document = relationship("Document")



class DocumentQuizItem(Base):
    __tablename__ = "document_quiz_items"

    id = Column(String, primary_key=True, index=True)  # UUID
    document_id = Column(Integer, ForeignKey("documents.id"), index=True, nullable=False)
    mode = Column(String, default="cloze")
    passage_markdown = Column(Text, nullable=False)
    masked_markdown = Column(Text, nullable=True)
    answer_key = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    difficulty = Column(Integer, default=3)
    source_span = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

class DocumentQuizSession(Base):
    __tablename__ = "document_quiz_sessions"

    id = Column(String, primary_key=True, index=True)  # UUID
    document_id = Column(Integer, ForeignKey("documents.id"), index=True, nullable=False)
    mode = Column(String, default="cloze")
    settings = Column(JSON, default=dict)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

class DocumentQuizAttempt(Base):
    __tablename__ = "document_quiz_attempts"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("document_quiz_sessions.id"), index=True, nullable=False)
    quiz_item_id = Column(String, ForeignKey("document_quiz_items.id"), index=True, nullable=False)
    user_answer = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    score = Column(Float, default=0.0)
    feedback = Column(Text, nullable=True)
    llm_eval = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

class DocumentStudySettings(Base):
    __tablename__ = "document_study_settings"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, default="default_user")
    document_id = Column(Integer, ForeignKey("documents.id"), index=True, nullable=True)
    reveal_config = Column(JSON, default=dict)
    llm_config = Column(JSON, default=dict)
    voice_mode_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

