import hashlib
import os
import uuid
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import date
from typing import Any
from urllib.parse import unquote, urlparse

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


@pytest.mark.anyio
async def test_local_knowledge_login_is_restricted_and_rls_scoped() -> None:
    if os.getenv("RUN_LOCAL_RAG_SECURITY_INTEGRATION") != "true":
        pytest.skip(
            "Set RUN_LOCAL_RAG_SECURITY_INTEGRATION=true for the local-only test."
        )
    database_url = os.getenv("RAG_TEST_DATABASE_URL", "")
    parsed_url = urlparse(database_url)
    if parsed_url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("The RAG security integration test only permits loopback DBs.")
    if parsed_url.scheme not in {"postgres", "postgresql"}:
        raise ValueError("The RAG security integration test requires PostgreSQL.")

    login_role = f"mg_knowledge_it_{os.urandom(8).hex()}"
    login_password = os.urandom(24).hex()
    approved_id = f"rag-security-approved-{uuid.uuid4()}"
    pending_id = f"rag-security-pending-{uuid.uuid4()}"
    approved_text = "Least-privilege fixture content."
    approved_hash = hashlib.sha256(approved_text.encode("utf-8")).hexdigest()
    chunk_id = hashlib.sha256(
        f"{approved_id}\0{0}\0{approved_text}".encode("utf-8")
    ).hexdigest()
    admin = await asyncpg.connect(database_url)
    reader = None

    try:
        role = await admin.fetchrow(
            """
            SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
                   rolreplication, rolbypassrls
            FROM pg_roles
            WHERE rolname = 'mediaguide_knowledge_reader'
            """
        )
        if role is None:
            raise AssertionError("The restricted knowledge role was not provisioned.")
        assert role["rolcanlogin"] is False
        assert role["rolsuper"] is False
        assert role["rolcreatedb"] is False
        assert role["rolcreaterole"] is False
        assert role["rolreplication"] is False
        assert role["rolbypassrls"] is False

        await admin.execute(
            f"""
            CREATE ROLE {login_role}
                LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
                NOREPLICATION NOBYPASSRLS PASSWORD '{login_password}'
            """
        )
        await admin.execute(
            f"GRANT mediaguide_knowledge_reader TO {login_role}"
        )

        reviewed_on = date(2026, 1, 1)
        async with admin.transaction():
            for source_id, status, license_name in (
                (approved_id, "approved", "Synthetic test license"),
                (pending_id, "pending_review", None),
            ):
                await admin.execute(
                    """
                    INSERT INTO public.health_sources (
                        source_key, title, publisher, source_url, license,
                        accessed_date, language, topics, review_status,
                        reviewer, reviewed_at, limitations, checksum
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8,
                        $9::public.source_review_status,
                        $10, $11, $12, $13
                    )
                    """,
                    source_id,
                    "Synthetic permission fixture (not medical guidance)",
                    "Automated security test",
                    "https://example.org/security-fixture",
                    license_name,
                    reviewed_on,
                    "en",
                    ["test"],
                    status,
                    "Automated test",
                    reviewed_on if status == "approved" else None,
                    ["Synthetic test data only."],
                    f"sha256:{approved_hash}" if status == "approved" else None,
                )
            await admin.execute(
                """
                INSERT INTO public.health_source_reviews (
                    source_key, from_status, to_status, reviewer, reviewed_at, reason
                ) VALUES
                    ($1, 'pending_review', 'approved', 'Automated test', $3,
                     'Synthetic test approval.'),
                    ($2, 'pending_review', 'pending_review', 'Automated test', $3,
                     'Synthetic pending fixture.')
                """,
                approved_id,
                pending_id,
                reviewed_on,
            )

        reader = await asyncpg.connect(
            host=parsed_url.hostname,
            port=parsed_url.port or 5432,
            user=login_role,
            password=login_password,
            database=unquote(parsed_url.path.lstrip("/")),
            ssl=False,
        )

        assert await reader.fetchval(
            "SELECT count(*) FROM public.approved_health_sources WHERE source_key = $1",
            approved_id,
        ) == 1
        assert await reader.fetchval(
            "SELECT count(*) FROM public.approved_source_chunks WHERE source_key = $1",
            approved_id,
        ) == 0
        assert await reader.fetchval(
            "SELECT count(*) FROM public.health_sources WHERE source_key = $1",
            pending_id,
        ) == 0
        assert await reader.fetchval(
            "SELECT count(*) FROM public.health_source_reviews WHERE source_key = $1",
            approved_id,
        ) == 1

        await reader.execute(
            """
            INSERT INTO public.health_source_chunks (
                chunk_id, source_key, chunk_index, section, content,
                content_sha256, embedding, embedding_model, embedding_dimensions
            ) VALUES (
                $1, $2, 0, 'Security test', $3, $4,
                '[1,0]'::extensions.vector, 'security-test-model', 2
            )
            """,
            chunk_id,
            approved_id,
            approved_text,
            approved_hash,
        )
        assert await reader.fetchval(
            "SELECT count(*) FROM public.approved_source_chunks WHERE source_key = $1",
            approved_id,
        ) == 1
        pending_chunk_id = hashlib.sha256(
            f"{pending_id}\0{0}\0{approved_text}".encode("utf-8")
        ).hexdigest()
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with reader.transaction():
                await reader.execute(
                    """
                    INSERT INTO public.health_source_chunks (
                        chunk_id, source_key, chunk_index, section, content,
                        content_sha256, embedding, embedding_model,
                        embedding_dimensions
                    ) VALUES (
                        $1, $2, 0, 'Security test', $3, $4,
                        '[1,0]'::extensions.vector, 'security-test-model', 2
                    )
                    """,
                    pending_chunk_id,
                    pending_id,
                    approved_text,
                    approved_hash,
                )

        privilege_checks = await admin.fetchrow(
            """
            SELECT
                pg_has_role($1, 'mediaguide_knowledge_reader', 'member')
                    AS has_reader_role,
                has_table_privilege($1, 'public.health_source_chunks', 'SELECT')
                    AS can_read_chunks,
                has_table_privilege($1, 'public.health_source_chunks', 'INSERT')
                    AS can_insert_chunks,
                has_table_privilege($1, 'public.health_source_chunks', 'UPDATE')
                    AS can_update_chunks,
                has_table_privilege($1, 'public.health_source_chunks', 'DELETE')
                    AS can_delete_chunks,
                has_table_privilege($1, 'public.health_sources', 'UPDATE')
                    AS can_update_sources,
                has_table_privilege($1, 'public.health_source_reviews', 'INSERT')
                    AS can_insert_reviews,
                has_table_privilege($1, 'public.user_profiles', 'SELECT')
                    AS can_read_profiles,
                has_table_privilege($1, 'public.conversations', 'SELECT')
                    AS can_read_conversations,
                has_table_privilege($1, 'public.messages', 'SELECT')
                    AS can_read_messages,
                has_table_privilege('service_role', 'public.health_sources', 'SELECT')
                    AS service_role_can_read_sources,
                has_table_privilege('service_role', 'public.health_source_reviews', 'INSERT')
                    AS service_role_can_insert_reviews,
                has_table_privilege('service_role', 'public.health_source_chunks', 'DELETE')
                    AS service_role_can_delete_chunks
            """,
            login_role,
        )
        assert privilege_checks["has_reader_role"] is True
        assert privilege_checks["can_read_chunks"] is True
        assert privilege_checks["can_insert_chunks"] is True
        assert privilege_checks["can_update_chunks"] is True
        assert privilege_checks["can_delete_chunks"] is False
        assert privilege_checks["can_update_sources"] is False
        assert privilege_checks["can_insert_reviews"] is False
        assert privilege_checks["can_read_profiles"] is False
        assert privilege_checks["can_read_conversations"] is False
        assert privilege_checks["can_read_messages"] is False
        assert privilege_checks["service_role_can_read_sources"] is False
        assert privilege_checks["service_role_can_insert_reviews"] is False
        assert privilege_checks["service_role_can_delete_chunks"] is False

        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with reader.transaction():
                await reader.fetch("SELECT * FROM public.user_profiles LIMIT 1")
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with reader.transaction():
                await reader.execute(
                    "DELETE FROM public.health_source_chunks WHERE chunk_id = $1",
                    chunk_id,
                )
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with reader.transaction():
                await reader.execute(
                    """
                    INSERT INTO public.health_source_reviews (
                        source_key, from_status, to_status, reviewer,
                        reviewed_at, reason
                    ) VALUES ($1, 'pending_review', 'approved',
                              'unauthorized test', $2, 'must be denied')
                    """,
                    approved_id,
                    reviewed_on,
                )
    finally:
        if reader is not None:
            await reader.close()
        await admin.execute(
            "DELETE FROM public.health_sources WHERE source_key = ANY($1::text[])",
            [approved_id, pending_id],
        )
        await admin.execute(f"DROP ROLE IF EXISTS {login_role}")
        await admin.close()
