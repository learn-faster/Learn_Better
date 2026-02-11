from __future__ import annotations

from datetime import datetime
from src.utils.time import utcnow
from typing import List, Dict, Any

from src.models.orm import Goal


class GoalNegotiationService:
    """
    Compute pacing and negotiation insights for short/near/long goals.
    """
    def compute_goal_pacing(self, goals: List[Goal]) -> List[Dict[str, Any]]:
        results = []
        now = utcnow()
        for g in goals:
            days_remaining = None
            required_daily_hours = None
            if g.deadline:
                days_remaining = max(0, (g.deadline - now).days)
                if days_remaining > 0 and g.target_hours and g.target_hours > 0:
                    hours_remaining = max(0.0, g.target_hours - g.logged_hours)
                    required_daily_hours = round(hours_remaining / days_remaining, 2)
            results.append({
                "goal_id": g.id,
                "title": g.title,
                "status": g.status,
                "priority": g.priority,
                "days_remaining": days_remaining,
                "required_daily_hours": required_daily_hours,
                "short_term_goals": g.short_term_goals or [],
                "near_term_goals": g.near_term_goals or [],
                "long_term_goals": g.long_term_goals or []
            })
        return results


goal_negotiation_service = GoalNegotiationService()
