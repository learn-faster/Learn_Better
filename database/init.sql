-- PostgreSQL initialization script for LearnFast Core Engine
-- This script sets up the vector database schema with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create learning_chunks table for content storage
CREATE TABLE IF NOT EXISTS learning_chunks (
    id SERIAL PRIMARY KEY,
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
GRANT ALL PRIVILEGES ON TABLE learning_chunks TO learnfast;
GRANT USAGE, SELECT ON SEQUENCE learning_chunks_id_seq TO learnfast;