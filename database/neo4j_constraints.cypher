// Neo4j constraints and indexes for LearnFast Core Engine
// This script sets up the knowledge graph schema with required constraints

// Create unique constraint for concept names (Requirements 5.1)
CREATE CONSTRAINT concept_name_unique FOR (c:Concept) REQUIRE c.name IS UNIQUE;

// Create unique constraint for user IDs
CREATE CONSTRAINT user_uid_unique FOR (u:User) REQUIRE u.uid IS UNIQUE;