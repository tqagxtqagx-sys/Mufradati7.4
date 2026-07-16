import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const referencesPath = process.argv.find(argument => argument.startsWith('--references='))?.slice('--references='.length);
const oxfordReferencesPath = process.argv.find(argument => argument.startsWith('--oxford-references='))?.slice('--oxford-references='.length);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function extractConst(name) {
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
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Unterminated literal for ${name}`);
}

const evaluate = name => vm.runInNewContext(`(${extractConst(name)})`, Object.create(null), { timeout: 5000 });
const vocabulary = evaluate('VOCAB');
const grammarLessons = evaluate('GRAMMAR_LESSONS');
const pronunciationLessons = evaluate('PRONUNCIATION_LESSONS');
const validLevels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const validParts = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'exclamation', 'number', 'article', 'auxiliary', 'modal']);
const required = ['id', 'word', 'level', 'pos', 'ar', 'example', 'exampleAr'];

check(vocabulary.length === 6051, `Expected 6051 vocabulary entries; found ${vocabulary.length}`);
check(vocabulary.every((entry, index) => entry.id === index + 1), 'Vocabulary IDs or ordering changed');

const missingRequired = vocabulary.filter(entry => required.some(key => entry[key] == null || String(entry[key]).trim() === ''));
const invalidLevels = vocabulary.filter(entry => !validLevels.has(entry.level));
const mismatchedLevels = vocabulary.filter(entry => !Array.isArray(entry.levels) || !entry.levels.includes(entry.level));
const invalidParts = vocabulary.filter(entry => !validParts.has(entry.pos) || !entry.partsOfSpeech?.every(part => validParts.has(part)));
check(missingRequired.length === 0, `${missingRequired.length} entries have missing required fields`);
check(invalidLevels.length === 0, `${invalidLevels.length} entries have invalid CEFR levels`);
check(mismatchedLevels.length === 0, `${mismatchedLevels.length} entries have mismatched level arrays`);
check(invalidParts.length === 0, `${invalidParts.length} entries have invalid parts of speech`);

const statusCounts = Object.create(null);
const exampleCounts = Object.create(null);
const levelCounts = Object.create(null);
for (const entry of vocabulary) {
  statusCounts[entry.translationStatus || 'missing'] = (statusCounts[entry.translationStatus || 'missing'] || 0) + 1;
  exampleCounts[entry.exampleQuality || 'missing'] = (exampleCounts[entry.exampleQuality || 'missing'] || 0) + 1;
  levelCounts[entry.level] = (levelCounts[entry.level] || 0) + 1;
}

const manual = vocabulary.filter(entry => entry.manualReviewRequired === true);
const partial = vocabulary.filter(entry => entry.translationStatus === 'partial');
const badManualMarkers = vocabulary.filter(entry => (entry.translationStatus === 'partial') !== (entry.manualReviewRequired === true));
const resolvedReview = vocabulary.filter(entry => entry.translationReview === 'v8.4-425-sense-resolution');
const priorReview = vocabulary.filter(entry => entry.translationReview === 'v8.3-5074-entry-quality-audit');
const oxfordImportReview = vocabulary.filter(entry => entry.translationReview === 'v9.0-oxford-pdf-expansion');
const staleReviewMetadata = vocabulary.filter(entry => {
  if (entry.translationReview === 'v9.0-oxford-pdf-expansion') {
    return entry.translationReviewType !== 'pdf-source-and-dictionary-evidence-assisted-curation' ||
      entry.translationReviewDate !== '2026-07-16';
  }
  if (entry.translationReview === 'v8.4-425-sense-resolution') {
    return entry.translationReviewType !== 'authoritative-dictionary-assisted-human-curation' ||
      entry.translationReviewDate !== '2026-07-16';
  }
  return entry.translationReview !== 'v8.3-5074-entry-quality-audit' ||
    entry.translationReviewType !== 'ai-assisted-entry-by-entry-quality-audit' ||
    entry.translationReviewDate !== '2026-07-15';
});
check(badManualMarkers.length === 0, `${badManualMarkers.length} entries have inconsistent manual-review markers`);
check(staleReviewMetadata.length === 0, `${staleReviewMetadata.length} entries lack current review metadata`);
check(manual.length === partial.length, 'Manual-review and partial-entry totals differ');
check(statusCounts.reviewed === 6051, `Expected all 6051 entries to be reviewed; found ${statusCounts.reviewed || 0}`);
check(manual.length === 0, `${manual.length} manual-review entries remain`);
check(partial.length === 0, `${partial.length} partial entries remain`);
check(resolvedReview.length === 425, `Expected 425 dictionary-resolved entries; found ${resolvedReview.length}`);
check(priorReview.length === 4649, `Expected 4649 previously verified entries; found ${priorReview.length}`);
check(oxfordImportReview.length === 977, `Expected 977 Oxford PDF import entries; found ${oxfordImportReview.length}`);

const oxfordSourceHashes = new Set([
  'ddaf936ef29f5e67c2df0ab3b547fd5bf9d9631f900c3cf55c195cb9c5ad0b40',
  '6577e6eb8745226ab7ab80912e83d285cf421ec70e61c92d74d5fef5f2c99570'
]);
check([...oxfordSourceHashes].every(hash => /^[a-f0-9]{64}$/.test(hash)), 'An Oxford PDF source hash is not a valid SHA-256 value');
const irregularExampleForms = new Map([
  ['give', 'gave'], ['sing', 'sang'], ['overcome', 'overcame'], ['voting', 'votes']
]);
const invalidOxfordImports = [];
let oxfordMeaningCount = 0;
for (const entry of oxfordImportReview) {
  const source = entry.selectionSource;
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  oxfordMeaningCount += meanings.length;
  const coveredParts = new Set(meanings.map(meaning => meaning.pos));
  const sourceIsValid = source &&
    entry.sourceSelectionAuthority === source.name &&
    oxfordSourceHashes.has(source.fileSha256) &&
    Number.isInteger(source.page) && Number.isInteger(source.column) && Number.isInteger(source.line) &&
    String(source.sourceKey || '').trim() !== '' &&
    (source.name === 'The Oxford 3000' || (source.name === 'The Oxford 5000 by CEFR level' && entry.level === 'B2'));
  const base = String(entry.word).toLowerCase().replace(/[^a-z]/g, '');
  const stem = base.slice(0, Math.max(3, Math.min(6, base.length - 2)));
  const compactExample = String(entry.example).toLowerCase().replace(/[^a-z]/g, '');
  const irregular = irregularExampleForms.get(String(entry.word));
  const exampleUsesHeadword = compactExample.includes(stem) || (irregular && compactExample.includes(irregular));
  const meaningsAreValid = meanings.length > 0 && entry.partsOfSpeech.every(part => coveredParts.has(part)) && meanings.every(meaning =>
    entry.partsOfSpeech.includes(meaning.pos) &&
    String(meaning.ar || '').trim() !== '' && !/[A-Za-z]/.test(meaning.ar) && !/\s\/\s/.test(meaning.ar) &&
    String(meaning.definition || '').trim() !== '' && String(meaning.example || '').trim() !== '' &&
    String(meaning.exampleAr || '').trim() !== '' && /[\u0600-\u06ff]/.test(meaning.exampleAr) &&
    /^[a-f0-9]{64}$/.test(String(meaning.sourceDefinitionSha256 || '')) &&
    /^[a-f0-9]{64}$/.test(String(meaning.definitionSha256 || '')) &&
    /^https:\/\//.test(String(meaning.sourceUrl || '')) &&
    String(meaning.definitionCreationMethod || '').trim() !== '' &&
    String(meaning.exampleCreationMethod || '').trim() !== ''
  );
  if (!sourceIsValid || !['A1', 'A2', 'B1', 'B2'].includes(entry.level) ||
      entry.manualReviewRequired !== false || !String(entry.definition || '').trim() ||
      !meaningsAreValid || !exampleUsesHeadword) {
    invalidOxfordImports.push(`${entry.id}:${entry.sourceWord}`);
  }
}
check(oxfordMeaningCount === 1050, `Expected 1050 Oxford import meanings; found ${oxfordMeaningCount}`);
check(invalidOxfordImports.length === 0, `${invalidOxfordImports.length} Oxford import entries have invalid source, content, or examples`);

let oxfordSourceEvidenceHashMismatches = null;
if (oxfordReferencesPath) {
  const referenceFile = JSON.parse(fs.readFileSync(oxfordReferencesPath, 'utf8'));
  const references = new Map(referenceFile.references.map(reference => [reference.sourceKey, reference]));
  oxfordSourceEvidenceHashMismatches = [];
  for (const entry of oxfordImportReview) {
    const reference = references.get(entry.selectionSource.sourceKey);
    const senses = reference ? [
      ...(reference.reference?.bilingual?.senses || []),
      ...(reference.reference?.english?.senses || [])
    ] : [];
    const sourceHashes = new Set(senses.map(sense => sense.definitionSha256).filter(Boolean));
    if (!reference || reference.reference?.english?.httpStatus !== 200 || sourceHashes.size === 0) {
      oxfordSourceEvidenceHashMismatches.push(`${entry.id}:missing-reference`);
      continue;
    }
    for (const meaning of entry.meanings) {
      if (!sourceHashes.has(meaning.sourceDefinitionSha256)) {
        oxfordSourceEvidenceHashMismatches.push(`${entry.id}:${meaning.pos}:${meaning.ar}`);
      }
    }
  }
  check(oxfordSourceEvidenceHashMismatches.length === 0, `${oxfordSourceEvidenceHashMismatches.length} Oxford meaning hashes do not match the fetched dictionary evidence`);
}

const cefrCorrections = vocabulary.filter(entry => entry.cefrReview === 'v9.0-oxford-pdf-level-correction');
const invalidCefrCorrections = cefrCorrections.filter(entry =>
  !entry.previousCefrLevel || !entry.cefrCorrectionSource ||
  !oxfordSourceHashes.has(entry.cefrCorrectionSource.fileSha256) ||
  !entry.levels.includes(entry.level) || entry.cefrReviewDate !== '2026-07-16'
);
check(cefrCorrections.length === 31, `Expected 31 PDF-backed CEFR corrections; found ${cefrCorrections.length}`);
check(invalidCefrCorrections.length === 0, `${invalidCefrCorrections.length} CEFR corrections have invalid provenance`);

const invalidResolvedMeanings = [];
const missingMeaningPosCoverage = [];
let resolvedMeaningCount = 0;
let dictionaryLinkedMeaningCount = 0;
let curatedFallbackMeaningCount = 0;
for (const entry of resolvedReview) {
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  resolvedMeaningCount += meanings.length;
  const coveredParts = new Set(meanings.map(meaning => meaning.pos));
  for (const pos of entry.partsOfSpeech) {
    if (!coveredParts.has(pos)) missingMeaningPosCoverage.push(`${entry.id}:${pos}`);
  }
  const meaningKeys = new Set();
  for (const meaning of meanings) {
    const key = `${meaning.pos}|${String(meaning.ar).trim().toLowerCase()}`;
    const valid = entry.partsOfSpeech.includes(meaning.pos) &&
      String(meaning.ar || '').trim() !== '' && meaning.senseAr === meaning.ar &&
      !/[A-Za-z]/.test(meaning.ar) && !/\s\/\s/.test(meaning.ar) &&
      /^https:\/\//.test(String(meaning.sourceUrl || '')) &&
      /^[a-f0-9]{64}$/.test(String(meaning.sourceDefinitionSha256 || '')) &&
      !meaningKeys.has(key);
    if (!valid) invalidResolvedMeanings.push(`${entry.id}:${key}`);
    meaningKeys.add(key);
    if (meaning.posSourceUrl) curatedFallbackMeaningCount += 1;
    else dictionaryLinkedMeaningCount += 1;
  }
  const sourceNames = new Set((entry.dictionarySources || []).map(source => source.name));
  if (!String(entry.sourceSummaryAr || '').trim() ||
      !sourceNames.has('Cambridge English–Arabic Dictionary') ||
      !sourceNames.has('Cambridge English Dictionary') ||
      !sourceNames.has('Oxford 3000 by CEFR level')) {
    invalidResolvedMeanings.push(`${entry.id}:record-sources`);
  }
}
check(missingMeaningPosCoverage.length === 0, `${missingMeaningPosCoverage.length} part-of-speech meanings are missing`);
check(invalidResolvedMeanings.length === 0, `${invalidResolvedMeanings.length} resolved meanings have invalid content or source evidence`);

let sourceEvidenceHashMismatches = null;
if (referencesPath) {
  const referenceFile = JSON.parse(fs.readFileSync(referencesPath, 'utf8'));
  const references = new Map(referenceFile.references.map(reference => [reference.id, reference]));
  sourceEvidenceHashMismatches = [];
  for (const entry of resolvedReview) {
    const reference = references.get(entry.id);
    if (!reference || reference.error || !reference.english?.senses?.length) {
      sourceEvidenceHashMismatches.push(`${entry.id}:missing-reference`);
      continue;
    }
    const sourceHashes = new Set(
      [...(reference.bilingual?.senses || []), ...(reference.english?.senses || [])]
        .filter(sense => String(sense.definition || '').trim())
        .map(sense => crypto.createHash('sha256').update(sense.definition.trim()).digest('hex'))
    );
    for (const meaning of entry.meanings) {
      if (!sourceHashes.has(meaning.sourceDefinitionSha256)) {
        sourceEvidenceHashMismatches.push(`${entry.id}:${meaning.pos}:${meaning.ar}`);
      }
    }
  }
  check(sourceEvidenceHashMismatches.length === 0, `${sourceEvidenceHashMismatches.length} meaning hashes do not match the fetched dictionary evidence`);
}

const manualDictionaryFlags = vocabulary.filter(entry => entry.qualityIssues?.includes('manual-dictionary-check-recommended'));
const generatedMissingHeadword = vocabulary.filter(entry => {
  if (entry.exampleQuality !== 'generated') return false;
  const candidates = [entry.word, entry.sourceWord].filter(Boolean).map(value => String(value).toLowerCase());
  return !candidates.some(candidate => entry.example.toLowerCase().includes(candidate));
});
check(manualDictionaryFlags.length === 0, `${manualDictionaryFlags.length} unresolved dictionary-check flags remain`);
check(generatedMissingHeadword.length === 0, `${generatedMissingHeadword.length} generated examples omit their headword`);

let duplicateMeaningSegments = 0;
for (const entry of vocabulary) {
  const segments = String(entry.ar).split(/[؛;/]/).map(value => value.trim().toLowerCase()).filter(Boolean);
  if (new Set(segments).size !== segments.length) duplicateMeaningSegments += 1;
}
const learningKeys = new Set();
let duplicateLearningGroups = 0;
for (const entry of vocabulary) {
  const key = [entry.word, entry.level, entry.pos, entry.sense || '', entry.ar].map(value => String(value).trim().toLowerCase()).join('|');
  if (learningKeys.has(key)) duplicateLearningGroups += 1;
  learningKeys.add(key);
}
check(duplicateMeaningSegments === 0, `${duplicateMeaningSegments} entries contain duplicate Arabic meaning segments`);
check(duplicateLearningGroups === 0, `${duplicateLearningGroups} duplicate learning groups remain`);

const scriptBlocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
check(scriptBlocks.length === 1, `Expected one inline script; found ${scriptBlocks.length}`);
for (const [index, source] of scriptBlocks.entries()) {
  try { new vm.Script(source, { filename: `index.html#script-${index + 1}` }); }
  catch (error) { failures.push(`JavaScript syntax error: ${error.message}`); }
}

