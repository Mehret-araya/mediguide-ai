import math
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from app.rag.chunking import DocumentChunk, validate_approved_chunk

_TOKEN = re.compile(r"[a-z0-9]{2,}")
_STOP_WORDS = {
    "a",
    "about",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "did",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "how",
    "i",
    "if",
    "in",
    "is",
    "it",
    "into",
    "me",
    "my",
    "of",
    "on",
    "or",
    "should",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
    "your",
}


def terms(text: str) -> list[str]:
    return [
        token
        for token in _TOKEN.findall(text.lower())
        if token not in _STOP_WORDS
    ]


class Retriever(Protocol):
    async def retrieve(
        self,
        question: str,
        *,
        limit: int = 3,
    ) -> list["RetrievedPassage"]: ...


class EmbeddingProvider(Protocol):
    async def embed_texts(
        self,
        texts: Sequence[str],
    ) -> Sequence[Sequence[float]]: ...


class VectorStore(Protocol):
    async def upsert(
        self,
        chunks: Sequence[DocumentChunk],
        embeddings: Sequence[Sequence[float]],
    ) -> None: ...

    async def search(
        self,
        embedding: Sequence[float],
        *,
        limit: int,
    ) -> list["RetrievedPassage"]: ...


def normalize_embedding(
    embedding: Sequence[float],
    *,
    expected_dimensions: int | None = None,
) -> tuple[float, ...]:
    if not embedding or (
        expected_dimensions is not None
        and len(embedding) != expected_dimensions
    ):
        raise ValueError("Embedding dimensions are invalid.")
    if any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        for value in embedding
    ):
        raise ValueError("Embeddings must contain only finite numbers.")
    normalized = tuple(float(value) for value in embedding)
    if not any(normalized):
        raise ValueError("Embeddings cannot be zero vectors.")
    return normalized


@dataclass(frozen=True)
class RetrievedPassage:
    chunk: DocumentChunk
    score: float


class LexicalRetriever:
    """Local BM25-style retrieval for operation without a vector service."""

    def __init__(self, chunks: Sequence[DocumentChunk] = ()) -> None:
        for chunk in chunks:
            validate_approved_chunk(chunk)
        self._chunks = tuple(chunks)
        self._tokenized = tuple(terms(chunk.text) for chunk in self._chunks)
        self._document_frequency: Counter[str] = Counter()
        for document_terms in self._tokenized:
            self._document_frequency.update(set(document_terms))
        self._average_length = (
            sum(map(len, self._tokenized)) / len(self._tokenized)
            if self._tokenized
            else 0.0
        )

    async def retrieve(
        self,
        question: str,
        *,
        limit: int = 3,
    ) -> list[RetrievedPassage]:
        query_terms = terms(question)
        if not query_terms or limit <= 0 or not self._chunks:
            return []

        document_count = len(self._chunks)
        scores: list[RetrievedPassage] = []
        for chunk, chunk_terms in zip(
            self._chunks,
            self._tokenized,
            strict=True,
        ):
            term_counts = Counter(chunk_terms)
            document_length = len(chunk_terms)
            score = 0.0
            for term in set(query_terms):
                frequency = term_counts[term]
                if not frequency:
                    continue
                frequency_in_documents = self._document_frequency[term]
                inverse_frequency = math.log(
                    1
                    + (
                        document_count
                        - frequency_in_documents
                        + 0.5
                    )
                    / (frequency_in_documents + 0.5)
                )
                length_normalization = (
                    frequency
                    * 2.2
                    / (
                        frequency
                        + 1.2
                        * (
                            0.25
                            + 0.75
                            * document_length
                            / max(self._average_length, 1.0)
                        )
                    )
                )
                score += inverse_frequency * length_normalization
            if score > 0:
                scores.append(RetrievedPassage(chunk, score))

        scores.sort(key=lambda result: result.score, reverse=True)
        return scores[:limit]


class InMemoryVectorStore:
    """Test/local vector-store implementation behind the pgvector-ready port."""

    def __init__(self) -> None:
        self._vectors: dict[str, tuple[DocumentChunk, tuple[float, ...]]] = {}
        self._dimensions: int | None = None

    async def upsert(
        self,
        chunks: Sequence[DocumentChunk],
        embeddings: Sequence[Sequence[float]],
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("Every chunk must have exactly one embedding.")

        normalized_vectors = [
            normalize_embedding(vector) for vector in embeddings
        ]
        dimensions = len(normalized_vectors[0]) if normalized_vectors else None
        if self._dimensions is not None and dimensions is not None:
            normalize_embedding(
                normalized_vectors[0],
                expected_dimensions=self._dimensions,
            )
        if dimensions is not None and any(
            len(vector) != dimensions for vector in normalized_vectors
        ):
            raise ValueError("Embedding dimensions do not match.")

        for chunk in chunks:
            validate_approved_chunk(chunk)
        if dimensions is not None:
            self._dimensions = dimensions
        for chunk, values in zip(chunks, normalized_vectors, strict=True):
            self._vectors[chunk.chunk_id] = (chunk, values)

    async def search(
        self,
        embedding: Sequence[float],
        *,
        limit: int,
    ) -> list[RetrievedPassage]:
        query = normalize_embedding(
            embedding,
            expected_dimensions=self._dimensions,
        )
        if limit <= 0:
            return []

        query_norm = math.sqrt(sum(value * value for value in query))
        if query_norm == 0:
            return []

        results: list[RetrievedPassage] = []
        for chunk, vector in self._vectors.values():
            vector_norm = math.sqrt(sum(value * value for value in vector))
            if vector_norm == 0:
                continue
            similarity = sum(
                left * right for left, right in zip(query, vector, strict=True)
            ) / (query_norm * vector_norm)
            results.append(RetrievedPassage(chunk, similarity))
        results.sort(key=lambda result: result.score, reverse=True)
        return results[:limit]


class VectorRetriever:
    """Vector retrieval independent of the chosen embedding and storage vendors."""

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore,
    ) -> None:
        self._embedding_provider = embedding_provider
        self._vector_store = vector_store

    async def index(self, chunks: Sequence[DocumentChunk]) -> None:
        if not chunks:
            return
        for chunk in chunks:
            validate_approved_chunk(chunk)
        embeddings = await self._embedding_provider.embed_texts(
            [chunk.text for chunk in chunks]
        )
        if len(embeddings) != len(chunks):
            raise ValueError("Embedding provider returned an invalid result count.")
        if not embeddings:
            return
        dimensions = len(embeddings[0])
        for embedding in embeddings:
            normalize_embedding(embedding, expected_dimensions=dimensions)
        await self._vector_store.upsert(chunks, embeddings)

    async def retrieve(
        self,
        question: str,
        *,
        limit: int = 3,
    ) -> list[RetrievedPassage]:
        if limit <= 0:
            return []
        embeddings = await self._embedding_provider.embed_texts([question])
        if len(embeddings) != 1:
            raise ValueError("Embedding provider returned an invalid query result.")
        normalize_embedding(embeddings[0])
        return await self._vector_store.search(embeddings[0], limit=limit)
