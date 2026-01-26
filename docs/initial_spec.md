This document consolidates all architectural decisions, schemas, algorithms, and code snippets discussed. It is designed to be the "source of truth" for the development team to ensure strict adherence to the **Hybrid Graph-RAG** design.

---

# Technical Specification: LearnFast Core Engine (v1.0)

**Project:** LearnFast Personal Learning Platform
**Module:** Core Engine (Ingestion, Graph Logic, Retrieval)
**Architecture:** Hybrid Graph-RAG (Neo4j + PostgreSQL)

## 1. High-Level Architecture

The system decouples **structural reasoning** (Knowledge Graph) from **content retrieval** (Vector Database).

* **Ingestion:** Converts raw docs  Markdown  Structured Graph Nodes + Vector Embeddings.
* **Storage:** Polyglot persistence. Neo4j handles the "Map" of knowledge; PostgreSQL handles the "Library" of content.
* **Resolution:** Dynamic pathfinding based on user constraints (Time/Depth) and current state (Completed/New).

---

## 2. Infrastructure & Tooling

* **Language:** Python 3.10+
* **Graph Database:** Neo4j v5+ (Community or Enterprise). *Must utilize Graph Data Science (GDS) library for path weighting.*
* **Vector Database:** PostgreSQL v16+ with `pgvector` extension.
* **LLM Inference:** Ollama (Local) or OpenAI API.
* *Extraction Model:* `llama3:instruct` (Logic/Reasoning)
* *Embedding Model:* `mxbai-embed-large` or `nomic-embed-text` (Retrieval)


* **Document Processing:** `markitdown` (Microsoft) - *Do not use docker wrappers; use native library.*

---

## 3. Data Schema Definition

### 3.1 Neo4j Graph Schema (The "Map")

**Nodes:**

* `Concept`: `{ name: String (Unique), description: String, depth_level: Integer }`
* `User`: `{ uid: String (Unique), name: String }`

**Relationships:**

* `(:Concept)-[:PREREQUISITE { weight: Float, reasoning: String }]->(:Concept)`
* *Note:* `weight` (0.0-1.0) represents dependency strength. `reasoning` stores "Why is this needed?"


* `(:User)-[:COMPLETED { finished_at: DateTime }]->(:Concept)`
* `(:User)-[:IN_PROGRESS { started_at: DateTime }]->(:Concept)`

### 3.2 PostgreSQL Schema (The "Content")

**Table:** `learning_chunks`

```sql
CREATE TABLE learning_chunks (
    id SERIAL PRIMARY KEY,
    doc_source TEXT,          -- Filename or URL
    content TEXT,             -- The actual markdown text chunk
    embedding vector(1024),   -- Dimension matches 'mxbai-embed-large'
    concept_tag TEXT          -- EXACT match to Neo4j Concept.name
);
CREATE INDEX ON learning_chunks USING hnsw (embedding vector_cosine_ops);

```

---

## 4. Module A: Ingestion Engine (The "Write" Path)

**Strategy:** "Two-Pass Structured Extraction"
We do not ask the LLM to "vectorize" blindly. We force it to extract the graph structure first.

### Step 4.1: Conversion

Use `markitdown` to normalize PDF/DOCX/HTML into clean Markdown.

### Step 4.2: Graph Extraction (Pass 1)

**Constraint:** The LLM must return strict JSON.
**Library:** `pydantic` (or `instructor`) to enforce schema.

```python
from pydantic import BaseModel, Field
from typing import List

class PrerequisiteLink(BaseModel):
    source_concept: str = Field(..., description="The fundamental concept")
    target_concept: str = Field(..., description="The advanced concept depending on source")
    weight: float = Field(..., description="0.0 to 1.0 dependency strength")
    reasoning: str = Field(..., description="Why is source needed for target?")

class GraphSchema(BaseModel):
    concepts: List[str]
    prerequisites: List[PrerequisiteLink]

# Prompt Strategy:
# "Analyze text. Identify key concepts (nodes) and dependencies (edges). Return JSON."

```

### Step 4.3: Storage Logic

