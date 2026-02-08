"""
Pydantic models for the Goal Manifestation Agent (GMA).
Defines the state, input/output structures, and configuration for the agent.
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field

# --- Configuration ---

class AgentLLMConfig(BaseModel):
    """Configuration for the Agent's LLM."""
    provider: Literal["openai", "groq", "ollama", "openrouter"] = "openai"
    model: str = "gpt-4o"
    base_url: Optional[str] = None
    temperature: float = 0.7
    api_key: Optional[str] = None

class AgentSettings(BaseModel):
    """Global settings for the Agent."""
    llm_config: AgentLLMConfig = Field(default_factory=AgentLLMConfig)
    enable_screenshots: bool = True
    screenshot_interval_min: int = 15
    check_in_frequency_hours: int = 4
    resend_api_key: Optional[str] = None

# --- State Definitions ---

class UserContext(BaseModel):
    """Static and semi-static user context."""
    user_id: str
    timezone: str = "UTC"
    name: str = "User"
    email: Optional[str] = None
    resend_api_key: Optional[str] = None
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
    start_time: Optional[str] = None # ISO format or "09:00"
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
    recent_activity: List[str] = Field(default_factory=list) # Summary of recent actions
    
    # Operational
    current_session: SessionState = Field(default_factory=SessionState)
    daily_plan: List[PlanItem] = Field(default_factory=list)
    scratchpad: str = "" # Persistent scratchpad content
    
    # Internal
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    messages: List[Dict[str, str]] = Field(default_factory=list) # Chat history for current turn

# --- Input/Output ---

class ChatInput(BaseModel):
    """Input message from the user."""
    message: str
    image_url: Optional[str] = None # For multimodal interaction

class AgentResponse(BaseModel):
    """Structured response from the agent."""
    message: str
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    updated_plan: Optional[List[PlanItem]] = None
    suggested_actions: List[str] = Field(default_factory=list)
