import hashlib
import os
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import date
from typing import Any
from urllib.parse import urlparse

import asyncpg
import pytest

from app.rag.ingestion import ingest_document
from app.rag.postgres_store import PostgresVectorStore
from app.rag.registry import HealthSourceRecord, ReviewAuditEvent


def approved_chunk():
    text = "## Overview\nSynthetic passage content."
    source_checksum = f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"
    source = HealthSourceRecord(
        id="fixture-source",
        title="Synthetic source",
        publisher="Fixture publisher",
        license="Synthetic test fixture license",
        url="https://example.org/fixture",
        publicationDate="2025-01-01",
        updatedDate="2025-06-01",
        accessedDate="2026-10-17",
        language="en",
        topics=["fixture"],
        reviewStatus="approved",
        reviewer="Fixture reviewer",
        reviewedAt="2026-01-01",
        limitations=["Synthetic fixture only."],
        version="fixture-v1",
        checksum=source_checksum,
    )
    approval = ReviewAuditEvent(
        sourceId=source.id,
        fromStatus="pending_review",
        toStatus="approved",
        reviewer="Fixture reviewer",
        reviewedAt="2026-01-01",
        reason="Test fixture approval.",
    )
    return ingest_document(text, source, [approval])[0]


def approved_source_row(chunk) -> dict[str, Any]:
    source = chunk.source_metadata
    approval = chunk.approval_event
    return {
        "source_key": source.id,
        "title": source.title,
        "publisher": source.publisher,
        "source_url": str(source.url),
        "license": source.license,
        "publication_date": source.publication_date,
        "updated_date": source.updated_date,
        "accessed_date": source.accessed_date,
        "language": source.language,
        "topics": source.topics,
        "review_status": source.review_status.value,
        "reviewer": source.reviewer,
        "reviewed_at": source.reviewed_at,
        "limitations": source.limitations,
        "version": source.version,
        "checksum": source.checksum,
        "from_status": approval.from_status.value,
        "to_status": approval.to_status.value,
        "review_reviewer": approval.reviewer,
        "review_reviewed_at": approval.reviewed_at,
        "reason": approval.reason,
    }


class FakeConnection:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or []
        self.executions: list[tuple[str, tuple[Any, ...]]] = []
        self.fetches: list[tuple[str, tuple[Any, ...]]] = []
        self.fetchrow_result: dict[str, Any] | None = None
        self.transaction_started = False

    @asynccontextmanager
    async def transaction(self):
        self.transaction_started = True
        yield

    async def execute(self, query: str, *args: Any) -> str:
        self.executions.append((query, args))
        return "INSERT 0 1"

    async def fetchrow(self, _query: str, *_args: Any):
        return self.fetchrow_result

    async def fetch(self, query: str, *args: Any):
        self.fetches.append((query, args))
        return self.rows


class FakePool:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection
        self.acquisitions = 0

    @asynccontextmanager
    async def acquire(self):
        self.acquisitions += 1
        yield self.connection


@pytest.mark.anyio
async def test_pgvector_upsert_persists_approval_provenance_and_chunk_index() -> None:
    connection = FakeConnection()
    chunk = approved_chunk()
    connection.fetchrow_result = approved_source_row(chunk)
    pool = FakePool(connection)

    await PostgresVectorStore(pool, "fixture-embedding-v1").upsert(
        [chunk],
        [[0.25, 0.75]],
    )

    assert connection.transaction_started
    assert len(connection.executions) == 1
    insert_chunk_query, insert_chunk_args = connection.executions[0]
    assert "health_sources" not in insert_chunk_query
    assert "health_source_reviews" not in insert_chunk_query
    assert "embedding_dimensions" in insert_chunk_query
    assert insert_chunk_args[2] == chunk.chunk_index
    assert insert_chunk_args[5] == hashlib.sha256(
        chunk.text.encode("utf-8")
    ).hexdigest()
    assert insert_chunk_args[-2:] == ("fixture-embedding-v1", 2)


