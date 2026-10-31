from fastapi import FastAPI

from app.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else Settings()
    service = FastAPI(
        title=config.app_name,
        description=(
            "Internal AI-service foundation. "
            "Health education generation is not implemented."
        ),
        version=config.app_version,
        debug=config.debug,
    )

    @service.get("/health", tags=["health"])
    def health_check() -> dict[str, str]:
        """Report that the AI-service process is responding."""
        return {"status": "ok", "service": "MediGuide AI service"}

    return service


app = create_app()
