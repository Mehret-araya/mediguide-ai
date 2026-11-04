# MediGuide AI Service

## Status

This service provides a FastAPI process-health endpoint and a health-education
route backed by source-gated ingestion, lexical retrieval by default, optional
persistent PostgreSQL/pgvector retrieval, and extractive answering. It returns
only sentences copied from retrieved chunks with their registry citation
metadata. It refuses individual diagnosis or medication requests, abstains
when evidence is missing, filters sources explicitly marked outdated, and
conservatively abstains on a narrow class of directly contradictory statements.

No approved production source documents are present in this repository or
configured by default. Without an indexed approved database corpus or a local
approved-source manifest, the route returns an explicit abstention rather than
a medical answer. Synthetic source records used in tests are fixtures only
and are not medical evidence. This foundation is not a clinically validated
service.

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

The default retriever is an in-process BM25-style lexical retriever. Optional
vector retrieval uses an operator-configured OpenAI-compatible embeddings API,
`VectorRetriever`, and a PostgreSQL/pgvector store. It is activated only when
all database and embedding settings are supplied. Database reads are gated by
`approved_health_sources`; indexing also requires the manifest's complete
source metadata and approval event to match an existing database approval.
Indexing never creates or updates source approvals. Every persisted source
document must have a matching full-document checksum; each returned chunk is
also checked against its content hash and deterministic chunk ID.

When configured, manifest documents are sent to the embedding endpoint at
startup for indexing, and each user question is sent to that endpoint for
query embedding. Perform a privacy and vendor review first; do not send health
questions or source documents to a third party without approval. Use HTTPS
outside loopback and a dedicated login that is a member only of the
`mediaguide_knowledge_reader` role. Migration
`20261104010000_knowledge_reader_role.sql` creates a `NOLOGIN`,
`NOBYPASSRLS` group role with read access scoped to currently approved sources,
and chunk insert/update access scoped to approved sources. It cannot alter
source records or review decisions, delete chunks, or read account/conversation
tables. The migration adds narrowly scoped role-specific RLS policies and does
not replace the existing policies.
`20261104020000_restrict_service_role_knowledge_access.sql` removes the
previously granted unused knowledge-table permissions from Supabase
`service_role`; it does not change its separately restricted message-insert
permission. Create a separate login and grant it only the reader role; never
use `postgres`, `service_role`, or a frontend credential for
`KNOWLEDGE_DATABASE_URL`. Verify the login has no other privileged memberships
and keep its password in the server secret manager. Hosted database connections
use certificate verification; loopback connections may use plaintext for
local development.
No provider, database, or source corpus is configured by default.
The current pgvector query uses exact distance ordering and is not benchmarked
or equipped with a dimension-specific approximate-nearest-neighbor index; do
not assume it will scale to a large corpus without further evaluation.

Retrieval results are not medically or statistically validated. Conflict
detection catches only narrow, textually identical claims with opposite
negation. It cannot reliably identify all contradictions, nuanced qualifiers,
or population-specific recommendations. Explicit limitation text indicating
outdated/superseded/withdrawn material is excluded, and retired or otherwise
unapproved sources are excluded by the database approval view. There is no
defined source-age threshold, so a publication date alone does not establish
currency; human source maintenance remains required. These safeguards do not
replace clinical review.

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
documents at service startup. With local lexical mode, leave it unset to start
with an empty corpus and return abstentions. Persistent mode can retrieve
already indexed database chunks without a manifest. Each manifest entry contains:

- `source`: a record using the backend registry's `HealthSourceRecord` fields.
- `auditHistory`: review events for that source, including its current
  `pending_review` to `approved` decision.
- `documentPath`: a relative `.md` or `.txt` path under the manifest directory.

The loader rejects unapproved or unaudited sources, duplicate source IDs,
paths outside the manifest directory, unsupported file types, oversized files,
and mismatched checksums when provided. It reads local text only; it does not
download URLs or approve documents. In lexical mode, chunks are held in memory
and loaded again at process startup. Do not populate this manifest until each
source and its approval audit have been verified through the project's
source-review process.
No sample source manifest is shipped because no production sources are approved
for this service.

For vector indexing, the database must already contain the exact source
metadata and latest approval decision represented in the manifest. The
adapter only inserts/updates chunk rows after verifying that approval and the
source checksum. Apply migrations in order, including
`supabase/migrations/20261104000000_persistent_vector_embeddings.sql`.

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
| `KNOWLEDGE_DATABASE_URL` | unset | Server-only PostgreSQL connection URL without `sslmode`; enables pgvector retrieval |
| `KNOWLEDGE_DATABASE_SSL_CA` | unset | Optional trusted CA file for hosted database TLS |
| `EMBEDDING_API_URL` | unset | OpenAI-compatible embeddings endpoint; HTTPS required except loopback |
| `EMBEDDING_API_KEY` | unset | Secret for the configured embedding service |
| `EMBEDDING_MODEL` | unset | Provider model identifier used consistently for indexing and search |
| `EMBEDDING_TIMEOUT_SECONDS` | `10` | Embedding API request timeout (1–60 seconds) |

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
python -m mypy app
```

The database-role security integration is opt-in and loopback-only. After
applying local migrations, set `RUN_LOCAL_RAG_SECURITY_INTEGRATION=true` and
`RAG_TEST_DATABASE_URL` to the local Supabase database URL, then run:

```powershell
python -m pytest tests/test_rag_postgres_store.py
```

The test creates a temporary login and synthetic source rows, checks approved-
source isolation and denied privileges, and removes its fixtures and login.
Never set its URL to a hosted or production database.

Never put passwords, API keys, tokens, or other credentials in `.env.example`.
Local `.env` files are ignored by Git; do not force-add or commit them. Configure
production values through the deployment environment or secret manager.
