from datetime import datetime
from src.utils.time import utcnow
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.database.orm import get_db
from src.models.orm import PracticeSession, PracticeItem
from src.models.schemas import (
    PracticeSessionCreate,
    PracticeSessionStartResponse,
    PracticeSessionItem,
    PracticeItemSubmit,
    PracticeItemResult,
    PracticeSessionEnd,
    PracticeSessionSummary,
    PracticeHistoryResponse,
    PracticeHistoryItem,
)
from src.services.practice_engine_service import practice_engine_service
from src.dependencies import get_request_user_id

router = APIRouter(prefix="/api/practice", tags=["practice"])


@router.post("/session", response_model=PracticeSessionStartResponse)
def create_practice_session(
    payload: PracticeSessionCreate,
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    try:
        comp = practice_engine_service.compose_session(
            db=db,
            user_id=user_id,
            mode=payload.mode,
            goal_id=payload.goal_id,
            curriculum_id=payload.curriculum_id,
            duration_minutes=payload.duration_minutes,
            concept_filters=payload.concept_filters,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    items = [PracticeSessionItem.model_validate(i) for i in comp.items]
    return PracticeSessionStartResponse(
        session_id=comp.session.id,
        target_duration_minutes=comp.session.target_duration_minutes,
        items=items,
        source_mix=comp.source_mix,
    )


@router.post("/session/{session_id}/item", response_model=PracticeItemResult)
def submit_practice_item(session_id: str, payload: PracticeItemSubmit, db: Session = Depends(get_db)):
    item = db.query(PracticeItem).filter(PracticeItem.id == payload.item_id).first()
    if not item or item.session_id != session_id:
        raise HTTPException(status_code=404, detail="Practice item not found")

    result = practice_engine_service.score_item(
        db=db,
        item=item,
        response_text=payload.response_text,
        rating=payload.rating,
        time_taken=payload.time_taken,
    )
    return PracticeItemResult(**result)


@router.post("/session/{session_id}/end", response_model=PracticeSessionSummary)
def end_practice_session(session_id: str, payload: PracticeSessionEnd, db: Session = Depends(get_db)):
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found")

    session.end_time = utcnow()
    if payload.reflection is not None:
        session.reflection = payload.reflection
    if payload.effectiveness_rating is not None:
        session.effectiveness_rating = payload.effectiveness_rating

    items = db.query(PracticeItem).filter(PracticeItem.session_id == session_id).all()
    completed = [i for i in items if i.response or i.score > 0]
    avg_score = round(sum([i.score for i in completed]) / len(completed), 3) if completed else 0.0
    total_time = sum([i.time_taken or 0 for i in items])
    session.stats_json = {
        "items_completed": len(completed),
        "average_score": avg_score,
        "total_time_seconds": total_time,
    }
    db.commit()
    db.refresh(session)

    return PracticeSessionSummary(
        session_id=session.id,
        start_time=session.start_time,
        end_time=session.end_time,
        mode=session.mode,
        target_duration_minutes=session.target_duration_minutes,
        items_completed=session.stats_json.get("items_completed", 0),
        average_score=session.stats_json.get("average_score", 0.0),
        total_time_seconds=session.stats_json.get("total_time_seconds", 0),
        reflection=session.reflection,
        effectiveness_rating=session.effectiveness_rating,
    )


@router.get("/history", response_model=PracticeHistoryResponse)
def get_practice_history(
    limit: int = 20,
    user_id: str = Depends(get_request_user_id),
    db: Session = Depends(get_db)
):
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == user_id)
        .order_by(PracticeSession.start_time.desc())
        .limit(limit)
        .all()
    )
    items = []
    for s in sessions:
        stats = s.stats_json or {}
        items.append(PracticeHistoryItem(
            session_id=s.id,
            start_time=s.start_time,
            end_time=s.end_time,
            mode=s.mode,
            items_completed=stats.get("items_completed", 0),
            average_score=stats.get("average_score", 0.0),
        ))
    return PracticeHistoryResponse(items=items)

