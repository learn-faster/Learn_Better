
import pytest
from src.path_resolution.content_retriever import ContentRetriever

def test_retriever_exists():
    retriever = ContentRetriever()
    assert retriever is not None

@pytest.mark.asyncio
async def test_simple_async():
    assert True
