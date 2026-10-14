
# MediGuide AI — API Contract

## 1. Purpose

This document defines the planned HTTP API between the mobile application and the backend.

It describes endpoints, request and response formats, authentication requirements, and error behavior.

This is a proposed contract. Endpoints are not implemented merely because they are documented.

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

The proposed public API prefix is:

`/api/v1`

The exact deployment hostname will be configured separately for development and production.

## 4. Authentication

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

## 5. Health Information

### POST /api/v1/health-questions

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
- `en`: English
- `am`: Amharic interface preference

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

The example citation is illustrative only. Production responses must use real, approved source records that were retrieved and verified for the answer. The system must never return example URLs or placeholder citations as real medical evidence.

The backend must validate request size, question content, authentication, usage limits, and AI-service availability.

The response must not imply that a diagnosis was established or that an emergency was ruled out.

## 6. Conversation History

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

Purpose: Check whether the backend process is responding.

Expected success: `200 OK`.

The response must not expose secrets, database credentials, internal configuration, or detailed infrastructure information.

A successful process health check does not necessarily prove that the database, AI service, or complete application is ready.

A separate readiness check may be added to verify required dependencies.

## 9. Standard Error Format

Use a consistent error response.

Proposed format:

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
- `403 Forbidden`: the authenticated user is not permitted to perform the operation.
- `404 Not Found`: the resource does not exist or must not be disclosed to the requester.
- `409 Conflict`: a documented resource conflict.
- `413 Content Too Large`: the request exceeds permitted size.
- `429 Too Many Requests`: a request or usage limit has been exceeded.
- `500 Internal Server Error`: an unexpected server error.
- `502 Bad Gateway` or `503 Service Unavailable`: an upstream dependency is unavailable, as appropriate.

Error messages must not reveal secrets, stack traces, private conversation content, or sensitive account details.

## 10. Validation and Limits

Before implementation, define and enforce:
- Maximum question length and request-body size.
- Accepted language values.
- Authentication requirements.
- Rate limits and usage quotas.
- Pagination limits.
- Valid conversation identifiers.
- Permitted facility filters.
- Timeout and retry behavior for internal service calls.

All limits must be enforced by the server rather than relying only on mobile validation.

## 11. Backend-to-AI-Service Boundary

The Express backend will call the FastAPI AI service through a protected internal interface.

The AI service is not a public mobile API.

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

Breaking changes should be documented and tested. The mobile application and backend must use compatible request and response schemas.

Do not silently change required fields or error formats without updating the contract and corresponding tests.

## 13. Contract Testing

Tests must verify:
- Request validation and response schemas.
- Authentication and authorization behavior.
- Conversation ownership enforcement.
- Citation metadata integrity.
- Facility data validation.
- Consistent error responses.
- Rate limits and request-size limits.
- Safe behavior when the AI service or database is unavailable.
- Compatibility between mobile and backend versions.

## 14. Current Status

This document is a proposed API contract. The endpoints, schemas, authentication strategy, and service boundaries must be reviewed and implemented.

No endpoint should be described as operational until it has been implemented and tested.
