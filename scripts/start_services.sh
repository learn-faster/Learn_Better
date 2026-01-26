#!/bin/bash

# Start LearnFast Core Engine services
echo "Starting LearnFast Core Engine services..."

# Start Docker Compose services
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check if Neo4j is ready
echo "Checking Neo4j connection..."
until docker exec learnfast-neo4j cypher-shell -u neo4j -p password "RETURN 1" > /dev/null 2>&1; do
    echo "Waiting for Neo4j..."
    sleep 5
done

# Check if PostgreSQL is ready
echo "Checking PostgreSQL connection..."
until docker exec learnfast-postgres pg_isready -U learnfast > /dev/null 2>&1; do
    echo "Waiting for PostgreSQL..."
    sleep 5
done

echo "Services are ready!"

# Initialize databases
echo "Initializing databases..."
python -m src.database.init_db

echo "Setup complete! Services are running:"
echo "- Neo4j Browser: http://localhost:7475 (neo4j/password)"
echo "- PostgreSQL: localhost:5433 (learnfast/password)"
echo "- Ollama API: http://localhost:11434 (host instance)"