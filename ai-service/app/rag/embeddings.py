import math
from collections.abc import Sequence
from urllib.parse import urlparse

import httpx

from app.rag.retrieval import EmbeddingProvider


class EmbeddingServiceError(RuntimeError):
    """Raised when an embedding provider fails or returns invalid data."""


class OpenAICompatibleEmbeddingProvider:
    """Client for an operator-configured OpenAI-compatible embeddings API."""

    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        parsed = urlparse(api_url)
        if (
            parsed.scheme != "https"
            and not (
                parsed.scheme == "http"
                and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            )
        ):
            raise ValueError("Embedding API must use HTTPS except on loopback.")
        if (
            not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or not api_key.strip()
            or not model.strip()
        ):
            raise ValueError("Embedding API URL, key, and model are required.")
        self._api_url = api_url
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds

    async def embed_texts(
        self,
        texts: Sequence[str],
    ) -> Sequence[Sequence[float]]:
        if not texts:
            return []

        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    self._api_url,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={"model": self._model, "input": list(texts)},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise EmbeddingServiceError(
                "The configured embedding service is unavailable."
            ) from error

        if not isinstance(payload, dict) or not isinstance(
            payload.get("data"), list
        ):
            raise EmbeddingServiceError(
                "The embedding service returned an invalid response."
            )

        indexed: list[tuple[int, list[float]]] = []
        for item in payload["data"]:
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("index"), int)
                or isinstance(item.get("index"), bool)
                or not isinstance(item.get("embedding"), list)
            ):
                raise EmbeddingServiceError(
                    "The embedding service returned an invalid response."
                )
            vector = item["embedding"]
            if not vector or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                for value in vector
            ):
                raise EmbeddingServiceError(
                    "The embedding service returned invalid vector values."
                )
            indexed.append((item["index"], [float(value) for value in vector]))

        indexed.sort(key=lambda result: result[0])
        if (
            len(indexed) != len(texts)
            or [index for index, _ in indexed] != list(range(len(texts)))
            or len({len(vector) for _, vector in indexed}) != 1
        ):
            raise EmbeddingServiceError(
                "The embedding service returned invalid vector dimensions."
            )
        return [vector for _, vector in indexed]
