import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const indexPath = process.argv[2] ?? 'index.html';
const auditPath = process.argv[3];
const evidencePath = process.argv[4];
const draftPath = process.argv[5];
const applyDraft = process.argv.includes('--apply');
const regenerate = process.argv.includes('--regenerate');
if (!auditPath || !evidencePath || !draftPath) {
  throw new Error('Usage: node scripts/import-oxford-pdf-vocabulary.mjs [index.html] <source-audit.json> <dictionary-evidence.json> <draft.json> [--regenerate] [--apply]');
}

const POS_PATTERNS = new Map([
  ['noun', /\bnoun\b/i], ['verb', /\bverb\b/i], ['adjective', /\badjective\b/i],
  ['adverb', /\badverb\b/i], ['pronoun', /\bpronoun\b/i], ['preposition', /\bpreposition\b/i],
  ['conjunction', /\bconjunction\b/i], ['determiner', /\bdeterminer\b/i], ['exclamation', /\bexclamation\b/i],
  ['number', /\bnumber\b/i], ['article', /\barticle\b/i], ['auxiliary', /\bauxiliary verb\b/i],
  ['modal', /\bmodal verb\b/i]
]);

const SOURCE_FILES = {
  'The Oxford 3000': {
    fileName: 'The_Oxford_3000.pdf',
    localPath: '/Users/mozn2024/Documents/The_Oxford_3000.pdf',
    sha256: 'ddaf936ef29f5e67c2df0ab3b547fd5bf9d9631f900c3cf55c195cb9c5ad0b40'
  },
  'The Oxford 5000 by CEFR level': {
    fileName: 'The_Oxford_5000_by_CEFR_level.pdf',
    localPath: '/Users/mozn2024/Documents/The_Oxford_5000_by_CEFR_level.pdf',
    sha256: '6577e6eb8745226ab7ab80912e83d285cf421ec70e61c92d74d5fef5f2c99570'
  }
};

