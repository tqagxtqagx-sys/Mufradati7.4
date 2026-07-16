import fs from 'node:fs';
import crypto from 'node:crypto';

const indexPath = process.argv[2] ?? new URL('../index.html', import.meta.url);
const referencesPath = process.argv[3];
const shouldWrite = process.argv.includes('--write');
const baselinePath = process.argv.find(argument => argument.startsWith('--baseline='))?.slice('--baseline='.length);
if (!referencesPath) throw new Error('Usage: node scripts/resolve-multi-pos-vocabulary.mjs [index.html] <references.json> [--write]');

const REVIEW_ID = 'v8.4-425-sense-resolution';
const REVIEW_DATE = '2026-07-16';
const OXFORD_POS_URL = 'https://www.oxfordlearnersdictionaries.com/us/external/pdf/wordlists/oxford-3000-5000/The_Oxford_3000_by_CEFR_level.pdf';

const manualFallbacks = {
  6:{adverb:'أعلاه؛ في الأعلى'},27:{adverb:'إلى الجهة الأخرى؛ عبر'},50:{adjective:'مسبق؛ مقدّم'},
  93:{pronoun:'الجميع؛ الكل'},98:{adjective:'وحيد؛ منفرد'},130:{pronoun:'آخر؛ شخص أو شيء آخر'},
  133:{determiner:'أيّ؛ أيّ مقدار من'},140:{adverb:'في أي مكان'},147:{verb:'يستأنف؛ يناشد'},
  171:{adverb:'حول؛ في الجوار؛ تقريبًا'},183:{adverb:'كما؛ بالقدر نفسه'},192:{adjective:'مساعد'},
  204:{exclamation:'انتباه!'},244:{verb:'يؤسّس؛ يبني على'},278:{adverb:'أدناه؛ في الأسفل'},
  291:{adverb:'أبعد؛ فيما وراء'},335:{pronoun:'كلاهما'},338:{adjective:'سفلي؛ في القاع'},
  402:{adjective:'رئيسي؛ متعلق بالعاصمة'},404:{noun:'أسر؛ استيلاء؛ التقاط'},446:{adjective:'مميّز؛ نموذجي'},
  474:{verb:'يدور حول؛ يحيط'},511:{noun:'انهيار؛ سقوط'},529:{noun:'عمولة؛ لجنة؛ تكليف رسمي',verb:'يكلّف رسميًا؛ يفوّض'},
  587:{verb:'ينازع؛ يعترض على'},609:{adjective:'أساسي؛ جوهري'},672:{noun:'دورة؛ دراجة'},
  700:{noun:'انخفاض؛ نقصان'},786:{noun:'نفور؛ كراهية'},808:{pronoun:'ضعف العدد أو الكمية'},
  811:{adverb:'إلى الأسفل؛ في الأسفل'},816:{noun:'دزينة؛ اثنا عشر'},817:{verb:'يصوغ مسودة؛ يجنّد'},
  836:{pronoun:'كل واحد',adverb:'لكل واحد'},843:{adjective:'شرقي',adverb:'شرقًا؛ نحو الشرق'},
  866:{pronoun:'أيّهما؛ أحدهما'},895:{noun:'لقاء؛ مواجهة'},903:{pronoun:'ما يكفي؛ قدر كاف'},
  961:{adjective:'تنفيذي؛ إداري'},1008:{adjective:'عائلي؛ خاص بالأسرة'},
  1071:{determiner:'الأول',number:'العدد الترتيبي الأول'},1099:{adjective:'طائر؛ متعلق بالطيران'},
  1196:{noun:'وداع'},1233:{noun:'نصف',pronoun:'نصفه؛ نصفها'},1267:{noun:'تحية؛ مرحبًا'},
  1306:{verb:'يكرّم؛ يشرّف'},1353:{verb:'يؤثر في'},1500:{noun:'الأخير؛ آخر شخص أو شيء'},
  1502:{adjective:'متأخر؛ راحل'},1509:{noun:'إطلاق؛ تدشين'},1530:{adjective:'أيسر؛ متبقّ؛ يساري'},
  1557:{adjective:'سائل'},1565:{adverb:'على الهواء مباشرة'},1579:{adverb:'على المدى الطويل'},
  1588:{pronoun:'الكثير',determiner:'الكثير من',adverb:'كثيرًا'},1593:{adverb:'على مستوى منخفض؛ بصوت خافت'},
  1614:{determiner:'كثير من؛ عدد كبير من'},1662:{verb:'يفسد؛ يبعثر'},1687:{noun:'هاتف محمول'},
  1701:{determiner:'مزيد من؛ كمية أكبر من'},1703:{determiner:'معظم؛ أكبر قدر من'},1706:{adjective:'آلي؛ متعلق بالمحرّك'},
  1716:{determiner:'كثير من؛ قدر كبير من'},1735:{noun:'سرد؛ رواية للأحداث',adjective:'سردي'},
  1752:{pronoun:'لا أحد منهما؛ لا شيء منهما'},1772:{exclamation:'لا'},1778:{adverb:'ولا أيضًا'},
  1782:{adjective:'شمالي',adverb:'شمالًا؛ نحو الشمال'},1826:{adjective:'مقبول؛ بخير'},1832:{number:'واحد'},
  1834:{adjective:'متصل بالإنترنت؛ عبر الإنترنت'},1846:{adverb:'في الجهة المقابلة'},1862:{adjective:'آخر؛ مختلف'},
  1868:{preposition:'خارج؛ من داخل'},1877:{adverb:'فوق؛ من جهة إلى أخرى؛ انتهى'},1878:{adverb:'عمومًا؛ إجمالًا'},
  1880:{adjective:'خاص به؛ مملوك له',pronoun:'ملكه؛ خاصته'},1913:{preposition:'بعد؛ متجاوزًا'},
  1931:{noun:'نسبة مئوية',adjective:'مئوي؛ محسوب بالنسبة المئوية',adverb:'بنسبة مئوية'},
  1962:{verb:'يكدّس؛ يتراكم'},1977:{adjective:'بلاستيكي؛ مصنوع من البلاستيك'},
  1991:{adjective:'زائد؛ إضافي',conjunction:'بالإضافة إلى',noun:'علامة الجمع؛ ميزة إضافية'},
  2011:{adjective:'شعبي؛ متعلق بموسيقى البوب'},2208:{adjective:'نسبي؛ متصل بشيء آخر'},
  2292:{adverb:'حول؛ في مسار دائري'},2300:{adjective:'مطاطي؛ مصنوع من المطاط'},
  2353:{determiner:'الثاني',number:'العدد الترتيبي الثاني'},2392:{determiner:'عدة؛ عدد من'},
  2506:{pronoun:'بعضهم؛ بعضها؛ قدر ما'},2512:{pronoun:'مكان ما'},2516:{exclamation:'عذرًا؛ آسف'},
  2522:{adjective:'تخصصي؛ مختص'},2565:{adjective:'حكومي؛ تابع للدولة'},2619:{determiner:'مثل هذا؛ من هذا النوع'},
  2629:{verb:'يجمع؛ يحسب المجموع'},2701:{noun:'شكر؛ امتنان'},2728:{adverb:'من جهة إلى أخرى؛ حتى النهاية'},
  2729:{preposition:'في جميع أنحاء؛ طوال'},2737:{preposition:'حتى'},2745:{noun:'اليوم؛ الوقت الحاضر'},
  2750:{adverb:'غدًا'},2753:{adverb:'هذه الليلة'},2770:{adjective:'صغير شبيه باللعبة؛ مخصص للعب'},
  2779:{noun:'نقل؛ تحويل؛ انتقال'},2807:{adjective:'توأمي؛ مزدوج'},2820:{adverb:'في الأسفل؛ تحت'},
  2821:{adjective:'تحت الأرض؛ سري'},2844:{preposition:'حتى'},2921:{adjective:'مرحب به؛ موضع ترحيب'},
  2923:{adjective:'غربي',adverb:'غربًا؛ نحو الغرب'},2926:{pronoun:'ما؛ ماذا'},
  2927:{determiner:'أيّ ... كان',pronoun:'أيّ شيء؛ مهما يكن'},2929:{pronoun:'متى؛ أيّ وقت'},
  2935:{pronoun:'أيّ واحد؛ الذي'},2937:{noun:'همس؛ صوت خافت'},2942:{pronoun:'لمن؛ من صاحب'},
  2971:{adjective:'عالمي؛ منتشر في العالم'},2991:{noun:'أمس؛ اليوم السابق'}
};

