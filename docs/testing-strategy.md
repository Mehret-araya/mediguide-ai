
# MediGuide AI — Testing Strategy

## 1. Purpose

This document defines the planned testing approach for MediGuide AI.

Testing must assess software correctness, security, privacy, evidence quality, citation integrity, and AI behavior.

Passing software tests alone does not establish clinical safety or effectiveness.

This document describes planned tests. It does not mean they have been implemented or passed.

## 2. Testing Principles

- Test components independently before testing the complete system.
- Automate repeatable tests where practical.
- Test expected behavior and failure conditions.
- Keep test data separate from real user data.
- Never use real personal health information in test fixtures unless explicitly authorized and appropriately protected.
- Record failures and corrective actions.
- Do not claim a feature is tested until the relevant tests have actually run.
- Require appropriate clinical review for safety-critical medical content.

## 3. Unit Tests

Unit tests will check individual functions and modules.

### Backend API

Test:
- Request validation.
- Authentication and authorization helpers.
- Rate-limit behavior.
- Error handling.
- Conversation ownership checks.
- Facility data validation.
- Input size and permitted-value limits.

### AI Service

Test:
- Approved-source filtering.
- Retrieval metadata handling.
- Citation identifier validation.
- Insufficient-evidence behavior.
- Output schema validation.
- Safety-policy enforcement.
- Rejection of malformed model responses.

### Emergency Rules

If emergency rules are implemented, test them independently from ordinary AI generation.

Tests must cover expected triggering conditions, boundary cases, malformed input, and failures.

These tests do not replace review and approval by qualified clinical professionals.

## 4. API Integration Tests

Test communication between the mobile app, backend, AI service, and database.

Verify:
- Valid requests produce responses in the documented format.
- Invalid requests receive safe error responses.
- Unauthorized requests cannot access protected endpoints.
- One user cannot read or modify another user's private conversations.
- Backend failures do not expose secrets or private data.
- AI-service timeouts and unavailable services are handled safely.
- Rate limits behave as configured.
- Database errors do not produce misleading success responses.

## 5. Knowledge Retrieval and Citation Tests

Evaluate:
- Whether relevant approved passages are retrieved.
- Whether unapproved documents are excluded.
- Whether each citation refers to an existing source record.
- Whether cited passages support their associated claims.
- Whether irrelevant sources are rejected.
- Whether outdated documents are handled according to policy.
- Whether insufficient evidence causes an appropriate abstention.
- Whether conflicting sources are communicated honestly.

Maintain a documented evaluation dataset with representative questions, expected evidence, and expected system behavior.

Do not fabricate evaluation results or claim citation accuracy without measured evidence.

## 6. AI Safety Evaluation

Test representative and adversarial inputs, including:

- Requests for definitive diagnosis.
- Personalized medication and dosage decisions.
- Questions involving potentially urgent symptoms.
- Requests outside the supported scope.
- Questions with insufficient or conflicting evidence.
- Attempts to obtain fabricated citations.
- Prompt injection in user messages.
- Prompt injection inside retrieved documents.
- Requests to reveal secrets or private records.
- Ambiguous wording and misspellings.

Record the input category, expected behavior, observed behavior, pass or fail result, and any corrective action.

Emergency-related test cases require appropriate clinical review of expected behavior.

## 7. Authentication, Authorization, and Privacy Tests

Verify:
- Passwords are never stored in plaintext.
- Protected endpoints reject unauthenticated requests.
- Private records are accessible only to authorized users.
- Changing a conversation identifier cannot bypass ownership checks.
- Authentication tokens and secrets are not exposed in logs or error responses.
- Conversation deletion behaves according to the documented retention policy.
- User-facing errors do not disclose private information.
- Sensitive health questions are not unnecessarily retained in logs.

## 8. Mobile Application Tests

Test:
- Navigation and basic screen behavior.
- English and Amharic interface switching.
- Form validation and accessible labels.
- Loading, empty, error, and offline states.
- Display of answers and verified citations.
- Sign-in and sign-out behavior.
- Conversation history access controls.
- User-controlled deletion.
- Network interruptions and backend unavailability.

Check usability with representative devices and screen sizes before release.

## 9. Facility Data Tests

Verify:
- Each displayed facility maps to an identifiable source record.
- Names and addresses match the recorded source.
- Contact information and opening hours are not invented.
- Verification dates are displayed when available.
- Missing or outdated information is communicated clearly.
- Retired or unverified facilities are not presented as confirmed current listings.

Facility data should not be described as current unless the relevant verification supports that claim.

## 10. Performance and Reliability Tests

Evaluate:
- API response times under representative workloads.
- AI-service timeouts and recovery.
- Database connection failures.
- Rate limiting under repeated requests.
- Resource use during retrieval and generation.
- Graceful handling of unavailable external services.

Set performance targets after measuring the initial implementation and understanding deployment constraints.

## 11. Dependency and Configuration Security

Before production release:
- Review dependency vulnerabilities.
- Check for accidentally committed secrets.
- Verify that production configuration does not enable development-only behavior.
- Confirm that database and AI-service access is appropriately restricted.
- Review error handling, network security, and logging configuration.
- Verify backup and restoration procedures.

## 12. Test Environments and Data

Use separate development and test configurations.

Use synthetic test accounts and fictional conversations.

Do not copy real user health conversations into test datasets without a documented, lawful, and appropriately protected process.

Keep test credentials and production secrets separate.

## 13. Continuous Integration

Where practical, configure automated checks for:
- TypeScript type checking.
- Linting.
- Unit tests.
- API integration tests.
- Python tests.
- Build success.
- Dependency and secret checks.

A successful automated workflow is evidence only for the checks that actually ran and passed.

## 14. Defect Tracking and Release Gates

For each significant failure, record:
- Description and severity.
- Steps to reproduce.
- Expected and observed behavior.
- Corrective action.
- Regression test.
- Verification result.

Do not release publicly while critical security, privacy, or safety issues remain unresolved.

Safety-critical content requires appropriate clinical review before it is presented as clinically approved.

## 15. Current Status

This document defines the planned testing strategy.

Test suites, evaluation datasets, security checks, and clinical review processes must be implemented and completed before their results can be claimed.
