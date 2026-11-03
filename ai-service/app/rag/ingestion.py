import hashlib
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

from app.rag.chunking import DocumentChunk, chunk_document
from app.rag.registry import (
    HealthSourceRecord,
    ReviewAuditEvent,
    SourceNotApprovedError,
    require_approved_source,
)

_MAX_DOCUMENT_CHARS = 1_000_000


def ingest_document(
    text: str,
    source: HealthSourceRecord | dict[str, Any],
    audit_history: Sequence[ReviewAuditEvent | dict[str, Any]],
) -> list[DocumentChunk]:
    """Chunk operator-supplied text only after registry approval is verified."""
    approved_source, approval = require_approved_source(source, audit_history)
    if not text.strip():
        raise ValueError("Document text must not be empty.")
    if len(text) > _MAX_DOCUMENT_CHARS:
        raise ValueError("Document exceeds the ingestion size limit.")

    checksum = hashlib.sha256(text.encode("utf-8")).hexdigest()
    expected_checksum = (approved_source.checksum or "").removeprefix("sha256:")
    if expected_checksum and expected_checksum.lower() != checksum:
        raise SourceNotApprovedError(
            "Document checksum does not match the approved source record."
        )

    document_checksum = approved_source.checksum or f"sha256:{checksum}"
    return [
        replace(chunk, document_checksum=document_checksum)
        for chunk in chunk_document(text, approved_source, approval)
    ]
