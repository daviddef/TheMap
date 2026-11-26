/* THE STORY, CHECKED AGAINST ITS READING: nothing lost, nothing invented. A story pasted into the reader was once read wrong end to end (the great-grandparents missing from the
   tree, Bosnia dropped, a list of names cut at the first comma, Father and Mother boxes the words never mentioned) and every part of the page looked fine on its own. Tests that
   look at one fact at a time never saw it. This looks at the WHOLE: it takes the words as typed and the reading the page built from them, and asks four plain questions of any
   story, with no expected answer written for it:

     A. NOTHING LOST    every name, place, year and count in the words is somewhere in the reading (or is plainly not a name);
     B. NOTHING INVENTED  every person, name, place and year in the reading traces to words that were typed (a «did you mean» is a suggestion and is labelled as one);
     C. CONSISTENT      a relation said in the words («my great grandfather») is on the tree; the teller is not given somebody else's facts; a birth is said where a birth is
                        placed; the route runs in the order told; the person the story is about is the one it starts with.

   It does not read anything again and it adds no fact: a pure function of (text, reading). The gazetteer comes in as callbacks, so it has no data of its own and does not touch
   the page. It never blocks anything: when it is not sure the page SAYS so (confidence «low») and offers the careful reading, which the visitor starts (nothing is sent by this).

   check(text, p, opts) -> { ok, confidence: "high" | "low", problems: [{ code, severity: "high" | "medium" | "info", what, words, span }] }
     p     the reading (what parseStory returns: people, kin, stops, others, suggest, ...)
     opts  { people: the rows the tree was drawn from (default p.people), isPlace(folded phrase) -> truthy, isGiven(folded word) -> truthy }
   confidence is «low» when anything is «high», or two things are «medium». «info» is told to the reader as a note and never lowers confidence.
   A classic script: window.raStoryCheck, and module.exports for the tests and the stress harness. */
