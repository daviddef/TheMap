/* WHAT LANGUAGE A STORY IS IN, AND IT IN ENGLISH. David: «this isnt a croatian site, its supposed to be global, so in reality it could be any language, so i feel we need
   a ai language detect and translation built in». The story reader (story-engine.js) understands English: its relations, its «from», «to» and «left». A story written in
   any other language is read into English first, and the reader reads that, while the box keeps the writer's own words.

   THREE LAYERS, THE CHEAPEST FIRST, AND NOTHING LEAVES THE DEVICE UNTIL THE READER SAYS SO.
   1. DETECT: here, offline, instant. A script (Cyrillic, Greek, Arabic, Han, ...) names its language family at once; a Latin-script text is scored on the little words every
      language cannot do without («je», «che», «und», «el», «nie»). It says «not sure» rather than guess, and a text that is mostly English with a few foreign words
      (a Facebook post that says «my nono was from Fiume») is English. When the browser has its own detector (Chrome's LanguageDetector, on the device), it is asked too.
   2. TRANSLATE ON THE DEVICE: Chrome's Translator, where the browser has one: free, private, and nothing is sent anywhere. Some languages need a small language pack
      downloaded first, which the reader starts with a tap.
   3. TRANSLATE WITH CLAUDE: for a browser that has no translator, or a language it lacks: the whole text goes to the Worker (/v1/english, behind a tick that says so).

   A translation is a reading copy, never a replacement: names and places are checked against the original, and the ones that did not survive are listed for the reader.
   A classic script: window.raStoryLang, and module.exports for the tests. */
