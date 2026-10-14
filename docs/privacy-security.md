# MediGuide AI — Privacy and Security Plan

## 1. Purpose

This document defines the initial privacy and security requirements for MediGuide AI.

Health-related questions can contain sensitive personal information. The application must minimize collection, restrict access, protect stored data, and communicate its limitations clearly.

This document describes planned safeguards. It does not mean those safeguards have already been implemented or independently verified.

## 2. Data Minimization

- Collect only information necessary for a defined feature.
- Do not request a user's full medical history by default.
- Do not collect precise location unless a feature genuinely requires it and the user has an appropriate choice.
- Explain why requested personal information is needed.
- Avoid retaining unnecessary request data in logs and analytics.

## 3. Account Security

- Use an established, well-reviewed password-hashing algorithm.
- Never store plaintext passwords.
- Validate credentials and protect authentication endpoints against abuse.
- Enforce authorization on the server for every private resource.
- Do not rely on hiding interface elements as an access-control mechanism.
- Use secure session or token handling appropriate to the mobile platform.

## 4. Conversation Privacy

- Users must only be able to access conversations they are authorized to view.
- Prevent one user's identifiers from being used to retrieve another user's private records.
- Avoid placing health questions, passwords, tokens, or personal information in URLs.
- Do not expose private conversation content in error messages.
- Document what conversation history is stored and why.

## 5. Data Retention and Deletion

- Define retention periods before production release.
- Provide a documented way to delete conversation history.
- Define what account deletion means for related records, backups, and any third-party processors.
- Do not claim that all copies are immediately erased unless the deletion process supports that claim.
- Test deletion and authorization behavior.

## 6. Secrets Management

- Never commit API keys, database passwords, signing secrets, or access tokens.
- Keep server credentials out of mobile application code.
- Use environment configuration during development and a suitable secret-management mechanism in production.
- Use `.env.example` only for placeholder values and variable names, never real credentials.
- Rotate exposed credentials promptly.

## 7. Network and API Security

- Use HTTPS for production communication.
- Validate input types, sizes, and permitted values.
- Apply authentication, authorization, and rate limits where appropriate.
- Configure CORS deliberately for applicable web interfaces.
- Use safe error responses that do not reveal internal implementation details.
- Keep the AI service and database inaccessible directly from public mobile clients.

## 8. AI Service and Third-Party Data

- Document what information is sent to the AI model and other external services.
- Minimize personal information sent to external providers.
- Review provider data-retention and training policies before use.
- Do not send user health questions to a provider without an appropriate privacy assessment.
- Treat retrieved documents and user-provided content as untrusted input.
- Do not allow instructions embedded in retrieved content to override system safety rules.

## 9. Logging and Monitoring

- Log operational events needed to maintain reliability and investigate security problems.
- Avoid logging complete health conversations by default.
- Never log passwords, authentication tokens, or API secrets.
- Restrict access to logs and define a retention policy.
- Review production errors for accidental exposure of sensitive information.

## 10. Database Protection

- Use least-privilege database accounts.
- Enforce appropriate access controls for private records.
- Keep database credentials server-side.
- Encrypt network connections to the database where supported.
- Document backup protection, restoration testing, and access permissions.
- Do not assume that vector embeddings are automatically anonymous or non-sensitive.

## 11. Security Testing

Before production release, test:

- Authentication and authorization failures.
- Access to another user's conversation or account data.
- Input validation and request limits.
- Secret exposure in source code, logs, and application bundles.
- Account and conversation deletion.
- AI prompt injection and unsafe requests.
- Dependency vulnerabilities and deployment configuration.

## 12. Incident Response

Document how the project will identify, investigate, contain, and recover from a security incident.

Define how credentials are rotated, affected systems are restored, and applicable notification obligations are evaluated.

## 13. Release Gate

Do not release publicly until the implemented privacy controls, access restrictions, secret handling, deletion behavior, security tests, and incident-response process have been reviewed.

Legal and regulatory obligations must be assessed for the intended deployment locations and data processing activities.

## 14. Current Status

This is an initial security plan. The safeguards must be implemented, tested, and reviewed before they can be described as effective.