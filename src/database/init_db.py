"""Database initialization utilities for LearnFast Core Engine."""

import os
from pathlib import Path
from .connections import neo4j_conn, postgres_conn
from .graph_storage import graph_storage
from .orm import Base, engine
from src.models import orm as orm_models  # Ensure models are registered with Base
from src.utils.logger import logger


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
        logger.info("ORM tables initialized successfully")
        
        # Manually migrate 'documents' table to add new columns if they don't exist
        migrate_documents_table()
        
        # Manually migrate 'user_settings' table
        migrate_user_settings_table()
        # Manually migrate 'goals' table
        migrate_goals_table()
        # Manually migrate 'fitbit_daily_metrics' table
        migrate_fitbit_daily_metrics_table()
        # Manually migrate 'daily_plan_entries' and 'agent_email_messages' tables
        migrate_daily_plan_entries_table()
        migrate_agent_email_messages_table()
        
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
        ("ai_summary", "TEXT"),
        ("page_count", "INTEGER DEFAULT 0"),
        ("time_spent_reading", "INTEGER DEFAULT 0"),
        ("last_opened", "TIMESTAMP"),
        ("first_opened", "TIMESTAMP"),
        ("completion_estimate", "INTEGER"),
        ("reading_progress", "FLOAT DEFAULT 0.0"),
        ("reading_time_min", "INTEGER"),
        ("reading_time_max", "INTEGER"),
        ("reading_time_median", "INTEGER"),
        ("word_count", "INTEGER DEFAULT 0"),
        ("difficulty_score", "FLOAT"),
        ("language", "VARCHAR"),
        ("scanned_prob", "FLOAT DEFAULT 0.0"),
        ("raw_extracted_text", "TEXT"),
        ("filtered_extracted_text", "TEXT"),
        ("source_url", "VARCHAR"),
        ("source_type", "VARCHAR"),
        ("content_profile", "JSON"),
        ("ocr_status", "VARCHAR"),
        ("ocr_provider", "VARCHAR")
    ]
    
    for col_name, col_type in cols_to_add:
        try:
            postgres_conn.execute_write(f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name} to documents table")
        except Exception as e:
            # Ignore error if column likely exists
            pass


def migrate_user_settings_table():
    """Add new columns to user_settings table if they are missing."""
    cols_to_add = [
        ("timezone", "VARCHAR DEFAULT 'UTC'"),
        ("email", "VARCHAR"),
        ("resend_api_key", "VARCHAR"),
        ("resend_reply_domain", "VARCHAR"),
        ("current_streak", "INTEGER DEFAULT 0"),
        ("longest_streak", "INTEGER DEFAULT 0"),
        ("last_activity_date", "TIMESTAMP"),
        ("target_retention", "FLOAT DEFAULT 0.9"),
        ("daily_new_limit", "INTEGER DEFAULT 20"),
        ("focus_duration", "INTEGER DEFAULT 25"),
        ("break_duration", "INTEGER DEFAULT 5"),
        ("email_daily_reminder", "BOOLEAN DEFAULT TRUE"),
        ("email_streak_alert", "BOOLEAN DEFAULT TRUE"),
        ("email_weekly_digest", "BOOLEAN DEFAULT TRUE"),
        ("weekly_digest_day", "INTEGER DEFAULT 6"),
        ("weekly_digest_hour", "INTEGER DEFAULT 18"),
        ("weekly_digest_minute", "INTEGER DEFAULT 0"),
        ("weekly_digest_last_sent_at", "TIMESTAMP"),
        ("llm_config", "JSON"),
        ("use_biometrics", "BOOLEAN DEFAULT FALSE"),
        ("fitbit_client_id", "VARCHAR"),
        ("fitbit_client_secret", "VARCHAR"),
        ("fitbit_redirect_uri", "VARCHAR"),
        ("bedtime", "VARCHAR"),
        ("email_negotiation_enabled", "BOOLEAN DEFAULT TRUE"),
        ("email_negotiation_last_sent_at", "TIMESTAMP"),
        ("created_at", "TIMESTAMP"),
        ("updated_at", "TIMESTAMP")
    ]
    
    for col_name, col_type in cols_to_add:
        try:
            postgres_conn.execute_write(f"ALTER TABLE user_settings ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name} to user_settings table")
        except Exception as e:
            # Ignore error if column already exists
            pass


def migrate_goals_table():
    """Add goal ladder columns to goals table if they are missing."""
    cols_to_add = [
        ("short_term_goals", "JSON"),
        ("near_term_goals", "JSON"),
        ("long_term_goals", "JSON")
    ]
    for col_name, col_type in cols_to_add:
        try:
            postgres_conn.execute_write(f"ALTER TABLE goals ADD COLUMN {col_name} {col_type}")
            print(f"Added column {col_name} to goals table")
        except Exception:
            pass


def migrate_fitbit_daily_metrics_table():
    """Ensure fitbit_daily_metrics table exists."""
    try:
        postgres_conn.execute_write("""
            CREATE TABLE IF NOT EXISTS fitbit_daily_metrics (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES user_settings(id),
                date DATE NOT NULL,
                sleep_duration_hours FLOAT,
                sleep_efficiency FLOAT,
                resting_heart_rate FLOAT,
                readiness_score FLOAT,
                summary JSON,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP
            )
        """)
        postgres_conn.execute_write("CREATE INDEX IF NOT EXISTS idx_fitbit_daily_metrics_user_date ON fitbit_daily_metrics(user_id, date)")
    except Exception:
        pass


def migrate_daily_plan_entries_table():
    """Ensure daily_plan_entries table exists."""
    try:
        postgres_conn.execute_write("""
            CREATE TABLE IF NOT EXISTS daily_plan_entries (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR DEFAULT 'default_user',
                date DATE,
                item_id VARCHAR,
                title VARCHAR NOT NULL,
                item_type VARCHAR DEFAULT 'study',
                goal_id VARCHAR,
                planned_minutes INTEGER DEFAULT 30,
                completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP
            )
        """)
        postgres_conn.execute_write("CREATE INDEX IF NOT EXISTS idx_daily_plan_entries_user_date ON daily_plan_entries(user_id, date)")
    except Exception:
        pass


def migrate_agent_email_messages_table():
    """Ensure agent_email_messages table exists."""
    try:
        postgres_conn.execute_write("""
            CREATE TABLE IF NOT EXISTS agent_email_messages (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR DEFAULT 'default_user',
                direction VARCHAR DEFAULT 'outbound',
                thread_id VARCHAR,
                subject VARCHAR,
                from_email VARCHAR,
                to_email VARCHAR,
                body_text TEXT,
                metadata JSON,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        postgres_conn.execute_write("CREATE INDEX IF NOT EXISTS idx_agent_email_user ON agent_email_messages(user_id, created_at)")
    except Exception:
        pass


def initialize_databases():
    """Initialize both Neo4j and PostgreSQL databases."""
    print("Initializing databases...")
    
    # 1. Verify PostgreSQL schema
    if not verify_postgres_schema():
        logger.error("PostgreSQL verification failed")
        return False
        
    # 2. Initialize ORM tables and run migrations
    if not initialize_orm_tables():
        logger.error("ORM initialization failed")
        return False

    # 3. Initialize Neo4j constraints
    try:
        initialize_neo4j_constraints()
        logger.info("Neo4j constraints initialized successfully")
    except Exception as e:
        print(f"Neo4j initialization failed (non-fatal): {e}")
        # We allow this to be non-fatal for now to avoid blocking the whole app
    
    logger.info("Database initialization completed successfully")
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
