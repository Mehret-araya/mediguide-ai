# MediGuide AI Service

## Status

This service currently provides a FastAPI process-health endpoint and a
validation-only health-education route. The RAG package now supports ingestion
and chunking of operator-supplied text only when source metadata and an
approval audit event satisfy the backend registry contract. No approved
production source documents are present or loaded; the API does not yet
retrieve or generate health answers, or provide clinically reviewed emergency
guidance.

The ingestion module does not download URLs, approve sources, extract files,
or persist chunks. Operators must provide extracted text alongside the
verified registry record and audit history. Checksums are verified when the
registry record supplies one. Synthetic source records used in tests are
fixtures only and are not medical evidence.

## Health education API contract

`POST /api/v1/health-education` accepts a JSON request with a required,
non-blank `question` of at most 2,000 characters. `language` is optional and
defaults to `"en"`; other language values are rejected. Invalid requests
receive HTTP `422` with the standard error shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "The request could not be accepted.",
  "requestId": "request-id-from-response-header"
}
```

The current endpoint is validation-only. A valid request receives HTTP `501`
with a `NOT_IMPLEMENTED` error; it does not generate a health answer. The
declared future success response is:

```json
{
  "answer": "Health education response",
  "language": "en",
  "citations": [
    {
      "sourceId": "approved-source-id",
      "title": "Source title",
      "publisher": "Source publisher",
      "url": "https://source.example/document",
      "section": "Optional section"
    }
  ],
  "limitations": ["General information only."],
  "requestId": "request-id-from-response-header"
}
```

The citation fields describe the schema only; no sources are currently
retrieved or approved by this service. The request ID is also returned in the
`X-Request-ID` header. Validation errors use a generic message and do not echo
the submitted question.

## Configuration

Settings are defined centrally in `app/core/config.py` using Pydantic Settings.
The service reads the following values from environment variables or the
optional `ai-service/.env` file:

| Variable | Default | Description |
| --- | --- | --- |
| `APP_NAME` | `MediGuide AI Service` | FastAPI application title |
| `APP_VERSION` | `0.1.0` | Application version (`major.minor.patch`) |
| `APP_ENV` | `development` | One of `development`, `testing`, or `production` |
| `DEBUG` | `false` | FastAPI debug mode |
| `LOG_LEVEL` | `INFO` | Minimum structured application log level |

Environment variables take precedence over values in the local `.env` file.
Invalid values are rejected during settings validation.

## Request tracking and logging

Logging is configured centrally in `app/core/logging_config.py` using
`LOG_LEVEL`. Application request events are emitted as JSON with a UTC
timestamp, request ID, method, matched route template, status code, and
processing duration in milliseconds. Each HTTP response includes its generated
ID in the `X-Request-ID` header.

The middleware does not log request bodies, headers, query strings, or raw
unmatched paths. Unexpected exceptions produce a generic HTTP 500 response;
logs include the exception class but not its message or traceback. Uvicorn
access logging is disabled to avoid logging raw request lines. Do not add
passwords, tokens, medical questions, or personal health information to log
messages or request paths.

## Development

From the repository root, copy the example configuration if you need local
overrides. This file contains non-sensitive defaults and is optional:

```powershell
Copy-Item ai-service\.env.example ai-service\.env
```

Edit `ai-service\.env` as needed, then create and activate a Python virtual
environment and install dependencies:

```powershell
Set-Location ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

Start the service:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`GET /health` reports whether the process is responding. It does not check
external dependencies or indicate that AI functionality is available.

Run tests with:

```powershell
python -m pytest
```

Never put passwords, API keys, tokens, or other credentials in `.env.example`.
Local `.env` files are ignored by Git; do not force-add or commit them. Configure
production values through the deployment environment or secret manager.
