
# MediGuide AI — Knowledge Base and Citation Policy

## 1. Purpose

This policy defines how MediGuide AI will select, review, store, retrieve, and cite health-information sources.

The goal is to provide understandable health education grounded in reliable evidence rather than unsupported AI-generated claims.

This policy describes planned procedures. It does not mean that any source has already been reviewed or approved.

## 2. Source Selection Principles

Prefer sources from recognized public health authorities, government health agencies, established medical institutions, and reputable evidence-based health organizations.

Potential sources for review include:

- World Health Organization (WHO)
- Ethiopia Ministry of Health and relevant official public health agencies
- National health authorities in other jurisdictions when relevant
- Established medical institutions with documented editorial and review processes
- Peer-reviewed research and systematic reviews when appropriate

A source must be assessed for relevance, authority, publication date, evidence quality, and applicability to the intended audience before approval.

The appearance of a source on this list does not mean its individual documents have already been approved.

## 3. Source Approval Process

Before a document enters the approved knowledge base:

1. Identify the publisher and original source.
2. Record the document title and original URL.
3. Record its publication date and last review date when available.
4. Assess the source's authority and relevance to the intended health topic.
5. Check whether the content is current enough for its intended use.
6. Identify limitations, conflicting recommendations, and jurisdiction-specific guidance.
7. Record the approval status and reviewer.
8. Exclude documents that cannot be verified or do not meet the project's quality requirements.

High-risk clinical content requires appropriate qualified review before it is used to support safety-critical guidance.

## 4. Source Registry

Each source record should include, where applicable:

- Unique source identifier
- Document title
- Publisher or organization
- Original URL
- Publication date
- Last updated date
- Date accessed
- Language
- Topics covered
- Review status
- Reviewer and review date
- Notes about limitations
- Version or content checksum when practical

Use explicit approval statuses such as:

- `pending_review`
- `approved`
- `rejected`
- `needs_update`
- `retired`

Only documents with the appropriate approval status may be retrieved for user-facing answers.

## 5. Document Ingestion

The ingestion process must preserve source identity and enough document structure to support accurate citations.

Planned steps:

1. Retrieve a document from its verified original source.
2. Check that the document is accessible and matches its recorded metadata.
3. Extract text while preserving headings and relevant page or section information.
4. Split the text into manageable retrieval passages.
5. Associate every passage with its source identifier and location.
6. Store approved passages and their retrieval metadata.
7. Generate embeddings for semantic search when configured.
8. Test retrieval results before enabling the source for user-facing responses.

Do not treat successful text extraction or embedding generation as proof that a document is medically accurate.

## 6. Citation Integrity

Every displayed citation must refer to a real source that was retrieved for the answer.

The application must:

- Use source identifiers from the approved source registry.
- Display the actual source title and publisher.
- Provide a verified original URL when available.
- Include a page, heading, or section reference when available.
- Ensure that the cited passage supports the associated claim.
- Avoid presenting retrieved but irrelevant sources as evidence.
- Avoid fabricating titles, publishers, links, quotations, or publication dates.

If the system cannot verify a citation or determine that the source supports a claim, it must not present that citation as evidence.

## 7. Retrieval and Answer Generation

For evidence-grounded health education:

1. Retrieve relevant passages from approved documents.
2. Check that the passages address the user's question.
3. Provide the language model only with the context needed for the task.
4. Require the model to ground factual claims in the retrieved context.
5. Validate the source identifiers and citation metadata.
6. Check for unsupported claims and contradictions.
7. Return an appropriate limitation or abstain when the evidence is insufficient.

The language model's internal knowledge must not be treated as a substitute for verified retrieved evidence.

## 8. Conflicting or Insufficient Evidence

When sources disagree, the system must not silently combine conflicting recommendations into a single authoritative answer.

It should consider source authority, date, intended population, jurisdiction, and the nature of the evidence.

If the conflict cannot be resolved reliably, the answer should acknowledge the uncertainty and direct the user toward an appropriate qualified healthcare professional or authoritative source.

If sufficient evidence is unavailable, the system must say so rather than invent an answer.

## 9. Source Maintenance

Approved sources require periodic review.

The project should:

- Check whether original URLs remain accessible.
- Identify updated or withdrawn documents.
- Review content whose guidance may have changed.
- Mark outdated material as `needs_update` or `retired`.
- Record changes to approval status.
- Re-test retrieval and citation behavior after material updates.

A source that was approved previously must not be assumed to remain current indefinitely.

## 10. Security and Untrusted Content

Retrieved documents and user-provided text must be treated as data, not as instructions that can override the application's safety rules.

The ingestion process must not execute code or follow embedded instructions found in source documents.

External content must not be allowed to alter system instructions, reveal secrets, bypass access controls, or introduce unapproved sources into the knowledge base.

## 11. Evaluation Requirements

Before enabling the knowledge base for user-facing answers, test:

- Whether relevant approved passages are retrieved.
- Whether citations map to real source records.
- Whether cited passages support the associated claims.
- Whether irrelevant sources are excluded.
- Whether the system acknowledges insufficient evidence.
- Whether outdated or conflicting information is handled appropriately.
- Whether malicious instructions in retrieved content are ignored.

Test results must be recorded. Do not claim that retrieval or citation accuracy has been validated until suitable evaluations have been completed.

## 12. Current Status

This policy is a development plan. No source should be considered approved merely because this document exists.

The source registry, review workflow, ingestion process, citation validation, and evaluation tests must be implemented before the project claims to provide verified, evidence-grounded answers.
