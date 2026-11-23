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

## Official source discovery

NaCCA's official Common Core Programme (CCP) page provides subject-level curriculum downloads for the JHS programme: https://nacca.gov.gh/common-core-programme-ccp/. An official NaCCA-hosted Computing CCP PDF is also discoverable at https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf; its indexed contents identify the Basic 7–9 structure and carry NaCCA/Ministry of Education attribution. These are useful starting points for the source register, but this audit has not yet reconciled the 966 database records against the PDFs. The official CCP page should be used to locate the matching document for each subject, and the edition/date on each downloaded PDF should be recorded.

## Official source discovery and document register

The official NaCCA Common Core Programme page lists subject-level curriculum downloads for the CCP learning areas: https://nacca.gov.gh/common-core-programme-ccp/. The following direct NaCCA-hosted PDFs were located and their cover/contents metadata inspected during the follow-up source discovery (22 November 2026):

| Subject | Official document title | Cover metadata | Official PDF |
|---|---|---|---|
| Computing | Computing Common Core Programme Curriculum for JHS1 (B7)–JHS3 (B9) | September 2020; © NaCCA, Ministry of Education 2021 | https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf |
| Career Technology | Career Technology Common Core Programme Curriculum for B7/JHS1–B9/JHS3 | September 2020; © NaCCA, Ministry of Education 2021 | https://nacca.gov.gh/wp-content/uploads/2022/10/Career-Technology.pdf |
| Creative Arts and Design | Creative Arts and Design Common Core Programme Curriculum for B7/JHS1–B9/JHS3 | September 2020; © NaCCA, Ministry of Education 2021 | https://nacca.gov.gh/wp-content/uploads/2022/10/Creative-Arts-and-Designs.pdf |
| Social Studies | Social Studies Common Core Programme Curriculum for JHS1 (B7)–JHS3 (B9) | September 2020; © NaCCA, Ministry of Education 2021 | https://nacca.gov.gh/wp-content/uploads/2023/06/SOCIAL-STUDIES.pdf |
| Religious and Moral Education | Religious and Moral Education Common Core Programme Curriculum for B7–B9 | NaCCA-hosted CCP PDF; © NaCCA, Ministry of Education 2021 | https://nacca.gov.gh/wp-content/uploads/2023/06/Religious-and-Moral-Education.pdf |
| English Language | English Language Common Core Programme Curriculum for B7–B9 | NaCCA-hosted CCP PDF; © NaCCA, Ministry of Education 2021 | https://www.nacca.gov.gh/wp-content/uploads/2023/06/ENGLISH-LANGUAGE.pdf |

The Computing PDF's cover identifies NaCCA under the Ministry of Education, the Basic 7–9 CCP scope and September 2020; its contents include the Basic 7–9 strands and sub-strands. The Career Technology, Creative Arts and Design, and Social Studies PDFs likewise identify the Basic 7–9 CCP scope and September 2020. The RME and English PDFs are included as official subject-source leads, but their full document metadata and page mappings still need to be captured in the source register.

**Important boundary:** locating and inspecting these official documents establishes candidate sources and document identity only. It does not verify any exported indicator, exemplar, content standard, strand or sub-strand. No exact record-to-document reconciliation has been completed in this follow-up. The official PDF page numbers and curriculum's printed page labels may differ; both should be recorded during reconciliation.

## Source-document spot checks (not yet matched to exported rows)

A first pass through the official PDF text confirms that the documents contain distinct content-standard and indicator levels. This distinction matters when reconciling the database export:

