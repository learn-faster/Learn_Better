import uuid
from datetime import datetime, date, timedelta
from src.utils.logger import logger
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from src.models.orm import Curriculum, CurriculumModule, CurriculumWeek, CurriculumCheckpoint, CurriculumTask, CurriculumDocument, Document, UserSettings
from src.models.schemas import LLMConfig
from src.services.llm_service import llm_service
from src.path_resolution.path_resolver import PathResolver
from src.services.prompts import ENHANCED_CURRICULUM_PROMPT_TEMPLATE, MODULE_CONTENT_PROMPT_TEMPLATE, WEEKLY_CURRICULUM_PROMPT_TEMPLATE

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
                    logger.error(f"Error parsing user LLM config: {e}")
        
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
        document_ids: Optional[List[int]] = None,
        duration_weeks: int = 4,
        time_budget_hours_per_week: int = 5,
        start_date_value: Optional[date] = None,
        llm_enhance: bool = False,
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
                    logger.error(f"Error parsing user LLM config: {e}")
        llm_config = config

        # 1. Gather Context
        text_context = ""
        doc_filename = None
        doc_ids = document_ids or ([] if not document_id else [document_id])
        if document_id and document_id not in doc_ids:
            doc_ids.append(document_id)

        docs: List[Document] = []
        if doc_ids:
            docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
            text_context = "\n\n".join([d.extracted_text or "" for d in docs if d])
            doc_filename = ", ".join([d.filename or f"doc-{d.id}" for d in docs if d])

        # 2. Graph/Prerequisite check
        # We can pass identified prerequisites to the LLM to ensure they are covered in early modules
        graph_path = self.path_resolver.resolve_path(user_id, goal, time_budget_minutes=120)
        prereqs = []
        if graph_path and graph_path.concepts:
            prereqs = [c for c in graph_path.concepts if c.lower() != goal.lower()]

        # 3. LLM Generation
        start_date_safe = start_date_value or datetime.utcnow().date()
        path_data = await self._generate_plan_data(
            goal=goal,
            prereqs=prereqs,
            duration_weeks=duration_weeks,
            time_budget_hours_per_week=time_budget_hours_per_week,
            start_date_safe=start_date_safe,
            doc_ids=doc_ids,
            docs=docs,
            text_context=text_context,
            llm_enhance=llm_enhance,
            llm_config=llm_config
        )

        # 4. Persistence
        curriculum_id = str(uuid.uuid4())
        new_curriculum = Curriculum(
            id=curriculum_id,
            user_id=user_id,
            document_id=document_id,
            title=path_data.get("title", f"Learning Path: {goal}"),
            description=path_data.get("description", ""),
            target_concept=goal,
            status="active",
            start_date=start_date_safe,
            duration_weeks=duration_weeks,
            time_budget_hours_per_week=time_budget_hours_per_week,
            llm_enhance=llm_enhance,
            llm_config=(llm_config.model_dump() if llm_config else {})
        )
        db.add(new_curriculum)

        # Link documents
        for doc_id in doc_ids:
            db.add(CurriculumDocument(curriculum_id=curriculum_id, document_id=doc_id))

        # Create week/task/checkpoint structure
        weeks = path_data.get("weeks", [])
        for week_data in weeks:
            week_index = int(week_data.get("week_index", 1))
            week_id = str(uuid.uuid4())
            week_start = start_date_safe + timedelta(days=(week_index - 1) * 7)
            week_end = week_start + timedelta(days=6)

            week = CurriculumWeek(
                id=week_id,
                curriculum_id=curriculum_id,
                week_index=week_index,
                goal=week_data.get("goal"),
                focus_concepts=week_data.get("focus_concepts", []),
                estimated_hours=float(week_data.get("estimated_hours") or 0.0),
                status="planned",
                start_date=week_start,
                end_date=week_end
            )
            db.add(week)

            for task_data in week_data.get("tasks", []):
                linked_ids = task_data.get("linked_doc_ids", []) or []
                linked_doc_id = linked_ids[0] if linked_ids else (doc_ids[0] if doc_ids else None)
                task = CurriculumTask(
                    id=str(uuid.uuid4()),
                    week_id=week_id,
                    title=task_data.get("title", "Study task"),
                    task_type=(task_data.get("task_type") or "reading").lower(),
                    linked_doc_id=linked_doc_id,
                    estimate_minutes=int(task_data.get("estimate_minutes") or 30),
                    notes=task_data.get("notes")
                )
                db.add(task)

            for cp_data in week_data.get("checkpoints", []):
                offset_days = int(cp_data.get("due_offset_days") or 7)
                due_date = week_start + timedelta(days=max(1, min(offset_days, 7)))
                checkpoint = CurriculumCheckpoint(
                    id=str(uuid.uuid4()),
                    week_id=week_id,
                    title=cp_data.get("title", f"Week {week_index} checkpoint"),
                    success_criteria=cp_data.get("success_criteria"),
                    linked_doc_ids=cp_data.get("linked_doc_ids", doc_ids),
                    linked_module_ids=cp_data.get("linked_module_ids", []),
                    assessment_type=cp_data.get("assessment_type", "recall"),
                    due_date=due_date
                )
                db.add(checkpoint)

        db.commit()
        db.refresh(new_curriculum)
        return new_curriculum

    async def _generate_plan_data(
        self,
        goal: str,
        prereqs: List[str],
        duration_weeks: int,
        time_budget_hours_per_week: int,
        start_date_safe: date,
        doc_ids: List[int],
        docs: List[Document],
        text_context: str,
        llm_enhance: bool,
        llm_config: Optional[LLMConfig]
    ) -> Dict[str, Any]:
        full_goal = goal
        if prereqs:
            full_goal += f" (Prereqs: {', '.join(prereqs)})"

        documents_for_prompt = ""
        if doc_ids:
            documents_for_prompt = "\n".join([f"- {d.id}: {d.title or d.filename or f'Doc {d.id}'}" for d in docs])
        else:
            documents_for_prompt = "- None provided"

        weekly_prompt = WEEKLY_CURRICULUM_PROMPT_TEMPLATE.format(
            goal=full_goal,
            hours_per_week=time_budget_hours_per_week,
            duration_weeks=duration_weeks,
            start_date=start_date_safe.isoformat(),
            prereqs=", ".join(prereqs) if prereqs else "None",
            documents=documents_for_prompt,
            text=text_context[:12000]
        )

        path_data: Dict[str, Any] = {}
        if llm_enhance or text_context:
            try:
                raw_path = await llm_service._get_completion(
                    weekly_prompt,
                    system_prompt="You are a JSON-speaking elite learning architect.",
                    config=llm_config
                )
                path_data = llm_service._extract_and_parse_json(raw_path)
            except Exception as e:
                logger.error(f"Curriculum LLM generation failed, using fallback: {e}")

        if not path_data:
            path_data = self._build_basic_plan(
                goal=goal,
                prereqs=prereqs,
                duration_weeks=duration_weeks,
                time_budget_hours_per_week=time_budget_hours_per_week,
                doc_ids=doc_ids
            )
        return path_data

    def _build_basic_plan(
        self,
        goal: str,
        prereqs: List[str],
        duration_weeks: int,
        time_budget_hours_per_week: int,
        doc_ids: List[int]
    ) -> Dict[str, Any]:
        weeks = []
        concepts = prereqs[:]
        if not concepts:
            concepts = [goal]
        for i in range(duration_weeks):
            week_index = i + 1
            focus = concepts[i % len(concepts)]
            weeks.append({
                "week_index": week_index,
                "goal": f"Build foundations for {focus}",
                "focus_concepts": [focus],
                "estimated_hours": time_budget_hours_per_week,
                "tasks": [
                    {
                        "title": f"Read and summarize key ideas about {focus}",
                        "task_type": "reading",
                        "linked_doc_ids": doc_ids,
                        "estimate_minutes": 60,
                        "notes": "Summarize in your own words. Capture 3-5 key ideas."
                    },
                    {
                        "title": f"Practice recall on {focus}",
                        "task_type": "practice",
                        "linked_doc_ids": doc_ids,
                        "estimate_minutes": 45,
                        "notes": "Use active recall and self-explanation."
                    }
                ],
                "checkpoints": [
                    {
                        "title": f"Explain {focus} without notes",
                        "success_criteria": "Can explain the concept and list 3 key ideas.",
                        "assessment_type": "recall",
                        "linked_doc_ids": doc_ids,
                        "due_offset_days": 7
                    }
                ]
            })
        return {
            "title": f"Learning Plan: {goal}",
            "description": "Weekly plan grounded in your documents and prerequisite graph.",
            "weeks": weeks
        }

    def get_curriculum_timeline(self, db: Session, curriculum_id: str):
        weeks = db.query(CurriculumWeek).filter(CurriculumWeek.curriculum_id == curriculum_id).order_by(CurriculumWeek.week_index.asc()).all()
        return weeks

    def complete_checkpoint(self, db: Session, checkpoint_id: str) -> Optional[CurriculumCheckpoint]:
        checkpoint = db.query(CurriculumCheckpoint).filter(CurriculumCheckpoint.id == checkpoint_id).first()
        if not checkpoint:
            return None
        checkpoint.status = "completed"

        # Mark week as completed if all checkpoints done
        week = checkpoint.week
        if week:
            all_done = all(cp.status == "completed" for cp in week.checkpoints)
            if all_done:
                week.status = "completed"
                curriculum = week.curriculum
                if curriculum:
                    total_weeks = len(curriculum.weeks)
                    completed_weeks = len([w for w in curriculum.weeks if w.status == "completed"])
                    if total_weeks > 0:
                        curriculum.progress = completed_weeks / total_weeks
                    if completed_weeks >= total_weeks:
                        curriculum.status = "completed"

        db.commit()
        db.refresh(checkpoint)
        return checkpoint

    def get_metrics(self, db: Session, curriculum_id: str) -> Dict[str, Any]:
        weeks = db.query(CurriculumWeek).filter(CurriculumWeek.curriculum_id == curriculum_id).all()
        tasks = db.query(CurriculumTask).filter(CurriculumTask.week_id.in_([w.id for w in weeks])).all() if weeks else []
        weeks_total = len(weeks)
        weeks_completed = len([w for w in weeks if w.status == "completed"])
        tasks_total = len(tasks)
        tasks_completed = len([t for t in tasks if t.status == "done"])
        progress_percent = 0.0
        if weeks_total > 0:
            progress_percent = (weeks_completed / weeks_total) * 100.0

        next_checkpoint = None
        for week in sorted(weeks, key=lambda w: w.week_index):
            for cp in week.checkpoints:
                if cp.status != "completed":
                    next_checkpoint = cp
                    break
            if next_checkpoint:
                break

        return {
            "curriculum_id": curriculum_id,
            "weeks_total": weeks_total,
            "weeks_completed": weeks_completed,
            "tasks_total": tasks_total,
            "tasks_completed": tasks_completed,
            "progress_percent": progress_percent,
            "last_activity_at": None,
            "next_checkpoint_title": next_checkpoint.title if next_checkpoint else None,
            "next_checkpoint_due": next_checkpoint.due_date if next_checkpoint else None
        }

    def toggle_task_status(self, db: Session, task_id: str) -> Optional[CurriculumTask]:
        task = db.query(CurriculumTask).filter(CurriculumTask.id == task_id).first()
        if not task:
            return None
        task.status = "done" if task.status != "done" else "pending"
        db.commit()
        db.refresh(task)
        return task

    def get_week_report(self, db: Session, week_id: str) -> Optional[Dict[str, Any]]:
        week = db.query(CurriculumWeek).filter(CurriculumWeek.id == week_id).first()
        if not week:
            return None
        curriculum = week.curriculum
        tasks = week.tasks or []
        checkpoints = week.checkpoints or []
        tasks_done = len([t for t in tasks if t.status == "done"])
        checkpoints_done = len([c for c in checkpoints if c.status == "completed"])

        title = f"Week {week.week_index}: {week.goal or 'Weekly Focus'}"
        markdown_lines = [
            f"# {title}",
            "",
            f"**Curriculum:** {curriculum.title if curriculum else 'Unknown'}",
            f"**Week window:** {week.start_date} to {week.end_date}",
            f"**Estimated hours:** {week.estimated_hours}",
            "",
            "## Focus Concepts",
        ]
        if week.focus_concepts:
            markdown_lines.extend([f"- {c}" for c in week.focus_concepts])
        else:
            markdown_lines.append("- (none listed)")

        markdown_lines.append("")
        markdown_lines.append("## Tasks")
        if tasks:
            for task in tasks:
                status = "✅" if task.status == "done" else "⬜"
                markdown_lines.append(f"- {status} {task.title} ({task.task_type}, ~{task.estimate_minutes} min)")
        else:
            markdown_lines.append("- (no tasks)")

        markdown_lines.append("")
        markdown_lines.append("## Checkpoints")
        if checkpoints:
            for cp in checkpoints:
                status = "✅" if cp.status == "completed" else "⬜"
                due = f" (due {cp.due_date})" if cp.due_date else ""
                markdown_lines.append(f"- {status} {cp.title}{due}")
                if cp.success_criteria:
                    markdown_lines.append(f"  - Success: {cp.success_criteria}")
        else:
            markdown_lines.append("- (no checkpoints)")

        markdown_lines.append("")
        markdown_lines.append("## Summary")
        markdown_lines.append(f"- Tasks completed: {tasks_done}/{len(tasks)}")
        markdown_lines.append(f"- Checkpoints completed: {checkpoints_done}/{len(checkpoints)}")

        return {
            "week_id": week.id,
            "curriculum_id": week.curriculum_id,
            "week_index": week.week_index,
            "title": title,
            "markdown": "\n".join(markdown_lines),
            "stats": {
                "tasks_total": len(tasks),
                "tasks_done": tasks_done,
                "checkpoints_total": len(checkpoints),
                "checkpoints_done": checkpoints_done,
                "estimated_hours": week.estimated_hours
            }
        }

    async def replan_curriculum(self, db: Session, curriculum_id: str, config: Optional[LLMConfig] = None) -> Optional[Curriculum]:
        curriculum = db.query(Curriculum).filter(Curriculum.id == curriculum_id).first()
        if not curriculum:
            return None

        doc_ids = curriculum.document_ids or []
        docs = db.query(Document).filter(Document.id.in_(doc_ids)).all() if doc_ids else []
        text_context = "\n\n".join([d.extracted_text or "" for d in docs if d])

        graph_path = self.path_resolver.resolve_path(curriculum.user_id, curriculum.target_concept or curriculum.title, time_budget_minutes=120)
        prereqs = []
        if graph_path and graph_path.concepts:
            prereqs = [c for c in graph_path.concepts if c.lower() != (curriculum.target_concept or curriculum.title).lower()]

        llm_config = config
        if not llm_config and curriculum.llm_config:
            try:
                llm_config = LLMConfig(**curriculum.llm_config)
            except Exception:
                llm_config = None

        start_date_safe = curriculum.start_date or datetime.utcnow().date()
        path_data = await self._generate_plan_data(
            goal=curriculum.target_concept or curriculum.title,
            prereqs=prereqs,
            duration_weeks=curriculum.duration_weeks,
            time_budget_hours_per_week=curriculum.time_budget_hours_per_week,
            start_date_safe=start_date_safe,
            doc_ids=doc_ids,
            docs=docs,
            text_context=text_context,
            llm_enhance=curriculum.llm_enhance,
            llm_config=llm_config
        )

        # Clear existing weeks
        for week in curriculum.weeks:
            db.delete(week)

        curriculum.status = "active"
        curriculum.progress = 0.0

        # Rebuild weeks
        weeks = path_data.get("weeks", [])
        for week_data in weeks:
            week_index = int(week_data.get("week_index", 1))
            week_id = str(uuid.uuid4())
            week_start = start_date_safe + timedelta(days=(week_index - 1) * 7)
            week_end = week_start + timedelta(days=6)

            week = CurriculumWeek(
                id=week_id,
                curriculum_id=curriculum.id,
                week_index=week_index,
                goal=week_data.get("goal"),
                focus_concepts=week_data.get("focus_concepts", []),
                estimated_hours=float(week_data.get("estimated_hours") or 0.0),
                status="planned",
                start_date=week_start,
                end_date=week_end
            )
            db.add(week)

            for task_data in week_data.get("tasks", []):
                linked_ids = task_data.get("linked_doc_ids", []) or []
                linked_doc_id = linked_ids[0] if linked_ids else (doc_ids[0] if doc_ids else None)
                task = CurriculumTask(
                    id=str(uuid.uuid4()),
                    week_id=week_id,
                    title=task_data.get("title", "Study task"),
                    task_type=(task_data.get("task_type") or "reading").lower(),
                    linked_doc_id=linked_doc_id,
                    estimate_minutes=int(task_data.get("estimate_minutes") or 30),
                    notes=task_data.get("notes")
                )
                db.add(task)

            for cp_data in week_data.get("checkpoints", []):
                offset_days = int(cp_data.get("due_offset_days") or 7)
                due_date = week_start + timedelta(days=max(1, min(offset_days, 7)))
                checkpoint = CurriculumCheckpoint(
                    id=str(uuid.uuid4()),
                    week_id=week_id,
                    title=cp_data.get("title", f"Week {week_index} checkpoint"),
                    success_criteria=cp_data.get("success_criteria"),
                    linked_doc_ids=cp_data.get("linked_doc_ids", doc_ids),
                    linked_module_ids=cp_data.get("linked_module_ids", []),
                    assessment_type=cp_data.get("assessment_type", "recall"),
                    due_date=due_date
                )
                db.add(checkpoint)

        db.commit()
        db.refresh(curriculum)
        return curriculum

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
