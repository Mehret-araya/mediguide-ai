# MediGuide AI — System Architecture

## 1. Purpose

This document describes the planned technical structure of MediGuide AI and how its main components communicate.

This architecture is a development plan, not evidence that the components have been implemented or validated.

## 2. Planned Technology Stack

### Web Frontend
- React
- Vite
- TypeScript

### Backend API
- Node.js
- Express
- TypeScript

### AI Service
- Python
- FastAPI
- Retrieval-augmented generation (RAG)

### Database
- PostgreSQL
- pgvector for vector similarity search

### Testing
- Jest or Vitest for TypeScript components
- Pytest for Python components
- API integration, mobile, security, and AI evaluation tests

## 3. Main Components

### 3.1 Web Frontend

Responsibilities:
- Provide the user interface.
- Collect user questions and display responses.
- Present retrieved-source citations.
- Support account access and user-controlled history.
- Communicate with the backend through authenticated HTTPS requests.

The web application must not contain private server credentials or direct
database access.

### 3.2 Backend API

Responsibilities:
- Handle authentication and authorization.
- Validate incoming requests.
- Apply request and usage limits.
- Manage conversations and user data.
- Provide healthcare facility information.
- Call the AI service through a controlled server-to-server interface.
- Apply access controls and return appropriate errors.

The backend is the public application entry point. The AI service and database
must not be exposed directly to clients.

### 3.3 AI Service

Responsibilities:
- Retrieve relevant information from the approved knowledge base.
- Generate explanations grounded in retrieved evidence.
- Associate factual claims with real source references.
- Identify insufficient evidence and unsupported requests.
- Apply safety rules and output validation.
- Return structured answers and citation metadata to the backend.

The language model must not be treated as an authoritative medical source.

### 3.4 Database

Responsibilities:
- Store user accounts and application data.
- Store conversation records according to the privacy policy.
- Store approved knowledge-base metadata and retrieval data.
- Support authorization, retention, deletion, and backup procedures.

Use access controls and data minimization to protect sensitive information.

## 4. Planned Request Flow

1. A user submits a health-information question in the web application.
2. The web application sends the request to the backend over HTTPS.
3. The backend authenticates the user, validates the request, and applies limits.
4. The backend calls the AI service through a protected internal interface.
5. The AI service retrieves relevant approved information from the knowledge base.
6. The AI service generates an evidence-grounded response and validates its citations and safety constraints.
7. The backend applies its response and access-control policies.
8. The web application displays the answer, its sources, and any relevant limitations.

If evidence is insufficient, the system should acknowledge that limitation rather than invent an answer.

## 5. Planned Data Flow

- User accounts and conversation records are managed by the backend.
- Approved health documents enter through a controlled ingestion process.
- Document metadata and searchable representations are stored in PostgreSQL and pgvector.
- The AI service retrieves only the approved content relevant to a request.
- Citation metadata must map to real, retrievable source records.

## 6. Emergency Guidance Boundary

Emergency guidance must not depend solely on language-model generation.

Any emergency rules will be isolated from ordinary answer generation and tested independently. They must remain clearly identified as a prototype until qualified clinical professionals have reviewed and approved the relevant guidance.

The application must not claim to rule out an emergency or guarantee that a user is safe.

## 7. Security Boundaries

- Browser clients communicate with the backend over HTTPS.
- The backend authenticates and authorizes requests.
- Supabase Auth manages account identities and password storage. The backend
  validates bearer tokens with Supabase Auth and keeps its service-role key
  server-side.
- The Express API calls the private FastAPI service over a configured
  server-to-server URL using a shared secret header; browser clients never
  receive this secret. Production requires HTTPS and network isolation.
- Database credentials remain server-side.
- Secrets are supplied through environment configuration and excluded from Git.
- Private conversation data must not be accessible to other users.
- Logs must avoid unnecessary sensitive health information.

## 8. Deployment Strategy

During development, components may run locally. Production deployment will be planned only after configuration, security, testing, privacy, monitoring, and backup requirements have been addressed.

Production secrets must never be committed to the repository.

## 9. Open Design Decisions

The following decisions require further documentation before production use or implementation:

- Production session deployment. The API issues HttpOnly cookies for browser
  clients and bearer access tokens for non-browser clients.
- Database schema and retention policy.
- Approved health-source selection and review process.
- Citation format and integrity validation.
- AI model and retrieval evaluation criteria.
- Clinical review process for emergency guidance.
- Hosting, monitoring, backups, and recovery.
- Healthcare facility data sources and verification cadence.

## 10. Current Status

The repository contains a React/Vite frontend, Express API, FastAPI health
education service, and Supabase/PostgreSQL migrations. Authentication,
conversation history, user-scoped RLS, account deletion, and a private
backend-to-AI-service route are implemented. The local Supabase schema and
disposable-account deletion cascade test pass; this is not evidence of hosted
project behavior. PostgreSQL TLS verification is enabled by default for
remote databases, with a CA path supported through `DATABASE_SSL_CA`.

The AI service uses approved-manifest-gated local text ingestion, BM25-style
lexical retrieval, and extractive answers. It has no production source corpus,
LLM, embedding provider, persistent pgvector retrieval adapter, or
clinically-reviewed deterministic emergency logic. The facility provider
interface fails closed because no verified dataset is configured. API
rate-limiting, production hosting, monitoring, backups/restoration, and
clinical review remain release blockers. No service is deployed or clinically
validated.