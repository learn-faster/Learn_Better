"""
Goals Router for the Learning Assistant.
Manages user goals, focus sessions, and progress tracking.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from src.utils.time import utcnow
import os
import uuid
from src.config import settings
from src.observability.opik import build_opik_config, init_opik

from src.database.orm import get_db
from src.dependencies import get_request_user_id
from src.models.orm import Goal, FocusSession, DailyPlanEntry, AgentEmailMessage
from src.models.schemas import (
    GoalCreate, GoalUpdate, GoalResponse,
    FocusSessionCreate, FocusSessionEnd, FocusSessionResponse,
    DailyPlanResponse, DailyPlanEntryUpdate, DailyPlanEntryCreate, DailyPlanHistoryResponse
)

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.post("/", response_model=GoalResponse)
def create_goal(
    goal_data: GoalCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Creates a new goal."""
    goal = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Retrieves all goals with optional filtering."""
    query = db.query(Goal).filter(Goal.user_id == user_id)
    if status:
        query = query.filter(Goal.status == status)
    if domain:
        query = query.filter(Goal.domain == domain)
    goals = query.order_by(Goal.priority, Goal.created_at.desc()).all()
    return [_enrich_goal_response(g) for g in goals]


@router.get("/daily-plan", response_model=DailyPlanResponse)
def get_daily_plan(user_id: str = Depends(get_request_user_id), db: Session = Depends(get_db)):
    from src.services.daily_plan_service import daily_plan_service
    return daily_plan_service.build_daily_plan(db, user_id)


@router.patch("/daily-plan/{entry_id}")
def update_daily_plan_entry(entry_id: str, payload: DailyPlanEntryUpdate, db: Session = Depends(get_db), user_id: str = Depends(get_request_user_id)):
    entry = db.query(DailyPlanEntry).filter(DailyPlanEntry.id == entry_id, DailyPlanEntry.user_id == user_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Daily plan entry not found")
    entry.completed = payload.completed
    entry.completed_at = utcnow() if payload.completed else None
    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id,
        "completed": entry.completed,
        "completed_at": entry.completed_at
    }


@router.post("/daily-plan/entries")
def create_daily_plan_entry(
    payload: DailyPlanEntryCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    plan_date = payload.date or utcnow().date()
    entry = DailyPlanEntry(
        id=str(uuid.uuid4()),
        user_id=user_id,
        date=plan_date,
        title=payload.title,
        item_type=payload.item_type,
        goal_id=payload.goal_id,
        planned_minutes=payload.duration_minutes,
        completed=False,
        notes=payload.notes
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id,
        "date": entry.date,
        "title": entry.title,
        "item_type": entry.item_type,
        "duration_minutes": entry.planned_minutes,
        "goal_id": entry.goal_id,
        "notes": entry.notes,
        "completed": entry.completed,
        "completed_at": entry.completed_at
    }


@router.get("/daily-plan/history", response_model=DailyPlanHistoryResponse)
def get_daily_plan_history(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    completed: Optional[bool] = None,
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    query = db.query(DailyPlanEntry).filter(DailyPlanEntry.user_id == user_id)
    if date_from:
        query = query.filter(DailyPlanEntry.date >= date_from)
    if date_to:
        query = query.filter(DailyPlanEntry.date <= date_to)
    if completed is not None:
        query = query.filter(DailyPlanEntry.completed == completed)

    entries = query.order_by(DailyPlanEntry.date.desc(), DailyPlanEntry.created_at.desc()).all()
    return {
        "items": [
            {
                "id": e.id,
                "date": e.date,
                "title": e.title,
                "item_type": e.item_type,
                "duration_minutes": e.planned_minutes,
                "goal_id": e.goal_id,
                "notes": e.notes,
                "completed": e.completed,
                "completed_at": e.completed_at
            } for e in entries
        ]
    }


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(
    goal_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Retrieves a specific goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return _enrich_goal_response(goal)


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: str,
    updates: GoalUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Updates a goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    
    db.commit()
    db.refresh(goal)
    return _enrich_goal_response(goal)


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Deletes a goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Starts a focus session for a goal."""
    if goal_id != "none":
        goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")

    session = FocusSession(
        id=str(uuid.uuid4()),
        goal_id=goal_id if goal_id != "none" else None,
        user_id=user_id,
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Ends a focus session and logs time to the goal."""
    session = db.query(FocusSession).filter(
        FocusSession.id == session_id,
        FocusSession.user_id == user_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.end_time = utcnow()
    session.duration_minutes = end_data.duration_minutes
    session.notes = end_data.notes
    
    # Update goal's logged hours
    if session.goal_id:
        goal = db.query(Goal).filter(Goal.id == session.goal_id, Goal.user_id == user_id).first()
        if goal:
            goal.logged_hours += end_data.duration_minutes / 60.0
    
    db.commit()
    db.refresh(session)
    return session


@router.get("/{goal_id}/sessions", response_model=List[FocusSessionResponse])
def get_goal_sessions(
    goal_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_request_user_id)
):
    """Retrieves focus sessions for a goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    sessions = db.query(FocusSession)\
        .filter(FocusSession.goal_id == goal_id, FocusSession.user_id == user_id)\
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
        days_remaining = (goal.deadline - utcnow()).days
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
        short_term_goals=goal.short_term_goals or [],
        near_term_goals=goal.near_term_goals or [],
        long_term_goals=goal.long_term_goals or [],
        created_at=goal.created_at,
        updated_at=goal.updated_at,
        progress_percent=min(100, progress),
        days_remaining=days_remaining,
        is_on_track=is_on_track
    )


