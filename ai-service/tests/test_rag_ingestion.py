import hashlib
from dataclasses import replace

import pytest
from pydantic import ValidationError

from app.rag.chunking import validate_approved_chunk
from app.rag.ingestion import ingest_document
from app.rag.registry import SourceNotApprovedError, require_approved_source

_REVIEW_DATE = "2026-10-17"


def source_record(**overrides: object) -> dict[str, object]:
    source: dict[str, object] = {
        "id": "test-source-001",
        "title": "Test health document",
        "publisher": "Test publisher",
        "license": "Synthetic test fixture license",
        "url": "https://example.org/test-document",
        "accessedDate": "2026-10-17",
        "language": "en",
        "topics": ["general-health"],
        "reviewStatus": "approved",
        "reviewer": "Qualified reviewer",
        "reviewedAt": _REVIEW_DATE,
        "limitations": ["Synthetic fixture; not a medical source."],
    }
    source.update(overrides)
    return source


def approval_audit() -> list[dict[str, str]]:
    return [
        {
            "sourceId": "test-source-001",
            "fromStatus": "pending_review",
            "toStatus": "approved",
            "reviewer": "Qualified reviewer",
            "reviewedAt": _REVIEW_DATE,
            "reason": "Synthetic test approval only.",
        }
    ]


def test_ingestion_requires_approved_source_and_audit_event() -> None:
    record = source_record(reviewStatus="pending_review")
    with pytest.raises(SourceNotApprovedError, match="not approved"):
        ingest_document("A test passage.", record, approval_audit())

    with pytest.raises(SourceNotApprovedError, match="audit evidence"):
        ingest_document("A test passage.", source_record(), [])


def test_ingestion_preserves_registry_metadata_and_section_citations() -> None:
    chunks = ingest_document(
        "# Overview\nFirst reviewed passage.\n\n## Limitations\n"
        "A separate passage with its own heading.",
        source_record(),
        approval_audit(),
    )

    assert len(chunks) == 2
    assert chunks[0].text == "First reviewed passage."
    assert chunks[0].citation.source_id == "test-source-001"
    assert chunks[0].citation.title == "Test health document"
    assert chunks[0].citation.publisher == "Test publisher"
    assert chunks[0].citation.url == "https://example.org/test-document"
    assert chunks[0].citation.section == "Overview"
    assert chunks[0].source_metadata.review_status.value == "approved"
    assert chunks[0].source_metadata.license == "Synthetic test fixture license"
    assert chunks[0].source_metadata.limitations == [
        "Synthetic fixture; not a medical source."
    ]
    assert chunks[1].citation.section == "Limitations"


def test_ingestion_rejects_checksum_mismatch() -> None:
    record = source_record(checksum=hashlib.sha256(b"approved content").hexdigest())
    with pytest.raises(SourceNotApprovedError, match="checksum"):
        ingest_document("different content", record, approval_audit())


def test_ingestion_rejects_http_source_urls() -> None:
    with pytest.raises(ValidationError, match="must use HTTPS"):
        require_approved_source(
            source_record(url="http://example.org/test-document"),
            approval_audit(),
        )


def test_ingestion_requires_source_license_metadata() -> None:
    with pytest.raises(ValidationError, match="license"):
        require_approved_source(
            source_record(license=" "),
            approval_audit(),
        )


def test_ingestion_chunks_long_documents_with_bounded_size() -> None:
    long_text = " ".join(f"word{index}" for index in range(500))
    chunks = ingest_document(long_text, source_record(), approval_audit())

    assert len(chunks) > 1
    assert all(len(chunk.text) <= 1200 for chunk in chunks)
    assert all(chunk.citation.section == "Document" for chunk in chunks)


def test_ingestion_rejects_empty_document_text() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        ingest_document("  ", source_record(), approval_audit())


def test_chunk_citation_cannot_diverge_from_approved_registry_metadata() -> None:
    chunk = ingest_document(
        "A test passage.",
        source_record(),
        approval_audit(),
    )[0]
    mismatched = replace(
        chunk,
        citation=replace(chunk.citation, title="Unverified title"),
    )

    with pytest.raises(ValueError, match="does not match its approved source"):
        validate_approved_chunk(mismatched)
