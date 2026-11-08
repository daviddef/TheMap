/* THE STORY ENGINE: what the Atlas can say about "my great-grandfather Ivan came from Gallignana to Hamilton around 1905".

   One engine, three front doors: the guided start in the home page's drawer (story-drawer.js), the guided Ask on /read/ (story-guide.js)
   and the plain sentence page (looking-for.js). It reads a story out of free text, finds the places and years in it, says who held the
   ground in each year, builds a short plan of the registers and sources to look at first, and can turn the plan into a research family.

   It is DRAWN FROM THE ATLAS'S OWN FILES, in the browser. There is no model, no account and nothing is sent or saved: the place index,
   the place's own file, the region's era table, the mortality events and the provider catalogue are fetched from this site and read
   here. So every line of the plan names a register the Atlas holds, a year the Atlas dates, or a source in its catalogue, and a gap
   says "the Atlas lists none", never "there is none".

   Classic script (no module) so the tests can evaluate it; the helpers are pure and exported through module.exports. They lean on
   atlas-summary.js (fold, eraAt, flagAt, volumesCovering, aroundYear, eventsAt, buildGiven, givenIn), which must load first. The DOM
   is built with textContent only: nothing typed here, and no text in a data file, is parsed as markup. */
(function () {
  "use strict";

  /* In the browser the helpers are on window; the tests hand them in as module.deps.summary. */
  var S = (typeof module !== "undefined" && module.exports) ? module.deps.summary : window.raAtlasSummary;

  /* ---- pure helpers ------------------------------------------------------------------------------------------------ */

  var YEAR_MIN = 1400, YEAR_MAX = 2026;

  /* A year typed in a box: a whole number in range, else null. */
  function toYear(v) {
    var m = /^\s*([0-9]{4})\s*$/.exec(String(v == null ? "" : v));
    if (!m) return null;
    var n = Number(m[1]);
    return n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
  }

  /* Places to offer for what has been typed so far. A row answers to its name and to its older names (`q`, folded, space-joined).
     Prefix first, then a word that starts the text; within each, the places the Atlas holds most for, then by name, so the order
     does not jump about as letters are added. At most `max`. */
  function suggest(rows, text, max) {
    var t = S.fold(text);
    if (t.length < 2) return [];
    var a = [], b = [];
    rows.forEach(function (r) {
      var n = S.fold(r.n), q = r.q ? S.fold(r.q) : "";
      if (n.indexOf(t) === 0) a.push({ r: r, via: null });
      else if (q && (q.indexOf(t) === 0 || (" " + q).indexOf(" " + t) > -1)) a.push({ r: r, via: q });
      else if ((" " + n).indexOf(" " + t) > -1) b.push({ r: r, via: null });
    });
    function rank(x, y) { return (y.r.c || 0) - (x.r.c || 0) || (y.r.v || 0) - (x.r.v || 0) || String(x.r.n).localeCompare(String(y.r.n)) || String(x.r.cc).localeCompare(String(y.r.cc)); }
    return a.sort(rank).concat(b.sort(rank)).slice(0, max || 8);
  }

  /* The years to look in, as {birth:[a,b], marriage:[a,b]|null, death:[a,b]|null, guessed:bool}, or null when nothing is known. With a
     birth year the window is that year give or take one. Without one, a person who left in `left` was most likely 15 to 45 years old
     (said so on the page, never presented as known). */
  function windows(left, born) {
    if (born != null) {
      return { guessed: false, birth: [born - 1, born + 1], marriage: [born + 16, Math.min(born + 50, YEAR_MAX)], death: [born, Math.min(born + 100, YEAR_MAX)] };
    }
    if (left != null) {
      return { guessed: true, birth: [left - 45, left - 15], marriage: [left - 35, Math.min(left + 5, YEAR_MAX)], death: [left - 45, Math.min(left + 60, YEAR_MAX)] };
    }
    return null;
  }

  function overlaps(c, w) { return c.from <= w[1] && c.to >= w[0]; }

  /* Volumes of a kind ("b" births and baptisms, "m" marriages, "d" burials and deaths) whose years overlap a window, in date order. */
  function volumesFor(cols, kind, w) {
    return (cols || []).filter(function (c) { return (c.kinds || []).indexOf(kind) > -1 && (!w || overlaps(c, w)); })
      .sort(function (x, y) { return x.from - y.from || x.to - y.to || String(x.title).localeCompare(String(y.title)); });
  }

  /* Who held a place in a year, from an info object {name, countryName, eras, regimes}: {polity, regime, filedUnder, note, tracked}.
     `tracked` is false when the Atlas has no era table for the area, so the line says the country as it is today and nothing more. */
  function captionAt(info, year) {
    var i = info && info.eras ? S.eraAt(info.eras, year) : -1;
    if (i < 0) {
      var before = info && info.eras && info.eras.length && year < info.eras[0].from;
      return { tracked: false, polity: info && info.countryName ? info.countryName : "", regime: "", filedUnder: [], note: before ? "Before the Atlas's table for this area begins." : "The Atlas has no era table for this area, so this is today's country, not necessarily the state of the year." };
    }
    var e = info.eras[i], rg = info.regimes && info.regimes[e.regime];
    return { tracked: true, polity: e.polity, regime: rg ? rg.label : "", filedUnder: (e.filedUnder || []).map(function (x) { return info.pname && info.pname[x] ? info.pname[x] : x; }), note: e.note || "", from: e.from, to: e.to };
  }

  /* How far along the line the traveller is in a year: still at the start until the year before `left`, arrived the year after.
     The date of leaving is always approximate, so the move is spread over those two years instead of jumping. */
  function progress(left, year) {
    if (left == null) return 0;
    var t = (year - (left - 1)) / 2;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  function between(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  /* Every spelling of the first given name in the text that the catalogue holds with positive evidence (same, attested, rule). */
  function givenForms(row) {
    var out = [], seen = Object.create(null);
    Object.keys(row.langs || {}).forEach(function (l) {
      (row.langs[l] || []).forEach(function (f) {
        if (["same", "attested", "rule"].indexOf(f.status) < 0 || seen[f.form]) return;
        seen[f.form] = 1; out.push(f.form);
      });
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  /* A volume's title with its years, unless the title already carries them ("Births 1841-1899" is not shown as "(1841–1899)" again). */
  function volLabel(c) { return c.title + (String(c.title).indexOf(String(c.from)) > -1 ? "" : " (" + c.from + "–" + c.to + ")"); }
  var HOLDS = {
    photo: { t: "a photograph", step: "Look at the whole photograph before anything else: the front, the back, the card's edge and any studio name or town printed on it. A studio's town and a date on the mount are leads about where and when it was taken, not about where they were from.", not: "A photograph shows a person on a day. Do not read a birthplace or a name off it." },
    document: { t: "a document", step: "Copy out everything on it exactly as written, with the spellings and the dates, before you interpret any of it. Names and places on an old document are spelt by the clerk, not by the family.", not: "A date on a document may be the date it was written, stamped or copied, not the date of the event." },
    letter: { t: "a letter", step: "Note the place and date it was written from, the names it uses for people and places, and who it was sent to. A letter's own name for a place is the best clue to the name in the registers.", not: "A letter says what its writer believed or chose to say; treat its dates and relationships as leads." },
    story: { t: "only the family story", step: "Write the story down exactly as you heard it, who told you and when, and underline the three things that are most specific: a place, a year and a name.", not: "A family story is a lead. Places are often the nearest big town, and years drift by a decade." }
  };

  /* The plan: an ordered list of steps from the facts the page has gathered. Each step is
     {id, title, why, items:[{text, href?}], ask, not}. `facts` is
       { rel, name, holds, left, born,
         from: {name, countryName, older[], cols[], href, eras, regimes, region} | null,
         to:   {name, countryName, href, eras, regimes} | null  (countryName only when the place did not resolve),
         providers: [{id, name, url, kind, access}], given: [row], base }
     Nothing here is invented: every item is a volume, a source or a page the data holds, and an empty list says so. */
  function buildPlan(f) {
    var base = f.base || "/", steps = [], w = windows(f.left, f.born);
    var kinds = (f.holdsAll && f.holdsAll.length ? f.holdsAll : [f.holds]).filter(function (k) { return HOLDS[k]; });
    if (!kinds.length) kinds = ["story"];
    var many = kinds.length > 1, names = kinds.map(function (k) { return k === "story" ? (many ? "the family story" : HOLDS.story.t) : HOLDS[k].t; });
    function joined(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
    steps.push({ id: "hold", title: many ? "Write down exactly what you hold, one thing at a time" : "Write down exactly what you hold",
      why: "You hold " + joined(names) + "." + (many ? " Each one tells you something the others do not, and where they disagree is itself a clue. " : " ") + "Everything else is searched from " + (many ? "these" : "this") + ", so it comes first.",
      items: kinds.map(function (k) { return { text: (many ? "On " + (k === "story" ? "the family story" : HOLDS[k].t) + ": " : "") + HOLDS[k].step }; }),
      ask: many ? "Which of these was made first, and where do two of them name a different place or year?" : "Who else in the family has the same thing, or a copy, or a different one?",
      not: kinds.map(function (k) { return HOLDS[k].not; }).join(" "),
      links: kinds.some(function (k) { return k !== "story"; }) ? [{ text: "Turn a line you can read on it into places and terms", href: base + "read/" }] : [] });

    var nameItems = [];
    if (f.given && f.given.length) {
      f.given.forEach(function (g) {
        var forms = givenForms(g.row);
        nameItems.push({ text: "The " + g.row.canon + " name family, which includes " + g.word.charAt(0).toUpperCase() + g.word.slice(1) + ", is also written: " + (forms.length ? forms.slice(0, 12).join(", ") : "no other forms with positive evidence in the catalogue") + (forms.length > 12 ? " (and " + (forms.length - 12) + " more)" : ""), href: base + "your-name/?n=" + encodeURIComponent(g.row.canon) });
      });
    }
    var parts = String(f.name || "").trim().split(/\s+/).filter(Boolean);
    var sur = parts.length > 1 ? parts[parts.length - 1] : "";
    if (sur) nameItems.push({ text: "Other spellings of the surname " + sur + " that the Atlas holds", href: base + "your-name/?kind=surname&s=" + encodeURIComponent(sur) });
    if (!nameItems.length) nameItems.push({ text: f.name ? "The Atlas catalogue holds no given-name family for \"" + f.name + "\" as typed. Try the Say your name page with the spelling on your document." : "No name yet is fine: the steps below work from the place and the years.", href: base + "your-name/" });
    steps.push({ id: "name", title: "Pin down the name and how it was written",
      why: "A register is indexed under the clerk's spelling and the clerk's language, so a search typed from the family tree misses most of it.",
      items: nameItems,
      ask: "Which spellings appear on your own papers? Add them to the search.",
      not: "A different spelling is a lead until a record connects it to the same family." });

    if (f.from) {
      var o = f.from, items = [];
      var older = (o.older || []).filter(Boolean);
      if (older.length) items.push({ text: o.name + " is also found as " + older.join(", ") + ". Search all of them." });
      if (w) {
        var mid = Math.round((w.birth[0] + w.birth[1]) / 2), cap = captionAt(o, mid);
        if (cap.tracked) items.push({ text: "In " + mid + " " + o.name + " was under " + cap.polity + (cap.regime ? " (" + cap.regime + ")" : "") + "." });
        if (cap.tracked && cap.filedUnder.length) items.push({ text: "Records of those years are filed under: " + cap.filedUnder.join(", ") + ". Look in those archives, which may not be in today's country." });
        if (cap.tracked && cap.note) items.push({ text: cap.note });
      } else if (f.from.eras && f.from.eras.length) {
        items.push({ text: "Give a year (even a rough one) and the plan will say who held " + o.name + " then and where its records are filed." });
      }
      items.push({ text: "The place's own page, with every volume the Atlas lists for it", href: o.href });
      steps.push({ id: "place", title: "Fix " + o.name + " in the year, not on today's map",
        why: "The same village has changed country and name; the records follow the state of the year.",
        items: items,
        ask: "What name for the place appears on your papers? Is that a village or the nearest town?",
        not: "A place named in a family story may be the parish, the nearest town or the region, not the house." });

      var bw = w ? w.birth : null, bv = volumesFor(o.cols, "b", bw);
      var items2 = bv.slice(0, 6).map(function (c) { return { text: volLabel(c) + (c.held ? ", held by " + c.held : "") + (c.access ? ", access: " + c.access : ""), href: o.href, vol: c }; });
      if (bv.length > 6) items2.push({ text: "and " + (bv.length - 6) + " more on the place page", href: o.href });
      if (!items2.length) items2.push({ text: "The Atlas lists no birth or baptism volume for " + o.name + (bw ? " in " + bw[0] + "–" + bw[1] : "") + ". That is a gap in the Atlas, not proof the records do not exist: the place page names the region's archive.", href: o.href });
      steps.push({ id: "births", title: "Find the birth or baptism",
        why: "It gives the parents' names, which open the generation before them. Work backwards from the newest record.",
        items: items2,
        ask: w && w.guessed ? "Do you know their age, or a year they were born? One year narrows this a great deal." : "",
        not: w && w.guessed ? "The years above are a guess from the year they left (most people who emigrated were 15 to 45). They are where to start, not what happened." : "Baptism is a few days after birth; the two dates differ.",
        links: [] });

      var mv = volumesFor(o.cols, "m", w ? w.marriage : null), dv = volumesFor(o.cols, "d", w ? w.death : null);
      var items3 = [];
      mv.slice(0, 4).forEach(function (c) { items3.push({ text: volLabel(c), href: o.href, vol: c }); });
      dv.slice(0, 4).forEach(function (c) { items3.push({ text: volLabel(c), href: o.href, vol: c }); });
      if (!items3.length) items3.push({ text: "The Atlas lists no marriage or burial volume for " + o.name + (w ? " in those years" : "") + ".", href: o.href });
      steps.push({ id: "family", title: "Then marriages and burials in the place they left",
        why: "A brother's marriage or a parent's burial names them, or says they were away. Siblings, godparents and witnesses are how you confirm it is the right family.",
        items: items3,
        ask: "Are there relatives still in " + o.name + ", or a surname still common there?",
        not: "Two people of the same name in one parish are common. Do not join them without a date or a parent's name." });
    } else {
      steps.push({ id: "place", title: "Pin down where they started",
        why: "Without a place of origin there is no register to open. Everything on the arrival side usually names it.",
        items: [{ text: "Choose a place from the list when you fill in the sentence; old names such as Gallignana for Gračišće are accepted." }, { text: "Naturalisation papers, ship passenger lists and death certificates usually record the town or the country he said he came from." }],
        ask: "Which record in the new country is most likely to name their birthplace?",
        not: "A place named on arrival papers is what they told an official, sometimes the port they sailed from." });
    }

    var arr = [];
    if (f.to) {
      arr.push({ text: "Arrival, naturalisation or citizenship, and census records in " + (f.to.countryName || f.to.name) + " usually name a birthplace and a year of arrival, which are the two facts the origin side needs." });
      if (f.left != null) {
        var c2 = captionAt(f.to, f.left);
        if (c2.tracked) arr.push({ text: "In " + f.left + " " + f.to.name + " was under " + c2.polity + (c2.regime ? " (" + c2.regime + ")" : "") + "." });
      }
    } else arr.push({ text: "Choose where they arrived in the sentence above to get the sources for that country." });
    var ps = (f.providers || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    ps.slice(0, 6).forEach(function (p) { arr.push({ text: p.name + " (" + p.kind + "; access: " + p.access + ")", href: p.url, src: p }); });
    if (f.to && ps.length > 6) arr.push({ text: "and " + (ps.length - 6) + " more for " + (f.to.countryName || f.to.name) + " in the source catalogue", href: base + "providers/" });
    if (f.to && !ps.length) arr.push({ text: "The Atlas catalogue lists no source for " + (f.to.countryName || f.to.name) + " yet. Look for the national archive and the state or county records directly; the catalogue is thin here and the gap report says so." });
    steps.push({ id: "arrival", title: "The arrival side",
      why: "The records made when they arrived are in the language you read, often indexed, and usually name where they came from.",
      items: arr,
      ask: "Do you know the port, the year or the first address? Any of these narrows the search.",
      not: "Arrival and naturalisation dates differ by years. The spelling on an arrival list is the clerk's, not theirs." });

    steps.push({ id: "neighbours", title: "People from the same place",
      why: "People from one village often went to the same town in the new country, so neighbours, godparents and witnesses on both sides may be the same names.",
      items: [{ text: "Surnames attested in " + (f.from ? f.from.name : "the place") + " and the places they are found in", href: base + "surnames/" }, { text: "The map, with the shelf layer and the years set to his", href: base }],
      ask: "Who else from " + (f.from ? f.from.name : "the village") + " lived near them?",
      not: "A shared surname in one place is a lead for a family, not a proof of kinship." });

    steps.push({ id: "keep", title: "Keep what you find",
      why: "A trail is only useful if you can pick it up next week.",
      items: [{ text: "Start a family line in My research and tick off the volumes above as you look at them. Marks stay in this browser.", href: base + "my-research/" }],
      ask: "",
      not: "A search that finds nothing is a result to write down, with the spellings you tried, not a dead end." });

    steps.forEach(function (s, i) { s.n = i + 1; });
    return steps;
  }

  /* ---- reading a story out of free text ---------------------------------------------------------------------------------- */

  var REL = /\b(great[- ]great[- ]grand(?:father|mother|parent)|great[- ]grand(?:father|mother|parent)|grand(?:father|mother|parent)|great[- ](?:uncle|aunt)|father|mother|uncle|aunt|brother|sister|ancestor|relative)\b/i;
  var STOP = Object.create(null);
  "my a an the and who from came come to into in of at was were is are born about around circa abt all have this that his her their with for on by after before left arrived emigrated moved settled lived he she they i me our we it".split(" ").forEach(function (w) { STOP[w] = 1; });
  var COMMON = Object.create(null);
  "then also still later soon when while where which what how why not no yes but or so as if than too very just only even again once twice died dead married wed lived live living went go goes gone come comes coming moved move moving travelled traveled returned return born birth age old years year aged name named called said told great story stories family passport photo photograph picture letter diary document papers certificate record register mother father parents grand son daughter wife husband".split(" ").forEach(function (w) { COMMON[w] = 1; });
  var MOVE = /\b(moved|move|went|go|came|come|travelled|traveled|emigrated|migrated|sailed|settled|relocated|then|to|into|arrived|returned|left)\b/;
  var ANC = /\b(?:his|her|their|a|the)\s+(grandfather|grandmother|father|mother|dad|mum|mom)\b/g;
  var PLACE_BEFORE = { from: "from", of: "from", to: "to", into: "to", at: "to" };

  /* Every plausible year in the text, in order, each with a few words before it. */
  function yearsIn(text) {
    var out = [], re = /(^|[^0-9])(1[4-9][0-9]{2}|20[0-2][0-9])(?![0-9])/g, m, t = String(text || "");
    while ((m = re.exec(t))) { var at = m.index + m[1].length; out.push({ y: Number(m[2]), before: S.fold(t.slice(Math.max(0, at - 18), at)) }); }
    return out;
  }

  /* What a free-text story names, from the Atlas's own lists, with no model: {rel, given, surname, name, holds, left, born,
     from:{row, alts, word}, to:{row, alts, word}}. `ctx` is {map (buildMap rows), given (buildGiven rows), skip}.
     A word that is a catalogued given name is not taken for a place unless a place marker ("from", "to") stands before it, so "Ivan"
     is the man and "from Ivan" is the village. A story that gives one place is read as the place he started. */
  /* "ivan" and "BLAZEVIC" are shown as names: an all-lower or all-upper word gets a capital, a word typed with its own capitals is left. */
  function cased(w) { w = String(w || ""); return w && (w === w.toLowerCase() || w === w.toUpperCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }

  function parseStory(text, ctx, attached) {
    var t = String(text || ""), out = { rel: "", given: "", surname: "", name: "", holds: "story", left: null, born: null, from: null, to: null };
    var rm = REL.exec(t); if (rm) out.rel = rm[1].toLowerCase().replace(/ /g, "-");
    var ft = S.fold(t), tokens = ft.split(" ").filter(Boolean);
    var gv = ctx.given ? S.givenIn(t, ctx.given, ctx.skip) : [];
    var gset = Object.create(null); gv.forEach(function (g) { gset[g.word] = 1; });
    if (gv.length) {
      out.given = gv[0].row.canon;
      var raw = t.split(/\s+/), gi = -1;
      for (var i = 0; i < raw.length; i++) if (S.fold(raw[i]) === gv[0].word) { gi = i; break; }
      if (gi > -1 && raw[gi + 1]) {
        var nx = raw[gi + 1].replace(/^[("']+|[,.;:)"']+$/g, "");
        var fx = S.fold(nx), cap = /^[A-ZÀ-ÖØ-ÝČĆŽŠĐ][\p{L}'’-]+$/u.test(nx);
        if (/^[\p{L}'’-]{3,}$/u.test(nx) && !STOP[fx] && !REL.test(nx) && (cap || (!COMMON[fx] && !(ctx.map && ctx.map[fx] && ctx.map[fx].length > 2)))) out.surname = nx;
      }
      out.givenWord = raw[gi] ? raw[gi].replace(/[,.;:]+$/, "") : out.given;
      out.givenWord = cased(out.givenWord); if (out.surname) out.surname = cased(out.surname);
      out.name = out.givenWord + (out.surname ? " " + out.surname : "");
    }
    var all = [];
    if (/\b(photo|photograph|picture|snapshot|portrait)\b/i.test(t)) all.push("photo");
    if (/\b(document|certificate|passport|papers|record|register|manifest|visa)\b/i.test(t)) all.push("document");
    if (/\b(letter|postcard|diary)\b/i.test(t)) all.push("letter");
    (Array.isArray(attached) ? attached : attached ? [attached] : []).forEach(function (k) { if (HOLDS[k] && all.indexOf(k) < 0) all.push(k); });
    out.holdsAll = all.length ? all : ["story"];
    out.holds = (Array.isArray(attached) ? attached[0] : attached) || (all.indexOf("photo") > -1 ? "photo" : all.indexOf("letter") > -1 ? "letter" : all.indexOf("document") > -1 ? "document" : "story");

    var ys = yearsIn(t), born = null, left = null, rest = [];
    ys.forEach(function (y) { if (/(born|birth|b|b\.)\s*$/.test(y.before) && born == null) born = y.y; else rest.push(y); });
    if (rest.length) {
      var lab = rest.filter(function (y) { return /(came|arriv|left|emigrat|sail|around|about|circa|c\.|abt|in|by|moved)\s*$/.test(y.before); })[0] || rest[rest.length - 1];
      left = lab.y;
      if (born == null && rest.length > 1) { var e = rest.map(function (y) { return y.y; }).sort(function (a, b) { return a - b; })[0]; if (e < left) born = e; }
    }
    out.left = left; out.born = born;

    var cands = ctx.map ? S.candidates(t, ctx.map, ctx.skip) : [];
    var rolesFor = cands.map(function (c) {
      var p1 = tokens[c.at - 1] || "", p2 = tokens[c.at - 2] || "", isGiven = !!gset[c.word];
      var role = PLACE_BEFORE[p1] || ((p1 === "in" && p2 === "born") ? "from" : (p1 === "in" && /^(settled|arrived|lived|living|came|went|emigrated|moved)$/.test(p2)) ? "to" : "");
      return { c: c, role: role, drop: (isGiven && !role) || (c.word.indexOf(" ") < 0 && (STOP[c.word] || COMMON[c.word] || REL.test(c.word))) };
    }).filter(function (x) { return !x.drop; });
    function pick(x) { return x ? { row: x.c.rows[0], alts: x.c.rows.slice(1, 6), word: x.c.word } : null; }
    var fromX = rolesFor.filter(function (x) { return x.role === "from"; })[0];
    var toX = rolesFor.filter(function (x) { return x.role === "to"; })[0];
    var free = rolesFor.filter(function (x) { return !x.role && x !== fromX && x !== toX; });
    if (!fromX && free.length) fromX = free.shift();
    if (!toX && free.length) toX = free.shift();
    out.from = pick(fromX); out.to = pick(toX);

    /* Every place, in the order told, with what it was to them: born, moved to, lived in, or where a parent came from. */
    var stops = [];
    rolesFor.forEach(function (x) {
      var c = x.c, prev = stops[stops.length - 1], len = c.word.split(" ").length;
      if (prev && c.at === prev.at + prev.len && c.rows.some(function (r) { return r.cc === prev.row.cc; }) && !prev.country) { prev.country = c.word; return; }
      var lo = Math.max(prev ? prev.at + prev.len : 0, c.at - 6), win = tokens.slice(lo, c.at).join(" ");
      var anc = null, am, are = new RegExp(ANC.source, "g");
      while ((am = are.exec(win))) anc = am[1];
      var role = anc ? (/mother|mum|mom|grandmother/.test(anc) ? "mother" : "father") + "-from"
        : /\bborn\b/.test(win) ? "born"
        : /(^| )(from|of)$/.test(win) ? "origin"
        : MOVE.test(win) ? "move" : "lived";
      stops.push({ row: c.rows[0], alts: c.rows.slice(1, 6), word: c.word, at: c.at, len: len, role: role, age: null, year: null, approx: false });
    });
    var route = stops.filter(function (x) { return x.role !== "father-from" && x.role !== "mother-from"; });
    /* ages: "when he was 3 years old he moved to Harare" gives Harare age 3; a stop with no age sits between its neighbours */
    var AGE = /(?:when (?:he|she|they|i|we) (?:was|were)|aged?|at the age of|at age|by the age of|at) (\d{1,2})(?: years?(?: old)?)?(?= |$)/g, am2, ages = [];
    while ((am2 = AGE.exec(ft))) ages.push({ age: Number(am2[1]), tok: ft.slice(0, am2.index).split(" ").length - 1 });
    var au = 0, lastAt = -1;
    route.forEach(function (st) {
      if (st.role === "born") st.age = 0;
      else for (var k = au; k < ages.length; k++) if (ages[k].tok >= lastAt && ages[k].tok < st.at) { st.age = ages[k].age; au = k + 1; break; }
      lastAt = st.at;
    });
    for (var i0 = 0; i0 < route.length; i0++) {
      if (route[i0].age != null) continue;
      var a0 = i0 - 1, b0 = i0 + 1; while (b0 < route.length && route[b0].age == null) b0++;
      var from0 = a0 >= 0 && route[a0].age != null ? route[a0].age : null, to0 = b0 < route.length ? route[b0].age : null;
      if (from0 != null && to0 != null) { route[i0].age = Math.round(from0 + (to0 - from0) * (i0 - a0) / (b0 - a0)); route[i0].approx = true; }
      else if (from0 != null) { route[i0].age = from0; route[i0].approx = true; }
    }
    if (out.born != null) route.forEach(function (st) { if (st.age != null) st.year = out.born + st.age; });
    out.stops = stops; out.route = route;
    if (route.length) {
      out.from = { row: route[0].row, alts: route[0].alts, word: route[0].word };
      out.to = route.length > 1 ? { row: route[route.length - 1].row, alts: route[route.length - 1].alts, word: route[route.length - 1].word } : null;
    }

    /* the people: the one the story is about, and the parents it names */
    var people = [];
    if (out.name || out.rel) people.push({ role: "self", rel: out.rel, name: out.name, given: out.givenWord || "", surname: out.surname || "", place: route[0] || null });
    function kin(which, re) {
      var m = re.exec(t); if (!m) return null;
      var g = m[1] || "", sn = m[2] || "", fg = S.fold(g), fs = S.fold(sn);
      if (!g || STOP[fg] || COMMON[fg]) return null;
      var ok = sn && /^[\p{L}'’-]{3,}$/u.test(sn) && !STOP[fs] && !COMMON[fs] && !(ctx.given && ctx.given[fs]);
      return { role: which, name: cased(g) + (ok ? " " + cased(sn) : ""), given: cased(g), surname: ok ? cased(sn) : "", presumed: false };
    }
    var fa = kin("father", /\b(?:his|her|their|my)\s+(?:father|dad)(?:'?s)?(?:\s+name)?\s+(?:was|is|named|called)\s+([\p{L}'’-]+)(?:\s+([\p{L}'’-]+))?/iu);
    var mo = kin("mother", /\b(?:his|her|their|my)\s+(?:mother|mum|mom)(?:'?s)?(?:\s+name)?\s+(?:was|is|named|called)\s+([\p{L}'’-]+)(?:\s+([\p{L}'’-]+))?/iu);
    var fromP = stops.filter(function (x) { return x.role === "father-from"; })[0], fromM = stops.filter(function (x) { return x.role === "mother-from"; })[0];
    if (!fa && fromP) fa = { role: "father", name: "", given: "", surname: "", presumed: false };
    if (!mo && fromM) mo = { role: "mother", name: "", given: "", surname: "", presumed: false };
    var self = people[0];
    if (fa) { fa.place = fromP || null; if (!fa.surname && self && self.surname && (!self.rel || /father|mother|grand|uncle|aunt|brother|sister|ancestor|relative/.test(self.rel))) { fa.surname = self.surname; fa.presumed = true; fa.name = (fa.given ? fa.given + " " : "") + fa.surname; } people.push(fa); }
    if (mo) { mo.place = fromM || null; people.push(mo); }
    out.people = people;
    return out;
  }

  /* The line a research family is kept under: the surname when the story gave one, else the place they started. */
  function familyName(f) {
    var parts = String(f.name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : (f.from ? f.from.name : "Research");
  }

  /* Turn a plan into a research family: a line named for the surname (or the place), with the volumes and sources the plan lists marked
     as planned. P is window.raProgress. Returns {slug, name, added}; nothing is sent anywhere, the marks stay in this browser. */
  function startFamily(P, facts, plan) {
    var name = familyName(facts);
    var where = facts.from ? facts.from.name : "";
    var slug = P.addLine(name, where), added = 0;
    var base = facts.base || "/";
    plan.forEach(function (s) {
      s.items.forEach(function (it) {
        var id = null, what = null;
        if (it.vol) { id = S.volumeId(it.vol); what = { t: it.vol.title, where: where, href: it.href || base }; }
        else if (it.src) { id = "source:" + it.src.id; what = { t: it.src.name, where: (facts.to && facts.to.name) || where, href: it.href || base }; }
        if (!id) return;
        var cur = P.get(id) || {};
        if (cur.state) return;
        P.setWhat(id, what); P.setState(id, "planned"); added++;
      });
    });
    try { document.dispatchEvent(new CustomEvent("ra-progress-changed")); } catch (e) { /* not in a page */ }
    return { slug: slug, name: name, added: added };
  }

  /* ---- flags, leaders, what was going on, and how the name was written -------------------------------------------------- */

  /* The flag in use in a year, as an image name under /fl/, from the country's flag eras (flag-map.json `f`), or null. */
  function flagFor(info, year) { return info && info.flagRows ? S.flagAt(info.flagRows, year) : null; }

  /* The head of state of today's country in a year, from leaders.json rows [name, wikidata, from, to|null, start, end|null]: the term
     that covers the year, the latest start winning. Null when Wikidata names none, which is silence, not "nobody ruled". */
  function leaderAt(rows, year) {
    var pick = null;
    (rows || []).forEach(function (r) { if (r[2] <= year && year <= (r[3] == null ? 9999 : r[3]) && (!pick || r[2] >= pick[2])) pick = r; });
    return pick;
  }
  /* Every holder whose term touches [y0, y1], in date order. */
  function leadersBetween(rows, y0, y1) {
    return (rows || []).filter(function (r) { return r[2] <= y1 && (r[3] == null ? 9999 : r[3]) >= y0; }).sort(function (a, b) { return a[2] - b[2]; });
  }
  function short(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; }

  /* The forms of a given name that the catalogue holds, by language: the positive ones (same, attested, rule) and, kept apart, the leads
     (correct in that language, never seen on a record). `labels` maps a language key to its name. */
  function givenGroups(row, labels) {
    var out = [];
    Object.keys(row.langs || {}).forEach(function (l) {
      var pos = [], lead = [];
      (row.langs[l] || []).forEach(function (f) { if (["same", "attested", "rule"].indexOf(f.status) > -1) pos.push(f.form); else if (f.status === "lead") lead.push(f.form); });
      if (pos.length || lead.length) out.push({ lang: l, label: (labels && labels[l]) || (l.charAt(0).toUpperCase() + l.slice(1)), forms: pos.sort(), leads: lead.sort() });
    });
    return out.sort(function (a, b) { return a.label.localeCompare(b.label); });
  }

  /* A surname's spellings from the catalogue's published face (`fams` = surname-families.json rows) and the corpus row for the name (`row` from
     the /s/ shard: computed close spellings and the countries it is attested in). Nothing is invented: no family, no computed forms, says so. */
  function surnameBlock(name, fams, row) {
    var key = function (x) { return S.fold(x).replace(/ /g, ""); }, k = key(name), fam = null;
    (fams || []).forEach(function (f) { if (!fam && (key(f.name) === k || f.forms.some(function (m) { return key(m[0]) === k; }))) fam = f; });
    var by = { same: [], attested: [], rule: [], lead: [], "case-by-case": [] };
    if (fam) fam.forms.forEach(function (m) { if (by[m[1]]) by[m[1]].push(m[0]); });
    var comp = row && row.variants ? row.variants : [];
    return { name: name, family: fam ? { headline: fam.name, by: by, notSame: fam.notSame || [] } : null,
      spelling: comp.filter(function (v) { return v.how === "spelling"; }).map(function (v) { return v.n; }).slice(0, 8),
      sounds: comp.filter(function (v) { return v.how === "sounds"; }).map(function (v) { return v.n; }).slice(0, 8),
      countries: row && row.countries ? row.countries.map(function (c) { return c.cc; }).slice(0, 8) : [] };
  }

  var api = { toYear: toYear, suggest: suggest, windows: windows, volumesFor: volumesFor, captionAt: captionAt, progress: progress, between: between,
              givenForms: givenForms, volLabel: volLabel, buildPlan: buildPlan, parseStory: parseStory, startFamily: startFamily, familyName: familyName, flagFor: flagFor, leaderAt: leaderAt, leadersBetween: leadersBetween, givenGroups: givenGroups, surnameBlock: surnameBlock, short: short, yearsIn: yearsIn,
              HOLDS: HOLDS, YEAR_MIN: YEAR_MIN, YEAR_MAX: YEAR_MAX };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  window.raStory = api;

  /* ---- loading, and the journey drawing (browser only) ------------------------------------------------------------------ */

  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

  /* The Atlas's own files, fetched once: the place rows (as the search box loads them), the given-name catalogue, and per place its own
     file and region. `BASE` is the site root. */
  function createLoader(BASE) {
    var data = null, loading = null, cache = Object.create(null);
    function getJSON(path) { if (cache[path]) return cache[path]; return (cache[path] = fetch(BASE + path).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }).catch(function (e) { delete cache[path]; throw e; })); }
    function load() {
      if (data) return Promise.resolve(data);
      if (loading) return loading;
      loading = getJSON("index.json").then(function (d) {
        var rows = d.places.slice(), tail = d.tail && d.tail.cells ? Object.keys(d.tail.cells) : [];
        return Promise.all(tail.map(function (k) { return getJSON(d.tail.dir + k + ".json").then(function (c) { rows = rows.concat(c.places || []); }).catch(function () {}); }))
          .then(function () { return getJSON("index-quiet.json").then(function (q) { rows = rows.concat(q.places || []); }).catch(function () {}); })
          .then(function () { return getJSON("given-names.json").catch(function () { return { rows: [] }; }); })
          .then(function (g) {
            var givenRows = g.rows || [];
            data = { rows: rows, countries: d.countries || {}, givenRows: givenRows, languages: g.languages || [], given: S.buildGiven(givenRows), map: S.buildMap(rows), skip: Object.create(null) };
            return data;
          });
      }).catch(function (e) { loading = null; throw e; });
      return loading;
    }
    function placeInfo(row) {
      var regionsP = getJSON("regions.json").catch(function () { return null; });
      return Promise.all([getJSON("p/" + encodeURIComponent(row.i) + ".json").catch(function () { return null; }), regionsP]).then(function (r) {
        var p = r[0], regs = r[1], region = p && regs ? regs.regions.filter(function (x) { return x.id === p.region; })[0] : null;
        return { row: row, p: p, name: row.n.replace(/\s*\(([^)]*)\)/, function (m, x) { return S.fold(x) === S.fold(row.n.replace(/\s*\([^)]*\)/, "")) ? "" : m; }), lat: p ? p.lat : row.y, lon: p ? p.lon : row.x, cc: row.cc, countryName: (data.countries[row.cc] || row.cc || ""),
          older: p ? (p.names || []).map(function (n) { return n.n; }) : [], cols: p ? p.collections || [] : [],
          eras: region ? region.eras : null, regimes: regs ? regs.regimes : null, region: region, href: BASE + "place/" + encodeURIComponent(row.i) + "/" };
      });
    }
    /* Everything a plan needs for one parsed story: both places with their files, the sources of the arrival country, the events. */
    function surname(name) {
      if (!name) return Promise.resolve(null);
      var fold = window.raFold || S.fold, f = fold(name);
      var shard = getJSON("shards.json").catch(function () { return {}; }).then(function (info) {
        if (!window.raShardKey) return null;
        var key = window.raShardKey(f, info.s || {});
        return key ? getJSON("s/" + encodeURIComponent(key) + ".json").then(function (rows) { return rows.filter(function (r) { return fold(r.n) === f; })[0] || null; }).catch(function () { return null; }) : null;
      });
      return Promise.all([getJSON("surname-families.json").catch(function () { return { rows: [] }; }), shard]).then(function (r) { return surnameBlock(name, r[0].rows, r[1]); });
    }
    function gather(parsed) {
      var route = parsed.route && parsed.route.length ? parsed.route : [parsed.from, parsed.to].filter(Boolean).map(function (x, i) { return { row: x.row, alts: x.alts || [], word: x.word, role: i ? "move" : "origin", age: null, year: null, approx: false }; });
      if (!parsed.people && (parsed.name || parsed.given)) parsed = Object.assign({}, parsed, { people: [{ role: "self", rel: parsed.rel, name: parsed.name, given: parsed.givenWord || parsed.given, surname: parsed.surname }] });
      var anc = (parsed.stops || []).filter(function (x) { return /-from$/.test(x.role); });
      var rowsNeeded = [], seenRow = Object.create(null);
      function need(row) { if (row && !seenRow[row.i]) { seenRow[row.i] = 1; rowsNeeded.push(row); } }
      if (parsed.from) need(parsed.from.row); if (parsed.to) need(parsed.to.row);
      route.forEach(function (x) { need(x.row); }); anc.forEach(function (x) { need(x.row); });
      return load().then(function () {
        var people = (parsed.people || []).filter(function (x) { return x.given || x.surname; });
        return Promise.all([Promise.all(rowsNeeded.map(function (r) { return placeInfo(r); })),
          getJSON("providers.json").catch(function () { return { providers: [] }; }), getJSON("mortality.json").catch(function () { return null; }),
          getJSON("flag-map.json").catch(function () { return null; }), getJSON("leaders.json").catch(function () { return null; }),
          Promise.all(people.map(function (pe) { return pe.surname ? surname(pe.surname).catch(function () { return null; }) : Promise.resolve(null); })), Promise.resolve(people)]);
      }).then(function (r) {
        var infos = Object.create(null); r[0].forEach(function (i) { infos[i.row.i] = i; });
        var provs = r[1].providers || [], pname = Object.create(null), fm = r[3] && r[3].f, lead = r[4] && r[4].countries;
        provs.forEach(function (x) { pname[x.id] = x.name; });
        r[0].forEach(function (i) { i.pname = pname; i.flagRows = fm ? fm[String(i.cc || "").toUpperCase()] : null; i.leaders = lead ? lead[String(i.cc || "").toUpperCase()] : null; });
        var from = parsed.from ? infos[parsed.from.row.i] : null, to = parsed.to ? infos[parsed.to.row.i] : null;
        var facts = { rel: parsed.rel, name: parsed.name, holds: parsed.holds, holdsAll: parsed.holdsAll, left: parsed.left, born: parsed.born, from: from, to: to, base: BASE,
          providers: to ? provs.filter(function (p) { return (p.countries || []).indexOf(to.cc) > -1; }) : (from ? provs.filter(function (p) { return (p.countries || []).indexOf(from.cc) > -1; }) : []),
          given: parsed.given && data.given ? S.givenIn(parsed.givenWord || parsed.given, data.given, null) : [],
          route: route.map(function (x) { return { info: infos[x.row.i], age: x.age, year: x.year, approx: x.approx, role: x.role, country: x.country }; }),
          ancestors: anc.map(function (x) { return { info: infos[x.row.i], who: x.role === "mother-from" ? "mother" : "father" }; }) };
        var labels = {}; (data.languages || []).forEach(function (l) { labels[l.key] = l.label; });
        var out = r[6].map(function (pe, i) {
          var gr = pe.given && data.given ? S.givenIn(pe.given, data.given, null) : [];
          return { role: pe.role, rel: pe.rel, name: pe.name, given: gr.length ? { canon: gr[0].row.canon, typed: pe.given, groups: givenGroups(gr[0].row, labels) } : (pe.given ? { canon: "", typed: pe.given, groups: [] } : null),
            surname: r[5][i], surnameTyped: pe.surname, presumed: !!pe.presumed, place: pe.place && infos[pe.place.row.i] ? infos[pe.place.row.i].name : "" };
        });
        return { facts: facts, plan: buildPlan(facts), mort: r[2], names: { people: out }, people: out };
      });
    }
    return { getJSON: getJSON, load: load, placeInfo: placeInfo, gather: gather, surname: surname };
  }

  /* The journey: a year slider, play button and captions for who held each place in each year, a still list of what changed, and a
     dashed line with a moving dot on a map. `o.els` = {cap, slider, yearOut, play, moments, time, mapBox}; `o.getMap()` resolves to
     {L, map}, so the page's own map or the home map can host it; `o.pad` is the room to leave round the places (the drawer). */
  function createJourney(o) {
    var E = o.els, layers = null, stopPlay = null, askEl = null;
    var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var BASE = (o.base || document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
    var TYPE = {}; /* event type -> label, from mortality.json `types` */
    function typeLabel(t) { return (TYPE[t] || t).replace(/ \(as the cited.*$/, "").replace(/^./, function (c) { return c.toUpperCase(); }); }
    function evHere(mort, info, y0, y1) {
      if (!mort || !info || info.lat == null || y0 == null) return [];
      return S.eventsAt(mort.events, info.lat, info.lon, Math.round((y0 + y1) / 2), Math.ceil((y1 - y0) / 2) + 1);
    }
    /* One place at one time: who held it, its flag, the head of state of today's country, anything terrible nearby. `year` is null when
       the story gave no way to date it; `evs` are the events near the place across the whole life. */
    function line(info, year, evs, prefix, ageText) {
      var d = el("div", null, "lf-capline");
      if (year == null) {
        d.append(el("div", (prefix || "") + info.name + (ageText ? ", " + ageText : "") + ": add a birth year below to see who held the ground, the flag and what was going on.", "lf-caphead"));
        return d;
      }
      var c = captionAt(info, year), fl = flagFor(info, year);
      if (fl) { var im = el("img", null, "lf-flag"); im.src = BASE + "fl/" + encodeURIComponent(fl) + ".svg"; im.alt = "Flag from the Atlas's flag history of today's " + info.countryName + ", " + year; im.title = "From the flag history of today's " + info.countryName + " in " + year + ". The place may have been under another state: see the line beside it."; im.width = 36; im.height = 24; im.loading = "lazy"; d.append(im); }
      var head = el("div", null, "lf-caphead");
      head.append(el("b", (prefix || "") + info.name + ", " + year + (ageText ? " (" + ageText + ")" : "") + ": "), document.createTextNode(c.polity ? "under " + c.polity : "no era table"));
      if (c.regime) head.append(el("span", " (" + c.regime + ")", "lf-regime"));
      d.append(head);
      if (c.tracked && c.filedUnder.length) d.append(el("div", "Records of this period: " + c.filedUnder.join(", "), "lf-filed"));
      if (!c.tracked && c.note) d.append(el("div", c.note, "lf-filed"));
      var ld = leaderAt(info.leaders, year);
      if (ld) d.append(el("div", "Head of state of today's " + info.countryName + ": " + ld[0] + " (" + ld[2] + (ld[3] == null ? " on" : "–" + ld[3]) + ")", "lf-filed lf-leader"));
      else if (info.leaders) d.append(el("div", "The Atlas names no head of state of today's " + info.countryName + " for " + year + "; look at who held the ground, above.", "lf-filed lf-leader"));
      (evs || []).filter(function (e) { return e.f - 1 <= year && year <= e.t + 1; }).slice(0, 3).forEach(function (e) {
        var n = el("div", null, "lf-now lf-now-" + e.ty); n.append(el("b", typeLabel(e.ty) + " in the area, " + e.f + (e.t !== e.f ? "–" + e.t : "") + ": "), document.createTextNode(e.n));
        d.append(n);
      });
      return d;
    }
    function clear() { if (stopPlay) stopPlay(); if (layers) { layers.group.remove(); layers = null; } if (askEl) askEl.hidden = true; }

    /* The stops with a time each: years when the story gives a birth year or dates, else ages, else none. */
    function timeline(f) {
      var route = (f.route && f.route.length ? f.route : [f.from && { info: f.from }, f.to && { info: f.to }].filter(Boolean)).filter(function (x) { return x.info; });
      if (!route.length) return { mode: "none", stops: [] };
      var withYear = route.some(function (x) { return x.year != null; }), withAge = route.some(function (x) { return x.age != null; });
      if (withYear) return { mode: "year", stops: route.map(function (x, i) { return { info: x.info, t: x.year != null ? x.year : (i ? null : route[0].year), age: x.age, approx: x.approx, role: x.role }; }).filter(function (x) { return x.t != null; }) };
      if (withAge && f.born == null && f.left == null) return { mode: "age", stops: route.filter(function (x) { return x.age != null; }).map(function (x) { return { info: x.info, t: x.age, age: x.age, approx: x.approx, role: x.role }; }) };
      if (f.left != null && route.length) {
        var y0 = f.born != null ? f.born : f.left - 25;
        return { mode: "year", stops: route.length === 1 ? [{ info: route[0].info, t: y0 }] : route.map(function (x, i) { return { info: x.info, t: i === 0 ? y0 : (i === route.length - 1 ? f.left : Math.round(y0 + (f.left - y0) * i / (route.length - 1))), age: x.age, approx: x.approx, role: x.role }; }), left: f.left };
      }
      return { mode: "none", stops: route.map(function (x) { return { info: x.info, t: null, age: x.age, role: x.role }; }) };
    }
    /* Where they are at time t: the stop they have reached, and the point between stops when they are on the way. */
    function along(stops, t) {
      var idx = 0;
      for (var i = 0; i < stops.length; i++) if (t >= stops[i].t) idx = i;
      var a = stops[idx], b = stops[idx + 1], pt = a.info.lat != null ? [a.info.lat, a.info.lon] : null, moving = false;
      if (b && a.info.lat != null && b.info.lat != null) {
        var tr = Math.min(2, Math.max(.6, (b.t - a.t) / 4)), k = (t - (b.t - tr)) / tr;
        if (k > 0 && k < 1) { pt = between([a.info.lat, a.info.lon], [b.info.lat, b.info.lon], k); moving = true; }
      }
      return { idx: idx, pt: pt, moving: moving };
    }
    function ageWord(st) { return st.age == null ? "" : (st.approx ? "sometime near age " : "age ") + st.age; }

    function draw(f, mort, names) {
      clear();
      var tl = timeline(f), stops = tl.stops, anc = (f.ancestors || []).filter(function (x) { return x.info; });
      var can = stops.length > 0 && tl.mode !== "none" && (stops.length > 1 || tl.mode === "year");
      if (E.time) E.time.hidden = !can;
      if (E.mapBox) E.mapBox.hidden = !(stops.length || anc.length);
      E.moments.textContent = ""; E.cap.textContent = "";
      TYPE = (mort && mort.types) || {};
      if (!askEl && E.cap.parentNode) { askEl = el("form", null, "lf-askyear"); askEl.hidden = true; E.cap.parentNode.insertBefore(askEl, E.cap); }
      if (askEl) {
        askEl.textContent = ""; askEl.hidden = tl.mode !== "age";
        if (tl.mode === "age") {
          var inp = el("input"); inp.type = "text"; inp.inputMode = "numeric"; inp.maxLength = 4; inp.placeholder = "e.g. 1920"; inp.setAttribute("aria-label", "The year they were born, about");
          var go = el("button", "Show the years"); go.type = "submit";
          askEl.append(el("label", "Do you know about what year they were born? "), inp, go, el("span", " Their ages are used until you do.", "lf-filed"));
          askEl.onsubmit = function (ev) { ev.preventDefault(); var y = toYear(inp.value); if (y != null && o.onBorn) o.onBorn(y); else inp.setCustomValidity && inp.focus(); };
        }
      }
      if (!stops.length && !anc.length) { E.cap.textContent = "Say where they started and where they arrived to see the journey."; return Promise.resolve(); }
      var t0 = null, t1 = null;
      if (can) {
        t0 = stops[0].t; t1 = stops[stops.length - 1].t + (tl.mode === "age" ? 4 : 10);
        if (tl.mode === "year") { t1 = Math.min(t1, YEAR_MAX); if (tl.left != null) t1 = Math.min(tl.left + 12, YEAR_MAX); }
      }
      var evFor = [];
      stops.concat(anc).forEach(function (st) { var inf = st.info; if (!inf.__ev) inf.__ev = null; });
      function evs(info) { return tl.mode === "year" && t0 != null ? evHere(mort, info, t0, t1) : []; }
      var evMap = new Map(); stops.concat(anc).forEach(function (st) { if (!evMap.has(st.info)) evMap.set(st.info, evs(st.info)); });

      function setT(t) {
        E.cap.textContent = "";
        var at = stops.length ? along(stops, t) : { idx: 0, pt: null, moving: false }, cur = stops[at.idx];
        if (cur) {
          var ye = tl.mode === "year" ? t : null;
          E.cap.append(line(cur.info, ye, evMap.get(cur.info), at.moving ? "On the way from " : "", tl.mode === "age" ? "age " + t : (f.born != null ? "age " + (t - f.born) : "")));
          if (at.moving && stops[at.idx + 1]) E.cap.append(el("div", "…to " + stops[at.idx + 1].info.name + (stops[at.idx + 1].age != null ? " (" + ageWord(stops[at.idx + 1]) + ")" : ""), "lf-filed"));
        }
        anc.forEach(function (x) { E.cap.append(line(x.info, tl.mode === "year" ? t : null, evMap.get(x.info), "His " + x.who + "'s family, ", "")); });
        if (E.slider) E.slider.value = String(t);
        if (E.yearOut) E.yearOut.textContent = tl.mode === "age" ? "age " + t : String(t);
        if (E.slider) E.slider.setAttribute("aria-valuetext", (tl.mode === "age" ? "age " : "") + t + (cur ? ". " + (at.moving ? "On the way" : "At " + cur.info.name) : ""));
        if (layers && layers.dot && at.pt) {
          layers.dot.setLatLng(at.pt);
          var pts = []; for (var i = 0; i <= at.idx; i++) if (stops[i].info.lat != null) pts.push([stops[i].info.lat, stops[i].info.lon]);
          pts.push(at.pt); layers.line.setLatLngs(pts);
        }
      }
      if (can) {
        E.slider.min = String(t0); E.slider.max = String(t1); setT(t0);
        E.slider.oninput = function () { if (stopPlay) stopPlay(); setT(Number(E.slider.value)); };
        var raf = null;
        stopPlay = function () { if (raf) cancelAnimationFrame(raf); raf = null; if (E.play) E.play.textContent = "▶ Play"; };
        if (E.play) {
          E.play.hidden = reduce;
          E.play.onclick = function () {
            if (raf) { stopPlay(); return; }
            E.play.textContent = "❚❚ Pause";
            var from = Number(E.slider.value) >= t1 ? t0 : Number(E.slider.value), ts0 = null, span = (t1 - from) * (tl.mode === "age" ? 260 : 450);
            function tick(ts) { if (ts0 == null) ts0 = ts; var k = Math.min(1, (ts - ts0) / span); setT(Math.round(from + (t1 - from) * k)); if (k < 1) raf = requestAnimationFrame(tick); else stopPlay(); }
            raf = requestAnimationFrame(tick);
          };
        }
      } else {
        var ty = tl.mode === "year" && stops.length ? stops[0].t : null;
        stops.slice(0, 4).forEach(function (st) { E.cap.append(line(st.info, ty, evMap.get(st.info), "", ageWord(st))); });
        anc.forEach(function (x) { E.cap.append(line(x.info, ty, evMap.get(x.info), "His " + x.who + "'s family, ", "")); });
      }

      /* the setting: who held the ground and when it changed, what was going on, who led */
      if (tl.mode === "year" && t0 != null) {
        var mid = Math.round((t0 + t1) / 2), half = Math.ceil((t1 - t0) / 2) + 1, items = [], seenInfo = new Set();
        stops.concat(anc).forEach(function (st) {
          var info = st.info; if (seenInfo.has(info)) return; seenInfo.add(info);
          S.aroundYear(info.eras || [], [], mid, half).forEach(function (x) { if (x.y >= t0 - 1 && x.y <= t1 + 1) items.push({ y: x.y, t: info.name + ": " + x.title }); });
        });
        items.sort(function (p, q) { return p.y - q.y; });
        if (items.length) {
          E.moments.append(el("h4", "Who held the ground, and when it changed"));
          var ul = el("ul"); items.slice(0, 8).forEach(function (x) { var li = el("li"); li.append(el("b", x.y + " "), x.t); ul.append(li); });
          E.moments.append(ul);
        }
        var seen = Object.create(null), evl = [];
        stops.concat(anc).forEach(function (st) { (evMap.get(st.info) || []).forEach(function (e) { if (seen[e.id]) return; seen[e.id] = 1; evl.push({ e: e, where: st.info.name }); }); });
        if (evl.length) {
          E.moments.append(el("h4", "What was going on: epidemics, famines, wars and mass deaths nearby"));
          var ue = el("ul", null, "lf-events");
          evl.slice(0, 8).forEach(function (x) {
            var li = el("li", null, "lf-ev lf-ev-" + x.e.ty), t = x.e.toll && x.e.toll.text ? " " + short(x.e.toll.text, 160) : "";
            li.append(el("b", x.e.f + (x.e.t !== x.e.f ? "–" + x.e.t : "") + " "), el("span", typeLabel(x.e.ty), "lf-tag"), document.createTextNode(" " + x.e.n + " (near " + x.where + "). " + short(x.e.says, 200) + t));
            if (x.e.open) li.append(el("div", "Disputed: " + short(x.e.open, 160), "lf-filed"));
            ue.append(li);
          });
          E.moments.append(ue);
        }
        var seenCc = Object.create(null);
        stops.concat(anc).forEach(function (st) {
          var info = st.info; if (!info.leaders || seenCc[info.cc]) return; seenCc[info.cc] = 1;
          var ls = leadersBetween(info.leaders, t0, t1).slice(0, 8);
          if (!ls.length) return;
          E.moments.append(el("h4", "Leaders of today's " + info.countryName + " in those years"));
          var ul2 = el("ul"); ls.forEach(function (r) { var li = el("li"); li.append(el("b", r[2] + (r[3] == null ? " on " : "–" + r[3] + " ")), r[0]); ul2.append(li); });
          E.moments.append(ul2);
        });
        if (items.length || evl.length) E.moments.append(el("p", "This is the setting, not a fact about them: the events are those whose area covers the place in those years, and the leaders are those of the country as it is drawn today.", "cap"));
      }

      return o.getMap().then(function (m) {
        var L = m.L, map = m.map, pts = [], dirs = ["top", "bottom", "right", "left"];
        try { map.getCenter(); } catch (e) { map.setView([30, 0], 2, { animate: false }); } /* a new map has no view yet: flyTo needs one, and drawn pins are projected from it */
        map.invalidateSize({ animate: false });
        var g = L.layerGroup().addTo(map);
        stops.forEach(function (st, i) {
          var info = st.info; if (info.lat == null) return;
          var first = i === 0, last = i === stops.length - 1 && stops.length > 1;
          var label = first ? (st.role === "born" ? "Born" : "Started") : (st.age != null ? (st.approx ? "About age " : "Age ") + st.age : last ? "Arrived" : "Then");
          L.circleMarker([info.lat, info.lon], { radius: 8, weight: 3, color: "#fff", fillColor: first ? "#b3452e" : "#1f5c6b", fillOpacity: 1 })
            .bindTooltip(label + ": " + info.name, { permanent: true, direction: dirs[i % 4], offset: [0, i % 4 === 0 ? -8 : i % 4 === 1 ? 8 : 0] }).addTo(g);
          pts.push([info.lat, info.lon]);
        });
        anc.forEach(function (x) {
          var info = x.info; if (info.lat == null) return;
          L.circleMarker([info.lat, info.lon], { radius: 6, weight: 2, color: "#7a7a7a", fillColor: "#fff", fillOpacity: 1, dashArray: "2 3" })
            .bindTooltip("His " + x.who + "'s family: " + info.name, { permanent: true, direction: "left", offset: [-6, 0] }).addTo(g);
          pts.push([info.lat, info.lon]);
        });
        layers = { group: g };
        var rp = stops.filter(function (st) { return st.info.lat != null; }).map(function (st) { return [st.info.lat, st.info.lon]; });
        if (rp.length > 1) {
          L.polyline(rp, { color: "#7a7a7a", weight: 2, dashArray: "4 6", opacity: .7 }).addTo(g);
          layers.line = L.polyline([rp[0], rp[0]], { color: "#b3452e", weight: 3 }).addTo(g);
          layers.dot = L.circleMarker(rp[0], { radius: 6, weight: 2, color: "#fff", fillColor: "#16222a", fillOpacity: 1 }).addTo(g);
          if (can) setT(Number(E.slider.value));
        }
        var pad = o.pad || {};
        if (pts.length > 1) map.flyToBounds ? map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: pad.tl || [70, 50], paddingBottomRight: pad.br || [110, 60], duration: reduce ? 0 : 1.6, maxZoom: 7 }) : map.fitBounds(L.latLngBounds(pts));
        else if (pts.length) map.setView(pts[0], 8);
        /* the page may have been sliding or hidden when the map was made: measure again, and make the drawn pins project from the final view */
        setTimeout(function () { map.invalidateSize({ animate: false }); }, 60);
        setTimeout(function () { map.invalidateSize({ animate: false }); map.fire("moveend"); }, reduce ? 150 : 1900);
      }).catch(function (e) { if (window.console) console.warn("The journey map did not draw:", e); if (E.mapBox) E.mapBox.setAttribute("data-failed", "1"); });
    }
    return { draw: draw, clear: clear };
  }

  /* How one person's first name and surname were written: the catalogue's forms, with leads kept apart. Null when it holds nothing. */
  function personNames(g, sn, base) {
    var box = el("div", null, "lf-pnames"), any = false;
    if (g && g.groups && g.groups.length) {
      any = true;
      box.append(el("h4", "First name: " + g.typed + " is also written"));
      var ul = el("ul", null, "lf-forms"), shown = Object.create(null), leads = [];
      g.groups.forEach(function (x) {
        x.forms.forEach(function (f) { shown[S.fold(f)] = 1; });
        if (x.forms.length) { var li = el("li"); li.append(el("b", x.label + ": "), document.createTextNode(x.forms.slice(0, 8).join(", ") + (x.forms.length > 8 ? " and " + (x.forms.length - 8) + " more case endings and spellings" : ""))); ul.append(li); }
      });
      g.groups.forEach(function (x) { x.leads.forEach(function (f) { var k = S.fold(f); if (!shown[k]) { shown[k] = 1; leads.push(f); } }); });
      if (leads.length) { var ll = el("li"); ll.append(el("b", "Worth trying, in other languages (never yet seen on a record): "), document.createTextNode(leads.slice(0, 14).join(", ") + (leads.length > 14 ? " and " + (leads.length - 14) + " more" : ""))); ul.append(ll); }
      box.append(ul);
    }
    if (sn) {
      var f = sn.family, pos = f ? f.by.same.concat(f.by.attested, f.by.rule) : [];
      if (f || sn.spelling.length || sn.sounds.length) {
        any = true;
        box.append(el("h4", "Surname: " + sn.name + " may be written"));
        var u2 = el("ul", null, "lf-forms");
        function row(b, t) { var l = el("li"); l.append(el("b", b), document.createTextNode(t)); u2.append(l); }
        if (pos.length) row("Recorded spellings of the same name: ", pos.join(", "));
        if (f && f.by.lead.length) row("Worth trying, never yet seen on a record: ", f.by.lead.slice(0, 10).join(", ") + (f.by.lead.length > 10 ? " and " + (f.by.lead.length - 10) + " more" : ""));
        if (f && f.by["case-by-case"].length) row("Sometimes this family, sometimes another: ", f.by["case-by-case"].join(", "));
        if (sn.spelling.length) row("Close spellings in the Atlas's name lists (leads): ", sn.spelling.join(", "));
        if (sn.sounds.length) row("Names that sound alike (leads): ", sn.sounds.join(", "));
        if (f && f.notSame.length) row("Look alike, but a different name: ", f.notSame.slice(0, 6).map(function (x) { return x[0]; }).join(", "));
        box.append(u2);
      }
    }
    return any ? box : null;
  }
  function roleLabel(pe, people) {
    if (pe.role === "self") return pe.rel ? "Your " + pe.rel.replace(/-/g, " ") : "The person you asked about";
    var self = (people || []).filter(function (x) { return x.role === "self"; })[0], who = self && self.given ? self.given + "'s " : "Their ";
    return who + pe.role;
  }

  /* The names panel: how each person's names were written, in the languages of the clerks. A node for the page to place.
     `names` = {people: [{role, rel, name, given, surname, presumed}]}; nothing about a person is in it but the names the visitor typed. */
  function namesBlock(names, base) {
    var box = el("div", null, "lf-names"), any = false;
    base = (base || "/").replace(/\/?$/, "/");
    ((names && names.people) || []).forEach(function (pe, i, all) {
      var inner = personNames(pe.given, pe.surname, base);
      if (!inner) return;
      any = true;
      var d = el("details", null, "lf-person"); if (i === 0) d.open = true;
      var sm = el("summary"); sm.append(el("b", pe.name || roleLabel(pe, all)), el("span", " · " + roleLabel(pe, all) + (pe.presumed ? " (surname assumed the same)" : ""), "lf-filed"));
      d.append(sm, inner); box.append(d);
    });
    if (any) {
      var p = el("p", null, "cap"); p.append("Leads are where to look, not findings. ");
      var a = el("a", "Every spelling in the Atlas →"); a.href = base + "your-name/"; p.append(a); box.append(p);
    }
    return any ? box : null;
  }

  /* The family as told: the parents named above the person, and the visitor below. Each card carries the place and the few forms of the name
     the catalogue holds. Nothing is drawn that the story did not say, and a missing parent is left out, not guessed. */
  function treeBlock(people, rel) {
    var self = (people || []).filter(function (x) { return x.role === "self"; })[0];
    var fa = (people || []).filter(function (x) { return x.role === "father"; })[0], mo = (people || []).filter(function (x) { return x.role === "mother"; })[0];
    if (!self) return null;
    function forms(pe) {
      var out = [];
      if (pe.given && pe.given.groups) pe.given.groups.forEach(function (g) { g.forms.forEach(function (f) { if (out.length < 5 && out.indexOf(f) < 0 && S.fold(f) !== S.fold(pe.given.typed)) out.push(f); }); });
      var sn = pe.surname;
      if (sn && sn.family) sn.family.by.same.concat(sn.family.by.attested, sn.family.by.rule).forEach(function (f) { if (out.length < 8 && out.indexOf(f) < 0 && S.fold(f) !== S.fold(pe.surnameTyped)) out.push(f); });
      return out;
    }
    function card(pe, label) {
      var c = el("div", null, "lf-card lf-card-" + pe.role);
      c.append(el("div", label, "lf-card-role"), el("div", pe.name || "Name not given", "lf-card-name"));
      if (pe.place) c.append(el("div", (pe.role === "self" ? "Born in " : "From ") + (typeof pe.place === "string" ? pe.place : pe.place.word), "lf-card-place"));
      var f = forms(pe); if (f.length) c.append(el("div", "Also written: " + f.join(", "), "lf-card-forms"));
      if (pe.presumed) c.append(el("div", "Surname assumed the same", "lf-card-forms"));
      return c;
    }
    var tree = el("div", null, "lf-tree"), others = (people || []).slice();
    function gen(cls) { var g = el("div", null, "lf-gen " + (cls || "")); tree.append(g); return g; }
    if (fa || mo) { var g1 = gen("lf-parents"); if (fa) g1.append(card(fa, "Father")); if (mo) g1.append(card(mo, "Mother")); tree.append(el("div", null, "lf-tie")); }
    var g2 = gen(); g2.append(card(self, self.rel ? "Your " + self.rel.replace(/-/g, " ") : "The person you asked about"));
    tree.append(el("div", null, "lf-tie"));
    var g3 = gen(), you = el("div", null, "lf-card lf-card-you"); you.append(el("div", "You", "lf-card-role"), el("div", "who is asking", "lf-card-place")); g3.append(you);
    return tree;
  }
  api.namesBlock = namesBlock; api.treeBlock = treeBlock;
  api.createLoader = createLoader; api.createJourney = createJourney; api.el = el;
})();
