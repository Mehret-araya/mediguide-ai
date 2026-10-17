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

The authentication endpoints in this section are **planned and not yet implemented**.

### POST /api/v1/auth/register

Purpose: Create a user account.

Planned request fields:

- `name`: required display name.
- `email`: required email address.
- `password`: required password meeting the project's documented password policy.

Expected success: `201 Created`.

The backend must validate input, securely hash passwords, and avoid revealing sensitive account information.

### POST /api/v1/auth/login

Purpose: Authenticate an existing user.

Planned request fields:

- `email`
- `password`

Expected success: `200 OK`.

Authentication credentials must not be returned in response bodies or written to logs. The session strategy and mobile token-storage design must be documented before implementation.

### POST /api/v1/auth/logout

Purpose: End the current authenticated session.

Expected success: `200 OK` when the session is successfully ended.

The implementation must invalidate or expire the relevant session or token according to the selected authentication strategy.

### GET /api/v1/auth/me

Purpose: Return the current authenticated user's basic account information.

Authentication: Required.

Expected success: `200 OK`.

Return only the account fields needed by the application. Never return password hashes, authentication secrets, or internal security metadata.

## 5. Health Information and General Education

### A. Planned health-question endpoint

#### POST /api/v1/health-questions

**Implementation status: Planned; not yet implemented.**

Purpose: Submit a question for general health education.

Authentication: Required in the initial design.

Proposed request:

```json
{
  "question": "What is general information about high blood pressure?",
  "language": "en"
}
```

Supported initial language values:

- `en`: English.
- `am`: Amharic interface preference.

For version 1, AI-generated answers are planned to be in English. An Amharic interface preference must not be interpreted as evidence that Amharic medical responses have been validated.

Expected success: `200 OK`.

Proposed response:

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

The response above is illustrative. Production responses must use real, approved source records retrieved and verified for the answer. Example URLs and placeholder citations must never be presented as real medical evidence.

Before implementation, the backend must validate request size, question content, authentication, usage limits, and AI-service availability.

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

The conversation-history endpoints in this section are **planned and not yet implemented**.

### GET /api/v1/conversations

Purpose: List the authenticated user's conversations.

Authentication: Required.

Expected success: `200 OK`.

Return only conversations owned by the authenticated user. Add pagination before supporting potentially large histories.

### GET /api/v1/conversations/:conversationId

Purpose: Retrieve a conversation and its permitted messages.

Authentication: Required.

Expected success: `200 OK`.

The server must verify ownership or other explicitly authorized access before returning any content.

### DELETE /api/v1/conversations/:conversationId

Purpose: Delete a conversation according to the documented retention policy.

Authentication: Required.

Expected success: `200 OK` or `204 No Content`, consistently selected during implementation.

The server must verify ownership. Deletion behavior for backups, logs, and related records must match the published retention policy.

Conversation history will be optional until its storage, retention, and deletion behavior are implemented and tested.

## 7. Healthcare Facilities

### GET /api/v1/facilities

**Implementation status: Planned; not yet implemented.**

Purpose: Discover healthcare facilities in supported areas, initially focused on Addis Ababa.

Authentication: The final choice depends on whether facility discovery is public or account-restricted.

Proposed optional query parameters:

- `area`: supported neighborhood or area.
- `type`: supported facility category.
- `page`: pagination page.
- `limit`: maximum permitted results per page.

Expected success: `200 OK`.

Proposed response:

```json
{
  "items": [
    {
      "id": "facility-record-id",
      "name": "Verified facility name",
      "address": "Verified address",
      "phone": null,
      "openingHours": null,
      "sourceUrl": "https://example.org/official-source",
      "verifiedAt": null
    }
  ],
  "page": 1,
  "limit": 20
}
```

This is a schema example, not a real facility listing. Real responses must use verified facility records. Unknown phone numbers, opening hours, and verification dates must remain unknown rather than being invented.

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

This document describes both the current implementation and planned API behavior.

Currently implemented and tested:

- `GET /health`
- `GET /api/v1/education`
- `GET /api/v1/education/:id`

The education endpoints return illustrative examples only. They are not clinically reviewed or approved for production use.

Still planned or requiring further implementation and validation:

- Authentication and account management.
- AI-powered health questions and approved-source citations.
- Conversation history, ownership enforcement, and deletion.
- Healthcare facility discovery using verified data.
- Consistent standard error responses across the API.
- The protected backend-to-AI-service interface.
- Additional validation, rate limiting, security checks, and release evaluations.

An endpoint must not be described as operational merely because it appears in this document. Implementation, automated tests, and any applicable security, privacy, and clinical review requirements must be evaluated separately.