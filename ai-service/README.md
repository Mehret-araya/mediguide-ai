# MediGuide AI Service

## Status

This service provides a FastAPI process-health endpoint and a health-education
route backed by source-gated ingestion, local lexical retrieval, and extractive
answering. It returns only sentences copied from retrieved chunks with their
registry citation metadata. It refuses individual diagnosis or medication
requests, and abstains when no relevant passage is available.

No approved production source documents are present in this repository or
configured by default. Without a local approved-source manifest, the route
returns an explicit abstention rather than a medical answer. Synthetic source
records used in tests are fixtures only and are not medical evidence. This
foundation is not a clinically validated service.

The ingestion module does not download URLs, approve sources, extract files,
or persist chunks. Operators must provide extracted text alongside the
verified registry record and audit history. Every chunk retains the full
validated source record as well as citation fields. Checksums are verified
when the registry record supplies one.

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

Valid requests receive HTTP `200` and a typed response. Answers are extractive:
the assistant selects relevant sentences from retrieved source chunks and
returns the original registry title, publisher, URL, and section. It does not
use an LLM to paraphrase or generate medical claims. With the default empty
corpus, it returns an abstention and no citations. Requests for an individual
diagnosis or medication/dose recommendation receive a refusal with no
citations.

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

The request ID is also returned in the `X-Request-ID` header. Validation
errors use a generic message and do not echo the submitted question.

## Retrieval and embedding boundaries

The default retriever is an in-process BM25-style lexical retriever. The
`EmbeddingProvider`, `VectorStore`, and `VectorRetriever` interfaces allow an
embedding model and vector database to be injected; an in-memory vector store
is included for tests. No embedding model/provider or Supabase pgvector adapter
is selected or configured. Chunks are not persisted between restarts. Do not
send user questions or source documents to an external embedding service
without an explicit provider, privacy review, and configuration.

The route is an internal AI-service endpoint, not a public frontend API.
Every health-education request must include the shared
`X-Internal-Service-Token`. Set `AI_SERVICE_TOKEN` to the same private value
in the FastAPI and Express environments. If it is unset, the health-education
route fails closed with `503`; invalid/missing request credentials receive
`401`. Production deployment must keep the service behind the backend and
restrict network access accordingly; the token is not a substitute for
network isolation or HTTPS.

## Approved local source manifest

Set `KNOWLEDGE_BASE_MANIFEST` to a JSON manifest path to load operator-supplied
documents at service startup. Leave it unset to start with an empty corpus and
return abstentions. Each manifest entry contains:

- `source`: a record using the backend registry's `HealthSourceRecord` fields.
- `auditHistory`: review events for that source, including its current
  `pending_review` to `approved` decision.
- `documentPath`: a relative `.md` or `.txt` path under the manifest directory.

The loader rejects unapproved or unaudited sources, duplicate source IDs,
paths outside the manifest directory, unsupported file types, oversized files,
and mismatched checksums when provided. It reads local text only; it does not
download URLs or approve documents. Chunks are held in memory and loaded again
at process startup. Do not populate this manifest until each source and its
approval audit have been verified through the project's source-review process.
No sample source manifest is shipped because no production sources are approved
for this service.

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
| `KNOWLEDGE_BASE_MANIFEST` | unset | Optional local approved-source manifest |
| `AI_SERVICE_TOKEN` | unset | Shared secret required for backend-to-AI calls |

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
