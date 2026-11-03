import hashlib
import re
from dataclasses import dataclass

from app.rag.registry import (
    HealthSourceRecord,
    ReviewAuditEvent,
    require_approved_source,
)

_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
_MAX_CHUNK_CHARS = 1200
_OVERLAP_CHARS = 160


@dataclass(frozen=True)
class SourceCitation:
    source_id: str
    title: str
    publisher: str
    url: str
    section: str


@dataclass(frozen=True)
class DocumentChunk:
    chunk_id: str
    text: str
    citation: SourceCitation
    source_metadata: HealthSourceRecord
    approval_event: ReviewAuditEvent
    chunk_index: int = 0
    document_checksum: str | None = None


def validate_approved_chunk(chunk: DocumentChunk) -> None:
    source, _approval = require_approved_source(
        chunk.source_metadata,
        [chunk.approval_event],
    )
    citation = chunk.citation
    if (
        citation.source_id != source.id
        or citation.title != source.title
        or citation.publisher != source.publisher
        or citation.url != str(source.url)
    ):
        raise ValueError(
            "Chunk citation metadata does not match its approved source."
        )


def _split_long_paragraph(text: str, max_chars: int) -> list[str]:
    segments: list[str] = []
    remaining = text.strip()

    while len(remaining) > max_chars:
        split_at = remaining.rfind(" ", 0, max_chars + 1)
        if split_at <= 0:
            split_at = max_chars
        segments.append(remaining[:split_at].strip())
        remaining = remaining[max(0, split_at - _OVERLAP_CHARS) :].strip()

    if remaining:
        segments.append(remaining)
    return segments


def chunk_document(
    text: str,
    source: HealthSourceRecord,
    approval_event: ReviewAuditEvent,
    *,
    max_chars: int = _MAX_CHUNK_CHARS,
) -> list[DocumentChunk]:
    if max_chars <= _OVERLAP_CHARS:
        raise ValueError("Chunk size must be larger than the overlap.")

    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        raise ValueError("Document text must not be empty.")

    sections: list[tuple[str, list[str]]] = []
    current_heading = "Document"
    current_paragraphs: list[str] = []

    def save_section() -> None:
        if current_paragraphs:
            sections.append((current_heading, current_paragraphs.copy()))
            current_paragraphs.clear()

    for line in normalized.splitlines():
        heading = _HEADING.match(line)
        if heading:
            save_section()
            current_heading = heading.group(1).strip()
        elif line.strip():
            current_paragraphs.append(line.strip())
        elif current_paragraphs and current_paragraphs[-1] != "":
            current_paragraphs.append("")
    save_section()

    chunks: list[DocumentChunk] = []
    for section, paragraphs in sections:
        section_text = "\n".join(paragraphs).strip()
        if not section_text:
            continue

        parts: list[str] = []
        current = ""
        for paragraph in section_text.split("\n\n"):
            if len(paragraph) > max_chars:
                if current:
                    parts.append(current)
                    current = ""
                parts.extend(_split_long_paragraph(paragraph, max_chars))
                continue

            candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
            if len(candidate) > max_chars and current:
                parts.append(current)
                overlap = current[-_OVERLAP_CHARS:].strip()
                if len(overlap) + 2 + len(paragraph) <= max_chars:
                    current = f"{overlap}\n\n{paragraph}".strip()
                else:
                    current = paragraph
            else:
                current = candidate
        if current:
            parts.append(current)

        for text_part in parts:
            index = len(chunks)
            chunk_id = hashlib.sha256(
                f"{source.id}\0{index}\0{text_part}".encode("utf-8")
            ).hexdigest()
            chunks.append(
                DocumentChunk(
                    chunk_id=chunk_id,
                    text=text_part,
                    citation=SourceCitation(
                        source_id=source.id,
                        title=source.title,
                        publisher=source.publisher,
                        url=str(source.url),
                        section=section,
                    ),
                    source_metadata=source,
                    approval_event=approval_event,
                    chunk_index=index,
                )
            )
    return chunks
