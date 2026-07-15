import fs from 'node:fs';
import crypto from 'node:crypto';

const INDEX = new URL('../index.html', import.meta.url);
const REVIEW_DATE = '2026-07-15';
const REVIEW_ID = 'v8.3-5074-entry-quality-audit';
const REVIEW_TYPE = 'ai-assisted-entry-by-entry-quality-audit';

function extractArray(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing ${marker}`);
  const start = markerAt + marker.length;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1, value: JSON.parse(source.slice(start, i + 1)) };
    }
  }
  throw new Error(`Unterminated array after ${marker}`);
}

function unique(values = []) {
  return [...new Set(values.map(value => typeof value === 'string' ? value.trim() : value).filter(Boolean))];
}

function patchEntry(entry, patch) {
  const { removeIssues = [], addIssues = [], acceptedAnswersAdd = [], ...fields } = patch;
  Object.assign(entry, fields);
  entry.qualityIssues = unique(entry.qualityIssues).filter(issue => !removeIssues.includes(issue));
  entry.qualityIssues = unique([...entry.qualityIssues, ...addIssues]);
  entry.acceptedAnswers = unique([...(entry.acceptedAnswers ?? []), ...acceptedAnswersAdd]);
  if (entry.qualityIssues.length === 0) delete entry.qualityIssues;
  if (entry.acceptedAnswers.length === 0) delete entry.acceptedAnswers;
}

const curated = {
  14: {
    translationStatus: 'reviewed', translationConfidence: 'high',
    removeIssues: ['missing-sense', 'sense-level-review-needed']
  },
  95: {
    translationStatus: 'reviewed', translationConfidence: 'high', exampleQuality: 'reviewed',
    example: 'She felt all right after a short rest.',
    exampleAr: 'شعرت بأنها بخير بعد راحة قصيرة.',
    removeIssues: ['missing-sense', 'generated-example', 'sense-level-review-needed']
  },
  2082: {
    sense: 'to make or grow something', senseAr: 'إنتاج شيء أو صنعه', ar: 'ينتج؛ يصنع',
    translationStatus: 'reviewed', translationConfidence: 'high', exampleQuality: 'reviewed',
    example: 'This farm can produce enough food for the village.',
    exampleAr: 'تستطيع هذه المزرعة إنتاج ما يكفي من الغذاء للقرية.',
    removeIssues: ['generated-example', 'sense-level-review-needed', 'duplicate-level-sense-unresolved']
  },
  2083: {
    sense: 'to organize and supervise a film, play, or programme',
    senseAr: 'إنتاج عمل فني أو إعلامي والإشراف عليه', ar: 'يُنتج عملًا فنيًا أو إعلاميًا',
    translationStatus: 'reviewed', translationConfidence: 'high', exampleQuality: 'reviewed',
    example: 'She will produce a documentary about coastal communities.',
    exampleAr: 'ستُنتج فيلمًا وثائقيًا عن المجتمعات الساحلية.',
    removeIssues: ['generated-example', 'sense-level-review-needed', 'duplicate-level-sense-unresolved']
  },
  2852: {
    exampleQuality: 'reviewed',
    example: 'She is used to working under pressure.',
    exampleAr: 'هي معتادة على العمل تحت الضغط.',
    removeIssues: ['generated-example']
  },
  3305: {
    sense: 'a product intended to last for several years', senseAr: 'سلعة مصممة لتدوم عدة سنوات',
    ar: 'سلعة معمّرة؛ سلع معمّرة', exampleQuality: 'reviewed',
    example: 'A refrigerator is a consumer durable designed to last for years.',
    exampleAr: 'الثلاجة سلعة معمّرة مصممة لتدوم سنوات.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3449: {
    sense: 'a dated term for a Roma person that may be offensive',
    senseAr: 'لفظ قديم لشخص من شعب الروما وقد يكون مسيئًا',
    ar: 'من شعب الروما؛ «غجري» لفظ قديم قد يكون مسيئًا', exampleQuality: 'reviewed',
    example: 'The document uses the dated term “gypsy”, but “Roma person” is often preferred.',
    exampleAr: 'تستخدم الوثيقة لفظ «gypsy» القديم، لكن غالبًا ما يُفضَّل قول «شخص من الروما».',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3456: {
    sense: 'to keep a thought or feeling, especially a negative one, in your mind',
    senseAr: 'يضمر فكرة أو شعورًا، ولا سيما السلبي منه', exampleQuality: 'reviewed',
    example: 'They may harbour doubts about the proposal.',
    exampleAr: 'قد يضمرون شكوكًا بشأن المقترح.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3649: {
    sense: 'to take more money from a bank account than it contains',
    senseAr: 'يسحب من الحساب البنكي أكثر من رصيده', exampleQuality: 'reviewed',
    example: 'Be careful not to overdraw your bank account.',
    exampleAr: 'احذر أن تسحب من حسابك أكثر من الرصيد المتاح.',
    acceptedAnswersAdd: ['overdrew', 'overdrawn'],
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3673: {
    sense: 'the process of adapting something to an individual user',
    senseAr: 'عملية تكييف شيء ليناسب مستخدمًا بعينه', exampleQuality: 'reviewed',
    example: 'Personalisation allows the service to adapt to each user.',
    exampleAr: 'يتيح التخصيص للخدمة أن تتكيف مع كل مستخدم.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3674: {
    sense: 'to adapt something to an individual user', senseAr: 'يكيّف شيئًا ليناسب مستخدمًا بعينه',
    exampleQuality: 'reviewed', example: 'Users can personalise the dashboard to suit their needs.',
    exampleAr: 'يمكن للمستخدمين تخصيص لوحة المعلومات بما يناسب احتياجاتهم.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3702: {
    sense: 'a dated word for a female poet', senseAr: 'لفظ قديم يدل على شاعرة',
    ar: 'شاعرة؛ لفظ قديم يُستعاض عنه غالبًا بـ poet', exampleQuality: 'reviewed',
    example: 'The biography uses the dated term “poetess” for a female poet.',
    exampleAr: 'تستخدم السيرة لفظ «poetess» القديم للإشارة إلى شاعرة.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3773: {
    sense: 'easy to identify because it has been seen or heard before',
    senseAr: 'يسهل تمييزه لأنه شوهد أو سُمع من قبل', exampleQuality: 'reviewed',
    example: 'The actor remained recognisable despite the heavy make-up.',
    exampleAr: 'ظل الممثل سهل التعرّف عليه رغم المكياج الكثيف.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3774: {
    sense: 'in a way that is easy to identify', senseAr: 'بطريقة يسهل التعرّف عليها',
    exampleQuality: 'reviewed', example: 'The building is recognisably Gothic in style.',
    exampleAr: 'يمكن تمييز طراز المبنى القوطي بوضوح.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3803: {
    sense: 'to consider or describe someone or something as having a particular quality',
    senseAr: 'يُعتقد أو يُقال إن شخصًا أو شيئًا يتصف بصفة معينة', ar: 'يُعتقد أنه؛ يُنسب إليه',
    exampleQuality: 'reviewed', example: 'The estate is reputed to be haunted.',
    exampleAr: 'يُقال إن القصر مسكون بالأشباح.', acceptedAnswersAdd: ['reputed'],
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3889: {
    sense: 'serious, sad, and without brightness', senseAr: 'جاد وحزين وقاتم',
    exampleQuality: 'reviewed', example: 'The ceremony had a sombre atmosphere.',
    exampleAr: 'ساد الحفل جو كئيب.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3890: {
    sense: 'in a serious and sad manner', senseAr: 'بطريقة جادة وحزينة',
    exampleQuality: 'reviewed', example: 'He spoke sombrely about the consequences.',
    exampleAr: 'تحدث بكآبة عن العواقب.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  3919: {
    sense: 'things that cause a reaction in a person or organism',
    senseAr: 'أشياء تثير استجابة لدى شخص أو كائن حي', exampleQuality: 'reviewed',
    example: 'The experiment exposed participants to visual stimuli.',
    exampleAr: 'عرّضت التجربة المشاركين لمثيرات بصرية.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4030: {
    sense: 'without being hurt or damaged', senseAr: 'من دون إصابة أو ضرر',
    exampleQuality: 'reviewed', example: 'The driver escaped from the crash unscathed.',
    exampleAr: 'نجا السائق من الحادث دون أذى.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4199: {
    sense: 'the thick layer of fat under the skin of whales and similar animals',
    senseAr: 'طبقة الشحم السميكة تحت جلد الحيتان وحيوانات مشابهة', exampleQuality: 'reviewed',
    example: "A whale's blubber helps it survive in cold water.",
    exampleAr: 'يساعد شحم الحوت على البقاء في المياه الباردة.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4262: {
    sense: 'a chest of drawers, or a chair enclosing a chamber pot',
    senseAr: 'خزانة ذات أدراج، أو مقعد يضم وعاء مرحاض', ar: 'خزانة ذات أدراج؛ مقعد مرحاض',
    exampleQuality: 'reviewed', example: 'The antique commode has three carved drawers.',
    exampleAr: 'تضم الخزانة العتيقة ثلاثة أدراج منحوتة.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4293: {
    sense: 'opposite or reversed in order or relation', senseAr: 'معاكس أو مقلوب في الترتيب أو العلاقة',
    exampleQuality: 'reviewed', example: 'The converse relationship also holds under these conditions.',
    exampleAr: 'تصح العلاقة العكسية أيضًا في هذه الظروف.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4294: {
    sense: 'a statement or situation that is the opposite of another',
    senseAr: 'عبارة أو حالة تمثل عكس أخرى', exampleQuality: 'reviewed',
    example: 'The converse of the statement is not always true.',
    exampleAr: 'عكس العبارة ليس صحيحًا دائمًا.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4442: {
    sense: 'to invent or tell stories, sometimes where memory has gaps',
    senseAr: 'يؤلف أو يروي حكايات، أحيانًا لملء فجوات الذاكرة', exampleQuality: 'reviewed',
    example: 'Some memoirists fabulate when memory leaves gaps.',
    exampleAr: 'يؤلف بعض كتّاب المذكرات حكايات عندما تترك الذاكرة فجوات.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4678: {
    sense: 'to give help or care to someone, especially in a religious context',
    senseAr: 'يقدم العون أو الرعاية لشخص، ولا سيما في سياق ديني', exampleQuality: 'reviewed',
    example: 'Volunteers minister to people displaced by the flood.',
    exampleAr: 'يقدم المتطوعون الرعاية للنازحين بسبب الفيضان.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4682: {
    sense: 'an open area of high uncultivated land', senseAr: 'منطقة مفتوحة مرتفعة غير مزروعة',
    exampleQuality: 'reviewed', example: 'Heather covered the open moor.',
    exampleAr: 'غطّى نبات الخلنج الأرض البرية المفتوحة.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4695: {
    sense: 'a person who is new to a subject, activity, or belief',
    senseAr: 'شخص حديث العهد بموضوع أو نشاط أو معتقد', exampleQuality: 'reviewed',
    example: 'As a neophyte in the field, she asked careful questions.',
    exampleAr: 'طرحت أسئلة دقيقة لكونها مبتدئة في المجال.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4766: {
    sense: 'a sign that something important or unpleasant is likely to happen',
    senseAr: 'علامة تنذر بحدث مهم أو غير سار', exampleQuality: 'reviewed',
    example: 'The sudden silence seemed a portent of trouble.',
    exampleAr: 'بدا الصمت المفاجئ نذيرًا بوقوع مشكلة.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4791: {
    sense: 'relating to an established or official procedure',
    senseAr: 'متعلق بإجراء رسمي أو متبع', exampleQuality: 'reviewed',
    example: 'The court identified a procedural error.',
    exampleAr: 'حددت المحكمة خطأً إجرائيًا.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4792: {
    sense: 'a novel, film, or series focused on professional procedures',
    senseAr: 'رواية أو فيلم أو مسلسل يركز على الإجراءات المهنية', exampleQuality: 'reviewed',
    example: 'The series is a police procedural set in Glasgow.',
    exampleAr: 'المسلسل عمل بوليسي إجرائي تدور أحداثه في غلاسكو.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4830: {
    sense: 'to delight someone intensely; historically, to seize or violate by force',
    senseAr: 'يفتن شخصًا بشدة؛ وتاريخيًا يسلب أو ينتهك بالقوة',
    ar: 'يفتن بشدة؛ يغتصب أو يسلب (استعمال قديم)', exampleQuality: 'reviewed',
    example: 'The aria can ravish listeners with its beauty.',
    exampleAr: 'يمكن للآريا أن تفتن المستمعين بجمالها.',
    addIssues: ['usage-sensitive'], removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  4860: {
    sense: 'the opinion generally held about someone or something',
    senseAr: 'الرأي العام السائد عن شخص أو شيء', exampleQuality: 'reviewed',
    example: 'The university is of high repute for medical research.',
    exampleAr: 'تتمتع الجامعة بسمعة رفيعة في البحث الطبي.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  5051: {
    sense: 'pure, untouched, or in its original condition', senseAr: 'نقي أو لم يُمس أو على حالته الأصلية',
    ar: 'عذري؛ لم يُمسّ', exampleQuality: 'reviewed',
    example: 'The landscape remained virginal and untouched.',
    exampleAr: 'ظل المشهد الطبيعي بكرًا لم تمسّه يد.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  },
  5070: {
    sense: 'the number of words used in a text, sometimes implying excess',
    senseAr: 'عدد الكلمات في نص، وقد يدل أحيانًا على الإطالة', exampleQuality: 'reviewed',
    example: 'The editor reduced the wordage without changing the argument.',
    exampleAr: 'قلّل المحرر عدد الكلمات من دون تغيير الحجة.',
    removeIssues: ['generated-example', 'manual-dictionary-check-recommended']
  }
};

const before = fs.readFileSync(INDEX, 'utf8');
const extracted = extractArray(before, 'const VOCAB=');
const vocabulary = extracted.value;
const originalIds = vocabulary.map(entry => entry.id);
const originalLevels = new Map(vocabulary.map(entry => [entry.id, entry.level]));
const style = before.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const styleHashBefore = crypto.createHash('sha256').update(style).digest('hex');

if (vocabulary.length !== 5074) throw new Error(`Expected 5074 records, found ${vocabulary.length}`);

for (const entry of vocabulary) {
  for (const key of ['word', 'sourceWord', 'sourceOriginalWord', 'sense', 'senseAr', 'sourceSense', 'ar', 'grammar', 'example', 'exampleAr']) {
    if (typeof entry[key] === 'string') entry[key] = entry[key].trim();
  }
  entry.partsOfSpeech = unique(entry.partsOfSpeech);
  entry.levels = unique(entry.levels);
  if (Array.isArray(entry.acceptedAnswers)) entry.acceptedAnswers = unique(entry.acceptedAnswers);
  if (Array.isArray(entry.qualityIssues)) entry.qualityIssues = unique(entry.qualityIssues);
  if (entry.acceptedAnswers?.length === 0) delete entry.acceptedAnswers;
  if (entry.qualityIssues?.length === 0) delete entry.qualityIssues;
  if (curated[entry.id]) patchEntry(entry, curated[entry.id]);

  entry.contentVersion = Math.max(Number(entry.contentVersion) || 0, 15);
  entry.translationReview = REVIEW_ID;
  entry.translationReviewType = REVIEW_TYPE;
  entry.translationReviewDate = REVIEW_DATE;

  if (entry.translationStatus === 'partial') {
    entry.manualReviewRequired = true;
    entry.manualReviewReason = 'Multi-sense or multi-POS separation requires human dictionary review.';
  } else {
    delete entry.manualReviewRequired;
    delete entry.manualReviewReason;
  }
}

const idsAfter = vocabulary.map(entry => entry.id);
if (JSON.stringify(idsAfter) !== JSON.stringify(originalIds)) throw new Error('Record IDs or order changed');
for (const entry of vocabulary) {
  if (entry.level !== originalLevels.get(entry.id)) throw new Error(`CEFR level changed for ID ${entry.id}`);
}

// Keep the rewritten VOCAB line free of a CR character that Git would report as
// trailing whitespace; the remainder of the legacy document is left untouched.
const suffix = before.slice(extracted.end).replace(/^;\r\n/, ';\n');
const output = before.slice(0, extracted.start) + JSON.stringify(vocabulary) + suffix;
const styleAfter = output.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const styleHashAfter = crypto.createHash('sha256').update(styleAfter).digest('hex');
if (styleHashAfter !== styleHashBefore) throw new Error('CSS changed during vocabulary review');
fs.writeFileSync(INDEX, output);

const summary = {
  total: vocabulary.length,
  reviewed: vocabulary.filter(entry => entry.translationStatus === 'reviewed').length,
  manualReviewRequired: vocabulary.filter(entry => entry.manualReviewRequired).length,
  curatedEntries: Object.keys(curated).length,
  reviewedExamples: vocabulary.filter(entry => entry.exampleQuality === 'reviewed').length,
  remainingDictionaryFlags: vocabulary.filter(entry => entry.qualityIssues?.includes('manual-dictionary-check-recommended')).length,
  cssSha256: styleHashAfter
};
console.log(JSON.stringify(summary, null, 2));
