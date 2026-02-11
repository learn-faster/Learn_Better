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

<div align="center">
  <h3>Interactive Dashboard</h3>
  <img src="frontend/src/assets/dash.png" width="800" alt="Dashboard Overview">
  <br/><br/>
  
  <h3>Document Management & Processing</h3>
  <img src="frontend/src/assets/documents.png" width="800" alt="Document Ingestion">
  <br/><br/>

  <h3>Adaptive Practice Engine</h3>
  <img src="frontend/src/assets/prac.png" width="800" alt="Practice Sessions">
  <br/><br/>

  <h3>Customizable Curriculum</h3>
  <img src="frontend/src/assets/curri.png" width="800">
  <br/><br/>

  <h3>Personalised learning</h3>
  <img src="frontend/src/assets/welcome.png" width="800" alt="Knowledge Graph Visualization">
</div>

**LLM and Embeddings**
- `LLM_PROVIDER`, `LLM_MODEL`
- `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_CONCURRENCY`
- Optional overrides: `EXTRACTION_MODEL`, `REWRITE_MODEL`, context window limits

## Architecture (High-Level)
```
Frontend (React + Vite)
  ├─ Dashboard / Analytics / Practice / Docs / Knowledge Graph
  └─ Agent UI (chat + tools + settings)

Backend (FastAPI)
  ├─ Documents, Flashcards, Practice, Curriculum
  ├─ Goals, Daily Plans, Agent + Negotiation
  ├─ Analytics, Dashboard, Fitbit integration
  └─ Knowledge Graph + Navigation

Data Layer
  ├─ PostgreSQL + pgvector
  ├─ Neo4j (concept graph)
  └─ SurrealDB (Open Notebook)
---

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

---

## Key Endpoints
- `/api/documents/*` — ingest, parse, recall prompts
- `/api/practice/*` — practice sessions, items, history
- `/api/dashboard/overview` — unified dashboard data
- `/api/analytics/*` — insights and trends
- `/api/goals/*` — goals, daily plans, agent actions
- `/api/fitbit/*` — optional biometric inputs
- `/api/graphs/*` — knowledge graph workflows

---
## Project Map
```
src/
  routers/           # API endpoints
  services/          # domain logic (practice, goals, analytics, agent)
  models/            # ORM + Pydantic schemas
  ingestion/         # document processing
frontend/
  pages/             # Dashboard, Analytics, Practice, Documents
  components/        # Agent UI and shared UI pieces
docs/
  PROJECT_OVERVIEW.md
  PROJECT_UPDATE_SUMMARY.md
```
**LearnFast** — turn goals into daily learning and measurable progress.
