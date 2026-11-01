from dataclasses import replace

import pytest

from app.rag.chunking import DocumentChunk, SourceCitation
from app.rag.registry import (
    HealthSourceRecord,
    ReviewAuditEvent,
    SourceReviewStatus,
)
from app.rag.retrieval import (
    InMemoryVectorStore,
    LexicalRetriever,
    VectorRetriever,
)


def chunk(chunk_id: str, text: str) -> DocumentChunk:
    return DocumentChunk(
        chunk_id=chunk_id,
        text=text,
        citation=SourceCitation(
            source_id=f"source-{chunk_id}",
            title=f"Test source {chunk_id}",
            publisher="Test publisher",
            url="https://example.org/source",
            section="Test section",
        ),
        source_metadata=HealthSourceRecord(
            id=f"source-{chunk_id}",
            title=f"Test source {chunk_id}",
            publisher="Test publisher",
            url="https://example.org/source",
            accessedDate="2026-10-17",
            language="en",
            topics=["test"],
            reviewStatus="approved",
            reviewer="Test reviewer",
            reviewedAt="2026-10-17",
            limitations=["Synthetic test fixture."],
        ),
        approval_event=ReviewAuditEvent(
            sourceId=f"source-{chunk_id}",
            fromStatus="pending_review",
            toStatus="approved",
            reviewer="Test reviewer",
            reviewedAt="2026-10-17",
            reason="Synthetic test approval only.",
        ),
    )


class FixtureEmbeddingProvider:
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [
            [1.0, 0.0] if "malaria" in text.lower() else [0.0, 1.0]
            for text in texts
        ]


@pytest.mark.anyio
async def test_lexical_retriever_returns_only_term_matched_passages() -> None:
    malaria = chunk("malaria", "Malaria is caused by parasites.")
    hygiene = chunk("hygiene", "Hand hygiene helps limit infection spread.")
    retriever = LexicalRetriever([malaria, hygiene])

    results = await retriever.retrieve("malaria parasites")

    assert [result.chunk.chunk_id for result in results] == ["malaria"]
    assert results[0].score > 0


@pytest.mark.anyio
async def test_lexical_retriever_abstains_when_no_terms_match() -> None:
    retriever = LexicalRetriever(
        [chunk("hygiene", "Hand hygiene helps limit infection spread.")]
    )

    assert await retriever.retrieve("volcano geology") == []


@pytest.mark.anyio
async def test_vector_retriever_indexes_and_searches_with_injected_embeddings() -> None:
    malaria = chunk("malaria", "Malaria test passage.")
    hygiene = chunk("hygiene", "Hand hygiene test passage.")
    retriever = VectorRetriever(
        FixtureEmbeddingProvider(),
        InMemoryVectorStore(),
    )

    await retriever.index([malaria, hygiene])
    results = await retriever.retrieve("malaria question")

    assert [result.chunk.chunk_id for result in results] == ["malaria", "hygiene"]
    assert results[0].score > results[1].score


@pytest.mark.anyio
async def test_vector_store_rejects_mismatched_embedding_counts() -> None:
    store = InMemoryVectorStore()
    with pytest.raises(ValueError, match="exactly one embedding"):
        await store.upsert([chunk("one", "Test.")], [])


@pytest.mark.anyio
async def test_vector_retriever_rejects_invalid_embedding_result_count() -> None:
    class InvalidEmbeddingProvider:
        async def embed_texts(self, _texts: list[str]) -> list[list[float]]:
            return []

    retriever = VectorRetriever(InvalidEmbeddingProvider(), InMemoryVectorStore())
    with pytest.raises(ValueError, match="invalid result count"):
        await retriever.index([chunk("one", "Test.")])


@pytest.mark.anyio
async def test_retrievers_reject_chunks_without_current_approval_evidence() -> None:
    approved_fixture = chunk("pending", "Test passage.")
    pending = replace(
        approved_fixture,
        source_metadata=approved_fixture.source_metadata.model_copy(
            update={"review_status": SourceReviewStatus.PENDING_REVIEW}
        ),
    )

    with pytest.raises(ValueError, match="not approved"):
        LexicalRetriever([pending])