(function (root) {
  "use strict";

  var NAMES = { en: "English", hr: "Croatian", sr: "Serbian", bs: "Bosnian", sl: "Slovenian", it: "Italian", de: "German", fr: "French", es: "Spanish", pt: "Portuguese", nl: "Dutch",
    pl: "Polish", cs: "Czech", sk: "Slovak", hu: "Hungarian", ro: "Romanian", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish", tr: "Turkish", ca: "Catalan",
    la: "Latin", ru: "Russian", uk: "Ukrainian", be: "Belarusian", bg: "Bulgarian", mk: "Macedonian", el: "Greek", he: "Hebrew", yi: "Yiddish", ar: "Arabic", fa: "Persian",
    hi: "Hindi", bn: "Bengali", th: "Thai", zh: "Chinese", ja: "Japanese", ko: "Korean", hy: "Armenian", ka: "Georgian", lt: "Lithuanian", lv: "Latvian", et: "Estonian",
    sq: "Albanian", id: "Indonesian", vi: "Vietnamese", tl: "Tagalog", is: "Icelandic", ga: "Irish", cy: "Welsh", af: "Afrikaans", sw: "Swahili" };

  /* The small words. About twenty-five a language, the ones that turn up in any three sentences; chosen to differ between neighbours (Croatian «je», «da», «su»; Slovak
     «je», «som»; Czech «je», «jsem»; Polish «jest», «nie»; Italian «che», «di»; Spanish «que», «de»; Portuguese «não», «uma»). */
  var STOP = {
    en: "the and of to in was is my he she they his her their from with for that had were born came left at on as by this have not but after before about when who our we i me".split(" "),
    hr: "je su da se na u i od za s sa su iz koji koja koje što sto ne nije bio bila bili nakon prije oko moj moja moji njegov njezin ona on oni kada gdje ali ili kao smo sam".split(" "),
    sl: "je so da se na v in od za s z iz ki kaj ne ni bil bila bili po pred okoli moj moja njegov njena on ona oni ko kje ampak ali kot smo sem".split(" "),
    it: "il lo la le gli un una di che e è era sono nel nella del della dei delle per con da in a non mio mia suo sua loro dopo prima quando dove ma o come siamo sono nato nata".split(" "),
    de: "der die das und ist war ein eine nicht ich mein meine sein seine ihre sie er es wir von mit für auf aus nach vor um als wo wann aber oder wurde geboren zu im den dem".split(" "),
    fr: "le la les un une des du de et est était sont dans pour avec sur par que qui ne pas mon ma mes son sa ses nous vous il elle ils après avant quand où mais ou comme né née au aux".split(" "),
    es: "el la los las un una unos de que y es era son en del por con para no mi mis su sus nosotros ella él ellos después antes cuando donde pero o como nació nacido al se lo".split(" "),
    pt: "o a os as um uma de que e é era são em do da dos das por com para não meu minha meus seu sua nós ele ela eles depois antes quando onde mas ou como nasceu nascido no na".split(" "),
    nl: "de het een en is was van in op te dat die niet mijn zijn haar ze hij zij wij met voor aan uit naar door maar of als geboren na voor toen waar".split(" "),
    pl: "i w nie na z do się to jest był była byli że jak mój moja jego jej on ona oni po przed kiedy gdzie ale lub urodził urodziła rodzina dziadek babcia od przez".split(" "),
    cs: "a v je se na to že byl byla byli jsem jsou s z do od pro ne můj moje jeho její on ona oni po před kdy kde ale nebo jako narodil narodila rodina dědeček babička".split(" "),
    sk: "a v je sa na to že bol bola boli som sú s z do od pre nie môj moja jeho jej on ona oni po pred keď kde ale alebo ako narodil narodila rodina starý otec".split(" "),
    hu: "a az és egy nem is volt voltak hogy én ő mi ti ők nagyapám nagyanyám apám anyám született származott után előtt mikor hol de vagy mint innen onnan meg el be ki".split(" "),
    ro: "și de la în cu pe un o este era sunt nu că care mea meu lui ei el ea ei după înainte când unde dar sau ca născut născută familia bunicul bunica din pentru".split(" "),
    sv: "och att det i en är var som på av för med till inte jag min hans hennes de vi han hon efter före när var men eller född familj farfar mormor från".split(" "),
    da: "og at det i en er var som på af for med til ikke jeg min hans hendes de vi han hun efter før da hvor men eller født familie farfar mormor fra".split(" "),
    no: "og at det i en er var som på av for med til ikke jeg min hans hennes de vi han hun etter før da hvor men eller født familie farfar bestemor fra".split(" "),
    fi: "ja on oli ei että se hän minä me he isoisä isoäiti syntyi perhe jälkeen ennen kun missä mutta tai kuin sukunimi kotoisin vuonna kylästä".split(" "),
    tr: "ve bir bu da de için ile ama çok benim onun biz siz onlar dedem ninem doğdu aile sonra önce nerede ya da gibi köyünden geldi vardı değil".split(" "),
    ca: "el la els les un una de que i és era són en del per amb per no meu meva seu seva nosaltres ella ells després abans quan on però o com va nascut".split(" "),
    la: "et in est non qui quae quod ad cum de ex pro sed ut natus nata filius filia pater mater anno die baptizatus baptizata matrimonio sepultus uxor".split(" "),
    lt: "ir yra buvo ne kad tai jis ji mes jie senelis močiutė gimė šeima po prieš kai kur bet arba kaip kilęs".split(" "),
    id: "dan yang di ini itu dengan untuk dari tidak adalah saya kakek nenek lahir keluarga setelah sebelum ketika di mana tetapi atau seperti".split(" ")
  };
  var SETS = {}; Object.keys(STOP).forEach(function (k) { SETS[k] = Object.create(null); STOP[k].forEach(function (w) { SETS[k][w] = 1; }); });
  /* letters that are nearly one language's own (Latin script) */
  var MARK = { hr: /[čćžšđ]/i, sl: /[čžš]/i, pl: /[ąęłńśźż]/i, cs: /[ěřůýž]/i, sk: /[ľĺŕôä]/i, hu: /[őű]/i, ro: /[ăâîșşțţ]/i, tr: /[ğıİş]/i, de: /[äöüß]/i, es: /[ñ¿¡]/i, pt: /[ãõç]/i, fr: /[èêëçœ]/i, sv: /[åäö]/i, da: /[æøå]/i, fi: /[äö]/i, is: /[þðæ]/i, lt: /[ąęėįųū]/i };

  /* the script, by the biggest share of letters; a Latin text returns "latin" */
  var SCRIPTS = [
    ["cyrillic", /[Ѐ-ӿ]/g], ["greek", /[Ͱ-Ͽἀ-῿]/g], ["hebrew", /[֐-׿]/g], ["arabic", /[؀-ۿݐ-ݿ]/g],
    ["devanagari", /[ऀ-ॿ]/g], ["bengali", /[ঀ-৿]/g], ["thai", /[฀-๿]/g], ["hangul", /[가-힯ᄀ-ᇿ]/g],
    ["kana", /[぀-ヿ]/g], ["han", /[一-鿿]/g], ["armenian", /[԰-֏]/g], ["georgian", /[Ⴀ-ჿ]/g]
  ];
  function scriptOf(text) {
    var letters = (text.match(/\p{L}/gu) || []).length; if (!letters) return { script: "none", share: 0, counts: {} };
    var counts = {}, best = "latin", bestN = (text.match(/[A-Za-zÀ-ɏ]/g) || []).length;
    SCRIPTS.forEach(function (s) { var n = (text.match(s[1]) || []).length; counts[s[0]] = n; if (n > bestN) { best = s[0]; bestN = n; } });
    return { script: best, share: bestN / letters, counts: counts };
  }
  function words(text) { return (String(text).toLowerCase().match(/[\p{L}'’]+/gu) || []).map(function (w) { return w.replace(/[’']/g, ""); }); }

  /* detect(text) -> { code, name, confidence: 0..1, script, english: bool, sure: bool }. `english` is true when the text can be read as it stands. */
  function detect(text) {
    text = String(text || "").trim();
    var out = { code: "", name: "", confidence: 0, script: "none", english: true, sure: false };
    if (text.length < 12) return out;
    var sc = scriptOf(text); out.script = sc.script;
    if (!sc.share) return out;
    var c = sc.counts, code = "";
    if (sc.script === "cyrillic") {
      code = /[іїєґ]/i.test(text) ? "uk" : /ў/i.test(text) ? "be" : /[јљњћђџ]/i.test(text) ? "sr" : /[ъ]/i.test(text) && !/[ыэ]/i.test(text) ? "bg" : "ru";
    } else if (sc.script === "greek") code = "el";
    else if (sc.script === "hebrew") code = /[װ-ײ]/.test(text) ? "yi" : "he";
    else if (sc.script === "arabic") code = /[پچژگ]/.test(text) ? "fa" : "ar";
    else if (sc.script === "devanagari") code = "hi";
    else if (sc.script === "bengali") code = "bn";
    else if (sc.script === "thai") code = "th";
    else if (sc.script === "hangul") code = "ko";
    else if (sc.script === "kana" || (sc.script === "han" && c.kana > 0)) code = "ja";
    else if (sc.script === "han") code = "zh";
    else if (sc.script === "armenian") code = "hy";
    else if (sc.script === "georgian") code = "ka";
    if (code) { out.code = code; out.name = NAMES[code] || code; out.confidence = Math.min(1, 0.55 + sc.share / 2); out.english = false; out.sure = sc.share > 0.5; return out; }

    var ws = words(text), n = ws.length; if (n < 3) return out;
    var score = {}; Object.keys(SETS).forEach(function (k) { var hit = 0; ws.forEach(function (w) { if (SETS[k][w]) hit++; }); score[k] = hit / n; });
    Object.keys(MARK).forEach(function (k) { if (score[k] != null && MARK[k].test(text)) score[k] += 0.04; });
    var order = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; }), top = order[0], second = order[1];
    var en = score.en || 0, best = score[top];
    /* English wins when its little words are a fair share, or when nothing else clearly beats it: a post with a few foreign words in it is English */
    if (top === "en" || en >= 0.22 || best - en < 0.06 && en >= 0.12) { out.code = "en"; out.name = "English"; out.confidence = Math.min(1, 0.5 + en); out.sure = en >= 0.18; return out; }
    if (best < 0.1 || n < 4) return out;                                    /* too few little words to say: leave it as English, and say it was not sure */
    /* Czech/Slovak, Norwegian/Danish and Croatian/Slovenian share a great deal: take the leader but say how close the next is */
    var gap = best - (score[second] || 0);
    out.code = top; out.name = NAMES[top] || top; out.english = false;
    out.confidence = Math.max(0.3, Math.min(0.97, 0.45 + best * 1.4 + gap * 2)); out.sure = best >= 0.17 && gap >= 0.025;
    if (top === "hr" && /\bije\b|ijeko|vrijeme/i.test(text)) { out.note = "Croatian, Bosnian or Serbian"; }
    if (top === "hr") out.note = "Croatian, Bosnian or Serbian";
    return out;
  }

  /* ---- the browser's own tools, when it has them -------------------------------------------------------------------------------- */
  function nativeDetect(text) {
    var LD = root.LanguageDetector; if (!LD || typeof LD.create !== "function") return Promise.resolve(null);
    return LD.create().then(function (d) { return d.detect(String(text).slice(0, 1500)); }).then(function (r) {
      var t = r && r[0]; if (!t || !t.detectedLanguage || t.detectedLanguage === "und") return null;
      return { code: String(t.detectedLanguage).split("-")[0], confidence: t.confidence || 0 };
    }).catch(function () { return null; });
  }
  /* detectBest: the local reading, sharpened by the browser's when this one was not sure */
  function detectBest(text) {
    var d = detect(text); if (d.sure || d.english && d.code === "en" && d.confidence > 0.7) return Promise.resolve(d);
    return nativeDetect(text).then(function (n) {
      if (!n || n.confidence < 0.6) return d;
      var code = n.code === "nb" || n.code === "nn" ? "no" : n.code;
      return { code: code, name: NAMES[code] || code, confidence: n.confidence, script: d.script, english: code === "en", sure: true, note: d.note };
    });
  }
  /* "available", "downloadable", "downloading" or "unavailable" for this language into English; "unsupported" where the browser has no Translator */
  function deviceStatus(code) {
    var T = root.Translator; if (!T || typeof T.availability !== "function" || !code || code === "en") return Promise.resolve("unsupported");
    /* some builds never answer for a language they lack: after two and a half seconds the answer is «unsupported» */
    var slow = new Promise(function (ok) { setTimeout(function () { ok("unsupported"); }, 2500); });
    return Promise.race([T.availability({ sourceLanguage: code, targetLanguage: "en" }).then(function (a) { return String(a); }).catch(function () { return "unsupported"; }), slow]);
  }
  /* translate on the device. Starting a download needs a tap, so this is called from a click for «downloadable»; `onProgress(0..1)` reports the pack. */
  function deviceTranslate(text, code, onProgress) {
    var T = root.Translator; if (!T) return Promise.reject(new Error("This browser cannot translate on the device."));
    return T.create({ sourceLanguage: code, targetLanguage: "en", monitor: function (m) { try { m.addEventListener("downloadprogress", function (e) { if (onProgress) onProgress(e.loaded); }); } catch (x) { /* no progress */ } } })
      .then(function (t) {
        /* a long story is translated a paragraph at a time: the on-device model has a small window */
        var parts = String(text).split(/\n{2,}|\n/).filter(function (p) { return p.trim(); });
        return parts.reduce(function (chain, p) { return chain.then(function (acc) { return (p.length > 1800 ? t.translate(p.slice(0, 1800)) : t.translate(p)).then(function (r) { acc.push(r); return acc; }); }); }, Promise.resolve([]))
          .then(function (acc) { try { if (t.destroy) t.destroy(); } catch (x) { /* fine */ } return acc.join("\n"); });
      });
  }

  /* names that did not survive a translation: the capitalised words of the original (not at the start of a sentence) that the English no longer holds, an inflected
     form counting as held (Senja for Senj). The same rule the Worker applies to Claude's answer. */
  function lostNames(original, english) {
    var fold = function (x) { return String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
    var eng = (fold(english).match(/[\p{L}]+/gu) || []), lost = [], re = /(?<![.!?]\s)(?<!^)\b(\p{Lu}[\p{L}'\u2019-]{2,})/gu, m, src = String(original || "");
    /* held when some English word shares most of its letters from the start: Senja for Senj, Novog for Novi, Kauzlaric for Kauzlarić */
    function held(w) { var need = Math.min(w.length, Math.max(3, w.length - 2)); return eng.some(function (e) { var k = 0; while (k < w.length && k < e.length && w.charAt(k) === e.charAt(k)) k++; return k >= need; }); }
    while ((m = re.exec(src))) { var w = fold(m[1]); if (!held(w) && lost.indexOf(m[1]) < 0) lost.push(m[1]); if (lost.length >= 8) break; }
    return lost;
  }

  var api = { detect: detect, detectBest: detectBest, deviceStatus: deviceStatus, deviceTranslate: deviceTranslate, lostNames: lostNames, names: NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryLang = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
