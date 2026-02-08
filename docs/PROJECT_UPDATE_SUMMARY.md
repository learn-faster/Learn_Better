# LearnFast Core — Project Summary & Recent Updates

## Project Overview
LearnFast Core is a Hybrid Graph‑RAG Pedagogical Platform and AI study companion that helps users learn faster using evidence‑based techniques such as spaced repetition, active recall, interleaving, and goal‑driven planning. The system combines:

- **FastAPI backend** for core services and APIs.
- **PostgreSQL + pgvector** for relational data and semantic search.
- **Neo4j** for knowledge graphs.
- **SurrealDB** for Open Notebook workflows.
- **React + Vite frontend** for the user experience.
- **LangGraph‑based Agent** (Goal Manifestation Agent / GMA) for personalized guidance.

Key goals:
- Build durable learning through research‑backed study methods.
- Personalize learning paths to user goals (short/near/long‑term).
- Integrate progress tracking, review scheduling, and actionable insights.

## Detailed Codebase Diagram
```
learn-faster-core/
├─ main.py                              # FastAPI app entrypoint
├─ pyproject.toml                       # Python deps (uv)
├─ docker-compose.yml                   # Infra: Postgres, Neo4j, SurrealDB
├─ README.md
├─ SYSTEM_ARCHITECTURE.md
├─ AGENTS.md                            # Evidence-based learning playbook
├─ docs/
│  └─ PROJECT_UPDATE_SUMMARY.md         # This file
├─ src/
│  ├─ config.py                         # Pydantic settings
│  ├─ dependencies.py                   # FastAPI DI
│  ├─ routers/
│  │  ├─ documents.py                   # Documents + quiz/recall APIs
│  │  ├─ knowledge_graph.py             # KG APIs (build, fetch, merge)
│  │  ├─ goals.py                       # Goal CRUD + agent entrypoints
│  │  ├─ study.py                       # Study sessions
│  │  ├─ flashcards.py                  # Flashcard CRUD
│  │  ├─ curriculum.py                  # Curriculum generation APIs
│  │  └─ ...                            # analytics, navigation, etc.
│  ├─ models/
│  │  ├─ orm.py                         # SQLAlchemy models
│  │  ├─ schemas.py                     # Pydantic schemas
│  │  └─ enums.py
│  ├─ database/
│  │  ├─ orm.py                         # SQLAlchemy session/engine
│  │  ├─ init_db.py                     # bootstrap + schema checks
│  │  ├─ graph_storage.py               # Neo4j integration
│  │  └─ migrations/                    # DB migrations
│  ├─ ingestion/
│  │  ├─ document_processor.py          # Convert to markdown + parse
│  │  ├─ ingestion_engine.py            # Graph + vector pipeline
│  │  ├─ vector_storage.py              # pgvector ops
│  │  └─ youtube_utils.py               # transcript extraction
│  ├─ services/
│  │  ├─ llm_service.py                 # provider adapters (OpenAI, Groq, etc.)
│  │  ├─ knowledge_graph_service.py     # KG orchestration
│  │  ├─ goal_agent.py                  # LangGraph Goal Manifestation Agent
│  │  ├─ memory_service.py              # episodic/semantic/procedural memory
│  │  ├─ screenshot_service.py          # proof‑of‑work capture
│  │  ├─ weekly_digest_scheduler.py     # scheduled email digest
│  │  └─ ...
│  ├─ navigation/
│  │  └─ path_resolver.py               # learning path logic
│  ├─ path_resolution/
│  │  └─ content_retriever.py           # source resolution
│  ├─ storage/
│  │  └─ document_store.py              # upload, delete, metadata
│  ├─ static/                           # legacy static frontend
│  └─ utils/
│     └─ logger.py
├─ on_api/
│  ├─ router_main.py                    # SurrealDB Open Notebook API
│  ├─ notebooks.py
│  ├─ notes.py
│  └─ sources.py
├─ open_notebook/
│  └─ commands/                         # Surreal commands for notebook
├─ frontend/
│  ├─ vite.config.js
│  ├─ package.json
│  ├─ src/
│  │  ├─ App.jsx                        # App routes
│  │  ├─ main.jsx                       # entry + i18n init
│  │  ├─ pages/
│  │  │  ├─ Dashboard.jsx
│  │  │  ├─ Documents.jsx
│  │  │  ├─ DocumentViewer.jsx
│  │  │  ├─ KnowledgeGraph.jsx
│  │  │  ├─ CurriculumList.jsx
│  │  │  └─ Settings.jsx
│  │  ├─ components/
│  │  │  ├─ GoalAgent/                  # Agent dock, chat, onboarding
│  │  │  ├─ documents/                  # Recall Studio, uploads
│  │  │  ├─ flashcards/                 # creators + review
│  │  │  ├─ layout/                     # Navbar, Layout, Settings
│  │  │  ├─ source/                     # Source insights + chat
│  │  │  └─ ui/                         # Radix UI wrappers
│  │  ├─ modules/
│  │  │  └─ open-notebook/              # Chat/notes + i18n
│  │  ├─ services/                      # API client layers
│  │  ├─ stores/                        # Zustand state
│  │  └─ lib/                           # config, i18n, helpers
│  └─ public/
└─ tests/                                # property-based + unit tests
```

