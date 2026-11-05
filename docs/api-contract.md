# MediGuide AI — API Contract

## 1. Purpose

This document defines the HTTP API between the MediGuide AI client application and the backend.

It describes planned and implemented endpoints, request and response formats, authentication requirements, and error behavior.

**Important:** An endpoint documented as planned is not necessarily implemented. The implementation status of each endpoint is identified below.

## 2. API Design Principles

- Use HTTPS in production.
- Use JSON for request and response bodies unless otherwise documented.
- Use consistent response and error formats.
- Validate all client-supplied data on the server.
- Authenticate and authorize access to private resources.
- Never trust a user identifier supplied by the client to establish ownership.
- Keep database credentials, AI-provider credentials, and internal service secrets server-side.
- Do not expose the AI service or database directly to mobile clients.
- Avoid including unnecessary personal health information in URLs, logs, or error messages.

## 3. Initial API Prefix

The public API prefix is:

`/api/v1`

The deployment hostname is configured separately for development and production.

The process health endpoint, `GET /health`, is outside this prefix.

## 4. Authentication

The authentication endpoints below are implemented by the Express backend and
delegate identity and password storage to Supabase Auth. Supabase Auth requests
use HTTPS; this does not use or bypass the PostgreSQL connection.

### POST /api/v1/auth/register

Purpose: Create a user account.

Request fields:

- `name`: required display name.
- `email`: required email address.
- `password`: 12 to 128 characters. Supabase applies its configured password
  policy as well.

Expected success: `202 Accepted`. The response is intentionally generic to
reduce account enumeration. The caller should direct the user to check their
email only when confirmation is enabled in Supabase.

The backend validates input and Supabase Auth stores credentials. The backend
does not store or log passwords.

### POST /api/v1/auth/login

Purpose: Authenticate an existing user.

Request fields:

- `email`
- `password`

Expected success: `200 OK`.

Expected success returns the minimal user object. Provider-issued access and
refresh tokens are set as `HttpOnly`, `SameSite=Lax` cookies scoped to
`/api/v1` for the access token and `/api/v1/auth` for the refresh token; they
are not returned in JSON or available to browser JavaScript. Cookies are marked
`Secure` in production.

### POST /api/v1/auth/refresh

The refresh token is read from the HttpOnly cookie.

Expected success: `200 OK` with the minimal user object and rotated HttpOnly
access and refresh cookies. The browser does not read or store either token.

### POST /api/v1/auth/logout

Purpose: End the current authenticated session.

Expected success: `204 No Content` when the session is successfully ended.

Authentication: Access cookie for browser clients, or
`Authorization: Bearer <access-token>` for non-browser clients.

The backend asks Supabase Auth to revoke only the current session. Clients
receive cleared session cookies after logout.

### GET /api/v1/auth/me

Purpose: Return the current authenticated user's basic account information.

Authentication: Required using the HttpOnly access cookie for browser clients,
or `Authorization: Bearer <access-token>` for non-browser clients.

Expected success: `200 OK`.

Return only the account fields needed by the application. Never return password hashes, authentication secrets, or internal security metadata.

### DELETE /api/v1/auth/account

Authentication: Required using the HttpOnly access cookie for browser clients,
or `Authorization: Bearer <access-token>` for non-browser clients.

Expected success: `204 No Content`.

The backend resolves the account from the verified bearer token, then uses its
server-only Supabase service-role key to delete that account. The caller cannot
choose another user ID. The Supabase Auth deletion cascades to the profile and conversations through
the database foreign keys after the migrations are applied. Verify this
cascade and any backup-retention behavior before production use.

Registration and login enforce server-side email and password bounds. Cookie
mutations enforce an allowed request Origin; cookie-authenticated mutations
require an Origin header. Provider errors are mapped to generic messages. The
Supabase URL must use HTTPS except for loopback-only local development. The
service-role key is required only for account deletion and must never be
exposed to the client. Deploy the frontend and API on the same site so the
`SameSite=Lax` cookies are included in browser requests.

The React frontend calls these routes with `credentials: "include"` and uses
`VITE_API_URL` to select the Express API origin. The sign-in, registration,
session restoration, logout, account deletion, and conversation-history UI is
implemented.

Authentication errors currently use `{ "status": "error", "code": "...",
"message": "..." }`. The API-wide standard error envelope remains future work.

## 5. Health Information and General Education

### A. Internal AI-service health-education route

#### POST /api/v1/health-education

**Implementation status: Express proxy and internal FastAPI foundation
implemented; no live deployment integration has been verified.**

Purpose: Return general educational source passages for a question when
relevant approved chunks are available.

