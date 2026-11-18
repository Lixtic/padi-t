# NaCCA CCP curriculum reconciliation

## Purpose

Reconcile the structured curriculum index in `data/curriculum-index.json` against the original NaCCA Common Core Programme (CCP) subject documents. The database export is useful working data, but it is not proof that every field is a faithful transcription of the official curriculum.

## Scope

The current index contains 966 indicator records across eight subjects. The reconciliation covers Basic 7, Basic 8 and Basic 9 for:

- English Language
- Mathematics
- Science
- Social Studies
- Religious and Moral Education
- Creative Arts and Design
- Career Technology
- Computing

The official subject-document URLs are maintained in `data/curriculum-source-register.json`. The register is based on NaCCA's official [Common Core Programme download page](https://nacca.gov.gh/common-core-programme-ccp/). The revised 2024 Social Studies document is listed instead of the older 2023 PDF.

## Baseline findings

The initial structural/heuristic audit of the 12 November 2026 database export found:

| Measure | Result |
|---|---:|
| Declared records | 966 |
| Actual records | 966 |
| Records with missing indicator text | 7 |
| Records with missing content-standard text | 6 |
| Records with missing exemplars | 44 |
| Records with one or more heuristic flags | 311 |
| Indicators approved for official exemplar use | 0 |

A heuristic flag is a review signal, not proof of an incorrect curriculum record. For example, a competency code embedded in an indicator field may indicate a malformed import, but must be checked against the PDF before correction.

## Reconciliation rules

1. Match by **subject + exact curriculum indicator code**, not by topic wording alone.
2. Compare the indicator statement, content-standard code and statement, strand, sub-strand, and each exemplar separately.
3. Record the printed page number from the source PDF. Do not substitute the PDF viewer's zero-based page index.
4. Preserve the original database-exported value in the audit evidence so every proposed correction is traceable.
5. Mark records as `verified`, `needs_correction`, `not_found_in_source`, or `ambiguous`. Only `verified` records may be added to the official verification manifest.
6. A reviewer must approve each proposed correction. No script or model may silently rewrite official curriculum text.
7. If the official document does not support a field, leave it unverified; do not fill the gap from memory, a textbook, or a teacher resource.
8. Keep the curriculum source document and the weekly scheme-of-learning schedule distinct. The scheme controls pacing; the official curriculum establishes the learning standard and indicator wording.

## Review workflow

### 1. Acquire and preserve source documents

Download each PDF from its registered NaCCA URL. Record retrieval date, SHA-256 checksum, file size, document title and printed publication/version details. Keep the untouched source PDF as the evidence copy.

### 2. Extract text with page boundaries

Extract text page by page. Retain the printed page label when present. Table extraction must preserve the association between each indicator, standard, strand, sub-strand and exemplar. OCR output is provisional and must be visually checked against the source page.

### 3. Build the record-level review queue

Run:

```bash
npm run audit:curriculum
npm run audit:curriculum -- --json
```

The JSON output is intended for review tooling and downstream reconciliation scripts. Existing heuristic flags must not be treated as automatic corrections.

### 4. Reconcile and record evidence

For every reviewed code, record:

- subject and exact indicator code
- source document title and publisher
- official source URL and source checksum
- printed page number
- extracted official wording for each field
- current index wording
- comparison outcome and reviewer decision
- reviewer identity and review timestamp

### 5. Approve only evidenced records

Update `data/curriculum-verification.json` only after a human has checked the source page and confirmed the exact record. Each verified manifest entry must include the document title, publisher, printed page, source URL, and verified status. Do not set the overall manifest to verified while records remain pending.

### 6. Validate before merge

Run the curriculum audit and the complete `npm test` suite. Review the generated diff to ensure no unrelated scheme, prompt, or user-interface files changed.

## Current limitation

The source register confirms the official NaCCA download-page entries and their URLs. It does **not** mean all eight PDFs have been downloaded, extracted, or reconciled yet. The verification manifest therefore remains `unverified_database_export` with zero verified indicators until page-level evidence has been reviewed.

## Safety boundary

This stage is a data-integrity exercise. It must not change generated lesson behaviour by promoting unverified exemplars. Keep the current index intact until source-backed corrections are reviewed and approved.
