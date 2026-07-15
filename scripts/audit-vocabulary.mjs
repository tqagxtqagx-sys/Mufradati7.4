import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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

check(vocabulary.length === 5074, `Expected 5074 vocabulary entries; found ${vocabulary.length}`);
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
const staleReviewMetadata = vocabulary.filter(entry =>
  entry.translationReview !== 'v8.3-5074-entry-quality-audit' ||
  entry.translationReviewType !== 'ai-assisted-entry-by-entry-quality-audit' ||
  entry.translationReviewDate !== '2026-07-15'
);
check(badManualMarkers.length === 0, `${badManualMarkers.length} entries have inconsistent manual-review markers`);
check(staleReviewMetadata.length === 0, `${staleReviewMetadata.length} entries lack current review metadata`);
check(manual.length === partial.length, 'Manual-review and partial-entry totals differ');

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

const report = {
  pass: failures.length === 0,
  failures,
  vocabulary: {
    total: vocabulary.length,
    statusCounts,
    manualReviewRequired: manual.length,
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