@pytest.mark.anyio
async def test_pgvector_search_uses_approved_view_and_restores_citation_metadata() -> None:
    chunk = approved_chunk()
    connection = FakeConnection(
        rows=[
            {
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "section": chunk.citation.section,
                "content": chunk.text,
                "content_sha256": hashlib.sha256(
                    chunk.text.encode("utf-8")
                ).hexdigest(),
                "source_key": chunk.source_metadata.id,
                "title": chunk.source_metadata.title,
                "publisher": chunk.source_metadata.publisher,
                "source_url": str(chunk.source_metadata.url),
                "license": chunk.source_metadata.license,
                "publication_date": date(2025, 1, 1),
                "updated_date": date(2025, 6, 1),
                "accessed_date": date(2026, 10, 17),
                "language": "en",
                "topics": ["fixture"],
                "review_status": "approved",
                "reviewer": "Fixture reviewer",
                "reviewed_at": date(2026, 1, 1),
                "limitations": ["Synthetic fixture only."],
                "version": "fixture-v1",
                "checksum": chunk.source_metadata.checksum,
                "from_status": "pending_review",
                "to_status": "approved",
                "reason": "Test fixture approval.",
                "similarity": 0.9,
            }
        ]
    )
    store = PostgresVectorStore(FakePool(connection), "fixture-embedding-v1")

    matches = await store.search([0.25, 0.75], limit=2)

    query, parameters = connection.fetches[0]
    assert "JOIN public.approved_health_sources" in query
    assert "embedding_model = $2" in query
    assert "embedding_dimensions = $3" in query
    assert parameters == ("[0.25,0.75]", "fixture-embedding-v1", 2, 2)
    assert len(matches) == 1
    assert matches[0].chunk.citation == chunk.citation
    assert matches[0].chunk.source_metadata.license == chunk.source_metadata.license
    assert matches[0].chunk.document_checksum == chunk.document_checksum
    assert matches[0].chunk.approval_event.reason == "Test fixture approval."
    assert matches[0].score == 0.9


@pytest.mark.anyio
async def test_pgvector_store_rejects_unapproved_chunks_before_database_access() -> None:
    original = approved_chunk()
    chunk = replace(
        original,
        source_metadata=original.source_metadata.model_copy(
            update={"review_status": "pending_review"}
        ),
    )
    pool = FakePool(FakeConnection())

    with pytest.raises(ValueError, match="not approved"):
        await PostgresVectorStore(pool, "fixture-embedding-v1").upsert(
            [chunk],
            [[0.25, 0.75]],
        )
    assert pool.acquisitions == 0


@pytest.mark.anyio
async def test_pgvector_upsert_requires_an_existing_matching_database_approval() -> None:
    chunk = approved_chunk()
    connection = FakeConnection()
    pool = FakePool(connection)

    with pytest.raises(ValueError, match="not approved in the persistent registry"):
        await PostgresVectorStore(pool, "fixture-embedding-v1").upsert(
            [chunk],
            [[0.25, 0.75]],
        )
    assert connection.executions == []


@pytest.mark.anyio
async def test_pgvector_search_rejects_corrupted_persisted_chunk_content() -> None:
    chunk = approved_chunk()
    connection = FakeConnection(
        rows=[
            {
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "section": chunk.citation.section,
                "content": "tampered passage",
                "content_sha256": "0" * 64,
                "source_key": chunk.source_metadata.id,
                "title": chunk.source_metadata.title,
                "publisher": chunk.source_metadata.publisher,
                "source_url": str(chunk.source_metadata.url),
                "license": chunk.source_metadata.license,
                "publication_date": date(2025, 1, 1),
                "updated_date": date(2025, 6, 1),
                "accessed_date": date(2026, 10, 17),
                "language": "en",
                "topics": ["fixture"],
                "review_status": "approved",
                "reviewer": "Fixture reviewer",
                "reviewed_at": date(2026, 1, 1),
                "limitations": ["Synthetic fixture only."],
                "version": "fixture-v1",
                "checksum": chunk.source_metadata.checksum,
                "from_status": "pending_review",
                "to_status": "approved",
                "reason": "Test fixture approval.",
                "similarity": 0.9,
            }
        ]
    )

    with pytest.raises(ValueError, match="content checksum"):
        await PostgresVectorStore(
            FakePool(connection),
            "fixture-embedding-v1",
        ).search([0.25, 0.75], limit=2)


