"""Database initialization utilities for LearnFast Core Engine."""

import os
from pathlib import Path
from .connections import neo4j_conn, postgres_conn
from .graph_storage import graph_storage
from .orm import Base, engine


def initialize_neo4j_constraints():
    """Initialize Neo4j constraints and indexes using GraphStorage."""
    try:
        # Use the dedicated graph storage module for constraint initialization
        graph_storage.initialize_constraints()
        print("Neo4j constraints initialized successfully using GraphStorage")
        return True
    except Exception as e:
        print(f"Neo4j constraint initialization failed: {e}")
        return False


def verify_postgres_schema():
    """Verify PostgreSQL schema is properly initialized."""
    try:
        # Check if learning_chunks table exists
        result = postgres_conn.execute_query("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'learning_chunks'
        """)
        
        if not result:
            raise Exception("learning_chunks table not found. Please run Docker Compose to initialize the database.")
        
        # Check if pgvector extension is available
        result = postgres_conn.execute_query("""
            SELECT extname FROM pg_extension WHERE extname = 'vector'
        """)
        
        if not result:
            raise Exception("pgvector extension not found. Please ensure PostgreSQL container has pgvector installed.")
        
        print("PostgreSQL schema verification successful")
        return True
        
    except Exception as e:
        print(f"PostgreSQL schema verification failed: {e}")
        return False


def initialize_orm_tables():
    """Initialize SQLAlchemy ORM tables."""
    try:
        # Create new tables (Flashcard, StudySession, etc.)
        Base.metadata.create_all(bind=engine)
        print("ORM tables initialized successfully")
        
        # Manually migrate 'documents' table to add new columns if they don't exist
        # This is needed because 'documents' table might already exist from raw SQL init
        migrate_documents_table()
        
        return True
    except Exception as e:
        print(f"ORM table initialization failed: {e}")
        return False


def migrate_documents_table():
    """Add new columns to documents table if they are missing."""
    cols_to_add = [
        ("title", "VARCHAR"),
        ("file_type", "VARCHAR"),
        ("tags", "JSON"),
        ("category", "VARCHAR"),
        ("folder_id", "VARCHAR"),
        ("extracted_text", "TEXT"),
        ("page_count", "INTEGER DEFAULT 0"),
        ("time_spent_reading", "INTEGER DEFAULT 0"),
        ("last_opened", "TIMESTAMP"),
        ("first_opened", "TIMESTAMP"),
        ("completion_estimate", "INTEGER"),
        ("completion_estimate", "INTEGER"),
        ("reading_progress", "FLOAT DEFAULT 0.0"),
        ("reading_time_min", "INTEGER"),
        ("reading_time_max", "INTEGER"),
        ("reading_time_median", "INTEGER"),
        ("word_count", "INTEGER DEFAULT 0"),
        ("difficulty_score", "FLOAT"),
        ("language", "VARCHAR"),
        ("scanned_prob", "FLOAT DEFAULT 0.0")
    ]
    
    for col_name, col_type in cols_to_add:
        try:
            postgres_conn.execute_query(f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name} to documents table")
        except Exception as e:
            # Ignore error if column likely exists
            # In a real prod env, we'd check existence first, but this is a simple migration approach
            pass


def initialize_databases():
    """Initialize both Neo4j and PostgreSQL databases."""
    print("Initializing databases...")
    
    # Initialize Neo4j constraints
    try:
        initialize_neo4j_constraints()
        print("Neo4j constraints initialized successfully")
    except Exception as e:
        print(f"Neo4j initialization failed: {e}")
        return False
    
    # Verify PostgreSQL schema
    if not verify_postgres_schema():
        return False
        
    # Initialize ORM tables
    if not initialize_orm_tables():
        return False
    
    print("Database initialization completed successfully")
    return True


def check_concept_uniqueness_constraint():
    """Check if concept name uniqueness constraint is enforced using GraphStorage."""
    try:
        return graph_storage.verify_constraints()
    except Exception as e:
        print(f"Error checking concept uniqueness constraint: {e}")
        return False


if __name__ == "__main__":
    initialize_databases()