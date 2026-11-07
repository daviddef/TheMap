/* READING THE RECORD: the term finder and the date decoder behind /read/.

   Pure text and arithmetic. Nothing here fetches, stores or sends anything; the terms arrive on the page as data and the
   decoder works on what the reader types. A classic script, so it can be loaded with one <script> tag and also evaluated in
   the tests (module.exports).

   NORMALISING. Registers are not spelled the way a dictionary is: i and j, u and v, ae and e are interchangeable, accents
   and capitals mean nothing, and a priest may abbreviate. `norm` folds all of that, and both the typed text and the data go
   through it, so they meet in the middle. */
(function () {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/æ|ae/g, "e").replace(/œ|oe/g, "e")
      .replace(/j/g, "i").replace(/v/g, "u")
      .replace(/[.,;:()"'’]/g, "").replace(/\s+/g, " ").trim();
  }

  /* ---- the term finder -------------------------------------------------------------------------------------------- */

  /* Build once: every written form and abbreviation of every term, normalised, so a search is a lookup. */
  function index(terms) {
    return terms.map(function (t) {
      var forms = (t.forms || []).map(norm).filter(Boolean);
      var abbr = (t.abbr || []).map(norm).filter(Boolean);
      var words = norm(t.means).split(" ").filter(function (w) { return w.length > 2; });
      return { t: t, forms: forms, abbr: abbr, words: words };
    });
  }

  function common(a, b) { var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }

  /* One token against one term: 100 exact form, 90 exact abbreviation, 70 same word with another ending (long shared
     start), 50 starts with, 40 appears in the English. 0 means no match. */
  function scoreToken(tok, e) {
    if (e.forms.indexOf(tok) >= 0) return 100;
    if (e.abbr.indexOf(tok) >= 0) return 90;
    var best = 0;
    for (var i = 0; i < e.forms.length; i++) {
      var f = e.forms[i];
      if (tok.length >= 4 && f.length >= 4) {
        var c = common(tok, f), shorter = Math.min(tok.length, f.length);
        if (c >= 4 && c >= shorter - 3) best = Math.max(best, 70);   // joannem / joannes, filiabus / filia
      }
      if (tok.length >= 3 && f.indexOf(tok) === 0) best = Math.max(best, 50);
    }
    if (!best && tok.length >= 3 && e.words.indexOf(tok) >= 0) best = 40;
    return best;
  }

  /* find(idx, "Joannem filium", {events:["baptism"]}) -> [{term, score}], best first, ties broken by the term's own id so the
     order never shuffles. Every typed word must match something in the term for the term to appear. */
  function find(idx, query, opts) {
    var toks = norm(query).split(" ").filter(Boolean), want = opts && opts.events && opts.events.length ? opts.events : null;
    if (!toks.length) return [];
    var out = [];
    idx.forEach(function (e) {
      if (want && e.t.events !== "all" && want.indexOf(e.t.events) < 0) return;
      var total = 0;
      for (var i = 0; i < toks.length; i++) {
        var s = scoreToken(toks[i], e);
        if (!s) return;
        total += s;
      }
      out.push({ term: e.t, score: total / toks.length });
    });
    /* A phrase no single card holds ("nomina parentum": a heading made of two words) falls back to the cards for its words, each word
       on its own, best first; the array says so (`partial`) so the page can say "these match its words" and not pretend one card did. */
    if (!out.length && toks.length > 1) {
      var seen = {};
      toks.forEach(function (tok) {
        idx.forEach(function (e) {
          if (want && e.t.events !== "all" && want.indexOf(e.t.events) < 0) return;
          var s = scoreToken(tok, e);
          if (s >= 70 && (!seen[e.t.id] || seen[e.t.id].score < s)) { if (!seen[e.t.id]) out.push(seen[e.t.id] = { term: e.t, score: s, via: tok }); else { seen[e.t.id].score = s; seen[e.t.id].via = tok; } }
        });
      });
      if (out.length) out.partial = true;
    }
    out.sort(function (a, b) { return b.score - a.score || (a.term.id < b.term.id ? -1 : 1); });
    return out;
  }

  /* ---- the date decoder ------------------------------------------------------------------------------------------- */

  var MONTHS = [
    ["January", ["ianuarius", "ianuarii", "ianuario", "ianuar", "ian", "jan"]],
    ["February", ["februarius", "februarii", "februario", "februar", "febr", "feb"]],
    ["March", ["martius", "martii", "martio", "mart", "mar"]],
    ["April", ["aprilis", "aprili", "april", "apr"]],
    ["May", ["maius", "maii", "maio", "mai"]],
    ["June", ["iunius", "iunii", "iunio", "iun"]],
    ["July", ["iulius", "iulii", "iulio", "iul"]],
    ["August", ["augustus", "augusti", "augusto", "august", "aug"]],
    ["September", ["september", "septembris", "septembri", "septbr", "sept", "7ber", "7bris", "7br", "vii ber", "viiber", "viibris"]],
    ["October", ["october", "octobris", "octobri", "octbr", "oct", "8ber", "8bris", "8br", "viiiber", "viiibris"]],
    ["November", ["november", "novembris", "novembri", "novbr", "nov", "9ber", "9bris", "9br", "ixber", "ixbris"]],
    ["December", ["december", "decembris", "decembri", "decbr", "dec", "10ber", "10bris", "10br", "xber", "xbris"]]
  ];
  var MONTH_BY = {};
  MONTHS.forEach(function (m, i) { m[1].forEach(function (f) { MONTH_BY[norm(f)] = i; }); });
  var DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /* Latin number words, by stem, so primo/primus/prima, vicesimo/vigesimo, undecimo all read. Values add up:
     "vicesimo secundo" is 20 + 2. Ordinal and cardinal stems are in one table. */
  var NUM = {
    unus: 1, una: 1, unum: 1, uno: 1, prim: 1, duo: 2, duae: 2, duobus: 2, secund: 2, alter: 2, tres: 3, tria: 3, terti: 3, tribus: 3,
    quattuor: 4, quatuor: 4, quart: 4, quinque: 5, quint: 5, sex: 6, sext: 6, septem: 7, septim: 7, octo: 8, octav: 8, novem: 9, non: 9,
    decem: 10, decim: 10, undecim: 11, duodecim: 12, tredecim: 13, quattuordecim: 14, quindecim: 15, sedecim: 16,
    septemdecim: 17, decimoseptim: 17, duodeviginti: 18, duodevicesim: 18, duodevigesim: 18, undeviginti: 19, undevicesim: 19, undevigesim: 19,
    viginti: 20, vicesim: 20, vigesim: 20, triginta: 30, tricesim: 30, trigesim: 30, undetricesim: 29, undetrigesim: 29, duodetricesim: 28, duodetrigesim: 28,
    quadraginta: 40, quadragesim: 40, quinquaginta: 50, quinquagesim: 50, sexaginta: 60, sexagesim: 60,
    septuaginta: 70, septuagesim: 70, octoginta: 80, octogesim: 80, nonaginta: 90, nonagesim: 90,
    centum: 100, centesim: 100, ducenti: 200, ducentesim: 200, trecenti: 300, trecentesim: 300,
    quadringenti: 400, quadringentesim: 400, quingenti: 500, quingentesim: 500, sescenti: 600, sescentesim: 600, sexcentesim: 600,
    septingenti: 700, septingentesim: 700, octingenti: 800, octingentesim: 800, nongenti: 900, nongentesim: 900,
    mille: 1000, millesim: 1000
  };
  /* the same folding as the typed words (v is u, j is i), or "vigesimo" would never meet "uigesim" */
  Object.keys(NUM).forEach(function (k) { var n = norm(k); if (n !== k) { NUM[n] = NUM[k]; delete NUM[k]; } });
  var NUM_KEYS = Object.keys(NUM).sort(function (a, b) { return b.length - a.length; });
  var ENDINGS = ["us", "um", "a", "o", "i", "e", "ae", "is", "ibus", ""];

  function wordValue(w) {
    w = norm(w);
    if (Object.prototype.hasOwnProperty.call(NUM, w)) return NUM[w];
    for (var i = 0; i < NUM_KEYS.length; i++) {
      var k = NUM_KEYS[i];
      if (w.indexOf(k) === 0 && ENDINGS.indexOf(w.slice(k.length)) >= 0) return NUM[k];
    }
    return null;
  }

  function roman(s) {
    s = String(s).replace(/u/g, "v");                       // typed words are folded, so a Roman v arrives as u
    if (!/^[ivxlcdm]+$/i.test(s)) return null;
    var v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }, t = 0, p = 0;
    s = s.toLowerCase();
    for (var i = s.length - 1; i >= 0; i--) { var c = v[s[i]]; t += c < p ? -c : c; p = Math.max(p, c); }
    return t;
  }

  /* Latin number words after the first, summed. Returns {value, used} for the longest run of number words, or null. */
  function numberFrom(tokens, start) {
    var total = 0, n = 0;
    for (var i = start; i < tokens.length; i++) {
      var v = wordValue(tokens[i]);
      if (v == null) break;
      if (v === 1000 && total === 0) { total = 1000; n++; continue; }
      total += v; n++;
    }
    return n ? { value: total, used: n } : null;
  }

  /* decodeDate("die 30 7bris 1671") -> {ok, day, month, year, text, working[], warnings[]}. Never guesses: if a part is not read,
     it says which. A day that cannot exist in that month is a warning, not a silent fix, because it usually means a letter was
     misread (a 3 for an 8, an i for a 1). */
  function decodeDate(input) {
    var raw = String(input == null ? "" : input), working = [], warnings = [];
    var toks = norm(raw).split(" ").filter(function (t) { return t && !/^(die|dies|diei|mensis|mense|anno|domini|d|a)$/.test(t); });
    var day = null, month = null, year = null, i;

    for (i = 0; i < toks.length; i++) {
      var tk = toks[i].replace(/^(\d+)(st|nd|rd|th|a|o|e|ae)$/, "$1").replace(/^(\d+)(mo|to|vo)$/, "$1");
      if (month == null && Object.prototype.hasOwnProperty.call(MONTH_BY, tk)) { month = MONTH_BY[tk]; working.push(toks[i] + " is " + MONTHS[month][0]); continue; }
      if (/^\d{1,4}$/.test(tk)) {
        var n = parseInt(tk, 10);
        if (n >= 1 && n <= 31 && day == null && (tk.length <= 2)) { day = n; working.push(toks[i] + " is day " + n); continue; }
        if (n >= 1000 && year == null) { year = n; working.push(toks[i] + " is the year " + n); continue; }
      }
    }
    /* month words that the single-token pass missed because they contain a space ("vii ber") */
    if (month == null) {
      var joined = toks.join(" ");
      Object.keys(MONTH_BY).forEach(function (k) { if (month == null && k.indexOf(" ") > 0 && joined.indexOf(k) >= 0) { month = MONTH_BY[k]; working.push(k + " is " + MONTHS[month][0]); } });
    }
    /* Latin number words for the day and the year: words before the month are the day, words after are the year */
    if (month != null && (day == null || year == null)) {
      var mi = -1;
      for (i = 0; i < toks.length; i++) if (Object.prototype.hasOwnProperty.call(MONTH_BY, toks[i]) && MONTH_BY[toks[i]] === month) { mi = i; break; }
      if (mi > 0 && day == null) {
        var before = toks.slice(0, mi), s = 0, d = numberFrom(before, 0);
        if (d && d.value >= 1 && d.value <= 31) { day = d.value; working.push(before.slice(0, d.used).join(" ") + " is day " + day); }
        else {
          for (s = 0; s < before.length && day == null; s++) { var d2 = numberFrom(before, s); if (d2 && d2.value >= 1 && d2.value <= 31) { day = d2.value; working.push(before.slice(s, s + d2.used).join(" ") + " is day " + day); } }
        }
      }
      if (mi >= 0 && year == null) {
        var after = toks.slice(mi + 1);
        for (var s2 = 0; s2 < after.length && year == null; s2++) {
          var r = after[s2].match(/^(\d{4})$/);
          if (r) { year = parseInt(r[1], 10); working.push(r[1] + " is the year"); break; }
          var y = numberFrom(after, s2);
          if (y && y.value >= 1000) { year = y.value; working.push(after.slice(s2, s2 + y.used).join(" ") + " is the year " + year); }
        }
      }
    }
    /* Roman numerals as day, when nothing else gave one ("xxx septembris") */
    if (day == null && month != null) {
      for (i = 0; i < toks.length; i++) { var rv = roman(toks[i]); if (rv && rv >= 1 && rv <= 31 && !Object.prototype.hasOwnProperty.call(MONTH_BY, toks[i])) { day = rv; working.push(toks[i] + " is day " + rv + " (Roman numeral)"); break; } }
    }

    if (month == null) warnings.push("No month read. Months are written out, or as 7bris, 8bris, 9bris and 10bris (Xbris) for September to December.");
    if (day == null) warnings.push("No day read.");
    if (year == null) warnings.push("No year read. A register often gives the year only once, at the top of the page: look back up the page.");
    if (day != null && month != null && day > DAYS[month]) warnings.push("There is no " + day + " " + MONTHS[month][0] + ". A digit may be misread: check it against the image.");
    if (day != null && month === 1 && day === 29 && year != null && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) warnings.push("29 February " + year + " does not exist in the Gregorian calendar; in the Julian calendar every fourth year has one. Check the image.");
    var ok = day != null && month != null && year != null && !warnings.length;
    if (year != null && year <= 1582) warnings.push("Before October 1582 dates are in the Julian calendar. Many places changed later than 1582; check the place and the year before comparing with other sources.");
    var text = (day != null ? day + " " : "") + (month != null ? MONTHS[month][0] : "") + (year != null ? " " + year : "");
    return { ok: ok && !warnings.some(function (w) { return !/^Before October/.test(w); }), day: day, month: month == null ? null : month + 1, monthName: month == null ? null : MONTHS[month][0], year: year, text: text.trim(), working: working, warnings: warnings };
  }

  var api = { norm: norm, index: index, find: find, decodeDate: decodeDate, MONTHS: MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.raReadRecord = api;                     // a browser page (window) and the API Worker both read it from here
})();
