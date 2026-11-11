import hashlib
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any, Protocol

from app.rag.chunking import (
    DocumentChunk,
    SourceCitation,
    validate_approved_chunk,
)
from app.rag.registry import HealthSourceRecord, ReviewAuditEvent
from app.rag.retrieval import (
    RetrievedPassage,
    VectorStore,
    normalize_embedding,
)

_MODEL_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]{1,160}$")
_MAX_VECTOR_DIMENSIONS = 16_000


class Connection(Protocol):
    def transaction(self) -> Any: ...

    async def fetchrow(self, query: str, *args: Any) -> Mapping[str, Any] | None: ...

    async def fetch(
        self, query: str, *args: Any
    ) -> Sequence[Mapping[str, Any]]: ...

    async def execute(self, query: str, *args: Any) -> str: ...


class Pool(Protocol):
    def acquire(self) -> Any: ...


def _vector_literal(values: Sequence[float]) -> str:
    if not values or len(values) > _MAX_VECTOR_DIMENSIONS:
        raise ValueError("Embedding dimensions are invalid.")
    normalized = normalize_embedding(values)
    return "[" + ",".join(format(value, ".9g") for value in normalized) + "]"


def _date(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _record_from_row(row: Mapping[str, Any]) -> DocumentChunk:
    content = row["content"]
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    if content_hash != row["content_sha256"]:
        raise ValueError("Stored source chunk failed its content checksum.")
    chunk_index = row["chunk_index"]
    expected_chunk_id = hashlib.sha256(
        f"{row['source_key']}\0{chunk_index}\0{content}".encode("utf-8")
    ).hexdigest()
    if expected_chunk_id != row["chunk_id"]:
        raise ValueError("Stored source chunk failed its identity check.")

    source = HealthSourceRecord.model_validate(
        {
            "id": row["source_key"],
            "title": row["title"],
            "publisher": row["publisher"],
            "license": row["license"],
            "licenseUrl": (
                str(row.get("license_url"))
                if row.get("license_url") is not None
                else None
            ),
            "modificationNotice": row.get("modification_notice"),
            "url": row["source_url"],
            "publicationDate": _date(row["publication_date"]),
            "updatedDate": _date(row["updated_date"]),
            "accessedDate": _date(row["accessed_date"]),
            "language": row["language"],
            "topics": row["topics"],
            "reviewStatus": row["review_status"],
            "reviewer": row["reviewer"],
            "reviewedAt": _date(row["reviewed_at"]),
            "limitations": row["limitations"],
            "version": row["version"],
            "checksum": row["checksum"],
        }
    )
    approval = ReviewAuditEvent.model_validate(
        {
            "sourceId": row["source_key"],
            "fromStatus": row["from_status"],
            "toStatus": row["to_status"],
            "reviewer": row["reviewer"],
            "reviewedAt": _date(row["reviewed_at"]),
            "reason": row["reason"],
        }
    )
    citation = SourceCitation(
        source_id=source.id,
        title=source.title,
        publisher=source.publisher,
        url=str(source.url),
        section=row["section"],
    )
    chunk = DocumentChunk(
        chunk_id=row["chunk_id"],
        text=content,
        citation=citation,
        source_metadata=source,
        approval_event=approval,
        chunk_index=chunk_index,
        document_checksum=source.checksum,
    )
    validate_approved_chunk(chunk)
    return chunk


class PostgresVectorStore(VectorStore):
    """Persistent pgvector store using the existing approved-source schema."""

    def __init__(self, pool: Pool, embedding_model: str) -> None:
        if not _MODEL_PATTERN.fullmatch(embedding_model):
            raise ValueError("Embedding model identifier is invalid.")
        self._pool = pool
        self._embedding_model = embedding_model

    async def upsert(
        self,
        chunks: Sequence[DocumentChunk],
        embeddings: Sequence[Sequence[float]],
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("Every chunk must have exactly one embedding.")
        if not chunks:
            return
        dimensions = len(embeddings[0])
        if not dimensions or dimensions > _MAX_VECTOR_DIMENSIONS:
            raise ValueError("Embedding dimensions are invalid.")

        prepared: list[tuple[DocumentChunk, str, str]] = []
        seen_chunks: set[str] = set()
        seen_positions: set[tuple[str, int]] = set()
        approved_sources: dict[str, HealthSourceRecord] = {}
        approved_events: dict[str, ReviewAuditEvent] = {}
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            validate_approved_chunk(chunk)
            source = chunk.source_metadata
            checksum = (source.checksum or "").removeprefix("sha256:")
            if (
                not checksum
                or chunk.document_checksum != source.checksum
                or not re.fullmatch(r"[0-9a-fA-F]{64}", checksum)
            ):
                raise ValueError(
                    "Persistent ingestion requires a matching approved document checksum."
                )
            if (
                chunk.chunk_id in seen_chunks
                or (source.id, chunk.chunk_index) in seen_positions
            ):
                raise ValueError("Source chunks must have unique IDs and positions.")
            seen_chunks.add(chunk.chunk_id)
            seen_positions.add((source.id, chunk.chunk_index))
            normalized_embedding = normalize_embedding(
                embedding,
                expected_dimensions=dimensions,
            )
            vector = _vector_literal(normalized_embedding)
            expected_id = hashlib.sha256(
                f"{source.id}\0{chunk.chunk_index}\0{chunk.text}".encode("utf-8")
            ).hexdigest()
            if chunk.chunk_id != expected_id:
                raise ValueError("Chunk ID does not match its content.")
            existing_source = approved_sources.get(source.id)
            if existing_source is not None and existing_source != source:
                raise ValueError("Chunks for one source must share source metadata.")
            existing_event = approved_events.get(source.id)
            if existing_event is not None and existing_event != chunk.approval_event:
                raise ValueError("Chunks for one source must share approval evidence.")
            approved_sources[source.id] = source
            approved_events[source.id] = chunk.approval_event
            prepared.append(
                (
                    chunk,
                    vector,
                    hashlib.sha256(chunk.text.encode("utf-8")).hexdigest(),
                )
            )

        async with self._pool.acquire() as connection:
            async with connection.transaction():
                for source_id, source in approved_sources.items():
                    row = await connection.fetchrow(
                        """
                        SELECT
                            approved.source_key,
                            approved.title,
                            approved.publisher,
                            approved.source_url,
                            approved.license,
                            approved.license_url,
                            approved.modification_notice,
                            approved.publication_date,
                            approved.updated_date,
                            approved.accessed_date,
                            approved.language,
                            approved.topics,
                            approved.review_status,
                            approved.reviewer,
                            approved.reviewed_at,
                            approved.limitations,
                            approved.version,
                            approved.checksum,
                            review.from_status,
                            review.to_status,
                            review.reviewer AS review_reviewer,
                            review.reviewed_at AS review_reviewed_at,
                            review.reason
                        FROM public.approved_health_sources AS approved
                        JOIN LATERAL (
                            SELECT
                                source_review.from_status,
                                source_review.to_status,
                                source_review.reviewer,
                                source_review.reviewed_at,
                                source_review.reason
                            FROM public.health_source_reviews AS source_review
                            WHERE source_review.source_key = approved.source_key
                            ORDER BY source_review.review_id DESC
                            LIMIT 1
                        ) AS review ON TRUE
                        WHERE approved.source_key = $1
                        """,
                        source_id,
                    )
                    if row is None:
                        raise ValueError(
                            "Source is not approved in the persistent registry."
                        )
                    registered_source = HealthSourceRecord.model_validate(
                        {
                            "id": row["source_key"],
                            "title": row["title"],
                            "publisher": row["publisher"],
                            "url": row["source_url"],
                            "license": row["license"],
                            "licenseUrl": (
                                str(row.get("license_url"))
                                if row.get("license_url") is not None
                                else None
                            ),
                            "modificationNotice": row.get("modification_notice"),
                            "publicationDate": _date(row["publication_date"]),
                            "updatedDate": _date(row["updated_date"]),
                            "accessedDate": _date(row["accessed_date"]),
                            "language": row["language"],
                            "topics": row["topics"],
                            "reviewStatus": row["review_status"],
                            "reviewer": row["reviewer"],
                            "reviewedAt": _date(row["reviewed_at"]),
                            "limitations": row["limitations"],
                            "version": row["version"],
                            "checksum": row["checksum"],
                        }
                    )
                    registered_approval = ReviewAuditEvent.model_validate(
                        {
                            "sourceId": source_id,
                            "fromStatus": row["from_status"],
                            "toStatus": row["to_status"],
                            "reviewer": row["review_reviewer"],
                            "reviewedAt": _date(row["review_reviewed_at"]),
                            "reason": row["reason"],
                        }
                    )
                    if (
                        registered_source != source
                        or registered_approval != approved_events[source_id]
                    ):
                        raise ValueError(
                            "Manifest source metadata or approval does not match the persistent registry."
                        )

                for chunk, vector, content_hash in prepared:
                    await connection.execute(
                        """
                        INSERT INTO public.health_source_chunks (
                            chunk_id, source_key, chunk_index, section, content,
                            content_sha256, embedding, embedding_model,
                            embedding_dimensions
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6,
                            $7::extensions.vector, $8, $9
                        )
                        ON CONFLICT (chunk_id) DO UPDATE SET
                            source_key = EXCLUDED.source_key,
                            chunk_index = EXCLUDED.chunk_index,
                            section = EXCLUDED.section,
                            content = EXCLUDED.content,
                            content_sha256 = EXCLUDED.content_sha256,
                            embedding = EXCLUDED.embedding,
                            embedding_model = EXCLUDED.embedding_model,
                            embedding_dimensions = EXCLUDED.embedding_dimensions
                        """,
                        chunk.chunk_id,
                        chunk.source_metadata.id,
                        chunk.chunk_index,
                        chunk.citation.section or "Document",
                        chunk.text,
                        content_hash,
                        vector,
                        self._embedding_model,
                        dimensions,
                    )

    async def search(
        self,
        embedding: Sequence[float],
        *,
        limit: int,
    ) -> list[RetrievedPassage]:
        if limit <= 0:
            return []
        vector = _vector_literal(embedding)
        async with self._pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT
                    chunk.chunk_id,
                    chunk.chunk_index,
                    chunk.section,
                    chunk.content,
                    chunk.content_sha256,
                    source.source_key,
                    source.title,
                    source.publisher,
                    source.source_url,
                    source.license,
                    source.license_url,
                    source.modification_notice,
                    source.publication_date,
                    source.updated_date,
                    source.accessed_date,
                    source.language,
                    source.topics,
                    source.review_status,
                    source.reviewer,
                    source.reviewed_at,
                    source.limitations,
                    source.version,
                    source.checksum,
                    approval.from_status,
                    approval.to_status,
                    approval.reason,
                    1 - (chunk.embedding OPERATOR(extensions.<=>) $1::extensions.vector)
                        AS similarity
                FROM public.health_source_chunks AS chunk
                JOIN public.approved_health_sources AS approved
                    ON approved.source_key = chunk.source_key
                JOIN public.health_sources AS source
                    ON source.source_key = chunk.source_key
                JOIN LATERAL (
                    SELECT review.from_status, review.to_status,
                           review.reviewer, review.reviewed_at, review.reason
                    FROM public.health_source_reviews AS review
                    WHERE review.source_key = source.source_key
                    ORDER BY review.review_id DESC
                    LIMIT 1
                ) AS approval ON TRUE
                WHERE chunk.embedding IS NOT NULL
                  AND chunk.embedding_model = $2
                  AND chunk.embedding_dimensions = $3
                ORDER BY similarity DESC, chunk.chunk_id
                LIMIT $4
                """,
                vector,
                self._embedding_model,
                len(embedding),
                limit,
            )

        results: list[RetrievedPassage] = []
        for row in rows:
            chunk = _record_from_row(row)
            score = float(row["similarity"])
            if not math.isfinite(score):
                raise ValueError("Stored vector search returned an invalid score.")
            results.append(RetrievedPassage(chunk=chunk, score=score))
        return results
