from sqlalchemy import text
from src.database.orm import engine
from src.utils.logger import logger

CREATE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS document_quiz_submissions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES document_quiz_sessions(id),
        file_path TEXT NOT NULL,
        ocr_text TEXT,
        mapping_json JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    ALTER TABLE document_quiz_attempts
    ADD COLUMN IF NOT EXISTS submission_id TEXT REFERENCES document_quiz_submissions(id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_doc_quiz_submissions_session_id
    ON document_quiz_submissions(session_id);
    """
]


def run_migration():
    db_engine = engine
    with db_engine.begin() as conn:
        for stmt in CREATE_STATEMENTS:
            conn.execute(text(stmt))
    logger.info("Document quiz submissions migration completed.")


if __name__ == "__main__":
    run_migration()
