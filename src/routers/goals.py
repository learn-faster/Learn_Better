"""
Goals Router for the Learning Assistant.
Manages user goals, focus sessions, and progress tracking.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os
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
from src.models.agent import (
    ChatInput,
    AgentResponse,
    AgentSettings,
    AgentOnboardingRequest,
    AgentStatusResponse,
    AgentScreenshotRequest,
    AgentEmailRequest,
    AgentScratchpadRequest
)

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
    result = await goal_agent.process_message(user_id, chat_input.message)

    return AgentResponse(
        message=result.get("message", ""),
        suggested_actions=result.get("suggested_actions", []),
        tool_calls=result.get("tool_calls", []),
        tool_events=result.get("tool_events", []),
        guardrail=result.get("guardrail")
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
    
    # Update notification preferences if provided in the request
    if settings.email_daily_reminder is not None:
        user_settings.email_daily_reminder = settings.email_daily_reminder
    else:
        # Backward compatibility / logical default
        user_settings.email_daily_reminder = settings.check_in_frequency_hours > 0

    if settings.email_streak_alert is not None:
        user_settings.email_streak_alert = settings.email_streak_alert
        
    if settings.email_weekly_digest is not None:
        user_settings.email_weekly_digest = settings.email_weekly_digest    
    # Save Resend API Key if provided
    if settings.resend_api_key:
        user_settings.resend_api_key = settings.resend_api_key
    
    # Save email if provided
    if settings.email:
        user_settings.email = settings.email
        
    # Save Biometrics preference
    user_settings.use_biometrics = settings.use_biometrics
    
    # Save Fitbit credentials
    if settings.fitbit_client_id:
        user_settings.fitbit_client_id = settings.fitbit_client_id
    if settings.fitbit_client_secret:
        user_settings.fitbit_client_secret = settings.fitbit_client_secret
    if settings.fitbit_redirect_uri:
        user_settings.fitbit_redirect_uri = settings.fitbit_redirect_uri

    if settings.timezone:
        user_settings.timezone = settings.timezone
    if settings.weekly_digest_day is not None:
        user_settings.weekly_digest_day = settings.weekly_digest_day
    if settings.weekly_digest_hour is not None:
        user_settings.weekly_digest_hour = settings.weekly_digest_hour
    if settings.weekly_digest_minute is not None:
        user_settings.weekly_digest_minute = settings.weekly_digest_minute
    
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
            "vision_llm_config": {
                "provider": "openai",
                "model": "gpt-4o",
                "base_url": "",
                "temperature": 0.7,
                "api_key": ""
            },
            "guardrail_mode": "soft",
            "enable_screenshots": True,
            "check_in_frequency_hours": 4,
            "timezone": "UTC",
            "weekly_digest_day": 6,
            "weekly_digest_hour": 18,
            "weekly_digest_minute": 0
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
    vision_llm_config = agent_settings_data.get("vision_llm_config") or llm_config
    
    return {
        "llm_config": llm_config,
        "vision_llm_config": vision_llm_config,
        "guardrail_mode": agent_settings_data.get("guardrail_mode", "soft"),
        "enable_screenshots": agent_settings_data.get("enable_screenshots", True),
        "screenshot_interval_min": agent_settings_data.get("screenshot_interval_min", 15),
        "check_in_frequency_hours": agent_settings_data.get("check_in_frequency_hours", 4 if user_settings.email_daily_reminder else 0),
        "resend_api_key": user_settings.resend_api_key,
        "email": user_settings.email,
        "use_biometrics": user_settings.use_biometrics,
        "fitbit_client_id": user_settings.fitbit_client_id,
        "fitbit_client_secret": user_settings.fitbit_client_secret,
        "fitbit_redirect_uri": user_settings.fitbit_redirect_uri,
        "email_daily_reminder": user_settings.email_daily_reminder,
        "email_streak_alert": user_settings.email_streak_alert,
        "email_weekly_digest": user_settings.email_weekly_digest,
        "timezone": user_settings.timezone or "UTC",
        "weekly_digest_day": user_settings.weekly_digest_day if user_settings.weekly_digest_day is not None else 6,
        "weekly_digest_hour": user_settings.weekly_digest_hour if user_settings.weekly_digest_hour is not None else 18,
        "weekly_digest_minute": user_settings.weekly_digest_minute if user_settings.weekly_digest_minute is not None else 0
    }


@router.get("/agent/status", response_model=AgentStatusResponse)
async def get_agent_status(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    from src.models.orm import UserSettings
    from src.models.fitbit import FitbitToken

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    email_configured = bool(user_settings and user_settings.email)
    resend_configured = bool(user_settings and user_settings.resend_api_key)
    fitbit_connected = False
    if user_settings:
        token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
        fitbit_connected = token is not None

    onboarding = {}
    if user_settings and user_settings.llm_config:
        onboarding = user_settings.llm_config.get("agent_settings", {}).get("onboarding", {})

    return AgentStatusResponse(
        email_configured=email_configured,
        resend_configured=resend_configured,
        fitbit_connected=fitbit_connected,
        onboarding=onboarding or {}
    )


@router.post("/agent/onboarding")
async def save_agent_onboarding(
    payload: AgentOnboardingRequest,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    from src.models.orm import UserSettings, Goal as GoalORM
    from sqlalchemy.orm.attributes import flag_modified
    import uuid as uuid_lib

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        user_settings = UserSettings(user_id=user_id)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)

    new_config = dict(user_settings.llm_config) if user_settings.llm_config else {}
    agent_settings = new_config.get("agent_settings", {})
    agent_settings["onboarding"] = payload.onboarding or {}
    new_config["agent_settings"] = agent_settings
    user_settings.llm_config = new_config
    flag_modified(user_settings, "llm_config")

    created_goal_ids = []
    for goal in payload.goals:
        goal_obj = GoalORM(
            id=str(uuid_lib.uuid4()),
            user_id=user_id,
            title=goal.title,
            description=goal.description,
            domain=goal.domain,
            target_hours=goal.target_hours,
            deadline=goal.deadline,
            priority=goal.priority,
            status=goal.status
        )
        db.add(goal_obj)
        created_goal_ids.append(goal_obj.id)

    db.commit()
    return {"status": "ok", "goals_created": created_goal_ids}


@router.post("/agent/tools/screenshot")
async def agent_screenshot_tool(
    payload: AgentScreenshotRequest,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    from src.models.orm import UserSettings
    from src.services.screenshot_service import screenshot_service
    from src.services.memory_service import memory_service
    from src.services.llm_service import llm_service
    from src.models.agent import AgentLLMConfig

    path = await screenshot_service.capture_url(payload.url)
    if not path:
        raise HTTPException(status_code=400, detail="Failed to capture screenshot")

    filename = os.path.basename(path)
    image_url = f"/screenshots/{filename}"
    analysis = None

    if payload.analyze:
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        vision_config = None
        if user_settings and user_settings.llm_config:
            agent_settings = user_settings.llm_config.get("agent_settings", {})
            vision_cfg = agent_settings.get("vision_llm_config") or agent_settings.get("llm_config")
            if vision_cfg:
                vision_config = AgentLLMConfig(**vision_cfg)

        prompt = payload.prompt or "Analyze this screenshot and determine if it shows learning or focused work."
        analysis = await llm_service.get_vision_completion(prompt, path, config=vision_config)

    memory_service.save_episodic_memory(
        summary="Screenshot captured (tool)",
        user_id=user_id,
        context={"url": payload.url, "image_url": image_url, "analysis": analysis},
        tags=["screenshot", "tool"]
    )

    return {"image_url": image_url, "analysis": analysis}


@router.post("/agent/tools/email")
async def agent_email_tool(
    payload: AgentEmailRequest,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    from src.models.orm import UserSettings
    from src.services.email_service import email_service
    from src.services.memory_service import memory_service

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    api_key = user_settings.resend_api_key if user_settings else None

    sent = await email_service.send_email(
        to_email=payload.to,
        subject=payload.subject,
        html_content=payload.body,
        api_key=api_key
    )
    memory_service.save_episodic_memory(
        summary="Email sent (tool)",
        user_id=user_id,
        context={"to": payload.to, "subject": payload.subject, "status": sent},
        tags=["email", "tool"]
    )
    return {"status": "sent" if sent else "failed"}


@router.post("/agent/tools/scratchpad")
async def agent_scratchpad_tool(
    payload: AgentScratchpadRequest,
    user_id: str = "default_user"
):
    from src.services.memory_service import memory_service
    memory_service.update_scratchpad(payload.content, user_id=user_id)
    return {"status": "ok"}