### Render‑Friendly ASCII Architecture Diagram
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
│  App.jsx + Router                                                            │
│  ├─ Dashboard  ├─ Documents ├─ DocumentViewer ├─ KnowledgeGraph ├─ Curriculum │
│  ├─ Goal Agent UI ├─ Settings UI                                               │
│  └─ Stores (Zustand) + API Clients                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │ HTTP
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND (FastAPI)                                │
│  main.py + routers                                                           │
│  ├─ documents.py ├─ knowledge_graph.py ├─ goals.py ├─ study.py ├─ flashcards  │
│  └─ curriculum.py                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────── Core Services ────────────────────────────────┐
│  llm_service  |  ingestion_engine  |  document_processor  |  KG service      │
│  goal_agent (LangGraph)  | memory_service | screenshot_service | digest_sched │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────── Data Layer ─────────────────────────────────┐
│  PostgreSQL + pgvector  |  Neo4j  |  SurrealDB  |  File Storage (uploads)     │
└──────────────────────────────────────────────────────────────────────────────┘

Open Notebook API (SurrealDB):
  on_api/router_main.py -> notebooks.py | notes.py | sources.py
```

## Current Feature Areas
- **Documents**: upload, extraction, text processing, and study interactions.
- **Flashcards & SRS**: SM‑2 style review scheduling and retention metrics.
- **Knowledge Graphs**: graph exploration and prerequisite mapping.
- **Goal Agent (GMA)**: personalized guidance, onboarding, and recommendations.
- **Analytics**: tracking learning behaviors and progress.

## Recent Updates Implemented
This section captures the updates and refinements introduced recently across the frontend and backend.

### 1) PDF Viewer Reliability & Performance
- **React‑PDF worker fixed** to use the locally bundled `pdfjs-dist` worker, eliminating worker version mismatch errors.
- **Pinned `pdfjs-dist`** to a compatible version (`5.4.296`) for stability.
- **Memoized `file` and `options` props** to avoid unnecessary reloads and repeated fetches.
- **Improved resize behavior** using a `ResizeObserver` for consistent page rendering.

### 2) Document Session Handling (Backend + Frontend)
- `/documents/:id/end-session` now accepts **JSON or raw `sendBeacon` payloads**, avoiding `422` errors.
- Frontend `sendBeacon` now explicitly sends **`application/json`** via `Blob`.

### 3) Agent (GMA) UI Redesign
- **Modernized agent launcher** with updated styling and a more premium look.
- **New full‑screen onboarding experience** for first‑time users (welcome screen).
- **Improved chat layout and bubble styles** for better readability.
- **Global availability** of the agent with more visible, persistent access.

### 4) Global Settings UX
- **Rebuilt as a right‑side drawer** with a dedicated overlay and smoother focus handling.
- **Esc / overlay close support**, plus body scroll lock while open.
- More consistent spacing and typography for usability.

### 5) Layout & UI Polish
- **Sidebar refinements** for spacing, active states, and consistency.
- **Dashboard cleanup** for hierarchy, spacing, and improved clarity.
- **Documents and Knowledge Graph pages** refreshed for better alignment.
- **Notes/Chat panels** adjusted for more consistent padding, headers, and list styling.

### 6) i18n Setup Fix
- Added missing `i18next-browser-languagedetector` dependency.
- Ensured `i18n` is initialized in `main.jsx`.

## Files Updated (High‑Level)
These files were updated as part of the recent changes:

- `frontend/src/pages/DocumentViewer.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Documents.jsx`
- `frontend/src/pages/KnowledgeGraph.jsx`
- `frontend/src/components/GoalAgent/AgentChat.jsx`
- `frontend/src/components/GoalAgent/AgentDock.jsx`
- `frontend/src/components/GoalAgent/AgentWelcome.jsx` (new)
- `frontend/src/components/Settings.jsx`
- `frontend/src/components/layout/Navbar.jsx`
- `frontend/src/index.css`
- `frontend/src/main.jsx`
- `frontend/src/modules/open-notebook/components/*`
- `frontend/src/components/source/ChatPanel.jsx`
- `frontend/src/components/flashcards/FlashcardCreator.jsx`
- `src/routers/documents.py`
- `frontend/package.json`

## Next Areas Under Active Improvement
These are the areas planned/under refinement based on current roadmap:

1. **Document Viewer UX**
   - Fix remaining chat/notes layout issues.
   - Ensure source content fills available space and renders smoothly.
   - Remove blank/unused panels and align with backend data shape.

2. **Agent UX + Guardrails**
   - Make agent experience more modern and guided for new users.
   - Add domain guardrails to keep the agent on learning objectives.
   - Improve tool reliability (scratchpad, memory, screenshot tool).

3. **Knowledge Graph Workflow**
   - Let users select source documents for graph generation.
   - Allow multiple graphs and cross‑graph linking.
   - Provide dedicated LLM settings per graph job.

4. **Documents Endpoint**
   - Markdown conversion flows and interactive “fill‑in” learning mode.
   - Voice recall + validation flow (learning concepts, not memorizing).
   - Full LLM provider picker with tests.

5. **Curriculum Endpoint**
   - Reframe as “Goal‑aligned Learning Plans” with real outputs.
   - Integrate with goals, knowledge graphs, and scheduling.

## Operational Notes
- Backend services rely on **uv** for environment management.
  - Run scripts with `uv run <script>`.
  - Add dependencies with `uv add <package>`.
- If you want to enable weekly digest scheduling:
  ```env
  ENABLE_WEEKLY_DIGEST_SCHEDULER=true
  WEEKLY_DIGEST_DAY=6
  WEEKLY_DIGEST_HOUR=18
  WEEKLY_DIGEST_MINUTE=0
  ```

### Resend Inbound Email + Vercel Hosting Instructions
Use these steps to enable inbound email negotiation and replies.

#### 1) Backend URL for Webhook
Resend requires a **public HTTPS** endpoint. If your backend is deployed on Vercel, the webhook endpoint is:

```
https://<your-vercel-project>.vercel.app/api/goals/agent/email/inbound
```

If your backend is not on Vercel, replace with your backend’s public domain.

#### 2) Resend Inbound Webhook Setup
In the Resend dashboard:
- **Endpoint URL:** use the URL above
- **Event type:** Incoming Email / Email Received (inbound)

#### 3) Environment Variables (Backend)
Set these in Vercel (or your backend host):

```
RESEND_API_KEY=...
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_REPLY_DOMAIN=reply.yourdomain.com
FRONTEND_URL=https://<your-frontend-domain>
```

#### 4) Frontend Configuration
Agent Settings includes:
- `Resend API Key`
- `Resend Reply Domain`

These are saved to user settings and are used for **both** outbound and inbound email flows.

#### 5) Localhost Limitation
Resend **cannot** send webhooks to `localhost`. Use a public domain or a tunnel (ngrok/Cloudflare) for local testing.

## Summary
The project is actively being refined into a high‑quality, production‑ready learning platform. Recent updates focused on PDF stability, agent UI, settings UX, and general UI polish, while the next wave will deepen functionality across documents, knowledge graphs, curriculum planning, and agent workflows.