The public Express route is `POST /api/v1/health-education`. It validates the
request and forwards it to the private FastAPI service. The FastAPI route is
not a browser API: it requires the shared `AI_SERVICE_TOKEN` in the
`X-Internal-Service-Token` header and should also be network-restricted behind
the Express backend. The backend never returns the shared token.

Request:

```json
{
  "question": "What is general information about high blood pressure?",
  "language": "en"
}
```

The current FastAPI implementation accepts English (`en`) only. An Amharic
interface preference must not be interpreted as evidence that Amharic medical
responses have been validated.

Expected success: `200 OK`.

Response:

```json
{
  "answer": "Educational information grounded in retrieved approved sources.",
  "language": "en",
  "citations": [
    {
      "sourceId": "approved-source-id",
      "title": "Verified source title",
      "publisher": "Verified publisher",
      "url": "https://example.org/verified-document",
      "section": "Relevant section"
    }
  ],
  "limitations": [
    "This is general health information, not a diagnosis."
  ],
  "requestId": "server-generated-request-id"
}
```

Answers are extractive: selected sentences are copied from retrieved chunks,
and citation metadata is carried from the corresponding source record. The
route refuses individual diagnosis and medication/dose recommendation
requests. When no relevant approved passage is available, it returns an
abstention with no citations. No approved production documents are currently
loaded, so the default runtime abstains. Example URLs and placeholder
citations above are schema illustrations only.

The Express proxy and FastAPI route both validate the question and English-only
language. The backend forwards a server-generated request ID in
`X-Request-ID`; the AI service echoes the validated ID in the response body
and response header. The backend validates that ID and the response/citation
shape before returning it.

The backend uses `AI_SERVICE_URL` and `AI_SERVICE_TOKEN` from its trusted
environment. It permits HTTPS service URLs; HTTP is allowed only for loopback
development addresses. Requests have an eight-second timeout, redirects are
rejected, and failures return generic 502/503/504 responses without exposing
the internal URL, token, or upstream error body. Configure the same privately
generated token as `AI_SERVICE_TOKEN` in both the backend and AI-service
environments. Do not put this token in frontend configuration.

The route remains an unverified integration against any live deployment.
Authentication/usage limits for health-question submissions and complete
service deployment/network controls remain outstanding.

The response must not imply that a diagnosis was established or that an emergency was ruled out.

#### B. Implemented general education endpoints

These endpoints provide read-only access to illustrative health education examples. They do not provide AI-generated medical answers, diagnosis, personalized treatment, or clinically approved guidance.

##### GET /api/v1/education

**Implementation status: Implemented and covered by automated backend tests.**

Purpose: Retrieve the available illustrative health education topics.

Authentication: No authentication is currently required by the implemented route.

Expected success: `200 OK`.

The response contains:

- `status`: response status.
- `message`: a description of the response.
- `disclaimer`: a notice explaining the limitations of the content.
- `topics`: an array of education topics.

Each topic contains:

- `id`: topic identifier.
- `title`: topic title.
- `summary`: short topic summary.
- `guidance`: illustrative educational content.
- `sourceStatus`: indicates the status of the content's source and review.

The current examples are hydration and hand hygiene. Their `sourceStatus` is `illustrative-example`. They have not been clinically reviewed or approved for production use.

##### GET /api/v1/education/:id

**Implementation status: Implemented and covered by automated backend tests.**

Purpose: Retrieve a single illustrative education topic by its identifier.

Example:

`GET /api/v1/education/hydration`

Expected success: `200 OK`.

If the requested topic does not exist, the endpoint returns `404 Not Found` with an error response.

#### Education endpoint limitations

These endpoints are not a clinically reviewed knowledge base. They do not establish that the supplied educational content is medically accurate, clinically validated, or suitable for production use.

Approved-source retrieval, verified clinical citations, clinical review, and safety evaluation remain separate requirements.

The current education endpoints use the response formats implemented by the backend. They do not yet follow the proposed standard error format described in Section 9.

## 6. Conversation History

**Implementation status: Implemented in Express and frontend.** The local
Supabase migrations and deletion cascade integration have been applied and
tested locally; hosted-project behavior has not been verified.

All conversation routes require a verified Supabase Auth user. Database
operations use the request-scoped Supabase client carrying that user's JWT;
they do not use the service-role key or direct privileged PostgreSQL queries.
RLS remains the final ownership enforcement layer. Browser cookie mutations
also require an allowed Origin.

### POST /api/v1/conversations

Purpose: Create an empty conversation for the authenticated user.

Authentication: Required.

Expected success: `201 Created` with the new conversation identifier and
timestamps. The server derives the owner from the verified identity; callers
cannot submit a user ID.

