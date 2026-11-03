import json
from pathlib import Path

import pytest

from app.rag.manifest import load_approved_corpus
from app.rag.registry import SourceNotApprovedError


def manifest_entry(
    *,
    document_path: str = "documents/source.md",
    review_status: str = "approved",
) -> dict[str, object]:
    return {
        "source": {
            "id": "test-manifest-source",
            "title": "Synthetic manifest fixture",
            "publisher": "Test publisher",
            "license": "Synthetic test fixture license",
            "url": "https://example.org/manifest-fixture",
            "accessedDate": "2026-10-17",
            "language": "en",
            "topics": ["test"],
            "reviewStatus": review_status,
            "reviewer": "Test reviewer",
            "reviewedAt": "2026-10-17",
            "limitations": ["Synthetic fixture; not a medical source."],
        },
        "auditHistory": [
            {
                "sourceId": "test-manifest-source",
                "fromStatus": "pending_review",
                "toStatus": "approved",
                "reviewer": "Test reviewer",
                "reviewedAt": "2026-10-17",
                "reason": "Synthetic test approval only.",
            }
        ],
        "documentPath": document_path,
    }


def write_manifest(path: Path, entries: list[dict[str, object]]) -> None:
    path.write_text(json.dumps(entries), encoding="utf-8")


def test_unconfigured_manifest_produces_an_empty_corpus() -> None:
    assert load_approved_corpus(None) == []


def test_manifest_loads_approved_local_text_and_preserves_source_data(
    tmp_path: Path,
) -> None:
    content_path = tmp_path / "documents" / "source.md"
    content_path.parent.mkdir()
    content_path.write_text("# Overview\nA synthetic approved passage.", encoding="utf-8")
    manifest_path = tmp_path / "approved-sources.json"
    write_manifest(manifest_path, [manifest_entry()])

    chunks = load_approved_corpus(manifest_path)

    assert len(chunks) == 1
    assert chunks[0].text == "A synthetic approved passage."
    assert chunks[0].citation.title == "Synthetic manifest fixture"
    assert chunks[0].approval_event.reason == "Synthetic test approval only."
    assert chunks[0].source_metadata.license == "Synthetic test fixture license"
    assert chunks[0].source_metadata.limitations == [
        "Synthetic fixture; not a medical source."
    ]


def test_manifest_rejects_unapproved_source_before_reading_document(
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "approved-sources.json"
    write_manifest(
        manifest_path,
        [manifest_entry(review_status="pending_review")],
    )

    with pytest.raises(SourceNotApprovedError, match="not approved"):
        load_approved_corpus(manifest_path)


def test_manifest_rejects_document_paths_outside_its_directory(
    tmp_path: Path,
) -> None:
    manifest_path = tmp_path / "approved-sources.json"
    write_manifest(
        manifest_path,
        [manifest_entry(document_path="../outside.txt")],
    )

    with pytest.raises(ValueError, match="stay under the manifest directory"):
        load_approved_corpus(manifest_path)


def test_manifest_rejects_duplicate_source_ids(tmp_path: Path) -> None:
    content_path = tmp_path / "documents" / "source.md"
    content_path.parent.mkdir()
    content_path.write_text("Test content.", encoding="utf-8")
    manifest_path = tmp_path / "approved-sources.json"
    write_manifest(manifest_path, [manifest_entry(), manifest_entry()])

    with pytest.raises(ValueError, match="duplicate source IDs"):
        load_approved_corpus(manifest_path)


def test_manifest_rejects_invalid_json(tmp_path: Path) -> None:
    manifest_path = tmp_path / "approved-sources.json"
    manifest_path.write_text("{", encoding="utf-8")

    with pytest.raises(ValueError, match="manifest is invalid"):
        load_approved_corpus(manifest_path)
