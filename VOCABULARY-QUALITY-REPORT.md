# Vocabulary Quality Audit — 15 July 2026

## Scope and method

The complete `VOCAB` collection in `index.html` was traversed in ID order from 1 through 5,074. Every record was checked for required content, English and Arabic meaning consistency, CEFR validity, part-of-speech structure, duplicate meaning segments, duplicate learning groups, example completeness, and review metadata. Records flagged by that pass received a focused linguistic review.

The review deliberately preserves the existing site structure, UI, layout, and CSS. It also preserves the original CEFR level of every record.

## Final results

| Measure | Result |
| --- | ---: |
| Vocabulary records traversed | 5,074 |
| Records with verified translation status | 4,649 |
| Records still requiring manual dictionary review | 425 |
| Focused linguistic follow-ups completed | 34 |
| Examples rewritten and human-reviewed in this pass | 33 |
| Total human-reviewed examples after this pass | 137 |
| Remaining generated examples | 4,937 |
| Missing required fields | 0 |
| Invalid or changed CEFR levels | 0 |
| Invalid parts of speech | 0 |
| Duplicate Arabic meaning segments | 0 |
| Duplicate learning groups | 0 |
| Generated examples missing their headword | 0 |
| Remaining dictionary-check flags | 0 |

CEFR distribution remained unchanged: A1 830, A2 799, B1 721, B2 650, C1 1,082, and C2 992.

## Corrections made

- Resolved four previously partial records whose available evidence was complete: `access`, `all right`, and the A2/B2 senses of `produce`.
- Separated the A2 production/manufacturing sense of `produce` from its B2 film/programme-production sense, with distinct Arabic meanings and examples.
- Replaced the incomplete generated example for `used to` with a natural B1 example using the complete expression.
- Rewrote 29 examples that had been marked for dictionary review, including `durable`, `gypsy`, `harbour`, `overdraw`, `personalisation`, `poetess`, `repute`, `stimuli`, `unscathed`, `commode`, `converse`, `fabulate`, `minister`, `procedural`, `ravish`, `virginal`, and `wordage`.
- Added precise English sense descriptions and Arabic sense explanations to those dictionary-reviewed entries.
- Retained usage warnings for dated or sensitive terms such as `gypsy`, `poetess`, and `ravish`.
- Normalised record review metadata and explicitly marked every unresolved partial record as requiring manual review.

## Remaining manual review

The 425 remaining records combine two or more grammatical roles or source senses in one record. Their current Arabic meanings are retained because automatically splitting or replacing them without an authoritative source could change meaning, context, or CEFR difficulty. Each has:

- `translationStatus: "partial"`
- `manualReviewRequired: true`
- a reason stating that multi-sense or multi-POS separation requires human dictionary review

The complete one-row-per-entry list is in [`VOCABULARY-MANUAL-REVIEW.csv`](VOCABULARY-MANUAL-REVIEW.csv).

## Automated audit

The committed audit checks all 5,074 records, JavaScript syntax, IDs and ordering, CEFR levels, parts of speech, duplicate meanings, duplicate learning groups, examples, review markers, DOM IDs, local links, lesson counts, and the CSS fingerprint.

Run it with:

```bash
node scripts/audit-vocabulary.mjs
```

Final local result: **PASS**, with no validation failures.

The stylesheet SHA-256 remains `cd65e9ad621472a01771b8bd92ed081f4e359580c64c2709c578a7b83ca455dd`, confirming that the visual design was not changed.
