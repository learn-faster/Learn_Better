# 🧠 LearnBetter: The Goal-Adaptive Learning Operating System

> **"Most LMS tools are just digital filing cabinets. LearnBetter is your personal cognitive architect."**

LearnBetter is an AI-native learning system that doesn't just store your notes it **re-engineers your brain**. By combining **Hybrid Graph-RAG**, **Autonomous Goal Agents**, and **Biometric Feedback**, it turns fragmented source material into a personalized, goal-aligned learning journey backed by cognitive science.

---

## 🚀 The "Wow" Factor: What Makes This Different?

While other projects do simple Vector RAG, LearnBetter builds a **living knowledge ecosystem**.

### 1. 🕸️ Hybrid Graph-RAG (The Vertical Advantage)
Most RAG systems only find "related facts." LearnBetter uses **Neo4j + pgvector** to map the *structural hierarchy* of knowledge.
- **Fact Discovery**: Finds the specific answer in your PDFs.
- **Structural Mapping**: Understands that you can't learn *Quantum Field Theory* without mastering *Linear Algebra* first. It builds a Knowledge Graph of concepts and prerequisites.

### 2. 🤖 The Autonomous Goal Agent (Your AI Accountability Partner)
It doesn't just track progress; it **negotiates** it.
- **Email Negotiation**: If you miss a milestone, the agent sends an email to "negotiate" a new daily plan based on your remaining time and goal priority.
- **Tool-Integrated**: The agent can take screenshots, search your notebook, and update your calendar.

### 3. ⌚ Biometric-Adaptive Pacing (Fitbit Integration)
Learning isn't just cognitive; it's physical.
- **Energy-Aware Scheduling**: LearnBetter syncs with your **Fitbit** to monitor sleep and readiness.
- **Dynamic Load Balancing**: High-readiness days get "Deep Work" sessions; low-readiness days get "Light Review" sessions automatically.

---

## 🛠️ The Architecture of Intelligence

LearnBetter is built on a "Triple-Store" architecture to handle the complexity of human learning.

| Layer | Component | Tech Stack | Purpose |
| :--- | :--- | :--- | :--- |
| **Cognition** | **Graph Engine** | Neo4j | Concept hierarchies & prerequisites |
| **Memory** | **Vector Memory** | pgvector (PostgreSQL) | Semantic context & factual recall |
| **Workflow** | **Open Notebook** | SurrealDB | Decentralized, local-first synced notes |
| **Logic** | **Agentic Layer** | FastAPI + Groq/Ollama | Autonomous planning & negotiation |

---

## 📦 Core Capabilities

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

---

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

  <kbd><img src="frontend/src/assets/curri.png" width="800" alt="Curriculum"></kbd>
  <p><i>AI-Generated Curriculum: Concepts mapped from your sources into a logical learning path.</i></p>
</div>

---

## ⚡ Quick Start

### 1) Clone and Configure
```bash
git clone https://github.com/learn-faster/Learn_Better.git
cd Learn_Better
cp .env.example .env
```

### 2) Infrastructure (Docker)
```bash
docker compose up -d
```

### 3) Backend Engine
```bash
uv sync
uv run python main.py
```

### 4) Frontend Interface
```bash
cd frontend
npm install && npm run dev
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
