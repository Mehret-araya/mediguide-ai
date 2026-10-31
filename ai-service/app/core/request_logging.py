import logging
import time
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("mediguide.request")


class RequestTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        request_id = uuid4().hex
        request.state.request_id = request_id
        started_at = time.perf_counter()
        exception_type: str | None = None

        try:
            response = await call_next(request)
        except Exception as error:
            exception_type = type(error).__name__
            response = JSONResponse(
                status_code=500,
                content={"detail": "An unexpected server error occurred."},
            )

        duration_ms = (time.perf_counter() - started_at) * 1000
        response.headers["X-Request-ID"] = request_id
        route = request.scope.get("route")
        route_path = getattr(route, "path", "<unmatched>")

        log_fields = {
            "request_id": request_id,
            "method": request.method,
            "path": route_path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 3),
        }

        if exception_type is not None:
            logger.error(
                "request failed",
                extra={**log_fields, "exception_type": exception_type},
            )
        else:
            logger.info("request completed", extra=log_fields)

        return response
