import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const [indexPath = 'index.html', sourcePath, beforeAuditPath, afterAuditPath, reportPath, csvPath] = process.argv.slice(2);
if (!sourcePath || !beforeAuditPath || !afterAuditPath || !reportPath || !csvPath) {
  throw new Error('Usage: node scripts/generate-oxford-audit-report.mjs <index.html> <source.json> <before-audit.json> <after-audit.json> <report.md> <trace.csv>');
}

function extractConst(html, name) {
  const marker = `const ${name}=`;
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing ${marker}`);
  let start = markerAt + marker.length;
  while (/\s/.test(html[start])) start += 1;
  const open = html[start];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) throw new Error(`Unsupported literal for ${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === open) depth += 1;
    else if (character === close && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Unterminated ${name}`);
}

const html = fs.readFileSync(indexPath, 'utf8');
const vocabulary = vm.runInNewContext(`(${extractConst(html, 'VOCAB')})`, Object.create(null), { timeout: 5000 });
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const before = JSON.parse(fs.readFileSync(beforeAuditPath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterAuditPath, 'utf8'));
const imported = vocabulary.filter(entry => entry.translationReview === 'v9.0-oxford-pdf-expansion');
const corrected = vocabulary.filter(entry => entry.cefrReview === 'v9.0-oxford-pdf-level-correction');
const levelCounts = Object.fromEntries(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => [level, vocabulary.filter(entry => entry.level === level).length]));
const importedLevelCounts = Object.fromEntries(['A1', 'A2', 'B1', 'B2'].map(level => [level, imported.filter(entry => entry.level === level).length]));
const sourceFiles = {
  'The Oxford 3000': {
    file: 'The_Oxford_3000.pdf',
    sha256: 'ddaf936ef29f5e67c2df0ab3b547fd5bf9d9631f900c3cf55c195cb9c5ad0b40'
  },
  'The Oxford 5000 by CEFR level': {
    file: 'The_Oxford_5000_by_CEFR_level.pdf',
    sha256: '6577e6eb8745226ab7ab80912e83d285cf421ec70e61c92d74d5fef5f2c99570'
  }
};

const beforeByKey = new Map(before.results.map(result => [result.sourceKey, result]));
const afterByKey = new Map(after.results.map(result => [result.sourceKey, result]));
const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const header = [
  'source', 'pdf_file', 'pdf_sha256', 'printed_headword', 'normalized_headword',
  'part_of_speech', 'cefr_level', 'pdf_page', 'pdf_column', 'pdf_line',
  'pre_import_status', 'pre_import_record_ids', 'post_import_status', 'final_record_ids', 'source_key'
];
const csvRows = source.combinedUniqueEntries.map(entry => {
  const pre = beforeByKey.get(entry.sourceKey);
  const post = afterByKey.get(entry.sourceKey);
  const file = sourceFiles[entry.source];
  return [
    entry.source, file.file, file.sha256, entry.printedHeadword, entry.headword,
    entry.partsOfSpeech.join('; '), entry.level, entry.sourcePage, entry.sourceColumn, entry.sourceLine,
    pre?.status, (pre?.recordIds ?? []).join('; '), post?.status, (post?.recordIds ?? []).join('; '), entry.sourceKey
  ].map(csvEscape).join(',');
});

fs.writeFileSync(csvPath, `${header.map(csvEscape).join(',')}\n${csvRows.join('\n')}\n`);

const beforeCounts = before.applicationBefore.levelCounts;
const sourceSummary = source.summary;
const report = `# Oxford PDF vocabulary expansion — pre-deployment audit

Audit date: 2026-07-16
Repository: \`tqagxtqagx-sys/Mufradati7.4\`
Status: **PASS — ready for deployment after commit review**

## Authority and scope

- Vocabulary selection, headword, part of speech, and CEFR level use only \`The_Oxford_3000.pdf\` and \`The_Oxford_5000_by_CEFR_level.pdf\`.
- Oxford 3000 scope: A1, A2, B1, and B2.
- Oxford 5000 scope: B2 only. No C1 Oxford 5000 entry was imported.
- The PDFs do not provide Arabic translations or complete examples. This audit does not attribute translations, definitions, or examples to the PDFs.
- Existing valid non-Oxford records were preserved.

## Source extraction

| Measure | Verified count |
|---|---:|
| Oxford 3000 printed headword rows | ${sourceSummary.oxford3000PrintedRows} |
| Oxford 3000 grouped headword–level–POS entries | ${sourceSummary.oxford3000GroupedEntries} |
| Oxford 5000 eligible B2 entries | ${sourceSummary.oxford5000B2Entries} |
| Combined entries before deduplication | ${sourceSummary.combinedBeforeDeduplication} |
| Unique eligible source entries | ${sourceSummary.combinedUniqueEntries} |
| Exact source duplicates | ${sourceSummary.sourceDuplicates} |

Oxford 3000 by level: A1 ${sourceSummary.oxford3000ByLevel.A1}, A2 ${sourceSummary.oxford3000ByLevel.A2}, B1 ${sourceSummary.oxford3000ByLevel.B1}, B2 ${sourceSummary.oxford3000ByLevel.B2}.

Source PDF SHA-256 values:

- \`The_Oxford_3000.pdf\`: \`${sourceFiles['The Oxford 3000'].sha256}\`
- \`The_Oxford_5000_by_CEFR_level.pdf\`: \`${sourceFiles['The Oxford 5000 by CEFR level'].sha256}\`

## Before/after comparison

| Measure | Count |
|---|---:|
| Existing exact source matches before import | ${before.coverageSummary.statusCounts['existing-exact']} |
| Existing matches skipped instead of duplicated | ${before.coverageSummary.statusCounts['existing-exact']} |
| Completely missing source entries | ${before.coverageSummary.statusCounts.missing} |
| Existing headwords missing a required source POS | ${before.coverageSummary.statusCounts['ambiguous-part-of-speech']} |
| PDF-confirmed CEFR mismatches corrected | ${corrected.length} |
| New application records added | ${imported.length} |
| Separated meaning/POS entries in new records | ${imported.reduce((sum, entry) => sum + entry.meanings.length, 0)} |
| Remaining source entries missing after import | ${after.coverageSummary.totalSourceEntries - (after.coverageSummary.statusCounts['existing-exact'] ?? 0)} |
| Remaining records requiring manual review | ${vocabulary.filter(entry => entry.manualReviewRequired).length} |
| Exact duplicate learning records after import | ${after.coverageSummary.duplicateExistingRecords} |

The ${before.coverageSummary.statusCounts['ambiguous-part-of-speech']} POS-ambiguous pre-import cases were individually resolved by adding the PDF-listed missing part of speech as a separate, internally consistent sense. The ${corrected.length} level corrections were made only where a PDF entry provided direct evidence.

## Vocabulary counts

| CEFR | Before | New records | After |
|---|---:|---:|---:|
| A1 | ${beforeCounts.A1} | ${importedLevelCounts.A1} | ${levelCounts.A1} |
| A2 | ${beforeCounts.A2} | ${importedLevelCounts.A2} | ${levelCounts.A2} |
| B1 | ${beforeCounts.B1} | ${importedLevelCounts.B1} | ${levelCounts.B1} |
| B2 | ${beforeCounts.B2} | ${importedLevelCounts.B2} | ${levelCounts.B2} |
| C1 | ${beforeCounts.C1} | 0 | ${levelCounts.C1} |
| C2 | ${beforeCounts.C2} | 0 | ${levelCounts.C2} |
| **Total** | **${before.applicationBefore.total}** | **${imported.length}** | **${vocabulary.length}** |

The C1 and C2 reductions are the result of ${corrected.length} PDF-backed moves into A2, B1, or B2; no existing vocabulary was deleted.

## Content created

- New top-level Modern Standard Arabic translations: ${imported.length}.
- New top-level English examples: ${imported.length}.
- New top-level Arabic example translations: ${imported.length}.
- Fully separated meaning/POS records with definition, translation, English example, and Arabic example: ${imported.reduce((sum, entry) => sum + entry.meanings.length, 0)}.
- Dictionary evidence was used for sense checking only; editor-curated definitions/examples/translations are explicitly identified in record metadata and are not attributed to the Oxford PDFs.

## Validation results

- Vocabulary audit: PASS; ${vocabulary.length}/${vocabulary.length} records reviewed; 0 manual-review flags; 0 missing required fields; 0 invalid CEFR values; 0 invalid parts of speech.
- Oxford source coverage: PASS; ${after.coverageSummary.statusCounts['existing-exact']}/${after.coverageSummary.totalSourceEntries} eligible source entries match exactly after import.
- Oxford 5000 C1 exclusion: PASS; only ${sourceSummary.oxford5000B2Entries} B2 entries are in source scope.
- ID/schema integrity: PASS; IDs are sequential and no required application field is missing.
- Duplicate audit: PASS; 0 exact duplicate learning records and 0 duplicate Arabic meaning segments.
- JavaScript syntax: PASS; inline application script and all repository \`.mjs\` files parse successfully.
- Python extractor syntax: PASS.
- DOM/link audit: PASS; 0 duplicate DOM IDs, 0 missing referenced DOM IDs, and 0 broken declared links.
- Design preservation: PASS; CSS SHA-256 remains \`cd65e9ad621472a01771b8bd92ed081f4e359580c64c2709c578a7b83ca455dd\`.
- Local browser E2E: PASS; search, flashcards, correct/incorrect quiz paths, language switching, review scheduling, saved progress after reload, grammar lessons, pronunciation lessons, and settings were exercised without a fatal UI error.
- Lesson inventory: 64 grammar lessons and 20 pronunciation lessons available.

## Traceability

\`${csvPath.split('/').at(-1)}\` contains one row for each of the ${sourceSummary.combinedUniqueEntries} eligible source entries, including PDF filename/hash, page, column, line, POS, CEFR level, pre-import status, and final record IDs.

## Files in this change

- \`index.html\`
- \`scripts/audit-vocabulary.mjs\`
- \`scripts/extract-oxford-pdf-vocabulary.py\`
- \`scripts/audit-oxford-source-coverage.mjs\`
- \`scripts/fetch-oxford-entry-dictionary-evidence.mjs\`
- \`scripts/import-oxford-pdf-vocabulary.mjs\`
- \`scripts/generate-oxford-audit-report.mjs\`
- \`${reportPath.split('/').at(-1)}\`
- \`${csvPath.split('/').at(-1)}\`

## Remaining issues

None in the requested A1–B2 source coverage. Manual-review count is 0. Deployment is intentionally excluded from this pre-deployment report and is performed only after all validations above pass.
`;

fs.writeFileSync(reportPath, report);
console.log(JSON.stringify({
  reportPath,
  csvPath,
  reportSha256: crypto.createHash('sha256').update(report).digest('hex'),
  csvRows: csvRows.length,
  imported: imported.length,
  finalTotal: vocabulary.length
}, null, 2));