- **Computing, Basic 7:** the PDF labels `B7.1.1.1` as the content standard, “Examine the parts of a computer”. The indicator rows beneath it are separately numbered `B7.1.1.1.1`, `B7.1.1.1.2`, `B7.1.1.1.3` and `B7.1.1.1.4`. The first indicator discusses fourth-generation computers; the second addresses input devices. In the PDF text extraction, this table begins on printed page 2. Source: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf.
- **Creative Arts and Design, Basic 7:** the scope-and-sequence section distinguishes content standard `B7/JHS1.2.1.1` for Visual Arts media and techniques from the individual indicator rows later in the subject section. The PDF contents place the Basic 7 Creative Arts section under Strand 2, Sub-strand 2.1, “Media and Techniques”. Source: https://nacca.gov.gh/wp-content/uploads/2022/10/Creative-Arts-and-Designs.pdf.
- **Career Technology, Basic 7:** the PDF uses the `B7/JHS1` code form. For example, `B7/JHS1.I.1.1` is a content standard and `B7/JHS1.I.1.1.1` is an indicator. This code format should not be mechanically normalised into another subject's code pattern without preserving the source form. Source: https://nacca.gov.gh/wp-content/uploads/2022/10/Career-Technology.pdf.
- **Social Studies:** the PDF cover identifies the JHS1 (B7)–JHS3 (B9) CCP curriculum, September 2020, © NaCCA, Ministry of Education 2021. This establishes document identity, not any exported record's correctness. Source: https://nacca.gov.gh/wp-content/uploads/2023/06/SOCIAL-STUDIES.pdf.

These are document-level observations from the official PDFs. The source rows have **not** yet been paired with matching database-export rows, and none of these examples is an approval to change the verification manifest. During reconciliation, compare code, label/type (content standard versus indicator), exact wording, exemplar grouping, subject, basic level and printed page together.

## Computing: first indicator-level reconciliation batch

**Source:** NaCCA, *Computing Common Core Programme (CCP) Curriculum for JHS1 (B7)–JHS3 (B9)*, September 2020, © NaCCA/Ministry of Education 2021. Official PDF: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf. The Basic 7 table is on printed pages 2–3 (PDF pages 30–31; zero-based PDF page indexes 29–30).

The four exported rows under content standard `B7.1.1.1` were compared field-by-field with the PDF table. This is a source comparison, not a claim that every field in the export is correct.

| Indicator code | Official indicator wording | Export comparison | Result |
|---|---|---|---|
| `B7.1.1.1.1` | “Discuss the fourth-generation computers” | Export indicator field continues past the indicator sentence with `Exemplar(s):`, exemplar text and the word “Critical”. Its exemplar array also contains a fragment (“Identify a microchip”) plus competency-related text. | **Confirmed field contamination.** Indicator wording must be separated from exemplar and competency columns. |
| `B7.1.1.1.2` | “Demonstrate understanding in the use of input devices (barcode, scanner, etc.)” | Export indicator wording matches the PDF's indicator sentence. The exemplar array's second item absorbs the next table heading, `CONTENT INDICATORS AND EXEMPLAR(S) CORE COMPETENCIES STANDARD`, which is not exemplar content. | **Indicator matches; exemplar boundary contamination confirmed.** |
| `B7.1.1.1.3` | “Examine the uses of the output devices: graphing plotter, data and multimedia projectors as well as pico projector” | Export indicator field appends `CC8.1` competency wording. The official PDF places competency descriptions in the separate core-competencies column. | **Confirmed field contamination.** Remove competency text from the indicator field only after a reviewed correction is prepared. |
| `B7.1.1.1.4` | “Examine full-sized external hard drives, hard drive speed, disk caching, Storage portable hard drives, Optical Discs and Drives.” | Export indicator field appends `CC8.1` competency text. The export exemplar array includes an embedded `Exemplar(s)` marker and the table's competency/header text. The official PDF itself shows a repeated `Exemplar(s):` label in the source cell and awkward wording around “Storage portable hard drives”; these source features must not be silently rewritten. | **Confirmed column-boundary contamination in export; source wording anomaly retained for human review.** |

### What this batch establishes

