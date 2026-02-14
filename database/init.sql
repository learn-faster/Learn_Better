-- PostgreSQL initialization script for LearnFast Core Engine
-- This script sets up the vector database schema with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table to track ingested files
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    content_hash TEXT,
    file_path TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    title TEXT,
    file_type TEXT,
    tags JSON DEFAULT '[]',
    category TEXT,
    folder_id TEXT,
    extracted_text TEXT,
    ai_summary TEXT,
    page_count INTEGER DEFAULT 0,
    time_spent_reading INTEGER DEFAULT 0,
    last_opened TIMESTAMP,
    first_opened TIMESTAMP,
    completion_estimate INTEGER,
    reading_progress FLOAT DEFAULT 0.0,
    reading_time_min INTEGER,
    reading_time_max INTEGER,
    reading_time_median INTEGER,
    word_count INTEGER DEFAULT 0,
    difficulty_score FLOAT,
    language TEXT,
    scanned_prob FLOAT DEFAULT 0.0
);

-- Create learning_chunks table for content storage
CREATE TABLE IF NOT EXISTS learning_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    doc_source TEXT NOT NULL,           -- Source filename or URL
    content TEXT NOT NULL,              -- Markdown text chunk
    embedding vector NOT NULL,          -- Unconstrained vector supports mixed embedding dimensions
    embedding_dimensions INTEGER NOT NULL, -- Stored vector dimensionality for safe filtering
    concept_tag TEXT NOT NULL,          -- Links to Neo4j Concept.name
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index to filter by vector dimensionality before similarity operations
CREATE INDEX IF NOT EXISTS learning_chunks_embedding_dimensions_idx
ON learning_chunks (embedding_dimensions);

-- Create fast concept-based retrieval index
CREATE INDEX IF NOT EXISTS learning_chunks_concept_tag_idx 
ON learning_chunks (concept_tag);

-- Create index on doc_source for filtering by document
CREATE INDEX IF NOT EXISTS learning_chunks_doc_source_idx 
ON learning_chunks (doc_source);

-- Grant permissions to learnfast user
GRANT ALL PRIVILEGES ON TABLE documents TO learnfast;
GRANT ALL PRIVILEGES ON TABLE learning_chunks TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE documents_id_seq TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE learning_chunks_id_seq TO learnfast;

-- User settings for learning calibration
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL DEFAULT 'default_user',
    target_retention FLOAT DEFAULT 0.9,
    daily_new_limit INTEGER DEFAULT 20,
    focus_duration INTEGER DEFAULT 25,
    break_duration INTEGER DEFAULT 5,
    timezone VARCHAR DEFAULT 'UTC',
    email VARCHAR,
    resend_api_key VARCHAR,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date TIMESTAMP,
    email_daily_reminder BOOLEAN DEFAULT TRUE,
    email_streak_alert BOOLEAN DEFAULT TRUE,
    email_weekly_digest BOOLEAN DEFAULT TRUE,
    weekly_digest_day INTEGER DEFAULT 6,
    weekly_digest_hour INTEGER DEFAULT 18,
    weekly_digest_minute INTEGER DEFAULT 0,
    weekly_digest_last_sent_at TIMESTAMP,
    embedding_provider VARCHAR,
    embedding_model VARCHAR,
    embedding_api_key VARCHAR,
    embedding_base_url VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

GRANT ALL PRIVILEGES ON TABLE user_settings TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE user_settings_id_seq TO learnfast;

-- Curriculum tables (goal-to-plan)
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

