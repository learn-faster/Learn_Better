"""
Goals Router for the Learning Assistant.
Manages user goals, focus sessions, and progress tracking.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from src.database.orm import get_db
from src.models.orm import Goal, FocusSession
from src.models.schemas import (
    GoalCreate, GoalUpdate, GoalResponse,
    FocusSessionCreate, FocusSessionEnd, FocusSessionResponse
)

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.post("/", response_model=GoalResponse)
def create_goal(goal_data: GoalCreate, db: Session = Depends(get_db)):
    """Creates a new goal."""
    goal = Goal(
        id=str(uuid.uuid4()),
        **goal_data.model_dump()
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _enrich_goal_response(goal)


@router.get("/", response_model=List[GoalResponse])
def get_goals(
    status: Optional[str] = None,
    domain: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retrieves all goals with optional filtering."""
    query = db.query(Goal).filter(Goal.user_id == "default_user")
    if status:
        query = query.filter(Goal.status == status)
    if domain:
        query = query.filter(Goal.domain == domain)
    goals = query.order_by(Goal.priority, Goal.created_at.desc()).all()
    return [_enrich_goal_response(g) for g in goals]


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(goal_id: str, db: Session = Depends(get_db)):
    """Retrieves a specific goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return _enrich_goal_response(goal)


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(goal_id: str, updates: GoalUpdate, db: Session = Depends(get_db)):
    """Updates a goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    
    db.commit()
    db.refresh(goal)
    return _enrich_goal_response(goal)


