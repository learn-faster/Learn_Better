import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session

from src.models.orm import Curriculum, CurriculumModule, Document, UserSettings
from src.models.schemas import LLMConfig
from src.services.llm_service import llm_service
from src.path_resolution.path_resolver import PathResolver
from src.services.prompts import ENHANCED_CURRICULUM_PROMPT_TEMPLATE, MODULE_CONTENT_PROMPT_TEMPLATE

class CurriculumService:
    """
    Orchestrates the creation and management of persistent learning paths.
    """
    
    def __init__(self):
        self.path_resolver = PathResolver()

    async def generate_module_content(
        self,
        db: Session,
        module_id: str,
        config: Optional[LLMConfig] = None
    ) -> Optional[CurriculumModule]:
        """
        Generates content for a specific module if it's missing.
        """
        module = db.query(CurriculumModule).filter(CurriculumModule.id == module_id).first()
        if not module:
            return None
        
        if module.content and len(str(module.content)) > 100:
            return module
            
        curriculum = module.curriculum
        
        # 0. Get User Configuration
        if not config:
            user_settings = db.query(UserSettings).filter(UserSettings.user_id == curriculum.user_id).first()
            if user_settings and user_settings.llm_config:
                try:
                    cc = user_settings.llm_config.get("curriculum", {})
                    gc = user_settings.llm_config.get("global", {})
                    stored_config = cc if cc.get("provider") else gc
                    if stored_config and stored_config.get("provider"):
                        clean_config = {k: v for k, v in stored_config.items() if v}
                        if clean_config:
                            config = LLMConfig(**clean_config)
                except Exception as e:
                    print(f"Error parsing user LLM config: {e}")
        
        # 1. Gather Context
        text_context = ""
        if curriculum.document_id:
            doc = db.query(Document).filter(Document.id == curriculum.document_id).first()
            if doc:
                text_context = doc.extracted_text or ""

        # 2. LLM Generation
        prompt = MODULE_CONTENT_PROMPT_TEMPLATE.format(
            goal=curriculum.target_concept or curriculum.title,
            module_title=module.title,
            module_description=module.description or "",
            module_type=module.module_type,
            text=text_context[:15000] # Slightly more context for single module
        )

        raw_content = await llm_service._get_completion(
            prompt,
            system_prompt="You are a JSON-speaking elite learning architect.",
            config=config
        )
        
        # Try to parse as JSON if it's a practice/srs module
        if module.module_type in ['practice', 'srs', 'quiz', 'flashcards']:
            try:
                content_data = llm_service._extract_and_parse_json(raw_content)
                module.content = content_data
            except:
                module.content = raw_content
        else:
            module.content = raw_content

        db.commit()
        db.refresh(module)
        return module

    async def generate_curriculum(
        self, 
        db: Session, 
        goal: str, 
        user_id: str = "default_user", 
        document_id: Optional[int] = None,
        config: Optional[LLMConfig] = None
    ) -> Curriculum:
        """
        Generates a multi-stage curriculum using LLM and Knowledge Graph context.
        """
        # 0. Get User Configuration
        if not config:
            user_settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
            if user_settings and user_settings.llm_config:
                try:
                    # Use curriculum specific if it has a provider, otherwise global
                    cc = user_settings.llm_config.get("curriculum", {})
                    gc = user_settings.llm_config.get("global", {})
                    
                    stored_config = cc if cc.get("provider") else gc
                        
                    if stored_config and stored_config.get("provider"):
                        # Filter out empty values
                        clean_config = {k: v for k, v in stored_config.items() if v}
                        if clean_config:
                            config = LLMConfig(**clean_config)
                except Exception as e:
                    print(f"Error parsing user LLM config: {e}")
        llm_config = config

        # 1. Gather Context
        text_context = ""
        doc_filename = None
        if document_id:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                text_context = doc.extracted_text or ""
                doc_filename = doc.filename

        # 2. Graph/Prerequisite check
        # We can pass identified prerequisites to the LLM to ensure they are covered in early modules
        graph_path = self.path_resolver.resolve_path(user_id, goal, time_budget_minutes=120)
        prereqs = []
        if graph_path and graph_path.concepts:
            prereqs = [c for c in graph_path.concepts if c.lower() != goal.lower()]

        # 3. LLM Generation
        # Augment goal with prereqs
        full_goal = goal
        if prereqs:
            full_goal += f" (Note: Student may need to cover these prerequisites first: {', '.join(prereqs)})"

        prompt = ENHANCED_CURRICULUM_PROMPT_TEMPLATE.format(
            goal=full_goal,
            text=text_context[:10000] # Limit context for safety
        )

        raw_path = await llm_service._get_completion(
            prompt, 
            system_prompt="You are a JSON-speaking elite learning architect.",
            config=llm_config
        )
        path_data = llm_service._extract_and_parse_json(raw_path)


        # 4. Persistence
        curriculum_id = str(uuid.uuid4())
        new_curriculum = Curriculum(
            id=curriculum_id,
            user_id=user_id,
            document_id=document_id,
            title=path_data.get("title", f"Learning Path: {goal}"),
            description=path_data.get("description", ""),
            target_concept=goal,
            status="active"
        )
        db.add(new_curriculum)

        for i, mod_data in enumerate(path_data.get("modules", [])):
            module = CurriculumModule(
                id=str(uuid.uuid4()),
                curriculum_id=curriculum_id,
                title=mod_data.get("title", f"Module {i+1}"),
                description=mod_data.get("description", ""),
                module_type=mod_data.get("module_type", "primer").lower(),
                order=i,
                content=mod_data.get("content", ""),
                estimated_time=mod_data.get("estimated_time", "15 mins")
            )
            db.add(module)

        db.commit()
        db.refresh(new_curriculum)
        return new_curriculum

    def get_user_curriculums(self, db: Session, user_id: str = "default_user") -> List[Curriculum]:
        return db.query(Curriculum).filter(Curriculum.user_id == user_id).order_by(Curriculum.created_at.desc()).all()

    def get_curriculum(self, db: Session, curriculum_id: str) -> Optional[Curriculum]:
        return db.query(Curriculum).filter(Curriculum.id == curriculum_id).first()

    def delete_curriculum(self, db: Session, curriculum_id: str) -> bool:
        curriculum = db.query(Curriculum).filter(Curriculum.id == curriculum_id).first()
        if not curriculum:
            return False
        
        # Delete modules first (though CASCADE should handle it if set up)
        db.query(CurriculumModule).filter(CurriculumModule.curriculum_id == curriculum_id).delete()
        db.delete(curriculum)
        db.commit()
        return True

    def toggle_module_completion(self, db: Session, module_id: str) -> Optional[CurriculumModule]:
        module = db.query(CurriculumModule).filter(CurriculumModule.id == module_id).first()
        if not module:
            return None
        
        module.is_completed = not module.is_completed
        module.completed_at = datetime.utcnow() if module.is_completed else None
        
        # Update parent progress
        curriculum = module.curriculum
        completed_count = db.query(CurriculumModule).filter(
            CurriculumModule.curriculum_id == curriculum.id,
            CurriculumModule.is_completed == True
        ).count()
        total_count = len(curriculum.modules)
        
        if total_count > 0:
            curriculum.progress = (completed_count / total_count)
            if curriculum.progress >= 1.0:
                curriculum.status = "completed"
            elif curriculum.status == "completed":
                curriculum.status = "active"
        
        db.commit()
        db.refresh(module)
        return module

    def delete_module(self, db: Session, module_id: str) -> bool:
        module = db.query(CurriculumModule).filter(CurriculumModule.id == module_id).first()
        if not module:
            return False
        
        db.delete(module)
        db.commit()
        return True

curriculum_service = CurriculumService()
