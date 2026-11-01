import json
import logging

from app.core.logging_config import JsonLogFormatter


def test_json_formatter_includes_only_approved_structured_fields() -> None:
    record = logging.LogRecord(
        name="mediguide.request",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request completed",
        args=(),
        exc_info=None,
    )
    record.request_id = "request-123"
    record.method = "GET"
    record.path = "/health"
    record.status_code = 200
    record.duration_ms = 1.25
    record.password = "never-log-this"
    record.medical_question = "private health details"

    formatted = JsonLogFormatter().format(record)
    entry = json.loads(formatted)

    assert entry["message"] == "request completed"
    assert entry["request_id"] == "request-123"
    assert entry["method"] == "GET"
    assert entry["path"] == "/health"
    assert entry["status_code"] == 200
    assert entry["duration_ms"] == 1.25
    assert "password" not in entry
    assert "medical_question" not in entry
    assert "never-log-this" not in formatted
    assert "private health details" not in formatted


def test_json_formatter_does_not_emit_untrusted_log_messages() -> None:
    record = logging.LogRecord(
        name="mediguide.request",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="sensitive health question in message",
        args=(),
        exc_info=None,
    )

    formatted = JsonLogFormatter().format(record)

    assert json.loads(formatted)["message"] == "application event"
    assert "sensitive health question" not in formatted
