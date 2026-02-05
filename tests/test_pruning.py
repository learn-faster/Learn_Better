
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.path_resolution.content_retriever import ContentRetriever
from src.models.schemas import LearningChunk

@pytest.mark.asyncio
async def test_get_lesson_content_pruning():
    """Verify that chunks for mastered concepts are filtered out."""
    retriever = ContentRetriever()
    
    # Mock retrieve_chunks_by_concept
    # We'll return chunks for two concepts: 'concept_a' (mastered) and 'concept_b' (novel)
    def mock_retrieve(concept):
        if concept == "concept_a":
            return [LearningChunk(id=1, doc_source="doc1", content="Content A", concept_tag="concept_a")]
        if concept == "concept_b":
            return [LearningChunk(id=2, doc_source="doc2", content="Content B", concept_tag="concept_b")]
        return []

    retriever.retrieve_chunks_by_concept = MagicMock(side_effect=mock_retrieve)
    
    # Mock LLM calls
    retriever._rewrite_with_llm = AsyncMock(return_value="Rewritten Lesson")
    retriever._cache_lesson = MagicMock()
    
    # Case 1: No completed concepts
    await retriever.get_lesson_content(["concept_a", "concept_b"], completed_concepts=[])
    # Should call retrieve for both
    assert retriever.retrieve_chunks_by_concept.call_count == 2
    
    retriever.retrieve_chunks_by_concept.reset_mock()
    
    # Case 2: 'concept_a' is completed
    await retriever.get_lesson_content(["concept_a", "concept_b"], completed_concepts=["concept_a"])
    
    # Should ONLY call retrieve for 'concept_b'
    # Actually, the logic in get_lesson_content now filters before calling retrieve_chunks_by_concept
    retriever.retrieve_chunks_by_concept.assert_called_once_with("concept_b")
    
    # Verify the rewrite prompt context
    # args: target_concept, time_budget, raw_content, completed_concepts
    args, kwargs = retriever._rewrite_with_llm.call_args
    assert "concept_a" in args[3] # completed_concepts list
    assert "Content B" in args[2] # raw_content
    assert "Content A" not in args[2] # raw_content should NOT have A

@pytest.mark.asyncio
async def test_get_lesson_content_all_pruned():
    """Verify behavior when all concepts in the path are already mastered."""
    retriever = ContentRetriever()
    
    mock_chunk = LearningChunk(id=1, doc_source="doc1", content="Target Content", concept_tag="target")
    retriever.retrieve_chunks_by_concept = MagicMock(return_value=[mock_chunk])
    retriever._rewrite_with_llm = AsyncMock(return_value="Mastery Review Lesson")
    
    # If path is [A, B] and both mastered, it should still include B as a "Review"
    await retriever.get_lesson_content(["concept_a", "target"], completed_concepts=["concept_a", "target"])
    
    # Should fallback to include the target
    retriever.retrieve_chunks_by_concept.assert_called_with("target")
