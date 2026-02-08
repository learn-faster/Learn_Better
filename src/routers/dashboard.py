"""
Dashboard Router for LearnFast Core.
Provides consolidated dashboard data for the UI.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database.orm import get_db
from src.models.schemas import DashboardOverviewResponse
from src.services.dashboard_service import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_dashboard_overview(user_id: str = "default_user", db: Session = Depends(get_db)):
    """
    Returns consolidated dashboard data for the Actionable Today view.
    """
    return dashboard_service.build_overview(db, user_id)