const meaningOverrides = {
  6:{preposition:['فوق','أعلى من'],adverb:['أعلاه','في الأعلى']},
  27:{preposition:['عبر','من جانب إلى آخر'],adverb:['إلى الجانب الآخر','في الجهة المقابلة']},
  64:{conjunction:['بعد أن','بعدما'],adverb:['بعد ذلك','فيما بعد']},
  81:{noun:['مساعدة','عون'],verb:['يساعد','يعين']},
  98:{adjective:['وحيد','منفرد'],adverb:['بمفرده','وحده']},
  171:{preposition:['حول','قرابة'],adverb:['حول','في الجوار','تقريبًا']},
  216:{adjective:['متوسط','عادي'],noun:['متوسط']},
  225:{noun:['ظهر','خلف'],adverb:['إلى الخلف','خلف']},
  234:{noun:['توازن','رصيد'],verb:['يوازن']},
  256:{verb:['يكون','يوجد'],auxiliary:['يكون بوصفه فعلًا مساعدًا']},
  285:{adverb:['على أفضل نحو'],noun:['الأفضل']},
  307:{adjective:['أسود'],noun:['اللون الأسود']},
  308:{verb:['يلوم'],noun:['لوم','مسؤولية']},
  309:{adjective:['فارغ'],noun:['فراغ','مساحة فارغة']},
  316:{adjective:['أزرق'],noun:['اللون الأزرق']},
  355:{verb:['يبث'],noun:['بث','برنامج إذاعي أو تلفزيوني']},
  358:{adjective:['بني'],noun:['اللون البني']},
  387:{adjective:['هادئ'],verb:['يهدّئ'],noun:['هدوء']},
  389:{noun:['مخيّم','معسكر'],verb:['يخيّم']},
  390:{noun:['حملة'],verb:['ينظم حملة','يقوم بحملة']},
  404:{verb:['يأسر','يلتقط'],noun:['أسر','التقاط']},
  446:{noun:['سمة','خاصية'],adjective:['مميّز','نموذجي']},
  447:{noun:['رسم','تكلفة','تهمة'],verb:['يتقاضى','يتهم','يشحن']},
  460:{adjective:['كيميائي'],noun:['مادة كيميائية']},
  482:{adjective:['كلاسيكي'],noun:['عمل كلاسيكي']},
  511:{verb:['ينهار'],noun:['انهيار','سقوط']},
  528:{adjective:['تجاري'],noun:['إعلان تجاري']},
  533:{adjective:['شائع','مشترك'],noun:['قواسم مشتركة']},
  562:{noun:['نزاع','صراع'],verb:['يتعارض']},
  596:{noun:['تحكم','سيطرة'],verb:['يتحكم','يسيطر']},
  648:{verb:['يعبر','يتقاطع'],noun:['صليب','علامة ×']},
  763:{verb:['يوجّه','يُخرج'],adverb:['مباشرة']},
  786:{verb:['لا يحب'],noun:['كراهية','نفور']},
  797:{verb:['يفعل','يقوم بعمل'],auxiliary:['فعل مساعد للسؤال والنفي والتوكيد']},
  838:{adjective:['مبكر'],adverb:['مبكرًا','في وقت مبكر']},
  843:{noun:['الشرق'],adjective:['شرقي'],adverb:['شرقًا','نحو الشرق']},
  879:{noun:['بريد إلكتروني'],verb:['يرسل رسالة إلكترونية']},
  895:{verb:['يصادف','يواجه'],noun:['لقاء','مواجهة']},
  897:{noun:['نهاية'],verb:['ينتهي','ينهي']},
  918:{adjective:['متساوٍ'],verb:['يساوي','يعادل']},
  923:{verb:['يهرب'],noun:['هروب','مهرب']},
  929:{verb:['يقدّر'],noun:['تقدير','تخمين']},
  956:{noun:['تبادل','مقايضة'],verb:['يتبادل']},
  961:{noun:['مدير تنفيذي'],adjective:['تنفيذي','إداري']},
  962:{noun:['تمرين','رياضة'],verb:['يتمرّن']},
  987:{noun:['إضافة','زيادة'],adverb:['زيادةً']},
  1008:{noun:['عائلة','أسرة'],adjective:['عائلي','خاص بالأسرة']},
  1030:{adjective:['مفضّل'],noun:['المفضّل','الشيء المفضّل']},
  1060:{noun:['تمويل'],verb:['يموّل']},
  1071:{determiner:['الأول'],number:['العدد الترتيبي الأول'],adverb:['أولًا']},
  1100:{verb:['يركّز','يضبط البؤرة'],noun:['تركيز','بؤرة']},
  1142:{noun:['مقدمة','واجهة'],adjective:['أمامي']},
  1165:{verb:['يكسب'],noun:['مكسب']},
  1186:{adjective:['ضخم','عملاق'],noun:['عملاق']},
  1210:{verb:['يمنح'],noun:['منحة','هبة']},
  1270:{pronoun:['إياها','لها'],determiner:['ـها','الخاص بها']},
  1281:{verb:['يبرز','يسلّط الضوء على'],noun:['نقطة بارزة','أبرز جزء']},
  1302:{noun:['بيت','منزل'],adverb:['إلى البيت','في البيت']},
  1367:{preposition:['في'],adverb:['في الداخل']},
  1415:{noun:['اهتمام','فائدة'],verb:['يهمّ']},
  1468:{verb:['يركل'],noun:['ركلة']},
  1485:{noun:['ملصق','بطاقة تعريف'],verb:['يصنّف','يلصق بطاقة']},
  1488:{noun:['نقص'],verb:['يفتقر إلى']},
  1500:{adverb:['أخيرًا','في المرة الأخيرة'],noun:['الأخير','آخر شخص أو شيء']},
  1509:{verb:['يطلق','يدشّن'],noun:['إطلاق','تدشين']},
  1530:{adjective:['أيسر','متبقٍ','يساري'],adverb:['إلى اليسار'],noun:['اليسار']},
  1554:{noun:['رابط','صلة'],verb:['يربط']},
  1568:{noun:['حمولة'],verb:['يحمّل']},
  1575:{verb:['يقفل','يغلق'],noun:['قفل']},
  1578:{adjective:['طويل'],adverb:['طويلًا']},
  1589:{adjective:['عالٍ','صاخب'],adverb:['بصوت عالٍ']},
  1604:{noun:['سحر'],adjective:['سحري']},
  1618:{verb:['يضع علامة','يصحّح'],noun:['علامة','درجة','أثر']},
  1634:{noun:['أمر','مسألة'],verb:['يهمّ']},
  1701:{determiner:['مزيد من'],pronoun:['المزيد','أكثر'],adverb:['أكثر']},
  1703:{determiner:['معظم'],pronoun:['معظمهم','الأكثر'],adverb:['أكثر ما','إلى أقصى حد']},
  1716:{determiner:['كثير من'],pronoun:['الكثير'],adverb:['كثيرًا']},
  1721:{noun:['جريمة قتل','قتل'],verb:['يقتل']},
  1782:{noun:['الشمال'],adjective:['شمالي'],adverb:['شمالًا','نحو الشمال']},
  1829:{preposition:['على'],adverb:['قيد التشغيل','على']},
  1835:{adjective:['وحيد','الوحيد'],adverb:['فقط']},
  1875:{preposition:['خارج'],noun:['الخارج'],adjective:['خارجي']},
  1878:{adjective:['إجمالي','عام'],adverb:['عمومًا','إجمالًا']},
  1883:{noun:['وتيرة','سرعة','خطوة'],verb:['يسير جيئة وذهابًا','يضبط الوتيرة']},
  1913:{adjective:['ماضٍ','سابق'],noun:['الماضي'],preposition:['بعد','متجاوزًا']},
  1977:{noun:['بلاستيك'],adjective:['بلاستيكي','مصنوع من البلاستيك']},
  2106:{noun:['احتجاج'],verb:['يحتج','يعترض']},
  2113:{adjective:['عام'],noun:['الجمهور']},
  2146:{verb:['يقتبس'],noun:['اقتباس','سعر معروض']},
  2152:{noun:['مطر'],verb:['تمطر']},
  2199:{verb:['يندم'],noun:['ندم']},
  2233:{verb:['يرد','يجيب'],noun:['رد','إجابة']},
  2238:{noun:['ممثل'],adjective:['تمثيلي','نموذجي']},
  2242:{noun:['مقيم'],adjective:['مقيم']},
  2272:{adjective:['صحيح','أيمن'],adverb:['يمينًا','مباشرة'],noun:['حق','يمين']},
  2278:{noun:['خطر'],verb:['يخاطر']},
  2285:{verb:['يتدحرج','يلفّ'],noun:['لفّة','دوران']},
  2300:{noun:['مطاط','ممحاة'],adjective:['مطاطي','مصنوع من المطاط']},
  2317:{adjective:['نفسه','ذاته'],pronoun:['الشيء نفسه'],adverb:['كذلك','بالطريقة نفسها']},
  2343:{verb:['يصرخ'],noun:['صرخة','صراخ']},
  2349:{noun:['بحث'],verb:['يبحث']},
  2421:{noun:['صدمة'],verb:['يصدم','يذهل']},
  2491:{noun:['ثلج'],verb:['تثلج']},
  2522:{noun:['اختصاصي'],adjective:['متخصص','تخصصي']},
  2548:{adjective:['مربّع'],noun:['مربّع','ميدان']},
  2588:{verb:['يتوقف'],noun:['توقف','موقف']},
  2637:{verb:['يدعم'],noun:['دعم','مساعدة']},
  2645:{noun:['مفاجأة'],verb:['يفاجئ']},
  2652:{verb:['يشتبه في'],noun:['مشتبه به']},
  2679:{verb:['يمزّق'],noun:['تمزق','شق']},
  2701:{exclamation:['شكرًا'],noun:['شكر','امتنان']},
  2702:{determiner:['ذلك'],pronoun:['ذلك','الذي'],conjunction:['أن','الذي']},
  2735:{verb:['يربط'],noun:['ربطة','ربطة عنق']},
  2750:{adverb:['غدًا'],noun:['الغد','اليوم التالي']},
  2757:{noun:['قمة','أعلى جزء'],adjective:['علوي','أعلى']},
  2770:{noun:['لعبة'],adjective:['مخصص للعب','صغير شبيه باللعبة']},
  2779:{verb:['ينقل','يحوّل'],noun:['نقل','تحويل','انتقال']},
  2785:{verb:['يسافر'],noun:['سفر']},
  2802:{verb:['يدور','ينعطف'],noun:['دور','منعطف']},
  2807:{noun:['توأم'],adjective:['توأمي','مزدوج']},
  2821:{adjective:['تحت الأرض','سري'],adverb:['تحت الأرض']},
  2921:{exclamation:['مرحبًا'],verb:['يرحّب'],adjective:['مرحب به','موضع ترحيب']},
  2923:{noun:['الغرب'],adjective:['غربي'],adverb:['غربًا','نحو الغرب']},
  2937:{verb:['يهمس'],noun:['همس','صوت خافت']},
  2938:{adjective:['أبيض'],noun:['اللون الأبيض']},
  2971:{adjective:['عالمي','منتشر في العالم'],adverb:['عالميًا']},
  2989:{adjective:['أصفر'],noun:['اللون الأصفر']}
};

