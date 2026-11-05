# MediGuide AI — Deployment Preparation

## Status

**Not ready for production deployment.** No production hosting target,
environment, verified health-source corpus, facility dataset, clinical
approval, backup/restore process, monitoring setup, or rate-limiting policy
has been configured or verified. Do not deploy the current service as
clinically reliable or use production health data for testing.

## Intended component boundaries

- **Frontend:** build the React/Vite app with `npm run build` in `frontend/`.
  Serve the static `frontend/dist/` output over HTTPS. Prefer a same-site
  frontend/API setup because browser sessions use `SameSite=Lax` cookies.
- **Backend:** build with `npm run build` in `backend/` and run
  `npm start`. The API should be publicly reachable only over HTTPS, with
  `FRONTEND_URL` set to the exact allowed frontend origin(s).
- **AI service:** install `ai-service/requirements.txt` and run FastAPI behind
  the backend on a private network. The shared `AI_SERVICE_TOKEN` is required;
  HTTPS and network isolation are both required in production.
- **Database:** use managed PostgreSQL with pgvector only after verifying the
  provider's data-protection, region, access-control, backup, and recovery
  requirements. Keep it private and use certificate-verified TLS.
- **Authentication:** configure Supabase Auth separately. Keep the service
  role key on the backend only; never place it in frontend variables.

No hosting provider is selected. Choose one only after reviewing its
health-data handling terms, region, security controls, availability, cost, and
legal/privacy requirements. A free-tier label alone is not evidence that a
service is suitable for health information.

## Environment configuration

Use the placeholder files as variable references:

- `backend/.env.example`: `PORT`, `FRONTEND_URL`, Supabase URL/anon/service
  role keys, `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_CA`,
  `AI_SERVICE_URL`, and `AI_SERVICE_TOKEN`.
- `frontend/.env.example`: optional `VITE_API_URL`. Never place private
  credentials here.
- `ai-service/.env.example`: app settings, optional
  `KNOWLEDGE_BASE_MANIFEST`, `AI_SERVICE_TOKEN`, optional
  `KNOWLEDGE_DATABASE_URL` (asyncpg DSN for the `mediaguide_knowledge_reader`
  login role), and optional `KNOWLEDGE_DATABASE_SSL_CA` (path to a trusted CA
  certificate file for the knowledge database). HTTP loopback addresses
  (`localhost`, `127.0.0.1`, `[::1]`) skip TLS for local development only;
  all other hosts require a verified TLS connection. Do not disable TLS
  verification for a hosted database.

  `KNOWLEDGE_DATABASE_URL` must use the `mediaguide_knowledge_reader` role
  (a dedicated `NOLOGIN`-base, `NOBYPASSRLS` role with scoped read-only
  access to knowledge tables). Configure a separate server-only login as a
  member of that role. Do not use the Supabase `service_role` or any
  frontend credential for this connection. Apply the
  `20261104010000_knowledge_reader_role.sql` and
  `20261104020000_restrict_service_role_knowledge_access.sql` migrations
  before enabling persistent retrieval.

For production, set secrets through the platform's secret manager, not a
committed `.env` file. Use a unique random internal service token and rotate
it through a coordinated backend/AI-service change. Set `NODE_ENV=production`
for secure cookies. Set `DATABASE_SSL=true` and configure the trusted
`DATABASE_SSL_CA` as needed; never disable certificate verification for a
hosted database. The production database URL, Auth URL, AI-service URL, and
frontend origins must be reviewed before startup. Do not log full environment
values.

## Migration and rollback procedure

1. Back up the target database and verify that the backup is restorable in a
   separate, isolated test environment.
2. Review every pending SQL migration and confirm the intended Supabase
   project/reference before applying it.
3. Apply migrations in timestamp order in a staging environment.
4. Run the schema, RLS, account-deletion, and application tests against
   disposable staging accounts and synthetic data.
5. Promote only after a reviewer approves the schema diff and the recovery
   procedure is tested.
6. For rollback, stop writes if necessary, restore the verified backup to a
   controlled recovery environment, validate it, and switch traffic only
   after explicit approval. Do not assume every schema migration is safely
   reversible.

The local Supabase account-deletion integration is documented in the root
README. Never run it against a hosted or production Supabase URL; it rejects
non-loopback hosts.

## Release checks

Before any public release:

- Select and configure production hosting, private service networking, HTTPS,
  CORS/Origin allowlists, secure cookies, secrets, and monitoring.
- Implement and test API abuse protection/rate limits. No application-level
  rate limiter is currently configured.
- Apply and verify migrations on a non-production project; re-run ownership
  and deletion tests with disposable users.
- Complete backup retention, restore testing, and incident-response
  procedures.
- Populate the approved-source corpus only after verifying licensing,
  provenance, content, and qualified review requirements. The shipped
  corpus is empty and the AI service abstains by default.
- Obtain qualified clinical review before creating emergency rules or making
  clinical reliability claims. No deterministic emergency system is
  implemented.
- Add verified facility records and an update process. The facility endpoint
  currently returns unavailable because no verified provider/data is
  configured.
- Complete privacy/legal review for the intended jurisdiction, data
  processors, and retention behavior.
- Run backend and frontend tests, frontend lint/build, AI-service tests,
  staging integration tests, and dependency/secret scans.

There is no production deployment or rollback runbook validated for a live
environment. Deployment must remain blocked until the external data, hosting,
security, operational, and clinical requirements above are satisfied.
