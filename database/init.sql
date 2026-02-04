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
    embedding vector(768) NOT NULL,     -- Semantic embedding from embeddinggemma:latest (768 dimensions)
    concept_tag TEXT NOT NULL,          -- Links to Neo4j Concept.name
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create efficient vector similarity search index
CREATE INDEX IF NOT EXISTS learning_chunks_embedding_idx 
ON learning_chunks USING hnsw (embedding vector_cosine_ops);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

GRANT ALL PRIVILEGES ON TABLE user_settings TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE user_settings_id_seq TO learnfast;
