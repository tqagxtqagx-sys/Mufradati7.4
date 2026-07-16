import fs from 'node:fs';

const indexPath = process.argv[2] ?? new URL('../index.html', import.meta.url);
const outputPath = process.argv[3];
if (!outputPath) throw new Error('Usage: node scripts/fetch-dictionary-references.mjs [index.html] <output.json>');

function extractVocabulary(html) {
  const marker = 'const VOCAB=';
  const start = html.indexOf(marker) + marker.length;
  if (start < marker.length) throw new Error('Missing VOCAB');
  let depth = 0, quote = '', escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error('Unterminated VOCAB');
}

const entities = {
  amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>', hellip: '…',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“'
};

function text(value = '') {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => entities[name] ?? whole)
    .replace(/\s+/g, ' ')
    .trim();
}

function contextLabels(html, definitionAt) {
  const context = html.slice(Math.max(0, definitionAt - 30000), definitionAt);
  const positions = [...context.matchAll(/<span class="pos dpos"[^>]*>([^<]+)<\/span>/g)];
  const phrases = [...context.matchAll(/<(?:b|span) class="phrase dphrase">([\s\S]*?)<\/(?:b|span)>/g)];
  const guides = [...context.matchAll(/<span class="guideword dsense_gw">([\s\S]*?)<\/span>/g)];
  const pos = positions.at(-1);
  const phrase = phrases.at(-1);
  const guide = guides.at(-1);
  return {
    pos: text(pos?.[1]),
    phrase: phrase && (!pos || phrase.index > pos.index) ? text(phrase[1]) : '',
    guideword: guide && (!pos || guide.index > pos.index) ? text(guide[1]) : ''
  };
}

function parseBilingual(html, sourceUrl) {
  const senses = [];
  const pattern = /<div class="def ddef_d db">([\s\S]*?)<\/div>\s*<\/div><div class="def-body ddef_b">[\s\S]*?<span class="trans dtrans dtrans-se " lang="ar">([\s\S]*?)<\/span>([\s\S]*?)<\/div><\/div>/g;
  let match;
  while ((match = pattern.exec(html))) {
    const labels = contextLabels(html, match.index);
    const example = match[3].match(/<span class="eg deg">([\s\S]*?)<\/span>/);
    senses.push({
      ...labels,
      definition: text(match[1]),
      translationAr: text(match[2]),
      example: text(example?.[1]),
      sourceUrl
    });
  }
  return senses;
}

function parseEnglish(html, sourceUrl) {
  const senses = [];
  const pattern = /<div class="def ddef_d db">([\s\S]*?)<\/div>/g;
  let match;
  while ((match = pattern.exec(html))) {
    const labels = contextLabels(html, match.index);
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 10000);
    const example = after.match(/<span class="eg deg">([\s\S]*?)<\/span>/);
    senses.push({ ...labels, definition: text(match[1]), example: text(example?.[1]), sourceUrl });
  }
  return senses;
}

async function fetchPage(url, parser) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; MufradatiVocabularyAudit/1.0)' },
    redirect: 'follow'
  });
  const html = await response.text();
  return { requestedUrl: url, finalUrl: response.url, httpStatus: response.status, senses: parser(html, response.url) };
}

const vocabulary = extractVocabulary(fs.readFileSync(indexPath, 'utf8')).filter(entry =>
  entry.manualReviewRequired || entry.translationReview === 'v8.4-425-sense-resolution'
);
if (vocabulary.length !== 425) throw new Error(`Expected 425 dictionary-review records, found ${vocabulary.length}`);
const results = new Array(vocabulary.length);
let nextIndex = 0, completed = 0;

async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= vocabulary.length) return;
    const entry = vocabulary[index];
    const slug = encodeURIComponent(entry.word.toLowerCase().replaceAll(' ', '-'));
    try {
      const [bilingual, english] = await Promise.all([
        fetchPage(`https://dictionary.cambridge.org/dictionary/english-arabic/${slug}`, parseBilingual),
        fetchPage(`https://dictionary.cambridge.org/dictionary/english/${slug}`, parseEnglish)
      ]);
      results[index] = {
        id: entry.id,
        word: entry.word,
        level: entry.level,
        requiredPartsOfSpeech: entry.partsOfSpeech,
        bilingual,
        english
      };
    } catch (error) {
      results[index] = { id: entry.id, word: entry.word, level: entry.level, requiredPartsOfSpeech: entry.partsOfSpeech, error: error.message };
    }
    completed += 1;
    if (completed % 25 === 0 || completed === vocabulary.length) console.log(`fetched ${completed}/${vocabulary.length}`);
  }
}

await Promise.all(Array.from({ length: 8 }, worker));
fs.writeFileSync(outputPath, JSON.stringify({
  retrievedAt: new Date().toISOString(),
  references: results
}, null, 2));
console.log(JSON.stringify({
  total: results.length,
  failures: results.filter(result => result.error).length,
  englishCovered: results.filter(result => result.english?.senses.length).length,
  bilingualCovered: results.filter(result => result.bilingual?.senses.length).length,
  englishSenseCount: results.reduce((sum, result) => sum + (result.english?.senses.length ?? 0), 0),
  bilingualSenseCount: results.reduce((sum, result) => sum + (result.bilingual?.senses.length ?? 0), 0)
}, null, 2));