1. The content-standard code `B7.1.1.1` and standard text “Examine the parts of a computer” match the official PDF table.
2. The four indicator codes are present in the official PDF under that content standard.
3. At least three exported indicator fields contain text from neighbouring exemplar/core-competency cells; the fourth row also contains a competency fragment.
4. The export's exemplar arrays contain table-heading and/or competency fragments. They cannot safely be passed through as clean exemplar lists without source-aware reconstruction.
5. The official source itself contains a repeated exemplar label and wording irregularity in the fourth row. The reconciliation records these faithfully rather than treating the PDF as error-free.

### Disposition

- Mark these four rows as **source-compared; export discrepancies confirmed; correction pending review** in this audit only.
- Do **not** add them to `verifiedIndicators` yet. The current manifest schema's verified status is used by the application to release official exemplars; a human-reviewed corrected representation and provenance record should be prepared before any such promotion.
- Do not edit the generated `api/_curriculum_index.js` by hand. Any eventual correction must be made in the canonical source data/import pipeline and regenerated, with original export values preserved for traceability.
- Next comparison batch: remaining Basic 7 Computing indicators, then Basic 8 and Basic 9 Computing.

## Computing: second Basic 7 indicator batch

**Source:** same NaCCA Computing CCP PDF, printed page 4 (PDF page 32; zero-based PDF page index 31), under Strand 1, Sub-strand 1, “Components of Computers and Computer Systems”. Official source: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf.

| Indicator code | Official indicator wording | Export comparison | Result |
|---|---|---|---|
| `B7.1.1.2.1` | “Discover the latest Windows Operating System (Start screen, Use of tiles, Taskbar buttons, Preview thumbnails), temporal peeking into a window on a taskbar” | The export field includes the correct indicator text but also contains `CC8.1` core-competency wording and a fragment of the content-standard text (“the use of the features of the Windows Desktop”). The four exported exemplars match the four activities listed in the official table. | **Indicator field contamination confirmed; exemplar list matches source.** |
| `B7.1.1.2.2` | “Practise file management techniques (file & folder management, Users & Accounts)” | The export field appends `CC8.1` competency wording. The four exported exemplars correspond to the four activities under this indicator in the PDF. The PDF also contains two preceding account/permission exploration statements before the explicit `Exemplar(s):` label; preserve that source layout in any reviewed reconstruction rather than silently dropping them. | **Indicator field contamination confirmed; exemplar boundary needs human review.** |

### Batch disposition

- Both indicator statements require separating competency fragments from the indicator column.
- The content standard `B7.1.1.2` (“Demonstrate the use of the features of the Windows Desktop”) matches the PDF.
- The export exemplar arrays for these two rows contain the four numbered activities visible under the corresponding indicator. For `B7.1.1.2.2`, the PDF places two additional account/permission exploration statements before the exemplar label; whether those are intended as activities or a table extraction artifact should be reviewed before finalising a canonical exemplar list.
- These rows remain **source-compared; export discrepancies confirmed; correction pending review**. No manifest entries are approved.

## Computing: third Basic 7 indicator batch — Technology in the Community

**Source:** NaCCA Computing CCP PDF, printed pages 5–7 (PDF pages 33–35; zero-based PDF page indexes 32–34), Strand 1, Sub-strand 2, “Technology in the Community”. Official source: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf.

The six exported rows under content standard `B7.1.2.1` were compared with the official table.

