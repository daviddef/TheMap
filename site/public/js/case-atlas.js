/* THE ATLAS PAGE FOR A CASE: what the Atlas holds on the places, people and dates in the documents read on /read/.

   Like the home page it has a grey Esri map, a journey list, "who held this ground" bars with their flags, the registers and sources
   that could hold the records, and the names with their variants. It is DRAWN FROM THE ATLAS'S OWN FILES (the place index, each place's file,
   regions.json, flag-map.json, providers.json, the given-name and surname catalogues), not written by a model, so it costs no tries.
   The model's part is only the input: the places, dates and names it read off the documents, which stay leads until a record is seen.

   The catalogues hold no person. A name here is looked up in them, never added to them, and a "variant" is shown with the status the
   catalogue gives it (same, attested, rule, lead). A guess at which word is the surname is a guess and is labelled as one.

   Pure helpers are made by factory(AS) with the helpers of atlas-summary.js, so the tests can pass them in; the page code is below the
   factory. Text goes in with textContent only: a place or name from a data file or a model is never parsed as markup. */
(function () {
  "use strict";

  function factory(AS) {
    var fold = AS.fold;

    var STOP = "port city town county state street road island islands village province district north south east west new old great little lake mount fort saint santa san ship from with born native citizen united states america royal kingdom republic empire".split(" ").reduce(function (o, w) { o[w] = 1; return o; }, Object.create(null));
    var ALIAS = { "usa": "US", "u s a": "US", "u s": "US", "united states": "US", "united states of america": "US", "america": "US", "england": "GB", "scotland": "GB", "wales": "GB",
      "great britain": "GB", "uk": "GB", "u k": "GB", "ireland": "IE", "deutschland": "DE", "italia": "IT", "croatia": "HR", "hrvatska": "HR", "slovenija": "SI" };

    function nums(s) { var o = [], re = /\d+/g, m; while ((m = re.exec(String(s || "")))) { var n = +m[0]; if (n >= 1 && n <= 9 && o.indexOf(n) < 0) o.push(n); } return o; }
    function clean(s) { return String(s == null ? "" : s).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim(); }
    function uniq(a) { var seen = Object.create(null); return a.filter(function (x) { var k = fold(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }

    /* ---- the input: places, dates and people as the documents give them ----------------------------------------------- */

    /* Every place the documents name, each with the year it goes with and where it came from. An event from the case file's timeline is the
       model's reading (documented or inferred, as it says); one from a document is that document's own field. */
    function events(docs, cf) {
      var out = [];
      function add(place, year, what, dn, who, from, status) {
        place = clean(place); if (!place || fold(place).length < 3) return;
        out.push({ place: place, year: year == null ? null : year, what: what || "", docs: dn || [], who: who || "", from: from, status: status || "" });
      }
      ((cf && cf.timeline) || []).forEach(function (t) { add(t.place, AS.yearIn(t.date), t.event, nums(t.source), t.who, "timeline", t.status); });
      (docs || []).forEach(function (x, i) {
        var d = x.doc || x, n = x.n || i + 1; if (!d || d.unparsed) return;
        var dy = AS.yearIn(d.date_on_document);
        (d.places_named || []).forEach(function (p) { add(p, dy, "written on document " + n, [n], "", "document", "documented"); });
        (d.persons || []).forEach(function (p) {
          var t = p.details || {}, who = p.name_as_written || "";
          if (t.birthplace) add(t.birthplace, AS.yearIn(t.born), "birthplace of " + who, [n], who, "document", "documented");
          if (t.residence) add(t.residence, dy, "residence of " + who, [n], who, "document", "documented");
        });
      });
      return out;
    }

    /* Events folded into stops, one per place text, in date order; an undated stop goes last, in the order it was met. */
    function stops(evs) {
      var by = Object.create(null), order = [];
      evs.forEach(function (e) {
        var k = fold(e.place.split(",")[0]) + "|" + fold(e.place.split(",").slice(1).join(" ")).slice(0, 12);
        var s = by[k] || (by[k] = { text: e.place, events: [], docs: [] }); if (!by[k].added) { order.push(s); by[k].added = 1; }
        s.events.push(e); e.docs.forEach(function (n) { if (s.docs.indexOf(n) < 0) s.docs.push(n); });
        if (e.place.length > s.text.length) s.text = e.place;
      });
      order.forEach(function (s, i) {
        var ys = s.events.map(function (e) { return e.year; }).filter(function (y) { return y != null; });
        s.years = ys.filter(function (y, j) { return ys.indexOf(y) === j; }).sort(function (a, b) { return a - b; });
        s.first = s.years.length ? s.years[0] : null; s.at = i; delete s.added;
      });
      order.sort(function (a, b) { return (a.first == null) - (b.first == null) || (a.first || 0) - (b.first || 0) || a.at - b.at; });
      order.forEach(function (s, i) { s.n = i + 1; });
      return order;
    }

    /* Lines to draw between stops: one per person or group when the timeline says who, else one line. Consecutive repeats are one stop. */
    function paths(stopList) {
      var groups = Object.create(null), order = [];
      stopList.forEach(function (s) {
        s.events.forEach(function (e) {
          if (e.from !== "timeline" || e.year == null) return;
          var k = e.who ? fold(e.who) : "";
          if (!groups[k]) { groups[k] = { who: e.who || "", pts: [] }; order.push(k); }
          groups[k].pts.push({ n: s.n, year: e.year });
        });
      });
      var res = order.map(function (k) {
        var g = groups[k], pts = g.pts.sort(function (a, b) { return a.year - b.year; }), seq = [];
        pts.forEach(function (p) { if (!seq.length || seq[seq.length - 1].n !== p.n) seq.push(p); });
        return { who: g.who, seq: seq };
      }).filter(function (g) { return g.seq.length > 1; });
      if (!res.length) {
        var dated = stopList.filter(function (s) { return s.first != null; });
        if (dated.length > 1) res.push({ who: "", seq: dated.map(function (s) { return { n: s.n, year: s.first }; }), fromDocuments: true });
      }
      return res;
    }

    /* ---- places: which one the Atlas means ---------------------------------------------------------------------------- */

    function countryHints(text, countries) {
      var f = fold(text), out = [], by = Object.create(null);
      Object.keys(countries || {}).forEach(function (cc) { by[fold(countries[cc])] = cc; });
      Object.keys(ALIAS).forEach(function (a) { by[a] = ALIAS[a]; });
      Object.keys(by).forEach(function (k) { if ((" " + f + " ").indexOf(" " + k + " ") > -1 && out.indexOf(by[k]) < 0) out.push(by[k]); });
      return out;
    }

    function weight(r) { return (r.v || 0) + 1000 * (r.c || 0); }

    /* The older names a row answers to, as single words, for the words the main map leaves out: a place with many names ("pola poula puola" for
       Pula) is matched there only on the whole list. A word that many places carry ("ohio", "states") says nothing, so only words that belong to
       a few rows are kept; this is what lets "Pola" find Pula, and "Fiume" find Rijeka. */
    function buildQMap(rows) {
      var count = Object.create(null), map = Object.create(null);
      rows.forEach(function (r) { if (r.q) fold(r.q).split(" ").forEach(function (w) { if (w.length >= 4) count[w] = (count[w] || 0) + 1; }); });
      rows.forEach(function (r) {
        if (!r.q || !(r.c > 0)) return;
        fold(r.q).split(" ").forEach(function (w) { if (w.length >= 4 && count[w] <= 6) { var a = map[w] || (map[w] = []); if (a.indexOf(r) < 0) a.push(r); } });
      });
      return map;
    }

    /* The place a text most likely means: the leftmost word the Atlas knows that is not a general word ("port", "county"). Among the places with
       that name: those whose own names and qualifiers hold the other words of the text ("Hamilton, Ohio"), those in a country the text names
       ("Senj, Croatia") or in the country of another place named beside it ("Pola, Istria"), else the one with the most volumes. The reader
       can pick another from `alts`, so a wrong guess costs a click, not a wrong card. */
    function resolve(text, map, skip, countries, qmap) {
      var cands = AS.candidates(text, map, skip).filter(function (g) { return !(g.word.indexOf(" ") < 0 && STOP[g.word]); });
      var hint = countryHints(text, countries), names = Object.keys(countries || {}).map(function (cc) { return fold(countries[cc]); });
      cands = cands.filter(function (g) { return names.indexOf(g.word) < 0 && !ALIAS[g.word]; });
      if (!cands.length) return { text: text, row: null, alts: [], hint: hint, country: names.indexOf(fold(clean(text))) > -1 || !!ALIAS[fold(clean(text))] };
      var g = cands[0], all = g.rows.slice();
      (qmap && qmap[g.word] || []).forEach(function (r) { if (all.indexOf(r) < 0) all.push(r); });
      var rows = all.filter(function (r) { return r.y != null && r.x != null; }).sort(function (a, b) { return weight(b) - weight(a); });
      var ctx = fold(text).split(" ").filter(function (w) { return w.length >= 3 && g.word.split(" ").indexOf(w) < 0; });
      function score(r) { var h = " " + fold((r.q || "") + " " + r.n) + " "; return ctx.filter(function (w) { return h.indexOf(" " + w + " ") > -1; }).length; }
      var best = rows.reduce(function (m, r) { return Math.max(m, score(r)); }, 0);
      var soft = cands.slice(1).map(function (x) { var r = x.rows.slice().sort(function (a, b) { return weight(b) - weight(a); })[0]; return r && String(r.cc || "").toUpperCase(); }).filter(Boolean);
      var inCtx = best > 0 && rows.length > 1 ? rows.filter(function (r) { return score(r) === best; }) : [];
      var inHint = hint.length ? rows.filter(function (r) { return hint.indexOf(String(r.cc || "").toUpperCase()) > -1; }) : [];
      var inSoft = soft.length ? rows.filter(function (r) { return soft.indexOf(String(r.cc || "").toUpperCase()) > -1; }) : [];
      var pool = inCtx.length ? inCtx : inHint.length ? inHint : inSoft.length ? inSoft : rows;
      var alts = pool.slice(1, 6).concat(rows.filter(function (r) { return pool.indexOf(r) < 0; }).slice(0, 3)).concat(cands.slice(1, 3).map(function (x) { return x.rows[0]; })).filter(Boolean)
        .filter(function (r, k, a) { return a.indexOf(r) === k; }).slice(0, 6);
      return { text: text, row: pool[0] || null, alts: alts, hint: hint, word: g.word, many: rows.length > 1 && pool === rows };
    }

    /* After each text has found its place, texts that found the same place are one stop ("Gračišće, Istria" and "Gračišće"; "Hamilton, Ohio"
       and "Hamilton, Butler County, Ohio"), in date order and numbered again. `raw` keeps the texts so a reader's pick is remembered for all. */
    function mergeStops(list) {
      var by = Object.create(null), out = [];
      list.forEach(function (s) {
        var k = s.row ? "r:" + s.row.i : "t:" + fold(s.text), m = by[k];
        if (!m) { m = by[k] = Object.assign({}, s, { events: s.events.slice(), docs: s.docs.slice(), raw: [s.text] }); out.push(m); return; }
        m.events = m.events.concat(s.events); s.docs.forEach(function (n) { if (m.docs.indexOf(n) < 0) m.docs.push(n); });
        m.raw.push(s.text); if (s.text.length > m.text.length) m.text = s.text;
      });
      out.forEach(function (s) {
        var ys = s.events.map(function (e) { return e.year; }).filter(function (y) { return y != null; });
        s.years = ys.filter(function (y, j) { return ys.indexOf(y) === j; }).sort(function (a, b) { return a - b; }); s.first = s.years.length ? s.years[0] : null; s.docs.sort(function (a, b) { return a - b; });
      });
      out.sort(function (a, b) { return (a.first == null) - (b.first == null) || (a.first || 0) - (b.first || 0) || a.at - b.at; });
      out.forEach(function (x, i) { x.n = i + 1; });
      return out;
    }

    /* ---- who held the ground, and the records ------------------------------------------------------------------------- */

    function groundAt(region, regimes, year, flagRows) {
      if (!region || year == null) return null;
      var eras = region.eras || [], i = AS.eraAt(eras, year); if (i < 0) return { year: year, none: true };
      var e = eras[i], rg = regimes && regimes[e.regime];
      return { year: year, polity: e.polity, from: e.from, to: e.to, note: e.note || "", regime: rg ? rg.label : "", filedUnder: e.filedUnder || [], flag: AS.flagAt(flagRows, year), index: i };
    }

    /* What the place was called in a year, from the dated names ({n, f from, t to}; an open end has no f or t). Fiume for Rijeka before 1945. */
    function namesAt(named, year) {
      if (year == null) return [];
      return (named || []).filter(function (x) { return (x.f == null || x.f <= year) && (x.t == null || year <= x.t); });
    }
    var KIND_RANK = { "national-archive": 0, "regional-archive": 1, diocesan: 2, index: 3, aggregator: 4, volunteer: 5, library: 6, "national-library": 6, catalogue: 7, commercial: 8 };
    var ACC_RANK = { free: 0, account: 1, index: 2, mixed: 3, catalogue: 4, paid: 5, onsite: 6, unsurveyed: 7 };
    function rankSources(list) {
      return list.slice().sort(function (a, b) {
        return (ACC_RANK[a.access] == null ? 9 : ACC_RANK[a.access]) - (ACC_RANK[b.access] == null ? 9 : ACC_RANK[b.access]) ||
          (KIND_RANK[a.kind] == null ? 9 : KIND_RANK[a.kind]) - (KIND_RANK[b.kind] == null ? 9 : KIND_RANK[b.kind]) || String(a.name).localeCompare(b.name);
      });
    }
    /* The sources of a country, those that name one of the places first ("Archivio di Stato di Trieste" for Trieste), then by access and kind.
       `terms` are the place names and their older names; a word of three letters or fewer is not matched, so "Pula" is, "Ohio" is, "Ur" is not. */
    function sourcesFor(providers, cc, ids, terms) {
      var want = Object.create(null); (ids || []).forEach(function (i) { want[i] = 1; });
      var ts = uniq((terms || []).map(String)).map(fold).filter(function (t) { return t.length >= 4; });
      var named = providers.filter(function (p) { return want[p.id]; });
      var land = providers.filter(function (p) { return !want[p.id] && (p.countries || []).indexOf(cc) > -1; });
      land.forEach(function (p) { var h = " " + fold(p.name + " " + (p.what || "")) + " "; p.__hit = ts.filter(function (t) { return h.indexOf(" " + t + " ") > -1; }); });
      var ranked = rankSources(land).sort(function (a, b) { return (b.__hit.length > 0) - (a.__hit.length > 0) || b.__hit.length - a.__hit.length; });
      var top = ranked.slice(0, 8).map(function (p) { var o = Object.assign({}, p, { mentions: p.__hit }); return o; });
      land.forEach(function (p) { delete p.__hit; });
      return { filed: named, country: top, total: land.length };
    }

    /* Volumes covering the year, else the nearest in time (so a stop with a date no register covers still says what is closest). */
    function volumesFor(cols, year) {
      cols = cols || []; if (year == null) return { cover: [], near: cols.slice(0, 3) };
      var cover = AS.volumesCovering(cols, year);
      if (cover.length) return { cover: cover, near: [] };
      var near = cols.slice().sort(function (a, b) { return gap(a, year) - gap(b, year); }).slice(0, 3);
      return { cover: [], near: near };
    }
    function gap(c, y) { return y < c.from ? c.from - y : y > c.to ? y - c.to : 0; }

    /* ---- the people: a small tree of leads --------------------------------------------------------------------------- */

    function splitName(full) {
      var s = clean(full).replace(/\b(mr|mrs|miss|ms|dr|rev|fr)\.?\s+/gi, "").trim(), given, sur;
      if (s.indexOf(",") > -1) { sur = s.split(",")[0].trim(); given = s.split(",").slice(1).join(" ").trim().split(/\s+/).filter(Boolean); }
      else { var t = s.split(/\s+/).filter(Boolean); sur = t.length > 1 ? t[t.length - 1] : ""; given = t.length > 1 ? t.slice(0, -1) : t; }
      return { given: given, surname: sur, guess: true };
    }
    var FOCUS = /\b(self|head|applicant|petitioner|declarant|holder|bearer|seaman|subject|registrant|principal|passenger|immigrant|alien)\b/i;
    function relOf(role) {
      var r = String(role || "").toLowerCase();
      if (/father|mother|parent|grand/.test(r)) return "parents";
      if (/wife|husband|spouse|bride|groom|consort/.test(r)) return "spouse";
      if (/\b(son|daughter|child|children|infant)\b/.test(r)) return "children";
      if (/witness|sponsor|informant|clerk|officer|official|notary|priest|consul|master|captain|attest|sign/.test(r)) return "others";
      if (FOCUS.test(r)) return "focus";
      return "other";
    }
    function people(docs) {
      var by = Object.create(null), order = [];
      (docs || []).forEach(function (x, i) {
        var d = x.doc || x, n = x.n || i + 1; if (!d || d.unparsed) return;
        (d.persons || []).forEach(function (p) {
          var nm = clean(p.name_as_written); if (!nm) return;
          var k = fold(nm); if (!k) return;
          var q = by[k] || (by[k] = { name: nm, roles: [], docs: [], born: "", birthplace: "", residence: "", occupation: "" });
          if (order.indexOf(k) < 0) order.push(k);
          if (q.docs.indexOf(n) < 0) q.docs.push(n);
          if (p.role && q.roles.indexOf(p.role) < 0) q.roles.push(p.role);
          var t = p.details || {}; q.born = q.born || t.born || ""; q.birthplace = q.birthplace || t.birthplace || ""; q.residence = q.residence || t.residence || ""; q.occupation = q.occupation || t.occupation || "";
        });
      });
      return order.map(function (k) { return by[k]; });
    }
    /* Who the documents are about: everyone whose role on a document is its subject (the head, the declarant, the petitioner). Two documents
       about the same man may spell him two ways, so there can be more than one; the case file's groups say which may be one person. With no
       subject named, the one in most documents. Spouse, parents, children and the rest are placed by the role the document gives them. */
    function tree(list) {
      var rows = { parents: [], focus: [], spouse: [], children: [], others: [] };
      list.forEach(function (p) { p.rel = p.roles.map(relOf); });
      var subj = list.filter(function (p) { return p.rel.indexOf("focus") > -1; });
      if (!subj.length && list.length) subj = [list.slice().sort(function (a, b) { return b.docs.length - a.docs.length; })[0]];
      list.forEach(function (p) {
        var k = subj.indexOf(p) > -1 ? "focus" : p.rel.indexOf("spouse") > -1 ? "spouse" : p.rel.indexOf("parents") > -1 ? "parents" : p.rel.indexOf("children") > -1 ? "children" : "others";
        rows[k].push(p);
      });
      return rows;
    }

    /* ---- name variants, from the catalogues ---------------------------------------------------------------------------- */

    /* The surname catalogue: [{id, name, m: [[form, status]]}]. A form matches on the key an index uses (no case, accent, space, hyphen). */
    function key(s) { return fold(s).replace(/ /g, ""); }
    /* The catalogue's own two keys: a form is the same form as another if only case, spaces, hyphens and apostrophes differ (an accent does
       not make it the same: Lereña is a priest's own spelling and Lerena is not); a search finds a family by the key an index uses (accents dropped). */
    function formKey(s) { return String(s || "").normalize("NFC").toLowerCase().replace(/[\s'’-]+/g, ""); }
    function surnameFamily(sur, cat) {
      var k = key(sur); if (!k) return null;
      for (var i = 0; i < (cat || []).length; i++) {
        var f = cat[i];
        if (f.m.some(function (m) { return key(m[0]) === k; }) || key(f.name) === k) {
          return { id: f.id, name: f.name, forms: f.m.filter(function (m) { return formKey(m[0]) !== formKey(sur); }).map(function (m) { return { form: m[0], status: m[1] }; }) };
        }
      }
      return null;
    }
    var GSTAT = { attested: 0, same: 1, rule: 2, lead: 3, "case-by-case": 4 };
    function givenForms(row) {
      var out = [];
      Object.keys(row.langs || {}).forEach(function (l) {
        (row.langs[l] || []).forEach(function (f) { out.push({ form: f.form, lang: l, status: f.status || "", declined: !!f.notNominative }); });
      });
      return out.sort(function (a, b) { return a.declined - b.declined || (GSTAT[a.status] == null ? 5 : GSTAT[a.status]) - (GSTAT[b.status] == null ? 5 : GSTAT[b.status]); });
    }
    function slugForSurname(x) { return String(x).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

    /* Names to highlight in the text and what to say when one is pressed. Longest first, so "Ivan Slavich" is one name, not two. */
    function highlightSpec(layer) {
      var items = [];
      function add(text, kind, ref) { text = clean(text); if (text.length >= 3) items.push({ text: text, f: fold(text), kind: kind, ref: ref }); }
      (layer.stops || []).forEach(function (s) {
        add(s.text, "place", s.n); add(s.text.split(",")[0], "place", s.n); if (s.place && s.place.name) add(s.place.name, "place", s.n);
      });
      (layer.people || []).forEach(function (p, i) {
        add(p.name, "person", i);
        var sn = splitName(p.name); if (sn.surname.length >= 4) add(sn.surname, "surname", i);
      });
      var seen = Object.create(null);
      return items.filter(function (x) { var k = x.kind + "|" + x.f; if (seen[k]) return false; seen[k] = 1; return true; })
        .sort(function (a, b) { return b.text.length - a.text.length; });
    }
    function isWordChar(c) { return !!c && /[\p{L}\p{N}]/u.test(c); }
    /* Find the items in a string: non-overlapping, longest first, whole words, case-insensitive. Returns [{start, end, item}]. */
    function findNames(str, spec) {
      var low = str.toLowerCase(), hits = [], taken = [];
      spec.forEach(function (it) {
        var needle = it.text.toLowerCase(), at = 0;
        while ((at = low.indexOf(needle, at)) > -1) {
          var end = at + needle.length;
          if (!isWordChar(str[at - 1]) && !isWordChar(str[end]) && !taken.some(function (t) { return at < t[1] && end > t[0]; })) { hits.push({ start: at, end: end, item: it }); taken.push([at, end]); }
          at = end;
        }
      });
      return hits.sort(function (a, b) { return a.start - b.start; });
    }

    /* ---- the steps: where to start, in order -------------------------------------------------------------------------- */
    function startList(layer, cf) {
      var out = [];
      ((cf && cf.next_steps) || []).slice(0, 4).forEach(function (x) {
        out.push({ from: "case file", title: x.look_for || "", how: [x.where && "Where: " + x.where, x.search_with && "Search with: " + x.search_with].filter(Boolean).join(". ") });
      });
      (layer.stops || []).forEach(function (s) {
        if (!s.place) return;
        var y = s.first, v = (s.volumes.cover || [])[0];
        if (v) out.push({ from: "Atlas", title: "Open " + v.title + (String(v.title).indexOf(String(v.from)) > -1 ? "" : " (" + v.from + "–" + v.to + ")") + " for " + s.place.name, how: "It covers " + y + (v.held ? "; held at " + v.held : "") + ".", url: v.url || "", place: s.place.id });
        else if (s.filed.length) out.push({ from: "Atlas", title: "Ask " + s.filed[0].name + " for " + (y != null ? y + " records of " : "records of ") + s.place.name, how: "The Atlas files " + (y != null ? y : "the period") + " records for this ground under it.", url: s.filed[0].url, place: s.place.id });
        else if (s.volumes.near.length) out.push({ from: "Atlas", title: "No register is catalogued for " + s.place.name + (y != null ? " in " + y : "") + ". Nearest: " + s.volumes.near[0].title, how: "Years " + s.volumes.near[0].from + "–" + s.volumes.near[0].to + ".", place: s.place.id });
      });
      return out.slice(0, 10);
    }

    /* A plain map of the stops, for the saved PDF (a live tile map cannot be saved): positions only, with the numbers and the lines. */
    function journeySvg(layer) {
      var pts = (layer.stops || []).filter(function (s) { return s.place && s.place.lat != null; });
      if (!pts.length) return "";
      var W = 640, H = 190, pad = 34, la = pts.map(function (s) { return s.place.lat; }), lo = pts.map(function (s) { return s.place.lon; });
      var a0 = Math.min.apply(null, la), a1 = Math.max.apply(null, la), o0 = Math.min.apply(null, lo), o1 = Math.max.apply(null, lo);
      var da = Math.max(a1 - a0, 0.5), dl = Math.max(o1 - o0, 0.5), k = Math.min((W - 2 * pad) / dl, (H - 2 * pad) / da);
      var ox = (W - dl * k) / 2, oy = (H - da * k) / 2;
      function xy(p) { return [ox + (p.lon - o0) * k, H - oy - (p.lat - a0) * k]; }
      var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };
      var s = ["<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + W + " " + H + "\" width=\"" + W + "\" height=\"" + H + "\" font-family=\"Helvetica,Arial,sans-serif\"><rect width=\"" + W + "\" height=\"" + H + "\" fill=\"#eceeed\"/>"];
      var byN = {}, pos = {}; pts.forEach(function (p) {
        var c = xy(p.place), tries = 0;
        while (tries++ < 12 && Object.keys(pos).some(function (q) { return Math.hypot(pos[q][0] - c[0], pos[q][1] - c[1]) < 22; })) c = [c[0] + 24, c[1] + (tries % 2 ? -6 : 6)];
        pos[p.n] = c; byN[p.n] = p;
      });
      (layer.paths || []).forEach(function (g) {
        var d = g.seq.filter(function (q) { return byN[q.n]; }).map(function (q, i) { var c = pos[q.n]; return (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1); }).join(" ");
        if (d.indexOf("L") > -1) s.push("<path d=\"" + d + "\" fill=\"none\" stroke=\"#8a6a3c\" stroke-width=\"2\" stroke-dasharray=\"6 4\"/>");
      });
      pts.forEach(function (p) {
        var c = pos[p.n];
        s.push("<circle cx=\"" + c[0].toFixed(1) + "\" cy=\"" + c[1].toFixed(1) + "\" r=\"11\" fill=\"#245565\"/><text x=\"" + c[0].toFixed(1) + "\" y=\"" + (c[1] + 4).toFixed(1) + "\" font-size=\"12\" fill=\"#fff\" text-anchor=\"middle\" font-weight=\"700\">" + p.n + "</text>");
      });
      s.push("</svg>");
      return s.join("");
    }

    /* Great-circle points between two [lat, lon], so a line across an ocean bends the way the route would, not the way Mercator draws a straight line. */
    function arc(a, b, n) {
      var r = Math.PI / 180, la1 = a[0] * r, lo1 = a[1] * r, la2 = b[0] * r, lo2 = b[1] * r;
      var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo2 - lo1) / 2), 2)));
      if (!d || d < 1e-6) return [a, b];
      var out = [];
      for (var i = 0; i <= n; i++) {
        var f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2), y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2), z = A * Math.sin(la1) + B * Math.sin(la2);
        out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / r, Math.atan2(y, x) / r]);
      }
      /* keep a line that crosses the date line in one piece */
      for (i = 1; i < out.length; i++) { while (out[i][1] - out[i - 1][1] > 180) out[i][1] -= 360; while (out[i][1] - out[i - 1][1] < -180) out[i][1] += 360; }
      return out;
    }

    return { events: events, stops: stops, mergeStops: mergeStops, paths: paths, resolve: resolve, buildQMap: buildQMap, countryHints: countryHints, groundAt: groundAt, namesAt: namesAt, rankSources: rankSources, sourcesFor: sourcesFor, volumesFor: volumesFor,
      people: people, tree: tree, relOf: relOf, splitName: splitName, surnameFamily: surnameFamily, givenForms: givenForms, slugForSurname: slugForSurname, highlightSpec: highlightSpec,
      findNames: findNames, startList: startList, journeySvg: journeySvg, arc: arc, uniq: uniq, nums: nums };
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = factory; return; }
  if (typeof window === "undefined" || !window.raAtlasSummary) return;
  var AS = window.raAtlasSummary, CA = factory(AS);
  window.raCaseAtlas = CA;

  /* ---- the page ---------------------------------------------------------------------------------------------------- */
  var fold = AS.fold;
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function link(text, href, cls) { var a = el("a", text, cls); a.href = href; a.rel = "noopener"; return a; }
  var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  function getJSON(path) { return fetch(BASE + path).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }
  var PALETTE = ["#245565", "#8a4a2e", "#4a6b2e", "#6b4a8a"];

  var shared = null;
  function loadShared() {
    if (shared) return shared;
    shared = Promise.all([AS.load(), getJSON("regions.json").catch(function () { return null; }), getJSON("flag-map.json").catch(function () { return null; }),
      getJSON("providers.json").catch(function () { return { providers: [] }; }), getJSON("roots/data/surname-catalogue.json").catch(function () { return []; }),
      getJSON("roots/data/pages.json").catch(function () { return { surnames: [] }; })]).then(function (r) {
      var sl = Object.create(null); ((r[5] && r[5].surnames) || []).forEach(function (s) { sl[s] = 1; });
      return { G: r[0], qmap: CA.buildQMap(r[0].rows || []), regions: r[1], fm: r[2], providers: (r[3] && r[3].providers) || [], cat: r[4] || [], slugs: sl };
    }, function (e) { shared = null; throw e; });
    return shared;
  }

  /* Everything the page shows, as plain data (also what the handover quotes). `picks` maps a stop's text to the row the reader chose. */
  function assemble(docs, cf, S, picks) {
    var G = S.G, evs = CA.events(docs, cf), countries = G.countries || {};
    var raw = CA.stops(evs);
    raw.forEach(function (s) {
      var r = CA.resolve(s.text, G.map, G.skip, countries, S.qmap); s.row = picks[fold(s.text)] || r.row; s.alts = r.alts; s.many = r.many; s.hint = r.hint; s.isCountry = r.country;
    });
    var st = CA.mergeStops(raw.filter(function (s) { return !(s.isCountry && !s.row); }));
    var tasks = st.map(function (s) {
      var row = s.row;
      if (!row) return Promise.resolve(s);
      return AS.getJSON("p/" + encodeURIComponent(row.i) + ".json").then(function (p) {
        var cc = String(row.cc || p.country || "").toUpperCase(), region = S.regions && S.regions.regions ? S.regions.regions.filter(function (x) { return x.id === p.region; })[0] : null;
        s.place = { id: row.i, name: p.name, country: countries[cc] || p.country || cc, cc: cc, lat: p.lat, lon: p.lon, older: (p.names || []).filter(function (n) { return n.kind !== "alt"; }).map(function (n) { return n.n; }), named: p.named || [], region: region ? region.label : "", eras: region ? region.eras : [] };
        var flagRows = S.fm && S.fm.f ? S.fm.f[cc] : null, years = s.years.length ? s.years : [null];
        s.ground = years.slice(0, 4).map(function (y) { return CA.groundAt(region, S.regions && S.regions.regimes, y, flagRows); }).filter(Boolean);
        s.flagRows = flagRows; s.regimes = S.regions ? S.regions.regimes : {};
        s.volumes = CA.volumesFor(p.collections || [], s.first);
        s.fs = (p.fs || []).filter(function (f) { return s.first == null || (f.from <= s.first && s.first <= f.to); }).slice(0, 3);
        var ids = []; s.ground.forEach(function (g) { (g.filedUnder || []).forEach(function (i) { if (ids.indexOf(i) < 0) ids.push(i); }); });
        var so = CA.sourcesFor(S.providers, cc, ids, []); s.filed = so.filed; s.country = []; s.countryTotal = so.total;
        s.span = p.span || null;
        return s;
      }).catch(function () { s.place = null; return s; });
    });
    return Promise.all(tasks).then(function () {
      st.forEach(function (s) { s.volumes = s.volumes || { cover: [], near: [] }; s.filed = s.filed || []; s.country = s.country || []; s.ground = s.ground || []; });
      var layer = { stops: st, paths: CA.paths(st), people: CA.people(docs), access: G.access || {}, slugs: S.slugs, built: new Date().toISOString().slice(0, 10) };
      layer.tree = CA.tree(layer.people);
      layer.names = nameData(layer, S, G, cf);
      layer.start = CA.startList(layer, cf);
      layer.svg = CA.journeySvg(layer);
      var cs = {}, terms = {};
      st.forEach(function (s) {
        if (!s.place) return;
        cs[s.place.cc] = cs[s.place.cc] || { cc: s.place.cc, name: s.place.country, stops: [], sources: [], total: s.countryTotal };
        cs[s.place.cc].stops.push(s.n);
        (terms[s.place.cc] = terms[s.place.cc] || []).push(s.place.name, s.place.region || "", s.text.split(",")[0]); (s.place.older || []).slice(0, 4).forEach(function (o) { terms[s.place.cc].push(o.split(",")[0]); });
      });
      Object.keys(cs).forEach(function (cc) { cs[cc].sources = CA.sourcesFor(S.providers, cc, [], terms[cc]).country; });
      layer.countries = Object.keys(cs).sort().map(function (k) { return cs[k]; });
      return layer;
    });
  }

  function nameData(layer, S, G, cf) {
    var surnames = [], given = [], seenS = Object.create(null), seenG = Object.create(null);
    layer.people.forEach(function (p, i) {
      var sn = CA.splitName(p.name);
      if (sn.surname && !seenS[fold(sn.surname)]) {
        seenS[fold(sn.surname)] = 1;
        var fam = CA.surnameFamily(sn.surname, S.cat), slug = CA.slugForSurname(sn.surname);
        surnames.push({ written: sn.surname, person: i, family: fam, page: S.slugs[slug] ? "surname/" + slug + "/" : "", guess: true });
      }
      AS.givenIn(sn.given.join(" "), G.given, G.skip).forEach(function (g) {
        if (seenG[g.row.id]) return; seenG[g.row.id] = 1;
        given.push({ written: g.word, person: i, canon: g.row.canon, forms: CA.givenForms(g.row).slice(0, 14), total: g.row.forms || 0 });
      });
    });
    var places = layer.stops.map(function (s) {
      var th = []; if (s.place) s.years.forEach(function (y) { CA.namesAt(s.place.named, y).forEach(function (x) { th.push(x.n + " in " + y); }); });
      return { n: s.n, written: s.text, atlas: s.place ? s.place.name : "", country: s.place ? s.place.country : "", older: s.place ? s.place.older : [], then: th, id: s.place ? s.place.id : "" };
    });
    var reading = ((cf && cf.names_and_places) || []).map(function (n) { return { kind: n.kind || "", written: (n.as_written || []).join(" / "), reading: n.reading || "", why: n.why_it_varies || "" }; });
    return { surnames: surnames, given: given, places: places, reading: reading };
  }

  /* ---- drawing ---- */
  function flagImg(name, year, small) {
    var im = el("img", null, "cx-flag" + (small ? " is-small" : "")); im.src = BASE + "fl/" + name + ".svg"; im.alt = "Flag in use" + (year != null ? " in " + year : ""); im.loading = "lazy"; im.width = small ? 22 : 34; im.height = small ? 15 : 23; return im;
  }
  function pill(t, cls) { return el("span", t, "as-pill" + (cls ? " " + cls : "")); }
  function sec(title, tag) { var s = el("section", null, "as-sec cx-sec"), h = el("h4", title); if (tag) h.append(" ", el("span", tag, "as-tag")); s.append(h); return s; }

  function drawMap(div, layer, onMap) {
    var pts = layer.stops.filter(function (s) { return s.place && s.place.lat != null; });
    if (!pts.length) { div.replaceChildren(el("p", "No place in the documents was found in the Atlas, so there is nothing to put on a map yet.", "cap")); return; }
    AS.loadLeaflet().then(function (L) {
      var map = L.map(div, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 12, attribution: "Tiles © Esri" }).addTo(map);
      var byN = {}; pts.forEach(function (p) { byN[p.n] = p; });
      var bounds = [];
      layer.paths.forEach(function (g, gi) {
        var colour = PALETTE[gi % PALETTE.length];
        for (var i = 1; i < g.seq.length; i++) {
          var a = byN[g.seq[i - 1].n], b = byN[g.seq[i].n]; if (!a || !b) continue;
          var line = CA.arc([a.place.lat, a.place.lon], [b.place.lat, b.place.lon], 24);
          L.polyline(line, { color: colour, weight: 2.5, opacity: .85, dashArray: "7 6" }).bindTooltip((g.who ? g.who + ": " : "") + g.seq[i - 1].year + " " + a.place.name + " → " + g.seq[i].year + " " + b.place.name).addTo(map);
          var m = line[Math.floor(line.length / 2)], q = line[Math.floor(line.length / 2) + 1] || m, ang = Math.atan2(q[1] - m[1], q[0] - m[0]) * 180 / Math.PI;
          L.marker(m, { interactive: false, icon: L.divIcon({ className: "cx-arrow", html: "<span style=\"transform:rotate(" + (90 - ang).toFixed(0) + "deg);color:" + colour + "\">▲</span>", iconSize: [14, 14] }) }).addTo(map);
        }
      });
      pts.forEach(function (p) {
        var ic = L.divIcon({ className: "cx-pin-wrap", html: "<span class=\"cx-pin\">" + p.n + "</span>", iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker([p.place.lat, p.place.lon], { icon: ic, title: p.place.name }).bindTooltip(p.place.name + (p.first != null ? " · " + p.first : "") + " · " + p.place.country).addTo(map);
        bounds.push([p.place.lat, p.place.lon]);
      });
      if (bounds.length === 1) map.setView(bounds[0], 9); else map.fitBounds(L.latLngBounds(bounds).pad(.3), { maxZoom: 10 });
      setTimeout(function () { map.invalidateSize(); }, 60);
      if (onMap) onMap(map);
    }).catch(function () { div.replaceChildren(el("p", "The map could not load (the tile service is on another site). The rest of the page is unaffected.", "cap")); });
  }

  function eraBar(s) {
    var eras = (s.place && s.place.eras) || [], wrap = el("div", null, "cx-eras");
    if (!eras.length) { wrap.append(el("p", "No record region covers this place yet, so there is no era table. That is a gap in the catalogue, not a finding.", "cap")); return wrap; }
    var lo = Math.max(eras[0].from, 1400), hi = 2026, bar = el("div", null, "cx-bar");
    eras.forEach(function (e, i) {
      var a = Math.max(e.from, lo), b = Math.min(e.to, hi); if (b <= a) return;
      var seg = el("div", null, "cx-era"); seg.style.flexGrow = String(Math.max(b - a, 30)); seg.style.flexBasis = "0";
      var rg = s.regimes && s.regimes[e.regime]; if (rg && rg.var) seg.style.borderTopColor = "var(" + rg.var + ", #888)";
      var hit = s.years.filter(function (y) { return y >= e.from && y < e.to; });
      if (hit.length) seg.classList.add("is-here");
      var fl = CA.groundAt({ eras: eras }, null, Math.floor((a + Math.min(b, 2025)) / 2), s.flagRows);
      seg.append(el("b", String(e.from)));
      if (fl && fl.flag) seg.append(flagImg(fl.flag, e.from, true));
      seg.append(el("span", e.polity, "cx-pol"));
      if (hit.length) seg.append(el("span", "◆ " + hit.join(", "), "cx-hit"));
      seg.title = e.from + "–" + e.to + " · " + e.polity + (e.note ? " · " + e.note : "");
      bar.append(seg);
    });
    wrap.append(bar, el("p", null, "cx-axis")); wrap.lastChild.append(el("span", String(lo)), el("span", "2026"));
    return wrap;
  }

  function stopPanel(s, layer, redraw) {
    var d = el("details", null, "cx-stop"); if (s.n === 1) d.open = true; d.id = "cx-stop-" + s.n;
    var sum = el("summary"), gTop = s.ground[0];
    sum.append(el("span", String(s.n), "cx-pin is-inline"), el("b", s.place ? s.place.name : s.text),
      el("span", (s.place ? s.place.country : "not in the Atlas") + (s.years.length ? " · " + s.years.join(", ") : ""), "cx-sum"));
    if (gTop && gTop.polity) sum.append(el("span", gTop.polity, "cx-polsum"));
    if (gTop && gTop.flag) sum.append(flagImg(gTop.flag, gTop.year, true));
    d.append(sum);
    var body = el("div", null, "cx-body");
    if (!s.place) {
      body.append(el("p", s.row ? "That place's file did not load." : "Not in the Atlas under \u201c" + s.text + "\u201d. Try an older or local spelling.", "cap"));
      d.append(body); return d;
    }
    var then = []; s.years.forEach(function (y) { CA.namesAt(s.place.named, y).forEach(function (x) { then.push({ y: y, n: x.n }); }); });
    if (then.length) body.append(el("p", "Called " + then.map(function (x) { return x.n + " in " + x.y; }).join(", ") + " then. Search under that name too.", "cx-then"));

    var cols = el("div", null, "cx-cols"), left = el("div"), right = el("div");
    left.append(el("p", "Who held this ground", "lab"), eraBar(s));
    var held = el("ul", null, "cx-held");
    s.ground.forEach(function (g) {
      var li = el("li");
      if (g.none) { li.append(el("b", g.year + " "), document.createTextNode("no era catalogued")); held.append(li); return; }
      if (g.flag) li.append(flagImg(g.flag, g.year, true));
      li.append(el("b", " " + g.year + " "), document.createTextNode(g.polity)); li.title = g.from + "\u2013" + g.to + (g.regime ? " \u00b7 " + g.regime : "") + (g.note ? " \u00b7 " + g.note : "");
      held.append(li);
    });
    if (s.ground.length) left.append(held);

    var vol = s.volumes;
    right.append(el("p", vol.cover.length ? "Registers covering " + s.first : vol.near.length ? "Nearest registers" : "Registers", "lab"));
    var ul = el("ul", null, "as-vols");
    (vol.cover.length ? vol.cover : vol.near).slice(0, 4).forEach(function (x) {
      var li = el("li"), tt = x.title + (String(x.title).indexOf(String(x.from)) > -1 ? "" : " (" + x.from + "\u2013" + x.to + ")");
      li.append(x.url ? link(tt, x.url, "as-vt") : link(tt, BASE + "place/" + encodeURIComponent(s.place.id) + "/", "as-vt"), el("span", x.held ? "held at " + x.held : "", "as-vm")); ul.append(li);
    });
    if (ul.children.length) right.append(ul); else right.append(el("p", "None catalogued yet.", "cap"));
    if (s.filed.length) {
      right.append(el("p", "Records filed under", "lab")); var fu = el("ul", null, "as-vols");
      s.filed.slice(0, 4).forEach(function (p) { var li = el("li"); li.append(link(p.name, p.url, "as-vt"), el("span", layer.access[p.access] || p.access || "", "as-vm")); fu.append(li); }); right.append(fu);
    }
    cols.append(left, right); body.append(cols);

    var foot = el("p", null, "cx-foot");
    foot.append(link("Place page", BASE + "place/" + encodeURIComponent(s.place.id) + "/"), link("On the map", BASE + "?q=" + encodeURIComponent(s.place.name)));
    if (s.alts.length || s.many) {
      var w = el("details", null, "cx-wrong"); w.append(el("summary", "Wrong place?"));
      var alt = el("p", null, "cx-alts"); alt.append(document.createTextNode("Matched " + s.place.name + ", " + s.place.country + (s.place.region ? " (" + s.place.region + ")" : "") + ". Others with that name: "));
      s.alts.forEach(function (r) { var b = el("button", r.n + " \u00b7 " + (r.cc || ""), "chip cx-alt"); b.type = "button"; b.addEventListener("click", function () { redraw(s, r); }); alt.append(b); });
      w.append(alt); foot.append(w);
    }
    body.append(foot);
    d.append(body); return d;
  }

  function treeBlock(layer) {
    var T = layer.tree, wrap = el("div", null, "cx-tree");
    if (!layer.people.length) { wrap.append(el("p", "No person was read from the documents.", "cap")); return wrap; }
    function block(p, kind) {
      var b = el("div", null, "mt-b mt-" + kind);
      b.append(el("span", (p.roles[0] || "named").toUpperCase(), "mt-lab"), el("b", p.name));
      var bits = [p.born && "b. " + p.born, p.birthplace, p.occupation].filter(Boolean); if (bits.length) b.append(el("span", bits.join(" · "), "mt-yr"));
      b.append(el("span", "document" + (p.docs.length > 1 ? "s " : " ") + p.docs.join(", "), "mt-yr")); return b;
    }
    function row(label, list, kind) {
      if (!list.length) return; var r = el("div", null, "cx-trow"); r.append(el("span", label, "as-lab"));
      var inner = el("div", null, "mt-row"); list.forEach(function (p, i) { if (i) inner.append(el("span", null, "mt-link")); inner.append(block(p, kind)); }); r.append(inner); wrap.append(r);
    }
    row("Parents named", T.parents, "parent");
    if (T.focus.length || T.spouse.length) {
      var r = el("div", null, "cx-trow"); r.append(el("span", "The person the documents are about, and spouse", "as-lab"));
      var inner = el("div", null, "mt-row"); T.focus.forEach(function (p) { inner.append(block(p, "focus")); });
      T.spouse.forEach(function (p) { inner.append(el("span", "⚭", "cx-wed")); inner.append(block(p, "other")); }); r.append(inner); wrap.append(r);
    }
    row("Children named", T.children, "other"); row("Others named (witnesses, officials, relatives)", T.others, "god");
    wrap.append(el("p", "By role on each document. All leads: one name in two documents may be two people.", "cap"));
    return wrap;
  }

  function sourcesBlock(layer) {
    var s = sec("Sources by country"), any = false;
    layer.countries.forEach(function (c, ci) {
      if (!c.sources.length) return; any = true;
      var d = el("details", null, "cx-src"); if (ci === 0) d.open = true;
      d.append(el("summary", c.name + " · for places " + c.stops.join(", ") + " · " + c.total + " sources catalogued"));
      var ul = el("ul", null, "as-vols");
      c.sources.forEach(function (p) {
        var li = el("li"); li.append(link(p.name, p.deepLink || p.url, "as-vt"), el("span", [p.kind, layer.access[p.access] || p.access].filter(Boolean).join(" · ") + ((p.mentions || []).length ? " · names " + p.mentions.slice(0, 3).join(", ") : ""), "as-vm")); ul.append(li);
      });
      d.append(ul, link("All sources for " + c.name, BASE + "country/" + c.cc.toLowerCase() + "/")); s.append(d);
    });
    if (!any) s.append(el("p", "No source in the catalogue is listed for these countries yet.", "cap"));
    return s;
  }

  function namesBlock(layer, openName) {
    var s = sec("Other forms to search"), N = layer.names;
    if (N.places.length) {
      s.append(el("p", "Places", "lab")); var ul = el("ul", null, "as-list");
      N.places.forEach(function (p) {
        ul.append(el("li", p.written + (p.atlas ? " → the Atlas place " + p.atlas + (p.country ? ", " + p.country : "") : " → not found in the Atlas") + (p.then && p.then.length ? ". Called " + p.then.join("; ") + "" : "") + (p.older.length ? ". Other names for it: " + p.older.slice(0, 5).join("; ") + "." : p.atlas ? ". No other name is catalogued for it." : "")));
      });
      s.append(ul);
    }
    if (N.surnames.length) {
      s.append(el("p", "Surnames (last word taken as the surname)", "lab")); var us = el("ul", null, "as-list");
      N.surnames.forEach(function (x) { us.append(surnameLine(x, layer)); }); s.append(us);
    }
    if (N.given.length) {
      s.append(el("p", "Given names in the catalogue", "lab")); var ug = el("ul", null, "as-list");
      N.given.forEach(function (g) { ug.append(el("li", g.written + " is held as " + g.canon + ". Other forms: " + g.forms.map(function (f) { return f.form + (f.declined ? " (as a register declines it)" : ""); }).join(", ") + ".")); });
      s.append(ug);
    }
    if (N.reading.length) {
      s.append(el("p", "The reading's own notes (not from the catalogues)", "lab")); var ur = el("ul", null, "as-list");
      N.reading.forEach(function (r) { ur.append(el("li", r.written + (r.reading ? " = " + r.reading : "") + (r.why ? ". " + r.why : ""))); }); s.append(ur);
    }
    return s;
  }
  function surnameLine(x, layer) {
    var li = el("li");
    if (x.family) {
      li.append(el("b", x.written), document.createTextNode(" is in a catalogued family (" + x.family.name + ")" + (x.family.forms.length ? ". Other spellings: " + x.family.forms.map(function (f) { return f.form + " (" + f.status + ")"; }).join(", ") + "." : ". No other spelling is catalogued.")));
      li.append(document.createTextNode(" "), link("The families page", BASE + "surname-families/"));
    } else {
      li.append(el("b", x.written), document.createTextNode(" is not in a catalogued family yet, so no spelling is confirmed. "));
      if (x.page) li.append(link("Its surname page", BASE + x.page), document.createTextNode(" shows where it is found. ")); else li.append(link("Say your name", BASE + "your-name/?kind=surname"), document.createTextNode(" shows the sounds-alike. "));
      li.append(document.createTextNode("A spelling is added to the catalogue only with a record that shows it."));
    }
    return li;
  }

  function startBlock(layer) {
    var s = sec("Where to start"); if (!layer.start.length) { s.append(el("p", "Nothing to suggest from the Atlas for these documents.", "cap")); return s; }
    var ol = el("ol", null, "cx-start");
    layer.start.forEach(function (x) { var li = el("li"); li.append(x.url ? link(x.title, x.url, "as-vt") : el("b", x.title), el("span", " " + x.from, "ask-src " + (x.from === "Atlas" ? "is-card" : "is-model"))); if (x.how) li.append(el("span", x.how, "as-vm")); ol.append(li); });
    s.append(ol); return s;
  }

  /* Press a highlighted name: the card for that name, right under the line it is in. */
  function nameCard(item, layer) {
    var c = el("div", null, "nm-card"), N = layer.names;
    if (item.kind === "place") {
      var p = N.places.filter(function (x) { return x.n === item.ref; })[0];
      c.append(el("b", p && p.atlas ? p.atlas + (p.country ? ", " + p.country : "") : item.text));
      c.append(el("span", p ? (p.atlas ? ((p.then && p.then.length ? "Called " + p.then.join("; ") + ". " : "") + (p.older.length ? "Other names for it: " + p.older.slice(0, 6).join("; ") + "." : "No other name is catalogued for it.")) + " Written here as: " + p.written + "." : "Not found in the Atlas under this spelling. Try a local or older spelling.") : "", "cap"));
      if (p && p.id) c.append(link("Open the place page", BASE + "place/" + encodeURIComponent(p.id) + "/"), document.createTextNode(" "), link("Journey stop " + p.n, "#cx-stop-" + p.n));
    } else {
      var pe = layer.people[item.ref] || {}, sn = CA.splitName(item.kind === "surname" ? item.text : pe.name || item.text);
      c.append(el("b", item.text));
      var sx = N.surnames.filter(function (x) { return fold(x.written) === fold(sn.surname || item.text); })[0];
      if (sx) { var u = el("ul", null, "as-list"); u.append(surnameLine(sx, layer)); c.append(u); }
      N.given.filter(function (g) { return fold(item.text).split(" ").indexOf(g.written) > -1; }).forEach(function (g) { c.append(el("p", g.written + " is held as " + g.canon + ". Other forms: " + g.forms.map(function (f) { return f.form; }).join(", ") + ".", "cap")); });
      if (!sx && !N.given.length) c.append(el("span", "No catalogued variants found for this name.", "cap"));
    }
    c.append(el("span", "Catalogue entries only. A spelling not shown is not ruled out.", "cap"));
    return c;
  }

  /* Wrap the names found in text nodes under `root`. Never touches a link, button, input or an existing highlight. */
  function highlight(root, layer) {
    var spec = CA.highlightSpec(layer); if (!spec.length) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var p = n.parentNode; if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return p.closest && p.closest("a,button,input,textarea,select,.nm,.nm-card,summary,h3,h4,.as-lab,.lab,.cx-pin") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      var hits = CA.findNames(n.nodeValue, spec); if (!hits.length) return;
      var frag = document.createDocumentFragment(), at = 0;
      hits.forEach(function (h) {
        if (h.start > at) frag.append(n.nodeValue.slice(at, h.start));
        var b = el("button", n.nodeValue.slice(h.start, h.end), "nm nm-" + (h.item.kind === "place" ? "place" : "person")); b.type = "button"; b.setAttribute("aria-expanded", "false");
        b.title = h.item.kind === "place" ? "A place: press for its other names" : "A name: press for variants";
        b.addEventListener("click", function () {
          var host = b.closest("li,p,td,div") || b.parentNode, nxt = host.nextElementSibling, open = nxt && nxt.classList.contains("nm-card") && nxt.getAttribute("data-for") === h.item.kind + h.item.f;
          [].slice.call(document.querySelectorAll(".nm-card")).forEach(function (x) { x.remove(); }); [].slice.call(document.querySelectorAll(".nm[aria-expanded=true]")).forEach(function (x) { x.setAttribute("aria-expanded", "false"); });
          if (open) return;
          var card = nameCard(h.item, layer); card.setAttribute("data-for", h.item.kind + h.item.f); host.after(card); b.setAttribute("aria-expanded", "true");
        });
        frag.append(b); at = h.end;
      });
      if (at < n.nodeValue.length) frag.append(n.nodeValue.slice(at));
      n.parentNode.replaceChild(frag, n);
    });
  }

  var TABS = [["journey", "Journey"], ["story", "Story"], ["people", "People"], ["records", "Where to look"], ["names", "Names"], ["docs", "Documents"]];
  function headlineOf(docs, cf) {
    var h = cf && cf.headline && String(cf.headline).trim(); if (h && h.length >= 12) return h;
    var d = docs[0] && (docs[0].doc || docs[0]), w = d && (d.what_it_is || d.doc_type); return w ? String(w) : "The documents, read";
  }
  function tile(big, label, k, go, wide) {
    var b = el("button", null, "rs-tile" + (wide ? " is-wide" : "")); b.type = "button"; b.append(el("b", big), el("span", label)); b.addEventListener("click", function () { go(k); }); return b;
  }

  /* The whole page, into `mount`: a headline, four numbers, and tabs (Journey, Story, People, Where to look, Names, Documents). `opts` brings the
     parts the reading itself made: `story` (verdicts, timeline, conflicts), `people` (facts) and `docs` (each document, in full). Resolves with the
     data (the handover quotes it). If the Atlas files cannot load, the story and the documents still show. */
  function render(docs, cf, mount, opts) {
    opts = opts || {};
    var picks = Object.create(null), S = null, serial = 0, map = null, current = "journey";
    mount.textContent = ""; mount.hidden = false;
    var shell = el("section", null, "rs"), hero = el("header", null, "rs-hero");
    hero.append(el("p", (cf ? "CASE FILE" : "READING") + " \u00b7 " + docs.length + (docs.length === 1 ? " DOCUMENT" : " DOCUMENTS"), "rs-kicker"), el("h2", headlineOf(docs, cf), "rs-headline"));
    var tiles = el("div", null, "rs-tiles"); hero.append(tiles);
    var bar = el("div", null, "rs-tabs"), panels = {}, btns = {}; bar.setAttribute("role", "tablist");
    function show(k) {
      current = k;
      TABS.forEach(function (t) { var on = t[0] === k; btns[t[0]].setAttribute("aria-selected", String(on)); btns[t[0]].tabIndex = on ? 0 : -1; panels[t[0]].hidden = !on; });
      if (k === "journey" && map) setTimeout(function () { map.invalidateSize(); }, 30);
    }
    TABS.forEach(function (t, i) {
      var b = el("button", t[1], "rs-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.id = "rs-tab-" + t[0]; b.setAttribute("aria-controls", "rs-p-" + t[0]);
      var p = el("div", null, "rs-panel"); p.id = "rs-p-" + t[0]; p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", b.id);
      b.addEventListener("click", function () { show(t[0]); });
      b.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
        var n = TABS[(i + d + TABS.length) % TABS.length][0]; show(n); btns[n].focus(); e.preventDefault();
      });
      btns[t[0]] = b; panels[t[0]] = p; bar.append(b);
    });
    var foot = el("p", "From the Atlas\u2019s own catalogue, not written by Claude. Places, dates and names are read off your documents, so they are leads, not findings.", "rs-foot");
    shell.append(hero, bar); TABS.forEach(function (t) { shell.append(panels[t[0]]); }); shell.append(foot); mount.append(shell);
    panels.journey.append(el("p", "Looking up the places\u2026", "cap as-wait"));
    function story() {
      panels.story.textContent = ""; if (opts.story) panels.story.append(opts.story); else panels.story.append(el("p", "Add a second document to compare them in a case file.", "cap"));
    }
    story(); if (opts.docs) panels.docs.append(opts.docs); if (opts.people) panels.people.append(opts.people);
    function badge(k, n) { var old = btns[k].querySelector(".rs-n"); if (old) old.remove(); if (n) btns[k].append(el("span", String(n), "rs-n")); }
    badge("docs", docs.length); show(current);

    function draw() {
      var my = ++serial;
      return assemble(docs, cf, S, picks).then(function (layer) {
        if (my !== serial) return layer;
        var found = layer.stops.filter(function (s) { return s.place; }), ys = [], vols = 0;
        layer.stops.forEach(function (s) { ys = ys.concat(s.years); vols += s.volumes.cover.length; });
        tiles.textContent = "";
        tiles.append(tile(String(found.length), (found.length === 1 ? "place" : "places") + " in " + layer.countries.length + (layer.countries.length === 1 ? " country" : " countries"), "journey", show),
          tile(ys.length ? Math.min.apply(null, ys) + (Math.max.apply(null, ys) !== Math.min.apply(null, ys) ? "\u2013" + Math.max.apply(null, ys) : "") : "no dates", "years covered", "story", show, true),
          tile(String(layer.people.length), layer.people.length === 1 ? "person named" : "people named", "people", show),
          tile(String(vols), vols === 1 ? "register covers those years" : "registers cover those years", "records", show));
        badge("journey", found.length); badge("people", layer.people.length);

        var J = panels.journey; J.textContent = "";
        if (!layer.stops.length) J.append(el("p", "No place was read from these documents, so there is no map. Put the place in the place box above and press \u201cWhat the Atlas holds on this\u201d.", "cap"));
        else {
          var top = el("div", null, "cx-top"), mapDiv = el("div", null, "as-map cx-map"); mapDiv.setAttribute("role", "img"); mapDiv.setAttribute("aria-label", "Map of the places in the documents");
          var mw = el("div", null, "cx-mapwrap"); mw.append(mapDiv, el("p", "Dashed line: places in date order, not the route taken.", "cap")); top.append(mw);
          var side = el("ol", null, "cx-journey");
          layer.stops.forEach(function (s) {
            var li = el("li"); li.append(el("span", String(s.n), "cx-pin is-inline"));
            var a = el("a"); a.href = "#cx-stop-" + s.n; a.textContent = s.place ? s.place.name : s.text;
            a.addEventListener("click", function () { var d = document.getElementById("cx-stop-" + s.n); if (d) d.open = true; });
            var t = el("span", null, "cx-jt"); t.append(a); var g = s.ground[0];
            t.append(el("span", (s.years.length ? s.years.join(", ") + " \u00b7 " : "") + (g && g.polity ? g.polity : s.place ? "no era catalogued" : "not in the Atlas"), "cx-jm"));
            if (g && g.flag) li.append(flagImg(g.flag, g.year, true)); li.append(t); side.append(li);
          });
          top.append(side); J.append(top);
          var sp = el("div", null, "cx-places"); sp.append(el("h3", "Place by place", "rs-h"));
          layer.stops.forEach(function (s) { sp.append(stopPanel(s, layer, function (s2, row) { s2.raw.forEach(function (t) { picks[fold(t)] = row; }); draw(); })); });
          J.append(sp);
          drawMap(mapDiv, layer, function (m) { map = m; });
        }
        var P = panels.people; [].slice.call(P.querySelectorAll(".cx-tree")).forEach(function (x) { x.remove(); });
        P.prepend(treeBlock(layer));
        var R = panels.records; R.textContent = ""; R.append(startBlock(layer), sourcesBlock(layer));
        var N = panels.names; N.textContent = ""; N.append(namesBlock(layer));
        if (!opts.story) { var ev = []; layer.stops.forEach(function (s) { s.events.forEach(function (e) { ev.push({ y: e.year, t: (e.year != null ? e.year + " " : "") + (e.what || "named") + " (" + (s.place ? s.place.name : s.text) + ")" }); }); });
          ev.sort(function (a, b) { return (a.y == null) - (b.y == null) || (a.y || 0) - (b.y || 0); }); if (ev.length) { var ul = el("ol", null, "rs-time"); ev.forEach(function (x) { ul.append(el("li", x.t)); }); panels.story.textContent = ""; panels.story.append(ul); } }
        window.raCaseLayer = layer;
        document.dispatchEvent(new CustomEvent("ra-case-layer", { detail: layer }));
        return layer;
      });
    }
    return loadShared().then(function (sh) { S = sh; return draw(); }).catch(function () {
      panels.journey.textContent = ""; panels.journey.append(el("p", "The Atlas files did not load, so the map and records could not be drawn. The story and the documents are still here. Check your connection and read again.", "cap ask-bad")); return null;
    });
  }

  CA.render = render; CA.highlight = highlight; CA.assemble = assemble;
})();
