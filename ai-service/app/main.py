from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import Settings
from app.core.logging_config import configure_logging
from app.core.request_logging import RequestTrackingMiddleware
from app.rag.assistant import HealthAssistant
from app.rag.manifest import load_approved_corpus
from app.rag.retrieval import LexicalRetriever, Retriever
from app.schemas.health_education import (
    APIError,
    HealthEducationRequest,
    HealthEducationResponse,
)


def create_app(
    settings: Settings | None = None,
    *,
    retriever: Retriever | None = None,
) -> FastAPI:
    config = settings if settings is not None else Settings()
    configure_logging(config)
    assistant = HealthAssistant(
        retriever
        if retriever is not None
        else LexicalRetriever(
            load_approved_corpus(config.knowledge_base_manifest)
        )
    )
    service = FastAPI(
        title=config.app_name,
        description=(
            "Health education responses use relevant passages from approved "
            "sources and abstain when evidence is unavailable."
        ),
        version=config.app_version,
        debug=config.debug,
    )
    service.add_middleware(RequestTrackingMiddleware)

    @service.get("/health", tags=["health"])
    def health_check() -> dict[str, str]:
        """Report that the AI-service process is responding."""
        return {"status": "ok", "service": "MediGuide AI service"}

    @service.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        _error: RequestValidationError,
    ) -> JSONResponse:
        error = APIError(
            code="VALIDATION_ERROR",
            message="The request could not be accepted.",
            request_id=request.state.request_id,
        )
        return JSONResponse(
            status_code=422,
            content=error.model_dump(by_alias=True),
        )

    @service.post(
        "/api/v1/health-education",
        response_model=HealthEducationResponse,
        responses={
            422: {"model": APIError},
        },
        tags=["health-education"],
    )
    async def submit_health_education_question(
        question: HealthEducationRequest,
        request: Request,
    ) -> HealthEducationResponse:
        return await assistant.answer(
            question.question,
            request_id=request.state.request_id,
        )

    return service


app = create_app()
