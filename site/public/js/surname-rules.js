/* SURNAME ENDING RULES: the usual ways a South-Slavic surname is respelt when it crosses a border, worked out by rule and never stored.
   A clerk, a ship's purser or a census taker wrote the name as it sounded to them: Kauzlarić became Kauzlarich at Ellis Island, Kauzlaritsch in a
   German-language register, Kauzlarics in a Hungarian one. The Atlas catalogue keeps a spelling only with a record behind it; these are the
   mechanical ones, offered as «forms to try» and never as findings. The same algorithm is in scripts/surname_variants.py (`rule-forms`), and a test
   holds the two to the same answers.

   A classic script (evaluated by the tests as well as the page): window.raSurnameRules.forms("Kauzlarić"). */
(function (root) {
  "use strict";
  /* longest first, so «itch» is read before «ic» */
  var ENDS = ["itsch", "itch", "ich", "ics", "ish", "itz", "ić", "ič", "ik", "ic"];
  /* the endings tried, in the order a researcher would try them: the American and the plain forms first, the German and Hungarian last */
  var TRY = ["ich", "ic", "itch", "ić", "ič", "ish", "ik", "ics", "itsch", "itz"];
  var DIA = { "ć": ["c", "ch"], "č": ["c", "ch"], "š": ["s", "sh"], "ž": ["z", "zh"], "đ": ["d", "dj"] };
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function lower(s) { return String(s || "").toLowerCase(); }
  function forms(word) {
    var w = lower(String(word || "").normalize("NFC")).replace(/[^\p{L}]/gu, "");
    if (w.length < 5) return [];
    var stem = w, hasEnd = false, i, e;
    for (i = 0; i < ENDS.length; i++) { e = ENDS[i]; if (w.length - e.length >= 3 && w.slice(-e.length) === e) { stem = w.slice(0, -e.length); hasEnd = true; break; } }
    var hasDia = /[ćčšžđ]/.test(w);
    if (!hasEnd && !hasDia) return [];
    /* a stem can be plain (č written c), written out as a digraph (č written ch) or in its original letters (sh written š) */
    var plain = stem.replace(/[ćčšžđ]/g, function (c) { return DIA[c][0]; });
    var digraph = stem.replace(/[ćčšžđ]/g, function (c) { return DIA[c][1]; });
    var orig = stem.replace(/zh/g, "ž").replace(/sh/g, "š").replace(/dj/g, "đ");
    var stems = [], seen = {};
    [plain, digraph, orig, stem].forEach(function (s) { if (!seen[s]) { seen[s] = 1; stems.push(s); } });
    var out = [], got = {};
    got[w] = 1;
    stems.forEach(function (s) {
      TRY.forEach(function (t) {
        if (!hasEnd && t !== "ić" && t !== "ich" && t !== "ic") return;   /* a name with no ending of this kind gets only the letter changes */
        var f = s + t; if (got[f]) return; got[f] = 1; out.push(cap(f));
      });
    });
    if (!hasEnd) { var f2 = plain; if (!got[f2]) { got[f2] = 1; out.push(cap(f2)); } if (digraph !== plain && !got[digraph]) { got[digraph] = 1; out.push(cap(digraph)); } }
    return out.slice(0, 14);
  }
  var api = { forms: forms, ENDS: ENDS, TRY: TRY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raSurnameRules = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
