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
    var t = String(text || ""), teller = "";
    /* "my name is David" says who is telling, not who the story is about */
    t = t.replace(/\bmy name is\s+([\p{L}'’-]+)(?:\s+([\p{Lu}][\p{L}'’-]+))?/iu, function (m, g, sn) { teller = cased(g) + (sn && /^\p{Lu}/u.test(sn) && !CONNECT.test(sn) && !STOP[S.fold(sn)] && !(ctx.map && ctx.map[S.fold(sn)]) ? " " + cased(sn) : ""); return " "; });
    var out = { rel: "", given: "", surname: "", name: "", holds: "story", left: null, born: null, from: null, to: null };
    out.teller = teller;
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
    /* a name the story gives a person ("my dad is Ivan", "his dad is Giovanni") is a person, never a place, unless a "from"/"in" comes before it */
    var fam = ctx.map ? readFamily(t, ctx) : null, me = ctx.map && !fam ? readMe(t, ctx) : null, nameW = Object.create(null);
    [fam, me].forEach(function (f) { if (f) Object.keys(f.people).forEach(function (k) { var pe = f.people[k]; [pe.given, pe.surname].forEach(function (n) { if (n) nameW[S.fold(n)] = 1; }); }); });
    var rolesFor = cands.map(function (c) {
      var p1 = tokens[c.at - 1] || "", p2 = tokens[c.at - 2] || "", isGiven = !!gset[c.word] || !!nameW[c.word];
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
    if (fam) applyFamily(out, fam, ctx); else if (me) applyMe(out, me, ctx, teller);
    return out;
  }

  /* ---- THE FAMILY AS TOLD ----------------------------------------------------------------------------------------------
     "my father is Ivan from Senj, he moved to Crikvenica then Harare ... he married my mother Cheryl in 1975 in Johannesburg and died in 2026
     in Brisbane. His mother was Hedviga born in London in 1928 and father was Ivan born in Beijing in 1914. His father's father was Anton."
     is a family, not one journey. This reads it sentence by sentence: who each person is (by their path from the teller: "FM" is the father's
     mother), and for each the events told of them: born, died, married, where they started and where they moved, each with the year and place
     it was given with. "his" is the person the story is about; "my" is the teller. Nothing is read that was not said. It stands down (returns
     null) unless two or more people are named, so a one-person story is still read by parseStory alone. */
  var CONNECT = /^(and|or|but|then|so|is|was|are|were|my|his|her|their|our|the|a|an|of|in|to|from|who|that|we|i)$/i;
  var KIN_STEP = { father: "F", dad: "F", mother: "M", mum: "M", mom: "M" };
  var KIN_NOUN = { F: "father", M: "mother" };
  var INTRO = /(?:\b(my|his|her|their)\s+)?\b((?:(?:father|dad|mother|mum|mom)(?:'?s)?\s+)*(?:father|dad|mother|mum|mom))(?:'?s)?\s+(?:name\s+)?(?:was|is|named|called)\s+([\p{L}'’-]+)/giu;
  var EV_BORN = /^(born|birth)$/, EV_DIED = /^(died|dies|passed|deceased|buried|murdered|killed)$/, EV_WED = /^(married|wed|wedded|weds)$/;
  var EV_MOVE = /^(moved|move|went|emigrated|migrated|relocated|settled|came|arrived|lived|living|returned|then|travelled|traveled|sailed|left)$/;
  var EV_CAUSE = /^(frmo|fro|from|due|after|of|with|because)$/;

  function stepsOf(words) {
    return words.split(/\s+/).map(function (w) { w = w.toLowerCase(); if (!KIN_STEP[w]) w = w.replace(/'?s$/, ""); return KIN_STEP[w] || ""; }).join("");
  }
  function chainLabel(rel) { return rel.split("").map(function (c) { return KIN_NOUN[c]; }).join("'s "); }

  /* What one person's stretch of the story says of them. Returns {origin, born:{year,place}, died:{year,place,cause}, married:{year,place,spouse}, moves:[{place,year}]}. */
  function readEvents(text, ctx) {
    var out = { origin: null, born: null, died: null, married: null, moves: [] };
    var ft = S.fold(text).split(" ").filter(Boolean); if (!ft.length) return out;
    var gv = ctx.given ? S.givenIn(text, ctx.given, ctx.skip) : [], gset = Object.create(null); gv.forEach(function (g) { gset[g.word] = 1; });
    var cands = S.candidates(text, ctx.map, ctx.skip), atMap = Object.create(null);
    cands.forEach(function (c) {
      var p1 = ft[c.at - 1] || "", role = PLACE_BEFORE[p1] || "";
      var one = c.word.indexOf(" ") < 0;
      if ((gset[c.word] && !role) || (one && (STOP[c.word] || COMMON[c.word] || REL.test(c.word) || EV_BORN.test(c.word) || EV_DIED.test(c.word) || EV_WED.test(c.word) || EV_MOVE.test(c.word) || EV_CAUSE.test(c.word)))) return;
      atMap[c.at] = c;
    });
    var mode = "origin", pending = null;
    function place(c) { return { row: c.rows[0], alts: c.rows.slice(1, 6), word: c.word }; }
    for (var i = 0; i < ft.length; i++) {
      var tk = ft[i], c = atMap[i];
      if (EV_BORN.test(tk)) { mode = "born"; out.born = out.born || { year: null, place: null }; continue; }
      if (EV_DIED.test(tk)) { mode = "died"; out.died = out.died || { year: null, place: null, cause: "" }; continue; }
      if (EV_WED.test(tk)) { mode = "married"; out.married = out.married || { year: null, place: null, spouse: "" }; continue; }
      if (EV_MOVE.test(tk) && !c) { if (mode !== "move") { mode = "move"; pending = null; } continue; }
      if (mode === "died" && EV_CAUSE.test(tk) && (out.died.place || out.died.year != null)) { out.died.cause = ft.slice(i + 1).join(" "); break; }
      if (/^(1[4-9][0-9]{2}|20[0-2][0-9])$/.test(tk)) {
        var y = Number(tk);
        if (mode === "born") out.born.year = y; else if (mode === "died") out.died.year = y; else if (mode === "married") out.married.year = y;
        else if (mode === "move") { if (out.moves.length && out.moves[out.moves.length - 1].year == null) out.moves[out.moves.length - 1].year = y; else pending = y; }
        continue;
      }
      if (!c) continue;
      var pl = place(c); i += c.word.split(" ").length - 1;
      if (mode === "born") { if (!out.born.place) out.born.place = pl; }
      else if (mode === "died") { if (!out.died.place) out.died.place = pl; }
      else if (mode === "married") { if (!out.married.place) out.married.place = pl; }
      else if (mode === "move") { out.moves.push({ place: pl, year: pending }); pending = null; }
      else if (!out.origin) out.origin = pl;
    }
    if (out.married) {
      var sm = /\bmarried\s+(?:my\s+)?(?:(?:other|mother|mum|mom|wife)\s+)?([\p{L}'’-]{2,})(?:\s+([\p{Lu}][\p{L}'’-]+))?/iu.exec(text);
      if (sm && !/^(in|on|at|a|the|her|him|and)$/i.test(sm[1])) out.married.spouse = cased(sm[1]) + (sm[2] && /^[\p{Lu}]/u.test(sm[2]) && !STOP[S.fold(sm[2])] && !COMMON[S.fold(sm[2])] && !(ctx.map && ctx.map[S.fold(sm[2])]) ? " " + cased(sm[2]) : "");
    }
    return out;
  }

  function readFamily(t, ctx) {
    var people = Object.create(null), order = [], subject = null, cur = null;
    function person(key, name) {
      var p = people[key];
      if (!p) { p = people[key] = { key: key, name: "", given: "", surname: "", text: "", chunks: [] }; order.push(key); }
      if (name && !p.name) {
        var parts = name.split(/\s+/); p.name = cased(parts[0]); p.given = p.name; if (parts[1]) { p.surname = cased(parts[1]); p.name += " " + p.surname; }
      }
      return p;
    }
    String(t || "").split(/[.!?]+(?:\s+|$)|\n+/).forEach(function (sent) {
      if (!sent.trim()) return;
      var re = new RegExp(INTRO.source, "giu"), ms = [], m;
      while ((m = re.exec(sent))) ms.push({ at: m.index, end: m.index + m[0].length, poss: (m[1] || "").toLowerCase(), steps: stepsOf(m[2]), name: m[3] });
      if (!ms.length) { if (cur) people[cur].chunks.push(sent); return; }
      if (cur && ms[0].at > 0) people[cur].chunks.push(sent.slice(0, ms[0].at));
      ms.forEach(function (x, i) {
        if (!x.steps || /^(a|the|an|my|his|her|their|not|also|now)$/i.test(x.name)) return;
        var base = x.poss === "my" || !subject ? "" : subject, key = base + x.steps;
        if (!subject) { if (x.poss !== "my" || x.steps.length !== 1) return; subject = key; }
        var rest = sent.slice(x.end, i + 1 < ms.length ? ms[i + 1].at : sent.length), nm = x.name;
        var sx = /^\s+([\p{Lu}][\p{L}'’-]{2,})(?=\s|,|$)/u.exec(rest);
        if (sx && !STOP[S.fold(sx[1])] && !COMMON[S.fold(sx[1])] && !(ctx.map && ctx.map[S.fold(sx[1])]) && !(ctx.given && ctx.given[S.fold(sx[1])])) { nm += " " + sx[1]; rest = rest.slice(sx[0].length); }
        var pk = (subject === "F" && key === "M") || (subject === "M" && key === "F") ? "S" : key;
        var p = person(pk, nm); p.chunks.push(rest); cur = pk;
      });
    });
    if (!subject || order.length < 2) return null;
    /* each stretch is read on its own: the place finder names a word once per text, and a town may be told twice ("then Johannesburg ... married in Johannesburg") */
    order.forEach(function (k) {
      var all = { origin: null, born: null, died: null, married: null, moves: [] };
      people[k].chunks.forEach(function (c) {
        var e = readEvents(c, ctx);
        all.origin = all.origin || e.origin; all.born = all.born || e.born; all.died = all.died || e.died; all.married = all.married || e.married; all.moves = all.moves.concat(e.moves);
      });
      people[k].ev = all;
    });
    /* the subject's own married clause names the spouse when no sentence did ("he married my mother Cheryl") */
    var sp = people[subject].ev.married;
    if (sp && sp.spouse && !people.S) { var s2 = person("S", sp.spouse); s2.ev = readEvents("", ctx); s2.ev.married = { year: sp.year, place: sp.place, spouse: "" }; }
    else if (sp && people.S && !people.S.ev.married) people.S.ev.married = { year: sp.year, place: sp.place, spouse: "" };
    return { people: people, order: order, subject: subject };
  }

  /* ---- THE TELLER'S OWN FAMILY ---------------------------------------------------------------------------------------------
     "I have two children, Alessio and Mateo, both born in Brisbane. My mum is from Argentina and my dad from Senj, Croatia. They were
     married in Johannesburg." is a family told from the middle: the teller, the children, and two parents who need no name to be on the
     tree. Keys: ME is the teller, F and M the parents, S a partner, C1, C2 ... the children. Only what was said is read. */
  var CHILD_LIST = /\b(?:i|we)\s+have\s+(?:(?:two|three|four|five|six|\d)\s+)?(?:children|kids|sons|daughters|boys|girls)\b\s*[,:]?\s*(?:named|called)?\s*([^.;]*)/i;
  var CHILD_LIST2 = /\bmy\s+(?:children|kids|sons|daughters)\s+(?:are|were)\s+(?:named\s+|called\s+)?([^.;]*)/i;
  var NOT_NAME = /^(both|all|born|from|in|who|they|are|were|is|was|aged|each|and|also|then|now|the|a|an|of|to|my|his|her|their|our)$/i;
  function readMe(t, ctx) {
    var P = Object.create(null), order = [], nKids = 0, nGrand = 0;
    function person(key, name) {
      var p = P[key];
      if (!p) { p = P[key] = { key: key, name: "", given: "", surname: "", ev: { origin: null, born: null, died: null, married: null, moves: [] } }; order.push(key); }
      if (name && !p.name) { p.name = cased(name); p.given = p.name; }
      return p;
    }
    function okName(w) { var f = S.fold(w); return w && /^[\p{L}'’-]{2,}$/u.test(w) && !NOT_NAME.test(w) && !STOP[f] && !COMMON[f] && !CONNECT.test(w) && !EV_BORN.test(f) && !EV_MOVE.test(f); }
    function merge(p, e) { var o = p.ev; o.origin = o.origin || e.origin; o.born = o.born || e.born; o.died = o.died || e.died; o.married = o.married || e.married; o.moves = o.moves.concat(e.moves); }
    var sents = String(t || "").split(/[.!?]+(?:\s+|$)|\n+/), parentsWed = null;
    sents.forEach(function (sent) {
      if (!sent.trim()) return;
      var cm = CHILD_LIST.exec(sent) || CHILD_LIST2.exec(sent), kids = [];
      if (cm) {
        cm[1].replace(/,\s*(?:both|all|who|and they|they|each)\b.*$/i, "").split(/\s*,\s*|\s+and\s+|\s*&\s*/i).forEach(function (piece) {
          var w = piece.trim().split(/\s+/)[0]; if (okName(w) && kids.length < 8) kids.push(person("C" + (++nKids), w));
        });
        if (kids.length) {
          var lastAt = sent.toLowerCase().lastIndexOf(kids[kids.length - 1].name.toLowerCase()), tail = sent.slice(lastAt + kids[kids.length - 1].name.length);
          var ke = readEvents(tail, ctx); kids.forEach(function (k) { merge(k, ke); });
        }
      }
      /* "my son Alessio", "my daughter Mateo" */
      var sre = /\bmy\s+(?:son|daughter|child)\s+(?:is\s+|named\s+|called\s+)?([\p{L}'’-]+)([^.;]*)/giu, sm;
      while ((sm = sre.exec(sent))) if (okName(sm[1])) { var k1 = person("C" + (++nKids), sm[1]); merge(k1, readEvents(sm[2], ctx)); kids.push(k1); }
      /* "Alessio was born in Brisbane in 2010" about a child already named */
      if (!cm) order.filter(function (k) { return /^C/.test(k); }).forEach(function (k) {
        var nm = P[k].name, at = nm ? S.fold(sent).split(" ").indexOf(S.fold(nm)) : -1;
        if (at > -1) { var after = sent.split(/\s+/).slice(at + 1).join(" "); merge(P[k], readEvents(after, ctx)); }
      });
      /* the parents, named or not */
      var re = /\bmy\s+(mother|mum|mom|father|dad)\b/gi, ms = [], m;
      while ((m = re.exec(sent))) ms.push({ at: m.index, end: m.index + m[0].length, key: KIN_STEP[m[1].toLowerCase()] });
      ms.forEach(function (x, i) {
        var rest = sent.slice(x.end, i + 1 < ms.length ? ms[i + 1].at : sent.length), nm = /^\s+(?:name\s+)?(?:is|was|named|called)\s+([\p{L}'’-]+)/iu.exec(rest), p = person(x.key, "");
        if (nm && okName(nm[1])) { person(x.key, nm[1]); rest = rest.slice(nm[0].length); }
        else if (nm) rest = rest.slice(nm[0].length - nm[1].length);
        merge(p, readEvents(rest, ctx));
      });
      /* "my grandfather lived in Crikvenica in 1990" (which side is not said, so none is guessed) */
      var gre = /\bmy\s+(gran\w*\s*(?:f[ae]\w*|dad|pa|pop\w*)|gran\w*\s*(?:mo\w*|ma|mum|nan\w*)|grand\w*)\b([^.;]*)/gi, gm;
      while ((gm = gre.exec(sent))) {
        var gmale = /^gran\w*\s*(?:f[ae]|dad|pa|pop)/i.test(gm[1]), gp = person("G" + (++nGrand), ""), grest = gm[2], gnm = /^\s+(?:is|was|named|called)\s+([\p{L}'’-]+)/iu.exec(grest);
        gp.sex = gmale ? "M" : "F";
        if (gnm && okName(gnm[1])) { person(gp.key, gnm[1]); grest = grest.slice(gnm[0].length); } else if (gnm) grest = grest.slice(gnm[0].length - gnm[1].length);
        merge(gp, readEvents(grest, ctx));
      }
      if (/\b(?:they|my\s+parents|my\s+(?:mum|mom|mother)\s+and\s+(?:dad|father))\b[^.]*\b(?:married|wed|wedded)\b/i.test(sent) && !/\b(?:i|we)\s+(?:got\s+)?married\b/i.test(sent)) parentsWed = readEvents(sent, ctx).married || null;
      var pm = /\bmy\s+(?:wife|husband|partner)\s+(?:is\s+|named\s+|called\s+)?([\p{L}'’-]+)/iu.exec(sent);
      if (pm && okName(pm[1])) person("S", pm[1]);
      var bm = /\b(?:i|I)\s+(?:was|am)\s+born\b(.*)$/i.exec(sent);
      if (bm) merge(person("ME", ""), readEvents("born " + bm[1], ctx));
    });
    if (parentsWed) ["F", "M"].forEach(function (k) { var p = person(k, ""); p.ev.married = p.ev.married || { year: parentsWed.year, place: parentsWed.place, spouse: "" }; });
    var kinCount = order.filter(function (k) { return k !== "ME" && k !== "S"; }).length;
    if (kinCount < 2 && !(kinCount === 1 && order.length > 2)) return null;
    person("ME", "");
    return { people: P, order: order, subject: "ME" };
  }

  /* Fold readMe into the parse: the people (named or not), and the lines each of them travels. The teller's own route is not told, so none is
     drawn for them; the parents and children each get their pins. */
  function applyMe(out, me, ctx, teller) {
    var P = me.people;
    function evOf(pe) {
      var e = pe.ev, list = [];
      if (e.born && (e.born.year != null || e.born.place)) list.push({ type: "born", year: e.born.year, place: e.born.place });
      if (e.married && (e.married.year != null || e.married.place)) list.push({ type: "married", year: e.married.year, place: e.married.place });
      if (e.died && (e.died.year != null || e.died.place)) list.push({ type: "died", year: e.died.year, place: e.died.place, cause: e.died.cause });
      return list;
    }
    var gname = teller ? teller.split(" ")[0] : "";
    var people = [], kin = [];
    function put(key, role, label) {
      var pe = P[key]; if (!pe) return;
      var place = pe.ev.born && pe.ev.born.place ? pe.ev.born.place : pe.ev.origin;
      people.push({ role: role, rel: "", name: key === "ME" ? teller : pe.name, given: key === "ME" ? gname : pe.given, surname: key === "ME" ? teller.split(" ").slice(1).join(" ") : pe.surname,
        givenWord: key === "ME" ? gname : pe.given, place: place || null, presumed: false, label: label, events: evOf(pe), key: key, me: key === "ME", unnamed: !(pe.name || (key === "ME" && teller)) });
      if (key === "ME") return;
      var st = [], e = pe.ev;
      if (e.born && e.born.place) st.push({ row: e.born.place.row, alts: e.born.place.alts, word: e.born.place.word, role: "born", year: e.born.year, approx: false });
      else if (e.origin) st.push({ row: e.origin.row, alts: e.origin.alts, word: e.origin.word, role: "origin", year: null, approx: false });
      if (e.married && e.married.place && (key === "F" || key === "M")) st.push({ row: e.married.place.row, alts: e.married.place.alts, word: e.married.place.word, role: "married", year: e.married.year, approx: false });
      e.moves.forEach(function (mv) { st.push({ row: mv.place.row, alts: mv.place.alts, word: mv.place.word, role: "move", year: mv.year, approx: false }); });
      if (st.length) kin.push({ key: key, name: pe.name, label: label, stops: st });
    }
    put("ME", "self", "");
    put("F", "father", "your father"); put("M", "mother", "your mother"); put("S", "spouse", "your partner");
    me.order.filter(function (k) { return /^G/.test(k); }).forEach(function (k) { put(k, P[k].sex === "M" ? "grandfather" : "grandmother", P[k].sex === "M" ? "your grandfather" : "your grandmother"); });
    me.order.filter(function (k) { return /^C/.test(k); }).forEach(function (k) { put(k, "child", "your child"); });
    out.people = people; out.kin = kin;
    out.name = teller || ""; out.givenWord = gname; out.surname = ""; out.given = ""; out.rel = "";
    out.stops = []; out.route = []; out.from = null; out.to = null; out.noRoute = true; out.born = null; out.left = null;
    return out;
  }

  /* Fold what readFamily found into the parse: the subject's route with years (told ones kept, the rest worked out and marked "about"),
     the people with their dated events, and the lines the ancestors travel, so the journey can play them. */
  function applyFamily(out, fam, ctx) {
    var P = fam.people, sk = fam.subject, me = P[sk], ev = me.ev;
    function year(pe) { return pe && pe.ev && pe.ev.born && pe.ev.born.year != null ? pe.ev.born.year : null; }
    var rs = [];
    function add(pl, role, yr) { if (pl) rs.push({ row: pl.row, alts: pl.alts, word: pl.word, role: role, age: null, year: yr == null ? null : yr, approx: false, told: yr != null }); }
    if (ev.born && ev.born.place) add(ev.born.place, "born", ev.born.year);
    if (ev.origin && !(rs[0] && rs[0].row.i === ev.origin.row.i)) add(ev.origin, rs.length ? "move" : "origin");
    ev.moves.forEach(function (mv) { if (rs.length && rs[rs.length - 1].row.i === mv.place.row.i) return; add(mv.place, "move", mv.year); });
    var endYear = ev.died && ev.died.year != null ? ev.died.year : null;
    function stopFor(pl) { for (var i = 0; i < rs.length; i++) if (pl && rs[i].row.i === pl.row.i) return rs[i]; return null; }
    var stopEv = [];
    if (ev.married) { var ms = stopFor(ev.married.place); if (ms) { if (ev.married.year != null && ms.year == null) { ms.year = ev.married.year; ms.told = true; } (ms.ev = ms.ev || []).push({ type: "married", year: ev.married.year }); } }
    if (ev.died) { var dsx = stopFor(ev.died.place); if (!dsx && ev.died.place) { add(ev.died.place, "move", null); dsx = rs[rs.length - 1]; } if (dsx) (dsx.ev = dsx.ev || []).push({ type: "died", year: ev.died.year, cause: ev.died.cause || "" }); }
    var kids = rs.length;
    /* when was he born: told, else worked out from the mother, the father, or the marriage, and said to be about */
    var born = ev.born && ev.born.year != null ? ev.born.year : null, bornApprox = false;
    if (born == null) {
      var my = year(P[sk + "M"]), fy = year(P[sk + "F"]);
      born = my != null ? my + 26 : fy != null ? fy + 30 : ev.married && ev.married.year != null ? ev.married.year - 26 : null; bornApprox = born != null;
    }
    if (born != null && rs.length) {
      if (rs[0].year == null) { rs[0].year = born; rs[0].approx = bornApprox; }
      var known = [];
      rs.forEach(function (x, i) { if (x.year != null) known.push(i); });
      for (var a = 0; a < known.length - 1; a++) {
        var i0 = known[a], i1 = known[a + 1];
        for (var k = i0 + 1; k < i1; k++) { rs[k].year = Math.round(rs[i0].year + (rs[i1].year - rs[i0].year) * (k - i0) / (i1 - i0)); rs[k].approx = true; }
      }
      var last = known[known.length - 1], tail = rs.length - 1 - last;
      for (var j = 1; j <= tail; j++) { rs[last + j].year = endYear != null && endYear > rs[last].year ? Math.round(rs[last].year + (endYear - rs[last].year) * j / (tail + 1)) : rs[last].year + 5 * j; rs[last + j].approx = true; }
      rs.forEach(function (x) { x.yearTold = !!x.told; x.age = x.year - born; if (bornApprox || x.approx) x.approx = true; if (x.told && !(bornApprox && x.age != null)) x.approx = false; x.age = Math.max(0, x.age); });
      rs[0].age = rs[0].told || !bornApprox ? 0 : 0;
    }
    if (rs.length) {
      out.stops = rs; out.route = rs;
      out.from = { row: rs[0].row, alts: rs[0].alts, word: rs[0].word };
      out.to = rs.length > 1 ? { row: rs[rs.length - 1].row, alts: rs[rs.length - 1].alts, word: rs[rs.length - 1].word } : null;
      out.born = born; out.bornApprox = bornApprox; out.left = rs.length > 1 && rs[1].year != null ? rs[1].year : out.left; out.endYear = endYear;
    }
    /* the people */
    function lab(key) { var rel = key.slice(sk.length); return key === "S" ? (sk === "F" ? "wife" : "husband") : key.indexOf(sk) === 0 && rel ? chainLabel(rel) : ""; }
    function evOf(pe) {
      var e = pe.ev, list = [];
      if (e.born && (e.born.year != null || e.born.place)) list.push({ type: "born", year: e.born.year, place: e.born.place });
      if (e.married && (e.married.year != null || e.married.place)) list.push({ type: "married", year: e.married.year, place: e.married.place });
      if (e.died && (e.died.year != null || e.died.place)) list.push({ type: "died", year: e.died.year, place: e.died.place, cause: e.died.cause });
      return list;
    }
    var people = [], seen = Object.create(null);
    function put(key, role, rel) {
      var pe = P[key]; if (!pe || seen[key]) return; seen[key] = 1;
      var place = key === sk ? rs[0] : pe.ev.born && pe.ev.born.place ? pe.ev.born.place : pe.ev.origin;
      people.push({ role: role, rel: rel || "", name: pe.name, given: pe.given, surname: pe.surname, givenWord: pe.given, place: place || null, presumed: false, label: key === sk ? "" : lab(key), events: evOf(pe), key: key });
    }
    put(sk, "self", out.rel || KIN_NOUN[sk]);
    put(sk + "F", "father"); put(sk + "M", "mother");
    Object.keys(P).sort(function (x, y) { return x.length - y.length || (x < y ? -1 : 1); }).forEach(function (k) {
      if (k === "S") put(k, "spouse"); else if (k.indexOf(sk) === 0 && k.length - sk.length >= 2) put(k, KIN_NOUN[k.slice(-1)] === "father" ? "grandfather" : "grandmother");
    });
    out.people = people;
    if (me.name) { out.name = me.name; out.givenWord = me.given; out.surname = me.surname; var gg = ctx.given ? S.givenIn(me.given, ctx.given, ctx.skip) : []; out.given = gg.length ? gg[0].row.canon : me.given; }
    out.rel = out.rel || KIN_NOUN[sk];
    /* the lines the others travel: where they were born, then where they moved, each at its year when it was given */
    var kin = [];
    Object.keys(P).forEach(function (k) {
      if (k === sk || k === "S") return;
      var pe = P[k], e = pe.ev, st = [];
      if (e.born && e.born.place) st.push({ row: e.born.place.row, alts: e.born.place.alts, word: e.born.place.word, role: "born", year: e.born.year, approx: false });
      else if (e.origin) st.push({ row: e.origin.row, alts: e.origin.alts, word: e.origin.word, role: "origin", year: null, approx: false });
      e.moves.forEach(function (mv) { st.push({ row: mv.place.row, alts: mv.place.alts, word: mv.place.word, role: "move", year: mv.year, approx: false }); });
      if (st.length) kin.push({ key: k, name: pe.name, label: (lab(k) ? cased(P[sk].given || "His") + "'s " + lab(k) : "") , stops: st });
    });
    out.kin = kin;
    return out;
  }

  /* The line a research family is kept under: the surname when the story gave one, else the place they started. */
  function familyName(f) {
    var parts = String(f.name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : (f.from ? f.from.name : "Research");
  }

  /* Turn a plan into a research family: a line named for the surname (or the place), with the volumes and sources the plan lists marked
     as planned. P is window.raProgress. Returns {slug, name, added}; nothing is sent anywhere, the marks stay in this browser. */
  function startFamily(P, facts, plan, opts) {
    opts = opts || {};
    var name = String(opts.name || "").trim().slice(0, 60) || familyName(facts);
    var where = facts.from ? facts.from.name : "";
    /* opts.line: add to a research family that already exists instead of starting one */
    var have = opts.line ? P.lines().filter(function (l) { return l.slug === opts.line; })[0] : null;
    var slug = have ? have.slug : P.addLine(name, where), added = 0;
    if (have) { name = have.name; P.setActive(slug); }
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
      var route = parsed.noRoute ? [] : parsed.route && parsed.route.length ? parsed.route : [parsed.from, parsed.to].filter(Boolean).map(function (x, i) { return { row: x.row, alts: x.alts || [], word: x.word, role: i ? "move" : "origin", age: null, year: null, approx: false }; });
      if (!parsed.people && (parsed.name || parsed.given)) parsed = Object.assign({}, parsed, { people: [{ role: "self", rel: parsed.rel, name: parsed.name, given: parsed.givenWord || parsed.given, surname: parsed.surname }] });
      var anc = (parsed.stops || []).filter(function (x) { return /-from$/.test(x.role); });
      var rowsNeeded = [], seenRow = Object.create(null);
      function need(row) { if (row && !seenRow[row.i]) { seenRow[row.i] = 1; rowsNeeded.push(row); } }
      if (parsed.from) need(parsed.from.row); if (parsed.to) need(parsed.to.row);
      route.forEach(function (x) { need(x.row); }); anc.forEach(function (x) { need(x.row); });
      (parsed.kin || []).forEach(function (k) { k.stops.forEach(function (x) { need(x.row); }); });
      (parsed.people || []).forEach(function (pe) { (pe.events || []).forEach(function (e) { if (e.place) need(e.place.row); }); });
      return load().then(function () {
        var people = (parsed.people || []).filter(function (x) { return x.given || x.surname || x.me || x.unnamed; });
        return Promise.all([Promise.all(rowsNeeded.map(function (r) { return placeInfo(r); })),
          getJSON("providers.json").catch(function () { return { providers: [] }; }), getJSON("mortality.json").catch(function () { return null; }),
          getJSON("flag-map.json").catch(function () { return null; }), getJSON("leaders.json").catch(function () { return null; }),
          Promise.all(people.map(function (pe) { return pe.surname ? surname(pe.surname).catch(function () { return null; }) : Promise.resolve(null); })), Promise.resolve(people)]);
      }).then(function (r) {
        var infos = Object.create(null); r[0].forEach(function (i) { infos[i.row.i] = i; });
        var provs = r[1].providers || [], pname = Object.create(null), fm = r[3] && r[3].f, lead = r[4] && r[4].countries;
        provs.forEach(function (x) { pname[x.id] = x.name; });
        r[0].forEach(function (i) { i.provs = provs.filter(function (x) { return (x.countries || []).indexOf(i.cc) > -1; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); i.pname = pname; i.world = provs.filter(function (x) { return (x.countries || []).indexOf("*") > -1; }); i.flagRows = fm ? fm[String(i.cc || "").toUpperCase()] : null; i.leaders = lead ? lead[String(i.cc || "").toUpperCase()] : null; });
        var from = parsed.from ? infos[parsed.from.row.i] : null, to = parsed.to ? infos[parsed.to.row.i] : null;
        var facts = { rel: parsed.rel, name: parsed.name, holds: parsed.holds, holdsAll: parsed.holdsAll, left: parsed.left, born: parsed.born, from: from, to: to, base: BASE,
          providers: to ? provs.filter(function (p) { return (p.countries || []).indexOf(to.cc) > -1; }) : (from ? provs.filter(function (p) { return (p.countries || []).indexOf(from.cc) > -1; }) : []),
          given: parsed.given && data.given ? S.givenIn(parsed.givenWord || parsed.given, data.given, null) : [],
          route: route.map(function (x) { return { info: infos[x.row.i], age: x.age, year: x.year, approx: x.approx, yearTold: x.yearTold, role: x.role, country: x.country, ev: x.ev }; }),
          bornApprox: !!parsed.bornApprox, endYear: parsed.endYear != null ? parsed.endYear : null,
          kin: (parsed.kin || []).map(function (k) { return { key: k.key, name: k.name, label: k.label, stops: k.stops.filter(function (x) { return infos[x.row.i]; }).map(function (x) { return { info: infos[x.row.i], year: x.year, role: x.role }; }) }; }).filter(function (k) { return k.stops.length; }),
          ancestors: anc.map(function (x) { return { info: infos[x.row.i], who: x.role === "mother-from" ? "mother" : "father" }; }) };
        var labels = {}; (data.languages || []).forEach(function (l) { labels[l.key] = l.label; });
        var out = r[6].map(function (pe, i) {
          var gr = pe.given && data.given ? S.givenIn(pe.given, data.given, null) : [];
          return { role: pe.role, rel: pe.rel, name: pe.name, given: gr.length ? { canon: gr[0].row.canon, typed: pe.given, groups: givenGroups(gr[0].row, labels) } : (pe.given ? { canon: "", typed: pe.given, groups: [] } : null),
            surname: r[5][i], surnameTyped: pe.surname, presumed: !!pe.presumed, me: !!pe.me, key: pe.key, place: pe.place && infos[pe.place.row.i] ? infos[pe.place.row.i].name : "", label: pe.label || "",
            events: (pe.events || []).map(function (e) { var inf = e.place && infos[e.place.row.i]; return { type: e.type, year: e.year, place: inf ? inf.name : (e.place ? e.place.word : ""), country: inf ? inf.countryName : "", cause: e.cause || "" }; }) };
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
    function clear() { if (stopPlay) stopPlay(); if (layers) { if (layers.map && layers.tidy) layers.map.off("moveend zoomend", layers.tidy); layers.group.remove(); layers = null; } if (askEl) askEl.hidden = true; }

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
      /* the others in the family who travel too: each pin appears at its year, so the story plays the ancestry first, then the person's own journey */
      var kin = (f.kin || []).map(function (k) { return { name: k.name, label: k.label, stops: k.stops.filter(function (x) { return x.info; }) }; }).filter(function (k) { return k.stops.length; }), kinMarks = [];
      var legs = [], stopMarks = [];
      function kinTag(k) { return ((k.label ? k.label + " " : "") + (k.name || "")).trim() || "Family"; }
      var can = stops.length > 0 && tl.mode !== "none" && (stops.length > 1 || tl.mode === "year");
      if (E.time) E.time.hidden = !can;
      if (E.mapBox) E.mapBox.hidden = !(stops.length || anc.length || kin.length);
      E.moments.textContent = ""; E.cap.textContent = "";
      TYPE = (mort && mort.types) || {};
      if (!askEl && (o.askBox || E.cap.parentNode)) { askEl = el("form", null, "lf-askyear"); askEl.hidden = true; if (o.askBox) o.askBox.append(askEl); else E.cap.parentNode.insertBefore(askEl, E.cap); }
      if (askEl) {
        askEl.textContent = ""; askEl.hidden = tl.mode !== "age";
        if (tl.mode === "age") {
          var inp = el("input"); inp.type = "text"; inp.inputMode = "numeric"; inp.maxLength = 4; inp.placeholder = "e.g. 1920"; inp.setAttribute("aria-label", "The year they were born, about");
          var go = el("button", "Show the years"); go.type = "submit";
          askEl.append(el("label", "Do you know about what year they were born? "), inp, go, el("span", " Their ages are used until you do.", "lf-filed"));
          askEl.onsubmit = function (ev) { ev.preventDefault(); var y = toYear(inp.value); if (y != null && o.onBorn) o.onBorn(y); else inp.setCustomValidity && inp.focus(); };
        }
      }
      if (!stops.length && !anc.length && !kin.length) { E.cap.textContent = "Say where they started and where they arrived to see the journey."; return Promise.resolve(); }
      var t0 = null, t1 = null;
      if (can) {
        t0 = stops[0].t; t1 = stops[stops.length - 1].t + (tl.mode === "age" ? 4 : 10);
        if (tl.mode === "year") {
          t1 = Math.min(t1, YEAR_MAX); if (tl.left != null) t1 = Math.min(tl.left + 12, YEAR_MAX);
          var ky = []; kin.forEach(function (k) { k.stops.forEach(function (x) { if (x.year != null) ky.push(x.year); }); });
          if (ky.length) t0 = Math.min(t0, Math.min.apply(null, ky));
          if (f.endYear != null) t1 = Math.min(f.endYear + 1, YEAR_MAX);
        }
      }
      var evFor = [];
      stops.concat(anc).forEach(function (st) { var inf = st.info; if (!inf.__ev) inf.__ev = null; });
      kin.forEach(function (k) { k.stops.forEach(function (st) { st.info.__ev = st.info.__ev || null; }); });
      function evs(info) { return tl.mode === "year" && t0 != null ? evHere(mort, info, t0, t1) : []; }
      var evMap = new Map(); stops.concat(anc).forEach(function (st) { if (!evMap.has(st.info)) evMap.set(st.info, evs(st.info)); });
      kin.forEach(function (k) { k.stops.forEach(function (st) { if (!evMap.has(st.info)) evMap.set(st.info, evs(st.info)); }); });

      function setT(t) {
        E.cap.textContent = "";
        var at = stops.length ? along(stops, t) : { idx: 0, pt: null, moving: false }, cur = stops[at.idx];
        var begun = !stops.length || tl.mode !== "year" || t >= stops[0].t;   /* before the person's own first place, only the family before them is on the map */
        legs.forEach(function (lg) {
          if (tl.mode === "year" && t >= lg.t0 && t < lg.t1) E.cap.append(line(lg.k.stops[0].info, t, evMap.get(lg.k.stops[0].info), kinTag(lg.k) + ", on the way to " + lg.to.name + " (the route was not told; this is a straight line), ", ""));
        });
        kin.forEach(function (k) {
          var cs = null; k.stops.forEach(function (x) { if (x.year == null || x.year <= t) cs = x; });
          if (legs.some(function (lg) { return lg.k === k && t >= lg.t0 && t < lg.t1; })) return;
          if (cs && tl.mode === "year") E.cap.append(line(cs.info, t, evMap.get(cs.info), kinTag(k) + ", ", cs.role === "born" && cs.year != null ? "born here in " + cs.year : cs.role === "origin" ? "from here" : ""));
        });
        if (cur && begun) {
          var ye = tl.mode === "year" ? t : null;
          E.cap.append(line(cur.info, ye, evMap.get(cur.info), at.moving ? "On the way from " : "", tl.mode === "age" ? "age " + t : (f.born != null ? "age " + (t - f.born) : "")));
          if (at.moving && stops[at.idx + 1]) E.cap.append(el("div", "…to " + stops[at.idx + 1].info.name + (stops[at.idx + 1].age != null ? " (" + ageWord(stops[at.idx + 1]) + ")" : ""), "lf-filed"));
        }
        anc.forEach(function (x) { E.cap.append(line(x.info, tl.mode === "year" ? t : null, evMap.get(x.info), "His " + x.who + "'s family, ", "")); });
        if (E.slider) E.slider.value = String(t);
        if (E.yearOut) E.yearOut.textContent = tl.mode === "age" ? "age " + t : String(t);
        if (E.slider) E.slider.setAttribute("aria-valuetext", (tl.mode === "age" ? "age " : "") + t + (cur ? ". " + (at.moving ? "On the way" : "At " + cur.info.name) : ""));
        legs.forEach(function (lg) {
          var kk = Math.min(1, Math.max(0, (t - lg.t0) / Math.max(1, lg.t1 - lg.t0))), pt = between(lg.a, lg.b, kk), on = t >= lg.t0;
          lg.dot.setLatLng(pt); lg.dot.setStyle({ opacity: on ? 1 : 0, fillOpacity: on ? 1 : 0 }); lg.line.setStyle({ opacity: on ? .55 : .12 });
        });
        stopMarks.forEach(function (m) { var on = m.t == null || t >= m.t, tp = m.ly.getTooltip(); m.ly.setStyle({ opacity: on ? 1 : .3, fillOpacity: on ? 1 : .3 }); if (tp && tp.setOpacity) tp.setOpacity(on ? 1 : .35); });
        kinMarks.forEach(function (m) { var on = m.t == null || t >= m.t, tp = m.ly.getTooltip(); m.ly.setStyle({ opacity: on ? 1 : .3, fillOpacity: on ? 1 : .3 }); if (tp && tp.setOpacity) tp.setOpacity(on ? 1 : .35); });
        if (layers && layers.dot) layers.dot.setStyle({ opacity: begun ? 1 : 0, fillOpacity: begun ? 1 : 0 });
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
        if (!E.hearsOthers && typeof document !== "undefined") { E.hearsOthers = true; document.addEventListener("ra-playback", function (e) { if (e.detail && e.detail.who !== "story" && stopPlay) stopPlay(); }); }
        if (E.play) {
          E.play.hidden = reduce;
          E.play.onclick = function () {
            if (raf) { stopPlay(); return; }
            try { document.dispatchEvent(new CustomEvent("ra-playback", { detail: { who: "story" } })); } catch (e) { /* not in a page */ }
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
        var L = m.L, map = m.map, pts = [];
        function tipOf(label, name) { var n = el("span", null, "lf-tipin"); n.append(el("b", label), el("span", name)); return n; }
        try { map.getCenter(); } catch (e) { map.setView([30, 0], 2, { animate: false }); } /* a new map has no view yet: flyTo needs one, and drawn pins are projected from it */
        map.invalidateSize({ animate: false });
        var g = L.layerGroup().addTo(map);
        stops.forEach(function (st, i) {
          var info = st.info; if (info.lat == null) return;
          var first = i === 0, last = i === stops.length - 1 && stops.length > 1;
          var label = first ? (st.role === "born" ? "Born" : "Started") : (st.age != null ? (st.approx ? "About age " : "Age ") + st.age : last ? "Arrived" : "Then");
          var sly = L.circleMarker([info.lat, info.lon], { radius: 8, weight: 3, color: "#fff", fillColor: first ? "#b3452e" : "#1f5c6b", fillOpacity: 1 })
            .bindTooltip(tipOf(label, info.name), { permanent: true, direction: "right", offset: [6, 0], className: "lf-tip" }).addTo(g);
          if (tl.mode === "year" && kin.length) stopMarks.push({ ly: sly, t: st.t });
          pts.push([info.lat, info.lon]);
        });
        anc.forEach(function (x) {
          var info = x.info; if (info.lat == null) return;
          L.circleMarker([info.lat, info.lon], { radius: 6, weight: 2, color: "#7a7a7a", fillColor: "#fff", fillOpacity: 1, dashArray: "2 3" })
            .bindTooltip(tipOf("His " + x.who + "'s family", info.name), { permanent: true, direction: "right", offset: [4, 0], className: "lf-tip lf-tip-anc" }).addTo(g);
          pts.push([info.lat, info.lon]);
        });
        kin.forEach(function (k) {
          var kp = [];
          k.stops.forEach(function (st) {
            var info = st.info; if (info.lat == null) return;
            var ly = L.circleMarker([info.lat, info.lon], { radius: 6, weight: 2, color: "#7a7a7a", fillColor: "#fff", fillOpacity: 1, dashArray: "2 3" })
              .bindTooltip(tipOf(kinTag(k) + (st.role === "born" ? ", born" : st.role === "origin" ? ", from" : ""), info.name + (st.year != null ? " " + st.year : "")), { permanent: true, direction: "right", offset: [4, 0], className: "lf-tip lf-tip-anc" }).addTo(g);
            kinMarks.push({ ly: ly, t: st.year }); kp.push([info.lat, info.lon]); pts.push([info.lat, info.lon]);
          });
          if (kp.length > 1) L.polyline(kp, { color: "#7a7a7a", weight: 1.5, dashArray: "2 5", opacity: .6 }).addTo(g);
        });
        /* A parent whose only place is where they were born: draw them to where the person starts, between their coming of age and the
           person's own first year, as a dotted straight line, and say in the caption that the route was not told. */
        if (tl.mode === "year" && stops.length && stops[0].info.lat != null) {
          var dest = stops[0], arrive = dest.t;
          kin.forEach(function (k) {
            var st0 = k.stops[0];
            if (k.stops.length !== 1 || st0.role !== "born" || st0.year == null || st0.info === dest.info || st0.info.lat == null || arrive == null || arrive <= st0.year + 1) return;
            var t0 = Math.max(st0.year + 18, arrive - 8), a = [st0.info.lat, st0.info.lon], b = [dest.info.lat, dest.info.lon];
            var ln = L.polyline([a, b], { color: "#7a7a7a", weight: 1.5, dashArray: "1 6", opacity: .12 }).addTo(g);
            var dt = L.circleMarker(a, { radius: 5, weight: 2, color: "#7a7a7a", fillColor: "#fff", fillOpacity: 0, opacity: 0 }).addTo(g);
            legs.push({ k: k, a: a, b: b, t0: t0, t1: arrive, to: dest.info, line: ln, dot: dt });
          });
        }
        layers = { group: g };
        /* the mass-mortality events (epidemics, famines, wars, genocides) of the countries in the story, as black outlines on the map */
        if (mort && mort.events) {
          var ccs = Object.create(null);
          stops.concat(anc).forEach(function (st) { if (st.info && st.info.cc) ccs[String(st.info.cc).toUpperCase()] = 1; });
          kin.forEach(function (k) { k.stops.forEach(function (st) { if (st.info && st.info.cc) ccs[String(st.info.cc).toUpperCase()] = 1; }); });
          mort.events.forEach(function (ev) {
            if (!(ev.cc || []).some(function (c) { return ccs[String(c).toUpperCase()]; }) || !ev.poly || !ev.poly.length) return;
            var pg = L.polygon(ev.poly, { color: "#000", weight: 1.6, opacity: .85, fillColor: "#000", fillOpacity: .06, dashArray: "5 4" }).addTo(g);
            pg.bindTooltip(ev.f + (ev.t !== ev.f ? "\u2013" + ev.t : "") + " " + typeLabel(ev.ty) + ": " + ev.n, { sticky: true, className: "lf-mort-tip" });
            if (pg.bringToBack) pg.bringToBack();
          });
        }
        var rp = stops.filter(function (st) { return st.info.lat != null; }).map(function (st) { return [st.info.lat, st.info.lon]; });
        if (rp.length > 1) {
          L.polyline(rp, { color: "#7a7a7a", weight: 2, dashArray: "4 6", opacity: .7 }).addTo(g);
          layers.line = L.polyline([rp[0], rp[0]], { color: "#b3452e", weight: 3 }).addTo(g);
          layers.dot = L.circleMarker(rp[0], { radius: 6, weight: 2, color: "#fff", fillColor: "#16222a", fillOpacity: 1 }).addTo(g);
          if (can) setT(Number(E.slider.value));
        }
        var pad = o.pad || {};
        /* Tidy the labels: every one sits to the right of its pin (to the left where the pin is near the right edge), then any that
           land on another are moved down a little, and all are kept inside the map and above whatever the page puts along its bottom. */
        var tips = [];
        g.eachLayer(function (ly) { if (ly.getTooltip && ly.getTooltip()) tips.push(ly); });
        function tidy() {
          var box = map.getContainer(), W = box.clientWidth, H = box.clientHeight, floor = H - Math.max(10, ((pad.br && pad.br[1]) || 60) - 30), items = [];
          tips.forEach(function (ly) {
            var tp = ly.getTooltip(), elx = tp && tp.getElement(); if (!elx) return;
            var pt = map.latLngToContainerPoint(ly.getLatLng()), left = pt.x > W * 0.62, dir = left ? "left" : "right";
            if (tp.options.direction !== dir) { tp.options.direction = dir; tp.options.offset = L.point(left ? -6 : 6, 0); tp.update && tp.update(); }
            elx.style.marginTop = "0px";
            items.push({ e: elx, ly: ly });
          });
          items.forEach(function (it) { var r = it.e.getBoundingClientRect(), b = box.getBoundingClientRect(); it.top = r.top - b.top; it.h = r.height; it.l = r.left - b.left; it.r = r.right - b.left; it.dy = 0; });
          items.sort(function (a, b) { return a.top - b.top; });
          for (var i = 0; i < items.length; i++) {
            for (var j = 0; j < i; j++) {
              var a = items[j], c = items[i];
              if (c.l < a.r + 4 && a.l < c.r + 4 && c.top + c.dy < a.top + a.dy + a.h + 4 && a.top + a.dy < c.top + c.dy + c.h + 4) c.dy = a.top + a.dy + a.h + 4 - c.top;
            }
            var over = items[i].top + items[i].dy + items[i].h - floor; if (over > 0) items[i].dy = Math.max(-items[i].top + 4, items[i].dy - over);
          }
          items.forEach(function (it) { it.e.style.marginTop = Math.round(it.dy) + "px"; });
        }
        layers.tidy = tidy; layers.map = map; map.on("moveend zoomend", tidy);
        if (pts.length > 1) map.flyToBounds ? map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: pad.tl || [70, 50], paddingBottomRight: pad.br || [110, 60], duration: reduce ? 0 : 1.6, maxZoom: 7 }) : map.fitBounds(L.latLngBounds(pts));
        else if (pts.length) map.setView(pts[0], 8);
        /* the page may have been sliding or hidden when the map was made: measure again, and make the drawn pins project from the final view */
        setTimeout(function () { map.invalidateSize({ animate: false }); }, 60);
        setTimeout(function () { map.invalidateSize({ animate: false }); map.fire("moveend"); tidy(); }, reduce ? 150 : 1900);
      }).catch(function (e) { if (window.console) console.warn("The journey map did not draw:", e); if (E.mapBox) E.mapBox.setAttribute("data-failed", "1"); });
    }

    /* The report, place by place: for every place in the story, who held the ground in the year they were there, and where to search
       for what happened there (birth, leaving, living, arriving). Everything named is in the Atlas's own data for that place and
       country; where it holds nothing the card says so. `node.items` is what "Start the research family" may mark as planned. */
    var KINDS = [["b", "Births and baptisms"], ["m", "Marriages"], ["d", "Burials and deaths"]];
    function stopsBlock(f, mort) {
      TYPE = (mort && mort.types) || {};
      var route = (f.route && f.route.length ? f.route : [f.from && { info: f.from, role: "origin" }, f.to && { info: f.to, role: "move" }].filter(Boolean)).filter(function (x) { return x.info; });
      var anc = (f.ancestors || []).filter(function (x) { return x.info; }), box = el("div", null, "lf-stops"), items = [], n = 0, base = f.base || "/";
      box.items = items;
      function yearOf(x) { return x.year != null ? x.year : (f.born != null && x.age != null ? f.born + x.age : null); }
      function when(x, y) { return (x.age != null ? (x.approx ? "about age " : "age ") + x.age : "") + (x.age != null && y != null ? ", " : "") + (y != null ? (x.approx && !x.yearTold ? "about " : "") + y : ""); }
      function volumeList(info, kinds, win, cap) {
        var any = false, wrap = el("div");
        KINDS.forEach(function (k) {
          if (kinds.indexOf(k[0]) < 0) return;
          var vs = volumesFor(info.cols, k[0], win); if (!vs.length) return;
          any = true; wrap.append(el("h5", k[1]));
          var ul = el("ul", null, "lf-vols");
          vs.slice(0, cap || 4).forEach(function (c) {
            var li = el("li"), a = el("a", volLabel(c)); a.href = info.href; li.append(a, document.createTextNode(c.held ? ", held by " + c.held : "")); if (c.access) li.append(el("span", " access: " + c.access, "lf-filed")); ul.append(li);
            items.push({ vol: c, href: info.href });
          });
          if (vs.length > (cap || 4)) { var more = el("li"), am = el("a", "and " + (vs.length - (cap || 4)) + " more on the place page"); am.href = info.href; more.append(am); ul.append(more); }
          wrap.append(ul);
        });
        return any ? wrap : null;
      }
      /* FamilySearch for this place and these years: its collections, and the register images the Atlas has the address of */
      var KIND_RE = { b: /birth|baptis/i, m: /marri/i, d: /death|burial|buri/i };
      function fsList(info, kinds, win) {
        var p = info.p || {}, wrap = el("div"), any = false;
        var vols = (p.volumes || []).filter(function (v) { return v.url && (!win || (v.from <= win[1] && v.to >= win[0])) && (!kinds.length || kinds.some(function (k) { return KIND_RE[k] && KIND_RE[k].test((v.kinds || []).join(" ") + " " + v.t); })); }).slice(0, 3);
        var cols = (p.fs || []).filter(function (c) { return c.url && (!win || (c.from <= win[1] && c.to >= win[0])); }).sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); }).slice(0, 3);
        if (vols.length) {
          any = true; wrap.append(el("h5", "Register images on FamilySearch"));
          var ul = el("ul", null, "lf-vols"); vols.forEach(function (v) { var li = el("li"), a = el("a", v.t); a.href = v.url; a.rel = "noopener"; li.append(a); ul.append(li); items.push({ vol: v, href: v.url }); }); wrap.append(ul);
        }
        if (cols.length) {
          any = true; wrap.append(el("h5", "FamilySearch collections that cover " + info.name));
          var u2 = el("ul", null, "lf-vols"); cols.forEach(function (c) { var li = el("li"), a = el("a", c.t); a.href = c.url; a.rel = "noopener"; li.append(a, el("span", " " + c.from + "–" + c.to + (c.n ? ", " + c.n.toLocaleString("en") + " records" : ""), "lf-filed")); u2.append(li); }); wrap.append(u2);
        }
        return any ? wrap : null;
      }
      /* The whole place panel, as a place search draws it (volumes with their + and ticks, regions, who held the ground, mass mortality, flags),
         lent to this card by the map page (RecordMap's window.raPlacePanel). Only one card holds it at a time. */
      var lent = null;
      function fullPanel(info) {
        var P = typeof window !== "undefined" && window.raPlacePanel; if (!P || !info.row) return null;
        var wrap = el("div", null, "lf-full"), b = el("button", null, "lf-full-btn"), slot = el("div", null, "lf-full-slot"); slot.hidden = true;
        b.type = "button"; b.setAttribute("aria-expanded", "false"); b.append(el("b", "Everything the Atlas has for " + info.name), el("span", "volumes laid out as a place search shows them, the regions and flags, who held the ground, mass-mortality events, and + or ✓ to mark each source in your research"));
        function collapse(x) { x.slot.hidden = true; x.b.setAttribute("aria-expanded", "false"); }
        b.addEventListener("click", function () {
          var was = b.getAttribute("aria-expanded") === "true";
          if (lent) { collapse(lent); P.restore(); lent = null; }
          if (was) return;
          slot.hidden = false; b.setAttribute("aria-expanded", "true"); lent = { b: b, slot: slot };
          P.moveInto(slot); P.open(info.row.i, info.row.n);
          try { slot.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) { /* old browser */ }
        });
        wrap.append(b, slot); return wrap;
      }
      var worldDone = false;
      function worldList(info) {
        var ws = (info.world || []).filter(function (x) { return /^(familysearch|ancestry|myheritage|findagrave|geneanet|geni|wikitree|billiongraves)$/.test(x.id); });
        if (!ws.length || worldDone) return null; worldDone = true;
        var wrap = el("div"); wrap.append(el("h5", "Worldwide sites, for any place in the story"));
        var ul = el("ul", null, "lf-vols"); ws.forEach(function (x) { var li = el("li"), a = el("a", x.name); a.href = x.url; a.rel = "noopener"; li.append(a, el("span", " " + x.kind + "; access: " + x.access, "lf-filed")); ul.append(li); items.push({ src: x, href: x.url }); }); wrap.append(ul);
        return wrap;
      }
      var srcSeen = Object.create(null);
      function sources(info) {
        var ps = info.provs || [], wrap = el("div");
        if (ps.length && srcSeen[info.cc]) { wrap.append(el("p", "The archives and sources for " + (info.countryName || info.name) + " are listed under " + srcSeen[info.cc] + ".", "lf-filed")); return wrap; }
        if (ps.length) srcSeen[info.cc] = info.name;
        if (!ps.length) { wrap.append(el("p", "The source catalogue lists nothing yet for " + (info.countryName || info.name) + ". Look for its national archive and the state or county records directly: that is a gap in the Atlas, not proof nothing exists.", "lf-filed")); return wrap; }
        wrap.append(el("h5", "Archives and sources for " + (info.countryName || info.name)));
        var ul = el("ul", null, "lf-vols");
        ps.slice(0, 6).forEach(function (p) { var li = el("li"), a = el("a", p.name); a.href = p.url; a.rel = "noopener"; li.append(a, el("span", " " + p.kind + "; access: " + p.access, "lf-filed")); ul.append(li); items.push({ src: p, href: p.url }); });
        if (ps.length > 6) { var li2 = el("li"), a2 = el("a", "and " + (ps.length - 6) + " more in the source catalogue"); a2.href = base + "providers/"; li2.append(a2); ul.append(li2); }
        wrap.append(ul); return wrap;
      }
      /* The place over the whole of its history, as a place search shows it: every era with its flag and who held the ground, the one they were
         there in marked, then the epidemics, famines, wars and mass deaths whose area covers the place. Shown on every card, dated or not. */
      function ground(info, year) {
        var wrap = el("div", null, "lf-ground"), eras = info.eras || [];
        if (eras.length) {
          wrap.append(el("h5", "Who held this ground, era by era"));
          var ul = el("ul", null, "lf-eras"), now = new Date().getFullYear();
          eras.forEach(function (e) {
            var li = el("li", null, year != null && year >= e.from && year < e.to ? "on" : ""), fl = flagFor(info, e.from);
            if (fl) { var im = el("img", null, "lf-flag"); im.src = base + "fl/" + encodeURIComponent(fl) + ".svg"; im.alt = ""; im.title = "From the flag history of today's " + info.countryName + " in " + e.from; li.append(im); }
            var rg = info.regimes && info.regimes[e.regime];
            li.append(el("b", e.from + "\u2013" + (e.to >= now ? "now" : e.to) + " "), document.createTextNode(e.polity + (rg && rg.label && rg.label !== e.polity ? " (" + rg.label + ")" : "")));
            ul.append(li);
          });
          wrap.append(ul);
        } else wrap.append(el("p", "The Atlas has no era table for this area, so there is no era-by-era list here: it is " + (info.countryName || "today's country") + " as it is now.", "lf-filed"));
        var evs = mort && info.lat != null ? S.eventsAt(mort.events, info.lat, info.lon, 1500, 1500) : [];
        if (evs.length) {
          wrap.append(el("h5", "Mass mortality whose area covers " + info.name));
          var ue = el("ul", null, "lf-eras lf-mort");
          evs.slice(0, 8).forEach(function (e) { var li = el("li", null, "lf-now-" + e.ty); li.append(el("b", e.f + (e.t !== e.f ? "\u2013" + e.t : "") + " "), document.createTextNode(typeLabel(e.ty) + ": " + e.n)); ue.append(li); });
          if (evs.length > 8) ue.append(el("li", "and " + (evs.length - 8) + " more on the place page", "lf-filed"));
          wrap.append(ue);
        }
        return wrap;
      }
      function card(info, kicker, title, whenText, year, ageText, look, kinds, win, withSources, prefix) {
        n++;
        var sec = el("section", null, "lf-stop"), hd = el("header", null, "lf-stop-h");
        hd.append(el("span", String(n), "lf-stop-n"));
        var tt = el("div"); tt.append(el("div", kicker, "lf-stop-k"), el("h3", title)); var sub = [info.countryName, whenText].filter(Boolean).join(" · "); if (sub) tt.append(el("div", sub, "lf-stop-s"));
        hd.append(tt); sec.append(hd);
        var grid = el("div", null, "lf-stop-grid"), then = el("div", null, "lf-stop-then"), where = el("div", null, "lf-stop-where");
        then.append(el("h4", "Who held the ground"));
        if (year == null) then.append(el("p", "Give a year, even a rough one, and the one that applies is marked below.", "lf-filed"));
        else then.append(line(info, year, evHere(mort, info, year - 5, year + 5), prefix || "", ageText || ""));
        then.append(ground(info, year));
        where.append(el("h4", "Where to search"));
        var ul = el("ul", null, "lf-look"); look.forEach(function (t) { ul.append(el("li", t)); }); where.append(ul);
        if ((info.older || []).length) where.append(el("p", info.name + " is also found as " + info.older.slice(0, 8).join(", ") + ". Search all of them.", "lf-filed"));
        var fl = fsList(info, kinds, win); if (fl) where.append(fl);
        var vl = volumeList(info, kinds, win); if (vl) where.append(vl); else if (kinds.length) where.append(el("p", "The Atlas lists no " + (kinds.length > 1 ? "birth, baptism or marriage" : kinds[0] === "b" ? "birth or baptism" : kinds[0] === "m" ? "marriage" : "burial") + " volume for " + info.name + (win ? " in those years" : "") + ". That is a gap in the Atlas, not proof the records do not exist.", "lf-filed"));
        if (withSources) where.append(sources(info));
        var wl = worldList(info); if (wl) where.append(wl);
        var pl = el("p"), pa = el("a", "Every volume the Atlas lists for " + info.name + " →"); pa.href = info.href; pl.append(pa); where.append(pl);
        grid.append(then, where); sec.append(grid);
        var fp = fullPanel(info); if (fp) sec.append(fp);
        box.append(sec);
      }
      var w = windows(f.left, f.born);
      route.forEach(function (x, i) {
        var info = x.info, first = i === 0, last = i === route.length - 1 && route.length > 1, y = yearOf(x), look = [], kinds = [], win = null;
        var kicker = first ? (x.role === "born" ? "Born here" : "Where it starts") : last ? "Where they arrived" : "On the way";
        if (first) {
          look.push("Look for the baptism or birth entry: it names the parents, and the godparents are often relatives.");
          kinds = ["b", "m"]; win = y != null && x.role === "born" ? [y - 1, y + 1] : (w ? w.birth : null);
        } else if (last) {
          look.push("Look for the arrival and settlement: immigration or passenger lists, naturalisation or citizenship papers, a census, electoral rolls, and in time a death record.");
          kinds = []; win = null;
        } else {
          look.push("Look for where they lived here: a census or population register, the parish or congregation's records, school and employment records.");
        }
        if (!last && route[i + 1]) look.push("Look for the leaving: exit permits or passports, emigration or passenger lists, and the last census that names the household. They went next to " + route[i + 1].info.name + (route[i + 1].age != null ? " at " + (route[i + 1].approx ? "about " : "") + "age " + route[i + 1].age : "") + ".");
        (x.ev || []).forEach(function (e) {
          var win2 = e.year != null ? [e.year - 1, e.year + 1] : null;
          if (e.type === "married") { look.push("He married here" + (e.year != null ? " in " + e.year : "") + ": look for the marriage register or civil marriage certificate. It names both families, and the witnesses are often relatives."); if (kinds.indexOf("m") < 0) kinds.push("m"); if (!win) win = win2; }
          if (e.type === "died") { look.push("He died here" + (e.year != null ? " in " + e.year : "") + (e.cause ? " (" + e.cause + ")" : "") + ": look for the death notice, the death certificate, probate, the burial or cremation record and an obituary. The certificate names the parents."); if (kinds.indexOf("d") < 0) kinds.push("d"); if (!win) win = win2; }
        });
        var tags = (x.ev || []).map(function (e) { return e.type === "married" ? "married here" + (e.year != null ? " in " + e.year : "") : "died here" + (e.year != null ? " in " + e.year : ""); }).join(", ");
        card(info, kicker + (tags ? " · " + tags : ""), info.name, when(x, y), y, x.age != null ? (x.approx ? "about age " : "age ") + x.age : "", look, kinds, win, true, "");
      });
      (f.kin || []).forEach(function (k) {
        var who = ((k.label ? k.label + " " : "") + (k.name || "")).trim() || "Family";
        k.stops.forEach(function (st) {
          if (!st.info) return;
          var y = st.year, born = st.role === "born", look = [born ? "Look for the baptism or birth entry of " + (k.name || "this person") + ": it names the parents, and the godparents are often relatives." : "Look for where " + (k.name || "this person") + " lived here: a census or population register and the parish records."];
          card(st.info, who + (born ? " · born here" : st.role === "origin" ? " · from here" : st.role === "married" ? " · married here" : " · lived here"), st.info.name, y != null ? String(y) : "", y, "", look, born ? ["b"] : [], born && y != null ? [y - 1, y + 1] : null, true, who + ", ");
        });
      });
      anc.forEach(function (x) {
        var info = x.info, y = f.born != null ? f.born : null;
        card(info, "His " + x.who + "'s family", info.name, "", y, "", ["Look for the generation before: the parents' marriage and the " + x.who + "'s baptism in the parish registers of " + info.name + ", and the same surname written other ways."], ["b", "m"], f.born != null ? [f.born - 70, f.born - 10] : null, false, "His " + x.who + "'s family, ");
      });
      return box;
    }
    return { draw: draw, clear: clear, stops: stopsBlock };
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
    var self = (people || []).filter(function (x) { return x.role === "self"; })[0], sg = self && (self.given && typeof self.given === "object" ? self.given.typed : self.given), who = sg ? sg + "'s " : "Their ";
    return who + (pe.label || pe.role);
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
      c.append(el("div", label, "lf-card-role"), el("div", pe.name || (pe.me ? "The one telling the story" : "Name not given"), "lf-card-name"));
      var hasBorn = (pe.events || []).some(function (e) { return e.type === "born" && e.place; });
      if (pe.place && !hasBorn) c.append(el("div", (pe.role === "self" && !pe.events ? "Born in " : "From ") + (typeof pe.place === "string" ? pe.place : pe.place.word), "lf-card-place"));
      (pe.events || []).forEach(function (e) {
        var t = (e.type === "born" ? "Born" : e.type === "married" ? "Married" : "Died") + (e.year != null ? " " + e.year : "") + (e.place ? (e.year != null ? ", " : " in ") + e.place : "") + (e.cause ? " (" + e.cause + ")" : "");
        c.append(el("div", t, "lf-card-place lf-card-ev"));
      });
      var f = forms(pe); if (f.length) c.append(el("div", "Also written: " + f.join(", "), "lf-card-forms"));
      if (pe.presumed) c.append(el("div", "Surname assumed the same", "lf-card-forms"));
      return c;
    }
    var tree = el("div", null, "lf-tree"), others = (people || []).slice();
    function gen(cls) { var g = el("div", null, "lf-gen " + (cls || "")); tree.append(g); return g; }
    var gps = (people || []).filter(function (x) { return x.role === "grandfather" || x.role === "grandmother"; }), sp = (people || []).filter(function (x) { return x.role === "spouse"; })[0];
    if (gps.length) { var g0 = gen("lf-grand"); gps.forEach(function (x) { var lb = x.label || x.role; g0.append(card(x, lb.charAt(0).toUpperCase() + lb.slice(1))); }); tree.append(el("div", null, "lf-tie")); }
    if (fa || mo) { var g1 = gen("lf-parents"); if (fa) g1.append(card(fa, "Father")); if (mo) g1.append(card(mo, "Mother")); tree.append(el("div", null, "lf-tie")); }
    var g2 = gen(); g2.append(card(self, self.me ? "You" : self.rel ? "Your " + self.rel.replace(/-/g, " ") : "The person you asked about"));
    if (sp) g2.append(card(sp, self.me ? "Your partner" : self.rel === "father" ? "Wife, your mother" : self.rel === "mother" ? "Husband, your father" : "Spouse"));
    var kids = (people || []).filter(function (x) { return x.role === "child"; });
    if (self.me) { if (kids.length) { tree.append(el("div", null, "lf-tie")); var g4 = gen(); kids.forEach(function (x) { g4.append(card(x, "Your child")); }); } return tree; }
    tree.append(el("div", null, "lf-tie"));
    var g3 = gen(), you = el("div", null, "lf-card lf-card-you"); you.append(el("div", "You", "lf-card-role"), el("div", "who is asking", "lf-card-place")); g3.append(you);
    return tree;
  }
  api.namesBlock = namesBlock; api.treeBlock = treeBlock;
  api.createLoader = createLoader; api.createJourney = createJourney; api.el = el;
})();
