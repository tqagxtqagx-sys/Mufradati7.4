import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const indexPath = process.argv[2] ?? 'index.html';
const sourcePath = process.argv[3];
const outputPath = process.argv[4];
if (!sourcePath || !outputPath) {
  throw new Error('Usage: node scripts/audit-oxford-source-coverage.mjs [index.html] <source.json> <audit.json>');
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
  let depth = 0, quote = '', escaped = false;
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

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceWordBase(entry) {
  return normalize(entry.printedHeadword)
    .replace(/\s+\([^)]+\)$/, '')
    .replace(/(?<=\D)[12]$/, '');
}

function entryAliases(entry) {
  return new Set([entry.word, entry.sourceWord].filter(Boolean).map(normalize));
}

const VARIANT_GROUPS = [
  ['analyse','analyze'],['apologise','apologize'],['behaviour','behavior'],['centre','center'],
  ['colour','color'],['colourful','colorful'],['defence','defense'],['emphasise','emphasize'],
  ['favourite','favorite'],['fulfil','fulfill'],['grey','gray'],['harbour','harbor'],
  ['humour','humor'],['jewellery','jewelry'],['labour','labor'],['licence','license'],
  ['litre','liter'],['metre','meter'],['neighbour','neighbor'],['offence','offense'],
  ['organise','organize'],['practise','practice'],['programme','program'],['realise','realize'],
  ['recognise','recognize'],['rumour','rumor'],['theatre','theater'],['travelling','traveling']
];
const variantMap = new Map();
for (const group of VARIANT_GROUPS) {
  const key = group.map(normalize).sort().join('|');
  for (const word of group) variantMap.set(normalize(word), key);
}
const variantKey = word => variantMap.get(normalize(word)) ?? normalize(word);

function supportedParts(sourceEntry) {
  return sourceEntry.partsOfSpeech.filter(part => part !== 'infinitive marker');
}

function hasPartCoverage(records, sourceEntry) {
  const available = new Set(records.flatMap(record => record.partsOfSpeech ?? [record.pos]));
  return supportedParts(sourceEntry).every(part => available.has(part));
}

function sameHeadword(records, sourceEntry, useVariant = false) {
  const sourceAliases = new Set([sourceEntry.headword, sourceWordBase(sourceEntry)].map(useVariant ? variantKey : normalize));
  return records.filter(record => {
    const aliases = [...entryAliases(record)].map(useVariant ? variantKey : normalize);
    return aliases.some(alias => sourceAliases.has(alias));
  });
}

function classifySourceEntry(sourceEntry, vocabulary) {
  const exactHeadword = sameHeadword(vocabulary, sourceEntry);
  const sameLevel = exactHeadword.filter(record => record.level === sourceEntry.level);
  if (sameLevel.length && hasPartCoverage(sameLevel, sourceEntry)) {
    return { status: 'existing-exact', recordIds: sameLevel.map(record => record.id) };
  }

  const levels = [...new Set(exactHeadword.map(record => record.level))];
  const levelCoverage = levels
    .map(level => ({ level, records: exactHeadword.filter(record => record.level === level) }))
    .filter(group => hasPartCoverage(group.records, sourceEntry));
  if (levelCoverage.length) {
    return {
      status: levelCoverage.length === 1 ? 'existing-level-mismatch' : 'ambiguous-level-mismatch',
      candidateLevels: levelCoverage.map(group => group.level),
      recordIds: levelCoverage.flatMap(group => group.records.map(record => record.id))
    };
  }

  const variantHeadword = sameHeadword(vocabulary, sourceEntry, true).filter(record => !exactHeadword.includes(record));
  const variantSameLevel = variantHeadword.filter(record => record.level === sourceEntry.level);
  if (variantSameLevel.length && hasPartCoverage(variantSameLevel, sourceEntry)) {
    return { status: 'existing-spelling-variant', recordIds: variantSameLevel.map(record => record.id) };
  }
  const variantLevels = [...new Set(variantHeadword.map(record => record.level))];
  const variantLevelCoverage = variantLevels
    .map(level => ({ level, records: variantHeadword.filter(record => record.level === level) }))
    .filter(group => hasPartCoverage(group.records, sourceEntry));
  if (variantLevelCoverage.length) {
    return {
      status: variantLevelCoverage.length === 1 ? 'variant-level-mismatch' : 'ambiguous-variant-level-mismatch',
      candidateLevels: variantLevelCoverage.map(group => group.level),
      recordIds: variantLevelCoverage.flatMap(group => group.records.map(record => record.id))
    };
  }

  if (sameLevel.length || exactHeadword.length || variantHeadword.length) {
    return {
      status: 'ambiguous-part-of-speech',
      candidateLevels: [...new Set([...exactHeadword, ...variantHeadword].map(record => record.level))],
      recordIds: [...new Set([...sameLevel, ...exactHeadword, ...variantHeadword].map(record => record.id))]
    };
  }
  return { status: 'missing', recordIds: [] };
}