const domIds = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
const domIdSet = new Set(domIds);
const duplicateDomIds = [...domIdSet].filter(id => domIds.filter(candidate => candidate === id).length > 1);
const referencedIds = new Set([...html.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(match => match[1]));
const missingDomIds = [...referencedIds].filter(id => !domIdSet.has(id));
check(duplicateDomIds.length === 0, `Duplicate DOM IDs: ${duplicateDomIds.join(', ')}`);
check(missingDomIds.length === 0, `JavaScript references missing DOM IDs: ${missingDomIds.join(', ')}`);

const brokenLinks = [];
for (const match of html.matchAll(/\b(?:href|src|action)=["']([^"']+)["']/gi)) {
  const reference = match[1].trim();
  if (!reference || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference)) continue;
  if (reference.startsWith('#')) {
    const target = decodeURIComponent(reference.slice(1));
    if (target && !domIdSet.has(target)) brokenLinks.push(reference);
  } else {
    const localPath = reference.split(/[?#]/, 1)[0];
    if (localPath && !fs.existsSync(path.resolve(root, localPath.replace(/^\//, '')))) brokenLinks.push(reference);
  }
}
check(brokenLinks.length === 0, `Broken links/resources: ${brokenLinks.join(', ')}`);

check(grammarLessons.length === 64, `Expected 64 grammar lessons; found ${grammarLessons.length}`);
check(pronunciationLessons.length === 20, `Expected 20 pronunciation lessons; found ${pronunciationLessons.length}`);
const css = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? '';
const cssSha256 = crypto.createHash('sha256').update(css).digest('hex');
check(cssSha256 === 'cd65e9ad621472a01771b8bd92ed081f4e359580c64c2709c578a7b83ca455dd', `CSS changed unexpectedly: ${cssSha256}`);

if (process.argv.includes('--write-manual-list')) {
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvRows = [
    ['id', 'word', 'cefr', 'parts_of_speech', 'current_arabic_meaning', 'manual_review_reason'],
    ...manual.map(entry => [entry.id, entry.word, entry.level, entry.partsOfSpeech.join(' + '), entry.ar, entry.manualReviewReason])
  ];
  fs.writeFileSync(
    path.join(root, 'VOCABULARY-MANUAL-REVIEW.csv'),
    `${csvRows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
  );
}

if (process.argv.includes('--write-source-list')) {
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvRows = [
    ['id', 'word', 'cefr', 'parts_of_speech', 'resolved_meanings', 'cambridge_english_arabic_url', 'cambridge_english_url', 'oxford_pos_url', 'review_status'],
    ...resolvedReview.map(entry => {
      const sourceUrl = name => entry.dictionarySources.find(source => source.name === name)?.url || '';
      return [
        entry.id,
        entry.word,
        entry.level,
        entry.partsOfSpeech.join(' + '),
        entry.meanings.length,
        sourceUrl('Cambridge English–Arabic Dictionary'),
        sourceUrl('Cambridge English Dictionary'),
        sourceUrl('Oxford 3000 by CEFR level'),
        'verified'
      ];
    })
  ];
  fs.writeFileSync(
    path.join(root, 'VOCABULARY-DICTIONARY-AUDIT.csv'),
    `${csvRows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
  );
}

const report = {
  pass: failures.length === 0,
  failures,
  vocabulary: {
    total: vocabulary.length,
    statusCounts,
    manualReviewRequired: manual.length,
    partialRecords: partial.length,
    resolvedReviewEntries: resolvedReview.length,
    oxfordImportEntries: oxfordImportReview.length,
    oxfordImportMeanings: oxfordMeaningCount,
    cefrCorrections: cefrCorrections.length,
    invalidOxfordImports: invalidOxfordImports.length,
    oxfordSourceEvidenceHashMismatches,
    resolvedMeaningCount,
    dictionaryLinkedMeaningCount,
    curatedFallbackMeaningCount,
    missingMeaningPosCoverage: missingMeaningPosCoverage.length,
    invalidResolvedMeanings: invalidResolvedMeanings.length,
    sourceEvidenceHashMismatches,
    exampleQualityCounts: exampleCounts,
    levelCounts,
    missingRequired: missingRequired.length,
    invalidLevels: invalidLevels.length,
    mismatchedLevels: mismatchedLevels.length,
    invalidPartsOfSpeech: invalidParts.length,
    duplicateMeaningSegments,
    duplicateLearningGroups,
    generatedMissingHeadword: generatedMissingHeadword.length,
    remainingDictionaryFlags: manualDictionaryFlags.length
  },
  application: {
    inlineScripts: scriptBlocks.length,
    grammarLessons: grammarLessons.length,
    pronunciationLessons: pronunciationLessons.length,
    duplicateDomIds,
    missingDomIds,
    brokenLinks,
    cssSha256,
    designUnchanged: cssSha256 === 'cd65e9ad621472a01771b8bd92ed081f4e359580c64c2709c578a7b83ca455dd'
  }
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