CREATE TABLE IF NOT EXISTS curriculum_documents (
    id SERIAL PRIMARY KEY,
    curriculum_id TEXT REFERENCES curriculums(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX IF NOT EXISTS curriculum_user_idx ON curriculums(user_id);
CREATE INDEX IF NOT EXISTS curriculum_weeks_curriculum_idx ON curriculum_weeks(curriculum_id);
CREATE INDEX IF NOT EXISTS curriculum_tasks_week_idx ON curriculum_tasks(week_id);
CREATE INDEX IF NOT EXISTS curriculum_checkpoints_week_idx ON curriculum_checkpoints(week_id);
CREATE INDEX IF NOT EXISTS curriculum_documents_curriculum_idx ON curriculum_documents(curriculum_id);
CREATE INDEX IF NOT EXISTS curriculum_documents_document_idx ON curriculum_documents(document_id);

GRANT ALL PRIVILEGES ON TABLE curriculums TO learnfast;
GRANT ALL PRIVILEGES ON TABLE curriculum_modules TO learnfast;
GRANT ALL PRIVILEGES ON TABLE curriculum_documents TO learnfast;
GRANT ALL PRIVILEGES ON TABLE curriculum_weeks TO learnfast;
GRANT ALL PRIVILEGES ON TABLE curriculum_tasks TO learnfast;
GRANT ALL PRIVILEGES ON TABLE curriculum_checkpoints TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE curriculum_documents_id_seq TO learnfast;

-- Agent memory tables (episodic, semantic, procedural)
CREATE TABLE IF NOT EXISTS agent_memory_episodic (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary TEXT NOT NULL,
    context JSON DEFAULT '{}'::json,
    goal_id TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE TABLE IF NOT EXISTS agent_memory_semantic (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    key TEXT NOT NULL,
    value JSON DEFAULT '{}'::json,
    confidence FLOAT DEFAULT 0.7,
    source TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_memory_procedural (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    strategy TEXT NOT NULL,
    effectiveness_score FLOAT DEFAULT 0.0,
    last_used TIMESTAMP,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX IF NOT EXISTS agent_memory_episodic_user_idx ON agent_memory_episodic (user_id);
CREATE INDEX IF NOT EXISTS agent_memory_episodic_time_idx ON agent_memory_episodic (timestamp);
CREATE INDEX IF NOT EXISTS agent_memory_semantic_user_idx ON agent_memory_semantic (user_id);
CREATE INDEX IF NOT EXISTS agent_memory_semantic_key_idx ON agent_memory_semantic (key);
CREATE INDEX IF NOT EXISTS agent_memory_procedural_user_idx ON agent_memory_procedural (user_id);

GRANT ALL PRIVILEGES ON TABLE agent_memory_episodic TO learnfast;
GRANT ALL PRIVILEGES ON TABLE agent_memory_semantic TO learnfast;
GRANT ALL PRIVILEGES ON TABLE agent_memory_procedural TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE agent_memory_episodic_id_seq TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE agent_memory_semantic_id_seq TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE agent_memory_procedural_id_seq TO learnfast;

-- Knowledge Graphs (Saved Graph Definitions)
CREATE TABLE IF NOT EXISTS knowledge_graphs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    llm_config JSON DEFAULT '{}'::json,
    node_count INTEGER DEFAULT 0,
    relationship_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_built_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_graph_documents (
    id SERIAL PRIMARY KEY,
    graph_id TEXT REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS knowledge_graphs_user_idx ON knowledge_graphs (user_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_documents_graph_idx ON knowledge_graph_documents (graph_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_documents_doc_idx ON knowledge_graph_documents (document_id);

GRANT ALL PRIVILEGES ON TABLE knowledge_graphs TO learnfast;
GRANT ALL PRIVILEGES ON TABLE knowledge_graph_documents TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE knowledge_graph_documents_id_seq TO learnfast;


-- Document Quiz / Recall tables
CREATE TABLE IF NOT EXISTS document_quiz_items (
    id TEXT PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    mode TEXT DEFAULT 'cloze',
    passage_markdown TEXT NOT NULL,
    masked_markdown TEXT,
    answer_key JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    difficulty INTEGER DEFAULT 3,
    source_span JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_quiz_sessions (
    id TEXT PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    mode TEXT DEFAULT 'cloze',
    settings JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS document_study_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default_user',
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    reveal_config JSONB DEFAULT '{}',
    llm_config JSONB DEFAULT '{}',
    voice_mode_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doc_quiz_items_doc_id ON document_quiz_items(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_quiz_sessions_doc_id ON document_quiz_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_quiz_attempts_session_id ON document_quiz_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_doc_study_settings_doc_id ON document_study_settings(document_id);

GRANT ALL PRIVILEGES ON TABLE document_quiz_items TO postgres;
GRANT ALL PRIVILEGES ON TABLE document_quiz_sessions TO postgres;
GRANT ALL PRIVILEGES ON TABLE document_quiz_attempts TO postgres;
GRANT ALL PRIVILEGES ON TABLE document_study_settings TO postgres;

-- Ingestion jobs table (for tracking background ingestion status)
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id TEXT PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    phase TEXT DEFAULT 'queued',
    progress FLOAT DEFAULT 0.0,
    message TEXT,
    partial_ready BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_doc_idx ON ingestion_jobs(document_id);

GRANT ALL PRIVILEGES ON TABLE ingestion_jobs TO learnfast;
