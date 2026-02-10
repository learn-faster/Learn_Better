"""
SQLAlchemy ORM setup for LearnFast Core.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool

from src.database.connections import postgres_conn


def _build_sqlalchemy_url() -> str:
    host = postgres_conn._get_host()
    port = postgres_conn.port
    database = postgres_conn.database
    user = postgres_conn.user
    password = postgres_conn.password
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


SQLALCHEMY_DATABASE_URL = _build_sqlalchemy_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,
    pool_recycle=3600
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
