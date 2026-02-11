from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from src.database.orm import get_db
from src.models.schemas import (
    CurriculumResponse,
    CurriculumGenerateRequest,
    CurriculumModuleResponse,
    CurriculumTimelineResponse,
    CurriculumCheckpointResponse,
    CurriculumMetricsResponse,
    CurriculumTaskResponse,
    CurriculumWeekReportResponse,
    DocumentQuizSessionResponse,
    LLMConfig
)
from src.models.orm import CurriculumCheckpoint, CurriculumTask, CurriculumWeek, Document, DocumentQuizItem, DocumentQuizSession, DocumentStudySettings
from src.database.graph_storage import multi_doc_graph_storage
from src.services.llm_service import llm_service
from src.services.prompts import CLOZE_GENERATION_PROMPT_TEMPLATE
import uuid
import json
import re
from src.services.curriculum_service import curriculum_service
from src.dependencies import get_request_user_id

router = APIRouter(prefix="/api/curriculum", tags=["Curriculum"])

@router.post("/generate", response_model=CurriculumResponse)
async def generate_curriculum(
    request: CurriculumGenerateRequest,
    db: Session = Depends(get_db)
):
    """
    Generates a new adaptive learning plan with weekly checkpoints.
    """
    try:
        start_date = request.start_date if request.start_date else None
        curriculum = await curriculum_service.generate_curriculum(
            db,
            goal=request.title,
            user_id=request.user_id,
            document_id=request.document_id,
            document_ids=request.document_ids,
            duration_weeks=request.duration_weeks,
            time_budget_hours_per_week=request.time_budget_hours_per_week,
            start_date_value=start_date,
            llm_enhance=request.llm_enhance,
            config=request.llm_config,
            gating_mode=request.gating_mode or "recommend"
        )
        return curriculum
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[CurriculumResponse])
def list_curriculums(user_id: str = Depends(get_request_user_id), db: Session = Depends(get_db)):
    return curriculum_service.get_user_curriculums(db, user_id)

@router.get("/{curriculum_id}", response_model=CurriculumResponse)
def get_curriculum(curriculum_id: str, db: Session = Depends(get_db)):
    curriculum = curriculum_service.get_curriculum(db, curriculum_id)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return curriculum


@router.get("/{curriculum_id}/timeline", response_model=CurriculumTimelineResponse)
def get_curriculum_timeline(curriculum_id: str, db: Session = Depends(get_db)):
    curriculum = curriculum_service.get_curriculum(db, curriculum_id)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    weeks = curriculum_service.get_curriculum_timeline(db, curriculum_id)
    return {"curriculum_id": curriculum_id, "weeks": weeks}


@router.get("/{curriculum_id}/graph")
def get_curriculum_graph(curriculum_id: str, db: Session = Depends(get_db)):
    curriculum = curriculum_service.get_curriculum(db, curriculum_id)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    doc_ids = curriculum.document_ids or ([] if not curriculum.document_id else [curriculum.document_id])
    nodes = {}
    links = []

    for doc_id in doc_ids:
        doc_graph = multi_doc_graph_storage.get_document_graph(doc_id)
        if not doc_graph:
            continue
        for concept in doc_graph.get("concepts", []):
            node_id = concept.get("scoped_id") or concept.get("id") or concept.get("name")
            if not node_id:
                continue
            nodes[node_id] = {
                "id": node_id,
                "label": concept.get("name") or concept.get("global_name") or node_id,
                "doc_id": doc_id
            }
        for rel in doc_graph.get("relationships", []):
            source = rel.get("source")
            target = rel.get("target")
            if source and target:
                links.append({
                    "source": source,
                    "target": target,
                    "weight": rel.get("weight")
                })

    return {
        "curriculum_id": curriculum_id,
        "nodes": list(nodes.values()),
        "links": links
    }


@router.post("/checkpoint/{checkpoint_id}/complete", response_model=CurriculumCheckpointResponse)
def complete_checkpoint(checkpoint_id: str, db: Session = Depends(get_db)):
    checkpoint = curriculum_service.complete_checkpoint(db, checkpoint_id)
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return checkpoint


@router.get("/{curriculum_id}/metrics", response_model=CurriculumMetricsResponse)
def get_curriculum_metrics(curriculum_id: str, db: Session = Depends(get_db)):
    metrics = curriculum_service.get_metrics(db, curriculum_id)
    return metrics


