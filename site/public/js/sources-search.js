/* SEARCH THE SOURCES — one matcher for the header pop-up and for the /providers/ page.
 *
 * A source is found by what a person would type, not by the record's own spelling:
 *   - accents and punctuation do not matter ("Archivio di Stato" = "archivio di stato", "Süd" = "sud");
 *   - every word must match somewhere (AND), in the name, the other names it is filed under, the kind of
 *     source, the country (by name or by code), or the description; a name hit ranks above a description hit;
 *   - "usa", "uk", "holland", "england" mean the country the directory files them under;
 *   - when nothing matches, a word with one slipped letter still finds its source ("arhcive" -> "archive").
 *
 * Classic script with a module.exports fallback, so the page, the header and the tests share one file. Nothing is
 * fetched here: the caller hands in the providers. */
(function (root) {
  "use strict";

  var KINDS = {
    "aggregator": "aggregator many countries",
    "national-archive": "national archive state portal",
    "regional-archive": "regional archive state county",
    "diocesan": "church diocesan diocese parish",
    "volunteer": "volunteer transcription index",
    "library": "library newspapers full text",
    "national-library": "national library",
    "index": "name index",
    "catalogue": "catalogue",
    "statistics": "statistical office statistics census",
    "commercial": "commercial subscription paid"
  };
  /* Words people type for a place that the country list spells another way. */
  var SAYS = {
    usa: "US", america: "US", "united states": "US", states: "US",
    uk: "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "great britain": "GB", "united kingdom": "GB",
    "northern ireland": "GB", holland: "NL", "the netherlands": "NL", czechia: "CZ", "czech republic": "CZ",
    russia: "RU", "south korea": "KR", "ivory coast": "CI", burma: "MM", turkey: "TR", türkiye: "TR",
    worldwide: "*", global: "*", international: "*", everywhere: "*"
  };
  var NAMES = { "*": "Worldwide", "CN-TW": "Taiwan", XK: "Kosovo" };

  var dn = null;
  try { dn = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { dn = null; }
  var nameCache = {};
  function countryName(cc) {
    if (nameCache[cc] !== undefined) return nameCache[cc];
    var n = NAMES[cc];
    if (!n && dn) { try { n = dn.of(cc); } catch (e) { n = null; } }
    return (nameCache[cc] = n && n !== cc ? n : cc);
  }

  function norm(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9*]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* One edit (substitution, insertion, deletion or swap of two neighbours), enough for a slipped finger. */
  function near(a, b, max) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return false;
    if (max === 1) {
      var i = 0;
      while (i < la && i < lb && a[i] === b[i]) i++;
      if (la === lb) {
        if (a.slice(i + 1) === b.slice(i + 1)) return true;
        return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
      }
      return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
    }
    var prev = [], cur = [], j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i];
      for (j = 1; j <= lb; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[lb] <= max;
  }

  function build(providers) {
    var known = {};
    var ix = providers.map(function (p) {
      var cc = p.countries || [];
      var cn = cc.map(countryName).join(" ");
      return {
        p: p,
        name: norm(p.name),
        alias: norm((p.aliases || []).join(" ")),
        kind: norm((p.kind || "") + " " + (KINDS[p.kind] || "")),
        cty: norm(cn + " " + cc.join(" ")),
        codes: cc.map(function (c) { return c.toLowerCase(); }),
        what: norm(p.what)
      };
    });
    ix.forEach(function (e) { e.codes.forEach(function (c) { if (c.length === 2) known[c] = 1; }); });
    ix.known = known;
    /* a country's own name, as typed, names the country: "croatia church" is HR rows about churches */
    ix.names = {};
    Object.keys(known).forEach(function (c) { var nm = norm(countryName(c.toUpperCase())); if (nm && nm !== c) ix.names[nm] = c; });
    return ix;
  }

  /* What the query asks, split into the country it names (if it does) and the rest of the words. */
  function parse(q, ix) {
    var n = norm(q), codes = [], known = ix && ix.known, said = {};
    Object.keys(SAYS).forEach(function (k) { said[norm(k)] = SAYS[k].toLowerCase(); });
    if (ix && ix.names) Object.keys(ix.names).forEach(function (k) { if (!said[k]) said[k] = ix.names[k]; });
    Object.keys(said).sort(function (a, b) { return b.length - a.length; }).forEach(function (nk) {
      var re = new RegExp("(^| )" + nk.replace(/\*/g, "\\*") + "( |$)");
      if (re.test(n)) { codes.push(said[nk]); n = n.replace(re, " ").trim(); }
    });
    var words = [];
    (n ? n.split(" ") : []).forEach(function (w) {
      /* two letters that are a country code in this directory ("pl", "hr") name the country, not a word */
      if (w.length === 2 && known && known[w]) codes.push(w); else words.push(w);
    });
    return { words: words, codes: codes };
  }

  function wordHit(hay, w) {
    if (!hay) return 0;
    if (hay.indexOf(" " + w) >= 0 || hay.indexOf(w) === 0) return 2;   // begins a word
    return w.length > 2 && hay.indexOf(w) >= 0 ? 1 : 0;                 // inside one (never for one or two letters)
  }

  function scoreOne(e, parsed, fuzzy) {
    var s = 0, hay = " " + e.name, ahay = " " + e.alias;
    for (var i = 0; i < parsed.codes.length; i++) if (e.codes.indexOf(parsed.codes[i]) < 0) return -1; else s += 4;
    for (i = 0; i < parsed.words.length; i++) {
      var w = parsed.words[i], best = 0, h;
      if ((h = wordHit(hay, w))) best = h === 2 ? 10 : 6;
      else if (e.alias && (h = wordHit(ahay, w))) best = h === 2 ? 8 : 5;
      else if ((h = wordHit(" " + e.cty, w))) best = w.length === 2 && e.codes.indexOf(w) >= 0 ? 5 : (h === 2 ? 4 : 2);
      else if ((h = wordHit(" " + e.kind, w))) best = 3;
      else if ((h = wordHit(" " + e.what, w))) best = 1;
      else if (fuzzy && w.length >= 4) {
        var max = w.length >= 8 ? 2 : 1, hit = false;
        [e.name, e.alias, e.cty].forEach(function (f) {
          if (hit || !f) return;
          f.split(" ").forEach(function (t) { if (!hit && t.length >= 3 && near(w, t, max)) hit = true; });
        });
        if (hit) best = 2;
      }
      if (!best) return -1;
      s += best;
    }
    if (parsed.words.length && e.name.indexOf(parsed.words.join(" ")) >= 0) s += 8;  // the phrase as typed, in the name
    return s;
  }

  /* Ranked matches for a query. `filter` (optional) keeps only entries it accepts, so the page's country and
     access choices narrow the same search. An empty query returns everything the filter accepts, in name order. */
  function search(index, q, filter, limit) {
    var parsed = parse(q, index), out = [], fuzzy, pass;
    var keep = function (e) { return !filter || filter(e.p, e); };
    if (!parsed.words.length && !parsed.codes.length) {
      out = index.filter(keep).map(function (e) { return { e: e, s: 0 }; });
    } else {
      for (pass = 0; pass < 2 && !out.length; pass++) {
        fuzzy = pass === 1;
        for (var i = 0; i < index.length; i++) {
          if (!keep(index[i])) continue;
          var s = scoreOne(index[i], parsed, fuzzy);
          if (s >= 0) out.push({ e: index[i], s: s });
        }
      }
    }
    out.sort(function (a, b) { return b.s - a.s || a.e.p.name.localeCompare(b.e.p.name); });
    var res = out.map(function (x) { return x.e.p; });
    return limit ? res.slice(0, limit) : res;
  }

  var api = { norm: norm, near: near, build: build, search: search, parse: parse, countryName: countryName, KINDS: KINDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SourcesSearch = api;
})(typeof window !== "undefined" ? window : globalThis);
