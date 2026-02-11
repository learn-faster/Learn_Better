from fastapi import Request, HTTPException
from src.ingestion.ingestion_engine import IngestionEngine
from src.storage.document_store import DocumentStore

def get_ingestion_engine(request: Request) -> IngestionEngine:
    engine = getattr(request.app.state, "ingestion_engine", None)
    if engine:
        return engine
    try:
        import main
        if getattr(main, "ingestion_engine", None):
            return main.ingestion_engine
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="Ingestion Engine not initialized")

def get_document_store(request: Request) -> DocumentStore:
    store = getattr(request.app.state, "document_store", None)
    if store:
        return store
    try:
        import main
        if getattr(main, "document_store", None):
            return main.document_store
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="Document Store not initialized")

def get_navigation_engine(request: Request):
    engine = getattr(request.app.state, "navigation_engine", None)
    if engine:
        return engine
    try:
        import main
        if getattr(main, "navigation_engine", None):
            return main.navigation_engine
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="Navigation Engine not initialized")

def get_user_tracker(request: Request):
    tracker = getattr(request.app.state, "user_tracker", None)
    if tracker:
        return tracker
    try:
        import main
        if getattr(main, "user_tracker", None):
            return main.user_tracker
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="User Tracker not initialized")

def get_path_resolver(request: Request):
    resolver = getattr(request.app.state, "path_resolver", None)
    if resolver:
        return resolver
    try:
        import main
        if getattr(main, "path_resolver", None):
            return main.path_resolver
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="Path Resolver not initialized")

def get_content_retriever(request: Request):
    retriever = getattr(request.app.state, "content_retriever", None)
    if retriever:
        return retriever
    try:
        import main
        if getattr(main, "content_retriever", None):
            return main.content_retriever
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="Content Retriever not initialized")

def get_request_user_id(request: Request) -> str:
    user_id = request.headers.get("X-User-Id") or request.query_params.get("user_id")
    return user_id or "default_user"
