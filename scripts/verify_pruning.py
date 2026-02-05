
import asyncio
from src.path_resolution.content_retriever import ContentRetriever
from src.models.schemas import LearningChunk

async def verify_pruning():
    results = []
    retriever = ContentRetriever()
    
    # 1. Setup mock data
    concept_a = "mitochondria"
    concept_b = "atp_production"
    
    def mock_retrieve(concept):
        if concept == concept_a:
            return [LearningChunk(id=1, doc_source="bio101", content="Mitochondria part", concept_tag=concept_a)]
        if concept == concept_b:
            return [LearningChunk(id=2, doc_source="bio101", content="ATP part", concept_tag=concept_b)]
        return []

    retriever.retrieve_chunks_by_concept = mock_retrieve
    
    # Mock LLM rewrite
    async def mock_rewrite(target, budget, raw, completed):
        count = raw.count('Content:')
        results.append(f"Target: {target} | Mastered: {completed} | Chunks Found: {count}")
        return "Lesson generated."

    retriever._rewrite_with_llm = mock_rewrite
    
    # Pruned case
    await retriever.get_lesson_content([concept_a, concept_b], completed_concepts=[concept_a])
    
    # Normal case
    await retriever.get_lesson_content([concept_a, concept_b], completed_concepts=[])
    
    with open("scripts/results.txt", "w") as f:
        f.write("\n".join(results))
    print("Verification results written to scripts/results.txt")

if __name__ == "__main__":
    asyncio.run(verify_pruning())
