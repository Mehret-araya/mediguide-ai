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

Environment variables take precedence over values in the local `.env` file.
Invalid values are rejected during settings validation.

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