const ARABIC_OVERRIDES = new Map(Object.entries({
  'better|noun': 'ما هو أفضل',
  'brand|verb': 'يَصِف؛ يَصِم',
  'differently|adverb': 'بشكل مختلف',
  'engage|verb': 'يُشرك؛ يجذب الاهتمام',
  'expected|adjective': 'متوقَّع',
  'few|determiner': 'قليل من',
  'few|adjective': 'قليل',
  'few|pronoun': 'قليلون؛ عدد قليل',
  'forward|adjective': 'أمامي؛ متقدّم',
  'high|noun': 'مستوى مرتفع؛ أعلى مستوى',
  'hurt|noun': 'أذى؛ ألم',
  'inside|adverb': 'في الداخل؛ إلى الداخل',
  'insight|noun': 'بصيرة؛ فهم عميق',
  'less|determiner': 'أقل من',
  'less|pronoun': 'أقل',
  'near|adverb': 'قريبًا',
  'necessarily|adverb': 'بالضرورة',
  'need|modal': 'يلزم؛ يحتاج إلى',
  'package|verb': 'يُغلّف؛ يعبّئ',
  'south|adjective': 'جنوبي',
  'south|adverb': 'جنوبًا؛ نحو الجنوب',
  'target|verb': 'يستهدف',
  'term|verb': 'يسمّي؛ يصف',
  'that|adverb': 'إلى ذلك الحد',
  'this|adverb': 'إلى هذا الحد',
  'title|verb': 'يُعنون؛ يسمّي',
  'up|adverb': 'إلى أعلى؛ صعودًا',
  'upstairs|adjective': 'علوي؛ في الطابق العلوي',
  'very|adjective': 'نفسه؛ بعينه',
  'view|verb': 'يرى؛ يعدّ',
  'way|adverb': 'كثيرًا؛ بفارق كبير',
  'worse|noun': 'ما هو أسوأ',
  'worst|noun': 'الأسوأ',
  'accommodate|verb': 'يستوعب؛ يوفّر مكانًا',
  'accurately|adverb': 'بدقة',
  'activate|verb': 'يُفعّل؛ يشغّل',
  'additionally|adverb': 'بالإضافة إلى ذلك',
  'adequately|adverb': 'على نحو كافٍ',
  'analyst|noun': 'محلّل',
  'animation|noun': 'رسوم متحركة؛ تحريك',
  'annually|adverb': 'سنويًا',
  'appropriately|adverb': 'على نحو مناسب',
  'artwork|noun': 'عمل فني؛ أعمال فنية',
  'asset|noun': 'أصل ذو قيمة؛ ميزة',
  'assign|verb': 'يكلّف؛ يسند',
  'briefly|adverb': 'بإيجاز؛ لفترة وجيزة',
  'broadly|adverb': 'بوجه عام؛ على نطاق واسع',
  'chase|noun': 'مطاردة',
  'comparative|adjective': 'مقارن؛ نسبي',
  'considerably|adverb': 'إلى حد كبير',
  'conspiracy|noun': 'مؤامرة',
  'convention|noun': 'مؤتمر؛ عُرف؛ اتفاقية',
  'convey|verb': 'ينقل؛ يعبّر عن',
  'convincing|adjective': 'مقنع',
  'creativity|noun': 'إبداع',
  'critically|adverb': 'بصورة خطيرة؛ بصورة نقدية',
  'cue|noun': 'إشارة؛ علامة للبدء',
  'cute|adjective': 'لطيف؛ ظريف',
  'derive|verb': 'يستمد؛ يشتق',
  'desperately|adverb': 'بشدة؛ بيأس',
  'divorce|verb': 'يطلّق؛ ينفصل بالطلاق',
  'downtown|noun': 'وسط المدينة',
  'downtown|adjective': 'واقع في وسط المدينة',
  'dramatically|adverb': 'بشكل كبير؛ بصورة مفاجئة',
  'editorial|adjective': 'تحريري',
  'efficiently|adverb': 'بكفاءة',
  'eliminate|verb': 'يزيل؛ يقضي على',
  'emission|noun': 'انبعاث',
  'emotionally|adverb': 'عاطفيًا؛ من الناحية العاطفية',
  'essentially|adverb': 'في الأساس؛ جوهريًا',
  'ethic|noun': 'مبدأ أخلاقي؛ منظومة أخلاقية',
  'ethnic|adjective': 'عِرقي؛ إثني',
  'evaluation|noun': 'تقييم',
  'evolve|verb': 'يتطور؛ يطوّر',
  'expertise|noun': 'خبرة متخصصة',
  'exposure|noun': 'تعرّض؛ انكشاف',
  'failed|adjective': 'فاشل؛ لم ينجح',
  'firmly|adverb': 'بثبات؛ بحزم',
  'format|noun': 'تنسيق؛ صيغة',
  'forum|noun': 'منتدى',
  'founder|noun': 'مؤسّس',
  'full-time|adverb': 'بدوام كامل',
  'fundamentally|adverb': 'بصورة جوهرية؛ في الأساس',
  'gaming|noun': 'ألعاب إلكترونية؛ ممارسة الألعاب',
  'globalization|noun': 'عولمة',
  'graphic|adjective': 'رسومي؛ بصري',
  'guideline|noun': 'مبدأ توجيهي؛ إرشاد',
  'habitat|noun': 'موطن طبيعي',
  'implement|verb': 'ينفّذ؛ يطبّق',
  'incorporate|verb': 'يدمج؛ يضمّن',
  'inevitably|adverb': 'لا محالة؛ حتمًا',
  'info|noun': 'معلومات',
  'infrastructure|noun': 'بنية تحتية',
  'integrate|verb': 'يدمج؛ يندمج',
  'interaction|noun': 'تفاعل',
  'jail|verb': 'يسجن',
  'lyric|noun': 'كلمات أغنية',
  'metaphor|noun': 'استعارة',
  'mode|noun': 'وضع؛ نمط',
  'monthly|adjective': 'شهري',
  'nearby|adjective': 'قريب؛ مجاور',
  'negotiation|noun': 'تفاوض؛ مفاوضات',
  'norm|noun': 'معيار؛ عُرف',
  'nursing|adjective': 'تمريضي؛ متعلق بالتمريض',
  'nutrition|noun': 'تغذية',
  'observer|noun': 'مراقب',
  'ongoing|adjective': 'مستمر؛ جارٍ',
  'overseas|adverb': 'في الخارج؛ إلى بلد أجنبي',
  'parallel|noun': 'موازٍ؛ تشابه',
  'part-time|adjective': 'بدوام جزئي',
  'perception|noun': 'إدراك؛ تصوّر',
  'placement|noun': 'موضع؛ تدريب عملي',
  'precede|verb': 'يسبق',
  'primarily|adverb': 'في المقام الأول؛ أساسًا',
  'prior|adjective': 'سابق؛ أسبق',
  'progressive|adjective': 'تدريجي؛ تقدّمي',
  'promising|adjective': 'واعد',
  'prompt|verb': 'يحفّز؛ يدفع إلى',
  'publishing|noun': 'نشر؛ صناعة النشر',
  'punk|noun': 'موسيقى البانك؛ ثقافة البانك',
  'racist|adjective': 'عنصري',
  'rating|noun': 'تصنيف؛ تقييم',
  'recession|noun': 'ركود اقتصادي',
  'retail|noun': 'بيع بالتجزئة',
  'revenue|noun': 'إيراد؛ إيرادات',
  'rival|adjective': 'منافس',
  'screening|noun': 'فحص؛ عرض',
  'seeker|noun': 'باحث عن شيء؛ طالب',
  'severely|adverb': 'بشدة؛ بصورة خطيرة',
  'shaped|adjective': 'ذو شكل؛ مُشكَّل',
  'sophisticated|adjective': 'متطور؛ رفيع المستوى',
  'sporting|adjective': 'رياضي؛ متعلق بالرياضة',
  'stance|noun': 'موقف؛ وجهة نظر',
  'steadily|adverb': 'بثبات؛ بصورة تدريجية',
  'subsequent|adjective': 'لاحق',
  'subsequently|adverb': 'لاحقًا؛ بعد ذلك',
  'sufficiently|adverb': 'بقدر كافٍ',
  'super|adjective': 'رائع؛ ممتاز',
  'tag|verb': 'يضع بطاقة؛ يوسم',
  'temporarily|adverb': 'مؤقتًا',
  'trait|noun': 'سمة؛ صفة',
  'transmit|verb': 'ينقل؛ يبث',
  'trigger|verb': 'يسبّب؛ يطلق',
  'troop|noun': 'قوات؛ فرقة عسكرية',
  'tsunami|noun': 'تسونامي؛ موجة مدّ عاتية',
  'uncertainty|noun': 'عدم يقين؛ غموض',
  'unfold|verb': 'ينفتح؛ يتكشف',
  'usage|noun': 'استعمال؛ استخدام لغوي',
  'warming|noun': 'احترار؛ ارتفاع الحرارة',
  'weekly|adjective': 'أسبوعي',
  'workplace|noun': 'مكان العمل',
  'ID|noun': 'هوية؛ بطاقة هوية',
  'wind|verb': 'يلفّ؛ يدور؛ يتعرّج'
  , 'case|noun': 'حالة؛ قضية'
  , 'country|noun': 'دولة؛ بلد'
  , 'forward|adverb': 'إلى الأمام'
  , 'forward|adjective': 'أمامي؛ متجه إلى الأمام'
  , 'hearing|noun': 'جلسة استماع؛ سمع'
  , 'hurry|noun': 'عجلة؛ استعجال'
  , 'potential|adjective': 'محتمل؛ كامن'
  , 'potential|noun': 'إمكانات؛ قدرة كامنة'
  , 'settler|noun': 'مستوطن'
  , 'shortly|adverb': 'قريبًا؛ بعد وقت قصير'
  , 'spite|noun': 'رغم؛ ضغينة'
  , 'stance|noun': 'موقف؛ وجهة نظر'
  , 'terms|noun': 'فصل دراسي؛ شروط'
  , 'terror|noun': 'رعب؛ فزع'
  , 'making|noun': 'صنع؛ صناعة'
  , 'timing|noun': 'توقيت'
  , 'clerk|noun': 'كاتب؛ موظف'
  , 'promotion|noun': 'ترقية؛ ترويج'
  , 'rail|noun': 'قضيب سكة حديد؛ سكة'
  , 'dive|noun': 'غطسة؛ غوص'
  , 'resolution|noun': 'قرار؛ عزم'
  , 'reporting|noun': 'إعداد التقارير؛ تغطية إخبارية'
  , 'scare|verb': 'يُخيف؛ يُفزع'
  , 'mate|noun': 'صديق؛ رفيق'
}));

