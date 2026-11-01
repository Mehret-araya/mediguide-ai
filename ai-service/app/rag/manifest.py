import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from app.rag.chunking import DocumentChunk
from app.rag.ingestion import ingest_document
from app.rag.registry import (
    HealthSourceRecord,
    ReviewAuditEvent,
    require_approved_source,
)

_MAX_MANIFEST_BYTES = 2_000_000
_MAX_SOURCE_DOCUMENT_BYTES = 4_000_000


class ManifestEntry(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    source: HealthSourceRecord
    audit_history: list[ReviewAuditEvent] = Field(alias="auditHistory")
    document_path: str = Field(alias="documentPath", min_length=1)


def load_approved_corpus(
    manifest_path: Path | None,
) -> list[DocumentChunk]:
    """Load verified, operator-supplied text documents from a local manifest."""
    if manifest_path is None:
        return []

    manifest = manifest_path.expanduser().resolve(strict=True)
    if not manifest.is_file():
        raise ValueError("Knowledge base manifest must be a regular file.")
    if manifest.stat().st_size > _MAX_MANIFEST_BYTES:
        raise ValueError("Knowledge base manifest exceeds the size limit.")

    try:
        raw_entries: Any = json.loads(manifest.read_text(encoding="utf-8"))
        entries = TypeAdapter(list[ManifestEntry]).validate_python(raw_entries)
    except (json.JSONDecodeError, UnicodeDecodeError, ValidationError) as error:
        raise ValueError("Knowledge base manifest is invalid.") from error

    root = manifest.parent.resolve()
    seen_source_ids: set[str] = set()
    chunks: list[DocumentChunk] = []

    for entry in entries:
        source, _approval = require_approved_source(
            entry.source,
            entry.audit_history,
        )
        if source.id in seen_source_ids:
            raise ValueError("Knowledge base manifest contains duplicate source IDs.")
        seen_source_ids.add(source.id)

        relative_path = Path(entry.document_path)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError("Knowledge base document paths must stay under the manifest directory.")
        document_path = (root / relative_path).resolve(strict=True)
        if not document_path.is_relative_to(root):
            raise ValueError("Knowledge base document paths must stay under the manifest directory.")
        if not document_path.is_file() or document_path.suffix.lower() not in {
            ".md",
            ".txt",
        }:
            raise ValueError("Knowledge base documents must be regular .md or .txt files.")
        if document_path.stat().st_size > _MAX_SOURCE_DOCUMENT_BYTES:
            raise ValueError("Knowledge base document exceeds the size limit.")

        document_text = document_path.read_text(encoding="utf-8")
        chunks.extend(
            ingest_document(
                document_text,
                source,
                entry.audit_history,
            )
        )

    return chunks
