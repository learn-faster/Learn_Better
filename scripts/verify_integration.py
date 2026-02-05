
import asyncio
import os
from src.ingestion.ingestion_engine import IngestionEngine
from src.ingestion.document_processor import DocumentProcessor
from src.models.schemas import GraphSchema

async def verify_ingestion_generates_tags():
    """
    Manually run the ingestion pipeline on a sample text to verify tags are generated.
    This simulates what the background task does.
    """
    print("Initializing components...")
    engine = IngestionEngine()
    processor = DocumentProcessor()
    
    # Create a dummy markdown with distinct sections
    dummy_markdown = """
    # Photosynthesis
    Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar.
    
    # Mitochondria
    Mitochondria are known as the powerhouses of the cell. They are organelles that act like a digestive system which takes in nutrients, breaks them down, and creates energy rich molecules for the cell.
    """
    
    print("Processing dummy content...")
    chunks = processor.chunk_content(dummy_markdown)
    
    # Run the complete process (mocking DB storage to avoid polluting real DB or needing running DB)
    # We will patch the storage methods to just print what they WOULD store
    
    original_store_graph = engine.store_graph_data
    original_store_vector = engine.store_vector_data
    
    captured_data = {"tags": []}
    
    def mock_store_graph(schema, doc_id):
        print(f"Graph Schema Extracted: {len(schema.concepts)} concepts")
        print(f"Mappings: {schema.concept_mappings}")
        
    async def mock_store_vector(source, chunks, tags, doc_id):
        print(f"Vector Storage called with {len(tags)} tags")
        captured_data["tags"] = tags
        return [1] * len(tags)
        
    engine.store_graph_data = mock_store_graph
    engine.store_vector_data = mock_store_vector
    
    try:
        await engine.process_document_complete("dummy.md", dummy_markdown, chunks, 999)
        
        print("\n--- Verification Results ---")
        tags = captured_data["tags"]
        print(f"Generated Tags: {tags}")
        
        if len(tags) > 0 and "general" not in tags:
             print("SUCCESS: Semantic tags generated (not just 'general')")
        elif len(tags) > 0:
             print("PARTIAL: Tags generated but mostly 'general' (might be expected for short text)")
             print(f"Specific tags found? {any(t != 'general' for t in tags)}")
        else:
             print("FAILURE: No tags generated")
             
    except Exception as e:
        print(f"FAILURE: Execution crashed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_ingestion_generates_tags())