const CONTENT_OVERRIDES = new Map(Object.entries({
  'few|determiner': { definition: 'used before a plural noun to mean a small number', example: 'Few visitors came during the storm.' },
  'less|determiner': { definition: 'a smaller amount of something', example: 'We need less sugar in this recipe.' },
  'less|pronoun': { definition: 'a smaller amount than before or than another amount', example: 'I expected more traffic, but there was less.' },
  'need|modal': { definition: 'used to say that something is necessary or not necessary', example: 'You need not bring any food.' },
  'alongside|preposition': { definition: 'next to the side of someone or something', example: 'A cycle path runs alongside the river.' },
  'downtown|adjective': { definition: 'located in the central part of a city', example: 'They rented a downtown apartment.' },
  'monthly|adjective': { definition: 'happening or produced once every month', example: 'We receive a monthly electricity bill.' },
  'warming|noun': { definition: 'a rise in temperature, especially of the Earth or oceans', example: 'Ocean warming threatens coral reefs.' },
  'wind|verb': { definition: 'to turn, twist, or follow a route with many curves', example: 'The narrow road winds through the hills.' },
  'ID|noun': { definition: 'an official document or card used to prove who someone is', example: 'Please show your ID at the entrance.' },
  'animation|noun': { definition: 'moving images created from drawings, models, or computer graphics', example: 'The studio created the animation for the film.' },
  'engage|verb': { definition: 'to interest someone or involve them in an activity', example: 'The teacher used a game to engage the class.' },
  'gaming|noun': { definition: 'the activity of playing electronic or video games', example: 'Online gaming has become a major industry.' },
  'graphic|adjective': { definition: 'relating to pictures, drawings, or visual design', example: 'She works as a graphic designer.' },
  'nursing|adjective': { definition: 'connected with the work of caring for sick or injured people', example: 'She completed her nursing training last year.' },
  'cartoon|noun': { example: 'The newspaper printed a cartoon about the election.' },
  'classroom|noun': { example: 'Twenty students waited in the classroom.' },
  'clearly|adverb': { example: 'Please speak clearly during the call.' },
  'decade|noun': { example: 'The city changed greatly over the last decade.' },
  'fence|noun': { example: 'A wooden fence surrounds the garden.' },
  'heaven|noun': { example: 'She believes her grandfather is in heaven.' },
  'mineral|noun': { example: 'Calcium is an important mineral for the body.' },
  'painter|noun': { example: 'The painter displayed her work at the gallery.' },
  'phrase|noun': { example: 'I learned a useful phrase in Arabic.' },
  'servant|noun': { example: 'The novel describes a servant in a large house.' },
  'blanket|noun': { example: 'She placed a warm blanket over the child.' },
  'bug|noun': { example: 'A tiny bug landed on the window.' },
  'carbon|noun': { example: 'Carbon is present in every living thing.' },
  'cave|noun': { example: 'We explored a cave near the coast.' },
  'comic|noun': { example: 'He bought a comic at the station.' },
  'composer|noun': { example: 'The composer wrote music for the film.' },
  'cue|noun': { example: 'The actor waited for her cue.' },
  'dairy|noun': { example: 'The dairy supplies milk to local schools.' },
  'economist|noun': { example: 'The economist predicted slower growth.' },
  'envelope|noun': { example: 'Put the letter in this envelope.' },
  'firefighter|noun': { example: 'The firefighter carried the child to safety.' },
  'framework|noun': { example: 'The agreement provides a framework for future talks.' },
  'grocery|noun': { example: 'She stopped at the grocery on her way home.' },
  'historian|noun': { example: 'The historian studied letters from the war.' },
  'icon|noun': { example: 'Click the icon to open the settings.' },
  'info|noun': { example: 'The website provides useful travel info.' },
  'journalism|noun': { example: 'She studied journalism at university.' },
  'lighting|noun': { example: 'Soft lighting made the room feel warm.' },
  'lottery|noun': { example: 'He bought a lottery ticket for the weekend draw.' },
  'martial|adjective': { example: 'They train in several martial arts.' },
  'mayor|noun': { example: 'The mayor opened the new library.' },
  'mosque|noun': { example: 'The mosque is open for evening prayers.' },
  'novelist|noun': { example: 'The novelist is working on a historical story.' },
  'participation|noun': { example: 'Student participation increased this year.' },
  'partnership|noun': { example: 'The two firms formed a partnership.' },
  'programming|noun': { example: 'She learned programming at college.' },
  'protein|noun': { example: 'Beans are a good source of protein.' },
  'protester|noun': { example: 'A protester held a sign outside the building.' },
  'punk|noun': { example: 'The exhibition explores punk music and fashion.' },
  'settler|noun': { example: 'The settler built a home near the river.' },
  'slogan|noun': { example: 'The campaign uses a short, memorable slogan.' },
  'surgeon|noun': { example: 'The surgeon explained the operation clearly.' },
  'tag|verb': { example: "Please tag each bag with the owner's name." },
  'temple|noun': { example: 'We visited an ancient temple at sunrise.' },
  'thumb|noun': { example: 'He cut his thumb while cooking.' },
  'ton|noun': { example: 'The truck can carry one ton of sand.' }
  , 'glove|noun': { example: 'He wore a thick glove on his injured hand.' }
  , 'ice cream|noun': { example: 'The children shared a bowl of ice cream.' }
  , 'mine|pronoun': { example: 'That blue bag is mine.' }
  , 'photographer|noun': { example: 'The photographer took pictures of the ceremony.' }
  , 'potato|noun': { example: 'She baked a potato for lunch.' }
  , 'September|noun': { example: 'The course begins in September.' }
  , 'sincere|adjective': { example: 'He offered a sincere apology.' }
  , 'south|adjective': { example: 'They explored the south coast by train.' }
  , 'tale|noun': { example: 'My grandfather told us a strange tale.' }
  , 'upstairs|adjective': { example: 'The upstairs window was open.' }
  , 'wine|noun': { example: 'They served a glass of red wine with dinner.' }
  , 'winter|noun': { example: 'This winter has been unusually cold.' }
  , 'yet|conjunction': { example: 'The method is simple yet effective.' }
  , 'accountant|noun': { example: 'The accountant checked the company records.' }
  , 'acid|noun': { example: 'The scientist handled the acid carefully.' }
  , 'amusing|adjective': { example: 'The children found the story amusing.' }
  , 'ballet|noun': { example: 'We watched a ballet at the theatre.' }
  , 'bat|noun': { example: 'He swung the bat and hit the ball.' }
  , 'chase|noun': { example: 'The film ends with a car chase.' }
  , 'colourful|adjective': { example: 'She wore a colourful scarf.' }
  , 'comic|adjective': { example: 'The actor is famous for his comic performances.' }
  , 'commander|noun': { example: 'The commander gave the order to leave.' }
  , 'concrete|noun': { example: 'The workers poured concrete for the foundation.' }
  , 'controversial|adjective': { example: 'The council approved a controversial plan.' }
  , 'dairy|adjective': { example: 'The shop sells fresh dairy products.' }
  , 'downtown|adverb': { example: 'We went downtown after work.' }
  , 'entertaining|adjective': { example: 'The documentary was both useful and entertaining.' }
  , 'expansion|noun': { example: 'The company announced an expansion into Asia.' }
  , 'fortunate|adjective': { example: 'We were fortunate to find a safe place.' }
  , 'fundamentally|adverb': { example: 'The two proposals are fundamentally different.' }
  , 'genetic|adjective': { example: 'Doctors identified a genetic condition.' }
  , 'helmet|noun': { example: 'Always wear a helmet when riding a bicycle.' }
  , 'herb|noun': { example: 'The cook added a fresh herb to the soup.' }
  , 'hidden|adjective': { example: 'They discovered a hidden room behind the wall.' }
  , 'inhabitant|noun': { example: 'Every inhabitant received an emergency warning.' }
  , 'lens|noun': { example: 'The camera lens needs to be cleaned.' }
  , 'memorable|adjective': { example: 'The final concert was a memorable event.' }
  , 'moving|adjective': { example: 'Her speech was honest and moving.' }
  , 'naked|adjective': { example: 'The tree stood naked after losing its leaves.' }
  , 'newly|adverb': { example: 'The newly opened library is already busy.' }
  , 'refugee|noun': { example: 'The refugee found safety across the border.' }
  , 'rival|adjective': { example: 'A rival company launched a similar product.' }
  , 'shaped|adjective': { example: 'The child found a heart-shaped stone.' }
  , 'textbook|noun': { example: 'I left my science textbook at home.' }
  , 'therapist|noun': { example: 'The therapist suggested a breathing exercise.' }
  , 'tournament|noun': { example: 'Our team reached the tournament final.' }
  , 'unity|noun': { example: 'The crisis created a sense of unity.' }
  , 'weekly|adjective': { example: 'The team holds a weekly meeting.' }
  , 'wheat|noun': { example: 'Farmers grow wheat across the region.' }
  , 'ready|adjective': { example: 'We are ready to leave now.' }
  , 'real|adjective': { example: 'The police confirmed that the threat was real.' }
  , 'soup|noun': { example: 'We ate warm soup for lunch.' }
  , 'decent|adjective': { example: 'Everyone deserves a decent standard of living.' }
  , 'rush|verb': { example: 'She rushed to catch the final bus.' }
  , 'sail|verb': { example: 'The boat sailed along the coast.' }
  , 'touch|noun': { example: 'He added a touch of lemon to the soup.' }
  , 'tour|verb': { example: 'They toured Kenya for a month.' }
  , 'window|noun': { example: 'Please close the window before you leave.' }
  , 'accent|noun': { example: 'She speaks English with a strong accent.' }
  , 'controversy|noun': { example: 'The decision caused controversy across the country.' }
  , 'gorgeous|adjective': { example: 'The garden looks gorgeous in spring.' }
  , 'headquarters|noun': { example: 'The company moved its headquarters to Amsterdam.' }
  , 'inevitable|adjective': { example: 'Some delay was inevitable after the storm.' }
  , 'insert|verb': { example: 'Insert the key into the lock.' }
  , 'packet|noun': { example: 'She opened a packet of biscuits.' }
  , 'survival|noun': { example: 'Clean water is essential for survival.' }
  , 'dig|verb': { example: 'They dig in the garden every weekend.' }
  , 'safety|noun': { example: 'Safety is the main priority on this site.' }
  , 'take|verb': { example: 'If you take four away from twelve, you get eight.' }
  , 'wash|noun': { example: 'This shirt needs a careful wash.' }
  , 'drought|noun': { example: 'A severe drought destroyed the crops.' }
  , 'indication|noun': { example: 'Rising prices are an indication of stronger demand.' }
  , 'recession|noun': { example: 'The country entered a recession last year.' }
  , 'before|preposition': { example: 'Tuesday comes before Wednesday.' }
  , 'equivalent|noun': { example: 'This Arabic expression has no exact English equivalent.' }
  , 'ink|noun': { example: 'The artist used black ink for the drawing.' }
  , 'registration|noun': { example: 'Write the registration number on this form.' }
  , 'occupation|noun': { example: 'Please state your occupation on the form.' }
  , 'title|verb': { example: 'She titled the painting “Blue Morning”.' }
  , 'wander|verb': { example: 'We wandered through the old streets for hours.' }
  , 'better|noun': { definition: 'something that is more suitable or of a higher standard', example: 'She expected better from the whole team.' }
  , 'case|noun': { definition: 'a particular situation, problem, or matter being considered', example: 'The doctor discussed the case with her colleagues.' }
  , 'few|pronoun': { example: 'Many were invited, but few attended.' }
  , 'forward|adjective': { definition: 'directed or moving towards the front', example: 'The train began its forward movement.' }
  , 'hearing|noun': { definition: 'an official meeting where evidence or opinions are heard', example: 'The committee held a public hearing.' }
  , 'mail|verb': { example: 'Could you mail the documents tomorrow?' }
  , 'scholarship|noun': { example: 'She received a scholarship to study abroad.' }
  , 'spite|noun': { definition: 'used in the phrase “in spite of” to mean despite', example: 'In spite of the storm, the plane landed safely.' }
  , 'stance|noun': { definition: 'a publicly stated opinion about an issue', example: 'The minister explained her stance on climate policy.' }
  , 'tag|verb': { definition: 'to attach a label or identifying tag to something', example: "Please tag each bag with the owner's name." }
  , 'terms|noun': { example: 'The autumn term ends in December.' }
  , 'terror|noun': { definition: 'a very strong feeling of fear', example: 'The child screamed in terror.' }
  , 'tragic|adjective': { example: 'The accident had tragic consequences.' }
  , 'making|noun': { definition: 'the process of producing or creating something', example: 'The making of the film took two years.' }
  , 'timing|noun': { definition: 'the choice or control of when something happens', example: 'The timing of the announcement surprised everyone.' }
  , 'bread|noun': { example: 'She bought a loaf of bread.' }
  , 'break|noun': { example: 'Let us take a short break.' }
  , 'carpet|noun': { example: 'They laid a new carpet in the hall.' }
  , 'digital|adjective': { example: 'The library stores its records in digital form.' }
  , 'drum|noun': { example: 'The musician played the drum loudly.' }
  , 'glass|noun': { example: 'The window is made of thick glass.' }
  , 'heat|noun': { example: 'The heat from the fire warmed the room.' }
  , 'physical|adjective': { example: 'Regular physical exercise improves health.' }
  , 'pound|noun': { example: 'The ticket costs one pound.' }
  , 'sail|noun': { example: 'The crew raised the sail before leaving.' }
  , 'worry|noun': { example: 'Money was a constant worry for the family.' }
  , 'basket|noun': { example: 'She carried the fruit in a basket.' }
  , 'certificate|noun': { example: 'He received a certificate after the course.' }
  , 'clip|noun': { example: 'Use a paper clip to hold these pages together.' }
  , 'collector|noun': { example: 'The collector owns several rare stamps.' }
  , 'conservation|noun': { example: 'The project supports wildlife conservation.' }
  , 'consultant|noun': { example: 'The company hired a financial consultant.' }
  , 'conventional|adjective': { example: 'They chose a conventional method.' }
  , 'craft|noun': { example: 'We learned a traditional craft in the village.' }
  , 'golden|adjective': { example: 'The field looked golden in the evening light.' }
  , 'governor|noun': { example: 'The governor visited the local school.' }
  , 'inflation|noun': { example: 'High inflation reduced the value of wages.' }
  , 'marker|noun': { example: 'Write your name with a black marker.' }
  , 'navigation|noun': { example: 'The phone provides accurate navigation.' }
  , 'organic|adjective': { example: 'This farm produces organic vegetables.' }
  , 'puzzle|noun': { example: 'We completed the puzzle together.' }
  , 'rival|noun': { example: 'She defeated her closest rival.' }
  , 'scholar|noun': { example: 'The scholar published a study of ancient history.' }
  , 'skilled|adjective': { example: 'A skilled worker repaired the machine.' }
  , 'spare|adjective': { example: 'Keep a spare key in a safe place.' }
  , 'tap|noun': { example: 'Turn off the tap after washing your hands.' }
  , 'trillion|number': { example: 'The figure exceeded one trillion dollars.' }
  , 'visa|noun': { example: 'She applied for a work visa.' }
  , 'expectation|noun': { example: 'The results exceeded our expectation.' }
  , 'third|noun': { example: 'He ate one third of the cake.' }
  , 'wisdom|noun': { example: 'Her advice showed great wisdom.' }
  , 'clean|adjective': { example: 'Please use a clean towel.' }
  , 'formal|adjective': { example: 'The event requires formal clothing.' }
  , 'forty|number': { example: 'The room can hold forty people.' }
  , 'junior|adjective': { example: 'She started in a junior position.' }
  , 'safe|adjective': { example: 'The children need a safe place to play.' }
  , 'tablet|noun': { example: 'Take one tablet after breakfast.' }
  , 'tropical|adjective': { example: 'The island has a tropical climate.' }
  , 'anxiety|noun': { example: 'The exam caused her a lot of anxiety.' }
  , 'biological|adjective': { example: 'The researchers studied a biological process.' }
  , 'clerk|noun': { definition: 'a person who keeps records or serves customers in an office or shop', example: 'The clerk checked my application.' }
  , 'cruise|noun': { example: 'They booked a cruise in the Caribbean.' }
  , 'dealer|noun': { example: 'The dealer sold us an antique table.' }
  , 'democratic|adjective': { example: 'Citizens expect a democratic system.' }
  , 'empire|noun': { example: 'The empire controlled a large region.' }
  , 'formation|noun': { example: 'Scientists studied the formation of the rocks.' }
  , 'fragment|noun': { example: 'A small fragment of glass remained on the floor.' }
  , 'genuine|adjective': { example: 'The museum confirmed that the painting was genuine.' }
  , 'inspector|noun': { example: 'The inspector examined the building.' }
  , 'jury|noun': { example: 'The jury reached a decision.' }
  , 'logo|noun': { example: 'The company redesigned its logo.' }
  , 'manufacturing|noun': { example: 'Car manufacturing employs thousands of people.' }
  , 'monster|noun': { example: 'The story describes a monster beneath the sea.' }
  , 'notebook|noun': { example: 'I wrote the address in my notebook.' }
  , 'operator|noun': { example: 'The operator answered the emergency call.' }
  , 'pill|noun': { example: 'She took a pill for the pain.' }
  , 'promotion|noun': { definition: 'a move to a more important job or rank', example: 'She received a promotion at work.' }
  , 'rail|noun': { definition: 'one of the metal bars on which trains travel', example: 'The damaged rail delayed several trains.' }
  , 'rocket|noun': { example: 'The rocket was launched successfully.' }
  , 'rose|noun': { example: 'He placed a red rose on the table.' }
  , 'sexy|adjective': { example: 'The magazine described the actor as sexy.' }
  , 'shortage|noun': { example: 'The hospital faces a shortage of nurses.' }
  , 'spectacular|adjective': { example: 'The mountain view was spectacular.' }
  , 'spokesman|noun': { example: 'A government spokesman answered the questions.' }
  , 'spokeswoman|noun': { example: 'The spokeswoman announced the new policy.' }
  , 'technological|adjective': { example: 'Technological progress has changed communication.' }
  , 'tribe|noun': { example: 'The tribe has lived in the region for centuries.' }
  , 'undertake|verb': { example: 'The team will undertake a detailed review.' }
  , 'near|preposition': { example: 'The school is near the station.' }
  , 'though|conjunction': { example: 'Though it is small, it is powerful.' }
  , 'female|noun': { example: 'The animal was an adult female.' }
  , 'less|pronoun': { example: 'We expected more rain, but we received less.' }
  , 'comic|noun': { example: 'She collects old comic books.' }
  , 'dive|noun': { example: 'Her first dive was from the lowest platform.' }
  , 'downtown|noun': { definition: 'the central part or main business area of a city', example: 'The hotel is two miles from downtown.' }
  , 'exhibit|noun': { example: 'The museum’s main exhibit is a large sculpture.' }
  , 'forecast|noun': { example: 'The forecast predicts heavy rain tomorrow.' }
  , 'full-time|adverb': { example: 'She works full-time at the hospital.' }
  , 'nearby|adjective': { example: 'A nearby café serves breakfast.' }
  , 'overseas|adverb': { example: 'She studied overseas for two years.' }
  , 'part-time|adverb': { example: 'She works part-time at a café.' }
  , 'scare|noun': { example: 'The sudden noise gave us a scare.' }
  , 'tag|noun': { example: 'The tag shows the price and size.' }
  , 'trap|noun': { example: 'The animal escaped from the trap.' }
  , 'viewpoint|noun': { example: 'We should consider every viewpoint before deciding.' }
  , 'resolution|noun': { definition: 'a firm decision to do or not do something', example: 'Her New Year’s resolution is to exercise more.' }
  , 'reporting|noun': { definition: 'the work of gathering and presenting news or information', example: 'Accurate reporting helps the public understand events.' }
}));

