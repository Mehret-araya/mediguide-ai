from dataclasses import replace

import pytest

from app.rag.chunking import DocumentChunk, SourceCitation
from app.rag.assistant import HealthAssistant
from app.rag.registry import (
    HealthSourceRecord,
    ReviewAuditEvent,
    SourceReviewStatus,
)
from app.rag.retrieval import (
    InMemoryVectorStore,
    LexicalRetriever,
    RetrievedPassage,
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
            license="Synthetic test fixture license",
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
async def test_vector_retriever_rejects_non_finite_embedding_values() -> None:
    class InvalidEmbeddingProvider:
        async def embed_texts(self, _texts: list[str]) -> list[list[float]]:
            return [[float("nan"), 1.0]]

    retriever = VectorRetriever(InvalidEmbeddingProvider(), InMemoryVectorStore())
    with pytest.raises(ValueError, match="finite numbers"):
        await retriever.index([chunk("one", "Test.")])


@pytest.mark.anyio
async def test_vector_retriever_rejects_boolean_embedding_values() -> None:
    class InvalidEmbeddingProvider:
        async def embed_texts(self, _texts: list[str]) -> list[list[float]]:
            return [[True, 1.0]]

    retriever = VectorRetriever(InvalidEmbeddingProvider(), InMemoryVectorStore())
    with pytest.raises(ValueError, match="finite numbers"):
        await retriever.index([chunk("one", "Test.")])


@pytest.mark.anyio
async def test_vector_retriever_rejects_zero_embedding_vectors() -> None:
    class InvalidEmbeddingProvider:
        async def embed_texts(self, _texts: list[str]) -> list[list[float]]:
            return [[0.0, 0.0]]

    retriever = VectorRetriever(InvalidEmbeddingProvider(), InMemoryVectorStore())
    with pytest.raises(ValueError, match="zero vectors"):
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


@pytest.mark.anyio
async def test_assistant_refuses_urgent_emergency_phrases_without_citations() -> None:
    class EmptyRetriever:
        async def retrieve(
            self, _question: str, *, limit: int = 3
        ) -> list[RetrievedPassage]:
            return []

    assistant = HealthAssistant(EmptyRetriever())
    emergency_questions = [
        "I'm having a heart attack right now",
        "Someone is not breathing, call an ambulance",
        "I need emergency help",
    ]
    for question in emergency_questions:
        response = await assistant.answer(question, request_id="test-request")
        assert response.citations == [], f"Expected no citations for: {question}"
        assert "emergency" in response.answer.lower() or "emergency number" in response.answer.lower(), (
            f"Expected emergency guidance for: {question}"
        )
        assert any(
            "emergency" in lim.lower() for lim in response.limitations
        ), f"Expected emergency limitation for: {question}"


@pytest.mark.anyio
async def test_assistant_skips_corrupted_chunks_and_abstains() -> None:
    good = chunk("good", "Malaria is caused by parasites.")
    from dataclasses import replace as dc_replace
    from app.rag.chunking import SourceCitation

    bad = dc_replace(
        good,
        chunk_id="bad",
        citation=SourceCitation(
            source_id="wrong-source-id",
            title=good.citation.title,
            publisher=good.citation.publisher,
            url=good.citation.url,
            section=good.citation.section,
        ),
    )

    class CorruptedRetriever:
        async def retrieve(
            self, _question: str, *, limit: int = 3
        ) -> list[RetrievedPassage]:
            return [RetrievedPassage(bad, 1.0)]

    response = await HealthAssistant(CorruptedRetriever()).answer(
        "What causes malaria?",
        request_id="test-request",
    )

    assert response.citations == []
    assert "couldn't find" in response.answer or "consistent information" in response.answer


@pytest.mark.anyio
async def test_assistant_abstains_on_matching_claims_with_opposite_polarity() -> None:
    passages = [
        chunk("positive", "Malaria is caused by parasites."),
        chunk("negative", "Malaria is not caused by parasites."),
    ]

    class ConflictingRetriever:
        async def retrieve(
            self, _question: str, *, limit: int = 3
        ) -> list[RetrievedPassage]:
            return [RetrievedPassage(chunk, 1.0) for chunk in passages[:limit]]

    response = await HealthAssistant(ConflictingRetriever()).answer(
        "What causes malaria?",
        request_id="test-request",
    )

    assert response.citations == []
    assert "consistent information" in response.answer


@pytest.mark.anyio
async def test_assistant_detects_conflicting_statements_in_same_section() -> None:
    positive = chunk("same-source-positive", "Malaria is caused by parasites.")
    negative = chunk("same-source-negative", "Malaria is not caused by parasites.")
    negative = replace(
        negative,
        citation=positive.citation,
        source_metadata=positive.source_metadata,
        approval_event=positive.approval_event,
    )
    passages = [positive, negative]

    class ConflictingRetriever:
        async def retrieve(
            self, _question: str, *, limit: int = 3
        ) -> list[RetrievedPassage]:
            return [RetrievedPassage(chunk, 1.0) for chunk in passages[:limit]]

    response = await HealthAssistant(ConflictingRetriever()).answer(
        "What causes malaria?",
        request_id="test-request",
    )

    assert response.citations == []
    assert "consistent information" in response.answer


@pytest.mark.anyio
async def test_assistant_excludes_sources_explicitly_marked_outdated() -> None:
    old = chunk("old", "Malaria is caused by parasites.")
    outdated = replace(
        old,
        source_metadata=old.source_metadata.model_copy(
            update={"limitations": ["This source is outdated and superseded."]}
        ),
    )

    class OutdatedRetriever:
        async def retrieve(
            self, _question: str, *, limit: int = 3
        ) -> list[RetrievedPassage]:
            return [RetrievedPassage(outdated, 1.0)][:limit]

    response = await HealthAssistant(OutdatedRetriever()).answer(
        "What causes malaria?",
        request_id="test-request",
    )

    assert response.citations == []
    assert "consistent information" in response.answer
