# Requirements Document

## Introduction

The LearnFast Core Engine is a personal learning platform that uses a hybrid Graph-RAG architecture to provide intelligent, personalized learning paths. The system combines knowledge graph reasoning (Neo4j) with content retrieval (PostgreSQL + pgvector) to deliver structured, time-constrained learning experiences. The engine ingests educational documents, extracts conceptual relationships, and generates adaptive learning paths based on user progress and time constraints.

## Glossary

- **Core Engine**: The central processing system that handles document ingestion, graph logic, and content retrieval
- **Hybrid Graph-RAG**: Architecture combining knowledge graphs for structural reasoning with vector databases for content retrieval
- **Knowledge Graph**: Neo4j-based graph database storing concepts and their prerequisite relationships
- **Vector Database**: PostgreSQL with pgvector extension storing document chunks and embeddings
- **Concept**: A fundamental learning unit representing a topic or skill
- **Learning Path**: A sequence of concepts ordered by prerequisite dependencies
- **User State**: Current progress tracking completed and in-progress concepts
- **Ingestion Engine**: Module responsible for processing raw documents into structured graph nodes and vector embeddings
- **Navigation Logic**: Module that determines available learning options based on user progress
- **Path Resolution**: Algorithm that generates time-constrained learning sequences
- **Unlock Algorithm**: Logic that determines which concepts become available after completing prerequisites

## Requirements

### Requirement 1

**User Story:** As a learner, I want to upload educational documents, so that the system can create a structured learning path from the content.

#### Acceptance Criteria

1. WHEN a user uploads a PDF, DOCX, or HTML document, THE Core Engine SHALL convert it to clean Markdown format using markitdown
2. WHEN processing a document, THE Core Engine SHALL extract key concepts and their prerequisite relationships using structured LLM analysis
3. WHEN extracting concepts, THE Core Engine SHALL return valid JSON conforming to the defined GraphSchema with concepts and prerequisite links
4. WHEN storing extracted data, THE Core Engine SHALL upsert concepts into the Knowledge Graph and store content chunks in the Vector Database
5. WHEN chunking content, THE Core Engine SHALL tag each chunk with its parent concept name for retrieval

### Requirement 2

**User Story:** As a learner, I want to see available learning paths, so that I can choose where to start my learning journey.

#### Acceptance Criteria

1. WHEN a user has no learning history, THE Navigation Logic SHALL identify root concepts with no prerequisites as starting points
2. WHEN displaying a learning path preview, THE Navigation Logic SHALL show a roadmap of concepts up to 3 hops ahead from any root concept
3. WHEN a user completes a concept, THE Navigation Logic SHALL unlock new concepts only if all their prerequisites are completed
4. WHEN determining unlocked concepts, THE Navigation Logic SHALL verify that the user has completed ALL prerequisite concepts before making a concept available
5. WHEN querying available concepts, THE Navigation Logic SHALL return concepts that are immediately accessible based on current user state

### Requirement 3

**User Story:** As a learner, I want time-constrained learning sessions, so that I can fit learning into my available schedule.

#### Acceptance Criteria

1. WHEN a user specifies a target concept and time budget, THE Path Resolution SHALL find the shortest path from current state to the target
2. WHEN estimating learning time, THE Path Resolution SHALL calculate time based on content chunk count with 2 minutes per chunk
3. WHEN the estimated path time exceeds the time budget, THE Path Resolution SHALL prune the path and suggest an intermediate concept as the new goal
4. WHEN generating lesson content, THE Path Resolution SHALL retrieve and order content chunks according to the resolved learning path
5. WHEN delivering content, THE Path Resolution SHALL format the lesson with clear concept headers and sequential organization

### Requirement 4

**User Story:** As a learner, I want my progress to be tracked, so that the system can provide personalized recommendations.

#### Acceptance Criteria

1. WHEN a user starts learning a concept, THE Core Engine SHALL record the relationship as IN_PROGRESS with a timestamp
2. WHEN a user completes a concept, THE Core Engine SHALL record the relationship as COMPLETED with a timestamp
3. WHEN tracking progress, THE Core Engine SHALL maintain user state in the Knowledge Graph using User nodes and relationships
4. WHEN querying user progress, THE Core Engine SHALL return accurate completion status for all concepts
5. WHEN updating progress, THE Core Engine SHALL ensure data consistency between user state and concept availability

### Requirement 5

**User Story:** As a system administrator, I want reliable data storage, so that learning content and progress are preserved.

#### Acceptance Criteria

1. WHEN storing concepts, THE Knowledge Graph SHALL enforce unique concept names using database constraints
2. WHEN storing prerequisite relationships, THE Knowledge Graph SHALL include weight and reasoning metadata for each relationship
3. WHEN storing content chunks, THE Vector Database SHALL include embeddings, source metadata, and concept tags
4. WHEN performing vector similarity search, THE Vector Database SHALL use HNSW indexing for efficient retrieval
5. WHEN the system starts, THE Core Engine SHALL initialize required database constraints and indexes

### Requirement 6

**User Story:** As a developer, I want structured data extraction, so that the system produces consistent and reliable knowledge graphs.

#### Acceptance Criteria

1. WHEN processing documents with LLM, THE Ingestion Engine SHALL use Pydantic models to enforce strict JSON schema validation
2. WHEN extracting prerequisite relationships, THE Ingestion Engine SHALL include dependency weight (0.0-1.0) and reasoning for each relationship
3. WHEN normalizing concept names, THE Ingestion Engine SHALL convert names to lowercase for consistent storage
4. WHEN handling extraction errors, THE Ingestion Engine SHALL validate JSON structure before attempting database operations
5. WHEN storing graph data, THE Ingestion Engine SHALL use MERGE operations to handle duplicate concepts gracefully