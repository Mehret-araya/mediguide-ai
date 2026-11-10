import os
import secrets
import ssl
from contextlib import asynccontextmanager
from urllib.parse import urlparse

if os.environ.get("DEBUG") not in {"true", "false", "1", "0", "True", "False", None}:
    os.environ.pop("DEBUG", None)

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import Settings
from app.core.logging_config import configure_logging
from app.core.request_logging import RequestTrackingMiddleware
from app.rag.assistant import HealthAssistant
from app.rag.embeddings import OpenAICompatibleEmbeddingProvider
from app.rag.manifest import load_approved_corpus
from app.rag.postgres_store import PostgresVectorStore
from app.rag.retrieval import LexicalRetriever, Retriever, VectorRetriever
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
    if retriever is not None:
        initial_assistant = HealthAssistant(retriever)
    elif config.knowledge_database_url is None:
        initial_assistant = HealthAssistant(
            LexicalRetriever(load_approved_corpus(config.knowledge_base_manifest))
        )
    else:
        initial_assistant = None

    @asynccontextmanager
    async def lifespan(service: FastAPI):
        pool = None
        try:
            if retriever is not None:
                service.state.assistant = initial_assistant
            elif config.knowledge_database_url is None:
                service.state.assistant = initial_assistant
            else:
                import asyncpg  # type: ignore[import-untyped]

                database_url = config.knowledge_database_url.get_secret_value()
                database_host = urlparse(database_url).hostname
                ssl_context = (
                    None
                    if database_host in {"localhost", "127.0.0.1", "::1"}
                    else ssl.create_default_context(
                        cafile=(
                            str(config.knowledge_database_ssl_ca)
                            if config.knowledge_database_ssl_ca is not None
                            else None
                        )
                    )
                )
                pool = await asyncpg.create_pool(
                    dsn=database_url,
                    ssl=ssl_context,
                    min_size=1,
                    max_size=5,
                    command_timeout=15,
                    server_settings={"application_name": "mediaguide-ai"},
                )
                embedding_provider = OpenAICompatibleEmbeddingProvider(
                    api_url=config.embedding_api_url or "",
                    api_key=(
                        config.embedding_api_key.get_secret_value()
                        if config.embedding_api_key is not None
                        else ""
                    ),
                    model=config.embedding_model or "",
                    timeout_seconds=config.embedding_timeout_seconds,
                )
                vector_store = PostgresVectorStore(
                    pool,
                    embedding_model=config.embedding_model or "",
                )
                vector_retriever = VectorRetriever(
                    embedding_provider,
                    vector_store,
                )
                chunks = load_approved_corpus(config.knowledge_base_manifest)
                if chunks:
                    await vector_retriever.index(chunks)
                service.state.assistant = HealthAssistant(vector_retriever)

            yield
        finally:
            if pool is not None:
                await pool.close()

    service = FastAPI(
        title=config.app_name,
        description=(
            "Health education responses use relevant passages from approved "
            "sources and abstain when evidence is unavailable."
        ),
        version=config.app_version,
        debug=config.debug,
        lifespan=lifespan,
    )
    if initial_assistant is not None:
        service.state.assistant = initial_assistant
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
            requestId=request.state.request_id,
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
        internal_token: str | None = Header(
            default=None,
            alias="X-Internal-Service-Token",
        ),
    ) -> HealthEducationResponse:
        expected_token = (
            config.ai_service_token.get_secret_value()
            if config.ai_service_token is not None
            else None
        )
        if expected_token is None or not expected_token.strip():
            raise HTTPException(
                status_code=503,
                detail="Health education service is unavailable.",
            )
        if internal_token is None or not secrets.compare_digest(
            internal_token,
            expected_token,
        ):
            raise HTTPException(
                status_code=401,
                detail="A valid internal service credential is required.",
            )
        assistant = getattr(request.app.state, "assistant", None)
        if assistant is None:
            raise HTTPException(
                status_code=503,
                detail="Health education service is unavailable.",
            )
        return await assistant.answer(
            question.question,
            request_id=request.state.request_id,
        )

    return service


app = create_app()