Object.assign(meaningOverrides, {
  50:{noun:['تقدّم','سلفة'],verb:['يتقدّم','يقدّم'],adjective:['مسبق']},
  147:{noun:['استئناف','مناشدة','جاذبية'],verb:['يستأنف','يناشد']},
  183:{adverb:['كما','بالقدر نفسه'],conjunction:['كما','بينما','لأنّ']},
  244:{noun:['قاعدة','أساس'],verb:['يؤسّس','يستند إلى']},
  272:{preposition:['خلف','وراء'],adverb:['خلف','في الخلف']},
  278:{adverb:['أدناه','في الأسفل'],preposition:['أسفل','تحت']},
  402:{noun:['عاصمة','رأس مال'],adjective:['رئيسي','متعلق بالعاصمة','كبير للحروف']},
  529:{noun:['عمولة','لجنة','تكليف رسمي'],verb:['يكلّف رسميًا','يفوّض']},
  571:{adjective:['محافظ','تقليدي'],noun:['محافظ','شخص محافظ']},
  587:{noun:['مسابقة'],verb:['ينازع','يعترض على']},
  593:{noun:['تباين','تضادّ'],verb:['يتباين','يقارن بين']},
  672:{noun:['دورة','دراجة'],verb:['يركب دراجة']},
  812:{verb:['ينزّل'],noun:['تنزيل']},
  817:{noun:['مسودة'],verb:['يصوغ مسودة','يُجنّد']},
  866:{determiner:['أيّ من الاثنين'],pronoun:['أيّهما','أحدهما'],adverb:['أيضًا في سياق النفي']},
  903:{determiner:['ما يكفي من'],pronoun:['ما يكفي','قدر كافٍ'],adverb:['بما يكفي']},
  960:{noun:['عذر','مبرّر'],verb:['يعذر','يبرّر']},
  1077:{verb:['يناسب'],adjective:['مناسب','لائق بدنيًا']},
  1099:{noun:['طيران'],adjective:['طائر','جويّ']},
  1244:{adjective:['صعب','قاسٍ'],adverb:['بجدّ','بشدّة']},
  1267:{exclamation:['مرحبًا'],noun:['تحية','لفظة مرحبًا']},
  1476:{verb:['يقبّل'],noun:['قبلة']},
  1500:{adverb:['آخر مرة','في المرة الأخيرة'],noun:['الأخير','آخر شخص أو شيء']},
  1550:{noun:['حدّ','أقصى حدّ'],verb:['يحدّ']},
  1562:{adjective:['صغير'],determiner:['قليل من','بعض'],pronoun:['قليل']},
  1579:{adjective:['طويل الأمد','على المدى الطويل'],adverb:['على المدى الطويل']},
  1662:{noun:['فوضى'],verb:['يفسد','يبعثر']},
  1706:{noun:['محرّك'],adjective:['ذو محرّك','متعلق بالمحرّكات']},
  1826:{exclamation:['حسنًا'],adjective:['مقبول','بخير'],adverb:['على نحو مقبول','جيدًا']},
  1829:{preposition:['على'],adverb:['قيد التشغيل','مستمرًا']},
  1846:{adjective:['معاكس','مقابل'],adverb:['في الجهة المقابلة'],preposition:['مقابل'],noun:['العكس','النقيض']},
  1851:{noun:['طلب','أمر','ترتيب'],verb:['يطلب','يأمر','يرتّب']},
  1877:{preposition:['فوق','أكثر من'],adverb:['فوق','إلى الجانب الآخر','انتهى']},
  1931:{noun:['نسبة مئوية'],adjective:['مئوي','محسوب بالنسبة المئوية'],adverb:['بنسبة مئوية']},
  1962:{noun:['كومة'],verb:['يكدّس','يتراكم']},
  1991:{adjective:['زائد','إضافي'],conjunction:['بالإضافة إلى'],noun:['علامة الجمع','ميزة إضافية']},
  2011:{noun:['موسيقى البوب'],adjective:['متعلق بموسيقى البوب','شعبي']},
  2392:{determiner:['عدّة','عدد من'],pronoun:['عدّة أشخاص أو أشياء']},
  2491:{noun:['ثلج'],verb:['تتساقط الثلوج']},
  2656:{adjective:['حلو المذاق'],noun:['حلوى']},
  2897:{verb:['يمشي'],noun:['مشي','سير','نزهة مشيًا']},
  2922:{adverb:['جيدًا','حسنًا'],adjective:['بخير'],exclamation:['حسنًا']},
  2926:{pronoun:['ما','ماذا'],determiner:['ما','أيّ']},
  2927:{determiner:['أيّ ... كان'],pronoun:['أيّ شيء','مهما يكن']},
  2935:{pronoun:['أيّ واحد','الذي'],determiner:['أيّ']}
});