(function (root) {
  "use strict";

  function fold(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/ł/g, "l").replace(/ø/g, "o").replace(/ß/g, "ss").replace(/æ/g, "ae");
  }

  /* ---- the words ---- */
  var WORD = /[\p{L}\p{M}][\p{L}\p{M}'’\-]*/gu;
  function tokens(text) {
    var out = [], m, t = String(text || "").replace(/https?:\/\/\S+/g, function (u) { return new Array(u.length + 1).join(" "); });
    var letters = (t.match(/\p{L}/gu) || []).length, caps = (t.match(/\p{Lu}/gu) || []).length, shout = letters > 20 && caps / letters > 0.6;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(t))) {
      var w = m[0].replace(/['’\-]+$/, ""), s = m.index, e = s + w.length;
      var before = t.slice(Math.max(0, s - 6), s).replace(/[\s"'“”‘’(\[«]+$/, "");
      var startOfSentence = s === 0 || before === "" ? (s === 0 || /\n\s*$/.test(t.slice(0, s)) || /^$/.test(before)) : /[.!?…:;]$/.test(before) || /\n\s*$/.test(t.slice(Math.max(0, s - 8), s));
      if (s > 0 && before === "") startOfSentence = /\n\s*$/.test(t.slice(0, s)) || /[.!?…]\s*["'“(\[]*\s*$/.test(t.slice(0, s));
      out.push({ w: w, f: fold(w), s: s, e: e, cap: /^\p{Lu}\p{Ll}/u.test(w) || /^\p{Lu}['’]\p{Lu}/u.test(w), upper: !shout && w.length >= 3 && w === w.toUpperCase() && /\p{Lu}/u.test(w), start: startOfSentence });
    }
    return out;
  }

  /* words that are capitalised without being somebody's name */
  var COMMON = {};
  ("i i'm i've i'd i'll im ive my me we our us you your he she it they them their his her its the a an and but or so if then than that this these those there here when while where what which who whom whose how why not no yes " +
   "all any some many much most more less few one two three four five six seven eight nine ten also just only even still yet again once twice very too as at by for from in into of off on onto out over to up with without about after before " +
   "because since until until although though however maybe perhaps please thanks thank hello hi dear regards sorry anyone anybody someone everyone nobody nothing something everything " +
   "mr mrs ms miss dr sir madam fr rev st saint good bad great old new young little big first second third last next other another same such own " +
   "january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday " +
   "mum mom dad mama papa nan nana nanna gran granny grandma grandpa granddad grandad nonna nonno oma opa baka djed tata mama " +
   "christmas easter god lord jesus mary mass amen facebook whatsapp ancestry myheritage familysearch geni google internet email online website youtube instagram " +
   "catholic orthodox protestant lutheran jewish muslim christian methodist baptist anglican " +
   "born died married lived live street road avenue lane drive house farm church parish village town city county state island river hill hills lake bay port " +
   "ok okay yes no maybe um").split(/\s+/).forEach(function (w) { if (w) COMMON[fold(w)] = 1; });
  /* a nationality or a language, capitalised, is not a person or a place the reader should have placed */
  var DEMONYM = /^(?:\p{Lu}\p{L}*(?:ian|ish|ese|ean|ite|ic|ans?|ers?)|serbs?|croats?|slavs?|greeks?|french|dutch|swiss|turks?|roma|jews?|czechs?|poles?|danes?|finns?|scots?|welsh|irish|german|germans)$/iu;

  /* ---- the relations ---- */
  var KINDS = [
    ["great-grandfather", /\bgreat[- ]?(?:great[- ]?)*(?:grand(?:father|dad|ad|pa|parent)|gramps|nonno)s?\b/i], ["great-grandmother", /\bgreat[- ]?(?:great[- ]?)*(?:grand(?:mother|mum|mom|ma)|granny|gran|nana?|nanna|nonna)s?\b/i],
    ["grandfather", /\b(?:grand(?:father|dad|ad|da|pa)|gramps|grampa|nonno|opa|djed|dida|abuelo|dziadek|zayde)s?\b/i], ["grandmother", /\b(?:grand(?:mother|mum|mom|ma)|granny|gran|nan|nana|nanna|nonna|oma|baka|abuela|babcia|bubbe)s?\b/i],
    ["father", /\b(?:father|dad|daddy|papa|tata|otac)s?\b/i], ["mother", /\b(?:mother|mum|mom|mummy|mama|mamma|majka|mati)s?\b/i],
    ["uncle", /\buncles?\b/i], ["aunt", /\b(?:aunt|aunty|auntie)s?\b/i], ["brother", /\bbrothers?\b/i], ["sister", /\bsisters?\b/i],
    ["husband", /\bhusbands?\b/i], ["wife", /\bwives\b|\bwife\b/i], ["son", /\bsons?\b/i], ["daughter", /\bdaughters?\b/i], ["cousin", /\bcousins?\b/i], ["child", /\b(?:children|kids?|child)\b/i]
  ];
  function kindsIn(s) {
    var out = [], str = String(s || "");
    KINDS.forEach(function (k) { var re = new RegExp(k[1].source, "gi"), m; while ((m = re.exec(str))) {
      var pre = str.slice(Math.max(0, m.index - 6), m.index);
      if ((k[0] === "grandfather" || k[0] === "grandmother" || k[0] === "father" || k[0] === "mother") && /great[- ]?$/i.test(pre)) continue;   /* belongs to the great-grand match */
      if (/^\s*['’]s\b/.test(str.slice(m.index + m[0].length, m.index + m[0].length + 4))) continue;   /* «my mother's father»: the mother only anchors the father */
      if (/^\p{Lu}/u.test(m[0]) && /^\s+\p{Lu}/u.test(str.slice(m.index + m[0].length, m.index + m[0].length + 3)) && !/\b(?:my|our|his|her|their|your)\s+$/i.test(str.slice(Math.max(0, m.index - 6), m.index))) continue;   /* «Father Josip», «Sister Anna»: a title */
      out.push({ kind: k[0], at: m.index, word: m[0] });
    } });
    return out;
  }
  /* a reading's own words for a relation: «great-grandfather», a role, a label */
  function kindOfLabel(s) {
    var str = String(s || "").replace(/-/g, " "), out = [];
    KINDS.forEach(function (k) { if (new RegExp(k[1].source, "i").test(str)) {
      if (/^(?:grandfather|grandmother|father|mother)$/.test(k[0]) && /great\s*$/i.test(str.slice(0, str.search(new RegExp(k[1].source, "i"))))) return;
      out.push(k[0]);
    } });
    return out;
  }

  /* ---- what the reading holds ---- */
  var TEXTKEYS = { name: 1, surname: 1, surnameTyped: 1, nameNote: 1, text: 1, word: 1, typed: 1, label: 1, kin: 1, poss: 1, maiden: 1, occupation: 1, n: 1, rel: 1, note: 1, said: 1, what: 1 };
  var SKIP = { pool: 1, info: 1, alts: 1, forms: 1, groups: 1, family: 1, by: 1, mort: 1, plan: 1, countries: 1, given: 1 };
  function harvest(o, bag, depth) {
    if (o == null || depth > 7) return;
    if (Array.isArray(o)) { for (var i = 0; i < o.length && i < 400; i++) harvest(o[i], bag, depth + 1); return; }
    if (typeof o !== "object") return;
    for (var k in o) {
      if (SKIP[k] && typeof o[k] === "object") continue;
      var v = o[k];
      if (typeof v === "string") { if (TEXTKEYS[k]) bag.strings.push(v); }
      else if (typeof v === "number") { if (/^(?:year|born|died|married|left|age|from|to|y)$/.test(k) && v >= 1000 && v <= 2100) bag.years.push(v); }
      else if (k === "row" && v && typeof v === "object") { if (v.n) bag.strings.push(v.n); }
      else if (v && typeof v === "object") harvest(v, bag, depth + 1);
    }
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function wordsOf(str, set) { String(str || "").replace(WORD, function (w) { set[fold(w)] = 1; return w; }); }

  var COUNTWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  function num(w) { w = String(w).toLowerCase(); return /^\d+$/.test(w) ? +w : COUNTWORD[w] || 0; }

  var NEARKIN = /\b(?:my|our|his|her|their|your|named|called|born|n[eé]e|wife|husband|married|mother|father|brother|sister|son|daughter|uncle|aunt|cousin|grandfather|grandmother|grandma|grandpa)\s+(?:(?:\p{Lu}\p{L}+|\p{L}+)\s+){0,2}$/iu;
  var PLAINCODE = {
    "unread-name": function (p) { return "I did not place " + q(p.words[0]) + " in the family"; },
    "unread-place": function (p) { return "I did not put " + q(p.words[0]) + " on the map"; },
    "unread-year": function (p) { return "the year " + p.words[0] + " is in your words but not on the page"; },
    "count-over": function (p) { return p.what; },
    "count-short": function (p) { return p.what; },
    "invented-person": function (p) { return "the page shows " + (p.words[0] ? q(p.words[0]) : "someone") + " and your words do not say who they are"; },
    "invented-name": function (p) { return "the page names " + q(p.words[0]) + " and your words do not"; },
    "invented-place": function (p) { return "the page has " + q(p.words[0]) + " on the map and your words do not"; },
    "invented-date": function (p) { return "the page has the year " + p.words[0] + " and your words do not"; },
    "relation-missing": function (p) { return "your " + p.words[0] + " is not on the tree"; },
    "teller-assigned": function () { return "facts about someone else were given to you"; },
    "role-unsupported": function (p) { return q(p.words[0]) + " is shown as a " + p.words[1] + " place and your words do not say that"; },
    "label-unsupported": function (p) { return "a box says " + q(p.words[1]) + " " + q(p.words[0]) + " and your words do not say that"; },
    "route-order": function (p) { return "the places are not in the order you told them"; },
    "subject-mismatch": function (p) { return "the story starts with " + p.words[0] + " and the page reads it as being about " + (p.words[1] || "someone else"); }
  };
  function q(s) { return "“" + s + "”"; }

  /* ---------------------------------------------------------------------------------------------------- */
  function check(text, p, opts) {
    opts = opts || {}; p = p || {};
    text = String(text == null ? "" : text).normalize("NFKC").replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "").replace(/[\u00a0\u2007\u202f]/g, " ");
    var typed = text; if (opts.read && opts.read !== text) typed = text + " \n " + String(opts.read);
    var problems = [], isPlace0 = opts.isPlace || function () { return false; }, isGiven = opts.isGiven || function () { return false; };
    /* «Bosnia», «Macedonia»: a word of a country's name is a place too, though the gazetteer holds the whole name */
    var CWORDS = {}, CSKIP = /^(?:north|south|east|west|northern|southern|republic|kingdom|united|states|islands?|saint|new|democratic|central|federated|the|and|of|herz|former|great)$/;
    Object.keys(opts.countries || {}).forEach(function (cc) { fold(opts.countries[cc]).split(/[^a-z]+/).forEach(function (w) { if (w.length >= 5 && !CSKIP.test(w)) CWORDS[w] = 1; }); });
    function isPlace(ph) { return !!isPlace0(ph) || (ph.indexOf(" ") < 0 && !!CWORDS[ph]); }
    var people = arr(opts.people || p.people).filter(function (x) { return x && typeof x === "object"; });
    var toks = tokens(text), ftext = fold(typed), flat = " " + ftext.replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
    function add(code, severity, words, span, what) {
      var pr = { code: code, severity: severity, words: words || [], span: span || null };
      pr.what = what || (PLAINCODE[code] ? PLAINCODE[code](pr) : code);
      problems.push(pr);
    }
    if (text.replace(/\s+/g, "").length < 8 || !toks.length) return { ok: true, confidence: "high", problems: [] };
    var sents = []; (function () { var re = /[^.!?\n]+[.!?]*/g, m; while ((m = re.exec(text))) sents.push({ s: m.index, e: m.index + m[0].length, t: m[0] }); })();
    function sentOf(pos) { for (var i = 0; i < sents.length; i++) if (pos >= sents[i].s && pos < sents[i].e) return sents[i]; return null; }
    function occ(word) {   /* where a (possibly several-word) folded word stands in the words, as token indexes */
      var ws = fold(word).split(/[^\p{L}\p{N}'\u2019\-]+/u).filter(Boolean), out = [];
      if (!ws.length) return out;
      for (var i = 0; i + ws.length <= toks.length; i++) { var ok = true; for (var j = 0; j < ws.length; j++) if (toks[i + j].f !== ws[j]) { ok = false; break; } if (ok) out.push(i); }
      return out;
    }
    function inText(phrase) { var f = fold(phrase).replace(/[^\p{L}\p{N}]+/gu, " ").trim(); return !!f && flat.indexOf(" " + f + " ") > -1; }

    /* what the reading holds, as words and as years */
    var bag = { strings: [], years: [] };
    harvest(people, bag, 0); harvest(p.kin, bag, 0); harvest(p.stops, bag, 0); harvest(p.route, bag, 0); harvest(p.others, bag, 0); harvest(p.suggest, bag, 0); harvest(p.siblings, bag, 0); harvest(p.life, bag, 0);
    [p.name, p.surname, p.from && p.from.word, p.to && p.to.word, p.from && p.from.row && p.from.row.n, p.to && p.to.row && p.to.row.n, p.born, p.left].forEach(function (x) { if (typeof x === "number") bag.years.push(x); else if (x) bag.strings.push(String(x)); });
    var read = {}, readPlaces = {}, readBlob = bag.strings.join(" \n ");
    bag.strings.forEach(function (s) { wordsOf(s, read); });
    function placeWords(st) { if (!st) return; if (st.word) wordsOf(st.word, readPlaces); if (st.row && st.row.n) wordsOf(st.row.n, readPlaces); (st.alts || []).forEach(function (a) { if (a && a.n) wordsOf(a.n, readPlaces); }); }
    arr(p.stops).concat(arr(p.route)).forEach(placeWords); placeWords(p.from); placeWords(p.to);
    arr(p.kin).forEach(function (k) { (k.stops || []).forEach(placeWords); });
    people.forEach(function (x) { placeWords(x.place); (x.events || []).forEach(function (e) { placeWords(e.place); }); });
    arr(p.others).forEach(function (o) { (o.stops || []).forEach(placeWords); placeWords(o.place); });
    Object.keys(readPlaces).forEach(function (w) { read[w] = 1; });
    var rYears = {}, rBlob = readBlob + " " + bag.years.join(" ");
    (rBlob.match(/\b(?:1[0-9]{3}|20[0-2][0-9])s?\b/g) || []).forEach(function (y) { rYears[y] = 1; });
    bag.years.forEach(function (y) { rYears[String(y)] = 1; });

    /* a place typed in another case or declined («Ljubljani» for Ljubljana) is the same place: five letters of stem are enough */
    var readKeys = Object.keys(read);
    function fuzzyRead(w) { if (w.length < 5) return false; var st = w.slice(0, 5); return readKeys.some(function (k) { return k.length >= 5 && k.slice(0, 5) === st; }); }
    var SHORT = { nyc: "new york" };
    var STREETW = /^\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|court|place|square|close|crescent|terrace)\b/i;
    function isAddress(t) { return STREETW.test(text.slice(t.e, t.e + 14)); }
    var TELLER = /\b(?:my name is|my name['\u2019]s|i am|i['\u2019]m|this is|it['\u2019]s|name:)\s+(?:\p{L}+\s+){0,1}$/iu;   /* the teller's own name: the tree says «the one telling the story» */

    /* ---------- A. NOTHING LOST ---------- */
    /* A1: every place the gazetteer knows, written with a capital, is somewhere in the reading */
    var said = {}, covered = new Array(toks.length);
    for (var i = 0; i < toks.length; i++) {
      for (var n = Math.min(3, toks.length - i); n >= 1; n--) {
        var seg = toks.slice(i, i + n); if (seg.some(function (t) { return !(t.cap || t.upper); })) continue;
        var ok3 = true; for (var j = 1; j < n; j++) if (/[^\s]/.test(text.slice(seg[j - 1].e, seg[j].s).replace(/^ +| +$/g, "")) || seg[j].s - seg[j - 1].e > 1) { ok3 = false; break; }
        if (!ok3) continue;
        var ph = seg.map(function (t) { return t.f; }).join(" ");
        if (n === 1 && (COMMON[ph] || DEMONYM.test(seg[0].w))) continue;
        if (!isPlace(ph)) continue;
        for (var c = i; c < i + n; c++) covered[c] = ph;
        i += n - 1; break;
      }
    }
    for (var a = 0; a < toks.length; a++) {
      if (!covered[a] || (a > 0 && covered[a - 1] === covered[a] && a - 1 >= 0 && toks[a].s - toks[a - 1].e === 1)) continue;
      var ph2 = covered[a], parts = ph2.split(" ");
      if (parts.every(function (w) { return read[w] || readPlaces[w]; }) || read[ph2.replace(/ /g, "")]) continue;
      var tk = toks[a], tkEnd = toks[a + parts.length - 1];
      if (tk.start && parts.length === 1 && isGiven(tk.f)) continue;
      /* «Paris, Texas», «Cork Ireland», «Lerwick in Scotland»: the second place says WHICH first place; the reader uses it to choose the row and keeps the first */
      var pj = a - 1; while (pj >= 0 && /^(?:in|of|near|at|and|from)$/.test(toks[pj].f) && !covered[pj]) pj--;
      var qualGap = pj >= 0 ? text.slice(toks[pj].e, tk.s) : "";
      if (pj >= 0 && /^(?:[\s,;:\/\-]*|[\s,;:\/\-]*\s(?:in|of|near|at)\s+)$/i.test(qualGap) && (covered[pj] || readPlaces[toks[pj].f] || fuzzyRead(toks[pj].f)) && (toks[pj].cap || toks[pj].upper)) {
        /* «Paris, Texas», «Cork Ireland», «Lerwick in Scotland»: the second place says WHICH first place; the reader uses it to choose the row and keeps the first */
        var pw = (covered[pj] || toks[pj].f).split(" "); if (pw.every(function (w) { return read[w] || readPlaces[w] || fuzzyRead(w); })) continue;
      }
      /* a place that is said not to have been gone to, or only planned: the reader leaves it out on purpose */
      if (/\b(?:never|not|no|n['\u2019]t|nor|planned|plan|planning|wanted|want|hoped|hope|meant|intended|dreamed|instead of|rather than|thought about|talked of|might have|would have|could have)\b[^.!?;]{0,45}$/i.test(text.slice(Math.max(0, tk.s - 60), tk.s))) continue;
      if (parts.every(function (w) { return fuzzyRead(w); })) continue;
      var shown = text.slice(tk.s, tkEnd.e);
      var ambiguous = parts.length === 1 && (isGiven(tk.f) || tk.start);
      if (said[ph2]) continue; said[ph2] = 1;
      if (TELLER.test(text.slice(Math.max(0, tk.s - 22), tk.s)) || isAddress(tkEnd)) continue;
      var LOCW = /^(?:in|at|to|from|near|of|via|outside|around|by|into|onto|towards|toward|back|called|village|town|city|born|there|then|between|across|through|over|beyond)$/;
      var introduced = [1, 2, 3].some(function (d) { return a - d >= 0 && LOCW.test(toks[a - d].f) && !/[.!?]/.test(text.slice(toks[a - d].e, tk.s)); });
      if (parts.length === 1 && !introduced && !said["n:" + tk.f]) {
        /* a lone capitalised word no place word leads in («Luisa, Paolo and my mother Anna») is a name that happens to be a village too */
        said["n:" + tk.f] = 1; var personLike0 = tk.upper || isGiven(tk.f) || NEARKIN.test(text.slice(Math.max(0, tk.s - 60), tk.s)) || /\b(?:van|von|der|den|de|la|le|di|da|del|della|dos|du|ten|ter|mac|mc|bin|ibn|al|el)\s+$/i.test(text.slice(Math.max(0, tk.s - 12), tk.s)) || /[,;]\s*(?:and\s+)?$/.test(text.slice(Math.max(0, tk.s - 6), tk.s))
          || (tk.start && !!toks[a + 1] && /^\s+$/.test(text.slice(tk.e, toks[a + 1].s)) && (toks[a + 1].cap || toks[a + 1].upper || /^(?:van|von|der|den|de|la|le|di|da|del|della|dos|du|ten|ter|mac|mc)$/.test(toks[a + 1].f)));
        add("unread-name", personLike0 ? "high" : "info", [shown], [tk.s, tkEnd.e]); continue;
      }
      add("unread-place", ambiguous ? "medium" : "high", [shown], [tk.s, tkEnd.e]);
    }
    /* A2: every proper name is accounted for by something in the reading (a person, a place, a note), or is plainly not a name */
    for (var b = 0; b < toks.length; b++) {
      var t = toks[b]; if (!(t.cap || t.upper)) continue;
      if (covered[b]) continue;
      if (COMMON[t.f] || DEMONYM.test(t.w)) continue;
      var nx = toks[b + 1], nameSeq = !!nx && /^[\s]+$/.test(text.slice(t.e, nx.s)) && (nx.cap || nx.upper || /^(?:van|von|der|den|de|la|le|di|da|del|della|dos|du|ten|ter|mac|mc)$/.test(nx.f));
      if (t.start && !t.upper && !isGiven(t.f) && !nameSeq) continue;
      if (read[t.f] || said["n:" + t.f]) continue;
      if (isAddress(t)) continue;
      if (TELLER.test(text.slice(Math.max(0, t.s - 22), t.s)) || (t.f === fold(text.slice(t.s, t.e)) && toks[b - 1] && TELLER.test(text.slice(Math.max(0, toks[b - 1].s - 22), toks[b - 1].s)) && /^\s+$/.test(text.slice(toks[b - 1].e, t.s)))) continue;
      if (t.w.length < 3 && !t.upper) continue;
      said["n:" + t.f] = 1;
      var pre = text.slice(Math.max(0, t.s - 60), t.s), personLike = t.upper || isGiven(t.f) || NEARKIN.test(pre) || /\b(?:van|von|der|den|de|la|le|di|da|del|della|dos|du|ten|ter|mac|mc|bin|ibn|al|el|y)\s+$/i.test(pre);
      var thing = /\b(?:ship|boat|vessel|steamer|steamship|liner|ferry|train|farm|house|inn|hotel|company|firm|factory|mine|church|school|regiment|battalion|band|club|shop|store|bakery|newspaper|paper)\s+(?:\w+\s+){0,2}$/i.test(pre);
      var nick = (/["'\u201c\u2018(\u00ab]\s*$/.test(text.slice(Math.max(0, t.s - 3), t.s)) && /^\s*["'\u201d\u2019)\u00bb]/.test(text.slice(t.e, t.e + 3))) || /\b(?:called|known as|aka|a\.k\.a\.?|nicknamed|goes by|went by|dubbed|nickname)\s+(?:the\s+)?$/i.test(text.slice(Math.max(0, t.s - 22), t.s));
      if (parts_isAbbrev(t)) continue;
      add("unread-name", nick || thing ? "info" : personLike ? "high" : "info", [t.w], [t.s, t.e], nick ? "A nickname, " + q(t.w) + ", is not kept on the tree" : thing ? q(t.w) + " is named in your words but is not kept" : null);
    }
    function parts_isAbbrev(t) { return !!SHORT[t.f]; }
    /* A3: every year or decade in the words is on the page somewhere */
    var yre = /(?:^|[^\d])((?:1[0-9]{3}|20[0-2][0-9])(?:s|'s)?)(?![\d])/g, ym;
    var seenY = {};
    while ((ym = yre.exec(text))) {
      var yy = ym[1], ystart = ym.index + ym[0].indexOf(yy), around = text.slice(Math.max(0, ystart - 10), ystart + yy.length + 10);
      if (/\b(?:aged?|age of)\s*$/i.test(text.slice(Math.max(0, ystart - 8), ystart)) || /^\s*(?:years?|yrs?)\b/i.test(text.slice(ystart + yy.length, ystart + yy.length + 8))) continue;
      if (/^\s+(?:\p{Lu}[\p{L}.]*\s+){0,2}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|court|place)\b/iu.test(text.slice(ystart + yy.length, ystart + yy.length + 40))) continue;
      var key = yy.replace(/'?s$/, ""), dec = /s$/.test(yy);
      if (seenY[yy]) continue; seenY[yy] = 1;
      var found = rYears[yy] || rYears[key] || rYears[key + "s"] || (dec && Object.keys(rYears).some(function (k2) { return /^\d{4}$/.test(k2) && +k2 >= +key && +k2 < +key + 10; })) || (!dec && Object.keys(rYears).some(function (k3) { return k3 === key + "s" || (/s$/.test(k3) && key.slice(0, 3) === k3.slice(0, 3)); }));
      if (!found) add("unread-year", "medium", [yy], [ystart, ystart + yy.length]);
    }
    /* A4: a count of children or brothers and sisters is reconciled with the ones the reading lists */
    var childRows = people.filter(function (x) { return x.role === "child" && !x.empty; }), sibRows = people.filter(function (x) { return x.role === "sibling" && !x.empty; });
    var cre = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(?:other|more|younger|older|little|grown|surviving)\s+)?(children|kids|sons|daughters|boys|girls|siblings|brothers|sisters)\b/gi, cm, claims = [];
    while ((cm = cre.exec(text))) {
      var N = num(cm[1]); if (!N) continue;
      var before = text.slice(Math.max(0, cm.index - 28), cm.index), after = text.slice(cm.index + cm[0].length, cm.index + cm[0].length + 24);
      var subset = /\b(?:the|these|those|of the|of their|only)\s*$/i.test(before) && /^\s*(?:\w+\s+){0,1}(?:stayed|remained|left|moved|died|went|came|survived|lived|are|were)\b/i.test(after) && !/\b(?:their|his|her)\s*$/i.test(before);
      var total = /\b(?:had|have|has|having|with|raised|there were|were)\s*(?:\w+\s+){0,1}$/i.test(before) || /\b(?:their|his|her)\s*$/i.test(before);
      claims.push({ n: N, word: cm[2].toLowerCase(), kind: /brother|sister|sibling/.test(cm[2]) ? "sib" : "child", subset: subset && !total, at: cm.index, end: cm.index + cm[0].length });
    }
    var totalChild = 0;
    claims.forEach(function (cl) { if (cl.kind === "child" && !cl.subset) totalChild = Math.max(totalChild, cl.n); });
    claims.forEach(function (cl) {
      /* «one of four children» counts that person among them: it is a claim about brothers and sisters, one fewer, kept where the reading keeps them */
      if (/\bone\s+of\s+(?:the\s+)?$/i.test(text.slice(Math.max(0, cl.at - 14), cl.at))) {
        var got = Math.max(arr(p.siblings).length, people.filter(function (x) { return x.role === "psib"; }).length, arr(p.others).filter(function (o) { return /brother|sister|sibling/.test(String(o.kin || "")); }).length);
        if (got > cl.n - 1) add("count-over", "high", [String(cl.n)], [cl.at, cl.end], "Your words say one of " + cl.n + " and the page lists " + got + " brothers and sisters");
        return;
      }
      var sx = /brother/.test(cl.word) ? /brother/ : /sister/.test(cl.word) ? /sister/ : null;   /* brothers are counted against brothers, sisters against sisters */
      /* the children under «also named», named or not, are listed too: sons against sons, daughters against daughters */
      var kk = /^(?:sons|boys)$/.test(cl.word) ? /^son$/ : /^(?:daughters|girls)$/.test(cl.word) ? /^daughter$/ : /^(?:child|son|daughter|twin)$/;
      /* «three boys and four girls»: only rows that say a boy or a girl are held to that; seven children with no sex said are the count, not too many boys */
      var csx = /^(?:sons|boys)$/.test(cl.word) ? "M" : /^(?:daughters|girls)$/.test(cl.word) ? "F" : "";
      if (cl.kind === "child" && csx && childRows.length && !childRows.some(function (x) { return x.sex === csx; })) return;
      var listed = cl.kind === "child" ? (csx ? childRows.filter(function (x) { return x.sex === csx; }) : childRows).length || arr(p.others).filter(function (o) { return kk.test(String(o.kin || "")); }).length : sibRows.length + arr(p.siblings).filter(function (x) { return !sx || !x.rel || sx.test(x.rel) || /sibling/.test(x.rel); }).length;
      /* «…Paolo and my mother Anna»: the teller's own parent is one of those counted, and stands in the parents' row instead */
      if (cl.kind === "child" && listed && listed < cl.n && /^[^.!?\n]*\bmy\s+(?:mother|mum|mom|father|dad)\b/i.test(text.slice(cl.end, cl.end + 160))) listed++;
      var said2 = new RegExp("\\b" + cl.n + "\\s+(?:of the\\s+)?(?:other\\s+)?" + cl.word.replace(/s$/, "") , "i").test(readBlob) || new RegExp("\\b" + cl.n + "\\s+(?:children|kids)", "i").test(readBlob);
      if (cl.subset) { if (totalChild && cl.n > totalChild) add("count-over", "high", [String(cl.n)], [cl.at, cl.end], "Your words say " + totalChild + " children and then " + cl.n + " of them; the numbers disagree"); return; }
      if (listed > cl.n) add("count-over", "high", [String(cl.n)], [cl.at, cl.end], "Your words say " + cl.n + " " + cl.word + " and the page lists " + listed);
      else if (listed && listed < cl.n && !said2) add("count-short", "medium", [String(cl.n)], [cl.at, cl.end], "Your words say " + cl.n + " " + cl.word + " and the page lists only " + listed);
      else if (!listed && !said2 && cl.kind === "child") add("count-short", "info", [String(cl.n)], [cl.at, cl.end], "Your words say " + cl.n + " " + cl.word + "; the page does not keep that");
    });

    /* ---------- B. NOTHING INVENTED ---------- */
    var NEED = {
      father: /\b(?:father|dad|daddy|papa|tata|otac|parents?|born to|son of|daughter of)\b/i, mother: /\b(?:mother|mum|mom|mummy|mama|mamma|majka|mati|parents?|born to|son of|daughter of)\b/i,
      spouse: /\b(?:wife|husband|spouse|married|marry|marri\w+|wed|wedding|partner|bride|groom|widow\w*|n[eé]e|born\s+\p{Lu}|they|together|couple|his wife|her husband)\b/iu,
      child: /\b(?:child|children|kids?|sons?|daughters?|boys?|girls?|baby|babies|born|had)\b/i, sibling: /\b(?:brothers?|sisters?|siblings?|twin|sibs?)\b/i
    };
    var kindsText = kindsIn(text), hasKind = {}; kindsText.forEach(function (k) { hasKind[k.kind] = 1; });
    people.forEach(function (x) {
      if (x.empty || x.me || x.sought) return;
      var nm = x.name ? String(x.name) : "", role = x.role || "";
      if (nm && !/^(?:you|the one)/i.test(nm)) {
        var allIn = fold(nm).split(/[^\p{L}\p{N}]+/u).filter(Boolean).every(function (w) { return flat.indexOf(" " + w + " ") > -1 || flat.indexOf(w) > -1; });
        if (!allIn) add("invented-name", "high", [nm], null);
      }
      var need = NEED[role];
      if (need) {
        var carries = nm || (x.events || []).length || x.place;
        if (!need.test(text) && carries && !nm) add("invented-person", "high", [role === "child" ? "a child" : "your " + role], null, "The page gives a " + role + " facts your words do not say");
        else if (!need.test(text) && nm && !inText(nm)) add("invented-person", "high", [nm], null);
      } else if (role === "line" || role === "self" || role === "grandmother" || role === "grandfather") {
        var kinds = kindOfLabel((x.label || "") + " " + (x.rel || "") + " " + (role === "self" ? "" : role));
        if (/\b(?:father|mother|dad|mum|mom|brother|sister|grandfather|grandmother|grandpa|grandma|uncle|aunt|parents?|husband|wife)['\u2019]s\b/i.test(text)) kinds = [];   /* «my grandfather's brother»: the relation is worked out from a chain */
        if (kinds.length && !kinds.some(function (k) { return hasKind[k] || (k === "great-grandfather" || k === "great-grandmother") && (hasKind["great-grandfather"] || hasKind["great-grandmother"]); }) && !(role === "self" && !x.rel)) add("invented-person", "high", [kinds[0]], null, "The page shows your " + kinds[0] + " and your words do not mention one");
      }
    });
    var stopsAll = [];
    arr(p.stops).forEach(function (s) { stopsAll.push(s); });
    arr(p.kin).forEach(function (k) { (k.stops || []).forEach(function (s) { stopsAll.push(s); }); });
    people.forEach(function (x) { if (x.place) stopsAll.push(x.place); });
    var seenPl = {};
    stopsAll.forEach(function (s) {
      if (!s || !s.row) return; var w = s.word || s.row.n; if (!w || seenPl[w]) return; seenPl[w] = 1;
      var alts = [w, s.row.n].concat((s.alts || []).map(function (x) { return x && x.n; })).filter(Boolean);
      if (SHORT.nyc === fold(w) && /\bNYC\b/.test(text)) return;
      if (!alts.some(inText) && !alts.some(function (x) { return fuzzyText(x); })) {
        var fw = fold(w).replace(/[^\p{L}\p{N}]+/gu, "");
        if (ftext.replace(/[^\p{L}\p{N}]+/gu, "").indexOf(fw) < 0) add("invented-place", "high", [s.row.n], null);
      }
    });
    function fuzzyText(x) { var f = fold(x).split(/[^\p{L}]+/u).filter(function (w) { return w.length >= 5; })[0]; return !!f && flat.indexOf(" " + f.slice(0, 5)) > -1; }
    var tYears = {}; (text.match(/\b(?:1[0-9]{3}|20[0-2][0-9])\b/g) || []).forEach(function (y) { tYears[y] = 1; });
    var hasAge = /\b(?:aged?|age of|years? old|\d+\s*(?:years|yrs)|in his|in her)\b/i.test(text) || /\b(?:b\.|born|c\.|circa|about|around)\s*\d{2}\b/i.test(text) || /'\d\d\b/.test(text);
    if (!hasAge) {
      var shownY = {}; bag.years.forEach(function (y) { shownY[String(y)] = 1; });
      var yearsInReading = Object.keys(shownY).filter(function (y) { return !tYears[y]; });
      yearsInReading.forEach(function (y) { if (!Object.keys(tYears).some(function (k) { return Math.abs(+k - +y) < 1; }) && !new RegExp("\\b" + y.slice(0, 3) + "0s\\b").test(text)) add("invented-date", "high", [y], null); });
    }

    /* ---------- C. CONSISTENT ---------- */
    /* C1: a relation said in the words is on the tree */
    var present = {};
    function mark(s) { kindOfLabel(s).forEach(function (k) { present[k] = 1; }); }
    mark(p.rel);
    var PARTNER = { father: "mother", mother: "father", grandfather: "grandmother", grandmother: "grandfather", "great-grandfather": "great-grandmother", "great-grandmother": "great-grandfather", uncle: "aunt", aunt: "uncle", husband: "wife", wife: "husband" };
    var subj = people.filter(function (x) { return x.role === "self"; })[0], subjKinds = kindOfLabel((p.rel || "") + " " + (subj && subj.rel || ""));
    if (people.some(function (x) { return x.role === "spouse"; })) subjKinds.forEach(function (k) { if (PARTNER[k]) present[PARTNER[k]] = 1; });
    /* «son of Patrick and his wife Bridget»: that wife is the mother on the tree */
    if (people.some(function (x) { return x.role === "mother"; }) && people.some(function (x) { return x.role === "father"; }) && /\b(?:son|daughter|child|born)\b[^.!?\n]{0,90}?\band\s+(?:his|her)\s+(?:wife|husband)\b/i.test(text)) present.wife = present.husband = 1;
    people.forEach(function (x) {
      mark(x.rel); mark(x.label); mark(x.role === "line" ? "" : x.role);
      if (x.role === "spouse") { present.wife = present.husband = present.spouse = 1; }
      if (x.role === "child") { present.child = 1; present.son = present.son || x.sex !== "F"; present.daughter = present.daughter || x.sex !== "M"; if (x.sex === "") { present.son = present.daughter = 1; } }
      if (x.role === "sibling" || x.role === "psib") { present.brother = present.sister = 1; }
    });
    arr(p.kin).forEach(function (k) { mark(k.label); });
    arr(p.others).forEach(function (o) { mark(o.kin); });
    arr(p.siblings).forEach(function (s) { mark(s.rel); mark(s.kin); present.brother = present.sister = present.child = present.child || 0; });
    harvest && (function () { var rb = readBlob; kindsIn(rb).forEach(function (k) { present[k.kind] = 1; }); })();
    var seenK = {};
    kindsText.forEach(function (k) {
      if (present[k.kind] || seenK[k.kind]) return;
      var pre2 = text.slice(Math.max(0, k.at - 14), k.at), pm = /\b(my|our|his|her|their|your|the)\s+(?:(?:great|step|late|eldest|oldest|youngest|older|younger|little|big|half|first|second)[- ]?)*$/i.exec(pre2);
      if (!pm) { pm = /\b(had|has|have)\s+(?:an?|one|two|three|four|five|six|\d+)\s+(?:(?:older|younger|little|elder|half|step)[- ]?)*$/i.exec(pre2) || /\b(and)\s+(?:two|three|four|five|six|\d+)\s+$/i.exec(pre2); if (!pm || !/^(?:brother|sister|son|daughter)$/.test(k.kind)) return; }
      /* «his grandfather», told after «my dad»: it is the dad's, so only the teller's own «my ...» is held to the tree */
      if (/^(?:his|her|their|the)$/i.test(pm[1]) && /\b(?:my|our)\s+(?:(?:great|step)[- ]?)*(?:grand(?:father|mother|parent|pa|ma|dad|ad)|father|mother|dad|mum|mom|uncle|aunt|brother|sister|husband|wife|nan|nana|gran|granny|nonno|nonna|opa|oma)\b/i.test(text)) return;
      if (/^the$/i.test(pm[1])) return;
      if ((k.kind === "child") && arr(p.siblings).length) return;
      if (k.kind === "son" || k.kind === "daughter") { if (present.child) return; }
      if (k.kind === "brother" || k.kind === "sister") { if (present.brother || present.sister) return; }
      if ((k.kind === "husband" || k.kind === "wife") && (present.husband || present.wife || present.spouse)) return;
      seenK[k.kind] = 1;
      var major = /^(?:great-grand|grand|father|mother|husband|wife|son|daughter|child)/.test(k.kind);
      var pw = /^(?:my|our|your)$/i.test(pm[1]) ? "your" : /^(?:had|has|have|and)$/i.test(pm[1]) ? "a" : pm[1].toLowerCase();
      add("relation-missing", major && !/^(?:husband|wife)$/.test(k.kind) && pw === "your" ? "high" : "medium", [k.kind, pw], [k.at, k.at + k.word.length], (pw === "a" ? "a " : pw + " ") + k.kind + " is in your words and not on the tree");
    });
    /* C2: the teller is not given somebody else's facts */
    var me = people.filter(function (x) { return x.role === "self" && x.me; })[0];
    if (me && (me.events || []).some(function (e) { return (e.type === "born" || e.type === "died") && (e.year || e.place); }) && !/\b(?:i was born|i am from|i['’]m from|i['’]m born|born in|my name is|i grew up|i was raised|i came|i moved|i live)\b/i.test(text)) add("teller-assigned", "high", [], null);
    /* C3: a birth is placed where the words say a birth */
    function near(ph, from) {
      var f = fold(String(ph).replace(/[^\p{L}\p{N}\s]/gu, "")), t0 = ftext.indexOf(f, from || 0);
      return t0 < 0 ? ftext.indexOf(f) : t0;
    }
    arr(p.stops).forEach(function (s) {
      if (!s || s.role !== "born" || !s.word) return;
      var oc = occ(s.word), at = oc.length ? toks[oc[0]].s : near(s.word); if (at < 0) return;
      var win = text.slice(Math.max(0, at - 110), at + 40);
      if (!/\b(?:born|birth|b\.|native|nee|née|baptis\w*|christened|from|grew up|raised|came from|comes from|originat\w+|hails?|come from)\b/i.test(win)) add("role-unsupported", "medium", [s.row.n, "birth"], [at, at + 1]);
    });
    /* C3a: EVERY «Born in», «From», «Lived in», «Died in» and «Married in» a box can show has its own word in a sentence that names the place. A birth also needs that
       word to be the one that governs the place: «born in 1920, later lived in X» does not make X the birthplace. */
    (function () {
      var SUP = { born: /^(?:born|b|birth|birthplace|nee)$/, from: /^(?:from|native|hails|hailed|originally|originated)$/, lived: /^(?:lived|lives|live|living|grew|raised|resided|settled|stayed|home|dwelt)$/,
        died: /^(?:died|d|dies|dying|death|buried|killed|murdered|executed|drowned|perished|passed)$/, married: /^(?:married|marry|wed|wedded|wedding)$/ }, OTHERV = /^(?:lived|lives|living|resided|settled|died|buried|moved|went|emigrated|migrated|came|sailed|worked|married)$/;
      var SAY = { born: "Born in", from: "From", lived: "Lived in", died: "Died in", married: "Married in" };
      var ss = text.replace(/\b(b|d|m|c|ca|st|mt|dr|fr|sr|jr|mr|mrs|ms)\./gi, "$1 ").split(/(?<=[.!?;])\s+|\n+/).map(function (x) { return fold(x).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" "); }), done = {};
      function tagOf(st) { if (st.said !== undefined) return st.said; var r = String(st.role || ""); return r === "born" ? "born" : r === "lived" ? "lived" : /origin|-from$/.test(r) ? "from" : ""; }
      function claim(tag, pl) {
        if (!SUP[tag] || !pl) return;
        var word = String(pl.word || (pl.row && pl.row.n) || (typeof pl === "string" ? pl : "")), ws = fold(word).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" "); if (!ws[0] || done[tag + "|" + word]) return;
        var seen = false, ok = ss.some(function (tk) {
          for (var i = 0; i + ws.length <= tk.length; i++) {
            if (!ws.every(function (w, j) { return tk[i + j] === w; })) continue;
            seen = true;
            var at = -1; tk.forEach(function (w, k) { if (SUP[tag].test(w) && (k < i || at < 0)) at = k; });
            if (at < 0) continue;
            if (tag === "born" && at < i && tk.slice(at + 1, i).some(function (w) { return OTHERV.test(w); }) && !/^(?:and )?(?:bred|raised|brought|grew|lived|died)\b/.test(tk.slice(at + 1, i).join(" "))) continue;
            return true;
          }
          return false;
        });
        if (seen && !ok) { done[tag + "|" + word] = 1; add("label-unsupported", tag === "from" || tag === "lived" ? "medium" : "high", [word, SAY[tag]], null); }
      }
      people.forEach(function (x) {
        if (x.place) claim(tagOf(x.place), x.place);
        (x.events || []).forEach(function (e) { if (e.type === "lived") claim(e.said === "lived" ? "lived" : e.said === undefined ? "lived" : "", e.place); else if (e.type !== "told") claim(e.type, e.place); });
      });
      arr(p.kin).forEach(function (k) { var st = (k.stops || [])[0]; if (st && k.label !== "also named in the story") claim(tagOf(st), st); });
      arr(p.stops).forEach(function (st) { if (st && (st.role === "born" || st.said === "born")) claim("born", st); });
    })();
    /* C4: the route runs in the order told (unless the reading says a place was before or is where another is) */
    var prevAt = -1;
    arr(p.stops).forEach(function (s) {
      if (!s || typeof s.at !== "number") return;
      if (s.at < prevAt && !s.before && !s.beforeMove && !s.adjPrev && s.role !== "born" && s.role !== "origin") add("route-order", "medium", [s.row && s.row.n], [s.at, s.at + 1]);
      prevAt = Math.max(prevAt, s.at);
    });
    /* C4a: a place that belongs to someone else's sentence, a place cut out of a surname, an aside read as a stop */
    var PART2 = { father: "mother", mother: "father", grandfather: "grandmother", grandmother: "grandfather", "great-grandfather": "great-grandmother", "great-grandmother": "great-grandfather", uncle: "aunt", aunt: "uncle", husband: "wife", wife: "husband" };
    var subjKindsAll = kindOfLabel((p.rel || "") + " " + (subj && subj.rel || "")); subjKindsAll = subjKindsAll.concat(subjKindsAll.map(function (k) { return PART2[k]; }).filter(Boolean));
    var subjFirst = fold(p.name || "").split(" ")[0];
    var ASIDE = /\b(?:when (?:it|this|that|they|there) (?:was|were)|which was|then called|then in|used to be|formerly|now in|today in|now called|back when it was|what is now|at the time)\s+$/i, seenA = {};
    arr(p.stops).forEach(function (st) {
      if (!st || !st.word || seenA[st.word]) return; seenA[st.word] = 1;
      var oc2 = occ(st.word);
      if (!oc2.length) {
        var fw2 = fold(st.word);
        var inside = toks.filter(function (t) { return t.f !== fw2 && t.f.indexOf(fw2) > -1 && (t.f.slice(-fw2.length - 1) === "'" + fw2 || t.f.slice(-fw2.length - 1) === "-" + fw2 || t.f.slice(0, fw2.length + 1) === fw2 + "'"); })[0];
        if (inside) add("place-inside-name", "high", [st.row.n, inside.w], [inside.s, inside.e], q(st.row.n) + " is on the map, and in your words it is part of the name " + q(inside.w));
        return;
      }
      var asides = oc2.filter(function (i) { return ASIDE.test(text.slice(Math.max(0, toks[i].s - 24), toks[i].s)); }).length, stopN = arr(p.stops).filter(function (x) { return x && x.word === st.word; }).length;
      if (asides && stopN > oc2.length - asides) add("aside-as-stop", "high", [st.row.n], [toks[oc2[0]].s, toks[oc2[0]].e], q(st.row.n) + " is named in an aside (\u201cwhen it was \u2026\u201d) and the page counts it as a place lived");
      var snt = sentOf(toks[oc2[0]].s);
      if (snt && subjKindsAll.length && !(/['\u2019]s\b/.test(snt.t))) {
        var ks = kindsIn(snt.t).map(function (k) { return k.kind; });
        if (ks.length && !ks.some(function (k) { return subjKindsAll.indexOf(k) > -1 || k === "husband" || k === "wife"; }) && (!subjFirst || fold(snt.t).indexOf(subjFirst) < 0)) add("fact-misattached", "high", [st.row.n, ks[0]], [snt.s, snt.e], q(st.row.n) + " is told about your " + ks[0] + " and the page puts it on " + (p.name || "the person the story is about"));
      }
    });
    people.forEach(function (x) {
      if (x.role !== "spouse" || !x.name || !subjKindsAll.length) return;
      var oc3 = occ(x.name.split(" ")[0]); if (!oc3.length) return;
      var snt2 = sentOf(toks[oc3[0]].s); if (!snt2 || /['\u2019]s\b/.test(snt2.t)) return;
      var ks2 = kindsIn(snt2.t).filter(function (k) { return /\b(?:my|our)\s+(?:(?:great|step|late|older|younger|eldest|youngest)[- ]?)*$/i.test(snt2.t.slice(Math.max(0, k.at - 22), k.at)); }).map(function (k) { return k.kind; }).filter(function (k) { return k !== "husband" && k !== "wife" && k !== "child" && k !== "son" && k !== "daughter"; });
      if (ks2.length && !ks2.some(function (k) { return subjKindsAll.indexOf(k) > -1; }) && (!subjFirst || fold(snt2.t).indexOf(subjFirst) < 0)) add("fact-misattached", "high", [x.name, ks2[0]], [snt2.s, snt2.e], q(x.name) + " is the spouse of your " + ks2[0] + " in your words, and the page makes them the spouse of " + (p.name || "someone else"));
    });
    /* C4b: a word that is also the name of a country is read as that country unless the words say otherwise («Macedonia» is North Macedonia, not a region of Greece) */
    var cnames = {}; Object.keys(opts.countries || {}).forEach(function (cc) { cnames[cc] = fold(opts.countries[cc]); });
    var cn = Object.keys(cnames), seenC = {};
    stopsAll.forEach(function (s) {
      if (!s || !s.row || !s.word) return; var w = fold(s.word), rn = fold(s.row.n);
      if (seenC[w] || cnames[s.row.cc] === rn || s.isCountry) return;
      var N = cn.filter(function (cc) { var nm2 = cnames[cc]; return nm2 !== w && nm2.length > w.length && (nm2.indexOf(w + " ") === 0 || nm2.slice(-w.length - 1) === " " + w); })[0];
      if (!N) return; if (cn.some(function (cc) { return cnames[cc] === w; })) return;
      seenC[w] = 1; add("country-name", "medium", [s.row.n, opts.countries[N]], null, q(s.word.replace(/^./, function (c) { return c.toUpperCase(); })) + " was read as " + q(s.row.n) + ", and it is also the name of a country (" + opts.countries[N] + ")");
    });
    /* C5: the story is about the person it starts with */
    var first = null, kre = /\bmy\s+((?:(?:great|step)[- ]?)*(?:grand(?:father|mother|parent|pa|ma|dad|ad|mum)|father|mother|dad|mum|mom|uncle|aunt|brother|sister|husband|wife|nonno|nonna|oma|opa|nan|nana|gran|granny))\s+(?:(?:is|was|named|called|name(?:'s| was| is)?)\s+)?(\S+)/gi, km;
    while ((km = kre.exec(text))) { var cand = km[2].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""); if (/^\p{Lu}/u.test(cand) && (!COMMON[fold(cand)] || isGiven(fold(cand)))) { first = { rel: km[1].toLowerCase().replace(/ /g, "-"), name: cand, at: km.index }; break; } }
    if (first && p.rel && !/^(?:self|)$/.test(p.rel)) {
      var norm = function (r) { return String(r).toLowerCase().replace(/^(?:step-)/, "").replace(/\b(?:dad|papa)\b/, "father").replace(/\b(?:mum|mom|mama)\b/, "mother").replace(/\b(?:granddad|grandad|grandpa|nonno|opa|gramps)\b/, "grandfather").replace(/\b(?:nan|nana|nanna|granny|gran|grandma|nonna|oma)\b/, "grandmother"); };
      var subjName = fold(p.name || "").split(" ")[0];
      if (norm(first.rel) !== norm(p.rel) && fold(first.name) !== subjName && !(p.name && inText(p.name) && fold(p.name).indexOf(fold(first.name)) > -1)) add("subject-mismatch", "medium", [first.rel + " " + first.name, p.rel + (p.name ? " " + p.name : "")], [first.at, first.at + 1]);
    }

    var chre = /\bmy\s+((?:[\p{L}]+['\u2019]s\s+)+)((?:step[- ]?)?(?:father|mother|dad|mum|mom|grandfather|grandmother|grandpa|grandma|grandad))\s+(?:(?:is|was|named|called)\s+)?(\S+)/giu, chm;
    var GEN = { father: 1, dad: 1, mother: 1, mum: 1, mom: 1, grandfather: 2, grandmother: 2, grandpa: 2, grandma: 2, grandad: 2 };
    while ((chm = chre.exec(text))) {
      var heads = chm[1].replace(/['\u2019]s\s+/g, " ").trim().split(/\s+/).map(function (h) { return fold(h); }), last = fold(chm[2]).replace(/^step-?/, "");
      var gens = heads.map(function (h) { return GEN[h] || 0; });
      if (gens.some(function (g) { return !g; }) || !GEN[last]) continue;
      var tot = gens.reduce(function (a, b) { return a + b; }, 0) + GEN[last], cand2 = chm[3].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      if (!/^\p{Lu}/u.test(cand2) || !subjFirst || fold(cand2) !== subjFirst || tot < 2 || tot > 3) continue;
      var got = String(p.rel || "").toLowerCase(), isM = /father|dad|pa$|ad$/.test(last);
      var okRel = tot === 2 ? /^(?:step-)?grand/.test(got) : /^(?:step-)?great/.test(got);
      if (!okRel) add("subject-mismatch", "high", [cand2, p.rel || ""], [chm.index, chm.index + 2], q(cand2) + " is " + chm[0].replace(/^my\s+/i, "your ").replace(/\s+\S+$/, "").replace(/\s+(?:is|was|named|called)$/, "") + ", a " + (tot === 2 ? "grandparent" : "great-grandparent") + " of yours; the page reads " + (isM ? "him" : "her") + " as your " + (p.rel || "relative"));
      break;
    }
    var rank = { high: 0, medium: 1, info: 2 };
    problems.sort(function (x, y) { return rank[x.severity] - rank[y.severity] || ((x.span && x.span[0]) || 0) - ((y.span && y.span[0]) || 0); });
    var hi = problems.filter(function (x) { return x.severity === "high"; }).length, me2 = problems.filter(function (x) { return x.severity === "medium"; }).length;
    return { ok: hi + me2 === 0, confidence: hi > 0 || me2 >= 2 ? "low" : "high", problems: problems };
  }

  var api = { check: check, fold: fold, tokens: tokens, kindsIn: kindsIn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryCheck = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
