from __future__ import annotations

from datetime import datetime, timedelta, date
from src.utils.time import utcnow
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.orm import (
    Flashcard,
    StudySession,
    StudyReview,
    Goal,
    FocusSession,
    PracticeSession,
    DailyPlanEntry,
)
from src.models.schemas import (
    DashboardOverviewResponse,
    DashboardPlanSummary,
    DashboardPlanItem,
    DashboardUpcomingReview,
    DashboardGoalPacingItem,
    DashboardFocusSummary,
    DashboardInsight,
)
from src.services.daily_plan_service import daily_plan_service


class DashboardService:
    def _today_range(self) -> tuple[datetime, datetime]:
        now = utcnow()
        start = datetime(year=now.year, month=now.month, day=now.day)
        end = start + timedelta(days=1)
        return start, end

    def _get_study_minutes(self, sessions: List[StudySession]) -> int:
        total_seconds = 0
        for session in sessions:
            if session.end_time and session.start_time:
                total_seconds += (session.end_time - session.start_time).total_seconds()
        return int(round(total_seconds / 60))

    def _get_practice_minutes(self, sessions: List[PracticeSession]) -> int:
        total_seconds = 0
        for session in sessions:
            if session.end_time and session.start_time:
                total_seconds += (session.end_time - session.start_time).total_seconds()
            else:
                total_seconds += (session.target_duration_minutes or 0) * 60
        return int(round(total_seconds / 60))

    def _get_focus_minutes(self, sessions: List[FocusSession]) -> int:
        return int(sum(s.duration_minutes or 0 for s in sessions))

    def _calculate_retention_rate(self, db: Session, start: Optional[datetime], end: Optional[datetime]) -> float:
        query = db.query(StudyReview)
        if start:
            query = query.filter(StudyReview.reviewed_at >= start)
        if end:
            query = query.filter(StudyReview.reviewed_at < end)
        total_reviews = query.count()
        if total_reviews == 0:
            return 0.0
        successful = query.filter(StudyReview.rating >= 3).count()
        return round((successful / total_reviews) * 100, 2)

    def _calculate_velocity(self, db: Session, start: Optional[datetime], end: Optional[datetime]) -> float:
        mastered_cards = db.query(func.count(Flashcard.id)).filter(Flashcard.interval > 21).scalar() or 0
        sessions = db.query(StudySession)
        if start:
            sessions = sessions.filter(StudySession.start_time >= start)
        if end:
            sessions = sessions.filter(StudySession.start_time < end)
        sessions = sessions.filter(StudySession.end_time.isnot(None)).all()
        total_seconds = 0
        for session in sessions:
            if session.end_time and session.start_time:
                total_seconds += (session.end_time - session.start_time).total_seconds()
        total_hours = total_seconds / 3600
        return round(mastered_cards / max(total_hours, 0.1), 1)

    def _calculate_streak(self, db: Session) -> int:
        study_dates = db.query(func.date(StudySession.start_time).label("date")) \
            .group_by(func.date(StudySession.start_time)) \
            .order_by(func.date(StudySession.start_time).desc()) \
            .all()
        if not study_dates:
            return 0
        streak = 0
        current_date = utcnow().date()
        for study_date in study_dates:
            date_val = study_date.date
            if isinstance(date_val, datetime):
                date_val = date_val.date()
            if date_val == current_date or date_val == current_date - timedelta(days=1):
                streak += 1
                current_date = date_val
            else:
                break
        return streak

    def _build_insights(
        self,
        due_today: int,
        retention_rate: float,
        focus_minutes_today: int,
        goal_pacing: List[DashboardGoalPacingItem],
        streak_status: Dict[str, object],
    ) -> List[DashboardInsight]:
        insights: List[DashboardInsight] = []

        if due_today >= 20:
            insights.append(DashboardInsight(
                id="backlog",
                title="Review backlog building",
                message=f"You have {due_today} cards due today. A 20‑minute review sprint will reduce tomorrow’s load.",
                action_label="Start reviews",
                action_route="/practice",
                severity="warning"
            ))

        if retention_rate and retention_rate < 70:
            insights.append(DashboardInsight(
                id="retention",
                title="Retention dip",
                message="Your recall accuracy is trending low. Slow down and use more active recall on difficult cards.",
                action_label="Review insights",
                action_route="/analytics",
                severity="warning"
            ))

        if focus_minutes_today < 20:
            insights.append(DashboardInsight(
                id="focus",
                title="No deep work yet",
                message="A single 25‑minute focus block can reset momentum today.",
                action_label="Start focus",
                action_route="/practice",
                severity="info"
            ))

        if any(item.status in ["at_risk", "overdue"] for item in goal_pacing):
            insights.append(DashboardInsight(
                id="goal-risk",
                title="Goal pacing risk",
                message="One of your goals is behind schedule. Adjust today’s plan to protect the deadline.",
                action_label="View goals",
                action_route="/learning-path",
                severity="warning"
            ))

        if streak_status.get("at_risk"):
            insights.append(DashboardInsight(
                id="streak",
                title="Streak at risk",
                message="Study today to keep your streak alive.",
                action_label="Study now",
                action_route="/practice",
                severity="warning"
            ))

        return insights[:3]

    def build_overview(self, db: Session, user_id: str = "default_user") -> DashboardOverviewResponse:
        today_start, today_end = self._today_range()
        week_start = today_start - timedelta(days=6)

        # Daily plan (may create if missing)
        plan_data = daily_plan_service.build_daily_plan(db, user_id)
        plan_items = [
            DashboardPlanItem(
                id=item["id"],
                title=item["title"],
                item_type=item["item_type"],
                duration_minutes=item["duration_minutes"],
                goal_id=item.get("goal_id"),
                notes=item.get("notes"),
                completed=item.get("completed", False),
                completed_at=item.get("completed_at")
            )
            for item in plan_data.get("items", [])
        ]

        total_minutes = sum(item.duration_minutes for item in plan_items)
        completed_minutes = sum(item.duration_minutes for item in plan_items if item.completed)
        completed_count = len([item for item in plan_items if item.completed])

        today_plan = DashboardPlanSummary(
            items=plan_items,
            total_count=len(plan_items),
            completed_count=completed_count,
            minutes_planned=total_minutes,
            minutes_completed=completed_minutes
        )

        # Reviews due today
        due_today = db.query(func.count(Flashcard.id)) \
            .filter(Flashcard.next_review <= today_end) \
            .scalar() or 0

        # Upcoming reviews
        upcoming_end = today_end + timedelta(days=7)
        upcoming = db.query(
            func.date(Flashcard.next_review).label("date"),
            func.count(Flashcard.id).label("count")
        ).filter(Flashcard.next_review >= today_start) \
         .filter(Flashcard.next_review < upcoming_end) \
         .group_by(func.date(Flashcard.next_review)) \
         .order_by(func.date(Flashcard.next_review)) \
         .all()

        upcoming_reviews = [
            DashboardUpcomingReview(
                date=row.date.isoformat() if hasattr(row.date, "isoformat") else str(row.date),
                count=row.count
            )
            for row in upcoming
        ]

        # Goal pacing
        goals = db.query(Goal).filter(Goal.user_id == user_id, Goal.status == "active").order_by(Goal.priority.asc()).all()
        goal_pacing: List[DashboardGoalPacingItem] = []
        today = utcnow().date()
        for goal in goals:
            remaining_hours = max(goal.target_hours - goal.logged_hours, 0)
            status = "on_track"
            days_remaining = None
            required_minutes_per_day = 0

            if goal.deadline:
                days_remaining = max((goal.deadline.date() - today).days, 0)
                if days_remaining == 0:
                    required_minutes_per_day = int(round(remaining_hours * 60))
                else:
                    required_minutes_per_day = int(round((remaining_hours * 60) / max(days_remaining, 1)))

                if goal.deadline.date() < today and remaining_hours > 0:
                    status = "overdue"
                elif required_minutes_per_day > 120:
                    status = "at_risk"
                else:
                    status = "on_track"
            else:
                status = "no_deadline"

            goal_pacing.append(DashboardGoalPacingItem(
                goal_id=goal.id,
                title=goal.title,
                deadline=goal.deadline,
                target_hours=goal.target_hours,
                logged_hours=goal.logged_hours,
                remaining_hours=remaining_hours,
                required_minutes_per_day=required_minutes_per_day,
                status=status,
                days_remaining=days_remaining
            ))

        # Focus summary
        focus_sessions_today = db.query(FocusSession).filter(
            FocusSession.user_id == user_id,
            FocusSession.start_time >= today_start,
            FocusSession.start_time < today_end,
            FocusSession.end_time.isnot(None)
        ).all()
        focus_sessions_week = db.query(FocusSession).filter(
            FocusSession.user_id == user_id,
            FocusSession.start_time >= week_start,
            FocusSession.start_time < today_end,
            FocusSession.end_time.isnot(None)
        ).all()

        practice_sessions_today = db.query(PracticeSession).filter(
            PracticeSession.user_id == user_id,
            PracticeSession.start_time >= today_start,
            PracticeSession.start_time < today_end,
            PracticeSession.end_time.isnot(None)
        ).all()
        practice_sessions_week = db.query(PracticeSession).filter(
            PracticeSession.user_id == user_id,
            PracticeSession.start_time >= week_start,
            PracticeSession.start_time < today_end,
            PracticeSession.end_time.isnot(None)
        ).all()

        study_sessions_today = db.query(StudySession).filter(
            StudySession.start_time >= today_start,
            StudySession.start_time < today_end,
            StudySession.end_time.isnot(None)
        ).all()
        study_sessions_week = db.query(StudySession).filter(
            StudySession.start_time >= week_start,
            StudySession.start_time < today_end,
            StudySession.end_time.isnot(None)
        ).all()

        focus_summary = DashboardFocusSummary(
            minutes_today=self._get_focus_minutes(focus_sessions_today),
            minutes_last_7_days=self._get_focus_minutes(focus_sessions_week),
            practice_minutes_today=self._get_practice_minutes(practice_sessions_today),
            practice_minutes_last_7_days=self._get_practice_minutes(practice_sessions_week),
            study_minutes_today=self._get_study_minutes(study_sessions_today),
            study_minutes_last_7_days=self._get_study_minutes(study_sessions_week)
        )

        # Streak status
        streak = self._calculate_streak(db)
        studied_today = db.query(StudySession).filter(func.date(StudySession.start_time) == today).first() is not None
        streak_status = {
            "streak": streak,
            "studied_today": studied_today,
            "at_risk": streak > 0 and not studied_today,
            "message": "🔥 Study now to protect your streak!" if streak > 0 and not studied_today else (
                f"🔥 {streak} day streak!" if streak > 0 else "Start your streak today!"
            )
        }

        retention_rate = self._calculate_retention_rate(db, week_start, today_end)
        velocity = self._calculate_velocity(db, week_start, today_end)

        insights = self._build_insights(
            due_today=due_today,
            retention_rate=retention_rate,
            focus_minutes_today=focus_summary.minutes_today,
            goal_pacing=goal_pacing,
            streak_status=streak_status
        )

        return DashboardOverviewResponse(
            today_plan=today_plan,
            due_today=due_today,
            upcoming_reviews=upcoming_reviews,
            goal_pacing=goal_pacing,
            focus_summary=focus_summary,
            insights=insights,
            retention_rate=retention_rate,
            velocity=velocity,
            streak_status=streak_status
        )


dashboard_service = DashboardService()
