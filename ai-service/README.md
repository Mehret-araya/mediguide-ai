# MediGuide AI Service

## Status

This service currently provides a FastAPI process-health endpoint only. It does
not generate health answers, retrieve medical sources, or provide clinically
reviewed emergency guidance.

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
