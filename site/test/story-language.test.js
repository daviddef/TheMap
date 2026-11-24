/* A story in any language: found on the device as it is typed, read into English by the browser's own translator where there is one, or by Claude where there is not.
   David: «this isnt a croatian site, its supposed to be global». */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");
const load = (root) => { const m = { exports: {} }; new Function("module", "window", read("../public/js/story-lang.js").replace(/\}\)\(typeof window !== "undefined" \? window : [^\n]*/, "})(window);"))(m, root || {}); return m.exports; };
const L = load({});

const SAMPLES = {
hr:"Tražim obitelj Mažuranić iz Novog Vinodolskog, otišli su u Ameriku oko 1900. Moj djed je bio iz tog kraja.",
"hr2":"Moja baka je rođena u Crikvenici 1921. godine. Djevojačko prezime joj je bilo Kauzlarić. Zna li netko nešto o ovoj obitelji?",
it:"Mio nonno Giovanni Defranceschi era nato a Fiume e dopo la guerra la famiglia è partita per l'Argentina.",
de:"Mein Urgroßvater ist 1885 aus Dresden nach Milwaukee ausgewandert. Er war Schreiner und seine Frau hieß Anna.",
fr:"Mon arrière-grand-père est né en 1890 dans un village près de Lyon et il est parti pour le Canada avec sa famille.",
es:"Mi abuela nació en Galicia en 1920 y su familia se fue a Argentina después de la guerra. Busco a los hermanos de mi bisabuelo.",
pt:"Meu avô nasceu em Portugal em 1915 e foi para o Brasil com a família depois da guerra. Procuro parentes da família Silva.",
nl:"Mijn grootvader is geboren in 1900 in een dorp bij Antwerpen en is naar Amerika vertrokken met zijn vrouw en kinderen.",
pl:"Moja babcia urodziła się w 1921 roku we wsi koło Krakowa. Szukam rodziny, która wyjechała do Ameryki przed wojną.",
cs:"Můj dědeček se narodil v roce 1900 ve vesnici u Brna a odešel do Ameriky. Hledám jeho rodinu a jeho bratry.",
sk:"Môj starý otec sa narodil v roku 1900 v dedine pri Košiciach a odišiel do Ameriky. Hľadám jeho rodinu.",
sl:"Moj dedek se je rodil leta 1900 v vasi pri Ljubljani in je odšel v Ameriko. Iščem njegovo družino.",
hu:"A nagyapám 1900-ban született egy faluban Debrecen mellett, és Amerikába vándorolt ki a családjával.",
ro:"Bunicul meu s-a născut în 1900 într-un sat lângă Cluj și a plecat în America cu familia lui după război.",
sv:"Min farfar föddes 1900 i en by nära Göteborg och emigrerade till Amerika med sin familj efter kriget.",
fi:"Isoisäni syntyi vuonna 1900 kylässä lähellä Ouluja ja muutti Amerikkaan perheensä kanssa.",
tr:"Dedem 1900 yılında bir köyde doğdu ve ailesiyle birlikte Amerika'ya gitti. Ailesini arıyorum.",
ru:"Мой дед родился в 1900 году в деревне под Киевом и уехал в Америку с семьёй после войны.",
uk:"Мій дідусь народився в 1900 році в селі біля Львова і поїхав до Америки з родиною.",
el:"Ο παππούς μου γεννήθηκε το 1900 σε ένα χωριό κοντά στη Θεσσαλονίκη και έφυγε για την Αμερική.",
he:"סבא שלי נולד בשנת 1900 בכפר ליד וילנה והיגר לאמריקה עם משפחתו אחרי המלחמה.",
ar:"ولد جدي في عام 1900 في قرية قرب بيروت وهاجر إلى أمريكا مع عائلته بعد الحرب.",
zh:"我的祖父1900年出生在广东的一个村庄，后来和家人一起移民到美国。",
ja:"私の祖父は1900年に広島の村で生まれ、家族と一緒にアメリカに移住しました。",
ko:"저의 할아버지는 1900년에 서울 근처 마을에서 태어나 가족과 함께 미국으로 이민 가셨습니다.",
en1:"My nono Giovanni Defranceschi was from Fiume (now Rijeka). The family moved to Argentina after WWII.",
en2:"Looking for relatives of Ivan Blažević from Senj. He emigrated to Pittsburgh in 1912 on a ship from Trieste.",
en3:"Found this old photo of my grandfather. On the back it says Žumberak 1938. Does anyone know these people?",
en4:"Kauzlarić Kauzlarić anyone from this name??",
short:"Senj 1905",
};

