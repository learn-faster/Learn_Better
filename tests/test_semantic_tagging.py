
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from src.ingestion.ingestion_engine import IngestionEngine
from src.models.schemas import GraphSchema

@pytest.fixture
def mock_dependencies():
    with patch('src.ingestion.ingestion_engine.VectorStorage') as mock_vs_cls, \
         patch('src.ingestion.ingestion_engine.DocumentProcessor') as mock_dp_cls, \
         patch('src.ingestion.ingestion_engine.graph_storage') as mock_gs:
        
        mock_vs_instance = MagicMock()
        mock_vs_instance.store_chunks_batch = AsyncMock(return_value=[1, 2, 3])
        mock_vs_cls.return_value = mock_vs_instance
        
        yield {
            'vector_storage': mock_vs_instance,
            'graph_storage': mock_gs
        }

@pytest.mark.asyncio
async def test_extract_graph_structure_semantic_tagging(mock_dependencies):
    """Verify that extract_graph_structure uses mappings from LLM response."""
    
    # Mock LLM response
    mock_response = {
        "concepts": ["photosynthesis", "cellular respiration"],
        "prerequisites": [],
        "concept_mappings": {
            "photosynthesis": [0, 2],
            "cellular respiration": [1]
        }
    }
    
    with patch('src.services.llm_service.llm_service.get_chat_completion', new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = json.dumps(mock_response)
        
        # Initialize engine (mocks are applied by fixture patch)
        engine = IngestionEngine()
        
        chunks = ["Photosynthesis uses light.", "Respiration uses glucose.", "More about photosynthesis."]
        
        # We also need to patch the local import of llm_service inside the method if the global patch doesn't catch it.
        # But 'src.services.llm_service.llm_service.get_chat_completion' patch should affect the object wherever it is imported from
        # as long as it is the SAME object.
        
        # However, extraction calls `self._create_chunked_windows(chunks)`.
        
        schema = await engine.extract_graph_structure(chunks)
        
        assert "photosynthesis" in schema.concepts
        assert "cellular respiration" in schema.concepts
        
        # Check mappings
        assert schema.concept_mappings["photosynthesis"] == [0, 2]
        assert schema.concept_mappings["cellular respiration"] == [1]

@pytest.mark.asyncio
async def test_process_document_complete_tagging(mock_dependencies):
    """Verify that process_document_complete applies tags to chunks correctly."""
    
    engine = IngestionEngine()
    
    # Mock extract_graph_structure to return a specific schema
    mock_schema = GraphSchema(
        concepts=["concept_a", "concept_b"],
        prerequisites=[],
        concept_mappings={
            "concept_a": [0],
            "concept_b": [1]
        }
    )
    
    # We need to patch extract_graph_structure on the instance
    engine.extract_graph_structure = AsyncMock(return_value=mock_schema)
    engine.store_graph_data = MagicMock()
    # vector_storage is already mocked by fixture, but we can verify calls on engine.vector_storage
    
    chunks = ["Text for A", "Text for B", "Text for General"]
    
    await engine.process_document_complete("test.md", "ignore", chunks, 123)
    
    # Check store_vector_data calls
    # The engine calls self.store_vector_data, which calls self.vector_storage.store_chunks_batch
    # We can inspect self.vector_storage.store_chunks_batch call args
    
    call_args = engine.vector_storage.store_chunks_batch.call_args
    assert call_args is not None
    
    # batch_data is list of tuples: (doc_source, content, tag, document_id)
    batch_data = call_args[0][0]
    
    assert batch_data[0][2] == "concept_a"
    assert batch_data[1][2] == "concept_b"
    assert batch_data[2][2] == "general" # Default
