# LearnFast Core Engine

A hybrid Graph-RAG learning platform that combines knowledge graph reasoning with content retrieval to deliver intelligent, personalized learning paths.

## Architecture

The LearnFast Core Engine uses a hybrid approach:
- **Neo4j** for knowledge graph operations (concept relationships and prerequisites)
- **PostgreSQL + pgvector** for content storage and vector similarity search
- **Ollama** for local LLM inference and embeddings

## Quick Start

### Prerequisites

- Python 3.12+
- Docker and Docker Compose
- uv (Python package manager)

### Setup

1. **Clone and install dependencies:**
   ```bash
   uv sync
   ```

2. **Copy environment configuration:**
   ```bash
   cp .env.example .env
   ```

3. **Start services:**
   ```bash
   ./scripts/start_services.sh
   ```

4. **Run tests:**
   ```bash
   uv run pytest
   ```

### Services

After running the start script, the following services will be available:

- **Neo4j Browser**: http://localhost:7475 (neo4j/password)
- **PostgreSQL**: localhost:5433 (learnfast/password)
- **Ollama API**: http://localhost:11434 (host instance)

## Project Structure

```
src/
├── ingestion/          # Document processing and graph extraction
├── navigation/         # User progress and path discovery
├── path_resolution/    # Learning path optimization
├── models/            # Pydantic data models
└── database/          # Database connections and utilities

tests/                 # Property-based and unit tests
database/             # Database initialization scripts
scripts/              # Utility scripts
```

## Development

### Running Tests

```bash
# Run all tests
uv run pytest

# Run property-based tests only
uv run pytest -m property

# Run with coverage
uv run pytest --cov=src
```

### Database Management

```bash
# Initialize databases
python -m src.database.init_db

# Reset databases
docker-compose down -v
docker-compose up -d
```

## Requirements

This implementation satisfies the following key requirements:

- **5.1**: Concept uniqueness enforcement through Neo4j constraints
- **5.5**: Database initialization with proper schemas and indexes