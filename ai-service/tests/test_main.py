import asyncio
import json
import uuid
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.main import app, create_app


def test_app_metadata_uses_centralized_settings() -> None:
    configured_app = create_app(
        Settings(
            app_name="Configured MediGuide Service",
            app_version="2.3.4",
            app_env="testing",
            debug=True,
        )
    )

    assert configured_app.title == "Configured MediGuide Service"
    assert configured_app.version == "2.3.4"
    assert configured_app.debug is True


@pytest.mark.anyio
async def test_health_check_reports_service_status() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")
    assert response.json() == {
        "status": "ok",
        "service": "MediGuide AI service",
    }


@pytest.mark.anyio
async def test_unknown_route_returns_not_found() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/not-a-route")

    assert response.status_code == 404


@pytest.mark.anyio
async def test_empty_approved_corpus_returns_an_explicit_abstention() -> None:
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "What is malaria?"},
            headers={"X-Internal-Service-Token": "test-internal-token"},
        )

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")
    assert response.json()["citations"] == []
    assert response.json()["requestId"] == response.headers["X-Request-ID"]
    assert "couldn't find sufficiently reliable" in response.json()["answer"]
    assert (
        "No sufficiently relevant and consistent approved source passage was available."
        in response.json()["limitations"]
    )


@pytest.mark.anyio
async def test_uninitialized_persistent_retrieval_fails_closed() -> None:
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
            knowledge_database_url=SecretStr(
                "postgresql://test:test@localhost:5432/mediguide"
            ),
            embedding_api_url="http://localhost:9000/v1/embeddings",
            embedding_api_key=SecretStr("test-embedding-key"),
            embedding_model="fixture-model",
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "What is malaria?"},
            headers={"X-Internal-Service-Token": "test-internal-token"},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "Health education service is unavailable."


@pytest.mark.anyio
async def test_question_at_maximum_length_passes_validation() -> None:
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "q" * 2000},
            headers={"X-Internal-Service-Token": "test-internal-token"},
        )

    assert response.status_code == 200


def test_health_education_route_documents_request_and_error_schemas() -> None:
    openapi = app.openapi()
    operation = openapi["paths"]["/api/v1/health-education"]["post"]
    request_schema = operation["requestBody"]["content"]["application/json"][
        "schema"
    ]

    assert request_schema["$ref"].endswith("/HealthEducationRequest")
    assert operation["responses"]["422"]["content"]["application/json"][
        "schema"
    ]["$ref"].endswith("/APIError")
    assert operation["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["$ref"].endswith("/HealthEducationResponse")
    assert openapi["components"]["schemas"]["HealthEducationRequest"][
        "properties"
    ]["question"]["maxLength"] == 2000


@pytest.mark.anyio
async def test_answer_uses_a_retrieved_passage_and_its_verified_metadata(
    tmp_path: Path,
) -> None:
    source = {
        "id": "test-source",
        "title": "Synthetic test document",
        "publisher": "Test publisher",
        "license": "Synthetic test fixture license",
        "licenseUrl": "https://example.org/license",
        "modificationNotice": "Synthetic fixture; modified for this test.",
        "url": "https://example.org/test",
        "accessedDate": "2026-10-17",
        "language": "en",
        "topics": ["test"],
        "reviewStatus": "approved",
        "reviewer": "Test reviewer",
        "reviewedAt": "2026-10-17",
        "limitations": ["Synthetic fixture; not a medical source."],
    }
    audit = [
        {
            "sourceId": "test-source",
            "fromStatus": "pending_review",
            "toStatus": "approved",
            "reviewer": "Test reviewer",
            "reviewedAt": "2026-10-17",
            "reason": "Synthetic test approval only.",
        }
    ]
    content_path = tmp_path / "source.md"
    content_path.write_text(
        "# Overview\nMalaria is caused by parasites transmitted by mosquitoes. "
        "This unrelated sentence must not be used.",
        encoding="utf-8",
    )
    manifest_path = tmp_path / "approved-sources.json"
    manifest_path.write_text(
        json.dumps(
            [
                {
                    "source": source,
                    "auditHistory": audit,
                    "documentPath": "source.md",
                }
            ]
        ),
        encoding="utf-8",
    )
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
            knowledge_base_manifest=manifest_path,
        )
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "What causes malaria?"},
            headers={"X-Internal-Service-Token": "test-internal-token"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == (
        "Retrieved source passages:\n\n"
        "Malaria is caused by parasites transmitted by mosquitoes."
    )
    assert body["citations"] == [
        {
            "sourceId": "test-source",
            "title": "Synthetic test document",
            "publisher": "Test publisher",
            "url": "https://example.org/test",
            "licenseUrl": "https://example.org/license",
            "modificationNotice": "Synthetic fixture; modified for this test.",
            "section": "Overview",
        }
    ]
    assert "Synthetic fixture; not a medical source." in body["limitations"]
    assert body["requestId"] == response.headers["X-Request-ID"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "question",
    [
        "Do I have malaria?",
        "What dosage should I take?",
        "Which medicine should I take?",
        "Should I stop taking my medication?",
        "Can I change my insulin dose?",
    ],
)
async def test_personal_clinical_request_is_refused_without_citations(
    question: str,
) -> None:
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": question},
            headers={"X-Internal-Service-Token": "test-internal-token"},
        )

    assert response.status_code == 200
    assert (
        "can't diagnose" in response.json()["answer"]
        or "can't recommend" in response.json()["answer"]
    )
    assert response.json()["citations"] == []