# ========== Agent Endpoints ==========

from src.services.goal_agent import goal_agent
from src.services.email_service import email_service
from src.services.memory_service import memory_service
from src.services.ai_settings import (
    build_canonical_llm_config,
    get_or_create_user_settings,
    mark_llm_config_modified,
    merge_canonical_into_raw,
)
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
    user_id: str = Depends(get_request_user_id),
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
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db),
    request: Request = None
):
    """
    Update Agent settings (LLM config, etc).
    """
    
    # Lazy import to avoid circular dependency
    from src.models.orm import UserSettings
    
    user_settings = get_or_create_user_settings(db, user_id)

    canonical = build_canonical_llm_config(user_settings)
    if settings.llm_config is not None:
        canonical["agent"] = settings.llm_config.model_dump()
    if settings.vision_llm_config is not None:
        canonical["vision"] = settings.vision_llm_config.model_dump()

    new_config = merge_canonical_into_raw(user_settings.llm_config or {}, canonical)

    # Store the entire settings object for full persistence (legacy compatibility)
    agent_payload = settings.model_dump()
    agent_payload["llm_config"] = canonical.get("agent") or settings.llm_config.model_dump()
    agent_payload["vision_llm_config"] = canonical.get("vision") or settings.vision_llm_config.model_dump()
    agent_settings = new_config.get("agent_settings", {}) if isinstance(new_config.get("agent_settings"), dict) else {}
    agent_settings.update(agent_payload)
    new_config["agent_settings"] = agent_settings
    new_config["agent_llm"] = agent_payload["llm_config"]

    # Persist Opik settings if provided
    if settings.opik_config is not None:
        new_config["opik"] = settings.opik_config

    user_settings.llm_config = new_config
    mark_llm_config_modified(user_settings)
    
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
    if settings.resend_reply_domain:
        user_settings.resend_reply_domain = settings.resend_reply_domain
    
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
    if settings.bedtime:
        user_settings.bedtime = settings.bedtime
    if settings.email_negotiation_enabled is not None:
        user_settings.email_negotiation_enabled = settings.email_negotiation_enabled

    if settings.timezone:
        user_settings.timezone = settings.timezone
    if settings.weekly_digest_day is not None:
        user_settings.weekly_digest_day = settings.weekly_digest_day
    if settings.weekly_digest_hour is not None:
        user_settings.weekly_digest_hour = settings.weekly_digest_hour
    if settings.weekly_digest_minute is not None:
        user_settings.weekly_digest_minute = settings.weekly_digest_minute
    
    db.commit()
    try:
        opik_cfg = build_opik_config(user_settings)
        init_opik(opik_cfg)
        if request is not None:
            request.app.state.opik_config = opik_cfg
    except Exception:
        pass
    return {"status": "updated", "settings": settings.model_dump()}