@router.post("/task/{task_id}/toggle", response_model=CurriculumTaskResponse)
def toggle_task(task_id: str, db: Session = Depends(get_db)):
    try:
        task = curriculum_service.toggle_task_status(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task
    except Exception as e:
        if getattr(e, "reason", None):
            raise HTTPException(status_code=409, detail=e.reason)
        raise


@router.get("/week/{week_id}/report", response_model=CurriculumWeekReportResponse)
def get_week_report(week_id: str, db: Session = Depends(get_db)):
    report = curriculum_service.get_week_report(db, week_id)
    if not report:
        raise HTTPException(status_code=404, detail="Week not found")
    return report


def _fallback_generate_items(text: str, count: int):
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if len(p.strip()) > 80]
    items = []
    for p in paragraphs[:count]:
        words = p.split()
        masked = []
        for w in words:
            if len(w) > 6 and len(masked) < 3:
                masked.append("[[blank]]")
            else:
                masked.append(w)
        items.append({
            "passage_markdown": p,
            "masked_markdown": " ".join(masked),
            "answer_key": ["Key ideas from passage"],
        })
    return items


@router.post("/checkpoint/{checkpoint_id}/start-recall", response_model=DocumentQuizSessionResponse)
async def start_checkpoint_recall(checkpoint_id: str, db: Session = Depends(get_db)):
    checkpoint = db.query(CurriculumCheckpoint).filter(CurriculumCheckpoint.id == checkpoint_id).first()
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    # Determine document for recall
    doc_ids = checkpoint.linked_doc_ids or []
    if not doc_ids:
        week = checkpoint.week
        if week and week.curriculum:
            doc_ids = week.curriculum.document_ids or []

    if not doc_ids:
        raise HTTPException(status_code=400, detail="No document linked to this checkpoint")

    document_id = doc_ids[0]
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document or not document.extracted_text:
        raise HTTPException(status_code=400, detail="Document text not available")

    # Use document study settings if available
    llm_config = None
    settings_row = db.query(DocumentStudySettings).filter(DocumentStudySettings.document_id == document_id).first()
    if settings_row and settings_row.llm_config:
        try:
            config_dict = settings_row.llm_config
            if isinstance(config_dict, dict) and config_dict.get("global"):
                config_dict = config_dict.get("global") or config_dict
            llm_config = LLMConfig(**config_dict)
        except Exception:
            llm_config = None

    # Get latest quiz items or generate new ones if not enough
    items = db.query(DocumentQuizItem).filter(
        DocumentQuizItem.document_id == document_id
    ).order_by(DocumentQuizItem.created_at.desc()).limit(5).all()

    if len(items) < 3:
        prompt = CLOZE_GENERATION_PROMPT_TEMPLATE.format(
            count=5,
            text=document.extracted_text[:12000]
        )
        generated = []
        try:
            response = await llm_service.get_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                response_format="json",
                config=llm_config
            )
            data = llm_service._extract_and_parse_json(response)
            if isinstance(data, dict):
                data = data.get("items") or []
            generated = data
        except Exception:
            generated = _fallback_generate_items(document.extracted_text, 5)

        items = []
        for raw in generated[:5]:
            quiz_item = DocumentQuizItem(
                id=str(uuid.uuid4()),
                document_id=document_id,
                mode="cloze",
                passage_markdown=raw.get("passage_markdown") or "",
                masked_markdown=raw.get("masked_markdown"),
                answer_key=raw.get("answer_key") or [],
                tags=[],
                difficulty=3,
                source_span={"source": "checkpoint", "checkpoint_id": checkpoint_id}
            )
            db.add(quiz_item)
            items.append(quiz_item)
        db.commit()

    session = DocumentQuizSession(
        id=str(uuid.uuid4()),
        document_id=document_id,
        mode="cloze",
        settings=(settings_row.reveal_config if settings_row else {}),
        status="active"
    )
    db.add(session)
    db.commit()

    return DocumentQuizSessionResponse(
        id=session.id,
        document_id=document_id,
        mode=session.mode,
        settings=session.settings or {},
        status=session.status,
        items=items
    )

@router.delete("/{curriculum_id}")
def delete_curriculum(curriculum_id: str, db: Session = Depends(get_db)):
    success = curriculum_service.delete_curriculum(db, curriculum_id)
    if not success:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return {"status": "success"}


@router.post("/{curriculum_id}/replan", response_model=CurriculumResponse)
async def replan_curriculum(curriculum_id: str, db: Session = Depends(get_db)):
    curriculum = await curriculum_service.replan_curriculum(db, curriculum_id)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return curriculum

@router.post("/module/{module_id}/generate", response_model=CurriculumModuleResponse)
async def generate_module_content(module_id: str, db: Session = Depends(get_db)):
    module = await curriculum_service.generate_module_content(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    return module

@router.post("/module/{module_id}/toggle", response_model=CurriculumModuleResponse)
def toggle_module(module_id: str, db: Session = Depends(get_db)):
    module = curriculum_service.toggle_module_completion(db, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    return module

@router.delete("/module/{module_id}")
def delete_module(module_id: str, db: Session = Depends(get_db)):
    success = curriculum_service.delete_module(db, module_id)
    if not success:
        raise HTTPException(status_code=404, detail="Module not found")
    return {"status": "success"}