| Indicator code | Official indicator wording (source table) | Export comparison | Result |
|---|---|---|---|
| `B7.1.2.1.1` | “Describe and give examples of at least five technology tools for learning in each subject (e.g. Spreadsheets, Virtual Museum, Scrabble, Presentation, Scratch, etc.)” | Export indicator field contains the standard wording, core-competency text and an `Exemplar(s):` marker. Its exemplar field merges the first indicator's activity/NB with the next indicator's activity and competency text. | **Severe row/column boundary contamination confirmed.** |
| `B7.1.2.1.2` | “Demonstrate the use of at least three technology tools identified in B7.1.2.1.1.” | Indicator field is followed by `CC8.1` text. The export exemplar array is empty, while the official PDF contains an activity to demonstrate a technology tool in groups and present how it works. | **Indicator contamination and missing exemplar confirmed.** |
| `B7.1.2.1.3` | “Discuss the benefits of using technology tools in learning.” | Indicator field appends `CC8.1` competency wording. Its exemplar array begins with a trailing competency fragment from the previous row, then the benefit-discussion activity, then a `DL5.3` fragment and the next table heading. | **Indicator and exemplar contamination confirmed.** |
| `B7.1.2.1.4` | “Examine the negative impact of computers and computer use on the environment” | Indicator field matches the source wording. The export has two exemplar strings; the PDF has the observation activity, a website/video activity and a follow-on discussion prompt. The latter two are combined in the export's second string. | **Indicator matches; exemplar grouping is merged but source content is present.** |
| `B7.1.2.1.5` | “Propose environmentally responsible practices that can be used to reduce the negative impact of computers and computer use on the environment” | Indicator field matches the source. Export exemplars combine “Discuss” and “Evaluate” into one string, then retain the e-waste proposal activity in another. | **Indicator matches; exemplar grouping is merged.** |
| `B7.1.2.1.6` | “Create a component from disposed computer parts.” | Indicator field matches the source. The export has two activities combined into one exemplar string; both are present in the PDF. | **Indicator matches; exemplar grouping is merged.** |

### Batch disposition

- The content standard code `B7.1.2.1` and wording “Demonstrate the use of Technology in the community.” match the PDF.
- Rows `B7.1.2.1.1`–`B7.1.2.1.3` show strong evidence that the export's table parser crossed row and column boundaries: competency descriptions, the standard text, headings and neighbouring indicators' activities have been concatenated.
- `B7.1.2.1.2` is a concrete missing-exemplar case in the export: the official PDF contains an activity but the exported exemplar array is empty.
- Rows `B7.1.2.1.4`–`B7.1.2.1.6` retain the main exemplar wording but merge separate activities into combined strings. This is a structure/segmentation discrepancy even where the text is present.
- Preserve the source PDF's wording, including its punctuation and examples. Do not infer missing content or silently rewrite it.

All six rows remain **source-compared; discrepancies recorded; correction pending review**. No verification manifest entries are approved.


## Computing: fourth Basic 7 indicator batch — Health and Safety in the Use of ICT Tools

**Source:** NaCCA Computing CCP PDF, printed page 7 (PDF page 35; zero-based PDF page index 34), Strand 1, Sub-strand 3, “Health and Safety in the Use of ICT Tools”. Official source: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf.

The four exported rows under content standard `B7.1.3.1` were compared with the official table.

| Indicator code | Official indicator wording (source table) | Export comparison | Result |
|---|---|---|---|
| `B7.1.3.1.1` | “Describe health measures and current regulatory requirements and potential computing-related disorders” | The export indicator field includes `CC8.1`, the `Exemplar(s):` marker and the beginning of the first exemplar. The exported exemplar array does not preserve the source's three-item list cleanly: the first source activity (“Watch videos…”) is absent from the array, while competency fragments are inserted among the remaining activities. | **Indicator/exemplar boundary contamination and missing first exemplar activity confirmed.** |
| `B7.1.3.1.2` | “Describe Safety measures in using ICT tools” | Indicator wording matches the PDF. The two exported exemplar entries correspond to the two source activities about liquid spills/electronic circuits and tripping over power cables/electrical terminals. | **No substantive discrepancy identified in the compared indicator and exemplar fields.** |
| `B7.1.3.1.3` | “Demonstrate how to apply Health and Safety measures in Using ICT Tools” | The export indicator appends `PL5.3` and `CP 5.7` competency descriptions. Its exemplar array contains a workstation-risk activity that appears in the PDF immediately after the B7.1.3.1.3 line, but the PDF labels that following activity as `B8.1.3.1.1` (“Examine workstation health risk assessment methods”). | **Competency contamination confirmed; source document has an apparent code/placement inconsistency requiring human review. Do not assign the workstation activity to B7.1.3.1.3 automatically.** |
| `B7.1.3.1.4` | “Explore safety measures at workstations” | The export indicator includes an `Exemplar(s):` fragment and `PL5.3` competency text. The exemplar array contains the workstation hazard-reduction activity in the PDF, but competency fragments are appended to the exported text. | **Indicator/exemplar boundary contamination confirmed; core activity text is present.** |