1. **Graph Upsert:**
* `MERGE` concepts into Neo4j (normalize names to lowercase).
* `MERGE` relationships. *Always store the reasoning.*


2. **Vector Store:**
* Chunk the markdown (recursive character splitter).
* Embed via Ollama.
* Insert into Postgres `learning_chunks`, tagging it with the parent concept name.



---

## 5. Module B: Navigation Logic (The "Read" Path)

This module determines the user's "Menu" using pure Graph Algorithms (Cypher).

### Mechanism 5.1: Cold Start (Finding Roots)

*Use Case:* User has no history. Where do they start?
*Logic:* Find nodes with **In-Degree = 0** (No prerequisites).

```cypher
MATCH (c:Concept)
WHERE NOT (c)<-[:PREREQUISITE]-()
RETURN c.name, c.description

```

### Mechanism 5.2: Path Preview

*Use Case:* Show the "Roadmap" (Hook the user).
*Logic:* From a Root, look ahead 3 hops.

```cypher
MATCH path = (root:Concept)-[:PREREQUISITE*1..3]->(leaf:Concept)
WHERE root.name = $selected_root
RETURN [n IN nodes(path) | n.name] as roadmap

```

### Mechanism 5.3: The "Unlock" Algorithm

*Use Case:* User finished a module. What opens up?
*Logic:* A node is unlocked **only** if the user has completed **ALL** its prerequisites.

```cypher
MATCH (u:User {uid: $uid})-[:COMPLETED]->(done:Concept)
MATCH (candidate:Concept)
WHERE (done)-[:PREREQUISITE]->(candidate) -- It's a next step
  AND NOT (u)-[:COMPLETED]->(candidate)   -- Not already done
  AND ALL(req IN [(candidate)<-[:PREREQUISITE]-(p) | p] 
          WHERE (u)-[:COMPLETED]->(req))  -- ALL prereqs are met
RETURN candidate.name

```

---

## 6. Module C: Path Resolution & Lesson Generation

**Strategy:** Time-Constrained Pathfinding.

### Algorithm

1. **Input:** Target Concept () + Time Budget ().
2. **Backwards Search:** Find shortest path from *User's Current State* to .
3. **Cost Estimation:**
* Query Postgres: `SELECT count(*) FROM chunks WHERE concept_tag = 'NodeName'`.
* Estimate: 1 chunk  2 minutes reading.


4. **Pruning:** If `Sum(Path_Time) > Limit`, cut the tail (target) and suggest the intermediate node as the new goal.

### Retrieval Query (Hybrid)

Once the path is finalized, fetch the actual content.

```python
# Python Pseudocode
def get_lesson_content(path_concepts):
    # 1. Get chunks for all concepts in the path, ordered by path sequence
    content = []
    for concept in path_concepts:
        pg_cursor.execute("""
            SELECT content FROM learning_chunks 
            WHERE concept_tag = %s 
            ORDER BY id ASC
        """, (concept,))
        content.append(f"# {concept}\n" + pg_cursor.fetchall())
    return "\n\n".join(content)

```

---

## 7. Deployment Configuration

**`docker-compose.yml`** for local development.

```yaml
version: '3.8'
services:
  # 1. Vector DB
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: learnfast
    ports:
      - "5432:5432"

  # 2. Graph DB
  neo4j:
    image: neo4j:5.15-enterprise # Or community if license permits
    environment:
      NEO4J_AUTH: neo4j/password
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
      NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes"
    ports:
      - "7474:7474" # HTTP
      - "7687:7687" # Bolt

  # 3. LLM Inference
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ./ollama_data:/root/.ollama
    # Dev Note: Run `docker exec -it ollama ollama pull llama3` after start

```

## 8. Development Handoff Checklist

1. Initialize **Neo4j Constraints** immediately: `CREATE CONSTRAINT FOR (c:Concept) REQUIRE c.name IS UNIQUE`.
2. Implement **Pydantic Models** before writing extraction logic.
3. Ensure **MarkItDown** is installed via `pip`, not Docker, for the ingestion script.
4. Validate the **"Unlock Algorithm"** (Mechanism 5.3) with unit tests using a mock graph.