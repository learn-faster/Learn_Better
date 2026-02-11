from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import requests
import os
from datetime import datetime, date, timezone
from src.utils.time import utcnow
from src.services.fitbit_service import FitbitService
from src.models.fitbit import FitbitToken, FitbitDailyMetrics
from src.database.orm import get_db
from src.models.orm import UserSettings
from src.config import settings
import urllib.parse

router = APIRouter()


def get_fitbit_redirect_uri(user_settings=None) -> str:
    """Get Fitbit redirect URI from settings or environment."""
    # Priority: user_settings > FITBIT_REDIRECT_URI env > settings.fitbit_redirect_uri > auto-build from FRONTEND_URL
    if user_settings and user_settings.fitbit_redirect_uri:
        return user_settings.fitbit_redirect_uri

    env_uri = os.getenv('FITBIT_REDIRECT_URI')
    if env_uri:
        return env_uri

    if settings.fitbit_redirect_uri:
        return settings.fitbit_redirect_uri

    # Auto-build from frontend_url
    frontend = settings.frontend_url or os.getenv("FRONTEND_URL", "http://localhost:5173")
    return f"{frontend.rstrip('/')}/api/fitbit/callback"

@router.get("/auth")
def fitbit_auth(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """Initiate Fitbit OAuth flow."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()

    client_id = user_settings.fitbit_client_id if user_settings and user_settings.fitbit_client_id else os.getenv('FITBIT_CLIENT_ID')
    redirect_uri = get_fitbit_redirect_uri(user_settings)

    if not client_id:
        from src.utils.logger import logger
        logger.warning(f"Fitbit auth initiated but client_id is not set")

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "activity sleep heartrate",
        "state": user_id  # Preserve user_id context
    }
    url = f"https://www.fitbit.com/oauth2/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=url)

@router.get("/callback")
def fitbit_callback(
    code: str,
    state: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Handle Fitbit OAuth callback and store tokens."""
    # Use state as user_id to maintain context across redirect
    user_id = state or "default_user"
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    
    client_id = user_settings.fitbit_client_id if user_settings and user_settings.fitbit_client_id else os.getenv('FITBIT_CLIENT_ID')
    client_secret = user_settings.fitbit_client_secret if user_settings and user_settings.fitbit_client_secret else os.getenv('FITBIT_CLIENT_SECRET')
    redirect_uri = get_fitbit_redirect_uri(user_settings)

    data = {
        'client_id': client_id,
        'grant_type': 'authorization_code',
        'redirect_uri': redirect_uri,
        'code': code
    }
    auth = (client_id, client_secret)
    response = requests.post('https://api.fitbit.com/oauth2/token', data=data, auth=auth)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get token from Fitbit")

    tokens = response.json()
    access_token = tokens['access_token']
    refresh_token = tokens['refresh_token']
    expires_in = tokens['expires_in']
    scope = tokens['scope']
    expires_at = int(utcnow().timestamp() + expires_in)

    # Find or create user settings
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        user_settings = UserSettings(user_id=user_id)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)

    # Upsert Fitbit token
    fitbit_token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
    if fitbit_token:
        fitbit_token.access_token = access_token
        fitbit_token.refresh_token = refresh_token
        fitbit_token.expires_at = expires_at
        fitbit_token.scope = scope
    else:
        fitbit_token = FitbitToken(
            user_id=user_settings.id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            scope=scope
        )
        db.add(fitbit_token)
    db.commit()

    # Redirect to frontend using settings
    frontend_url = settings.frontend_url or os.getenv("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(url=f"{frontend_url.rstrip('/')}/settings?fitbit_connected=true")

@router.delete("/disconnect")
def disconnect_fitbit(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """Disconnect Fitbit and remove stored tokens."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        raise HTTPException(status_code=404, detail="User not found")

    fitbit_token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
    if fitbit_token:
        db.delete(fitbit_token)
        db.commit()
        return {"message": "Fitbit disconnected successfully"}
    else:
        raise HTTPException(status_code=404, detail="Fitbit token not found")

@router.get("/status")
def get_fitbit_status(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """Check if Fitbit is connected for the current user."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        return {"connected": False}
    demo_mode = bool(user_settings.llm_config.get("agent_settings", {}).get("fitbit_demo_mode")) if user_settings.llm_config else False
    
    token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
    if demo_mode:
        return {"connected": True, "demo_mode": True}
    return {"connected": token is not None}


@router.get("/summary")
def get_fitbit_summary(
    date_str: Optional[str] = None,
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """Return stored Fitbit daily summary, fetching if missing."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        return {"connected": False}
    demo_mode = bool(user_settings.llm_config.get("agent_settings", {}).get("fitbit_demo_mode")) if user_settings.llm_config else False

    token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
    if demo_mode:
        target_date = date.today()
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        metrics = FitbitService.demo_metrics(target_date)
        readiness_score = FitbitService.compute_readiness(metrics) or 88.0
        return {
            "connected": True,
            "demo_mode": True,
            "date": metrics["date"],
            "sleep_duration_hours": metrics["sleep_duration_hours"],
            "sleep_efficiency": metrics["sleep_efficiency"],
            "resting_heart_rate": metrics["resting_heart_rate"],
            "readiness_score": readiness_score,
            "summary": metrics,
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }
    if not token:
        return {"connected": False}

    target_date = date.today()
    if date_str:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

    fb_service = FitbitService(token)
    record = fb_service.get_or_refresh_daily_summary(db, target_date)
    if not record:
        return {"connected": True, "date": target_date.isoformat(), "readiness_score": None}

    return {
        "connected": True,
        "date": record.date.isoformat(),
        "sleep_duration_hours": record.sleep_duration_hours,
        "sleep_efficiency": record.sleep_efficiency,
        "resting_heart_rate": record.resting_heart_rate,
        "readiness_score": record.readiness_score,
        "summary": record.summary,
        "last_synced_at": record.updated_at or record.created_at
    }


@router.post("/refresh")
def refresh_fitbit_summary(
    user_id: str = "default_user",
    db: Session = Depends(get_db)
):
    """Force refresh today's Fitbit summary."""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not user_settings:
        raise HTTPException(status_code=404, detail="User not found")
    demo_mode = bool(user_settings.llm_config.get("agent_settings", {}).get("fitbit_demo_mode")) if user_settings.llm_config else False

    token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
    if demo_mode:
        metrics = FitbitService.demo_metrics(date.today())
        readiness_score = FitbitService.compute_readiness(metrics) or 88.0
        return {
            "connected": True,
            "demo_mode": True,
            "date": metrics["date"],
            "sleep_duration_hours": metrics["sleep_duration_hours"],
            "sleep_efficiency": metrics["sleep_efficiency"],
            "resting_heart_rate": metrics["resting_heart_rate"],
            "readiness_score": readiness_score,
            "summary": metrics,
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }
    if not token:
        raise HTTPException(status_code=404, detail="Fitbit token not found")

    fb_service = FitbitService(token)
    record = fb_service.get_or_refresh_daily_summary(db, date.today(), force_refresh=True)
    if not record:
        raise HTTPException(status_code=400, detail="Failed to refresh Fitbit summary")

    return {
        "connected": True,
        "date": record.date.isoformat(),
        "sleep_duration_hours": record.sleep_duration_hours,
        "sleep_efficiency": record.sleep_efficiency,
        "resting_heart_rate": record.resting_heart_rate,
        "readiness_score": record.readiness_score,
        "summary": record.summary,
        "last_synced_at": record.updated_at or record.created_at
    }