@router.get("/agent/settings")
async def get_agent_settings(
    user_id: str = Depends(get_request_user_id),
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
            "biometrics_mode": "intensity",
            "auto_refresh_fitbit": True,
            "bedtime": "22:00",
            "email_negotiation_enabled": True,
            "timezone": "UTC",
            "weekly_digest_day": 6,
            "weekly_digest_hour": 18,
            "weekly_digest_minute": 0,
            "opik_config": {"enabled": False, "api_key": "", "workspace": "", "url_override": "", "project_name": "", "use_local": False}
        }
    
    canonical = build_canonical_llm_config(user_settings)

    # Try to load from consolidated agent_settings first
    agent_settings_data = user_settings.llm_config.get("agent_settings", {}) if user_settings.llm_config else {}
    
    # Fallback to legacy agent_llm if consolidated is missing
    agent_llm = user_settings.llm_config.get("agent_llm", {}) if user_settings.llm_config else {}
    
    # Reconstruct/Fallback values
    llm_config = canonical.get("agent") or agent_settings_data.get("llm_config") or {
        "provider": agent_llm.get("provider", "openai"),
        "model": agent_llm.get("model", "gpt-4o"),
        "base_url": agent_llm.get("base_url", ""),
        "temperature": agent_llm.get("temperature", 0.7),
        "api_key": agent_llm.get("api_key", "")
    }
    vision_llm_config = canonical.get("vision") or agent_settings_data.get("vision_llm_config") or llm_config
    
    embedding_config = canonical.get("embedding_config") or agent_settings_data.get("embedding_config") or {
        "provider": settings.embedding_provider,
        "model": settings.embedding_model,
        "dimensions": getattr(settings, "embedding_dimensions", 768),
        "base_url": settings.embedding_base_url,
        "api_key": settings.embedding_api_key
    }
    
    return {
        "llm_config": llm_config,
        "vision_llm_config": vision_llm_config,
        "embedding_config": embedding_config,
        "guardrail_mode": agent_settings_data.get("guardrail_mode", "soft"),
        "enable_screenshots": agent_settings_data.get("enable_screenshots", True),
        "screenshot_interval_min": agent_settings_data.get("screenshot_interval_min", 15),
        "check_in_frequency_hours": agent_settings_data.get("check_in_frequency_hours", 4 if user_settings.email_daily_reminder else 0),
        "biometrics_mode": agent_settings_data.get("biometrics_mode", "intensity"),
        "auto_refresh_fitbit": agent_settings_data.get("auto_refresh_fitbit", True),
        "fitbit_demo_mode": agent_settings_data.get("fitbit_demo_mode", False),
        "resend_api_key": user_settings.resend_api_key,
        "resend_reply_domain": user_settings.resend_reply_domain,
        "email": user_settings.email,
        "use_biometrics": user_settings.use_biometrics,
        "fitbit_client_id": user_settings.fitbit_client_id,
        "fitbit_client_secret": user_settings.fitbit_client_secret,
        "fitbit_redirect_uri": user_settings.fitbit_redirect_uri,
        "bedtime": user_settings.bedtime,
        "email_negotiation_enabled": user_settings.email_negotiation_enabled,
        "email_daily_reminder": user_settings.email_daily_reminder,
        "email_streak_alert": user_settings.email_streak_alert,
        "email_weekly_digest": user_settings.email_weekly_digest,
        "timezone": user_settings.timezone or "UTC",
        "weekly_digest_day": user_settings.weekly_digest_day if user_settings.weekly_digest_day is not None else 6,
        "weekly_digest_hour": user_settings.weekly_digest_hour if user_settings.weekly_digest_hour is not None else 18,
        "weekly_digest_minute": user_settings.weekly_digest_minute if user_settings.weekly_digest_minute is not None else 0,
        "opik_config": (user_settings.llm_config.get("opik", {}) if user_settings.llm_config else {})
    }


