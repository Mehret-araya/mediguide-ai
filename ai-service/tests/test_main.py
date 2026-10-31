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