@router.delete("/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    """Deletes a goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
    return {"message": "Goal deleted"}


# ========== Focus Sessions ==========

@router.post("/{goal_id}/sessions", response_model=FocusSessionResponse)
def start_focus_session(
    goal_id: str,
    session_data: FocusSessionCreate = None,
    db: Session = Depends(get_db)
):
    """Starts a focus session for a goal."""
    session = FocusSession(
        id=str(uuid.uuid4()),
        goal_id=goal_id if goal_id != "none" else None,
        session_type=session_data.session_type if session_data else "focus"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/sessions/{session_id}/end", response_model=FocusSessionResponse)
def end_focus_session(
    session_id: str,
    end_data: FocusSessionEnd,
    db: Session = Depends(get_db)
):
    """Ends a focus session and logs time to the goal."""
    session = db.query(FocusSession).filter(FocusSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.end_time = datetime.utcnow()
    session.duration_minutes = end_data.duration_minutes
    session.notes = end_data.notes
    
    # Update goal's logged hours
    if session.goal_id:
        goal = db.query(Goal).filter(Goal.id == session.goal_id).first()
        if goal:
            goal.logged_hours += end_data.duration_minutes / 60.0
    
    db.commit()
    db.refresh(session)
    return session


@router.get("/{goal_id}/sessions", response_model=List[FocusSessionResponse])
def get_goal_sessions(goal_id: str, limit: int = 20, db: Session = Depends(get_db)):
    """Retrieves focus sessions for a goal."""
    sessions = db.query(FocusSession)\
        .filter(FocusSession.goal_id == goal_id)\
        .order_by(FocusSession.start_time.desc())\
        .limit(limit)\
        .all()
    return sessions


def _enrich_goal_response(goal: Goal) -> GoalResponse:
    """Adds computed fields to goal response."""
    progress = (goal.logged_hours / goal.target_hours * 100) if goal.target_hours > 0 else 0
    days_remaining = None
    is_on_track = True
    
    if goal.deadline:
        days_remaining = (goal.deadline - datetime.utcnow()).days
        if days_remaining > 0 and goal.target_hours > 0:
            hours_remaining = goal.target_hours - goal.logged_hours
            required_pace = hours_remaining / days_remaining
            is_on_track = required_pace <= 2.0  # Max 2 hours/day is sustainable
    
    return GoalResponse(
        id=goal.id,
        user_id=goal.user_id,
        title=goal.title,
        description=goal.description,
        domain=goal.domain,
        target_hours=goal.target_hours,
        logged_hours=goal.logged_hours,
        deadline=goal.deadline,
        priority=goal.priority,
        status=goal.status,
        email_reminders=goal.email_reminders,
        reminder_frequency=goal.reminder_frequency,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        progress_percent=min(100, progress),
        days_remaining=days_remaining,
        is_on_track=is_on_track
    )


# ========== Agent Endpoints ==========

from src.services.goal_agent import goal_agent
from src.models.agent import ChatInput, AgentResponse, AgentSettings

@router.post("/agent/chat", response_model=AgentResponse)
async def chat_with_agent(
    chat_input: ChatInput,
    user_id: str = "default_user",
    db: Session = Depends(get_db)  
):
    """
    Chat with the Goal Manifestation Agent.
    """
    # TODO: Pass DB connection to agent properly if needed, 
    # but for now agent uses imported services which handle their own DB.
    response_text = await goal_agent.process_message(user_id, chat_input.message)
    
    # In the future, we can extract structured data from agent state to populate these fields
    return AgentResponse(
        message=response_text,
        suggested_actions=[],
        tool_calls=[]
    )

@router.post("/agent/settings")
async def update_agent_settings(
    settings: AgentSettings,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """
    Update Agent settings (LLM config, etc).
    """
    
    # Lazy import to avoid circular dependency
    from src.models.orm import UserSettings
    
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        # Create default if missing
        user_settings = UserSettings(user_id=user_id)
        db.add(user_settings)
    
    # Update Agent settings using a fresh dictionary to ensure SQLAlchemy detects change
    new_config = dict(user_settings.llm_config) if user_settings.llm_config else {}
    
    # Store the entire settings object for full persistence
    new_config["agent_settings"] = settings.model_dump()
    
    # Also keep agent_llm for backward compatibility with goal_agent.py current logic
    new_config["agent_llm"] = settings.llm_config.model_dump()
    
    user_settings.llm_config = new_config
    
    # Explicitly flag modification for JSON column
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(user_settings, "llm_config")
    
    # Update legacy field for compatibility
    user_settings.email_daily_reminder = settings.check_in_frequency_hours > 0 
    
    # Save Resend API Key if provided
    if settings.resend_api_key:
        user_settings.resend_api_key = settings.resend_api_key
    
    db.commit()
    return {"status": "updated", "settings": settings.model_dump()}

@router.get("/agent/settings")
async def get_agent_settings(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """
    Retrieve Agent settings.
    """
    from src.models.orm import UserSettings
    
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        return {
            "llm_config": {
                "provider": "openai",
                "model": "gpt-4o",
                "base_url": "",
                "temperature": 0.7,
                "api_key": ""
            },
            "enable_screenshots": True,
            "check_in_frequency_hours": 4
        }
    
    # Try to load from consolidated agent_settings first
    agent_settings_data = user_settings.llm_config.get("agent_settings", {}) if user_settings.llm_config else {}
    
    # Fallback to legacy agent_llm if consolidated is missing
    agent_llm = user_settings.llm_config.get("agent_llm", {}) if user_settings.llm_config else {}
    
    # Reconstruct/Fallback values
    llm_config = agent_settings_data.get("llm_config") or {
        "provider": agent_llm.get("provider", "openai"),
        "model": agent_llm.get("model", "gpt-4o"),
        "base_url": agent_llm.get("base_url", ""),
        "temperature": agent_llm.get("temperature", 0.7),
        "api_key": agent_llm.get("api_key", "")
    }
    
    return {
        "llm_config": llm_config,
        "enable_screenshots": agent_settings_data.get("enable_screenshots", True),
        "check_in_frequency_hours": agent_settings_data.get("check_in_frequency_hours", 4 if user_settings.email_daily_reminder else 0),
        "resend_api_key": user_settings.resend_api_key
    }

