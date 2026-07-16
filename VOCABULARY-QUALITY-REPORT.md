# Vocabulary Quality Audit — 16 July 2026

## Scope and method

The complete `VOCAB` collection in `index.html` was audited in ID order from 1 through 5,074. The 425 records previously marked for manual review were then reviewed individually against the Cambridge English Dictionary, Cambridge English–Arabic Dictionary, and the Oxford 3000 CEFR word list. Distinct grammatical roles and meanings were stored as separate sense-level records with Modern Standard Arabic translations.

The review preserves the existing UI, layout, CSS, application structure, and every CEFR level.

## Final results

| Measure | Result |
| --- | ---: |
| Vocabulary records audited | 5,074 |
| Records with fully reviewed translation status | 5,074 |
| Previously flagged records resolved individually | 425 |
| Sense-level meanings recorded for those records | 1,140 |
| Meanings linked directly to Cambridge English–Arabic senses | 917 |
| Meanings curated from Cambridge English definitions with Oxford POS cross-check | 223 |
| Records still requiring manual translation review | 0 |
| Partial translation records | 0 |
| Missing part-of-speech coverage | 0 |
| Invalid sense/source records | 0 |
| Missing required fields | 0 |
| Invalid or changed CEFR levels | 0 |
| Invalid parts of speech | 0 |
| Duplicate Arabic meaning segments | 0 |
| Duplicate learning groups | 0 |
| Generated examples missing their headword | 0 |
| Remaining dictionary-check flags | 0 |

CEFR distribution is unchanged: A1 830, A2 799, B1 721, B2 650, C1 1,082, and C2 992.

## Corrections made

- Resolved every one of the 425 multi-part-of-speech or multi-sense records previously marked `partial`.
- Separated noun, verb, adjective, adverb, pronoun, determiner, preposition, conjunction, exclamation, number, and auxiliary uses where the source record contains more than one grammatical role.
- Replaced combined, partial, or incorrectly assigned Arabic meanings with natural Modern Standard Arabic sense mappings.
- Added per-meaning source URLs and SHA-256 fingerprints of the exact source definitions used during verification.
- Added record-level Cambridge English, Cambridge English–Arabic, and Oxford source references.
- Removed all manual-review flags only after every listed part of speech had at least one verified meaning.
- Preserved all 5,074 record IDs, their ordering, and their CEFR levels.

The one-row-per-record evidence index is in [`VOCABULARY-DICTIONARY-AUDIT.csv`](VOCABULARY-DICTIONARY-AUDIT.csv). [`VOCABULARY-MANUAL-REVIEW.csv`](VOCABULARY-MANUAL-REVIEW.csv) now contains only its header because no records remain in that queue.

## Examples outside this translation pass

This pass was restricted to the 425 requested translation and sense records. The existing example-quality classification is unchanged: 137 examples are marked reviewed and 4,937 are marked generated. All generated examples still contain their target headword, but they were not individually rewritten in this pass because doing so was outside the requested translation-only scope.

## Automated audit

The audit checks all 5,074 records, review status, sense-level source evidence, part-of-speech coverage, JavaScript syntax, IDs and ordering, CEFR levels, duplicate meanings, duplicate learning groups, examples, DOM IDs, local links, lesson counts, and the CSS fingerprint.

Run it with:

```bash
node scripts/audit-vocabulary.mjs --write-manual-list --write-source-list
```

Final local result: **PASS**, with no validation failures.

The stylesheet SHA-256 remains `cd65e9ad621472a01771b8bd92ed081f4e359580c64c2709c578a7b83ca455dd`, confirming that the visual design was not changed.
