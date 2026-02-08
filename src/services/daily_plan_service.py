"""
Daily plan service for goal-aligned study sessions.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List

from sqlalchemy.orm import Session

from src.models.orm import Goal, CurriculumTask, CurriculumWeek, Curriculum, Flashcard, UserSettings, DailyPlanEntry
from src.models.fitbit import FitbitToken, FitbitDailyMetrics
from src.services.fitbit_service import FitbitService


class DailyPlanService:
    def build_daily_plan(self, db: Session, user_id: str = "default_user"):
        today = date.today()
        items = []
        readiness_score = None
        biometrics_mode = "intensity"
        sleep_end_time = None

        user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        if user_settings and user_settings.llm_config:
            agent_settings = user_settings.llm_config.get("agent_settings", {})
            biometrics_mode = agent_settings.get("biometrics_mode", "intensity")
            auto_refresh = agent_settings.get("auto_refresh_fitbit", True)

            if user_settings.use_biometrics:
                token = db.query(FitbitToken).filter(FitbitToken.user_id == user_settings.id).first()
                if token:
                    if auto_refresh:
                        record = FitbitService(token).get_or_refresh_daily_summary(db, today)
                    else:
                        record = db.query(FitbitDailyMetrics).filter(
                            FitbitDailyMetrics.user_id == user_settings.id,
                            FitbitDailyMetrics.date == today
                        ).first()
                    if record:
                        readiness_score = record.readiness_score
                        if record.summary:
                            sleep_end_time = record.summary.get("sleep_end")

        # If plan entries already exist for today, return them
        existing_entries = db.query(DailyPlanEntry).filter(
            DailyPlanEntry.user_id == user_id,
            DailyPlanEntry.date == today
        ).order_by(DailyPlanEntry.created_at.asc()).all()
        if existing_entries:
            return {
                "date": today,
                "items": [
                    {
                        "id": e.id,
                        "title": e.title,
                        "item_type": e.item_type,
                        "duration_minutes": e.planned_minutes,
                        "source_id": e.item_id,
                        "notes": e.notes,
                        "completed": e.completed,
                        "completed_at": e.completed_at
                    } for e in existing_entries
                ],
                "readiness_score": readiness_score,
                "biometrics_mode": biometrics_mode
            }

        # 1) Pull active goals
        goals = db.query(Goal).filter(Goal.user_id == user_id, Goal.status == "active").order_by(Goal.priority.asc()).all()

        # 2) Pending curriculum tasks
        if goals:
            goal_ids = [g.id for g in goals]
            curriculums = db.query(Curriculum).filter(Curriculum.goal_id.in_(goal_ids)).all()
            curriculum_ids = [c.id for c in curriculums]
            if curriculum_ids:
                tasks = db.query(CurriculumTask).join(CurriculumWeek).filter(
                    CurriculumWeek.curriculum_id.in_(curriculum_ids),
                    CurriculumTask.status != "done"
                ).limit(3).all()
                for task in tasks:
                    items.append({
                        "id": str(uuid.uuid4()),
                        "title": task.title,
                        "item_type": "task",
                        "duration_minutes": task.estimate_minutes or 30,
                        "source_id": task.id,
                        "notes": task.notes
                    })

        # 3) Due cards
        due_cards = db.query(Flashcard).filter(Flashcard.next_review <= datetime.utcnow()).count()
        if due_cards > 0:
            items.append({
                "id": str(uuid.uuid4()),
                "title": f"Daily review: {due_cards} cards",
                "item_type": "review",
                "duration_minutes": min(45, max(15, int(due_cards * 2))),
                "source_id": None,
                "notes": "Interleaved active recall"
            })

        # 4) Default focus block if empty
        if not items:
            items.append({
                "id": str(uuid.uuid4()),
                "title": "Focus block: new concept exploration",
                "item_type": "focus",
                "duration_minutes": 45,
                "source_id": None,
                "notes": "Use active recall every 10–15 minutes."
            })

        # Apply biometrics personalization
        if biometrics_mode in ["intensity", "scheduling"] and readiness_score is not None:
            if readiness_score >= 75:
                multiplier = 1.2
                readiness_tag = "High readiness"
            elif readiness_score >= 50:
                multiplier = 1.0
                readiness_tag = "Steady readiness"
            else:
                multiplier = 0.7
                readiness_tag = "Low readiness"

            for item in items:
                base = item.get("duration_minutes", 30)
                adjusted = int(max(15, min(90, round(base * multiplier))))
                item["duration_minutes"] = adjusted
                note = item.get("notes") or ""
                item["notes"] = f"{note} ({readiness_tag})".strip()

        if biometrics_mode == "insights" and readiness_score is not None:
            for item in items:
                note = item.get("notes") or ""
                item["notes"] = f"{note} (Readiness: {readiness_score})".strip()

        if biometrics_mode == "scheduling" and sleep_end_time:
            for item in items:
                note = item.get("notes") or ""
                item["notes"] = f"{note} Suggested start: {sleep_end_time}".strip()

        # Persist entries for the day
        entries = []
        for item in items:
            entry = DailyPlanEntry(
                id=item.get("id"),
                user_id=user_id,
                date=today,
                item_id=item.get("source_id"),
                title=item.get("title"),
                item_type=item.get("item_type"),
                goal_id=item.get("goal_id"),
                planned_minutes=item.get("duration_minutes"),
                completed=False,
                notes=item.get("notes")
            )
            db.add(entry)
            entries.append(entry)
        db.commit()

        return {
            "date": today,
            "items": [
                {
                    "id": e.id,
                    "title": e.title,
                    "item_type": e.item_type,
                    "duration_minutes": e.planned_minutes,
                    "source_id": e.item_id,
                    "notes": e.notes,
                    "completed": e.completed,
                    "completed_at": e.completed_at
                } for e in entries
            ],
            "readiness_score": readiness_score,
            "biometrics_mode": biometrics_mode
        }


daily_plan_service = DailyPlanService()