### GET /api/v1/conversations

Purpose: List the authenticated user's conversations, ordered by most recently
updated.

Authentication: Required.

Expected success: `200 OK`. RLS filters results to the caller's own account.
Pagination remains necessary before supporting large histories.

### GET /api/v1/conversations/:conversationId

Purpose: Retrieve a conversation and its permitted messages.

Authentication: Required.

Expected success: `200 OK` with messages ordered by timestamp. Missing and
foreign conversation identifiers both return `404 Not Found`.

### POST /api/v1/conversations/:conversationId/messages

Purpose: Ask a general health-education question in an owned conversation.

Request: `{ "question": "...", "language": "en" }` with an
`Idempotency-Key` header containing a UUID. The question is trimmed and limited
to 2,000 characters; only English is accepted by the current AI-service
contract. The request body must not exceed 10 KB; requests over this limit
return `413 Content Too Large`. Clients must reuse the same idempotency key when retrying the same
submission. Reusing the key with a different question returns `409`.

The backend verifies conversation ownership through the authenticated user's
request-scoped Supabase client before calling the private AI service. The
user's question is inserted with that same user-scoped client, and the
authenticated-user RLS policy allows only `role = 'user'` in a conversation
owned by `auth.uid()`. The validated assistant response is inserted by a
separate backend-only Supabase client using `SUPABASE_SERVICE_ROLE_KEY`.
Because that role bypasses RLS, the backend ownership check is required before
every assistant insertion. The service role has only `INSERT` privilege on
`messages`; it is never exposed to browser code or used for ordinary user
queries. Citation metadata and limitations are stored with assistant
messages.

On a first attempt, AI generation failure means neither message is inserted.
If assistant persistence fails after the user message is saved, the API
returns a safe storage error; retrying with the same idempotency key completes
the request without duplicating either message. A replay of an already
completed key returns the saved messages and the same request ID. An
abstention from the AI service is a valid answer and is stored with its
limitations.

Possible errors include `400` validation errors, `401` unauthenticated,
`404` conversation not found (including foreign IDs), `409` idempotency-key
reuse with a different question, safe `502`/`503`/`504` AI-service errors,
and `503` safe storage errors.

### DELETE /api/v1/conversations/:conversationId

Purpose: Delete an owned conversation and its messages.

Authentication: Required.

Expected success: `204 No Content`. Foreign and unknown identifiers both
return `404 Not Found`. The database foreign key cascades deletion to messages.

The two-user behavior test is opt-in and has not yet been executed against the
hosted database. It checks owner message insertion, cross-user message
insertion denial, direct assistant insertion denial, and cross-user reads.
Use dedicated non-production Supabase users and keep their
access tokens in local process environment variables only; never send tokens
through chat, source code, shell history, or logs. Conversation retention and
backup deletion schedules still require a product policy.

## 7. Healthcare Facilities

### GET /api/v1/facilities

**Implementation status: Provider contract, validation, public API route, and
frontend search are implemented. No real verified facility provider is
configured.**

Purpose: Discover healthcare facilities in supported areas, initially focused on Addis Ababa.

Authentication: Not required; the browser request omits account cookies.

Optional query parameters:

- `area`: search area, up to 120 characters.
- `type`: `clinic`, `health_center`, `hospital`, or `other`.
- `limit`: 1 to 50, default 20.
- `offset`: 0 to 10,000, default 0.

Expected success: `200 OK` with `items`, `total`, `limit`, and `offset`.
Facility records include `id`, `name`, `address`, `area`, `type`, `phone`,
`sourceUrl`, `mapUrl`, `verifiedAt`, and `verificationStatus`. Unknown contact
and map values remain `null`. A `verified` record must include an HTTPS source
URL and a valid verification date. Unverified or outdated records must be
explicitly identified.

The route currently returns `503 FACILITY_DATA_UNAVAILABLE`; it never returns
example facilities as real results. A data provider must implement the
backend's `FacilityDirectoryProvider` interface and return records with
traceable source evidence. The provider must implement area/type filtering and
offset/limit pagination; the backend validates record shape and HTTPS links.
The deployment owner must supply an authoritative Addis Ababa dataset, field
source URLs, facility categories, verification dates, an update/retirement
process, and a map-link source if map links are desired. Phone numbers,
opening hours, services, coordinates, and emergency capability must stay
unknown unless independently verified. Opening hours and coordinates are not
currently part of the API record.

Example response shape (illustrative only; not a listing):

