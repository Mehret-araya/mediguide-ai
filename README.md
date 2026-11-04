# MediGuide AI

**Tagline:** Understand Your Health. Find Your Next Step.

## 1. Project Overview

MediGuide AI is a safety-focused web application designed to make general health information easier to understand and help users identify appropriate next steps.

The project aims to provide accessible, evidence-grounded health education, with an initial focus on users in Ethiopia.

## 2. Project Status

**Status:** Early development.

MediGuide AI is not clinically validated and is not a substitute for professional medical care.

## 3. Initial Technology Stack

- **Frontend:** React, Vite, TypeScript
- **Backend API:** Node.js, Express, TypeScript
- **AI service:** Python, FastAPI
- **Database:** PostgreSQL with pgvector
- **Testing:** Vitest, Pytest, API and web tests

## 4. Initial Scope

- English and Amharic user interface support
- General health education
- Retrieval of approved health information with verifiable citations
- User accounts and privacy-conscious conversation history
- User-controlled data deletion
- Healthcare facility discovery, initially focused on Addis Ababa

## 5. Safety Principles

- Do not present AI-generated content as a medical diagnosis.
- Do not make personalized medication or dosage decisions.
- Do not invent medical sources, citations, or healthcare facilities.
- Do not claim clinical validation without documented evidence.
- Emergency guidance must be independently implemented and clinically reviewed before it is presented as validated guidance.
- Do not imply that the absence of warning signs guarantees that a person is safe.
- Protect personal information and restrict access to private user data.

## 6. Development Principles

- Build and test incrementally.
- Keep secrets on the server and out of source control.
- Prefer reliable, approved health sources over unsupported AI-generated claims.
- Verify facility information before presenting it as current.
- Document requirements, architecture, safety, privacy, and testing decisions.
- Do not claim features are implemented until they have been built and tested.

## 7. Repository Structure

- `frontend/` — React web application
- `backend/` — application API
- `ai-service/` — AI and knowledge retrieval
- `supabase/` — local Supabase configuration and ordered database migrations
- `docs/` — project documentation

Deployment blockers and environment preparation are summarized in
[`docs/deployment.md`](./docs/deployment.md).

## 8. Current Milestone

The repository includes an Express backend with Supabase Auth registration,
login, token refresh, logout, current-user lookup, and authenticated account
deletion routes. It also includes PostgreSQL connection configuration, a
source-review foundation, a responsive website with Supabase Auth flows, and
a FastAPI AI service with source-gated local ingestion, lexical retrieval, and
extractive answering. An optional embedding provider and PostgreSQL/pgvector
adapter now persist and search approved, checksum-verified source chunks when
explicitly configured; they are not configured by default. No approved
production documents are configured, so the AI service abstains by default.
The database foundation and authenticated conversation API
and migrations have been applied and tested against local Supabase. The local
two-user RLS behavior test was previously reported passing; the account
deletion integration test also passes locally and verifies the Auth user,
profile, conversation, message, and protected-endpoint behavior using a
disposable account. No hosted-project integration or production-data test has
been performed. Source registry records now require license metadata, but no
production source corpus is approved. Verified Addis Ababa facility data and
clinically reviewed emergency rules are not available. The facility
API/provider interface and empty-state search are implemented, but the
endpoint intentionally returns unavailable until an authoritative dataset is
supplied. Rate limiting, backups/restoration, production hosting, and clinical
review remain release blockers.

