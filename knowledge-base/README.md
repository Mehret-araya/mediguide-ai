# MediGuide AI — Knowledge Base Directory

This directory stores approved health education source documents and the ingestion manifest for MediGuide AI.

## Directory Structure

```
knowledge-base/
  manifest.json                 # Ingestion manifest referencing approved source records and audit history
  who-malaria.md               # Clean text extraction of WHO Malaria fact sheet (pending approval)
  who-diarrhoeal-disease.md    # Clean text extraction of WHO Diarrhoeal disease fact sheet (pending approval)
```

## Content Standards & Extraction Rules

1. **Source Licensing**: Every document must be published under a verified open access license (e.g., CC BY-NC-SA 3.0 IGO) or express written permission.
2. **Third-Party Exclusions**:
   - Do NOT include external stock photos or credited photographer images.
   - Do NOT include publisher logos, seals, or emblems.
   - Do NOT include interactive scripts, navigation bars, or advertisements.
3. **Document Formatting**:
   - Use standard Markdown headings (`#`, `##`, `###`) to preserve topical sections for chunking.
   - Each heading section should contain coherent clinical or educational guidance.
4. **Integrity & Checksums**:
   - Calculate full-document SHA-256 checksums (`sha256:<hash>`) and record them in `manifest.json`.
   - The ingestion pipeline strictly validates checksums to ensure file integrity.
5. **Review Gate**:
   - Documents are held in `pending_review` status until evaluated by a qualified reviewer.
   - Only documents with verified `approved` status and an unbroken audit event are indexed for user retrieval.

