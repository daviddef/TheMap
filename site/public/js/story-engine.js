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
    var h = HOLDS[f.holds] || HOLDS.story;

    steps.push({ id: "hold", title: "Write down exactly what you hold",
      why: "You hold " + h.t + ". Everything else is searched from this, so it comes first.",
      items: [{ text: h.step }],
      ask: "Who else in the family has the same thing, or a copy, or a different one?",
      not: h.not,
      links: f.holds === "story" ? [] : [{ text: "Turn a line you can read on it into places and terms", href: base + "read/" }] });

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
        if (/^[A-ZÀ-ÖØ-ÝČĆŽŠĐ][\p{L}'’-]+$/u.test(nx) && !STOP[S.fold(nx)] && !REL.test(nx)) out.surname = nx;
      }
      out.givenWord = raw[gi] ? raw[gi].replace(/[,.;:]+$/, "") : out.given;
      out.name = out.givenWord + (out.surname ? " " + out.surname : "");
    }
    if (/\b(photo|photograph|picture|snapshot|portrait)\b/i.test(t)) out.holds = "photo";
    else if (/\b(letter|postcard|diary)\b/i.test(t)) out.holds = "letter";
    else if (/\b(document|certificate|passport|papers|record|register|manifest|visa)\b/i.test(t)) out.holds = "document";
    if (attached) out.holds = attached;

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
      return { c: c, role: role, drop: isGiven && !role };
    }).filter(function (x) { return !x.drop; });
    function pick(x) { return x ? { row: x.c.rows[0], alts: x.c.rows.slice(1, 6), word: x.c.word } : null; }
    var fromX = rolesFor.filter(function (x) { return x.role === "from"; })[0];
    var toX = rolesFor.filter(function (x) { return x.role === "to"; })[0];
    var free = rolesFor.filter(function (x) { return !x.role && x !== fromX && x !== toX; });
    if (!fromX && free.length) fromX = free.shift();
    if (!toX && free.length) toX = free.shift();
    out.from = pick(fromX); out.to = pick(toX);
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
        return { row: row, p: p, name: row.n, lat: p ? p.lat : row.y, lon: p ? p.lon : row.x, cc: row.cc, countryName: (data.countries[row.cc] || row.cc || ""),
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
      return load().then(function () {
        return Promise.all([parsed.from ? placeInfo(parsed.from.row) : null, parsed.to ? placeInfo(parsed.to.row) : null,
          getJSON("providers.json").catch(function () { return { providers: [] }; }), getJSON("mortality.json").catch(function () { return null; }),
          getJSON("flag-map.json").catch(function () { return null; }), getJSON("leaders.json").catch(function () { return null; }), surname(parsed.surname).catch(function () { return null; })]);
      }).then(function (r) {
        var from = r[0], to = r[1], provs = r[2].providers || [], pname = Object.create(null), fm = r[4] && r[4].f, lead = r[5] && r[5].countries;
        provs.forEach(function (x) { pname[x.id] = x.name; });
        [from, to].forEach(function (i) { if (!i) return; i.pname = pname; i.flagRows = fm ? fm[String(i.cc || "").toUpperCase()] : null; i.leaders = lead ? lead[String(i.cc || "").toUpperCase()] : null; });
        var facts = { rel: parsed.rel, name: parsed.name, holds: parsed.holds, left: parsed.left, born: parsed.born, from: from, to: to, base: BASE,
          providers: to ? provs.filter(function (p) { return (p.countries || []).indexOf(to.cc) > -1; }) : [],
          given: parsed.given && data.given ? S.givenIn(parsed.givenWord || parsed.given, data.given, null) : [] };
        var labels = {}; (data.languages || []).forEach(function (l) { labels[l.key] = l.label; });
        var gr = facts.given.length ? givenGroups(facts.given[0].row, labels) : [];
        return { facts: facts, plan: buildPlan(facts), mort: r[3], names: { given: facts.given.length ? { canon: facts.given[0].row.canon, typed: parsed.givenWord || parsed.given, groups: gr } : null, surname: r[6] } };
      });
    }
    return { getJSON: getJSON, load: load, placeInfo: placeInfo, gather: gather, surname: surname };
  }

  /* The journey: a year slider, play button and captions for who held each place in each year, a still list of what changed, and a
     dashed line with a moving dot on a map. `o.els` = {cap, slider, yearOut, play, moments, time, mapBox}; `o.getMap()` resolves to
     {L, map}, so the page's own map or the home map can host it; `o.pad` is the room to leave round the places (the drawer). */
  function createJourney(o) {
    var E = o.els, layers = null, stopPlay = null, evA = [], evB = [];
    var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var BASE = (o.base || document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
    var TYPE = {}; /* event type -> label, from mortality.json `types` */
    function evHere(mort, info, y0, y1) {
      if (!mort || info.lat == null) return [];
      return S.eventsAt(mort.events, info.lat, info.lon, Math.round((y0 + y1) / 2), Math.ceil((y1 - y0) / 2) + 1);
    }
    function typeLabel(t) { return (TYPE[t] || t).replace(/ \(as the cited.*$/, "").replace(/^./, function (c) { return c.toUpperCase(); }); }
    function line(info, year, evs) {
      var c = captionAt(info, year), d = el("div", null, "lf-capline");
      var fl = flagFor(info, year);
      if (fl) { var im = el("img", null, "lf-flag"); im.src = BASE + "fl/" + encodeURIComponent(fl) + ".svg"; im.alt = "Flag from the Atlas's flag history of today's " + info.countryName + ", " + year; im.title = "From the flag history of today's " + info.countryName + " in " + year + ". The village may have been under another state: see the line beside it."; im.width = 36; im.height = 24; im.loading = "lazy"; d.append(im); }
      var head = el("div", null, "lf-caphead");
      head.append(el("b", info.name + ", " + year + ": "), document.createTextNode(c.polity ? "under " + c.polity : "no era table"));
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
    function clear() { if (stopPlay) stopPlay(); if (layers) { layers.group.remove(); layers = null; } }
    function draw(f, mort) {
      clear();
      var a = f.from, b = f.to, left = f.left;
      var y0 = f.born != null ? f.born : (left != null ? left - 25 : null), y1 = left != null ? Math.min(left + 12, YEAR_MAX) : null;
      var can = y0 != null && y1 != null && (a || b);
      if (E.time) E.time.hidden = !can;
      if (E.mapBox) E.mapBox.hidden = !(a || b);
      E.moments.textContent = ""; E.cap.textContent = "";
      TYPE = (mort && mort.types) || {};
      var wy0 = y0 != null ? y0 : (left != null ? left - 25 : 1850), wy1 = y1 != null ? y1 : (left != null ? left + 12 : 1920);
      evA = a ? evHere(mort, a, wy0, wy1) : []; evB = b ? evHere(mort, b, wy0, wy1) : [];
      if (!a && !b) { E.cap.textContent = "Say where they started and where they arrived to see the journey."; return Promise.resolve(); }
      function setYear(y) {
        E.cap.textContent = "";
        if (a) E.cap.append(line(a, y, evA)); if (b) E.cap.append(line(b, y, evB));
        if (E.slider) E.slider.value = String(y);
        if (E.yearOut) E.yearOut.textContent = String(y);
        var t = progress(left, y);
        if (E.slider) E.slider.setAttribute("aria-valuetext", y + ". " + (t >= 1 ? "Arrived in " + (b ? b.name : "the new country") : t > 0 ? "On the way" : "Still in " + (a ? a.name : "the first place")));
        if (layers && layers.dot) { var pt = between([a.lat, a.lon], [b.lat, b.lon], t); layers.dot.setLatLng(pt); layers.line.setLatLngs([[a.lat, a.lon], pt]); }
      }
      if (can) {
        E.slider.min = String(y0); E.slider.max = String(y1); setYear(y0);
        E.slider.oninput = function () { if (stopPlay) stopPlay(); setYear(Number(E.slider.value)); };
        var raf = null;
        stopPlay = function () { if (raf) cancelAnimationFrame(raf); raf = null; if (E.play) E.play.textContent = "▶ Play"; };
        if (E.play) {
          E.play.hidden = reduce;
          E.play.onclick = function () {
            if (raf) { stopPlay(); return; }
            E.play.textContent = "❚❚ Pause";
            var from = Number(E.slider.value) >= y1 ? y0 : Number(E.slider.value), t0 = null, span = (y1 - from) * 450;
            function tick(ts) { if (t0 == null) t0 = ts; var k = Math.min(1, (ts - t0) / span); setYear(Math.round(from + (y1 - from) * k)); if (k < 1) raf = requestAnimationFrame(tick); else stopPlay(); }
            raf = requestAnimationFrame(tick);
          };
        }
      } else {
        if (a) E.cap.append(line(a, left != null ? left : 1900, evA)); if (b) E.cap.append(line(b, left != null ? left : 1900, evB));
      }
      if (y0 != null && y1 != null) {
        var mid = Math.round((y0 + y1) / 2), half = Math.ceil((y1 - y0) / 2) + 1, items = [];
        [a, b].forEach(function (info) {
          if (!info) return;
          S.aroundYear(info.eras || [], [], mid, half).forEach(function (x) { if (x.y >= y0 - 1 && x.y <= y1 + 1) items.push({ y: x.y, t: info.name + ": " + x.title }); });
        });
        items.sort(function (p, q) { return p.y - q.y; });
        if (items.length) {
          E.moments.append(el("h4", "Who held the ground, and when it changed"));
          var ul = el("ul"); items.slice(0, 8).forEach(function (x) { var li = el("li"); li.append(el("b", x.y + " "), x.t); ul.append(li); });
          E.moments.append(ul);
        }
        var seen = Object.create(null), evs = [];
        [[a, evA], [b, evB]].forEach(function (pr) { (pr[1] || []).forEach(function (e) { if (seen[e.id]) return; seen[e.id] = 1; evs.push({ e: e, where: pr[0].name }); }); });
        if (evs.length) {
          E.moments.append(el("h4", "What was going on: epidemics, famines, wars and mass deaths nearby"));
          var ue = el("ul", null, "lf-events");
          evs.slice(0, 8).forEach(function (x) {
            var li = el("li", null, "lf-ev lf-ev-" + x.e.ty), t = x.e.toll && x.e.toll.text ? " " + short(x.e.toll.text, 160) : "";
            li.append(el("b", x.e.f + (x.e.t !== x.e.f ? "–" + x.e.t : "") + " "), el("span", typeLabel(x.e.ty), "lf-tag"), document.createTextNode(" " + x.e.n + " (near " + x.where + "). " + short(x.e.says, 200) + t));
            if (x.e.open) li.append(el("div", "Disputed: " + short(x.e.open, 160), "lf-filed"));
            ue.append(li);
          });
          E.moments.append(ue);
        }
        [a, b].forEach(function (info) {
          if (!info || !info.leaders) return;
          var ls = leadersBetween(info.leaders, y0, y1).slice(0, 8);
          if (!ls.length) return;
          E.moments.append(el("h4", "Leaders of today's " + info.countryName + " in those years"));
          var ul2 = el("ul"); ls.forEach(function (r) { var li = el("li"); li.append(el("b", r[2] + (r[3] == null ? " on " : "–" + r[3] + " ")), r[0]); ul2.append(li); });
          E.moments.append(ul2);
        });
        if (items.length || evs.length || (a && a.leaders) || (b && b.leaders)) E.moments.append(el("p", "This is the setting, not a fact about them: the events are those whose area covers the place in those years, and the leaders are those of the country as it is drawn today.", "cap"));
      }
      return o.getMap().then(function (m) {
        var L = m.L, map = m.map, g = L.layerGroup().addTo(map), pts = [];
        function pin(info, colour, label) {
          if (!info || info.lat == null) return;
          L.circleMarker([info.lat, info.lon], { radius: 8, weight: 3, color: "#fff", fillColor: colour, fillOpacity: 1 }).bindTooltip(label + ": " + info.name, { permanent: true, direction: "top", offset: [0, -8] }).addTo(g);
          pts.push([info.lat, info.lon]);
        }
        pin(a, "#b3452e", "Started"); pin(b, "#1f5c6b", "Arrived");
        layers = { group: g };
        if (a && b && a.lat != null && b.lat != null) {
          L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: "#7a7a7a", weight: 2, dashArray: "4 6", opacity: .7 }).addTo(g);
          layers.line = L.polyline([[a.lat, a.lon], [a.lat, a.lon]], { color: "#b3452e", weight: 3 }).addTo(g);
          layers.dot = L.circleMarker([a.lat, a.lon], { radius: 6, weight: 2, color: "#fff", fillColor: "#16222a", fillOpacity: 1 }).addTo(g);
          if (can) setYear(Number(E.slider.value));
        }
        var pad = o.pad || {};
        if (pts.length > 1) map.flyToBounds ? map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: pad.tl || [40, 40], paddingBottomRight: pad.br || [40, 40], duration: reduce ? 0 : 1.6, maxZoom: 7 }) : map.fitBounds(L.latLngBounds(pts));
        else if (pts.length) map.setView(pts[0], 8);
        setTimeout(function () { map.invalidateSize(); }, 60);
      }).catch(function () { if (E.mapBox) E.mapBox.setAttribute("data-failed", "1"); });
    }
    return { draw: draw, clear: clear };
  }

  /* The names panel: how the first name and the surname were written, in the languages of the clerks. A node for the page to place.
     `names` = {given: {canon, typed, groups}, surname: surnameBlock(...)}; nothing about a person is in it. */
  function namesBlock(names, base) {
    var box = el("div", null, "lf-names"), any = false;
    base = (base || "/").replace(/\/?$/, "/");
    var g = names && names.given;
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
    var sn = names && names.surname;
    if (sn) {
      var f = sn.family, pos = f ? f.by.same.concat(f.by.attested, f.by.rule) : [];
      if (f || sn.spelling.length || sn.sounds.length) {
        any = true;
        box.append(el("h4", "Surname: " + sn.name + " may be written"));
        var u2 = el("ul", null, "lf-forms");
        if (pos.length) { var l1 = el("li"); l1.append(el("b", "Recorded spellings of the same name: "), document.createTextNode(pos.join(", "))); u2.append(l1); }
        if (f && f.by.lead.length) { var l2 = el("li"); l2.append(el("b", "Worth trying, never yet seen on a record: "), document.createTextNode(f.by.lead.slice(0, 10).join(", ") + (f.by.lead.length > 10 ? " and " + (f.by.lead.length - 10) + " more" : ""))); u2.append(l2); }
        if (f && f.by["case-by-case"].length) { var l3 = el("li"); l3.append(el("b", "Sometimes this family, sometimes another: "), document.createTextNode(f.by["case-by-case"].join(", "))); u2.append(l3); }
        if (sn.spelling.length) { var l4 = el("li"); l4.append(el("b", "Close spellings in the Atlas's name lists (leads): "), document.createTextNode(sn.spelling.join(", "))); u2.append(l4); }
        if (sn.sounds.length) { var l5 = el("li"); l5.append(el("b", "Names that sound alike (leads): "), document.createTextNode(sn.sounds.join(", "))); u2.append(l5); }
        if (f && f.notSame.length) { var l6 = el("li"); l6.append(el("b", "Look alike, but a different name: "), document.createTextNode(f.notSame.slice(0, 6).map(function (x) { return x[0]; }).join(", "))); u2.append(l6); }
        box.append(u2);
      }
    }
    if (any) {
      var p = el("p", null, "cap"); p.append("Leads are where to look, not findings. ");
      var a = el("a", "Every spelling in the Atlas →"); a.href = base + "your-name/"; p.append(a); box.append(p);
    }
    return any ? box : null;
  }
  api.namesBlock = namesBlock;
  api.createLoader = createLoader; api.createJourney = createJourney; api.el = el;
})();