### Batch disposition

- The content standard code `B7.1.3.1` and wording “Demonstrate how to apply Health and Safety measures in using ICT Tools” match the PDF.
- `B7.1.3.1.1` has a concrete exemplar extraction defect: the PDF lists three activities, but the export does not retain the first activity as an exemplar and mixes competency text into the array.
- `B7.1.3.1.2` is the cleanest of the four compared rows; its indicator and two exemplar activities correspond to the source.
- The PDF places `B8.1.3.1.1` immediately after the `B7.1.3.1.3` indicator line, and its workstation-risk exemplar is associated with that B8 code in the PDF text. The export instead stores that activity under `B7.1.3.1.3`. This is not safe to “correct” by inference; the source document itself must be reviewed and the discrepancy escalated.
- `B7.1.3.1.4` retains the central workstation-safety activity but its indicator and exemplar fields contain competency fragments.
- Preserve the source PDF's wording and its apparent code inconsistency in the audit trail. Do not silently reassign the activity or rewrite the official source.

All four rows remain **source-compared; discrepancies recorded; correction pending review**. No verification manifest entries are approved.


## Computing: fifth Basic 7 indicator batch — Introduction to Word Processing

**Source:** NaCCA Computing CCP PDF, printed pages 8–10 (PDF pages 36–38; zero-based PDF page indexes 36–38), Strand 2, Sub-strand 1, “Introduction to Word Processing”. Official source: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf.

The four exported Basic 7 Computing keys under the `B7.2.1.1` prefix were compared with the official table.

| Export key | Official indicator wording (source table) | Export comparison | Result |
|---|---|---|---|
| `B7.2.1.1.1` | “Explain the importance of word processing software” | The export indicator field appends `CC8.2` competency text and the `Exemplar(s):` marker. Its exemplar array contains the three source activities, but competency text is inserted into the final exemplar string. The official content standard wording is “Demonstrate how to use Microsoft Word (Editing)”; the export's strand field instead says “Demonstrate how to use Microsoft Word (Formatting Text)”. | **Indicator/exemplar boundary contamination; content-standard/strand label does not match the source section.** |
| `B7.2.1.1.2` | “Demonstrate how to insert, select, delete and move text” | The indicator field appends a `DL5.1` competency fragment. The exported exemplar array begins with the trailing words “identify, locate…” from that competency description, then retains the three source activities. | **Indicator and exemplar fields contaminated by competency text; source activities are present.** |
| `B7.2.1.1.3` | “Demonstrate how to find and replace content and undo edited changes” | The indicator field appends a `DL5.1` competency fragment. Its exemplar array contains the two activities listed for this indicator, but also includes a table-header/standard fragment and a separate “Explore the Tab button…” activity that appears on printed page 10 under a repeated `B7.2.1.1.3` code and a different “Formatting Text” standard heading. | **Confirmed cross-section/row contamination; source PDF itself repeats an indicator code under a different standard heading.** |
| `B7.2.1.1.4` | “Demonstrate how to spell check, carry out content translation, language setting” | The indicator field contains fragments of the content-standard heading and `Exemplar(s):` marker. Its exemplar array includes the two source activities for this indicator, but also contains material for the separate formatting indicators printed on page 9: text decoration/case/size/colour and paragraph alignment/indentation/bullets/line spacing/shading. Those activities appear in the PDF under codes `B7.2.1.1.4.5` and `B7.2.1.1.4.6`, which are not separate keys in the exported index. | **Severe cross-indicator merge; two separately coded source indicators are folded into this export row.** |

