# Curriculum provenance audit — 22 November 2026

## Executive finding

The current curriculum index is a database export, not a verified copy of the original NaCCA curriculum documents. The source metadata in `data/curriculum-index.json` identifies the SchoolPadi database export, dated 12 November 2026. The index contains 966 indicator records and its declared count matches the actual number of entries.

The verification manifest at `data/curriculum-verification.json` explicitly says `unverified_database_export` and contains **zero verified indicators**. No indicator should currently be represented to teachers or learners as independently verified against an official NaCCA document.

This is an evidence-status finding, not a claim that all 966 records are wrong.

## Current application safeguards

The Curriculum Intelligence Engine checks the verification manifest before exposing official curriculum exemplars. `officialFor()` returns no official record unless the indicator has a verified status and document title, publisher, page and source URL. With the current empty manifest, the engine withholds all database-exported exemplars from official NaCCA claims.

Existing tests assert that:
- The manifest remains `unverified_database_export` with zero verified indicators.
- `officialFor()` returns null for an unverified indicator.
- Generated instruction does not label unverified exemplars as official NaCCA exemplars.
- Indicator selections are validated against class, subject, term and week.

These safeguards should remain in place until evidence is collected and reviewed.

## Structural and heuristic review

A read-only pass over the 966 exported records found:

| Subject | Records | Heuristic flags | Missing exemplars |
|---|---:|---:|---:|
| Creative Arts and Design | 101 | 67 | 3 |
| Science | 153 | 3 | 0 |
| Social Studies | 55 | 25 | 0 |
| Religious and Moral Education | 68 | 3 | 0 |
| Mathematics | 177 | 41 | 35 |
| Computing | 122 | 100 | 5 |
| English Language | 152 | 2 | 0 |
| Career Technology | 138 | 70 | 1 |
| **Total** | **966** | **311** | **44** |

The heuristic flags look for embedded exemplar labels, curriculum/competency headings, competency codes mixed into indicator text, suspicious document-control text and repeated whitespace/punctuation. They are review signals only; they do not prove that a record is incorrect.

### Examples requiring source-level review

- A Computing record contains an embedded `Exemplar(s):` label and competency text inside the indicator field.
- Several Computing records contain `CC8.1` competency statements appended to the indicator text.
- Creative Arts and Design and Career Technology records contain competency descriptors embedded in indicator text.
- Mathematics has 35 records with no exemplar array entry in the export. The absence may be legitimate for a particular record, or may reflect an incomplete export; the source document must decide.
- At least one Mathematics record has an empty indicator statement.

Do not auto-correct, delete, or mark these records verified from heuristics alone.

## Required evidence before verification

For each indicator proposed for verification, capture and review:

1. Exact subject and curriculum code.
2. Exact indicator wording in the official document.
3. Content standard code and wording.
4. Strand and sub-strand.
5. Exemplar wording, where present.
6. Official document title and publisher.
7. Edition/revision and publication year.
8. Page number (or stable section reference if the document has no page numbers).
9. Official source URL or a controlled copy with a documented source.
10. Reviewer, review date and evidence/checksum for the source file.

A record should enter `verifiedIndicators` only after a human reviewer has reconciled the exact fields against the cited official source. Verification must be per indicator, not inferred from the fact that a subject or export file was reviewed.

## Recommended verification sequence

1. Obtain the official NaCCA Common Core Programme curriculum documents for Basic 7–9 for each subject represented in the index.
2. Establish a source register with document edition, source URL, page mapping and checksum.
3. Reconcile the exported data against the official documents, starting with the most heavily flagged subjects: Computing, Career Technology, Creative Arts and Design, Mathematics, then Social Studies.
4. Record discrepancies without overwriting the source export; retain both the original value and the reviewed value with provenance.
5. Have a second reviewer sample or independently check each batch before manifest approval.
6. Add only individually approved records to the verification manifest.
7. Keep unresolved records visibly unverified and prevent them from supplying official exemplars or source claims.

## Scope and limitations

- This audit inspected the exported JSON and application verification logic in the repository.
- The original NaCCA source PDFs/documents were not present in the reviewed repository paths, so this audit does not certify the wording or accuracy of any curriculum record.
- The counts above are generated from the current export using the same heuristic categories documented by the existing audit script. Heuristic flags are not an official quality score.
- This is a technical provenance audit, not a formal NaCCA endorsement or legal opinion.

## Decision

**Verification status remains: UNVERIFIED.** No manifest entries are approved by this audit. The next required input is the official source documents (or stable official URLs and editions) so indicator-by-indicator reconciliation can be performed.