@pytest.mark.anyio
async def test_health_education_route_rejects_missing_or_invalid_service_token() -> None:
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        missing = await client.post(
            "/api/v1/health-education",
            json={"question": "What is malaria?"},
        )
        invalid = await client.post(
            "/api/v1/health-education",
            json={"question": "What is malaria?"},
            headers={"X-Internal-Service-Token": "wrong-token"},
        )

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert "test-internal-token" not in missing.text + invalid.text


@pytest.mark.anyio
async def test_health_education_route_fails_closed_without_configured_token() -> None:
    for token in (None, SecretStr("")):
        service = create_app(
            Settings(
                app_env="testing",
                ai_service_token=token,
            )
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=service),
            base_url="http://testserver",
        ) as client:
            response = await client.post(
                "/api/v1/health-education",
                json={"question": "What is malaria?"},
                headers={"X-Internal-Service-Token": "unconfigured"},
            )

        assert response.status_code == 503
        assert "service credential" not in response.text


@pytest.mark.anyio
async def test_health_education_route_propagates_valid_request_id() -> None:
    request_id = "a" * 32
    service = create_app(
        Settings(
            app_env="testing",
            ai_service_token=SecretStr("test-internal-token"),
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "What is malaria?"},
            headers={
                "X-Internal-Service-Token": "test-internal-token",
                "X-Request-ID": request_id,
            },
        )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id
    assert response.json()["requestId"] == request_id


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"question": ""},
        {"question": "   "},
        {"question": "q" * 2001},
        {"question": "private health details", "language": "am"},
    ],
)
async def test_invalid_health_education_request_returns_safe_error(
    payload: dict[str, object],
) -> None:
    service = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json=payload,
        )

    assert response.status_code == 422
    assert response.headers.get("X-Request-ID")
    assert response.json() == {
        "code": "VALIDATION_ERROR",
        "message": "The request could not be accepted.",
        "requestId": response.headers["X-Request-ID"],
    }
    assert "question" not in response.text
    assert "private health details" not in response.text


@pytest.mark.anyio
async def test_request_id_is_returned_and_safe_request_metadata_is_logged(
    capfd: pytest.CaptureFixture[str],
) -> None:
    service = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.get(
            "/health",
            params={"question": "private medical information"},
        )
        second_response = await client.get("/health")

    request_id = response.headers["X-Request-ID"]
    uuid.UUID(request_id)
    log_output = capfd.readouterr().err
    entries = [json.loads(line) for line in log_output.strip().splitlines()]

    assert response.status_code == 200
    assert second_response.status_code == 200
    assert request_id != second_response.headers["X-Request-ID"]
    assert len(entries) == 2
    assert entries[0]["request_id"] == request_id
    assert entries[0]["method"] == "GET"
    assert entries[0]["path"] == "/health"
    assert entries[0]["status_code"] == 200
    assert entries[0]["duration_ms"] >= 0
    assert "private medical information" not in log_output


@pytest.mark.anyio
async def test_request_log_records_processing_duration(
    capfd: pytest.CaptureFixture[str],
) -> None:
    service = create_app()

    @service.get("/slow")
    async def slow_response() -> dict[str, str]:
        await asyncio.sleep(0.02)
        return {"status": "ok"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/slow")

    log_output = capfd.readouterr().err
    entry = json.loads(log_output.strip().splitlines()[-1])

    assert response.status_code == 200
    assert entry["path"] == "/slow"
    assert entry["duration_ms"] >= 10


@pytest.mark.anyio
async def test_unexpected_error_is_safely_logged_and_returned(
    capfd: pytest.CaptureFixture[str],
) -> None:
    service = create_app()

    @service.get("/fail")
    async def fail() -> None:
        raise RuntimeError("private medical question and secret-token")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/fail")

    log_output = capfd.readouterr().err
    entry = json.loads(log_output.strip().splitlines()[-1])

    assert response.status_code == 500
    assert response.headers.get("X-Request-ID")
    assert response.json() == {
        "detail": "An unexpected server error occurred."
    }
    assert entry["status_code"] == 500
    assert entry["exception_type"] == "RuntimeError"
    assert "private medical question" not in log_output
    assert "secret-token" not in log_output