@pytest.mark.anyio
async def test_local_pgvector_round_trip_when_explicitly_enabled() -> None:
    if os.getenv("RUN_LOCAL_PGVECTOR_INTEGRATION") != "true":
        pytest.skip("Set RUN_LOCAL_PGVECTOR_INTEGRATION=true for local-only test.")
    database_url = os.getenv("RAG_TEST_DATABASE_URL", "")
    parsed_url = urlparse(database_url)
    if parsed_url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("The pgvector integration test only permits loopback DBs.")
    if parsed_url.scheme not in {"postgres", "postgresql"}:
        raise ValueError("The pgvector integration test requires PostgreSQL.")

    text = "## Test section\nSynthetic integration-test passage."
    checksum = f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"
    source_id = f"rag-integration-{os.urandom(8).hex()}"
    reviewer = "Synthetic integration test only"
    reviewed_at = date(2026, 1, 1)
    source = HealthSourceRecord(
        id=source_id,
        title="Synthetic integration fixture (not medical guidance)",
        publisher="Automated test",
        license="Synthetic test fixture license",
        url="https://example.org/synthetic-integration-fixture",
        accessedDate="2026-10-17",
        language="en",
        topics=["test"],
        reviewStatus="approved",
        reviewer=reviewer,
        reviewedAt=reviewed_at,
        limitations=["Synthetic test data; not a medical source."],
        checksum=checksum,
    )
    approval = ReviewAuditEvent(
        sourceId=source_id,
        fromStatus="pending_review",
        toStatus="approved",
        reviewer=reviewer,
        reviewedAt=reviewed_at,
        reason="Synthetic test fixture approval only.",
    )
    chunks = ingest_document(text, source, [approval])
    connection = await asyncpg.connect(database_url)
    pool = None
    try:
        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO public.health_sources (
                    source_key, title, publisher, source_url, license,
                    accessed_date, language, topics, review_status,
                    reviewer, reviewed_at, limitations, checksum
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    'approved', $9, $10, $11, $12
                )
                """,
                source.id,
                source.title,
                source.publisher,
                str(source.url),
                source.license,
                source.accessed_date,
                source.language,
                source.topics,
                source.reviewer,
                source.reviewed_at,
                source.limitations,
                source.checksum,
            )
            await connection.execute(
                """
                INSERT INTO public.health_source_reviews (
                    source_key, from_status, to_status, reviewer,
                    reviewed_at, reason
                ) VALUES (
                    $1, 'pending_review', 'approved', $2, $3, $4
                )
                """,
                source.id,
                approval.reviewer,
                approval.reviewed_at,
                approval.reason,
            )

        pool = await asyncpg.create_pool(database_url, min_size=1, max_size=2)
        store = PostgresVectorStore(pool, "synthetic-test-embedding")
        await store.upsert(chunks, [[1.0, 0.0]])
        matches = await store.search([1.0, 0.0], limit=1)

        assert len(matches) == 1
        assert matches[0].chunk.chunk_id == chunks[0].chunk_id
        assert matches[0].chunk.citation.section == "Test section"
        assert matches[0].chunk.source_metadata.license == source.license
        assert matches[0].score == pytest.approx(1.0)
    finally:
        if pool is not None:
            await pool.close()
        await connection.execute(
            "DELETE FROM public.health_sources WHERE source_key = $1",
            source_id,
        )
        await connection.close()
