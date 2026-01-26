# Implementation Plan

- [x] 1. Set up project structure and core dependencies
  - Create Python modules for ingestion, navigation, and path resolution (using existing uv project structure)
  - Add dependencies to pyproject.toml: Neo4j, PostgreSQL, Pydantic, markitdown, and Ollama client libraries
  - Configure Docker Compose with Neo4j, PostgreSQL+pgvector, and Ollama services
  - Initialize database schemas and constraints
  - _Requirements: 5.1, 5.5_

- [x] 1.1 Write property test for project initialization
  - **Property 19: Concept uniqueness enforcement**
  - **Validates: Requirements 5.1**

- [x] 2. Implement core data models and validation
  - Create Pydantic models for GraphSchema, PrerequisiteLink, and UserState
  - Implement validation logic for concept names, weights, and relationships
  - Set up database connection utilities for Neo4j and PostgreSQL
  - _Requirements: 6.1, 6.2, 5.1_

- [x] 2.1 Write property test for schema validation
  - **Property 3: JSON schema compliance**
  - **Validates: Requirements 1.3, 6.1**

- [x] 2.2 Write property test for data completeness
  - **Property 20: Data completeness validation**
  - **Validates: Requirements 5.2, 5.3, 6.2**

- [x] 3. Build document processing and ingestion engine
  - Implement DocumentProcessor class with markitdown integration
  - Create document conversion methods for PDF, DOCX, and HTML to Markdown
  - Build content chunking functionality with configurable chunk sizes
  - _Requirements: 1.1, 1.5_

- [x] 3.1 Write property test for document conversion
  - **Property 1: Document conversion consistency**
  - **Validates: Requirements 1.1**

- [x] 3.2 Write property test for content chunking
  - **Property 5: Content chunk tagging consistency**
  - **Validates: Requirements 1.5**

- [x] 4. Implement LLM-based graph extraction
  - Create IngestionEngine class with Ollama integration using gpt-oss:20b-cloud
  - Implement structured extraction with Pydantic schema enforcement
  - Build concept and relationship extraction logic with reasoning capture
  - Add concept name normalization to lowercase
  - _Requirements: 1.2, 1.3, 6.1, 6.3, 6.4_

- [x] 4.1 Write property test for graph extraction
  - **Property 2: Graph extraction structure validation**
  - **Validates: Requirements 1.2**

- [x] 4.2 Write property test for name normalization
  - **Property 21: Name normalization consistency**
  - **Validates: Requirements 6.3**

- [x] 4.3 Write property test for error validation
  - **Property 22: Error validation precedence**
  - **Validates: Requirements 6.4**

- [x] 5. Build vector embedding and storage system
  - Integrate Ollama embeddinggemma:latest model for content embeddings
  - Implement vector storage in PostgreSQL with pgvector
  - Create content chunk storage with concept tagging
  - Build vector similarity search functionality
  - _Requirements: 1.4, 1.5, 5.3_

- [x] 5.1 Write property test for storage consistency
  - **Property 4: Storage round-trip consistency**
  - **Validates: Requirements 1.4**

- [ ] 6. Implement knowledge graph storage and operations
  - Create Neo4j integration with concept and relationship MERGE operations
  - Implement graph constraint initialization and management
  - Build prerequisite relationship storage with weight and reasoning metadata
  - Add duplicate concept handling with graceful MERGE operations
  - _Requirements: 1.4, 5.1, 5.2, 6.5_

- [ ] 6.1 Write property test for duplicate handling
  - **Property 19: Concept uniqueness enforcement**
  - **Validates: Requirements 5.1, 6.5**

- [ ] 7. Checkpoint - Ensure all ingestion tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Build navigation logic and user progress tracking
  - Implement NavigationEngine class with root concept identification
  - Create user progress tracking with IN_PROGRESS and COMPLETED relationships
  - Build prerequisite validation logic for concept unlocking
  - Implement path preview functionality with 3-hop depth limit
  - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3_

- [ ] 8.1 Write property test for root concept identification
  - **Property 6: Root concept identification**
  - **Validates: Requirements 2.1**

- [ ] 8.2 Write property test for path preview depth
  - **Property 7: Path preview depth constraint**
  - **Validates: Requirements 2.2**

- [ ] 8.3 Write property test for prerequisite validation
  - **Property 8: Prerequisite completion validation**
  - **Validates: Requirements 2.3, 2.4**

- [ ] 8.4 Write property test for progress persistence
  - **Property 15: Progress state persistence**
  - **Validates: Requirements 4.1, 4.2**

- [ ] 9. Implement user state management and queries
  - Create UserProgressTracker class with state persistence
  - Build user progress query functionality with accuracy validation
  - Implement state synchronization between progress updates and availability
  - Add user state consistency validation in knowledge graph
  - _Requirements: 4.3, 4.4, 4.5, 2.5_

- [ ] 9.1 Write property test for state consistency
  - **Property 16: User state graph consistency**
  - **Validates: Requirements 4.3**

- [ ] 9.2 Write property test for query accuracy
  - **Property 17: Progress query accuracy**
  - **Validates: Requirements 4.4**

- [ ] 9.3 Write property test for state synchronization
  - **Property 18: State synchronization consistency**
  - **Validates: Requirements 4.5**

- [ ] 9.4 Write property test for available concepts
  - **Property 9: Available concept state consistency**
  - **Validates: Requirements 2.5**

- [ ] 10. Build path resolution and optimization
  - Implement PathResolver class with shortest path algorithms
  - Create time estimation logic based on content chunk counts
  - Build path pruning functionality for time constraint satisfaction
  - Add pathfinding optimization using Neo4j Graph Data Science library
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 10.1 Write property test for path optimization
  - **Property 10: Shortest path optimization**
  - **Validates: Requirements 3.1**

- [ ] 10.2 Write property test for time estimation
  - **Property 11: Time estimation accuracy**
  - **Validates: Requirements 3.2**

- [ ] 10.3 Write property test for time constraints
  - **Property 12: Time constraint satisfaction**
  - **Validates: Requirements 3.3**

- [ ] 11. Implement content retrieval and lesson generation
  - Create ContentRetriever class with concept-based chunk retrieval
  - Build lesson content formatting with sequential organization
  - Implement content ordering consistency based on resolved paths
  - Add lesson formatting with clear concept headers
  - _Requirements: 3.4, 3.5_

- [ ] 11.1 Write property test for content ordering
  - **Property 13: Content ordering consistency**
  - **Validates: Requirements 3.4**

- [ ] 11.2 Write property test for lesson formatting
  - **Property 14: Lesson formatting completeness**
  - **Validates: Requirements 3.5**

- [ ] 12. Create main application interfaces and API endpoints
  - Build main application class integrating all components
  - Create API endpoints for document upload, progress tracking, and lesson generation
  - Implement error handling and logging throughout the system
  - Add configuration management for database connections and model settings
  - _Requirements: All requirements integration_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.