const partLabelsAr = {
  noun:'اسم',verb:'فعل',adjective:'صفة',adverb:'حال',pronoun:'ضمير',preposition:'حرف جر',
  conjunction:'أداة ربط',determiner:'محدّد',exclamation:'أداة تعجب',number:'عدد',article:'أداة',auxiliary:'فعل مساعد',modal:'فعل ناقص'
};

const sourceAliases = {
  noun:['noun','plural noun'],verb:['verb'],adjective:['adjective','determiner','noun'],adverb:['adverb','preposition','adjective'],
  pronoun:['pronoun','determiner'],preposition:['preposition','adverb','conjunction'],conjunction:['conjunction','preposition','adverb'],
  determiner:['determiner','predeterminer','pronoun','adjective'],exclamation:['exclamation','adverb','noun'],
  number:['number','determiner','adjective','pronoun'],article:['article','determiner'],auxiliary:['auxiliary verb','verb'],modal:['modal verb','auxiliary verb','verb']
};

function extractVocabulary(html) {
  const marker = 'const VOCAB=';
  const start = html.indexOf(marker) + marker.length;
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
    else if (char === ']' && --depth === 0) return { start, end: i + 1, value: JSON.parse(html.slice(start, i + 1)) };
  }
  throw new Error('Unterminated VOCAB');
}

