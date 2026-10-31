# MediGuide AI

**Tagline:** Understand Your Health. Find Your Next Step.

## 1. Project Overview

MediGuide AI is a safety-focused mobile application designed to make general health information easier to understand and help users identify appropriate next steps.

The project aims to provide accessible, evidence-grounded health education, with an initial focus on users in Ethiopia.

## 2. Project Status

**Status:** Early development.

MediGuide AI is not clinically validated and is not a substitute for professional medical care.

## 3. Initial Technology Stack

- **Mobile:** React Native, Expo, TypeScript
- **Backend API:** Node.js, Express, TypeScript
- **AI service:** Python, FastAPI
- **Database:** PostgreSQL with pgvector
- **Testing:** Jest or Vitest, Pytest, API and mobile tests

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

## 7. Initial Repository Structure

- `mobile/` — mobile application
- `backend/` — application API
- `ai-service/` — AI and knowledge retrieval
- `database/` — database migrations and seed data
- `knowledge-base/` — approved source registry and ingestion workflow
- `docs/` — project documentation

## 8. Current Milestone

The repository includes an initial Express backend, PostgreSQL connection
configuration, a source-review foundation, and a FastAPI AI-service health
endpoint. AI answers, authentication, database migrations, and clinical
safeguards are not yet implemented.

### Backend development configuration

From the repository root, copy `backend/.env.example` to `backend/.env` and
provide a PostgreSQL connection URL in `DATABASE_URL` before using the database
pool. The pool verifies PostgreSQL TLS certificates by default. Set
`DATABASE_SSL_CA` to a trusted CA certificate file when your database uses a
private certificate authority. Set `DATABASE_SSL=false` only for local
development databases that do not support TLS. Never commit `.env` or put real
credentials in the example file.

Run the backend from its directory with `npm run dev`. Its `/health` endpoint
checks the API process only; live PostgreSQL connectivity is a separate
dependency check. It could not be verified in this environment because the
configured database presents a certificate chain that the environment does
not trust.