@router.get("/agent/status", response_model=AgentStatusResponse)
async def get_agent_status(
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    from src.models.orm import UserSettings
    from src.models.fitbit import FitbitToken, FitbitDailyMetrics
    from datetime import date

    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    email_configured = bool(user_settings and user_settings.email)
    resend_configured = bool(user_settings and user_settings.resend_api_key)
    fitbit_connected = False
    readiness_score = None
    fitbit_last_sync = None
    biometrics_mode = None
    pending_daily_items = None
    if user_settings:
        demo_mode = user_settings.llm_config.get("agent_settings", {}).get("fitbit_demo_mode", False) if user_settings.llm_config else False
        token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
        fitbit_connected = token is not None or demo_mode
        if token:
            latest = db.query(FitbitDailyMetrics).filter(FitbitDailyMetrics.user_id == user_settings.id).order_by(FitbitDailyMetrics.date.desc()).first()
            if latest:
                readiness_score = latest.readiness_score
                fitbit_last_sync = latest.updated_at or latest.created_at
        elif demo_mode:
            from src.services.fitbit_service import FitbitService
            metrics = FitbitService.demo_metrics(date.today())
            readiness_score = FitbitService.compute_readiness(metrics) or 88.0
        if user_settings.llm_config:
            biometrics_mode = user_settings.llm_config.get("agent_settings", {}).get("biometrics_mode", "intensity")
        today = date.today()
        pending_daily_items = db.query(DailyPlanEntry).filter(
            DailyPlanEntry.user_id == user_settings.user_id,
            DailyPlanEntry.date == today,
            DailyPlanEntry.completed == False
        ).count()

    onboarding = {}
    if user_settings and user_settings.llm_config:
        onboarding = user_settings.llm_config.get("agent_settings", {}).get("onboarding", {})

    return AgentStatusResponse(
        email_configured=email_configured,
        resend_configured=resend_configured,
        fitbit_connected=fitbit_connected,
        readiness_score=readiness_score,
        fitbit_last_sync=fitbit_last_sync,
        biometrics_mode=biometrics_mode,
        pending_daily_items=pending_daily_items,
        onboarding=onboarding or {}
    )


@router.get("/agent/history")
async def get_agent_history(user_id: str = Depends(get_request_user_id)):
    return {"history": memory_service.get_chat_history(user_id, limit=50)}


@router.get("/agent/negotiation-summary")
def get_negotiation_summary(user_id: str = Depends(get_request_user_id), db: Session = Depends(get_db)):
    from src.services.goal_negotiation_service import goal_negotiation_service
    goals = db.query(Goal).filter(Goal.user_id == user_id).order_by(Goal.priority.asc()).all()
    return {"pacing": goal_negotiation_service.compute_goal_pacing(goals)}


@router.get("/agent/email/logs")
def get_agent_email_logs(limit: int = 50, user_id: Optional[str] = Depends(get_request_user_id), db: Session = Depends(get_db)):
    query = db.query(AgentEmailMessage)
    if user_id:
        query = query.filter(AgentEmailMessage.user_id == user_id)
    logs = query.order_by(AgentEmailMessage.created_at.desc()).limit(limit).all()
    return {
        "logs": [
            {
                "id": l.id,
                "user_id": l.user_id,
                "direction": l.direction,
                "subject": l.subject,
                "from_email": l.from_email,
                "to_email": l.to_email,
                "body_text": l.body_text,
                "created_at": l.created_at
            } for l in logs
        ]
    }


@router.post("/agent/email/inbound")
async def inbound_agent_email(request: Request, db: Session = Depends(get_db)):
    """
    Inbound email webhook (Resend).
    Parses incoming email and routes to agent; replies back to sender.
    """
    try:
        payload = await request.json()
    except Exception:
        form = await request.form()
        payload = dict(form)

    from_email = payload.get("from") or payload.get("from_email")
    to_email = payload.get("to") or payload.get("to_email")
    subject = payload.get("subject") or "Agent reply"
    text = payload.get("text") or payload.get("body_text") or payload.get("body") or ""
    message_id = payload.get("message_id") or payload.get("message-id") or payload.get("Message-Id")

    user_id = "default_user"
    parsed_user_id = None
    if to_email and "+" in to_email:
        try:
            local = to_email.split("@")[0]
            token = local.split("+")[1]
            if token:
                parsed_user_id = token
                user_id = token
        except Exception:
            pass
    if payload.get("user_id") and parsed_user_id and payload.get("user_id") == parsed_user_id:
        user_id = payload.get("user_id")

    inbound = AgentEmailMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        direction="inbound",
        thread_id=message_id,
        subject=subject,
        from_email=from_email,
        to_email=to_email,
        body_text=text,
        metadata_=payload
    )
    db.add(inbound)
    db.commit()

    # Route into agent and send response
    if not from_email:
        return {"status": "received"}

    from src.models.orm import UserSettings
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()

    result = await goal_agent.process_message(user_id, text)
    response_text = result.get("message", "")
    reply_subject = f"Re: {subject}"
    reply_domain = (user_settings.resend_reply_domain if user_settings else None) or settings.email_reply_domain or os.getenv("RESEND_REPLY_DOMAIN")
    reply_to = f"agent+{user_id}@{reply_domain}" if reply_domain else None
    sent = await email_service.send_email(
        to_email=from_email,
        subject=reply_subject,
        html_content=response_text,
        api_key=user_settings.resend_api_key if user_settings else None,
        reply_to=reply_to
    )

    outbound = AgentEmailMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        direction="outbound",
        thread_id=message_id,
        subject=reply_subject,
        from_email=None,
        to_email=from_email,
        body_text=response_text,
        metadata_={"sent": sent}
    )
    db.add(outbound)
    db.commit()

    return {"status": "ok", "sent": sent}


@router.post("/agent/onboarding")
async def save_agent_onboarding(
    payload: AgentOnboardingRequest,
    user_id: str = Depends(get_request_user_id),
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
    user_id: str = Depends(get_request_user_id),
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
    user_id: str = Depends(get_request_user_id),
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
    user_id: str = Depends(get_request_user_id)
):
    from src.services.memory_service import memory_service
    memory_service.update_scratchpad(payload.content, user_id=user_id)
    return {"status": "ok"}

