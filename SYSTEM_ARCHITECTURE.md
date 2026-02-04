# LearnFast Core: System Architecture & Data Flow

This document provides a detailed technical breakdown of how the LearnFast Core application operates, mapping frontend UI actions to backend services and data storage.

---

## 🏗️ High-Level Architecture

LearnFast uses a **Hybrid Graph-RAG (Retrieval-Augmented Generation)** architecture to provide structured, AI-powered learning.

-   **Frontend**: React + Vite + Tailwind CSS + Framer Motion.
-   **Backend**: FastAPI (Python) + SQLAlchemy (Postgres) + Neo4j (Graph).
-   **AI Engine**: Ollama (local) or OpenAI/Groq for LLM & Embeddings.
-   **Extraction**: Microsoft `markitdown` for document-to-markdown conversion.

---

## 🌊 Core Workflows

### 1. Document Ingestion Pipeline
When you upload a document in the **Library**, the following happens:

1.  **UI (Documents.jsx)**: Sends a `POST /api/documents/upload` with the file.
2.  **Backend (documents.py)**: 
    -   `DocumentStore`: Saves the raw file to `data/documents/` and creates a "pending" record in PostgreSQL.
    -   `DocumentProcessor`: Uses `markitdown` to convert the PDF/Image into clean Markdown text.
    -   **NUL Sanitization**: Strips invalid characters to ensure database compatibility.
3.  **IngestionEngine**:
    -   **Vector Storage**: Chunks the text and generates embeddings (Ollama/OpenAI) stored in PostgreSQL (`pgvector`).
    -   **Graph Extraction**: Sends chunks to the LLM (`llama3:8b`) to identify **Concepts** and **Prerequisites**.
    -   **Neo4j Storage**: Saves the extracted nodes (Concepts) and edges (Prerequisites) to the knowledge graph.

### 2. Practice & Study Loop
When you enter the **Practice Hub**:

1.  **UI (Practice.jsx/Flashcards.jsx)**: Requests `GET /api/flashcards`.
2.  **Generation (ai.py)**: 
    -   If a user requests AI generation, the backend retrieves chunks from the **Vector DB** relevant to the document.
    -   The `LLMService` sends these chunks to the LLM to generate `front/back` pairs.
3.  **Execution (study.py)**:
    -   **StudySession**: Tracks the start/end time of a review session.
    -   **SM-2 Algorithm**: When a user rates a card (0-5), the backend updates `easiness_factor`, `interval`, and `next_review` dates in the database.

### 3. Knowledge Map Navigation
When you explore the **Galaxy**:

1.  **UI (KnowledgeGraph.jsx)**: Requests `GET /api/navigation/graph`.
2.  **Backend (navigation.py)**:
    -   Queries **Neo4j** for all concepts and their relationships.
    -   Calculates "Connectivity" based on the number of linked prerequisites.
3.  **Sync Intelligence**: Triggers a re-scan of ingested documents to find newly surfaced concepts.

### 4. AI Curriculum & Learning Paths
When you click "Practice Concept" or request a study guide:

1.  **UI (Navigation/KnowledgeMap)**: Sends a `POST /api/ai/learning-path` with the target concept.
2.  **Backend (PathResolver)**:
    -   **Graph Scan**: Attempts to find a path from "Roots" (concepts you should know) to the "Target" in Neo4j.
    -   **Time Budgeting**: Considers the user's time budget to prune the path.
    -   **LLM Fallback**: If no graph exists, it uses RAG to retrieve chunks from relevant documents and asks the LLM to design an ad-hoc curriculum.
3.  **Content Retrieval**: Fetches all markdown chunks related to the path concepts to present a unified "Lesson."

---

## 🔗 Endpoint Reference

| UI Route | Backend Endpoint | Primary Service | Logic / Storage |
| :--- | :--- | :--- | :--- |
| `/documents` | `GET /api/documents/` | `DocumentStore` | Lists document metadata from Postgres. |
| `/documents/upload` | `POST /api/documents/upload` | `IngestionEngine` | File Upload -> Markdown -> Vector DB -> Neo4j. |
| `/practice` | `GET /api/flashcards/` | `FlashcardService` | Retrieves cards filtered by SRS `next_review` date. |
| `/practice/study` | `POST /api/study/session/end` | `SM-2 Logic` | Calculates new intervals for spaced repetition. |
| `/knowledge-map` | `GET /api/navigation/graph` | `Neo4j Driver` | Returns nodes/links for the galaxy visualization. |
| `/analytics` | `GET /api/analytics/overview` | `StatsService` | Aggregates data from `ActivityLogs` and `StudySessions`. |

---

## 📊 Data Schema Definitions

### PostgreSQL (Relational)
-   **`documents`**: Metadata, file paths, and extracted markdown text.
-   **`document_chunks`**: Individual paragraphs + `vector` embeddings for RAG.
-   **`flashcards`**: Front/back text + SRS scheduling parameters.
-   **`study_sessions`**: Metrics on cards reviewed, time spent, and performance.

### Neo4j (Graph)
-   **`(Concept)`**: Nodes representing atomic pieces of knowledge (e.g., "Probability").
-   **`[:PREREQUISITE_FOR]`**: Relationships indicating dependency (e.g., "Set Theory" -> "Probability").
-   **`[:MENTIONED_IN]`**: Provenance links connecting concepts to specific `Document` IDs.

---

## 🛠️ Technology Stack Detail
-   **Extraction**: `markitdown` (Python)
-   **ORM**: `SQLAlchemy` (PostgreSQL)
-   **Graph DB**: `Neo4j` (Community Edition)
-   **Vector DB**: `pgvector` (via Postgres)
-   **LLM Interface**: `OpenAI SDK` (configured for Ollama compatibility)
-   **Frontend**: `Vite` + `React` + `Lucide Icons` + `Framer Motion`
