"""
Pydantic models for the Goal Manifestation Agent (GMA).
Defines the state, input/output structures, and configuration for the agent.
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone
from pydantic import BaseModel, Field

# --- Configuration ---

class AgentLLMConfig(BaseModel):
    """Configuration for the Agent's LLM."""
    provider: Literal[
        "openai",
        "anthropic",
        "groq",
        "openrouter",
        "ollama",
        "google",
        "together",
        "mistral",
        "huggingface",
        "fireworks",
        "deepseek",
        "perplexity",
        "custom"
    ] = "openai"
    model: str = "gpt-4o"
    base_url: Optional[str] = None
    temperature: float = 0.7
    api_key: Optional[str] = None

class AgentEmbeddingConfig(BaseModel):
    """Configuration for Embeddings."""
    provider: Literal[
        "openai",
        "ollama",
        "google",
        "openrouter",
        "together",
        "mistral",
        "huggingface",
        "fireworks",
        "deepseek",
        "perplexity",
        "custom",
        "local"
    ] = "ollama"
    model: str = "embeddinggemma:latest"
    dimensions: int = 768
    base_url: Optional[str] = None
    api_key: Optional[str] = None

class AgentSettings(BaseModel):
    """Global settings for the Agent."""
    model_config = {"extra": "ignore"}  # Ignore extra fields from UI

    llm_config: AgentLLMConfig = Field(default_factory=AgentLLMConfig)
    vision_llm_config: AgentLLMConfig = Field(default_factory=AgentLLMConfig)
    embedding_config: AgentEmbeddingConfig = Field(default_factory=AgentEmbeddingConfig)
    guardrail_mode: Literal["soft", "hard"] = "soft"

    enable_screenshots: bool = True
    screenshot_interval_min: int = 15
    check_in_frequency_hours: int = 4
    resend_api_key: Optional[str] = None
    resend_reply_domain: Optional[str] = None
    email: Optional[str] = None
    use_biometrics: bool = False
    biometrics_mode: Literal["insights", "intensity", "scheduling"] = "intensity"
    auto_refresh_fitbit: bool = True
    fitbit_demo_mode: bool = False
    fitbit_client_id: Optional[str] = None
    fitbit_client_secret: Optional[str] = None
    fitbit_redirect_uri: Optional[str] = None
    bedtime: Optional[str] = None
    email_negotiation_enabled: Optional[bool] = True
    # Notification preferences (also stored on UserSettings model)
    email_daily_reminder: Optional[bool] = None
    email_streak_alert: Optional[bool] = None
    email_weekly_digest: Optional[bool] = None
    timezone: Optional[str] = None
    weekly_digest_day: Optional[int] = None
    weekly_digest_hour: Optional[int] = None
    weekly_digest_minute: Optional[int] = None
    opik_config: Optional[Dict[str, Any]] = None

# --- State Definitions ---

class UserContext(BaseModel):
    """Static and semi-static user context."""
    user_id: str
    timezone: str = "UTC"
    name: str = "User"
    email: Optional[str] = None
    resend_api_key: Optional[str] = None
    use_biometrics: bool = False
    bio: Optional[str] = None
    # Learned preferences could go here or in a separate dict
    preferences: Dict[str, Any] = Field(default_factory=dict)

class Goal(BaseModel):
    """Simplified Goal representation for the Agent's context."""
    id: str
    title: str
    description: Optional[str] = None
    status: Literal["pending", "active", "completed", "failed"] = "pending"
    deadline: Optional[datetime] = None
    priority: int = 1
    progress: float = 0.0
    daily_target_hours: float = 0.0
    short_term_goals: List[str] = Field(default_factory=list)
    near_term_goals: List[str] = Field(default_factory=list)
    long_term_goals: List[str] = Field(default_factory=list)

class SessionState(BaseModel):
    """Current active session state."""
    is_active: bool = False
    session_id: Optional[str] = None
    goal_id: Optional[str] = None
    start_time: Optional[datetime] = None
    duration_minutes: float = 0
    screenshots_taken: int = 0
    validation_status: Literal["pending", "pass", "fail"] = "pending"

class PlanItem(BaseModel):
    """A single item in the agent's daily plan."""
    id: str
    title: str
    start_time: Optional[str] = None  # ISO format or "09:00"
    duration_minutes: int
    goal_id: Optional[str] = None
    status: Literal["pending", "completed", "missed"] = "pending"

class AgentState(BaseModel):
    """
    The core state object for LangGraph.
    Passed between nodes (Planner, Executor, Analyzer).
    """
    # Context
    user_context: UserContext
    llm_config: Optional[AgentLLMConfig] = None
    goals: List[Goal] = Field(default_factory=list)
    recent_activity: List[str] = Field(default_factory=list)  # Summary of recent actions

    # Operational
    current_session: SessionState = Field(default_factory=SessionState)
    daily_plan: List[PlanItem] = Field(default_factory=list)
    scratchpad: str = ""  # Persistent scratchpad content

    # Internal
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    messages: List[Dict[str, str]] = Field(default_factory=list)  # Chat history for current turn

# --- Input/Output ---

class ChatInput(BaseModel):
    """Input message from the user."""
    message: str
    image_url: Optional[str] = None  # For multimodal interaction

class AgentGuardrail(BaseModel):
    status: Literal["in_domain", "adjacent", "out_of_domain"] = "in_domain"
    rationale: Optional[str] = None
    suggested_actions: List[str] = Field(default_factory=list)

class AgentToolEvent(BaseModel):
    type: str
    status: Literal["success", "error"] = "success"
    payload: Dict[str, Any] = Field(default_factory=dict)

class AgentResponse(BaseModel):
    """Structured response from the agent."""
    message: str
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    updated_plan: Optional[List[PlanItem]] = None
    suggested_actions: List[str] = Field(default_factory=list)
    tool_events: List[AgentToolEvent] = Field(default_factory=list)
    guardrail: Optional[AgentGuardrail] = None

# --- Onboarding & Tools ---

class AgentOnboardingGoal(BaseModel):
    title: str
    description: Optional[str] = None
    domain: str = "learning"
    target_hours: float = 100.0
    deadline: Optional[datetime] = None
    priority: int = 1
    status: str = "active"

class AgentOnboardingRequest(BaseModel):
    onboarding: Dict[str, Any] = Field(default_factory=dict)
    goals: List[AgentOnboardingGoal] = Field(default_factory=list)

class AgentStatusResponse(BaseModel):
    email_configured: bool
    resend_configured: bool
    fitbit_connected: bool
    readiness_score: Optional[float] = None
    fitbit_last_sync: Optional[datetime] = None
    biometrics_mode: Optional[str] = None
    pending_daily_items: Optional[int] = None
    onboarding: Dict[str, Any] = Field(default_factory=dict)

class AgentScreenshotRequest(BaseModel):
    url: str
    analyze: bool = True
    prompt: Optional[str] = None

class AgentEmailRequest(BaseModel):
    to: str
    subject: str
    body: str

class AgentScratchpadRequest(BaseModel):
    content: str
