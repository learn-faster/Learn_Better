from datetime import datetime, timedelta
from src.utils.time import utcnow
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from src.models.orm import Goal, FocusSession, Flashcard, StudyReview, UserSettings, Curriculum, CurriculumWeek, CurriculumCheckpoint
from src.database.orm import SessionLocal
from src.services.email_service import email_service


def build_weekly_digest_payload(db: Session, user_settings: UserSettings) -> Dict[str, Any]:
    week_ago = utcnow() - timedelta(days=7)

    focus_sessions = db.query(FocusSession).filter(
        FocusSession.start_time >= week_ago,
        FocusSession.end_time.isnot(None)
    ).all()
    hours_logged = sum(s.duration_minutes for s in focus_sessions) / 60.0

    cards_reviewed = db.query(StudyReview).filter(
        StudyReview.reviewed_at >= week_ago
    ).count()

    streak = user_settings.current_streak or 0

    active_goals = db.query(Goal).filter(Goal.status == "active").all()
    goals_summary = [
        {"title": g.title, "progress": g.logged_hours / g.target_hours * 100 if g.target_hours > 0 else 0}
        for g in active_goals[:3]
    ]

    curriculums = db.query(Curriculum).filter(Curriculum.status.in_(["active", "completed"])).all()
    curriculum_summary = []
    for curr in curriculums[:3]:
        weeks = db.query(CurriculumWeek).filter(CurriculumWeek.curriculum_id == curr.id).all()
        total_weeks = len(weeks)
        completed_weeks = len([w for w in weeks if w.status == "completed"])
        progress = (completed_weeks / total_weeks * 100) if total_weeks > 0 else (curr.progress * 100)
        next_cp = None
        for w in sorted(weeks, key=lambda x: x.week_index):
            for cp in w.checkpoints:
                if cp.status != "completed":
                    next_cp = cp
                    break
            if next_cp:
                break
        curriculum_summary.append({
            "title": curr.title,
            "progress": progress,
            "next_checkpoint": next_cp.title if next_cp else "All done",
            "next_due": next_cp.due_date.isoformat() if next_cp and next_cp.due_date else "—"
        })

    return {
        "hours_logged": hours_logged,
        "cards_reviewed": cards_reviewed,
        "streak": streak,
        "goals_summary": goals_summary,
        "curriculum_summary": curriculum_summary
    }


async def send_weekly_digest_for_user(db: Session, user_settings: UserSettings) -> bool:
    payload = build_weekly_digest_payload(db, user_settings)
    return await email_service.send_weekly_digest(
        user_settings.email,
        payload["hours_logged"],
        payload["cards_reviewed"],
        payload["streak"],
        payload["goals_summary"],
        payload["curriculum_summary"],
        api_key=user_settings.resend_api_key
    )


async def send_weekly_digest_for_user_id(user_id: str) -> bool:
    db = SessionLocal()
    try:
        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        if not user_settings or not user_settings.email:
            return False
        return await send_weekly_digest_for_user(db, user_settings)
    finally:
        db.close()
