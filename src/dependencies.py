from fastapi import Request, HTTPException
from src.ingestion.ingestion_engine import IngestionEngine
from src.storage.document_store import DocumentStore

def get_ingestion_engine(request: Request) -> IngestionEngine:
    if not hasattr(request.app.state, "ingestion_engine") or not request.app.state.ingestion_engine:
        raise HTTPException(status_code=503, detail="Ingestion Engine not initialized")
    return request.app.state.ingestion_engine

def get_document_store(request: Request) -> DocumentStore:
    if not hasattr(request.app.state, "document_store") or not request.app.state.document_store:
        raise HTTPException(status_code=503, detail="Document Store not initialized")
    return request.app.state.document_store

def get_navigation_engine(request: Request):
    if not hasattr(request.app.state, "navigation_engine") or not request.app.state.navigation_engine:
        raise HTTPException(status_code=503, detail="Navigation Engine not initialized")
    return request.app.state.navigation_engine

def get_user_tracker(request: Request):
    if not hasattr(request.app.state, "user_tracker") or not request.app.state.user_tracker:
        raise HTTPException(status_code=503, detail="User Tracker not initialized")
    return request.app.state.user_tracker

def get_path_resolver(request: Request):
    if not hasattr(request.app.state, "path_resolver") or not request.app.state.path_resolver:
        raise HTTPException(status_code=503, detail="Path Resolver not initialized")
    return request.app.state.path_resolver

def get_content_retriever(request: Request):
    if not hasattr(request.app.state, "content_retriever") or not request.app.state.content_retriever:
        raise HTTPException(status_code=503, detail="Content Retriever not initialized")
    return request.app.state.content_retriever

def get_request_user_id(request: Request) -> str:
    user_id = request.headers.get("X-User-Id") or request.query_params.get("user_id")
    return user_id or "default_user"
