from sqlalchemy import text
from src.database.orm import engine
from src.utils.logger import logger

CREATE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS document_quiz_items (
        id TEXT PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id),
        mode TEXT DEFAULT 'cloze',
        passage_markdown TEXT NOT NULL,
        masked_markdown TEXT,
        answer_key JSONB DEFAULT '[]',
        tags JSONB DEFAULT '[]',
        difficulty INTEGER DEFAULT 3,
        source_span JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS document_quiz_sessions (
        id TEXT PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id),
        mode TEXT DEFAULT 'cloze',
        settings JSONB DEFAULT '{}',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS document_quiz_attempts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES document_quiz_sessions(id),
        quiz_item_id TEXT NOT NULL REFERENCES document_quiz_items(id),
        user_answer TEXT,
        transcript TEXT,
        score FLOAT DEFAULT 0.0,
        feedback TEXT,
        llm_eval JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS document_study_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'default_user',
        document_id INTEGER REFERENCES documents(id),
        reveal_config JSONB DEFAULT '{}',
        llm_config JSONB DEFAULT '{}',
        voice_mode_enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_doc_quiz_items_doc_id ON document_quiz_items(document_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_doc_quiz_sessions_doc_id ON document_quiz_sessions(document_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_doc_quiz_attempts_session_id ON document_quiz_attempts(session_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_doc_study_settings_doc_id ON document_study_settings(document_id);
    """
]


def run_migration():
    db_engine = engine
    with db_engine.begin() as conn:
        for stmt in CREATE_STATEMENTS:
            conn.execute(text(stmt))
    logger.info("Document quiz tables migration completed.")


if __name__ == "__main__":
    run_migration()