### Backend authentication setup

Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL` and
`SUPABASE_ANON_KEY` from your Supabase project. Set
`SUPABASE_SERVICE_ROLE_KEY` only in this trusted backend environment; it is
used for authenticated account deletion and must never be sent to a browser,
committed, or placed in frontend configuration. Supabase Auth uses HTTPS and
does not depend on the PostgreSQL TLS certificate configuration.

The backend exposes `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`,
`/me`, and `DELETE /api/v1/auth/account`. Authenticated requests use a bearer
access token for non-browser clients. The website is connected through
credentialed requests and the backend's HttpOnly access/refresh cookies; token
values are not exposed to browser JavaScript or stored in local storage.
Account deletion removes the Supabase Auth identity; database foreign-key
cascades delete the user's profile, conversations, and messages when the
tracked migrations are applied. An opt-in local integration test verifies
these cascades and protected-endpoint rejection using a disposable account.
Hosted-project behavior and backup-retention behavior remain unverified.

In local development, the frontend uses Vite's `/api` proxy to reach the
Express service on `127.0.0.1:5000`; keep `VITE_API_URL` blank for this setup.
Start the backend and frontend in separate terminals. If the Vite development
server chooses a loopback host/port other than `localhost:5173`, development
CORS and cookie-origin validation accept HTTP loopback origins only; remote
hosts remain disallowed. `VITE_API_URL` may be set to an absolute API origin
when a deployment does not provide a same-origin proxy, and the backend's
`FRONTEND_URL` must list that exact production frontend origin.

Deploy the frontend and API on the same site so the `SameSite=Lax` session
cookies are sent by the browser. The frontend configuration must never contain
Supabase keys. Run the frontend from `frontend/` with `npm run dev`.

The Express API also exposes `POST /api/v1/health-education` as a proxy to the
private FastAPI service. Configure the same privately generated
`AI_SERVICE_TOKEN` in `backend/.env` and `ai-service/.env`, and set the trusted
backend-only `AI_SERVICE_URL`. Do not put these values in frontend settings.
FastAPI rejects requests without the shared token; in production, use HTTPS
and restrict AI-service network access to the backend. No live deployment
integration or production source corpus has been verified; the AI service
abstains when no approved documents are configured.

### Backend development configuration

From the repository root, copy `backend/.env.example` to `backend/.env` and
provide a PostgreSQL connection URL in `DATABASE_URL` before using the database
pool. The pool verifies PostgreSQL TLS certificates by default. Set
`DATABASE_SSL_CA` to a trusted CA certificate file when your database uses a
private certificate authority. For Supabase, obtain the database root
certificate from the project's authenticated Supabase dashboard and point
`DATABASE_SSL_CA` to that local certificate file. Do not use a certificate
retrieved from an unverified connection, and do not disable TLS verification
for a hosted database. Set `DATABASE_SSL=false` only for local development
databases that do not support TLS. Never commit `.env` or put real credentials
in the example file.

### Supabase schema migrations

The Supabase migrations create profiles linked to Supabase Auth users, reviewed
health sources and an append-only review history, source chunks with optional
pgvector embeddings, and private conversations/messages. Row-level security
restricts profile and conversation access to the owning authenticated user;
message reads and deletes are limited to messages in the user's own
conversations, and authenticated users can insert only `user` messages there.
Anonymous users have no table/view privileges. The `service_role` has no
privileges on profiles or conversations and only `INSERT` on messages. Source
retrieval is exposed only through views that require a matching latest approval
event. Any database role with RLS-bypass privileges must still be treated as
privileged and kept out of public clients.

The API persists conversations using the verified user's request-scoped
Supabase client. The backend verifies ownership before generating an answer
and inserts the `assistant` message with a separate server-only client using
`SUPABASE_SERVICE_ROLE_KEY`; the key is never sent to the frontend. Since the
service role bypasses RLS, that explicit ownership check is mandatory. Apply
the follow-up migrations in timestamp order after the foundation migration:
`supabase/migrations/20261101010000_conversation_message_insert.sql` adds the
limitations field, then
`supabase/migrations/20261101020000_secure_conversation_message_insertion.sql`
adds idempotency, restricts authenticated inserts to `role = 'user'`, and
grants the server role only column-level `INSERT` needed for assistant
responses. The API requires a UUID `Idempotency-Key`; retries with the same
key reuse message rows rather than duplicating them. The later
`supabase/migrations/20261103000000_source_license_metadata.sql` migration
adds source-license metadata and excludes previously approved sources whose
license is unknown from retrieval views. These migrations are additive and do
not rewrite the earlier migration history. The
`supabase/migrations/20261104000000_persistent_vector_embeddings.sql`
migration adds model/dimension metadata for persisted vectors without fixing
the vector dimension or changing existing approval policies. The follow-up
`supabase/migrations/20261104010000_knowledge_reader_role.sql` migration adds
a dedicated `NOLOGIN`, `NOBYPASSRLS` knowledge-reader role and scoped RLS
policies for optional AI-service retrieval/indexing. Configure a separate
server-only login as a member of that role for `KNOWLEDGE_DATABASE_URL`; do
not use the Supabase `service_role` or a frontend credential. The role cannot
read user profiles, conversations, or messages, mutate source approvals, or
delete chunks. The follow-up
`supabase/migrations/20261104020000_restrict_service_role_knowledge_access.sql`
removes the unused broad knowledge-table grants from Supabase `service_role`;
the backend still retains its separately constrained assistant-message insert.
Persistence failure logs include only the operation and an allowlisted
PostgreSQL/PostgREST error code, never the database message or submitted
question. A `42703` code indicates a missing database column; verify that both
follow-up migrations completed before changing permissions. A `PGRST204` code
can indicate a missing column in PostgREST's schema cache. A `42501` code
indicates a permission failure and should be investigated without granting
additional service-role access.

Run route and service-client unit tests with `npm test` from `backend/`.
Database security checks remain opt-in with `npm run test:database` after
setting `RUN_DATABASE_INTEGRATION=true` and/or
`RUN_DATABASE_RLS_INTEGRATION=true` in a safe local process environment. The
RLS behavior test requires two dedicated non-production Supabase users and
must not be pointed at production data. The account-deletion cascade test
requires `RUN_LOCAL_ACCOUNT_DELETION_INTEGRATION=true`; it rejects
non-loopback Supabase and PostgreSQL URLs and creates only its own disposable
local user.

After authenticating the Supabase CLI and linking the intended project, apply
the tracked migrations with `npx supabase db push` from the repository root.
Review the target project and migration SQL before applying. Do not run these
migrations against production until backups and a rollback plan are in place.

For a live connection and migrated-schema check, configure `DATABASE_URL` and
the official dashboard CA path in `backend/.env`, then, from `backend/`, run
these PowerShell commands:

```powershell
$env:RUN_DATABASE_INTEGRATION = "true"
npm run test:database
Remove-Item Env:RUN_DATABASE_INTEGRATION
```

The database opt-in test runs `SELECT 1` and checks the expected tables,
columns, pgvector type, grants, and row-level security. It does not apply
migrations.

To run the separate two-user RLS behavior test, create or use two dedicated
non-production Supabase Auth users and confirm both accounts. Configure
`DATABASE_URL` and verified TLS settings in `backend/.env` as above. From
`backend/`, use this PowerShell snippet to obtain fresh access tokens without
printing them or putting credentials in shell history:

```powershell
$projectUrl = Read-Host "Supabase project URL"
$anonKey = Read-Host "Supabase publishable/anon key"
function Set-RlsTestToken($variableName) {
  $email = Read-Host "Email for $variableName"
  $securePassword = Read-Host "Password for $variableName" -AsSecureString
  $password = [System.Net.NetworkCredential]::new("", $securePassword).Password
  try {
    $login = Invoke-RestMethod `
      -Uri "$projectUrl/auth/v1/token?grant_type=password" `
      -Method Post `
      -Headers @{ apikey = $anonKey } `
      -ContentType "application/json" `
      -Body (@{ email = $email; password = $password } | ConvertTo-Json)
    [Environment]::SetEnvironmentVariable(
      $variableName, $login.access_token, "Process"
    )
  } finally {
    $password = $null
    $securePassword = $null
    $login = $null
  }
}

try {
  Set-RlsTestToken "RLS_TEST_USER_A_ACCESS_TOKEN"
  Set-RlsTestToken "RLS_TEST_USER_B_ACCESS_TOKEN"
  $env:RUN_DATABASE_INTEGRATION = "true"
  $env:RUN_DATABASE_RLS_INTEGRATION = "true"
  npm run test:database
} finally {
  Remove-Item Env:RLS_TEST_USER_A_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:RLS_TEST_USER_B_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_DATABASE_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_DATABASE_RLS_INTEGRATION -ErrorAction SilentlyContinue
}
```

The test verifies both tokens with Supabase Auth, temporarily creates fixture
profiles, conversations, and messages inside a PostgreSQL transaction, then
checks each user's read and write isolation under the `authenticated` role.
All fixture writes are rolled back. It requires the configured database role
to be able to assume `authenticated`; it does not apply migrations or use
service-role credentials. Use dedicated non-production test users. Enter
their access tokens only in a local process environment, never in chat,
source files, shell history, or logs. The behavior test has not yet been run
against the hosted database.

To apply pending migrations and run the local schema and account-deletion
integration tests, start Supabase locally with `npx supabase start`, then run
this from the repository root. Status credentials are assigned only to the
current process and are not printed:

```powershell
$local = npm exec -- supabase status --output json | ConvertFrom-Json
$env:SUPABASE_URL = $local.API_URL
$env:SUPABASE_ANON_KEY = $local.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $local.SERVICE_ROLE_KEY
$env:DATABASE_URL = $local.DB_URL
$env:DATABASE_SSL = "false"
$env:RUN_DATABASE_INTEGRATION = "true"
$env:RUN_LOCAL_ACCOUNT_DELETION_INTEGRATION = "true"
try {
  npm exec -- supabase migration up
  Set-Location backend
  npm run test:database
} finally {
  Remove-Item Env:SUPABASE_URL, Env:SUPABASE_ANON_KEY,
    Env:SUPABASE_SERVICE_ROLE_KEY, Env:DATABASE_URL,
    Env:DATABASE_SSL, Env:RUN_DATABASE_INTEGRATION,
    Env:RUN_LOCAL_ACCOUNT_DELETION_INTEGRATION `
    -ErrorAction SilentlyContinue
}
```

The deletion test creates an `example.test` account, inserts synthetic
profile/conversation/message fixtures, verifies endpoint access before
deletion, checks that the Auth token is rejected afterward, confirms all
three record types are gone, and cleans up fixture rows and any account left
by a failed test. It does not use or require a production account.

Run the backend from its directory with `npm run dev`. Its `/health` endpoint
checks the API process only; live PostgreSQL connectivity is a separate
dependency check. The opt-in database test verifies connectivity and
migration state; it never applies migrations. The local schema and account
deletion integration tests passed after applying the tracked migrations to
the local stack. The hosted project remains unverified.