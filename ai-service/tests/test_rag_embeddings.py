import httpx
import pytest

from app.rag.embeddings import (
    EmbeddingServiceError,
    OpenAICompatibleEmbeddingProvider,
)


class MockResponse:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> object:
        return self.payload


@pytest.mark.anyio
async def test_embedding_provider_preserves_input_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[dict[str, object]] = []

    class MockClient:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "MockClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(
            self,
            _url: str,
            *,
            headers: dict[str, str],
            json: dict[str, object],
        ) -> MockResponse:
            requests.append({"headers": headers, "json": json})
            return MockResponse(
                {
                    "data": [
                        {"index": 1, "embedding": [0.0, 1.0]},
                        {"index": 0, "embedding": [1.0, 0.0]},
                    ]
                }
            )

    monkeypatch.setattr("app.rag.embeddings.httpx.AsyncClient", MockClient)
    provider = OpenAICompatibleEmbeddingProvider(
        api_url="https://embedding.example/v1/embeddings",
        api_key="fixture-key",
        model="fixture-model",
    )

    assert await provider.embed_texts(["first", "second"]) == [
        [1.0, 0.0],
        [0.0, 1.0],
    ]
    assert requests[0]["headers"] == {"Authorization": "Bearer fixture-key"}
    assert requests[0]["json"] == {
        "model": "fixture-model",
        "input": ["first", "second"],
    }


@pytest.mark.anyio
async def test_embedding_provider_rejects_malformed_or_non_finite_vectors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class MockClient:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "MockClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(self, *_args: object, **_kwargs: object) -> MockResponse:
            return MockResponse(
                {"data": [{"index": 0, "embedding": [float("inf")]}]}
            )

    monkeypatch.setattr("app.rag.embeddings.httpx.AsyncClient", MockClient)
    provider = OpenAICompatibleEmbeddingProvider(
        api_url="https://embedding.example/v1/embeddings",
        api_key="fixture-key",
        model="fixture-model",
    )

    with pytest.raises(EmbeddingServiceError, match="invalid vector values"):
        await provider.embed_texts(["question"])


@pytest.mark.anyio
async def test_embedding_provider_surfaces_network_errors_without_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class MockClient:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "MockClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(self, *_args: object, **_kwargs: object) -> MockResponse:
            raise httpx.ConnectError("fixture-only failure")

    monkeypatch.setattr("app.rag.embeddings.httpx.AsyncClient", MockClient)
    provider = OpenAICompatibleEmbeddingProvider(
        api_url="https://embedding.example/v1/embeddings",
        api_key="fixture-key",
        model="fixture-model",
    )

    with pytest.raises(EmbeddingServiceError, match="unavailable"):
        await provider.embed_texts(["question"])


def test_embedding_provider_requires_secure_non_loopback_url() -> None:
    with pytest.raises(ValueError, match="HTTPS"):
        OpenAICompatibleEmbeddingProvider(
            api_url="http://embedding.example/v1/embeddings",
            api_key="fixture-key",
            model="fixture-model",
        )
