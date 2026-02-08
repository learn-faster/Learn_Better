# 🧠 LearnFast Core Engine

**The ultimate Hybrid Graph-RAG Pedagogical Platform & AI Study Companion.**

LearnFast is not just another note-taking app. It is a high-performance cognitive engine that fuses the structural integrity of **Knowledge Graphs (Neo4j)** with the semantic power of **Vector Search (pgvector)** and the proactive guidance of an **AI Goal Manifestation Agent**.

Designed for power-learners, researchers, and students, LearnFast automates the path from information ingestion to long-term knowledge mastery.

---

## ✨ Primary Intelligence Pillars

### 1. 📂 Multi-Modal Ingestion & Digitization
- **MarkItDown Integration**: Transform PDFs, Word Docs, and complex images into clean, semantically structured Markdown.
- **YouTube Ingest**: Automatically extract transcripts and convert them into study-ready content.
- **Provenance Tracking**: Every "knowledge atom" in the system is linked back to its source, ensuring zero-hallucination references.

### 2. 🕸️ Hybrid Graph-RAG Architecture
- **Pedagogical Structure (Neo4j)**: Understands the hierarchy of knowledge. Concepts aren't just strings; they are nodes with prerequisites, dependencies, and connectivity metrics.
- **Semantic Retrieval (pgvector)**: Leverages state-of-the-art embeddings (Ollama/OpenAI) for granular context retrieval during chat and generation.
- **Dynamic Curriculum**: Generates optimized learning paths based on your current knowledge frontier and available time budget.

### 3. 🤖 Goal Manifestation Agent (GMA)
- **Persistent AI Companion**: A proactive assistant powered by **LangGraph** that tracks your long-term goals.
- **Structured Memory**: Features Episodic and Semantic memory layers to remember your learning preferences and past interactions.
- **Proof of Work (Screenshots)**: The agent can "see" your progress via integrated Playwright screenshotting tools, verifying your achievements.
- **Active Guidance**: More than just a chatbot, the GMA serves as a personalized teacher that interrupts procrastination and suggests the next best step.

### 4. 📈 Mastery & Mastery Analytics
- **Native SRS Engine**: Evidence-based learning using the **SM-2 Algorithm** for scheduled spaced repetition.
- **AI Recall Tools**: Generate high-quality Flashcards and Questions (with LaTeX support) directly from your documents.
- **Cognitive Heatmaps**: Visualize your study intensity and consistency over time.
- **Retention Tracking**: Detailed analytics on your forgetting curve and mastery distribution.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python (FastAPI), SQLAlchemy, Pydantic, LangGraph, Opik |
| **Frontend** | React, Vite, Tailwind CSS, Framer Motion, Lucide Icons |
| **Database** | PostgreSQL (pgvector), Neo4j (Knowledge Graph) |
| **Inference** | Ollama (Local), OpenAI, Groq, OpenRouter |
| **Automation** | Playwright (Screenshots), Resend (Email), Microsoft MarkItDown |

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.12+** (Recommended via `uv`)
- **Docker & Docker Compose**
- **Ollama** (for local LLM/Embeddings)

### 1. Environment Setup
```bash
git clone https://github.com/your-repo/learn-faster-core.git
cd learn-faster-core
cp .env.example .env
```
*Edit `.env` to add your API keys (OpenAI, Groq, etc.) and configure your local DB paths.*

### 2. Launch Infrastructure (Docker)
```bash
docker compose up -d
```

### 3. Install & Run
```bash
# Install dependencies
uv sync

# Run the backend
uv run python main.py
```

### 4. Frontend Launch
```bash
cd frontend
npm install
npm run dev
```

---

## 📂 Project Navigation

```text
├── src/
│   ├── services/       # Core Logic: SRS, LLM, Memory, Screenshots
│   ├── routers/        # Standardized API Endpoints
│   ├── models/         # Pydantic & SQLAlchemy Schemas
│   ├── ingestion/      # Multi-modal document processing
│   └── navigation/     # Graph traversal & Path resolution
├── frontend/           # Modern React Dashboard & Tools
├── scripts/            # Database inspection & setup utilities
└── main.py             # FastAPI Entrypoint
```

---

## 🗺️ Roadmap
- [ ] **Biometric Integration**: Support for Fitbit/Apple Health to adjust study intensity based on sleep/stress.
- [ ] **Advanced Multimodal RAG**: Context-aware reasoning over diagrams and handwritten notes.
- [ ] **Collaborative Knowledge Maps**: Share and merge galaxy maps between users.
- [ ] **Mobile Companion**: Lite version for on-the-go SRS reviews.

---

**LearnFast** — *Optimizing the human learning loop with precision AI.*
