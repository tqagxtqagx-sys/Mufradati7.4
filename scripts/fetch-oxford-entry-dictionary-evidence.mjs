import fs from 'node:fs';
import crypto from 'node:crypto';

const auditPath = process.argv[2];
const outputPath = process.argv[3];
const resumePath = process.argv.find(argument => argument.startsWith('--resume='))?.slice('--resume='.length);
if (!auditPath || !outputPath) {
  throw new Error('Usage: node scripts/fetch-oxford-entry-dictionary-evidence.mjs <source-audit.json> <output.json>');
}

const entities = {
  amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>', hellip: '…',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“'
};

function plainText(value = '') {
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
  const context = html.slice(Math.max(0, definitionAt - 40000), definitionAt);
  const positions = [...context.matchAll(/<span class="pos dpos"[^>]*>([^<]+)<\/span>/g)];
  const phrases = [...context.matchAll(/<(?:b|span) class="phrase dphrase">([\s\S]*?)<\/(?:b|span)>/g)];
  const guides = [...context.matchAll(/<span class="guideword dsense_gw">([\s\S]*?)<\/span>/g)];
  const pos = positions.at(-1);
  const phrase = phrases.at(-1);
  const guide = guides.at(-1);
  return {
    pos: plainText(pos?.[1]),
    phrase: phrase && (!pos || phrase.index > pos.index) ? plainText(phrase[1]) : '',
    guideword: guide && (!pos || guide.index > pos.index) ? plainText(guide[1]) : ''
  };
}

function parseSenses(html, sourceUrl, bilingual) {
  const senses = [];
  const definitionPattern = /<div class="def ddef_d db">([\s\S]*?)<\/div>/g;
  let match;
  while ((match = definitionPattern.exec(html))) {
    const labels = contextLabels(html, match.index);
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 14000);
    const nextDefinition = after.search(/<div class="def ddef_d db">/);
    const body = nextDefinition >= 0 ? after.slice(0, nextDefinition) : after;
    const translation = bilingual ? body.match(/<span class="trans dtrans dtrans-se [^"]*"[^>]*lang="ar"[^>]*>([\s\S]*?)<\/span>/) : null;
    const example = body.match(/<span class="eg deg">([\s\S]*?)<\/span>/);
    const definition = plainText(match[1]);
    if (!definition) continue;
    senses.push({
      ...labels,
      definition,
      definitionSha256: crypto.createHash('sha256').update(definition).digest('hex'),
      translationAr: plainText(translation?.[1]),
      example: plainText(example?.[1]),
      sourceUrl
    });
  }
  return senses;
}

async function fetchPage(url, bilingual) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; MufradatiOxfordPdfAudit/2.0)' },
    redirect: 'follow'
  });
  const html = await response.text();
  return {
    requestedUrl: url,
    finalUrl: response.url,
    httpStatus: response.status,
    pageSha256: crypto.createHash('sha256').update(html).digest('hex'),
    senses: response.ok ? parseSenses(html, response.url, bilingual) : []
  };
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const targets = audit.results.filter(entry => ['missing', 'ambiguous-part-of-speech'].includes(entry.status));
const allHeadwords = [...new Set(targets.map(entry => entry.headword.toLocaleLowerCase('en')))];
const fetchedByHeadword = new Map();
if (resumePath && fs.existsSync(resumePath)) {
  const prior = JSON.parse(fs.readFileSync(resumePath, 'utf8'));
  for (const item of prior.references) {
    const reference = item.reference;
    if (!reference || reference.error) continue;
    fetchedByHeadword.set(item.headword.toLocaleLowerCase('en'), reference);
  }
}
const headwords = allHeadwords.filter(headword => {
  const prior = fetchedByHeadword.get(headword);
  return !prior || prior.bilingual?.httpStatus === 429 || prior.english?.httpStatus === 429;
});
let nextIndex = 0;
let completed = 0;

async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= headwords.length) return;
    const headword = headwords[index];
    const slug = encodeURIComponent(headword.replaceAll(' ', '-'));
    try {
      const [bilingual, english] = await Promise.all([
        fetchPage(`https://dictionary.cambridge.org/dictionary/english-arabic/${slug}`, true),
        fetchPage(`https://dictionary.cambridge.org/dictionary/english/${slug}`, false)
      ]);
      fetchedByHeadword.set(headword, { headword, bilingual, english });
    } catch (error) {
      fetchedByHeadword.set(headword, { headword, error: error.message });
    }
    completed += 1;
    if (completed % 50 === 0 || completed === headwords.length) console.log(`fetched ${completed}/${headwords.length}`);
  }
}

await Promise.all(Array.from({ length: Number(process.env.FETCH_CONCURRENCY || 8) }, worker));
const references = targets.map(target => ({
  sourceKey: target.sourceKey,
  headword: target.headword,
  level: target.level,
  requiredPartsOfSpeech: target.partsOfSpeech,
  source: target.source,
  sourceLocation: target.sourceLocation,
  reference: fetchedByHeadword.get(target.headword.toLocaleLowerCase('en'))
}));

const payload = {
  retrievedAt: new Date().toISOString(),
  dictionaryNotice: 'Dictionary evidence is used only for meanings and examples. Oxford PDF files remain the sole authority for selection, part of speech, and CEFR level.',
  targetCount: targets.length,
  uniqueHeadwordCount: allHeadwords.length,
  references
};
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

const expectedPos = new Map([
  ['noun', /\bnoun\b/i], ['verb', /\bverb\b/i], ['adjective', /\badjective\b/i],
  ['adverb', /\badverb\b/i], ['pronoun', /\bpronoun\b/i], ['preposition', /\bpreposition\b/i],
  ['conjunction', /\bconjunction\b/i], ['determiner', /\bdeterminer\b/i], ['exclamation', /\bexclamation\b/i],
  ['number', /\bnumber\b/i], ['article', /\barticle\b/i], ['auxiliary', /\bauxiliary verb\b/i],
  ['modal', /\bmodal verb\b/i]
]);
const hasPos = (target, key) => {
  const senses = target.reference?.[key]?.senses ?? [];
  return target.requiredPartsOfSpeech.every(part => senses.some(sense => (expectedPos.get(part) ?? /.*/).test(sense.pos)));
};
console.log(JSON.stringify({
  targetCount: targets.length,
  uniqueHeadwordCount: allHeadwords.length,
  fetchedThisRun: headwords.length,
  fetchFailures: references.filter(item => item.reference?.error).length,
  bilingualPages: references.filter(item => item.reference?.bilingual?.senses.length).length,
  englishPages: references.filter(item => item.reference?.english?.senses.length).length,
  bilingualExactPosCoverage: references.filter(item => hasPos(item, 'bilingual')).length,
  englishExactPosCoverage: references.filter(item => hasPos(item, 'english')).length
}, null, 2));
