from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from src.database.orm import get_db
from src.models.schemas import CurriculumResponse, CurriculumCreate, CurriculumModuleResponse
from src.services.curriculum_service import curriculum_service

router = APIRouter(prefix="/api/curriculum", tags=["Curriculum"])

@router.post("/generate", response_model=CurriculumResponse)
async def generate_curriculum(
    request: CurriculumCreate, 
    db: Session = Depends(get_db)
):
    """
    Generates a new adaptive learning path.
    """
    try:
        curriculum = await curriculum_service.generate_curriculum(
            db, 
            goal=request.title, # Using title as the goal if target_concept not specific
            user_id=request.user_id,
            document_id=request.document_id,
            config=request.llm_config
        )
        return curriculum
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[CurriculumResponse])
def list_curriculums(user_id: str = "default_user", db: Session = Depends(get_db)):
    return curriculum_service.get_user_curriculums(db, user_id)

@router.get("/{curriculum_id}", response_model=CurriculumResponse)
def get_curriculum(curriculum_id: str, db: Session = Depends(get_db)):
    curriculum = curriculum_service.get_curriculum(db, curriculum_id)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return curriculum

@router.delete("/{curriculum_id}")
def delete_curriculum(curriculum_id: str, db: Session = Depends(get_db)):
    success = curriculum_service.delete_curriculum(db, curriculum_id)
    if not success:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    return {"status": "success"}

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
