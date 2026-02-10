# LearnFast Core

LearnFast Core is an AI-native learning engine that turns documents, links, and videos into structured knowledge graphs, adaptive curricula, and practice workflows. It combines Graph-RAG, vector search, and agent orchestration to personalize learning and keep progress aligned with user goals.

**What you get**
- Knowledge graphs built from PDFs, web pages, and YouTube transcripts.
- Adaptive curriculum and practice sessions backed by spaced repetition.
- Analytics and daily planning that tie progress to goals.
- Open Notebook module with SurrealDB for local-first note capture.

**Exceptional capabilities**
- **Agent monitoring via screenshots**: capture and analyze URLs as proof-of-work or progress checks.
- **Quiz generation + grading**: per-document quiz items, sessions, grading, and stats endpoints.
- **Voice workflows**: podcast generation with text-to-speech (TTS) and speech-to-text (STT) support in Open Notebook.
- **Multi-document graphs**: cross-document concept linking and graph statistics.
- **Queue-aware ingestion**: Redis-backed workers with local fallback and status reporting.
- **Observability**: Opik tracing hooks for API calls and tool usage.
- **Fitbit integration**: optional biometric sync for scheduling and focus planning.
- **Automated nudges**: daily quiz reminders and weekly digests.

**Architecture at a glance**
| Layer | Component | Tech | Purpose |
| --- | --- | --- | --- |
| Cognition | Graph Engine | Neo4j | Prerequisites and concept relationships |
| Memory | Vector Store | PostgreSQL + pgvector | Semantic retrieval |
| Workflow | Open Notebook | SurrealDB | Notes and sources |
| Orchestration | Agents | LangGraph | Planning and automation |
| Observability | Tracing | Opik | Request-level tracing and tool events |
| Queue | Background Jobs | Redis + RQ | Scalable ingestion and processing |

**Repository layout**
- `src/` FastAPI backend and core services
- `frontend/` React frontend (Vite)
- `on_api/` Open Notebook API
- `scripts/` maintenance scripts
- `docs/` internal docs and audits
- `database/` DB artifacts and migrations

## Requirements
- Python 3.12
- Node.js 18+ and npm
- Docker (recommended for Neo4j/Postgres/SurrealDB)
- `uv` for Python dependency management

## Getting Started

### 1) Clone and configure
```bash
git clone https://github.com/learn-faster/Learn_Better.git
cd Learn_Better
cp .env.example .env
```

### 2) Start infrastructure (Docker)
```bash
docker compose up -d
```

### 3) Install dependencies
```bash
uv sync
cd frontend
npm install
```

### 4) Initialize databases
```bash
uv run python -m src.database.init_db
```

### 5) Run the backend
```bash
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

### 6) Run the frontend
```bash
cd frontend
npm run dev
```

### 7) Open the app
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8001`

## Configuration
All environment variables live in `.env`. See `.env.example` for defaults.

**Databases**
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `SURREAL_URL`, `SURREAL_USER`, `SURREAL_PASSWORD`, `SURREAL_NAMESPACE`, `SURREAL_DATABASE`

**LLM and Embeddings**
- `LLM_PROVIDER`, `LLM_MODEL`
- `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_CONCURRENCY`
- Optional overrides: `EXTRACTION_MODEL`, `REWRITE_MODEL`, context window limits

**Voice (TTS/STT)**
- Configure provider/model in Open Notebook speaker profiles and episode profiles

**Screenshots (Agent Tools)**
- Requires Playwright for screenshot capture

**Email service (Resend)**
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_DOMAIN`
Notes:
- If Resend is not configured, email notifications and goal negotiations are disabled.
- Use a verified sender domain for production.

**Fitbit integration (optional)**
- `FITBIT_CLIENT_ID`
- `FITBIT_CLIENT_SECRET`
- `FITBIT_REDIRECT_URI` (auto-built from `FRONTEND_URL` if empty)

**Frontend/Backend URLs**
- `FRONTEND_URL` for CORS and OAuth callbacks
- `VITE_BACKEND_URL` when frontend cannot reach `http://localhost:8001`

**Queue/Worker (optional)**
- `RQ_ENABLED=true` enables Redis queue processing
- `REDIS_URL`, `REDIS_QUEUE_NAME`, `REDIS_JOB_TIMEOUT`

## Running with Makefile
```bash
make help
make setup
make docker-up
make db-init
make backend
make frontend
make dev
make worker
make test
```
Notes:
- For WSL Docker: `make docker-up ENV=wsl`
- `make worker` runs the Redis ingestion worker

## Common Tasks
**Run backend tests**
```bash
uv run pytest
```

**Start Redis worker**
```bash
uv run python scripts/rq_worker.py
```

**Rebuild DB schema (non-destructive checks)**
```bash
uv run python -m src.database.init_db
```

## Troubleshooting
**Missing Python packages**
- Run `uv sync` again to ensure dependencies are installed.

**Backend cannot reach Docker services**
- Set `POSTGRES_HOST`, `NEO4J_URI`, or `DOCKER_HOST_OVERRIDE` explicitly in `.env`.

**Open Notebook errors**
- Confirm SurrealDB is running and credentials match `.env`.

**Frontend API errors**
- Set `VITE_BACKEND_URL` in `.env` if the backend is not on `localhost:8001`.

## License
Add your license here.