const SENSE_SELECTORS = new Map(Object.entries({
  'mine (hole in the ground)|B1|noun|noun': /hole or system of holes|deep hole in the ground/i,
  'counter (long flat surface)|B2|noun|noun': /long[^.]{0,20}flat[^.]{0,20}surface/i,
  'ID|B2|noun|noun': /abbreviation for identification|official card or document/i,
  'wind2|B2|verb|verb': /turn or cause something to turn|twist something around|route that turns/i,
  'animation|B2|noun|noun': /moving (?:drawings|images)|animated film|computer graphics/i,
  'engage|B2|verb|verb': /interest someone|involve|attention/i,
  'gaming|B2|noun|noun': /computer games|video games|electronic games/i,
  'graphic|B2|adjective|adjective': /pictures|drawings|visual/i,
  'nursing|B2|adjective|adjective': /caring for sick|work of caring|nurse/i
}));

function extractLiteral(html, name) {
  const marker = `const ${name}=`;
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing ${marker}`);
  let start = markerAt + marker.length;
  while (/\s/.test(html[start])) start += 1;
  const open = html[start];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
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
    else if (character === close && --depth === 0) return { start, end: index + 1, source: html.slice(start, index + 1) };
  }
  throw new Error(`Unterminated ${name}`);
}

function normalizeArabic(value) {
  return String(value ?? '')
    .replace(/\s*\/\s*/g, '؛ ')
    .replace(/\s*;\s*/g, '؛ ')
    .replace(/\s+/g, ' ')
    .replace(/؛\s*؛/g, '؛')
    .trim()
    .replace(/[.،؛:]$/, '');
}

function senseFor(reference, sourceEntry, part, kind) {
  const senses = reference?.[kind]?.senses ?? [];
  const selector = SENSE_SELECTORS.get(`${sourceEntry.sourceKey}|${part}`);
  if (selector) {
    const selected = senses.find(sense => POS_PATTERNS.get(part)?.test(sense.pos) && selector.test(sense.definition));
    if (selected) return selected;
  }
  const exact = senses.filter(sense => POS_PATTERNS.get(part)?.test(sense.pos));
  if (sourceEntry.sense) {
    const tokens = sourceEntry.sense.toLowerCase().split(/[^a-z]+/).filter(token => token.length > 3);
    const scored = exact
      .map(sense => ({ sense, score: tokens.filter(token => sense.definition.toLowerCase().includes(token)).length }))
      .sort((left, right) => right.score - left.score);
    if (scored[0]?.score) return scored[0].sense;
  }
  if (kind === 'english') {
    const compactHeadword = sourceEntry.headword.toLowerCase().replace(/[^a-z]/g, '');
    const stemLength = Math.max(3, Math.min(6, compactHeadword.length - 2));
    const stem = compactHeadword.slice(0, stemLength);
    const completeUsage = exact.find(sense =>
      /[.!?]$/.test(sense.example) &&
      sense.example.toLowerCase().replace(/[^a-z]/g, '').includes(stem)
    );
    if (completeUsage) return completeUsage;
  }
  if (exact.length) return exact[0];
  if (['few', 'less'].includes(sourceEntry.headword)) return senses.find(sense => /quantifier/i.test(sense.pos));
  if (part === 'modal') return senses.find(sense => /\bverb\b/i.test(sense.pos));
  if (['preposition', 'adjective', 'noun'].includes(part) && ['alongside', 'downtown', 'monthly', 'warming'].includes(sourceEntry.headword)) {
    return senses[0];
  }
  return null;
}

function definitionWords(value) {
  const stop = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'that', 'which', 'with', 'is', 'are', 'be', 'being', 'something', 'someone']);
  return new Set(String(value).toLowerCase().match(/[a-z]{3,}/g)?.filter(word => !stop.has(word)) ?? []);
}

function alignedEnglishSense(reference, sourceEntry, part, bilingualSense) {
  const selector = SENSE_SELECTORS.get(`${sourceEntry.sourceKey}|${part}`);
  const exact = (reference?.english?.senses ?? []).filter(sense => POS_PATTERNS.get(part)?.test(sense.pos));
  if (selector) {
    const selected = exact.find(sense => selector.test(sense.definition));
    if (selected) return selected;
  }
  if (!bilingualSense || !exact.length) return senseFor(reference, sourceEntry, part, 'english');
  const bilingualWords = definitionWords(bilingualSense.definition);
  const compactHeadword = sourceEntry.headword.toLowerCase().replace(/[^a-z]/g, '');
  const stem = compactHeadword.slice(0, Math.max(3, Math.min(6, compactHeadword.length - 2)));
  const scored = exact
    .map(sense => {
      const words = definitionWords(sense.definition);
      const overlap = [...bilingualWords].filter(word => words.has(word)).length;
      const union = new Set([...bilingualWords, ...words]).size || 1;
      const fullTargetExample = /[.!?][\"'”’)]*$/.test(sense.example) && sense.example.toLowerCase().replace(/[^a-z]/g, '').includes(stem);
      return { sense, score: overlap / union, fullTargetExample };
    })
    .sort((left, right) => right.score - left.score || Number(right.fullTargetExample) - Number(left.fullTargetExample));
  const bestScore = scored[0]?.score ?? 0;
  return (scored.find(candidate => candidate.sense.example && candidate.score >= bestScore * 0.8) ?? scored[0])?.sense;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function translate(text, sourceLanguage, targetLanguage) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLanguage);
  url.searchParams.set('tl', targetLanguage);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const translated = payload[0].map(segment => segment[0]).join('').trim();
      if (!translated) throw new Error('Empty translation');
      return translated;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, operation) {
  const output = new Array(items.length);
  let nextIndex = 0, completed = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await operation(items[index], index);
      completed += 1;
      if (completed % 100 === 0 || completed === items.length) console.log(`processed ${completed}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return output;
}

