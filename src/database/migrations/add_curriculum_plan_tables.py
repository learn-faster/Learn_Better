from sqlalchemy import text
from src.database.orm import engine
from src.utils.logger import logger

CREATE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS curriculums (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default_user',
        document_id INTEGER REFERENCES documents(id),
        goal_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        target_concept TEXT,
        start_date DATE DEFAULT CURRENT_DATE,
        duration_weeks INTEGER DEFAULT 4,
        time_budget_hours_per_week INTEGER DEFAULT 5,
        llm_enhance BOOLEAN DEFAULT FALSE,
        llm_config JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'active',
        progress FLOAT DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS curriculum_modules (
        id TEXT PRIMARY KEY,
        curriculum_id TEXT REFERENCES curriculums(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        module_type TEXT DEFAULT 'primer',
        "order" INTEGER DEFAULT 0,
        is_completed BOOLEAN DEFAULT FALSE,
        content JSONB,
        estimated_time TEXT,
        completed_at TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS curriculum_documents (
        id SERIAL PRIMARY KEY,
        curriculum_id TEXT REFERENCES curriculums(id) ON DELETE CASCADE,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS curriculum_weeks (
        id TEXT PRIMARY KEY,
        curriculum_id TEXT REFERENCES curriculums(id) ON DELETE CASCADE,
        week_index INTEGER DEFAULT 1,
        goal TEXT,
        focus_concepts JSONB DEFAULT '[]'::jsonb,
        estimated_hours FLOAT DEFAULT 0.0,
        status TEXT DEFAULT 'planned',
        start_date DATE,
        end_date DATE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS curriculum_tasks (
        id TEXT PRIMARY KEY,
        week_id TEXT REFERENCES curriculum_weeks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        task_type TEXT DEFAULT 'reading',
        linked_doc_id INTEGER REFERENCES documents(id),
        linked_module_id TEXT REFERENCES curriculum_modules(id),
        estimate_minutes INTEGER DEFAULT 30,
        notes TEXT,
        status TEXT DEFAULT 'pending'
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS curriculum_checkpoints (
        id TEXT PRIMARY KEY,
        week_id TEXT REFERENCES curriculum_weeks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        success_criteria TEXT,
        linked_doc_ids JSONB DEFAULT '[]'::jsonb,
        linked_module_ids JSONB DEFAULT '[]'::jsonb,
        assessment_type TEXT DEFAULT 'recall',
        due_date DATE,
        status TEXT DEFAULT 'pending'
    );
    """,
    "CREATE INDEX IF NOT EXISTS curriculum_user_idx ON curriculums(user_id);",
    "CREATE INDEX IF NOT EXISTS curriculum_weeks_curriculum_idx ON curriculum_weeks(curriculum_id);",
    "CREATE INDEX IF NOT EXISTS curriculum_tasks_week_idx ON curriculum_tasks(week_id);",
    "CREATE INDEX IF NOT EXISTS curriculum_checkpoints_week_idx ON curriculum_checkpoints(week_id);",
    "CREATE INDEX IF NOT EXISTS curriculum_documents_curriculum_idx ON curriculum_documents(curriculum_id);",
    "CREATE INDEX IF NOT EXISTS curriculum_documents_document_idx ON curriculum_documents(document_id);"
]


def run_migration():
    db_engine = engine
    with db_engine.begin() as conn:
        for stmt in CREATE_STATEMENTS:
            conn.execute(text(stmt))
    logger.info("Curriculum plan tables migration completed.")


if __name__ == "__main__":
    run_migration()
