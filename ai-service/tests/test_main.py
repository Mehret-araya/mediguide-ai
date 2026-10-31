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
