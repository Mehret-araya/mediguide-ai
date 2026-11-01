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
- `database/` — reserved for planned database migrations
- `docs/` — project documentation

## 8. Current Milestone

The repository includes an Express backend with Supabase Auth registration,
login, token refresh, logout, current-user lookup, and authenticated account
deletion routes. It also includes PostgreSQL connection configuration, a
source-review foundation, a responsive website with Supabase Auth flows, and
a FastAPI AI service with source-gated local ingestion, lexical retrieval, and
extractive answering. No approved production documents are configured, so the
AI service abstains by default; it has no configured embedding model, pgvector
adapter, or LLM. Database migrations, conversation history, verified facility
data, and clinically reviewed emergency rules are not yet implemented.

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
Account deletion currently removes only the Supabase Auth identity because
conversation and application records are not yet persisted.

Copy `frontend/.env.example` to `frontend/.env` to override `VITE_API_URL`.
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
authenticated users can select or delete only messages in their own
conversations, and anonymous users have no table/view privileges. The
`service_role` has no direct privileges on profiles, conversations, or
messages. Message insertion is intentionally not granted yet; add a
separately reviewed owner-scoped API or database operation before enabling it.
Source retrieval is exposed only through views that require a matching latest
approval event. Any database role with RLS-bypass privileges must still be
treated as privileged and kept out of public clients.

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

The opt-in test runs `SELECT 1` and checks the expected tables, pgvector type,
and row-level security. It does not apply the migration.

To run the separate two-user RLS behavior test, create or use two dedicated
Supabase test accounts, then set their valid access tokens in the temporary
process environment as `RLS_TEST_USER_A_ACCESS_TOKEN` and
`RLS_TEST_USER_B_ACCESS_TOKEN`. Configure `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `DATABASE_URL`, and verified TLS settings as above. From
`backend/`, enable only this opt-in test and run:

```powershell
$env:RUN_DATABASE_RLS_INTEGRATION = "true"
npm run test:database
Remove-Item Env:RUN_DATABASE_RLS_INTEGRATION
Remove-Item Env:RLS_TEST_USER_A_ACCESS_TOKEN
Remove-Item Env:RLS_TEST_USER_B_ACCESS_TOKEN
```

The test verifies both tokens with Supabase Auth, temporarily creates fixture
profiles, conversations, and messages inside a PostgreSQL transaction, then
checks each user's read and write isolation under the `authenticated` role.
All fixture writes are rolled back. It requires the configured database role
to be able to assume `authenticated`; it does not apply migrations or use
service-role credentials. Do not use production accounts or expose access
tokens in shell history or logs.

Run the backend from its directory with `npm run dev`. Its `/health` endpoint
checks the API process only; live PostgreSQL connectivity is a separate
dependency check. The project reports that verified database connectivity now
works, but the schema migration has not yet been confirmed on the hosted
project. The opt-in test above verifies both connectivity and migration state;
it never applies the migration.