const html = fs.readFileSync(indexPath, 'utf8');
const vocabulary = vm.runInNewContext(`(${extractConst(html, 'VOCAB')})`, Object.create(null), { timeout: 5000 });
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sourceEntries = source.combinedUniqueEntries;
const results = sourceEntries.map(sourceEntry => ({ ...sourceEntry, ...classifySourceEntry(sourceEntry, vocabulary) }));

const statusCounts = Object.create(null);
const sourceStatusCounts = Object.create(null);
for (const result of results) {
  statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  const sourceName = result.source === 'The Oxford 3000' ? 'oxford3000' : 'oxford5000B2';
  sourceStatusCounts[sourceName] ??= Object.create(null);
  sourceStatusCounts[sourceName][result.status] = (sourceStatusCounts[sourceName][result.status] || 0) + 1;
}

const exactRecordKeys = new Map();
const duplicateExistingRecords = [];
for (const record of vocabulary) {
  const key = [normalize(record.word), record.level, [...(record.partsOfSpeech ?? [record.pos])].sort().join('+'), normalize(record.sense), normalize(record.ar)].join('|');
  if (exactRecordKeys.has(key)) duplicateExistingRecords.push([exactRecordKeys.get(key), record.id]);
  else exactRecordKeys.set(key, record.id);
}

const headwordGroups = new Map();
for (const record of vocabulary) {
  const key = normalize(record.sourceWord || record.word);
  const group = headwordGroups.get(key) ?? [];
  group.push(record);
  headwordGroups.set(key, group);
}
const sameHeadwordDifferentLevels = [...headwordGroups.entries()]
  .filter(([, records]) => new Set(records.map(record => record.level)).size > 1)
  .map(([headword, records]) => ({ headword, recordIds: records.map(record => record.id), levels: [...new Set(records.map(record => record.level))] }));
const sameHeadwordDifferentParts = [...headwordGroups.entries()]
  .filter(([, records]) => new Set(records.flatMap(record => record.partsOfSpeech ?? [record.pos])).size > 1)
  .map(([headword, records]) => ({ headword, recordIds: records.map(record => record.id), partsOfSpeech: [...new Set(records.flatMap(record => record.partsOfSpeech ?? [record.pos]))] }));

const output = {
  generatedAt: new Date().toISOString(),
  sourceSummary: source.summary,
  applicationBefore: {
    total: vocabulary.length,
    levelCounts: Object.fromEntries(['A1','A2','B1','B2','C1','C2'].map(level => [level, vocabulary.filter(record => record.level === level).length]))
  },
  coverageSummary: {
    totalSourceEntries: results.length,
    statusCounts,
    bySource: sourceStatusCounts,
    duplicateExistingRecords: duplicateExistingRecords.length,
    sameHeadwordDifferentLevels: sameHeadwordDifferentLevels.length,
    sameHeadwordDifferentPartsOfSpeech: sameHeadwordDifferentParts.length
  },
  results,
  existingDataObservations: {
    duplicateExistingRecords,
    sameHeadwordDifferentLevels,
    sameHeadwordDifferentPartsOfSpeech: sameHeadwordDifferentParts
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ source: output.sourceSummary, applicationBefore: output.applicationBefore, coverage: output.coverageSummary }, null, 2));
