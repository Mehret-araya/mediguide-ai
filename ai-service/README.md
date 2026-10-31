# MediGuide AI Service

## Status

This service currently provides a FastAPI process-health endpoint only. It does
not generate health answers, retrieve medical sources, or provide clinically
reviewed emergency guidance.

## Development

From this directory, create and activate a Python virtual environment, then
install dependencies:

```powershell
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