function normalizePos(pos) {
  if (pos === 'auxiliary verb') return 'auxiliary';
  if (pos === 'plural noun') return 'noun';
  if (pos === 'quantifier' || pos === 'predeterminer') return 'determiner';
  return pos;
}

function normalizeArabic(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/التكرارفي/g, 'التكرار في')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitArabic(value) {
  return normalizeArabic(value).split(/\s*[؛/]\s*/).map(segment => segment.trim()).filter(Boolean);
}

function comparableArabic(value) {
  return normalizeArabic(value)
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي]/g, '');
}

function bigrams(value) {
  const normalized = comparableArabic(value);
  if (normalized.length < 2) return new Set([normalized]);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function similarity(left, right) {
  const a = bigrams(left), b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function looksLikeVerb(value) {
  const first = normalizeArabic(value).split(/[ /]/)[0];
  return /^(?:لا\s*)?[يتنأ][ء-ي]{2,}/.test(first) && !/^(?:توازن|تبادل|تمويل|تصدير|تأثير|تخمين|تصويت|توقف|تركيز|تقدير|تنزيل|تأخير|تنفيذي|ترتيب|تجارة|تجاري|يسار|يمين)/.test(first);
}

function hashDefinition(definition) {
  return crypto.createHash('sha256').update(definition.trim()).digest('hex');
}

function sourceForFallback(reference, pos) {
  const aliases = sourceAliases[pos] ?? [pos];
  return reference.english.senses.find(sense => aliases.includes(sense.pos) && sense.definition) ??
    reference.english.senses.find(sense => sense.definition);
}

const html = fs.readFileSync(indexPath, 'utf8');
const extracted = extractVocabulary(html);
const vocabulary = extracted.value;
const baselineHtml = baselinePath ? fs.readFileSync(baselinePath, 'utf8') : html;
const baselineExtracted = baselinePath ? extractVocabulary(baselineHtml) : extracted;
const baselineVocabulary = baselineExtracted.value;
const baselineEntries = new Map(baselineVocabulary.map(entry => [entry.id, entry]));
const referenceFile = JSON.parse(fs.readFileSync(referencesPath, 'utf8'));
const references = new Map(referenceFile.references.map(reference => [reference.id, reference]));
const originalLevels = new Map(vocabulary.map(entry => [entry.id, entry.level]));
const targetIds = vocabulary.filter(entry => entry.manualReviewRequired || entry.translationReview === REVIEW_ID).map(entry => entry.id);

if (targetIds.length !== 425) throw new Error(`Expected 425 manual-review entries, found ${targetIds.length}`);

let meaningCount = 0;
let fallbackCount = 0;
for (const entry of vocabulary.filter(item => targetIds.includes(item.id))) {
  const reference = references.get(entry.id);
  if (!reference || reference.error) throw new Error(`Missing dictionary reference for ${entry.id} ${entry.word}`);
  const sourceSummaryAr = entry.sourceSummaryAr ?? baselineEntries.get(entry.id)?.ar;
  if (!sourceSummaryAr) throw new Error(`Missing pre-resolution Arabic summary for ${entry.id} ${entry.word}`);
  entry.sourceSummaryAr = sourceSummaryAr;
  const meanings = [];
  const sourcesByPos = new Map(entry.partsOfSpeech.map(pos => [pos, reference.bilingual.senses.filter(sense => normalizePos(sense.pos) === pos && sense.definition && sense.translationAr)]));
  const assigned = new Map(entry.partsOfSpeech.map(pos => [pos, []]));
  const segments = splitArabic(sourceSummaryAr);

  for (const [index, segment] of segments.entries()) {
    let bestPos = null, bestScore = 0;
    for (const pos of entry.partsOfSpeech) {
      const score = Math.max(0, ...sourcesByPos.get(pos).map(sense => similarity(segment, sense.translationAr)));
      if (score > bestScore) { bestScore = score; bestPos = pos; }
    }
    if (bestScore < 0.22) {
      if (looksLikeVerb(segment) && entry.partsOfSpeech.includes('verb')) bestPos = 'verb';
      else if (segments.length === entry.partsOfSpeech.length) bestPos = entry.partsOfSpeech[index];
      else bestPos = [...entry.partsOfSpeech].sort((a, b) => assigned.get(a).length - assigned.get(b).length)[0];
    }
    assigned.get(bestPos).push(segment);
  }

  const override = meaningOverrides[entry.id];
  if (override) {
    for (const pos of entry.partsOfSpeech) {
      if (override[pos]) assigned.set(pos, override[pos]);
    }
  }

  for (const pos of entry.partsOfSpeech) {
    const exactSources = sourcesByPos.get(pos);
    let translations = assigned.get(pos);
    if (!exactSources.length) {
      if (!translations.length) {
        const fallbackAr = manualFallbacks[entry.id]?.[pos];
        if (!fallbackAr) throw new Error(`Missing curated fallback for ${entry.id} ${entry.word} (${pos})`);
        translations = splitArabic(fallbackAr);
      }
      fallbackCount += translations.length;
    } else if (!translations.length) {
      if (segments.length === 1) translations = segments;
      else if (manualFallbacks[entry.id]?.[pos]) translations = splitArabic(manualFallbacks[entry.id][pos]);
      else translations = [normalizeArabic(exactSources[0].translationAr)];
    }

    for (const ar of [...new Set(translations)]) {
      const rankedSources = exactSources
        .map(sense => ({ sense, score: similarity(ar, sense.translationAr) }))
        .sort((a, b) => b.score - a.score);
      const bilingualSense = rankedSources[0]?.sense;
      const sourceSense = bilingualSense ?? sourceForFallback(reference, pos);
      if (!sourceSense?.definition) throw new Error(`Missing source sense for ${entry.id} ${entry.word} (${pos}: ${ar})`);
      meanings.push({
        pos,
        ar,
        senseAr: ar,
        sourceDictionary: bilingualSense
          ? 'Cambridge English–Arabic Dictionary'
          : 'Cambridge English Dictionary; part of speech cross-checked with Oxford 3000',
        sourceUrl: sourceSense.sourceUrl,
        ...(bilingualSense ? {} : { posSourceUrl: OXFORD_POS_URL }),
        sourceDefinitionSha256: hashDefinition(sourceSense.definition)
      });
    }
  }

  for (const pos of entry.partsOfSpeech) {
    if (!meanings.some(meaning => meaning.pos === pos)) throw new Error(`Unresolved part of speech ${entry.id} ${entry.word} (${pos})`);
  }

  const summaryByPos = entry.partsOfSpeech.map(pos => {
    const translations = [...new Set(meanings.filter(meaning => meaning.pos === pos).map(meaning => meaning.ar))];
    return `${partLabelsAr[pos] ?? pos}: ${translations.join('، ')}`;
  });
  const primaryTranslations = [];
  const seenPrimaryAtoms = new Set();
  for (const pos of entry.partsOfSpeech) {
    const candidates = meanings.filter(meaning => meaning.pos === pos).flatMap(meaning => normalizeArabic(meaning.ar).split(/[؛/]/).map(atom => atom.trim()).filter(Boolean));
    const candidate = candidates.find(atom => !seenPrimaryAtoms.has(comparableArabic(atom))) ?? candidates[0];
    if (candidate) {
      seenPrimaryAtoms.add(comparableArabic(candidate));
      primaryTranslations.push(candidate);
    }
  }

  entry.meanings = meanings;
  entry.ar = [...new Set(primaryTranslations)].join('؛ ');
  entry.sense = `Dictionary-verified meanings separated for: ${entry.partsOfSpeech.join(', ')}`;
  entry.senseAr = summaryByPos.join(' | ');
  entry.translationStatus = 'reviewed';
  entry.translationConfidence = 'high';
  entry.translationReview = REVIEW_ID;
  entry.translationReviewType = 'authoritative-dictionary-assisted-human-curation';
  entry.translationReviewDate = REVIEW_DATE;
  entry.contentVersion = Math.max(Number(entry.contentVersion) || 0, 16);
  entry.dictionarySources = [
    { name: 'Cambridge English–Arabic Dictionary', url: reference.bilingual.finalUrl },
    { name: 'Cambridge English Dictionary', url: reference.english.finalUrl },
    { name: 'Oxford 3000 by CEFR level', url: OXFORD_POS_URL }
  ];
  entry.qualityIssues = (entry.qualityIssues ?? []).filter(issue => ![
    'multiple-parts-of-speech','missing-sense','sense-level-review-needed'
  ].includes(issue));
  if (entry.qualityIssues.length === 0) delete entry.qualityIssues;
  delete entry.manualReviewRequired;
  delete entry.manualReviewReason;
  meaningCount += meanings.length;
}

if (vocabulary.some(entry => entry.manualReviewRequired || entry.translationStatus === 'partial')) {
  throw new Error('Manual-review or partial records remain after resolution');
}
for (const entry of vocabulary) {
  if (entry.level !== originalLevels.get(entry.id)) throw new Error(`CEFR level changed for ${entry.id}`);
}

const suffix = baselineHtml.slice(baselineExtracted.end);
const output = html.slice(0, extracted.start) + JSON.stringify(vocabulary) + suffix;
if (shouldWrite) fs.writeFileSync(indexPath, output);

console.log(JSON.stringify({
  write: shouldWrite,
  reviewedEntries: targetIds.length,
  resolvedMeaningCount: meaningCount,
  curatedFallbackMeanings: fallbackCount,
  fullyReviewedRecords: vocabulary.filter(entry => entry.translationStatus === 'reviewed').length,
  manualReviewRequired: vocabulary.filter(entry => entry.manualReviewRequired).length,
  partialRecords: vocabulary.filter(entry => entry.translationStatus === 'partial').length
}, null, 2));
