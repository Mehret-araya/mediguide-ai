import httpx
import pytest

from app.main import app


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