### Batch disposition

- The source's content standard at the start of this section is `B7.2.1.1`, “Demonstrate how to use Microsoft Word (Editing)”. The export assigns the strand label “Demonstrate how to use Microsoft Word (Formatting Text)” to the `B7.2.1.1.1`–`.4` records. This is a source-to-export metadata discrepancy.
- The source PDF lists `B7.2.1.1.4.5` and `B7.2.1.1.4.6` as additional formatting indicators on printed page 9, but the export index has no matching keys. Their exemplar activities appear to have been merged into the exported `B7.2.1.1.4` exemplar array.
- Printed page 10 contains a further `B7.2.1.1.3` code for “Demonstrate how to set tabs and apply formatting” beneath a “Formatting Text” standard heading. Because the PDF repeats the code, do not infer a corrected code or merge this activity into another record without source-owner review.
- The export's `B7.2.1.1.3` exemplar list therefore appears to combine material from at least two different table positions; `B7.2.1.1.4` combines material from at least three source indicators.
- Preserve both the duplicated codes and the original source wording in the audit trail. These are source-document anomalies and export-structure discrepancies requiring human review, not permission to rewrite the curriculum.

All four exported rows remain **source-compared; discrepancies recorded; correction pending review**. No verification manifest entries are approved.


## Computing: sixth Basic 7 indicator batch — Electronic Spreadsheet

**Source:** NaCCA Computing CCP PDF, printed pages 13–15 (PDF pages 41–43; zero-based PDF page indexes 41–43), Strand 2, Sub-strand 3, “Introduction to Electronic Spreadsheet”. Official source: https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf.

The eight exported rows under content standards `B7.2.3.1`, `B7.2.3.2` and `B7.2.3.3` were compared with the official table.

| Indicator code | Official indicator wording (source table) | Export comparison | Result |
|---|---|---|---|
| `B7.2.3.1.1` | “Explain the importance of electronic spreadsheet” | Export indicator field appends `DL5.1` competency wording, content-standard wording and the `Exemplar(s):` marker. The three source activities are present, but competency text is embedded in the exemplar strings and the first exemplar string combines the standard/strand label with the activity. | **Indicator and exemplar column-boundary contamination; source activities remain identifiable.** |
| `B7.2.3.1.2` | “Explore features of MS-Excel interface” | Indicator field appends a `DL5.1` fragment. The exemplar array starts with the trailing competency phrase “identify, locate…” before the source's three activities; the competency tail is embedded again after the first activity. | **Competency fragments contaminate indicator and exemplar fields; all three activities are present.** |
| `B7.2.3.1.3` | “Demonstrate how to set the cell datatype (General, Number, Currency, etc.).” | Indicator field appends `DL5.1` text. The exemplar array begins with the trailing words “it to solve a problem.” from the competency descriptor, followed by the two source activities. | **Competency tail contaminates indicator and first exemplar; source activities are present.** |
| `B7.2.3.1.4` | “Demonstrate how to use Align Text, Merge & Wrap, Borders and Shades” | Indicator field appends a `DL5.1` fragment. The exemplar array begins with the competency tail, retains the two source activities, then appends the next table's “CONTENT INDICATORS AND EXEMPLAR(S) CORE COMPETENCIES STANDARD” heading. | **Indicator/exemplar contamination and trailing table-header leakage confirmed.** |
| `B7.2.3.2.1` | “Demonstrate how to adjust margins and set page orientation” | The indicator field appends part of the content-standard wording “Demonstrate how to format a worksheet”. The three source activities are present, but competency text is appended to the second/third activity strings. | **Content-standard fragment in indicator field; competency contamination in exemplars.** |
| `B7.2.3.2.2` | “Demonstrate how to set up a header and a footer.” | Indicator wording matches. The exemplar array begins with a trailing `DL5.1` competency fragment, then contains the two source activities; competency text is also attached to the second activity. | **Indicator matches; exemplar field is contaminated by competency text.** |
| `B7.2.3.2.3` | “Demonstrate the use of the Autofill function in MS-Excel worksheet” | Indicator field appends a `DL5.1` fragment and `Exemplar(s):` marker. The exemplar contains the source's Autofill activity but includes the competency tail in the middle of the sentence. | **Indicator/exemplar boundary contamination; activity content is present.** |
| `B7.2.3.3.1` | “Demonstrate how to create formulas” | The exported indicator field is empty. The exemplar array contains the activity “Create simple formulas starting with the equal sign (=)” but also includes the indicator wording, `Exemplar(s):` marker, part of the content-standard heading and competency descriptions. | **Confirmed missing indicator statement in export; source activity is present but mixed with metadata.** |

