import json
import logging
import logging.config
from datetime import datetime, timezone
from typing import Any

from app.core.config import Settings


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created,
                tz=timezone.utc,
            ).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for field in (
            "request_id",
            "method",
            "path",
            "status_code",
            "duration_ms",
            "exception_type",
        ):
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value

        return json.dumps(entry, separators=(",", ":"), ensure_ascii=True)


def configure_logging(settings: Settings) -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "structured": {
                    "()": "app.core.logging_config.JsonLogFormatter",
                },
            },
            "handlers": {
                "request_console": {
                    "class": "logging.StreamHandler",
                    "formatter": "structured",
                    "stream": "ext://sys.stderr",
                },
            },
            "loggers": {
                "mediguide.request": {
                    "handlers": ["request_console"],
                    "level": settings.log_level,
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": [],
                    "level": "INFO",
                    "propagate": False,
                    "disabled": True,
                },
            },
        }
    )
