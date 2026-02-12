from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import uuid4
from datetime import datetime, timezone
from surrealdb import AsyncSurreal
from .router_main import get_surreal_db
from .db_utils import normalize_id, first_record, validate_record_id, unwrap_query_result
from src.services.llm_service import llm_service
from src.services.llm_config_resolver import resolve_llm_config
from src.database.orm import get_db
from sqlalchemy.orm import Session
from src.dependencies import get_request_user_id
from src.utils.logger import logger

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    notebook_id: Optional[str] = None
    context: Optional[str] = None
    model_override: Optional[str] = None
    history: Optional[List[dict]] = []
    user_id: Optional[str] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

@router.post("/execute")
async def execute_chat(
    request: ChatRequest,
    db_session: Session = Depends(get_db),
    db: AsyncSurreal = Depends(get_surreal_db),
    user_id: str = Depends(get_request_user_id)
):
    """Main chat execution point (matching frontend expectations)."""
    session_id = normalize_id("chat_session", request.session_id) if request.session_id else None
    session = None
    if session_id:
        try:
            session_id = validate_record_id("chat_session", session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id")
        session = first_record(await db.select(session_id))

    # If no session, create one when notebook_id is provided.
    if not session:
        if not request.notebook_id:
            raise HTTPException(status_code=400, detail="notebook_id or session_id is required")
        session = await db.create("chat_session", {
            "notebook_id": request.notebook_id,
            "title": f"Chat {uuid4().hex[:6]}",
            "messages": [],
            "created_at": "type::datetime(now())",
            "updated": "type::datetime(now())"
        })
        # db.create returns list in some drivers
        session = first_record(session)
        session_id = session.get("id") if isinstance(session, dict) else session_id

    messages = session.get("messages", []) if isinstance(session, dict) else []

    user_message = {
        "id": f"user-{uuid4().hex}",
        "type": "human",
        "content": request.message,
        "timestamp": now_iso()
    }

    # Build LLM prompt
    system_prompt = (
        "You are a helpful study assistant. "
        "Answer clearly and concisely. If context is provided, use it."
    )
    messages_payload = [{"role": "system", "content": system_prompt}]

    if request.context:
        messages_payload.append({
            "role": "system",
            "content": f"Context:\n{request.context}"
        })

    # Include prior messages from session (last 10 for brevity)
    for msg in messages[-10:]:
        role = "assistant" if msg.get("type") in ("ai", "assistant") else "user"
        messages_payload.append({"role": role, "content": msg.get("content", "")})

    # Current user message
    messages_payload.append({"role": "user", "content": request.message})

    effective_user_id = request.user_id or user_id
    if not request.user_id and user_id == "default_user":
        logger.warning("Open Notebook chat falling back to default_user")
    llm_config = resolve_llm_config(
        db_session,
        effective_user_id,
        config_type="chat"
    )
    if request.model_override:
        llm_config.model = request.model_override

    try:
        assistant_content = await llm_service.get_chat_completion(
            messages=messages_payload,
            config=llm_config
        )
    except Exception as e:
        logger.exception("Open Notebook chat LLM call failed")
        assistant_content = (
            "I couldn't reach the language model. "
            "Please check your LLM settings or try again."
        )
    assistant_message = {
        "id": f"ai-{uuid4().hex}",
        "type": "ai",
        "content": assistant_content,
        "timestamp": now_iso()
    }

    messages = [*messages, user_message, assistant_message]

    if session_id:
        try:
            session_id = validate_record_id("chat_session", session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id")
        await db.query(
            f"UPDATE {session_id} MERGE $data",
            {"data": {"messages": messages, "updated": "type::datetime(now())"}},
        )

    return {
        "session_id": session_id,
        "messages": messages,
        "citations": []
    }

@router.get("/sessions")
async def list_sessions(notebook_id: str, db: AsyncSurreal = Depends(get_surreal_db)):
    """List chat sessions for a notebook."""
    result = await db.query(
        "SELECT * FROM chat_session WHERE notebook_id = $notebook_id ORDER BY updated DESC",
        {"notebook_id": notebook_id},
    )
    return unwrap_query_result(result)

@router.post("/sessions")
async def create_session(request: Dict[str, Any], db: AsyncSurreal = Depends(get_surreal_db)):
    """Create a new chat session."""
    if not request.get("notebook_id"):
        raise HTTPException(status_code=400, detail="notebook_id is required")
    session = await db.create("chat_session", {
        "notebook_id": request.get("notebook_id"),
        "title": request.get("title") or "New Chat",
        "model_override": request.get("model_override"),
        "messages": [],
        "created_at": "type::datetime(now())",
        "updated": "type::datetime(now())"
    })
    return first_record(session) or session

@router.get("/sessions/{sessionId}")
async def get_session(sessionId: str, db: AsyncSurreal = Depends(get_surreal_db)):
    """Retrieve details for a specific session."""
    session_id = normalize_id("chat_session", sessionId)
    try:
        session_id = validate_record_id("chat_session", session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    session = await db.select(session_id)
    record = first_record(session)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    return record


@router.put("/sessions/{sessionId}")
async def update_session(sessionId: str, request: Dict[str, Any], db: AsyncSurreal = Depends(get_surreal_db)):
    session_id = normalize_id("chat_session", sessionId)
    try:
        session_id = validate_record_id("chat_session", session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    payload = {k: v for k, v in request.items() if v is not None}
    payload["updated"] = "type::datetime(now())"
    result = await db.query(
        f"UPDATE {session_id} MERGE $data RETURN AFTER",
        {"data": payload},
    )
    updated = first_record(result)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated


@router.delete("/sessions/{sessionId}")
async def delete_session(sessionId: str, db: AsyncSurreal = Depends(get_surreal_db)):
    session_id = normalize_id("chat_session", sessionId)
    try:
        session_id = validate_record_id("chat_session", session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    result = await db.query(f"DELETE {session_id} RETURN BEFORE")
    deleted = first_record(result)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "id": session_id}

@router.post("/context")
async def build_context(request: Dict[str, Any], db: AsyncSurreal = Depends(get_surreal_db)):
    """Build conversation context for RAG."""
    context_config = request.get("context_config", {})
    sources_cfg = context_config.get("sources", {})
    notes_cfg = context_config.get("notes", {})

    chunks: List[str] = []

    for source_id, mode in sources_cfg.items():
        if mode == "not in":
            continue
        record = first_record(await db.select(normalize_id("source", source_id)))
        if record and record.get("content"):
            chunks.append(record["content"])

    for note_id, mode in notes_cfg.items():
        if mode == "not in":
            continue
        record = first_record(await db.select(normalize_id("note", note_id)))
        if record and record.get("content"):
            chunks.append(record["content"])

    context = "\n\n".join(chunks)
    char_count = len(context)
    token_count = max(1, char_count // 4) if char_count > 0 else 0

    return {
        "status": "context_built",
        "context": context,
        "token_count": token_count,
        "char_count": char_count,
    }
