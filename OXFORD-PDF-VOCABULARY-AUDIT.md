# Oxford PDF vocabulary expansion — pre-deployment audit

Audit date: 2026-07-16
Repository: `tqagxtqagx-sys/Mufradati7.4`
Status: **PASS — ready for deployment after commit review**

## Authority and scope

- Vocabulary selection, headword, part of speech, and CEFR level use only `The_Oxford_3000.pdf` and `The_Oxford_5000_by_CEFR_level.pdf`.
- Oxford 3000 scope: A1, A2, B1, and B2.
- Oxford 5000 scope: B2 only. No C1 Oxford 5000 entry was imported.
- The PDFs do not provide Arabic translations or complete examples. This audit does not attribute translations, definitions, or examples to the PDFs.
- Existing valid non-Oxford records were preserved.

## Source extraction

| Measure | Verified count |
|---|---:|
| Oxford 3000 printed headword rows | 3000 |
| Oxford 3000 grouped headword–level–POS entries | 3308 |
| Oxford 5000 eligible B2 entries | 700 |
| Combined entries before deduplication | 4008 |
| Unique eligible source entries | 4008 |
| Exact source duplicates | 0 |

Oxford 3000 by level: A1 900, A2 872, B1 809, B2 727.

Source PDF SHA-256 values:

- `The_Oxford_3000.pdf`: `ddaf936ef29f5e67c2df0ab3b547fd5bf9d9631f900c3cf55c195cb9c5ad0b40`
- `The_Oxford_5000_by_CEFR_level.pdf`: `6577e6eb8745226ab7ab80912e83d285cf421ec70e61c92d74d5fef5f2c99570`

## Before/after comparison

| Measure | Count |
|---|---:|
| Existing exact source matches before import | 3000 |
| Existing matches skipped instead of duplicated | 3000 |
| Completely missing source entries | 919 |
| Existing headwords missing a required source POS | 58 |
| PDF-confirmed CEFR mismatches corrected | 31 |
| New application records added | 977 |
| Separated meaning/POS entries in new records | 1050 |
| Remaining source entries missing after import | 0 |
| Remaining records requiring manual review | 0 |
| Exact duplicate learning records after import | 0 |

The 58 POS-ambiguous pre-import cases were individually resolved by adding the PDF-listed missing part of speech as a separate, internally consistent sense. The 31 level corrections were made only where a PDF entry provided direct evidence.

## Vocabulary counts

| CEFR | Before | New records | After |
|---|---:|---:|---:|
| A1 | 830 | 70 | 900 |
| A2 | 799 | 72 | 872 |
| B1 | 721 | 86 | 809 |
| B2 | 650 | 749 | 1427 |
| C1 | 1082 | 0 | 1054 |
| C2 | 992 | 0 | 989 |
| **Total** | **5074** | **977** | **6051** |

The C1 and C2 reductions are the result of 31 PDF-backed moves into A2, B1, or B2; no existing vocabulary was deleted.

## Content created

- New top-level Modern Standard Arabic translations: 977.
- New top-level English examples: 977.
- New top-level Arabic example translations: 977.
- Fully separated meaning/POS records with definition, translation, English example, and Arabic example: 1050.
- Dictionary evidence was used for sense checking only; editor-curated definitions/examples/translations are explicitly identified in record metadata and are not attributed to the Oxford PDFs.

## Validation results

- Vocabulary audit: PASS; 6051/6051 records reviewed; 0 manual-review flags; 0 missing required fields; 0 invalid CEFR values; 0 invalid parts of speech.
- Oxford source coverage: PASS; 4008/4008 eligible source entries match exactly after import.
- Oxford 5000 C1 exclusion: PASS; only 700 B2 entries are in source scope.
- ID/schema integrity: PASS; IDs are sequential and no required application field is missing.
- Duplicate audit: PASS; 0 exact duplicate learning records and 0 duplicate Arabic meaning segments.
- JavaScript syntax: PASS; inline application script and all repository `.mjs` files parse successfully.
- Python extractor syntax: PASS.
- DOM/link audit: PASS; 0 duplicate DOM IDs, 0 missing referenced DOM IDs, and 0 broken declared links.
- Design preservation: PASS; CSS SHA-256 remains `cd65e9ad621472a01771b8bd92ed081f4e359580c64c2709c578a7b83ca455dd`.
- Local browser E2E: PASS; search, flashcards, correct/incorrect quiz paths, language switching, review scheduling, saved progress after reload, grammar lessons, pronunciation lessons, and settings were exercised without a fatal UI error.
- Lesson inventory: 64 grammar lessons and 20 pronunciation lessons available.

## Traceability

`OXFORD-PDF-VOCABULARY-SOURCE-AUDIT.csv` contains one row for each of the 4008 eligible source entries, including PDF filename/hash, page, column, line, POS, CEFR level, pre-import status, and final record IDs.

## Files in this change

- `index.html`
- `scripts/audit-vocabulary.mjs`
- `scripts/extract-oxford-pdf-vocabulary.py`
- `scripts/audit-oxford-source-coverage.mjs`
- `scripts/fetch-oxford-entry-dictionary-evidence.mjs`
- `scripts/import-oxford-pdf-vocabulary.mjs`
- `scripts/generate-oxford-audit-report.mjs`
- `OXFORD-PDF-VOCABULARY-AUDIT.md`
- `OXFORD-PDF-VOCABULARY-SOURCE-AUDIT.csv`

## Remaining issues

None in the requested A1–B2 source coverage. Manual-review count is 0. Deployment is intentionally excluded from this pre-deployment report and is performed only after all validations above pass.
