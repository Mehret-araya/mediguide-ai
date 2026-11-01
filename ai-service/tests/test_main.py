import asyncio
import json
import uuid

import httpx
import pytest

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
async def test_valid_health_education_request_is_not_generated_yet() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "What is malaria?"},
        )

    assert response.status_code == 501
    assert response.headers.get("X-Request-ID")
    assert response.json() == {
        "code": "NOT_IMPLEMENTED",
        "message": "Health education responses are not available yet.",
        "requestId": response.headers["X-Request-ID"],
    }


@pytest.mark.anyio
async def test_question_at_maximum_length_passes_validation() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/health-education",
            json={"question": "q" * 2000},
        )

    assert response.status_code == 501


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
    assert operation["responses"]["501"]["content"]["application/json"][
        "schema"
    ]["$ref"].endswith("/APIError")
    assert openapi["components"]["schemas"]["HealthEducationRequest"][
        "properties"
    ]["question"]["maxLength"] == 2000


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
