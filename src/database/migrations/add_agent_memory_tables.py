from src.database.connections import postgres_conn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    """
    Adds agent memory tables for episodic, semantic, and procedural memory.
    """
    try:
        create_sql = """
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
        """
        postgres_conn.execute_write(create_sql)
        logger.info("Agent memory tables created or already exist.")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise e

if __name__ == "__main__":
    migrate()