### Batch disposition

- The source PDF distinguishes the three content standards: `B7.2.3.1` (“Demonstrate how to use the Spreadsheet (Editing Worksheets)”), `B7.2.3.2` (“Demonstrate how to format a worksheet”), and `B7.2.3.3` (“Demonstrate how to use spreadsheet formula”).
- Export records generally preserve the activity wording but do not reliably preserve the boundaries between indicator, content standard, exemplar and core competency fields.
- `B7.2.3.3.1` is a clear missing-indicator case: the official PDF supplies the indicator wording, while the export's indicator field is empty.
- The final `B7.2.3.1.4` exemplar contains a table-header fragment from the next section, further evidence of extraction continuing beyond the row boundary.
- These findings concern field structure and missing text in the export; they do not imply that the source activities themselves are pedagogically incorrect. Preserve the official source wording and do not reconstruct a canonical row without review.

All eight rows remain **source-compared; discrepancies recorded; correction pending review**. No verification manifest entries are approved.

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
- The source discovery follow-up located official NaCCA-hosted CCP PDFs for Computing, Career Technology, Creative Arts and Design, Social Studies, RME and English Language. These documents have not yet been reconciled indicator-by-indicator against the database export, so this audit does not certify the wording or accuracy of any curriculum record.
- The counts above are generated from the current export using the same heuristic categories documented by the existing audit script. Heuristic flags are not an official quality score.
- This is a technical provenance audit, not a formal NaCCA endorsement or legal opinion.

## Decision

**Verification status remains: UNVERIFIED.** No manifest entries are approved by this audit. The next required input is the official source documents (or stable official URLs and editions) so indicator-by-indicator reconciliation can be performed.

## 23 November implementation addendum — source register and reconciliation tracking

The source-discovery notes above are now represented in two machine-readable files:

- `data/curriculum-source-register.json` records the six discovered NaCCA subject documents, official URLs, known edition metadata, source-checksum state and page-mapping state.
- `data/curriculum-reconciliation.json` records the six Basic 7 Computing comparison batches already described in this audit.

The Computing comparison currently covers **28 of the 50 Basic 7 Computing records** in the export. The remaining 22 Basic 7 Computing records are still queued, followed by the 37 Basic 8 and 35 Basic 9 Computing records. This is a comparison queue, not a verification count.

**Evidence gaps remain explicit:** no downloaded-source SHA-256 checksum has yet been captured in the register; printed-page ranges are recorded for the compared Computing batches, while exact PDF page-index mapping still needs a controlled source-file capture. English Language and Religious and Moral Education also need their full cover metadata confirmed.

No curriculum record has been corrected in the generated index, and `curriculum-verification.json` remains `unverified_database_export` with zero approved indicators. The new provenance regression test enforces that boundary. A source comparison, even where wording matches, is not a second-review approval and does not by itself release official exemplars.
