from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from src.models.orm import Flashcard, Curriculum, CurriculumWeek, CurriculumTask, PracticeSession, PracticeItem, UserSettings
from src.services.cognitive_service import cognitive_service
from src.services.srs_service import SRSService


@dataclass
class PracticeComposition:
    session: PracticeSession
    items: List[PracticeItem]
    source_mix: Dict[str, int]


class PracticeEngineService:
    def __init__(self) -> None:
        self.srs = SRSService()

    def _resolve_duration(self, mode: str, duration_override: Optional[int]) -> Tuple[int, int]:
        mode = (mode or "focus").lower()
        mode_map = {"quick": 12, "focus": 25, "deep": 40}
        default_minutes = mode_map.get(mode, 25)
        if duration_override:
            minutes = max(5, min(180, duration_override))
        else:
            minutes = default_minutes
        # ~2.5 minutes per item, clamp to [8, 60]
        item_count = max(8, min(60, round(minutes / 2.5)))
        return minutes, item_count

    def _fetch_due_flashcards(self, db: Session, limit: int) -> List[Flashcard]:
        from datetime import datetime
        now = datetime.utcnow()
        return db.query(Flashcard).filter(Flashcard.next_review <= now).order_by(Flashcard.next_review).limit(limit).all()

    def _fetch_curriculum_tasks(self, db: Session, user_id: str, goal_id: Optional[str], curriculum_id: Optional[str], limit: int) -> List[CurriculumTask]:
        curr_query = db.query(Curriculum).filter(Curriculum.user_id == user_id)
        if curriculum_id:
            curr_query = curr_query.filter(Curriculum.id == curriculum_id)
        elif goal_id:
            curr_query = curr_query.filter(Curriculum.goal_id == goal_id)

        curriculums = curr_query.all()
        if not curriculums:
            return []

        curriculum_ids = [c.id for c in curriculums]
        tasks = (
            db.query(CurriculumTask)
            .join(CurriculumWeek, CurriculumTask.week_id == CurriculumWeek.id)
            .filter(CurriculumWeek.curriculum_id.in_(curriculum_ids))
            .filter(CurriculumTask.task_type.in_(["practice", "quiz", "review"]))
            .filter(CurriculumTask.status != "done")
            .order_by(CurriculumWeek.week_index.asc())
            .limit(limit)
            .all()
        )
        return tasks

    def _fetch_frontier_concepts(self, user_id: str, limit: int) -> List[str]:
        frontier = cognitive_service.get_growth_frontier(user_id)
        names = [c.get("name") for c in frontier if c.get("name")]
        return names[:limit]

    def _interleave(self, buckets: List[List[dict]], total: int) -> List[dict]:
        result = []
        bucket_index = 0
        while len(result) < total and any(buckets):
            bucket = buckets[bucket_index % len(buckets)]
            if bucket:
                result.append(bucket.pop(0))
            bucket_index += 1
        return result

    def compose_session(
        self,
        db: Session,
        user_id: str,
        mode: str = "focus",
        goal_id: Optional[str] = None,
        curriculum_id: Optional[str] = None,
        duration_minutes: Optional[int] = None,
    ) -> PracticeComposition:
        minutes, item_count = self._resolve_duration(mode, duration_minutes)

        srs_target = int(item_count * 0.45)
        curriculum_target = int(item_count * 0.35)
        graph_target = max(1, item_count - srs_target - curriculum_target)

        flashcards = self._fetch_due_flashcards(db, srs_target * 2)
        tasks = self._fetch_curriculum_tasks(db, user_id, goal_id, curriculum_id, curriculum_target * 2)
        frontier = self._fetch_frontier_concepts(user_id, graph_target * 2)

        srs_items = [
            {
                "item_type": "flashcard",
                "source_id": card.id,
                "prompt": card.front,
                "expected_answer": card.back,
                "metadata_json": {"document_id": card.document_id}
            }
            for card in flashcards
        ]

        task_items = [
            {
                "item_type": "curriculum_task",
                "source_id": task.id,
                "prompt": f"{task.title}\n\nNotes: {task.notes or 'Use active recall and self-explanation.'}",
                "expected_answer": None,
                "metadata_json": {"week_id": task.week_id, "task_type": task.task_type}
            }
            for task in tasks
        ]

        graph_items = [
            {
                "item_type": "graph_prompt",
                "source_id": concept,
                "prompt": f"Explain {concept} in your own words and give one concrete example.",
                "expected_answer": None,
                "metadata_json": {"concept": concept}
            }
            for concept in frontier
        ]

        buckets = [srs_items, task_items, graph_items]
        blended = self._interleave(buckets, item_count)

        session = PracticeSession(
            id=str(__import__("uuid").uuid4()),
            user_id=user_id,
            goal_id=goal_id,
            curriculum_id=curriculum_id,
            mode=mode,
            target_duration_minutes=minutes,
            start_time=datetime.utcnow(),
            stats_json={}
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        items = []
        for item in blended:
            obj = PracticeItem(
                id=str(__import__("uuid").uuid4()),
                session_id=session.id,
                item_type=item["item_type"],
                source_id=item.get("source_id"),
                prompt=item["prompt"],
                expected_answer=item.get("expected_answer"),
                metadata_json=item.get("metadata_json") or {},
            )
            db.add(obj)
            items.append(obj)

        db.commit()
        for item in items:
            db.refresh(item)

        source_mix = {
            "flashcard": len([i for i in items if i.item_type == "flashcard"]),
            "curriculum_task": len([i for i in items if i.item_type == "curriculum_task"]),
            "graph_prompt": len([i for i in items if i.item_type == "graph_prompt"]),
        }

        return PracticeComposition(session=session, items=items, source_mix=source_mix)

    def score_item(
        self,
        db: Session,
        item: PracticeItem,
        response_text: Optional[str],
        rating: Optional[int],
        time_taken: Optional[int],
    ) -> Dict[str, Optional[float]]:
        from datetime import datetime
        score = 0.0
        feedback = None
        next_review = None

        if time_taken is not None:
            item.time_taken = time_taken
        if response_text is not None:
            item.response = response_text

        if item.item_type == "flashcard":
            if rating is None:
                rating = 3
            flashcard = db.query(Flashcard).filter(Flashcard.id == item.source_id).first()
            if flashcard:
                from src.models.orm import StudyReview
                new_ease, new_interval, new_reps, next_review_date = self.srs.calculate_next_review(
                    ease_factor=flashcard.ease_factor,
                    interval=flashcard.interval,
                    repetitions=flashcard.repetitions,
                    rating=rating,
                    target_retention=_get_target_retention(db, item.session.user_id),
                )
                flashcard.ease_factor = new_ease
                flashcard.interval = new_interval
                flashcard.repetitions = new_reps
                flashcard.next_review = next_review_date
                flashcard.last_review = datetime.utcnow()
                review = StudyReview(
                    session_id=None,
                    flashcard_id=flashcard.id,
                    rating=rating,
                    time_taken=time_taken or 0,
                )
                db.add(review)
                next_review = next_review_date
                score = (rating or 0) / 5.0
                feedback = _rating_feedback(rating)
        else:
            if rating is not None:
                score = rating / 5.0
                feedback = _rating_feedback(rating)
            elif response_text and item.expected_answer:
                score = _simple_overlap_score(item.expected_answer, response_text)
                feedback = "Response captured. Keep focusing on key ideas."
            else:
                score = 0.4 if response_text else 0.0
                feedback = "Response recorded." if response_text else "No response recorded."

        item.score = score
        db.commit()
        db.refresh(item)

        return {"score": score, "feedback": feedback, "next_review": next_review}


practice_engine_service = PracticeEngineService()


def _rating_feedback(rating: Optional[int]) -> str:
    if rating is None:
        return "Recorded."
    if rating >= 5:
        return "Perfect recall."
    if rating >= 4:
        return "Strong recall. Keep going."
    if rating >= 3:
        return "Partial recall. Review key ideas."
    if rating >= 2:
        return "Struggling recall. Slow down and re-encode."
    return "No recall. Consider revisiting the material."


def _simple_overlap_score(expected: str, response: str) -> float:
    if not expected or not response:
        return 0.0
    exp = set(expected.lower().split())
    resp = set(response.lower().split())
    if not exp:
        return 0.0
    overlap = len(exp.intersection(resp)) / max(1, len(exp))
    return min(1.0, max(0.0, overlap))


def _get_target_retention(db: Session, user_id: str) -> float:
    settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    return settings.target_retention if settings else 0.9