async function createDraft() {
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const evidenceByKey = new Map(evidence.references.map(item => [item.sourceKey, item]));
  const targets = audit.results.filter(entry => ['missing', 'ambiguous-part-of-speech'].includes(entry.status));
  const rawMeanings = [];
  for (const sourceEntry of targets) {
    const evidenceItem = evidenceByKey.get(sourceEntry.sourceKey);
    if (!evidenceItem?.reference) throw new Error(`Missing evidence for ${sourceEntry.sourceKey}`);
    for (const part of sourceEntry.partsOfSpeech) {
      const key = `${sourceEntry.headword}|${part}`;
      const contentOverride = CONTENT_OVERRIDES.get(key) ?? {};
      const bilingualSense = senseFor(evidenceItem.reference, sourceEntry, part, 'bilingual');
      const englishSense = alignedEnglishSense(evidenceItem.reference, sourceEntry, part, bilingualSense);
      const fallbackEnglishSense = senseFor(evidenceItem.reference, sourceEntry, part, 'english');
      const bilingualExampleIsComplete = bilingualSense?.example && /[.!?][\"'”’)]*$/.test(bilingualSense.example);
      const sourceDefinition = contentOverride.definition || bilingualSense?.definition || englishSense?.definition;
      const sourceExample = contentOverride.example || (bilingualExampleIsComplete ? bilingualSense.example : '') || englishSense?.example || fallbackEnglishSense?.example || bilingualSense?.example;
      if (!sourceDefinition) throw new Error(`No definition for ${sourceEntry.sourceKey}:${part}`);
      if (!sourceExample) throw new Error(`No example for ${sourceEntry.sourceKey}:${part}`);
      const arabic = normalizeArabic(ARABIC_OVERRIDES.get(key) || bilingualSense?.translationAr);
      if (!arabic) throw new Error(`No Arabic translation for ${sourceEntry.sourceKey}:${part}`);
      rawMeanings.push({
        sourceKey: sourceEntry.sourceKey,
        headword: sourceEntry.headword,
        part,
        arabic,
        sourceDefinition,
        sourceExample,
        customExample: Boolean(contentOverride.example),
        sourceDefinitionSha256: bilingualSense?.definitionSha256 || englishSense?.definitionSha256 || sha256(sourceDefinition),
        definitionCreationMethod: contentOverride.definition ? 'editor-written-from-dictionary-evidence' : 'dictionary-definition-paraphrase-review',
        sourceDefinitionUrl: contentOverride.definition ? englishSense?.sourceUrl || bilingualSense?.sourceUrl : (bilingualSense?.sourceUrl || englishSense?.sourceUrl),
        sourceExampleUrl: contentOverride.example ? englishSense?.sourceUrl || bilingualSense?.sourceUrl : (bilingualExampleIsComplete ? bilingualSense?.sourceUrl : englishSense?.sourceUrl || bilingualSense?.sourceUrl)
      });
    }
  }

  const translatedMeanings = await mapConcurrent(rawMeanings, 8, async meaning => {
    const [definitionAr, exampleAr] = await Promise.all([
      translate(meaning.sourceDefinition, 'en', 'ar'),
      translate(meaning.sourceExample, 'en', 'ar')
    ]);
    const definition = meaning.sourceDefinition.split(/\s+/).length <= 12
      ? meaning.sourceDefinition.replace(/\s+([,.:;])/g, '$1').trim()
      : await translate(definitionAr, 'ar', 'en');
    let example = meaning.customExample
      ? meaning.sourceExample
      : await translate(exampleAr, 'ar', 'en');
    const compactHeadword = meaning.headword.toLowerCase().replace(/[^a-z]/g, '');
    const stemLength = Math.max(3, Math.min(6, compactHeadword.length - 2));
    const stem = compactHeadword.slice(0, stemLength);
    const compactExample = example.toLowerCase().replace(/[^a-z]/g, '');
    if (stem && !compactExample.includes(stem)) example = meaning.sourceExample;
    if (!/[.!?][\"'”’)]*$/.test(example)) example = `${example.replace(/[,:;\s]+$/, '')}.`;
    return {
      ...meaning,
      definition: definition.replace(/\s+([,.:;!?])/g, '$1').trim(),
      example: example.replace(/\s+([,.:;!?])/g, '$1').trim(),
      exampleAr: exampleAr.replace(/\s+([،؛؟!.])/g, '$1').trim()
    };
  });
  const meaningsBySourceKey = new Map();
  for (const meaning of translatedMeanings) {
    const group = meaningsBySourceKey.get(meaning.sourceKey) ?? [];
    group.push(meaning);
    meaningsBySourceKey.set(meaning.sourceKey, group);
  }

  const records = targets.map(sourceEntry => {
    const evidenceItem = evidenceByKey.get(sourceEntry.sourceKey);
    const meanings = meaningsBySourceKey.get(sourceEntry.sourceKey).map(meaning => ({
      pos: meaning.part,
      ar: meaning.arabic,
      senseAr: meaning.arabic,
      definition: meaning.definition,
      example: meaning.example,
      exampleAr: meaning.exampleAr,
      meaningSource: 'Cambridge dictionary evidence with editor-curated Arabic wording',
      sourceUrl: meaning.sourceDefinitionUrl,
      sourceDefinitionSha256: meaning.sourceDefinitionSha256,
      definitionSha256: sha256(meaning.definition),
      definitionCreationMethod: meaning.definitionCreationMethod,
      exampleCreationMethod: meaning.customExample ? 'editor-written' : 'dictionary-guided-original-sentence-and-translation-review',
      exampleSourceUrl: meaning.sourceExampleUrl
    }));
    const primary = meanings[0];
    const sourceFile = SOURCE_FILES[sourceEntry.source];
    return {
      word: sourceEntry.headword,
      sourceWord: sourceEntry.printedHeadword,
      ...(sourceEntry.sense ? { sense: sourceEntry.sense, senseAr: normalizeArabic(primary.ar) } : {}),
      level: sourceEntry.level,
      levels: [sourceEntry.level],
      grammar: sourceEntry.grammar,
      pos: sourceEntry.partsOfSpeech[0],
      partsOfSpeech: sourceEntry.partsOfSpeech,
      ar: [...new Set(meanings.flatMap(meaning => meaning.ar.split('؛').map(value => value.trim()).filter(Boolean)))].join('؛ '),
      definition: primary.definition,
      example: primary.example,
      exampleAr: primary.exampleAr,
      meanings,
      translationStatus: 'reviewed',
      manualReviewRequired: false,
      exampleQuality: 'reviewed',
      contentVersion: 16,
      translationReview: 'v9.0-oxford-pdf-expansion',
      translationReviewType: 'pdf-source-and-dictionary-evidence-assisted-curation',
      translationReviewDate: '2026-07-16',
      translationConfidence: 'high',
      acceptedAnswers: [sourceEntry.headword],
      sourceBatch: 'Oxford-PDF-A1-B2-v9.0',
      sourceSelectionAuthority: sourceEntry.source,
      selectionSource: {
        name: sourceEntry.source,
        fileName: sourceFile.fileName,
        localPath: sourceFile.localPath,
        fileSha256: sourceFile.sha256,
        page: sourceEntry.sourcePage,
        column: sourceEntry.sourceColumn,
        line: sourceEntry.sourceLine,
        sourceKey: sourceEntry.sourceKey
      },
      dictionarySources: [
        { name: 'Cambridge English–Arabic Dictionary', url: evidenceItem.reference.bilingual.finalUrl, purpose: 'Arabic lexical meaning evidence where available' },
        { name: 'Cambridge English Dictionary', url: evidenceItem.reference.english.finalUrl, purpose: 'English meaning and usage evidence' }
      ],
      sourceSummaryAr: `اختيرت الكلمة ونوعها ومستواها من ${sourceEntry.source}، وصيغت الترجمة والتعريف والأمثلة وراجعت بمعزل عن ملف Oxford.`
    };
  });

  const levelCorrections = audit.results
    .filter(entry => entry.status === 'existing-level-mismatch')
    .map(entry => ({
      recordIds: entry.recordIds,
      previousLevels: entry.candidateLevels,
      level: entry.level,
      grammar: entry.grammar,
      source: entry.source,
      sourcePage: entry.sourcePage,
      sourceColumn: entry.sourceColumn,
      sourceLine: entry.sourceLine,
      sourceKey: entry.sourceKey
    }));
  const draft = {
    generatedAt: new Date().toISOString(),
    notice: 'Oxford PDFs are the sole authority for selection, part of speech, and CEFR. Dictionary pages support meanings; translations and examples are not attributed to the PDFs.',
    records,
    levelCorrections
  };
  fs.writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`);
  return draft;
}

const draft = (!regenerate && fs.existsSync(draftPath))
  ? JSON.parse(fs.readFileSync(draftPath, 'utf8'))
  : await createDraft();

const missingMeaningFields = draft.records.flatMap(record => record.meanings.filter(meaning =>
  !meaning.ar || !meaning.definition || !meaning.example || !meaning.exampleAr
).map(meaning => `${record.sourceWord}:${meaning.pos}`));
if (missingMeaningFields.length) throw new Error(`${missingMeaningFields.length} draft meanings have missing fields`);
if (draft.records.length !== 977) throw new Error(`Expected 977 new source records; found ${draft.records.length}`);
if (draft.levelCorrections.length !== 31) throw new Error(`Expected 31 level corrections; found ${draft.levelCorrections.length}`);

if (applyDraft) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const literal = extractLiteral(html, 'VOCAB');
  const vocabulary = vm.runInNewContext(`(${literal.source})`, Object.create(null), { timeout: 5000 })
    .filter(entry => entry.translationReview !== 'v9.0-oxford-pdf-expansion');
  for (const correction of draft.levelCorrections) {
    for (const id of correction.recordIds) {
      const record = vocabulary.find(entry => entry.id === id);
      if (!record) throw new Error(`Missing correction target ${id}`);
      const sourceFile = SOURCE_FILES[correction.source];
      if (record.cefrReview !== 'v9.0-oxford-pdf-level-correction') record.previousCefrLevel = record.level;
      record.level = correction.level;
      record.levels = [correction.level];
      record.grammar = correction.grammar;
      record.contentVersion = 16;
      record.cefrReview = 'v9.0-oxford-pdf-level-correction';
      record.cefrReviewDate = '2026-07-16';
      record.cefrCorrectionSource = {
        name: correction.source,
        fileName: sourceFile.fileName,
        localPath: sourceFile.localPath,
        fileSha256: sourceFile.sha256,
        page: correction.sourcePage,
        column: correction.sourceColumn,
        line: correction.sourceLine,
        sourceKey: correction.sourceKey
      };
    }
  }
  for (const record of draft.records) vocabulary.push({ id: vocabulary.length + 1, ...record });
  const replacement = JSON.stringify(vocabulary);
  let updatedHtml = `${html.slice(0, literal.start)}${replacement}${html.slice(literal.end)}`;
  const applicationMetadataUpdates = [
    ['<div class="big-number">5074</div>', '<div class="big-number">6051</div>'],
    ['يحتوي الموقع على 5074 سجلًا: 3000 من A1–B2، و1082 من C1، و992 من C2. هناك 20 سجلًا موثقًا في المصدر بالمستويين C1 وC2.', 'يحتوي الموقع على 6051 سجلًا: 4008 من A1–B2، و1054 من C1، و989 من C2. تغطي ملفات Oxford المرفقة 3308 مدخلات من Oxford 3000 و700 مدخل B2 من Oxford 5000.'],
    ['The site contains 5,074 records: 3,000 at A1–B2, 1,082 at C1, and 992 at C2. Twenty source records are tagged at both C1 and C2.', 'The site contains 6,051 records: 4,008 at A1–B2, 1,054 at C1, and 989 at C2. The attached Oxford PDFs cover 3,308 Oxford 3000 entries and 700 B2 Oxford 5000 entries.'],
    ['فحص البيانات: 5074 سجلًا بمعرّفات متسلسلة؛ 3000 سجل A1–B2 و2074 سجلًا منظفًا من C1–C2.', 'فحص البيانات: 6051 سجلًا بمعرّفات متسلسلة؛ 4008 سجلات A1–B2 و2043 سجلًا من C1–C2.'],
    ['Data check: 5,074 sequential records; 3,000 A1–B2 records and 2,074 cleaned C1–C2 records.', 'Data check: 6,051 sequential records; 4,008 A1–B2 records and 2,043 C1–C2 records.'],
    ['const EXPECTED_VOCAB_COUNT=5074;', 'const EXPECTED_VOCAB_COUNT=6051;']
  ];
  for (const [before, after] of applicationMetadataUpdates) {
    if (!updatedHtml.includes(before) && !updatedHtml.includes(after)) throw new Error(`Missing application metadata text: ${before}`);
    updatedHtml = updatedHtml.replaceAll(before, after);
  }
  fs.writeFileSync(indexPath, updatedHtml);
}

console.log(JSON.stringify({
  records: draft.records.length,
  meanings: draft.records.reduce((sum, record) => sum + record.meanings.length, 0),
  levelCorrections: draft.levelCorrections.length,
  levelCounts: Object.fromEntries(['A1', 'A2', 'B1', 'B2'].map(level => [level, draft.records.filter(record => record.level === level).length])),
  applied: applyDraft
}, null, 2));