test("the language of a story is found from a few sentences, in thirty languages and four scripts", () => {
  const want = { hr2: "hr", en1: "en", en2: "en", en3: "en", en4: "en" };
  for (const [k, v] of Object.entries(SAMPLES)) {
    if (k === "short") continue;
    const d = L.detect(v), code = want[k] || k;
    assert.equal(d.code, code, k + " was read as " + d.code);
    assert.equal(d.english, code === "en", k);
    assert.ok(d.sure, k + " should be sure");
  }
});

test("English with foreign words in it is English, and a few words are not guessed at", () => {
  assert.equal(L.detect("My nono Giovanni Defranceschi was from Fiume. La famiglia moved to Argentina after the war.").english, true);
  const short = L.detect("Senj 1905"); assert.equal(short.english, true); assert.equal(short.sure, false);
  assert.equal(L.detect("").code, "");
});

test("Croatian is named as the group it shares a language with; Ukrainian, Serbian and Russian are told apart by their letters", () => {
  assert.equal(L.detect(SAMPLES.hr).note, "Croatian, Bosnian or Serbian");
  assert.equal(L.detect("Мій дідусь народився в селі біля Львова і поїхав до Америки.").code, "uk");
  assert.equal(L.detect("Мој деда је рођен у селу крај Ниша и отишао је у Америку.").code, "sr");
  assert.equal(L.detect("Мой дед родился в деревне под Киевом и уехал в Америку.").code, "ru");
});

test("a name that did not come through the translation is listed; one that was only inflected or lost its accent is not", () => {
  assert.deepEqual(L.lostNames("Tražim obitelj Mažuranić iz Novog Vinodolskog, otišli su", "I am looking for the Mažuranić family from Novi Vinodolski, they went"), []);
  assert.deepEqual(L.lostNames("Moj djed Ivan Kauzlarić je otišao iz Senja u Chicago", "My grandfather Ivan Kauzlaric left Zengg for Chicago"), ["Senja"]);
});

test("the device translator: unsupported without one, a verdict when it has one, and a silent one does not hold the page up", async () => {
  assert.equal(await L.deviceStatus("hr"), "unsupported");
  const has = load({ Translator: { availability: async () => "downloadable" } });
  assert.equal(await has.deviceStatus("hr"), "downloadable");
  assert.equal(await has.deviceStatus("en"), "unsupported");
  const silent = load({ Translator: { availability: () => new Promise(() => {}) } });
  const t0 = Date.now(); assert.equal(await silent.deviceStatus("hr"), "unsupported"); assert.ok(Date.now() - t0 < 4000);
});

test("the device translator is run a paragraph at a time and reports the language pack's progress", async () => {
  const calls = []; let listener = null;
  const fake = { create: async (o) => { calls.push(o); if (o.monitor) o.monitor({ addEventListener: (n, f) => { listener = f; } }); return { translate: async (p) => "EN:" + p, destroy() {} }; } };
  const T = load({ Translator: fake }); let pct = -1;
  const out = await T.deviceTranslate("Prvi dio.\n\nDrugi dio.", "hr", (f) => { pct = f; });
  assert.equal(out, "EN:Prvi dio.\nEN:Drugi dio.");
  assert.equal(calls[0].sourceLanguage, "hr"); assert.equal(calls[0].targetLanguage, "en");
  listener({ loaded: 0.5 }); assert.equal(pct, 0.5);
  await assert.rejects(load({}).deviceTranslate("x", "hr"), /cannot translate/);
});

test("the story page reads the English copy, keeps the writer's words, asks before sending anything, and offers every way out", () => {
  const js = read("../public/js/story-page.js"), page = read("../src/pages/read.astro");
  assert.match(js, /function readingText\(raw\)/);
  assert.match(js, /var raw = text\.value, t = readingText\(raw\)(?:, rw = null)?; checkLang\(raw\);/);
  assert.match(js, /var t = \(readingNow \|\| readingText\(text\.value\)\)\.trim\(\);/, "the gaps read the English copy too");
  assert.match(js, /call\("english", \{ text: raw/);
  assert.match(js, /if \(lang\.ok\) viaClaude\(raw\)/, "Claude is only asked after the tick");
  assert.match(js, /Translated on this device/); assert.match(js, /Translated by Claude/);
  assert.match(js, /Put the English in the box/); assert.match(js, /read it as it is/);
  assert.match(js, /Check these names in the English/);
  assert.match(page, /id="sp-lang"/);
  assert.ok(page.indexOf("story-lang.js") > -1 && page.indexOf("story-lang.js") < page.indexOf("story-page.js"), "the detector loads before the page");
});