```json
{
  "status": "ok",
  "items": [
    {
      "id": "provider-record-id",
      "name": "Name supported by source",
      "address": "Address supported by source",
      "area": "Addis Ababa",
      "type": "health_center",
      "phone": null,
      "sourceUrl": "https://authoritative.example/facilities",
      "mapUrl": null,
      "verifiedAt": "2026-10-31",
      "verificationStatus": "verified"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

This is a schema example, not a real facility listing.

## 8. Health and Readiness

### GET /health

**Implementation status: Implemented and covered by automated backend tests.**

Purpose: Check whether the backend process is responding.

Expected success: `200 OK`.

The current response contains:

- `status`: `"ok"`.
- `service`: `"MediGuide AI backend"`.
- `message`: `"Backend server is running."`.

This is a process health check only. It does not verify database connectivity, AI-service availability, or overall application readiness.

The endpoint must not expose secrets, database credentials, internal configuration, or detailed infrastructure information.

A separate readiness check may be added to verify required dependencies.

## 9. Standard Error Format

The following is the **proposed standard error format**. It is not yet implemented consistently across the API.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be accepted.",
    "requestId": "server-generated-request-id"
  }
}
```

The example request identifier is illustrative.

Expected HTTP status categories:

- `400 Bad Request`: invalid request format or parameters.
- `401 Unauthorized`: authentication is missing or invalid.
- `403 Forbidden`: the requester is not permitted to perform the operation.
- `404 Not Found`: the resource does not exist or must not be disclosed to the requester.
- `409 Conflict`: a documented resource conflict.
- `413 Content Too Large`: the request exceeds the permitted size.
- `429 Too Many Requests`: a request or usage limit has been exceeded.
- `500 Internal Server Error`: an unexpected server error.
- `502 Bad Gateway` or `503 Service Unavailable`: an upstream dependency is unavailable, as appropriate.

The currently implemented backend uses a simpler response structure for errors, including `status` and `message` fields. Standardizing errors across all endpoints remains future work.

Error messages must not reveal secrets, stack traces, private conversation content, or sensitive account details.

## 10. Validation and Limits

Before implementing the planned endpoints, define and enforce:

- Maximum question length and request-body size.
- Accepted language values.
- Authentication requirements.
- Rate limits and usage quotas.
- Pagination limits.
- Valid conversation identifiers.
- Permitted facility filters.
- Timeout and retry behavior for internal service calls.

All limits must be enforced by the server rather than relying only on client-side validation.

The current backend applies a JSON request-body size limit of `10kb`. This does not mean that every validation, authentication, or usage-limit requirement in this section has been implemented.

## 11. Backend-to-AI-Service Boundary

The Express backend is intended to call the FastAPI AI service through a protected internal interface.

The AI service must not be exposed as a public mobile API.

The internal contract should define:

- A validated question payload.
- A request identifier for tracing.
- Approved-source retrieval requirements.
- A structured answer and citation response.
- Explicit insufficient-evidence and refusal states.
- Timeouts and controlled error behavior.

Internal authentication and the precise request and response schemas must be defined before implementing this boundary.

## 12. API Versioning and Compatibility

The initial public API uses `/api/v1`.

Breaking changes should be documented and tested. The client application and backend must use compatible request and response schemas.

Do not silently change required fields or error formats without updating the contract and corresponding tests.

The implemented education routes use `/api/v1/education` and `/api/v1/education/:id`. The process health check uses `/health`.

The previous paths `/api/education` and `/api/health` are not supported by the current route configuration.

## 13. Contract Testing

Tests must verify, as applicable to each implemented endpoint:

- Request validation and response schemas.
- Authentication and authorization behavior.
- Conversation ownership enforcement.
- Citation metadata integrity.
- Facility data validation.
- Consistent error responses.
- Rate limits and request-size limits.
- Safe behavior when the AI service or database is unavailable.
- Compatibility between client and backend versions.

The current automated backend tests cover the process health endpoint, illustrative education endpoints, unknown routes, malformed JSON, rejected origins, and a security response header.

Passing these tests does not establish clinical safety, medical accuracy, or production readiness.

## 14. Current Status

Implemented API areas include authentication/account deletion,
owner-scoped conversation operations, the Express-to-private-AI-service proxy,
facility search validation with a fail-closed unavailable response, and
illustrative education examples. Unit tests cover principal request and
failure behavior; local database integration covers schema and account
deletion cascades. The facility endpoint has no configured provider or
verified records. The AI corpus is empty by default and abstains.

Still incomplete or unverified: hosted Supabase integration, production
rate-limiting, consistent error envelopes across every endpoint, verified
facility data, production health sources, clinical emergency safeguards,
backup restoration, monitoring, and deployment. Documentation does not
supersede testing or clinical review.