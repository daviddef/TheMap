/* THE STORY ENGINE: what the Atlas can say about "my great-grandfather Ivan came from Gallignana to Hamilton around 1905".

   One engine, three front doors: the guided start in the home page's drawer (story-drawer.js), the guided Ask on /read/ (story-guide.js)
   and the story page (story-page.js). It reads a story out of free text, finds the places and years in it, says who held the
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
    if (sur) nameItems.push({ text: "Look up the surname " + sur + " in the Atlas's name finder", href: base + "your-name/?kind=surname&s=" + encodeURIComponent(sur) });
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

  var REL = /\b(great[- ]great[- ]grand(?:father|mother|parent)|great[- ]grand(?:father|mother|parent)|grand(?:father|mother|parent)|great[- ](?:uncle|aunt)|father|mother|uncle|aunt|brother|sister|ancestor|relative|nonno|nonna|granny|grandad|granddad|grandma|grandpa|gramps|gran|nan|nana|nanna|nanny|oma|opa|djed|baka|abuelo|abuela|babcia|dziadek|bubbe|zayde|farfar|morfar|farmor|mormor|bunica|dad|mum|mom|mam|mama|mamma|papa)\b/i;
  var YEAR_CUE = /^(?:died|d|dies|death|buried|burial|married|m|left|moved|emigrated|migrated|arrived|returned|settled|sailed|baptised|baptized|christened|widowed|divorced|deported|enlisted|retired|came)$/;
  var REL_ALIAS = { nonno: "grandfather", grandad: "grandfather", granddad: "grandfather", grandpa: "grandfather", gramps: "grandfather", opa: "grandfather", djed: "grandfather", abuelo: "grandfather", dziadek: "grandfather", zayde: "grandfather", farfar: "grandfather", morfar: "grandfather", nonna: "grandmother", granny: "grandmother", grandma: "grandmother", gran: "grandmother", nan: "grandmother", nana: "grandmother", nanna: "grandmother", nanny: "grandmother", oma: "grandmother", baka: "grandmother", abuela: "grandmother", babcia: "grandmother", bubbe: "grandmother", farmor: "grandmother", mormor: "grandmother", bunica: "grandmother", dad: "father", papa: "father", mum: "mother", mom: "mother", mam: "mother", mama: "mother", mamma: "mother" };
  /* WHO THE PERSON IS TO THE TELLER, when a word alone does not say: «my mother's father» is a grandfather, «my dad's dad» too, «my great-great-grandmother's sister» a great-great-great-aunt, «my 3x great-grandfather»
     is three greats, «my father-in-law», «my step-father» and «my half-brother» are not the teller's father or brother. Returns "" when nothing here applies, and the plain word is used. */
  var KINC = { mum: "mother", mom: "mother", mother: "mother", mama: "mother", mamma: "mother", mam: "mother", dad: "father", da: "father", papa: "father", father: "father", grandfather: "grandfather", grandad: "grandfather", granddad: "grandfather", grandpa: "grandfather", gramps: "grandfather", nonno: "grandfather", opa: "grandfather", abuelo: "grandfather", grandmother: "grandmother", grandma: "grandmother", granny: "grandmother", gran: "grandmother", nan: "grandmother", nana: "grandmother", nanna: "grandmother", nanny: "grandmother", nonna: "grandmother", oma: "grandmother", abuela: "grandmother", brother: "brother", sister: "sister", uncle: "uncle", aunt: "aunt", auntie: "aunt", aunty: "aunt" };
  function greatsOf(n) { return n <= 0 ? "" : n <= 2 ? new Array(n + 1).join("great-") : n + "x-great-"; }
  function composeRel(t) {
    var m = /\b(?:my|our)\s+(?:(?:paternal|maternal)\s+)?((?:great[- ]|\d+x?[- ]great[- ])*)([a-z]+)['\u2019]s\s+((?:great[- ])*)([a-z]+)\b/i.exec(t);
    if (m) {
      var n1 = /^\d/.test(m[1]) ? Number(/^\d+/.exec(m[1])[0]) : (m[1].match(/great/gi) || []).length, x = KINC[m[2].toLowerCase()], n2 = (m[3].match(/great/gi) || []).length, y = KINC[m[4].toLowerCase()];
      if (x && y && !n2) {
        var gx = ({ mother: 1, father: 1, grandmother: 2, grandfather: 2 }[x] || 0) + n1;
        if (gx && /^(?:mother|father|grandmother|grandfather)$/.test(y)) { var tot = gx + { mother: 1, father: 1, grandmother: 2, grandfather: 2 }[y]; return tot <= 1 ? y : greatsOf(tot - 2) + "grand" + (/mother$/.test(y) ? "mother" : "father"); }
        if (gx && (y === "brother" || y === "sister")) { var au = y === "brother" ? "uncle" : "aunt"; return gx === 1 ? au : greatsOf(gx - 1) + au; }
      }
    }
    var g = /\b(?:my|our)\s+((?:great[- ]){3,}|\d+(?:x|th|st|nd|rd)?[- ]+great[- ])grand(father|mother|parent)\b/i.exec(t);
    if (g) { var gn = /^\d/.test(g[1]) ? Number(/^\d+/.exec(g[1])[0]) : (g[1].match(/great/gi) || []).length; return greatsOf(gn) + "grand" + g[2].toLowerCase(); }
    /* «my dad's stepfather», «my mum's half-sister», «my father's godmother»: their own relation, said through whom; never the parent himself */
    var ch = /\b(?:my|our)\s+((?:(?:late\s+)?(?:mum|mom|mother|dad|father|grandmother|grandfather|grandma|grandpa|nan|nana|nonna|nonno)['\u2019]s\s+)+)((?:step|half)[- ]?(?:grand)?(?:father|mother|brother|sister|dad|mum|mom|son|daughter)|(?:father|mother|brother|sister|son|daughter)[- ]in[- ]law|god[- ]?(?:father|mother|son|daughter))\b/i.exec(t);
    if (ch) {
      var via = ch[1].match(/[a-z]+(?=['\u2019]s)/gi).map(function (w) { return KINC[w.toLowerCase()] || w.toLowerCase(); }), term = ch[2].toLowerCase().replace(/^(step|half)[- ]?/, "$1-").replace(/[- ]in[- ]law$/, "-in-law").replace(/^god[- ]?/, "god").replace(/(dad)$/, "father").replace(/(mum|mom)$/, "mother");
      var up = 0; via.forEach(function (v) { up += { mother: 1, father: 1, grandmother: 2, grandfather: 2 }[v] || 0; });
      var sp = /^(step|half)-(grand)?(father|mother|brother|sister)$/.exec(term);
      if (sp && up) {
        var tot2 = up + (sp[2] ? 2 : 1);
        if (/ther$/.test(sp[3]) && sp[3] !== "brother") return tot2 === 1 ? term : sp[1] + "-" + greatsOf(tot2 - 2) + "grand" + sp[3];   /* «my dad's stepfather» is a step-grandfather */
        if (!sp[2]) { var au2 = sp[3] === "brother" ? "uncle" : "aunt"; return sp[1] + "-" + (up === 1 ? au2 : greatsOf(up - 1) + au2); }
      }
      return via.join("'s ") + "'s " + term;
    }
    var gd = /\b(?:my|our)\s+(?:(?:late)\s+)?(god[- ]?(?:father|mother|son|daughter))\b/i.exec(t);
    if (gd) return gd[1].toLowerCase().replace(/[- ]/, "");
    var st = /\b(?:my|our)\s+(?:(?:late|ex|former)\s+)?(step|half)[- ]?(father|mother|brother|sister|dad|mum|mom)\b/i.exec(t);
    if (st) return st[1].toLowerCase() + "-" + (KINC[st[2].toLowerCase()] || st[2].toLowerCase());
    var il = /\b(?:my|our)\s+(?:(?:late|ex|former)\s+)?(father|mother|brother|sister|son|daughter)[- ]in[- ]law\b/i.exec(t);
    if (il) return il[1].toLowerCase() + "-in-law";
    return "";
  }
  var STOP = Object.create(null);
  "my a an the and who from came come to into in of at was were is are born about around circa abt all have this that his her their with for on by after before left arrived emigrated moved settled lived he she they i me our we it".split(" ").forEach(function (w) { STOP[w] = 1; });
  var COMMON = Object.create(null);
  "then also still later soon when while where which what how why not no yes but or so as if than too very just only even again once twice died dead married wed lived live living went go goes gone come comes coming moved move moving travelled traveled returned return born birth age old years year aged name named called said told great county city town village province state parish district region island borough township shire mama mamma papa mum dad nonno nonna nana granny grandma grandpa grandad gran oma opa djed baka auntie dear sincerely regards story stories family passport photo photograph picture letter diary document papers certificate record register mother father parents grand son daughter wife husband".split(" ").forEach(function (w) { COMMON[w] = 1; });
  /* Words that are not places however the gazetteer spells a village: the trades a story gives (a "miner" is not Miner County), the months,
     the counting words, and the words of a register in the languages the clerks wrote (rođen is "born", not the Dutch village of Roden). */
  var OCC = Object.create(null);
  ("stonemason mason bricklayer carpenter joiner blacksmith smith farmer farmhand fisherman fishermen sailor seaman mariner captain soldier officer policeman constable miner collier coalminer quarryman labourer laborer docker dockworker shipbuilder shipwright baker butcher grocer merchant trader shopkeeper tailor seamstress dressmaker weaver spinner cobbler shoemaker miller brewer publican innkeeper barman cook chef waiter servant maid housemaid nurse midwife doctor surgeon teacher schoolteacher professor lecturer clerk secretary accountant banker lawyer solicitor barrister judge priest minister preacher vicar clergyman monk nun engineer mechanic driver chauffeur conductor porter railwayman signalman plumber electrician painter plasterer glazier tiler roofer cooper wheelwright saddler potter printer typesetter journalist editor writer author artist musician singer actor dancer photographer watchmaker jeweller jeweler goldsmith gardener gamekeeper shepherd herdsman drover cowman dairyman fruiterer greengrocer undertaker barber hairdresser tinsmith tanner chandler ropemaker sailmaker stevedore welder fitter turner machinist foreman manager clerks farmers miners fishermen sailors soldiers workers worker labourers").split(" ").forEach(function (w) { OCC[w] = 1; });
  var MONTHS = Object.create(null);
  "january february march april june july august september october november december sept".split(" ").forEach(function (w) { MONTHS[w] = 1; });
  var NUMW = Object.create(null);
  "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand first second third fourth fifth half both several many some few".split(" ").forEach(function (w) { NUMW[w] = 1; });
  "roden rodena rodjen rodjena geboren geborene nacque nacido nacida godine godina gestorben morto morta nato nacque nel nella della sono".split(" ").forEach(function (w) { STOP[w] = 1; });
  var PREP_PLACE = /^(?:in|at|from|to|near|into|via|outside|around|towards|toward|nach|von|aus|iz|u|en|nel|nella)$/;
  /* ordinary nouns that name a kind of place or a thing, never one place: a "mill" or a "hill" is a place only when written Mill after in/at/from */
  var LC = Object.create(null);
  "river hill hills church chapel farm mill house home school college factory shop store market street road lane field fields forest wood woods lake sea ocean bridge hospital station harbour harbor port quay dock docks mine mines pit quarry castle abbey cathedral village cottage barn yard square park garden valley mountain mountains island coast shore beach cliff bay cave tower".split(" ").forEach(function (w) { LC[w] = 1; });
  "young small little big large tiny poor rich quiet busy lonely early late long short".split(" ").forEach(function (w) { COMMON[w] = 1; });
  /* WHICH WORDS WERE TYPED WITH A CAPITAL. A story with capitals is told in sentences: a place in it is written with one, so "a coal miner" and
     "a small town" are not places. A story typed all in lower case or all in capitals has no such tell, and every word stays a candidate. */
  function capInfo(raw, tokens) {
    var capAt = [], sentStart = true, comma = false;
    String(raw || "").split(/\s+/).filter(Boolean).forEach(function (w) {
      var cap = /^[("'\u201c\u2018]*\p{Lu}/u.test(w), pieces = S.fold(w).split(" ").filter(Boolean);
      pieces.forEach(function (_, pi) { capAt.push({ cap: cap, init: sentStart, cm: comma && pi === 0 }); });
      sentStart = /[.!?:]["')]*$/.test(w); comma = /[,;]$/.test(w);
    });
    if (capAt.length !== tokens.length) return { capAt: [], mixed: false };
    return { capAt: capAt, mixed: capAt.some(function (x) { return x.cap && !x.init; }) };
  }
  var HYPO = /(?:^| )(?:planned|plan|plans|wanted|want|wants|hoped|hope|dreamed|dreamt|dream|intended|meant|wished|wish|longed|yearned|thought about|thinking of|thinking about|tried|threatened|promised|always said)(?: \S+){0,3}? (?:to|of|about) (?:go|going|move|moving|emigrate|emigrating|get|getting|travel|travelling|traveling|sail|sailing|return|returning|visit|visiting|live|living|settle|settling|see|seeing|reach|reaching)(?: \S+){0,2}$/;
  var NEG = /(?:^| )(?:not|never|neither|nor|didn t|wasn t|weren t|hadn t|hasn t|haven t)(?: \S+){0,3}$/;
  /* Is this candidate not a place, from how the story wrote it? Months and counting words; trades and kinds of ground written small; a word
     written small in a story that capitalises its places; a surname straight after a given name; a place the story says nobody went to. */
  /* «left Senj in 1954 for Sydney», «set off for Perth», «bound for Boston»: "for" stands before a place only after a word of travelling */
  var TRAVEL = /(?:^| )(?:left|leaving|leave|departed|departing|sailed|sailing|set off|set out|headed|heading|bound|embarked|emigrated|emigrating|moved|moving|flew|flying|travelled|traveled|travelling|traveling|ship|steamer|train|boarded|setting off)(?: |$)/;
  function forPlace(tokens, i) { return tokens[i - 1] === "for" && TRAVEL.test(tokens.slice(Math.max(0, i - 8), i - 1).join(" ")); }
  function notPlace(c, tokens, ci, ctx) {
    var person = false;
    var p1 = tokens[c.at - 1] || "", single = c.word.indexOf(" ") < 0, ca = ci.capAt[c.at], pa = ci.capAt[c.at - 1], marked = PREP_PLACE.test(p1);
    if (single && /^(?:flu|influenza|fever|plague|pox|cholera|war|famine|epidemic|pandemic|virus|disease|measles|typhus|typhoid|civil|inquisition|armada)$/.test(tokens[c.at + 1] || "")) return true;   /* "Spanish flu" is not Spanish Wells */
    if (single && (MONTHS[c.word] || NUMW[c.word])) return true;
    if (single && (OCC[c.word] || LC[c.word]) && !(ca && ca.cap && !ca.init && marked)) return true;
    if (single && ci.mixed && ca && !ca.cap && !marked) return true;
    if (single && ca && ca.cap && !ca.cm && pa && pa.cap && !marked && !PLACE_BEFORE[p1] && ctx && ctx.given && ctx.given[p1]) return true;   /* «Sydney, Perth»: a comma between them makes two places, not a first name and a surname */
    /* «Peg Murphy», «Johan Berlin»: a capital word straight after another capital word that is no place and no common word, with no «in / from / to» before it, is the
       second half of a person's name, even when it is also a village (Murphy, North Carolina). The words that begin a place's name (Lake, Mount, New, San) are not names. */
    var p2 = tokens[c.at - 2] || "", first = pa && (pa.init || KINW.test(p2) || /^(?:was|named|called|married|and|mr|mrs|miss|dr|fr|sir|grandad|granddad|grandpa|grandma|gran|nan|nana|nonno|nonna|opa|oma)$/.test(p2));   /* p1 stands where a first name stands; «Anton Kovac Zagreb» is a name and then a town */
    if (single && ca && ca.cap && !ca.cm && !ca.init && pa && pa.cap && first && !marked && !PLACE_BEFORE[p1] && p1 && !(ctx && ctx.map && ctx.map[p1] && ctx.map[p1].length && !(ctx.given && ctx.given[p1])) && !STOP[p1] && !COMMON[p1] && !MONTHS[p1] && !OCC[p1] && !KINW.test(p1) && !PLACE_HEAD.test(p1) && !/^(?:in|at|to|from|of|near|born|died|lived|married|and|the)$/.test(p1)) return true;
    if (single && /^(?:street|st|road|rd|avenue|ave|lane|ln|square|sq|court|drive|terrace|crescent|gardens|close|boulevard|blvd|highway|bridge|quay|wharf|market|station|hotel|inn|pub|church|cathedral|hospital|cemetery|cinema|theatre|theater|bank|hall|college|university|school|brewery|distillery|examiner|times|herald|gazette|chronicle|courier|journal|tribune|observer|mail|post|navy|army|airforce|marines|regiment|battalion)$/.test(tokens[c.at + c.word.split(" ").length] || "") && ca && ca.cap) return true;   /* Dublin Street, the Cork Examiner, the Royal Navy */
    if (single && c.word === "royal") return true;
    if (single && p1 === "o" && ca && ca.cap) return true;   /* «O'Connor» is a name, not Connor */
    /* A SURNAME WITH A PARTICLE after a first name («Maria de la Cruz», «Jan van der Berg») is a person; its last word is not a village */
    (function () {
      var PART = /^(?:de|del|della|degli|dei|di|da|dos|das|do|du|des|la|las|los|le|el|al|van|von|der|den|ter|ten|mac|bin|ibn)$/, k = c.at - 1, n = 0;
      var first = c.word.split(" ")[0]; if (PART.test(first)) n++;
      while (k >= 0 && PART.test(tokens[k] || "")) { n++; k--; }
      if (n > 0 && k >= 0 && !marked && !PREP_PLACE.test(tokens[k] || "") && ((ctx && ctx.given && ctx.given[tokens[k] || ""]) || (n >= 2 && ci.capAt[k] && ci.capAt[k].cap))) person = true;   /* a name before a double particle (van der, de la) is a person even if it is also a month or a village */
    })();
    if (person) return true;
    if (single && /^(?:brothers|sisters|cousins|twins|children|sons|daughters|siblings|uncles|aunts|friends|boys|girls|named|called)$/.test(p1) && ctx && ctx.given && ctx.given[c.word] && !(ca && ca.cap && marked)) return true;   /* «the brothers Ivan and Petar»: people */
    if (single && !marked && /^(?:born|died|wed|lived|buried|baptised|baptized|christened|married)$/.test(c.word)) return true;   /* "Born in Krakow in 1880": the verb, not Born in the Netherlands */
    if (single && /^(?:navy|army|airforce|marines|regiment|battalion|infantry|artillery|cavalry|brigade|legion)$/.test(c.word)) return true;
    var win7 = tokens.slice(Math.max(0, c.at - 7), c.at).join(" "), aft = tokens.slice(c.at + c.word.split(" ").length, c.at + c.word.split(" ").length + 4).join(" ");
    if (HYPO.test(win7) && !/(?:^| )(?:and (?:did|went|moved|left|sailed)|did so|eventually|finally|in (?:1[5-9]\d\d|20[0-2]\d))(?: |$)/.test(aft)) return true;   /* «planned to go to Boston but stayed in Cork» */
    return NEG.test(tokens.slice(Math.max(0, c.at - 4), c.at).join(" "));
  }
  /* A name that is also a given name, standing last in a plain list of places ("Senj, Rijeka, Trieste, Sydney"), is a place: it follows
     two places written straight on from one another, with a comma before it. */
  function listTail(c, cands, text) {
    if (c.word.indexOf(" ") > -1 || !new RegExp(",\\s*(?:and\\s+)?" + c.word + "\\b", "i").test(String(text))) return false;
    var byEnd = Object.create(null); cands.forEach(function (x) { byEnd[x.at + x.word.split(" ").length] = x; });
    var p1 = byEnd[c.at], p2 = p1 && byEnd[p1.at];
    return !!(p1 && p2);
  }
  /* A US state that is also a given name (Georgia, Virginia, Carolina), written straight after a place and a comma ("Athens, Georgia", "born in
     Alexandria, Virginia"), is the state, which says which of the same-named places was meant. A name the index holds as a state of this size and
     nothing else follows a place and a comma only as that. */
  /* A NAME THAT IS ALSO A GIVEN NAME (Sydney, Paris, Florence, Lincoln) BESIDE PLACES IN A LIST is a place: «Perth, Sydney and Melbourne», «Lyon, Paris and Marseille», «visited Sydney, Perth and Melbourne». Its neighbour in the list, joined by a comma, «and», «or» or «then», is a place that is not a given name. */
  function placeList(c, cands, tokens, isGivenWord) {
    if (c.word.indexOf(" ") > -1 || REL.test(tokens[c.at - 1] || "") || /^(?:named|called|mr|mrs|miss|ms|dr|uncle|aunt|auntie|cousin|brother|sister|saint|st|sir|lady|lord|nurse|captain|father|mother)$/.test(tokens[c.at - 1] || "")) return false;
    var JOIN = /^(?:and|or|then|to|via|also|&)$/;
    function placeLike(x) { return x === c || (!x.country && x.rows.length > 0 && !STOP[x.word] && !COMMON[x.word]); }
    function anchor(x) { return x.word.indexOf(" ") > 0 || !isGivenWord(x.word); }   /* a name that is only a place (Melbourne, Lyon) holds the list together; a list of nothing but given names (Thomas, Paris and Maria) is people */
    var seq = cands.filter(placeLike).sort(function (a, b) { return a.at - b.at; }), k = seq.indexOf(c); if (k < 0) return false;
    /* the chain of places this one belongs to: each next place straight after the last, or after one «and»/«or»/«then» */
    var lo = k, hi = k, joined = false;
    function link(a, b) { var end = a.at + a.word.split(" ").length, gap = b.at - end; if (gap === 0) return 1; if (gap === 1 && JOIN.test(tokens[end] || "")) return 2; return 0; }
    while (lo > 0 && link(seq[lo - 1], seq[lo])) { if (link(seq[lo - 1], seq[lo]) === 2) joined = true; lo--; }
    while (hi < seq.length - 1 && link(seq[hi], seq[hi + 1])) { if (link(seq[hi], seq[hi + 1]) === 2) joined = true; hi++; }
    if (!(hi > lo && (joined || hi - lo >= 2))) return false;
    if (/^(?:cousins|sisters|brothers|children|kids|friends|siblings|daughters|sons|aunts|uncles|twins|names|are|were|named|called|namely|including|boys|girls|grandchildren|nephews|nieces|parents|godparents|witnesses|sponsors)$/.test(tokens[seq[lo].at - 1] || "")) return false;   /* «my cousins Paris and Florence», «the children were Sydney, Florence and Lincoln» are people */
    for (var q = lo; q <= hi; q++) if (seq[q] !== c && anchor(seq[q])) return true;
    return false;
  }
  function stateTail(c, cands, text) {
    if (c.word.indexOf(" ") > -1 || !new RegExp("\\p{L}\\s*,\\s*" + c.word + "\\b", "iu").test(String(text))) return false;
    if (!c.rows.some(function (r) { return r.cc === "US" && S.fold(r.n) === c.word && (r.v || 0) >= 500; })) return false;
    return cands.some(function (x) { return x !== c && x.at + x.word.split(" ").length === c.at && x.rows.some(function (r) { return r.cc === "US"; }); });
  }
  var MOVE = /\b(moved|move|went|followed|go|came|come|travelled|traveled|emigrated|migrated|sailed|settled|relocated|then|to|into|arrived|returned|left)\b/;
  var ANC = /\b(?:his|her|their|a|the)\s+(grandfather|grandmother|father|mother|dad|mum|mom)\b/g;
  var PLACE_HEAD = /^(?:lake|mount|mt|saint|st|san|santa|sao|new|old|north|south|east|west|upper|lower|great|little|port|fort|cape|isle|bad|bois|el|la|los|las|le|les|das|der|die|de|del|du|des|al|bir|tel|ras|gora|veliki|mali|nova|novi|nuevo|nueva|villa|monte|mont|puerto|ciudad|ville|city|town|village|county|district|province|region|state|republic|kingdom|republika|costa|punta|rio|ponte|borgo|castel|castelo|sant|sankt|bad)$/;
  var PLACE_BEFORE = { from: "from", of: "from", to: "to", into: "to", at: "to" };
  /* the small words that sit between a first name and a surname: «Maria de la Cruz», «Jan van der Berg», «Mary Di Marco» */
  var PARTICLES = "de|del|della|degli|dei|di|da|dos|das|do|du|des|la|las|los|le|el|al|van|von|der|den|ter|ten|bin|ibn|st|saint|mac";
  var ADVERBISH = /^(?:nearly|almost|barely|never|always|also|later|soon|then|once|finally|sadly|suddenly|really|still|only|just|already|often|sometimes|probably|maybe|perhaps|quietly|unfortunately|apparently|eventually|slowly|quickly|simply|even|ever)$/;

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
  /* a surname with its particles: «de la Cruz», «van der Berg», «Di Marco»: a particle before the last word is written small, except Di/Mac-style forms the teller capitalised */
  function surnameCase(sn) { var ws = String(sn).split(/\s+/); return ws.map(function (w, i) { return i < ws.length - 1 && new RegExp("^(?:" + PARTICLES + ")$", "i").test(w) && w === w.toLowerCase() ? w : cased(w); }).join(" "); }
  /* THE SURNAME RIGHT AFTER A GIVEN NAME: "my grandfather Antonio Rossi", "my mum Peg Murphy", "Jan van der Berg". Written straight after the name, with no
     "from" or comma between, a capitalised word is the surname even when a town bears it too (Berlin, Murphy). Particles are kept as written. */
  var PART_ANY = "(?:" + PARTICLES.split("|").map(function (w) { return "[" + w.charAt(0).toUpperCase() + w.charAt(0) + "]" + w.slice(1); }).join("|") + ")";
  var SUR_AFTER = new RegExp("^[ \\t]+((?:" + PART_ANY + "[ \\t]+){0,3}\\p{Lu}[\\p{L}'\u2019-]+)(?![\\p{L}'\u2019-])", "u");
  function surnameAfter(rest) {
    var m = SUR_AFTER.exec(String(rest || "")); if (!m) return null;
    var ws = m[1].split(/\s+/), w = ws[ws.length - 1], f = S.fold(w);
    if (STOP[f] || COMMON[f] || MONTHS[f] || OCC[f] || KINW.test(f) || REL.test(w) || ADVERBISH.test(f) || CONNECT.test(w) || EV_BORN.test(f) || EV_DIED.test(f) || EV_WED.test(f) || EV_MOVE.test(f)) return null;
    return { sur: surnameCase(m[1]), len: m[0].length };
  }
  function cased(w) { w = String(w || ""); return w && (w === w.toLowerCase() || w === w.toUpperCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }

  /* A NEAR MISS IS OFFERED, NEVER USED. "Brisban", "Melborne", "Senju" (Senj, in the case Croatian puts it in): a capitalised word after in / from / to
     that is no place, one letter off one that is. The story keeps what was written; the reader is asked "did you mean". */
  function oneOff(a, b) {
    if (a === b) return false;
    var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    var i = 0; while (i < la && i < lb && a.charAt(i) === b.charAt(i)) i++;
    if (la === lb) { if (a.slice(i + 1) === b.slice(i + 1)) return true; return a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.slice(i + 2) === b.slice(i + 2); }
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }
  function didYouMean(text, ctx) {
    var map = ctx && ctx.map; if (!map) return [];
    var idx = map["#bk"];
    if (!idx) { idx = Object.create(null); Object.keys(map).forEach(function (k) { if (k.indexOf(" ") > -1 || k.length < 4 || k.charAt(0) === "#") return; var b = k.charAt(0) + k.length; (idx[b] = idx[b] || []).push(k); }); try { Object.defineProperty(map, "#bk", { value: idx, enumerable: false }); } catch (e) { /* not cached */ } }
    var out = [], tx = String(text || ""), m, seen = Object.create(null), words = [], said = Object.create(null), ftx = " " + S.fold(tx) + " ";
    Object.keys(ctx.countries || {}).forEach(function (cc) { var nm = S.fold(ctx.countries[cc]); if (nm && ftx.indexOf(" " + nm + " ") > -1) said[cc] = 1; });
    Object.keys(FORMER).forEach(function (nm) { if (ftx.indexOf(" " + nm + " ") > -1) (FORMER[nm].cc || []).forEach(function (cc) { said[cc] = 1; }); });
    /* a story typed all in lower case has no capitals to tell a place by, so any word after "to" or in a list of places is looked at ("then salisburg, rhodesia") */
    var lower = tx === tx.toLowerCase(), W = lower ? "\\p{L}" : "\\p{Lu}";
    var re = new RegExp("\\b(?:in|at|from|near|to|into|en|nach|iz|u)\\s+(" + W + "[\\p{L}'\u2019-]{3,})((?:\\s*(?:,|and|then|&)\\s+(?:(?:and|then)\\s+)*" + W + "[\\p{L}'\u2019-]{3,})*)", "gu"), wre = new RegExp(W + "[\\p{L}'\u2019-]{3,}", "gu");
    while ((m = re.exec(tx))) {
      /* the first word of a two-word place the Atlas holds («Nova Gradiška») is not a misspelt place of its own */
      var endOne = m.index + m[0].indexOf(m[1]) + m[1].length, nxw = /^\s+(\p{L}[\p{L}'\u2019-]*)/u.exec(tx.slice(endOne));
      if (nxw && map[S.fold(m[1]) + " " + S.fold(nxw[1])]) continue;
      words.push(m[1]);
      (m[2] || "").replace(wre, function (x) { if (!/^(?:and|then)$/i.test(x)) words.push(x); return x; });
    }
    for (var wi = 0; wi < words.length; wi++) {
      m = [null, words[wi]];
      var w = S.fold(m[1]); if (!w || seen[w] || map[w] || STOP[w] || COMMON[w] || MONTHS[w] || (ctx.given && ctx.given[w]) || (ctx.skip && ctx.skip[w])) continue;
      seen[w] = 1;
      var keys = [], L = w.length;
      [L - 1, L, L + 1].forEach(function (l) { (idx[w.charAt(0) + l] || []).forEach(function (k) { if (oneOff(w, k)) keys.push(k); }); });
      ["om", "em", "ju", "u", "a", "i", "e"].forEach(function (suf) { if (L > suf.length + 3 && w.slice(-suf.length) === suf && map[w.slice(0, -suf.length)] && keys.indexOf(w.slice(0, -suf.length)) < 0) keys.push(w.slice(0, -suf.length)); });
      if (!keys.length) continue;
      keys.sort(function (a, b) { var ra = map[a][0], rb = map[b][0]; return ((rb.c || 0) - (ra.c || 0)) || ((rb.v || 0) - (ra.v || 0)); });
      out.push({ typed: m[1], kind: "typo", options: keys.slice(0, 3).map(function (k) {
        /* of the places that go by the name, the one in a country the story itself names ("Salisburg, Rhodesia" is Salisbury in Zimbabwe, not North Carolina) */
        var rows = map[k], r = rows.filter(function (x) { return said[x.cc]; })[0] || rows[0], nm = String(r.n).replace(/\s*\([^)]*\)/g, "");
        if (S.fold(nm) !== k) nm = k.charAt(0).toUpperCase() + k.slice(1);   /* the old name the typed word was close to, not the name the Atlas files it under now */
        return { n: nm, cc: r.cc, cn: ctx.countries && ctx.countries[r.cc] || r.cc };
      }) });
    }
    return out.slice(0, 4);
  }
  /* WHAT TO ASK THE WORLDWIDE GAZETTEER FOR. A name after in / at / from / near / to the Atlas does not hold; and a town that has the name only in
     other countries when the story says where it is ("Dublin, Ohio": the Atlas holds a Dublin in Ireland and one in Canada, not the one in Ohio).
     Pure, so the page and the tests use the same rule; the loader fetches the shards and calls gazMerge. */
  /* WEAK: books on the shelf for the name are a handful in all and nothing counts it (Perth: six books in Scotland, one in Ontario, and no Perth in Western Australia, which is the Perth of most stories). */
  function hasOwn(rows, ph) { return (rows || []).some(function (r) { return S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "").split(",")[0]) === ph; }); }   /* a row that is called exactly that, not one that merely has it inside a longer name (Friuli in Pozzuolo del Friuli) */
  function weak(rows) { var n = 0; (rows || []).forEach(function (r) { n += (r.v || 0); if (r.c > 0 || r.al || r.exo) n += 1e6; }); return (rows || []).length > 0 && n < 50; }
  function thin(rows) { return !(rows || []).some(function (r) { return r.c > 0 || r.al || r.exo || (r.v || 0) > 0; }); }
  /* a name the index holds only as its own county, district or the like ("Peoria" as Peoria County): no row is the place itself, so the gazetteer is asked
     for it. A name that sits inside other names ("Friuli" in Pozzuolo del Friuli) is a region, not this, and is left to the "did you mean" rule. */
  function partialOnly(rows, ph) {
    var ADMIN = /\b(?:county|province|parish|district|municipality|area|region|borough|shire|prefecture|department|oblast|canton)\b/g;
    return (rows || []).length > 0 && rows.every(function (r) { var n = S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "").split(",")[0]); return n !== ph && n.replace(ADMIN, " ").replace(/\s+/g, " ").trim() === ph; });
  }
  /* the nominative a Slavic ending may hide: Senju > Senj, Rijeci > Rijeka, Zagrebu > Zagreb, Krakowie > Krakow, Ljubljani > Ljubljana, Warszawie > Warszawa (folded forms) */
  function stemsOf(f) {
    var c = [];
    if (/ci$/.test(f)) c.push(f.slice(0, -2) + "ka");
    if (/ie$/.test(f)) c.push(f.slice(0, -2) + "a", f.slice(0, -2));
    if (/(?:om|em|im|ju|mu|iu)$/.test(f)) c.push(f.slice(0, -2));
    if (/ju$/.test(f)) c.push(f.slice(0, -1));
    if (/[ei]$/.test(f)) c.push(f.slice(0, -1) + "a");
    if (/[uaeio]$/.test(f)) c.push(f.slice(0, -1));
    return c.filter(function (x, i) { return x.length >= 4 && c.indexOf(x) === i; });
  }
  var SLAV_PREP = /(^|[\s(,;])((?:[Uu]|[Ii]z|[Oo]d|[Dd]o|[Kk]od|[Bb]lizu|[Ww]e?|[Vv]|[Zz]e?))\s+(\p{Lu}[\p{L}'\u2019-]{3,})(?![\p{L}])/gu;
  function gazWants(text, map, given) {
    var fold = S.fold, want = [], t = cleanInput(text);   /* the same text the reader will read: normalised, no zero-width marks, no address numbers */
    /* «left Ennis for Geelong»: a place after left, and after "for" when the sentence is one of travel */
    t = t.replace(/\b(left|leaving|sailed|departed|bound|headed|emigrated|moved)\b([^.!?]{0,40}?)\bfor\s+(?=\p{Lu})/gu, "$1$2to ");
    var re = /\b(?:in|at|from|near|to|before|after|until|toward|towards|via|en|nach|aus|von|iz|nel|nella|left|leaving|departed)\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+){0,2})/gu, m;
    while ((m = re.exec(t))) {
      var ws = m[1].split(/\s+/);
      /* a name the index holds only as bare gazetteer rows (Alexandria, Warsaw: a village in Virginia, a town in Indiana) is looked up in the worldwide gazetteer too, so the city is one of the readings */
      for (var n = ws.length; n >= 1; n--) { var ph = fold(ws.slice(0, n).join(" ")); if (map[ph] && (thin(map[ph]) || partialOnly(map[ph], ph) || (weak(map[ph]) && hasOwn(map[ph], ph)))) { want.push({ ph: ph, ccs: null, more: true }); break; } if (map[ph]) break; want.push({ ph: ph, ccs: null }); }
      /* the rest of a list that name begins («in Lyon, Paris and Marseille»): each capitalised member is looked up as well */
      var after = t.slice(m.index + m[0].length), rest = (map[fold(ws[0])] || /^\s*,/.test(after)) ? after : "", lm, lre = /^(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)(\p{Lu}[\p{L}'\u2019-]+)/u;
      var members = []; while ((lm = lre.exec(rest))) { members.push({ w: fold(lm[1]), and: /\b(?:and|or)\b/.test(lm[0]) }); rest = rest.slice(lm[0].length); }
      if (members.length >= 2 || (members.length === 1 && members[0].and)) members.forEach(function (mm) { var lph = mm.w; if (!map[lph]) want.push({ ph: lph, ccs: null }); else if (thin(map[lph]) || partialOnly(map[lph], lph) || (weak(map[lph]) && hasOwn(map[lph], lph))) want.push({ ph: lph, ccs: null, more: true }); });
    }
    var sl = new RegExp(SLAV_PREP.source, "gu");
    while ((m = sl.exec(t))) { var sf = fold(m[3]); if ((map[sf] && map[sf].length) || (given && given[sf])) continue; stemsOf(sf).slice(0, 3).forEach(function (c) { if (!map[c]) want.push({ ph: c, ccs: null }); }); }
    var pr = /(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)(\s*,?\s*)(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)/gu;
    while ((m = pr.exec(t))) {
      var comma = m[2].indexOf(",") > -1, fx = fold(m[1]), fy = fold(m[3]), rx = map[fx], ry = map[fy]; if (!rx || !ry) continue;
      var ccs = []; ry.forEach(function (r) { if (r.cc && ccs.indexOf(r.cc) < 0) ccs.push(r.cc); });
      if (comma && ccs.length && !rx.some(function (r) { return ccs.indexOf(r.cc) > -1; })) want.push({ ph: fx, ccs: ccs });
      /* "Springfield, Illinois" / "Springfield Illinois": the index holds one Springfield in the US and not necessarily that one; a US state after a town asks for
         the town's namesakes in the US, and the nearest to the state is chosen */
      else if (ry.every(function (r) { return r.cc === "US"; }) && ry.some(function (r) { return S.fold(r.n) === fy && (r.v || 0) >= 500; }) && !rx.some(function (r) { return r.c > 0; }) && !rx.some(function (r) { return S.fold(String(r.n)).slice(-fy.length - 1) === " " + fy; })) want.push({ ph: fx, ccs: ["US"] });
    }
    var seen = Object.create(null);
    return want.filter(function (w) { var k = w.ph + "|" + (w.ccs || []).join(); if (w.ph.length < 4 || seen[k] || (given && given[w.ph])) return false; if (!w.ccs && !w.more && map[w.ph]) return false; seen[k] = 1; return true; }).slice(0, 16);
  }
  /* rows from a gazetteer shard are [name, lat, lon, cc, otherNames]; the ones that are this name are added to the map */
  function gazMerge(map, w, shardRows) {
    var fold = S.fold, hit = (shardRows || []).filter(function (r) { return fold(r[0]) === w.ph || (r[4] || []).some(function (a) { return fold(a) === w.ph; }); });
    if (w.ccs) hit = hit.filter(function (r) { return w.ccs.indexOf(r[3]) > -1; });
    /* a place that has the name as its OWN name comes before, and instead of, a place that only lists it among its other names
       (Clifden in Galway, not Rathgarvan in Kilkenny, whose list of names happens to include "Clifden") */
    var own = hit.filter(function (r) { return fold(r[0]) === w.ph; }); if (own.length) hit = own;
    var have = map[w.ph] || [], part = partialOnly(have, w.ph);
    if (part) hit = own;   /* the index has the name only inside others (Peoria County, Pozzuolo del Friuli): only a place of that very name counts, and the county's own middle is no duplicate of it */
    hit = hit.filter(function (r) { return part || !have.some(function (h) { return h.cc === r[3] && h.y != null && Math.abs(h.y - r[1]) < 0.25 && Math.abs(h.x - r[2]) < 0.25; }); });
    hit = hit.slice(0, w.ccs || part ? 20 : 8); if (!hit.length) return 0;
    var rows = hit.map(function (r) { return { i: "g-" + w.ph.replace(/ /g, "-") + "-" + String(r[3]).toLowerCase() + "-" + Math.round(r[1] * 100), n: r[0], y: r[1], x: r[2], cc: r[3], c: 0, gaz: 1, alt: (r[4] || []).length }; });   /* how many other names the gazetteer lists for it: a city has many, a village few, and among namesakes that is the importance */
    /* THE GAZETTEER'S ORDER IS ITS IMPORTANCE (Dresden in Germany before the Dresdens of Ohio and Ontario), and an index that holds the name only as bare rows (no
       volumes, no count) has no evidence to put one of its own first. David, on Dresden: «isnt dresden in germany?». Where the index has a row with books or a count,
       it still comes first, as before. */
    var bare = !w.ccs && !part && have.length && (thin(have) || weak(have));
    map[w.ph] = part ? rows.concat(have.map(function (h) { return Object.assign({}, h, { partial: 1 }); })) : bare ? rows.concat(have) : (map[w.ph] || []).concat(rows);   /* the place itself comes before the counties and villages that only carry its name */
    return rows.length;
  }

  /* WHAT A PLACE WAS CALLED. place-aliases.json (built from the places' own older names and the dated-names catalogue) maps a whole folded name
     to the Atlas places that answer to it: Fiume to Rijeka, Pola to Pula, Gallignana to Gracisce. The index row only carries these as one long
     string, so a place with several older names lost them; here each name is its own key. A name that is also an ordinary word, a month, a trade
     or a given name is left out, as the index's own words are. Rows are copies marked `al`, so the place is the same place. */
  function aliasMerge(map, rows, al, given) {
    var byId = Object.create(null), added = 0;
    rows.forEach(function (r) { if (r && r.i != null && !byId[r.i]) byId[r.i] = r; });
    Object.keys(al || {}).forEach(function (k) {
      if (k.length < 4 || STOP[k] || COMMON[k] || OCC[k] || MONTHS[k] || (given && given[k])) return;
      (al[k] || []).forEach(function (id) {
        var r = byId[id]; if (!r) return;
        var list = map[k] || (map[k] = []);
        if (list.some(function (x) { return x.i === r.i; })) return;
        list.push(Object.assign({}, r, { al: 1 })); added++;
      });
    });
    return added;
  }

  /* A COUNTRY THE ATLAS HOLDS NO PLACE IN is still a country: Israel, in a story, is not a village in Mexico. The middle of each country from
     country-points.json is added for the ones the index has no rows for, so a country named in a story is a stop at its middle. */
  function countryPoints(map, list) {
    var cen = map && map["#country"], n = 0; if (!cen) return 0;
    (list || []).forEach(function (c) { if (c && c.cc && !cen[c.cc] && typeof c.x === "number" && typeof c.y === "number") { cen[c.cc] = { x: c.x, y: c.y }; n++; } });
    return n;
  }

  /* ---- THE LIFE AS TOLD ---------------------------------------------------------------------------------------------------
     People tell more than where and when: "he loved ice cream and had dark hair and was a world class runner, married twice, the second wife
     divorced him and took his money and he went to jail, then met his third wife in a snow storm, it was love at first sight". None of that is
     a place or a year, and none of it may be dropped, guessed at or turned into a fact. This reads a story clause by clause and keeps each
     clause that says how they looked, what they loved, what they were like, how a marriage went, what went wrong, what they gave up or wanted,
     the weather and the world around them, and how they died, in the words the story used, under a plain heading. Nothing is looked up from it:
     a clause is "as told", never "found". A clause can sit under more than one heading. */
  var LIFE_GROUPS = [
    { key: "looks", title: "How they looked", re: /\b(hair|eyes|beard|mou?stache|freckle\w*|complexion|handsome|beautiful|pretty|good[- ]looking|bald|tall|slim|stout|scar\w*|limp\w*|tattoo\w*|looked like|resembl\w+|wore|dressed|blond\w*|brunette|red[- ]?head\w*|grey[- ]haired|gray[- ]haired)\b/i },
    { key: "loves", title: "What they loved", re: /\b(lov(?:ed|es)(?! at first)|loving (?:to|the|his|her|their|every)|enjoyed|adored|fond of|favou?rite|passion(?:ate)? (?:for|about)|hobb(?:y|ies)|obsessed|couldn'?t resist|never without)\b/i },
    { key: "character", title: "What they were like", need: /\b(he|she|they|i|we|man|woman|boy|girl|father|mother|grandfather|grandmother|grandad|grandma|nonno|nonna|uncle|aunt|his|her|their|was|were|became|got|grew|always)\b/i, re: /\b(loving|devoted|caring|brave|kind|generous|gentle|stubborn|hard[- ]?working|strict|funny|funn(?:ier|iest)|kindest|bravest|strongest|strong|weak|honest|selfish|greedy|hot[- ]tempered|quiet|shy|proud|angry|furious|jealous|bitter|clever|wise|religious|devout|musical|gifted|talented|brilliant|famous|respected|feared|loyal|cheerful|stern|warm|cold|humble|ambitious|lazy|lucky|unlucky|wild|charming|serious|heartbroken|ashamed|lonely|temper|world[- ]class|champion|runner|swimmer|dancer|singer|storyteller|boxer|wrestler|footballer|athlete|fighter|leader|hero)\b/i },
    { key: "romance", title: "Love and marriage", re: /(divorc\w+|separated|remarried|widow\w*|annul\w+|bigam\w+|eloped?|\b(?:first|second|third|fourth|fifth|1st|2nd|3rd) (?:wife|husband|marriage)\b|\b(?:twice|three times|four times)\b.*\bmarried|\bmarried\b.*\b(?:twice|three times|four times)\b|love at first|fell in love|sweetheart|courted|courtship|proposed|engaged|affair|cheated|left (?:him|her)|true love|\bmet (?:his|her|a|the|their)\b)/i },
    { key: "family", title: "The family around them", re: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|no|many|several) (children|kids|sons|daughters|boys|girls|grandchildren|brothers|sisters|siblings)\b|\b(childless|adopted|stepchild\w*|twins|orphan\w*|raised by|brought up by|foster\w*)\b/i },
    { key: "hard", title: "Hard times", not: /\b(?:never|not|didn'?t|hadn'?t) lost\b|\blost (?:his|her|their) (?:faith|temper|mind|way)\b/i, re: /\b(beat(?:ing|s)? (?:his|her|the|their)|hit (?:his|her|the)|jail|prison|imprison\w+|arrest\w+|convict\w+|sentenced|trial|fined|executed|hanged|deport\w+|intern(?:ed|ment)|camp|prisoner|fled|escaped|refugee|exile\w*|bankrupt\w*|lost (?:his|her|their|everything|the|a)\b|los(?:ing|s of) (?:the|his|her|their|everything|a)\b|took (?:his|her|their|the) (?:money|house|land|farm|home|children|everything)|everything in it|stole|robbed|poverty|poor|starv\w+|hunger|evict\w+|homeless|stillborn|miscarriage|lost a child|illness|sick|disease|injur\w+|accident|crippled|disabled|blind|drank|drunk|alcohol\w*|gambl\w+|debt|fired|unemployed|strike|lockout|war|battle|conscript\w+|drafted|enlisted|fought|wounded|shot|beaten|abus\w+|violen\w+)\b/i },
    { key: "health", title: "Illness and injury", re: /\b(diph?th?e?r(?:ia|a)|tuberculosis|\bTB\b|consumption|cholera|typhoid|typhus|smallpox|measles|polio|scarlet fever|rheumatic fever|whooping cough|influenza|\bflu\b|pneumonia|malaria|dysentery|tetanus|cancer|leuk(?:a)?emia|epilepsy|paralys\w+|sickly|illness|disease|fever|infection|ill(?= (?:for|with|from|as a|when|in))|sick(?= (?:for|with|from|as a|when|in))|(?:nearly|almost) died|(?:close|near) to death|injur\w+|wounded|broke (?:his|her|their) \w+|lost (?:his|her|their) (?:leg|arm|eye|sight|hearing|hand|foot|voice)|went (?:blind|deaf)|had (?:an? )?(?:operation|surgery)|in (?:the )?hospital)\b/i },
    { key: "gave", title: "What they gave up", re: /\b(sacrific\w+|gave up|went without|worked (?:two|three|\w+ )?jobs|sent money|sending money|saved (?:every|up)|never went back|never saw (?:his|her|them|their)|left (?:his|her|their) (?:family|children|home|village|country)|left behind|put (?:his|her) children)\b/i },
    { key: "wanted", title: "What they wanted", re: /\b(wanted|dreamed|dreamt|hoped|longed|wished|ambition|aspired|planned to|always wanted|yearned|promised)\b/i },
    { key: "world", title: "The weather and the world around them", re: /\b(snow\w*|blizzard|storm\w*|flood\w*|drought|famine|frost\w*|freezing|heat ?wave|earthquake|volcano|eruption|hurricane|cyclone|typhoon|monsoon|tornado|landslide|avalanche|shipwreck\w*|bushfire|fire|epidemic|plague|cholera|locusts|hard winter|bitter winter|voyage|crossing|steamer)\b/i }
  ];
  /* the causes a story may give for a death, as told; "of / from / after / due to" or the verb itself carries it */
  var CAUSE_RE = /\b(tuberculosis|consumption|\bTB\b|cholera|typhoid|typhus|smallpox|measles|diphtheria|scarlet fever|whooping cough|spanish (?:flu|influenza)|influenza|the flu|\bflu\b|pneumonia|malaria|dysentery|the plague|\bplague\b|cancer|leuk(?:a)?emia|heart attack|heart failure|heart disease|stroke|childbirth|giving birth|old age|natural causes|accident|mining accident|mine collapse|fire|drowning|starvation|famine|exposure|frostbite|suicide|his own life|her own life|the war|war|battle|combat|bombing|air raid|execution|murder|stabbed|poison(?:ed|ing)?|infection|fever|a long illness|illness|kidney failure|diabetes|covid(?:-19)?|coronavirus|polio|sepsis|gangrene|wounds)\b/i;
  var DEATH_RE = /\b(died|dies|passed away|killed|drowned|murdered|executed|hanged|shot dead|perished|lost (?:his|her) life|took (?:his|her) own life|succumbed|was lost at sea|was lost)\b([^.;!?\n]*)/i;
  var LIFE_ITEM = "(?:\\p{Lu}[\\p{L}'\u2019-]+|(?:one|a|an)\\s+\\p{L}+(?:\\s+\\p{L}+)?)";
  var LIFE_LIST = new RegExp("\\b(?:are|were|named|called|include[sd]?|including|namely)\\s+" + LIFE_ITEM + "(?:\\s*,\\s*(?:and\\s+)?" + LIFE_ITEM + ")+(?:\\s+and\\s+" + LIFE_ITEM + ")?", "gu");
  function readLife(t, ctx, out) {
    var text = String(t || "").replace(/\s+/g, " "), groups = Object.create(null), any = 0, seen = Object.create(null);
    function add(key, clause) {
      if (clause === clause.toUpperCase() && /\p{L}{3}/u.test(clause)) clause = clause.toLowerCase().replace(/\bi\b/g, "I");   /* typed in capitals: told in sentence case, so the kin prefix below still reads */
      clause = clause.replace(/\u0001/g, ",").replace(/ \u0002 /g, " and ");
      var c = clause.replace(/^[\s,;:-]+|[\s,;:.!?-]+$/g, "").replace(/^(?:and|but|then|so|yet|because|until|after|when|while|before|that|who|which)\s+/i, "")
        .replace(/^(?:[Mm]y|[Oo]ur|[Hh]is|[Hh]er|[Tt]heir)\s+(?:great[- ])*(?:grand\w+|father|mother|dad|mum|mom|uncle|aunt|brother|sister|husband|wife)(?:\s+(?:from|of|in)\s+\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)?\s+(?=\p{L})/u, "");
      if (c.length < 6 || c.length > 160 || c.split(" ").length < 2) return;
      var k = key + "|" + c.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      (groups[key] = groups[key] || []); if (groups[key].length < 6) { groups[key].push(c.charAt(0).toUpperCase() + c.slice(1)); any++; }
    }
    text.split(/(?<=[.!?])\s+/).forEach(function (sent) {
      /* «Their 5 kids are Jana, Mila, Manda, Franjo, and one unknown brother» is one thing told, not five clauses: the commas in a list of names stay with it */
      sent = sent.replace(LIFE_LIST, function (m) { return m.replace(/,/g, "\u0001").replace(/\s+and\s+/g, " \u0002 "); });
      sent.split(/\s*[,;]\s*|\s+(?:and|but|then|so|yet|because|until|after|when|while|before|though|although|that|who|which)\s+/i).forEach(function (cl) {
        if (!cl || !cl.trim()) return;
        LIFE_GROUPS.forEach(function (g) { if (g.re.test(cl) && (!g.need || g.need.test(cl)) && !(g.not && g.not.test(cl))) add(g.key, cl); });
      });
    });
    /* how many times married: "married twice", "his third wife", "remarried" */
    var ord = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }, times = { twice: 2, "three times": 3, "four times": 4, "five times": 5 }, n = 0, mt;
    (text.match(/\b(first|second|third|fourth|fifth) (?:wife|husband)\b/gi) || []).forEach(function (m) { n = Math.max(n, ord[m.split(" ")[0].toLowerCase()]); });
    if ((mt = /\bmarried (twice|three times|four times|five times)\b/i.exec(text))) n = Math.max(n, times[mt[1].toLowerCase()]);
    if (/\bremarried\b/i.test(text)) n = Math.max(n, 2);
    /* how they died: the cause, the year, the age, the place named in that stretch, all as told */
    var died = null, dm = null, dre = new RegExp(DEATH_RE.source, "gi"), dx;
    while ((dx = dre.exec(text))) { if (!/\b(?:nearly|almost|barely|just about|could have|might have|may have|would have|should have|didn'?t|did not|never|not)\s+$/i.test(text.slice(Math.max(0, dx.index - 18), dx.index))) { dm = dx; break; } dre.lastIndex = dx.index + dx[1].length; }   /* "nearly died" is a life that went on; the words after it may hold a real death */
    if (dm) {
      var whole = dm[0], cm = CAUSE_RE.exec(whole), ym = /\b(1[4-9][0-9]{2}|20[0-2][0-9])\b/.exec(whole), am = /\b(?:aged?|at the age of|at)\s+(\d{1,3})\b/i.exec(whole);
      var verbCause = /^(drowned|murdered|executed|hanged|shot dead|killed|perished|succumbed|took)/i.test(dm[1]) ? dm[1].toLowerCase().replace(/^took .*/, "took their own life") : "";
      died = { clause: whole.replace(/[\s,;]+$/, ""), cause: cm ? cm[1].replace(/^the /i, "").toLowerCase() : "", verb: verbCause, year: ym ? Number(ym[1]) : null, age: am ? Number(am[1]) : null };
      var after = /\b(?:after|following)\s+(?:a|an|the|his|her)\s+([^.;,]+)/i.exec(whole);
      if (!died.cause && after) died.cause = after[1].trim().toLowerCase();
      if (!died.cause && verbCause) died.cause = verbCause;
      if (!died.cause && /\b(?:in|at) the war\b/i.test(whole)) died.cause = "the war";
      if (/own life|suicide/i.test(died.cause + " " + whole)) died.cause = "taking their own life";
      else if (died.verb === "killed" && died.cause && /^(war|battle|combat|bombing|air raid)$/.test(died.cause)) died.cause = "killed in the " + died.cause;
      else if (died.verb === "killed" && died.cause && /^(accident|mining accident|mine collapse|fire)$/.test(died.cause)) died.cause = "killed in " + (/^accident|^a/.test(died.cause) ? "an " : "a ") + died.cause;
      any++;
    }
    /* "5 children and 12 grandchildren": counts only, nobody is named */
    var NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20 }, counts = {}, cre = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\s+(children|kids|grandchildren|grandkids|sons|daughters)\b/gi, cm2;
    while ((cm2 = cre.exec(text))) { var kk = /grand/i.test(cm2[2]) ? "grandchildren" : /^(children|kids)$/i.test(cm2[2]) ? "children" : cm2[2].toLowerCase(), nn = /^\d/.test(cm2[1]) ? Number(cm2[1]) : NUMS[cm2[1].toLowerCase()]; if (nn && counts[kk] == null) counts[kk] = nn; }
    /* what they were ill with, as told ("had diphtheria"), spelt properly; and whether they came close to dying of it */
    var ILLS = [[/\bdiph?th?e?r(?:ia|a)\b/i, "diphtheria"], [/\b(?:tuberculosis|TB|consumption)\b/i, "tuberculosis"], [/\bcholera\b/i, "cholera"], [/\btyphoid\b/i, "typhoid"], [/\btyphus\b/i, "typhus"], [/\bsmallpox\b/i, "smallpox"], [/\bmeasles\b/i, "measles"], [/\bpolio\b/i, "polio"], [/\bscarlet fever\b/i, "scarlet fever"], [/\bwhooping cough\b/i, "whooping cough"], [/\b(?:influenza|flu)\b/i, "influenza"], [/\bpneumonia\b/i, "pneumonia"], [/\bmalaria\b/i, "malaria"], [/\bdysentery\b/i, "dysentery"], [/\btetanus\b/i, "tetanus"], [/\bcancer\b/i, "cancer"]], illness = [];
    ((groups.health) || []).forEach(function (x) { ILLS.forEach(function (il) { if (il[0].test(x) && illness.indexOf(il[1]) < 0 && !(died && died.cause === il[1])) illness.push(il[1]); }); });
    var nearDeath = /\b(?:nearly|almost) (?:died|dying|lost (?:his|her|their) life)\b|\b(?:close|near) to death\b/i.test(text);
    /* the death is told once, under its own heading, not again as a hard time */
    if (died) Object.keys(groups).forEach(function (k) { groups[k] = groups[k].filter(function (x) { var a = x.toLowerCase(), b = died.clause.toLowerCase(); return b.indexOf(a) < 0 && a.indexOf(b) < 0 && !(died.cause && a.replace(/^(?:he|she|they) (?:was |were )?/, "") === died.cause); }); });
    var occ = (out && out.occupations) || [];
    var gl = LIFE_GROUPS.map(function (g) { return { key: g.key, title: g.title, items: groups[g.key] || [] }; }).filter(function (g) { return g.items.length; });
    return { groups: gl, illness: illness, nearDeath: nearDeath,
      married: n, died: died, occupations: occ, counts: counts, n: gl.reduce(function (a, g) { return a + g.items.length; }, 0) + (n > 1 ? 1 : 0) + (died ? 1 : 0) + occ.length };
  }
  /* The events the Atlas holds for the years of a death that the cause may mean: an influenza death in 1919 and the 1918 pandemic; a famine; a world war
     for "killed in the war". Said as "may be what is meant", never as the cause. `mort` is mortality.json. */
  function lifeEvents(life, mort) {
    var out = [];
    if (!life || !life.died || !mort || !mort.events || life.died.year == null) return out;
    var y = life.died.year, c = (life.died.cause || "") + " " + (life.died.clause || ""), tests = [];
    if (/influenza|\bflu\b/i.test(c)) tests.push(function (e) { return /influenza/i.test(e.n); });
    if (/cholera/i.test(c)) tests.push(function (e) { return /cholera/i.test(e.n); });
    if (/plague/i.test(c)) tests.push(function (e) { return /plague/i.test(e.n); });
    if (/typhus|smallpox|typhoid/i.test(c)) tests.push(function (e) { return e.ty === "epidemic"; });
    if (/famine|starv/i.test(c)) tests.push(function (e) { return e.ty === "famine"; });
    if (/\bwar\b|battle|combat|bombing|air raid/i.test(c)) tests.push(function (e) { return e.ty === "war" && e.g; });
    if (!tests.length) return out;
    mort.events.forEach(function (e) { if (e.f <= y && (e.t == null || e.t >= y) && tests.some(function (f) { return f(e); })) out.push({ n: e.n, f: e.f, t: e.t }); });
    return out.slice(0, 3);
  }
  /* The block for the report: each group under its plain heading, then what usually leaves a record, in words. Never a finding. */
  function lifeBlock(life, mort) {
    if (!life || !life.n) return null;
    var box = el("div", null, "lf-life");
    box.append(el("p", "What the story said about the person, in its own words. It is kept as told: none of it is looked up or checked, and none of it is a record.", "cap"));
    function group(title, items, cls) { if (!items.length) return; var d = el("div", null, "lf-life-g" + (cls ? " " + cls : "")); d.append(el("h4", title, "lf-life-h")); var ul = el("ul", null, "lf-life-l"); items.forEach(function (x) { ul.append(el("li", x)); }); d.append(ul); box.append(d); }
    if (life.occupations.length) group("Work", [life.occupations.join(", ")]);
    if (life.died) {
      var dd = life.died, bits = [];
      if (dd.cause) bits.push("Cause: " + dd.cause.replace(/^(?:of|from) /, ""));
      if (dd.year != null) bits.push("Year: " + dd.year);
      if (dd.age != null) bits.push("Age: " + dd.age);
      bits.push("As told: \u201c" + dd.clause.charAt(0).toUpperCase() + dd.clause.slice(1) + "\u201d");
      var evs = lifeEvents(life, mort);
      if (evs.length) bits.push("The Atlas holds, for those years: " + evs.map(function (e) { return e.n + " (" + e.f + (e.t != null && e.t !== e.f ? "\u2013" + e.t : "") + ")"; }).join("; ") + ". That may be what is meant; it is not the cause.");
      group("How they died", bits);
    }
    if (life.married > 1) group("Marriages", ["Married " + (life.married === 2 ? "twice" : life.married + " times") + ", as told. Each marriage leaves its own record."]);
    life.groups.forEach(function (g) { group(g.title, g.items); });
    var hints = [];
    if (life.groups.some(function (g) { return g.key === "health"; })) hints.push("a hospital, dispensary or school health register, and letters or a diary from those years");
    if (life.died) hints.push("a death record, a burial entry or a newspaper notice, which often name the cause");
    if (life.married > 1 || life.groups.some(function (g) { return g.key === "romance" && g.items.some(function (x) { return /divorc|separat|annul/i.test(x); }); })) hints.push("one marriage record for each marriage, and a divorce or court file where it ended in one");
    if (life.groups.some(function (g) { return g.key === "hard" && g.items.some(function (x) { return /jail|prison|arrest|convict|sentenc|trial|fined|deport|intern/i.test(x); }); })) hints.push("court, police or prison registers and the local newspaper");
    if (life.groups.some(function (g) { return g.key === "hard" && g.items.some(function (x) { return /war|battle|conscript|draft|enlist|fought|wounded|prisoner/i.test(x); }); })) hints.push("military service and prisoner-of-war records");
    if (hints.length) box.append(el("p", "Where such things usually leave a record: " + hints.join("; ") + ". These are places to look, not findings.", "cap"));
    return box;
  }

  /* A country written in the story ("Worthington, United States") says which of the same-named places is meant: places in the countries the
     story names come first, and the words of a country's long name ("United States of America") are not themselves places. */
  /* A NAME SEVERAL PLACES BEAR is read as the one it nearly always means (Glasgow in Scotland, Montevideo in Uruguay, York in England), unless the story's own
     words say another: «Glasgow» in a story of Nova Scotia is New Glasgow. The others stay behind it, offered as «did you mean». [the usual country, [words that say
     otherwise, that country] ...] */
  var USUAL = {
    glasgow: ["GB", [/\b(?:nova scotia|new glasgow|pictou)\b/, "CA"]], york: ["GB", [/\b(?:ontario|toronto)\b/, "CA"]], perth: ["AU", [/\b(?:scotland|scottish|perthshire|dundee)\b/, "GB"], [/\bontario\b/, "CA"]],
    naples: ["IT", [/\bflorida\b/, "US"]], montevideo: ["UY", [/\b(?:italy|italian)\b[^.]{0,30}\bmontevideo\b|\bmontevideo,? italy\b/, "IT"]], bavaria: ["DE", [/\b(?:veneto|treviso)\b/, "IT"]],
    sydney: ["AU", [/\b(?:nova scotia|cape breton)\b/, "CA"]], melbourne: ["AU", [/\b(?:florida)\b/, "US"], [/\bquebec\b/, "CA"]], adelaide: ["AU"], brisbane: ["AU"], hobart: ["AU"], fremantle: ["AU"], wellington: ["NZ", [/\b(?:somerset|shropshire)\b/, "GB"]], auckland: ["NZ"],
    krakow: ["PL"], warsaw: ["PL", [/\bindiana\b/, "US"]], dublin: ["IE", [/\b(?:ohio|georgia|california)\b/, "US"]], cork: ["IE"], milan: ["IT", [/\b(?:michigan|ohio|tennessee)\b/, "US"]], florence: ["IT", [/\b(?:alabama|carolina|arizona)\b/, "US"]], birmingham: ["GB", [/\balabama\b/, "US"]], manchester: ["GB", [/\bnew hampshire\b/, "US"]],
    ennis: ["IE", [/\btexas\b/, "US"]], manila: ["PH", [/\b(?:utah|arkansas)\b/, "US"]], paris: ["FR", [/\b(?:texas|kentucky|ontario)\b/, "US"]], cambridge: ["GB", [/\b(?:massachusetts|harvard|boston)\b/, "US"]], hamburg: ["DE"], windsor: ["GB", [/\b(?:ontario|detroit)\b/, "CA"]]
  };
  /* Two names the index has no row for in the sense a family story usually means: a region of central Europe, and the mining town of Montana */
  var SPANISH = /\b(?:spain|spanish|espana|lugo|coruna|vigo|ourense|orense|pontevedra|santiago de compostela|galego|gallego)\b/;
  function usualPlaces(cands, tokens, ctx) {
    var src = (ctx && ctx.hintTokens) || tokens, all;
    if (ctx && ctx.__joined && ctx.__joined.of === src) all = ctx.__joined.s; else { all = " " + src.join(" ") + " "; if (ctx) ctx.__joined = { of: src, s: all }; }
    cands.forEach(function (c) {
      if (!c.rows || !c.rows.length) return;
      if (c.word === "galicia" && !SPANISH.test(all) && !(c.rows[0] && c.rows[0].i === "n-galicia-central"))
        c.rows = [{ i: "n-galicia-central", n: "Galicia (central Europe, now Poland and Ukraine)", cc: "PL", x: 22.77, y: 49.78, a: 1, c: 0, w: 1, country: true, gaz: true, usual: 1 }].concat(c.rows.filter(function (r) { return r.cc === "ES" && r.i !== "n-galicia-central"; }));
      if (c.word === "butte" && /\b(?:montana|copper|anaconda)\b/.test(all) && !(c.rows[0] && c.rows[0].i === "n-butte-montana"))
        c.rows = [{ i: "n-butte-montana", n: "Butte (Montana)", cc: "US", x: -112.53, y: 46.0, a: 1, c: 0, w: 1, gaz: true, usual: 1 }].concat(c.rows.filter(function (r) { return r.i !== "n-butte-montana"; }));
      var u = USUAL[c.word]; if (!u) return;
      var want = u[0]; for (var k = 1; k < u.length; k++) if (u[k][0].test(all)) want = u[k][1];
      var exact = function (r) { return S.fold(String(r.n)) === c.word; };
      var best = c.rows.filter(function (r) { return r.cc === want && exact(r); })[0] || c.rows.filter(function (r) { return r.cc === want; })[0];
      if (best && !(best === c.rows[0] && best.usual)) { var kept = best.usual ? best : Object.assign({}, best, { usual: 1 }); c.rows = [kept].concat(c.rows.filter(function (r) { return r !== best; })); }   /* "usual": not moved again by its neighbours */
    });
    return cands;
  }
  function withCountryHints(cands, tokens, ctx) { return usualPlaces(countryHints(cands, tokens, ctx), tokens, ctx); }
  function countryHints(cands, tokens, ctx) {
    if (!ctx || !ctx.countries) return cands;
    var cov = Object.create(null), hint = Object.create(null);
    /* every run of up to six words in the story, by the words joined: a country name is then one lookup, not a scan of the story per country */
    function grams(list) {
      var g = Object.create(null);
      for (var i = 0; i < list.length; i++) { var k = ""; for (var n = 0; n < 6 && i + n < list.length; n++) { k += (n ? " " : "") + list[i + n]; (g[k] = g[k] || []).push(i); } }
      return g;
    }
    var allToks = ctx.hintTokens || tokens;
    if (!ctx.__grams || ctx.__grams.of !== allToks) ctx.__grams = { of: allToks, g: grams(allToks) };   /* the whole story's runs are worked out once, not once for each stretch */
    var gAll = ctx.__grams.g, gTok = allToks === tokens ? gAll : grams(tokens);
    Object.keys(ctx.countries).forEach(function (cc) {
      [ctx.countries[cc]].concat(cc === "US" ? ["united states", "usa"] : cc === "GB" ? ["united kingdom", "uk"] : []).forEach(function (nm) {
        var w = S.fold(nm).split(" ").filter(Boolean); if (!w.length || w.length > 6) return;
        var key = w.join(" ");                                    /* countries are looked for in the whole story, the long names covered in this stretch */
        if (gAll[key]) hint[cc] = 1;
        if (gTok[key] && (w.length > 1 || nm === "usa" || nm === "uk")) gTok[key].forEach(function (i) { for (var j = i; j < i + w.length; j++) cov[j] = 1; });
      });
    });
    /* A COUNTRY THAT NO LONGER EXISTS still says where: "Salisbury, Rhodesia" is Zimbabwe's. It chooses among places of the same name and is no
       stop itself (it is a name for a time, which the era tables already hold). The few one-word ones that are also real places elsewhere
       (Persia, Iowa) only choose and are never dropped. */
    Object.keys(FORMER).forEach(function (nm) {
      var f = FORMER[nm], w = nm.split(" ");
      if (gAll[nm]) f.cc.forEach(function (cc) { hint[cc] = 1; });
      if (gTok[nm] && (w.length > 1 || f.drop)) gTok[nm].forEach(function (i) { for (var j = i; j < i + w.length; j++) cov[j] = 1; });
    });
    ctx.__hint = hint;
    if (!Object.keys(hint).length) return cands;
    cands = cands.filter(function (c) { return !cov[c.at]; });
    cands.forEach(function (c) { c.rows = c.rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (hint[b.r.cc] ? 1 : 0) - (hint[a.r.cc] ? 1 : 0) || a.i - b.i; }).map(function (x) { return x.r; }); });
    return cands;
  }


  /* OLD AND FOREIGN NAMES the worldwide gazetteer does not index by the name a family used ("Bombay" is a village in New Zealand and four in the US,
     never Mumbai; "Danzig" is nowhere). Each is the name people wrote for a place that is still there: [old name, modern name, country, longitude, latitude].
     The modern place is taken from the Atlas's own rows when it has them (so the card links its page), else it is a point of its own. Read from the
     Wikipedia list of exonyms and the places' own pages; only names that were THE name of one place in the period, never an ambiguous one (no "Canton",
     no "Queenstown"). Further names are added here, or to data/place-names.json (the dated catalogue) when the place is one the Atlas holds. */
  var EXO = [
    ["bombay", "Mumbai", "IN", 72.878, 19.076], ["calcutta", "Kolkata", "IN", 88.364, 22.573], ["madras", "Chennai", "IN", 80.27, 13.083], ["rangoon", "Yangon", "MM", 96.2, 16.867],
    ["moulmein", "Mawlamyine", "MM", 97.63, 16.49], ["tanjore", "Thanjavur", "IN", 79.139, 10.787], ["poona", "Pune", "IN", 73.857, 18.52], ["benares", "Varanasi", "IN", 83.0, 25.317],
    ["cawnpore", "Kanpur", "IN", 80.331, 26.449], ["simla", "Shimla", "IN", 77.173, 31.105], ["trivandrum", "Thiruvananthapuram", "IN", 76.936, 8.524], ["peking", "Beijing", "CN", 116.407, 39.904],
    ["nanking", "Nanjing", "CN", 118.797, 32.06], ["tientsin", "Tianjin", "CN", 117.362, 39.343], ["amoy", "Xiamen", "CN", 118.09, 24.48], ["saigon", "Ho Chi Minh City", "VN", 106.63, 10.823],
    ["soerabaja", "Surabaya", "ID", 112.75, -7.25], ["salonica", "Thessaloniki", "GR", 22.944, 40.64], ["salonika", "Thessaloniki", "GR", 22.944, 40.64], ["adrianople", "Edirne", "TR", 26.556, 41.677],
    ["angora", "Ankara", "TR", 32.86, 39.93], ["danzig", "Gdańsk", "PL", 18.646, 54.352], ["konigsberg", "Kaliningrad", "RU", 20.451, 54.71], ["memel", "Klaipėda", "LT", 21.144, 55.703],
    ["breslau", "Wrocław", "PL", 17.039, 51.107], ["pressburg", "Bratislava", "SK", 17.107, 48.149], ["pozsony", "Bratislava", "SK", 17.107, 48.149], ["cracow", "Kraków", "PL", 19.945, 50.065],
    ["stettin", "Szczecin", "PL", 14.553, 53.428], ["posen", "Poznań", "PL", 16.931, 52.409], ["reval", "Tallinn", "EE", 24.754, 59.437], ["libau", "Liepāja", "LV", 21.01, 56.51],
    ["dunaburg", "Daugavpils", "LV", 26.536, 55.875], ["kovno", "Kaunas", "LT", 23.904, 54.898], ["vilna", "Vilnius", "LT", 25.28, 54.687], ["telz", "Telšiai", "LT", 22.247, 55.982],
    ["kolomea", "Kolomyia", "UA", 25.04, 48.531], ["czernowitz", "Chernivtsi", "UA", 25.935, 48.292], ["agram", "Zagreb", "HR", 15.982, 45.815], ["laibach", "Ljubljana", "SI", 14.506, 46.057],
    ["spalato", "Split", "HR", 16.44, 43.508], ["ragusa", "Dubrovnik", "HR", 18.094, 42.65], ["cattaro", "Kotor", "ME", 18.771, 42.424], ["albona", "Labin", "HR", 14.123, 45.093],
    ["parenzo", "Poreč", "HR", 13.595, 45.227], ["rovigno", "Rovinj", "HR", 13.64, 45.081], ["helsingfors", "Helsinki", "FI", 24.94, 60.17], ["fredrikshald", "Halden", "NO", 11.39, 59.12],
    ["kingstown", "Dún Laoghaire", "IE", -6.135, 53.29], ["leopoldville", "Kinshasa", "CD", 15.322, -4.325], ["elisabethville", "Lubumbashi", "CD", 27.48, -11.66], ["lourenco marques", "Maputo", "MZ", 32.573, -25.966],
    ["umtali", "Mutare", "ZW", 32.67, -18.97], ["gwelo", "Gweru", "ZW", 29.82, -19.45], ["que que", "Kwekwe", "ZW", 29.82, -18.92], ["hobart town", "Hobart", "AU", 147.33, -42.88],
    ["van diemens land", "Tasmania", "AU", 146.6, -42.0], ["berlin ontario", "Kitchener", "CA", -80.49, 43.45], ["pernambuco", "Recife", "BR", -34.88, -8.05], ["batavia", "Jakarta", "ID", 106.845, -6.2],
    ["constantinople", "Istanbul", "TR", 28.978, 41.009], ["smyrna", "Izmir", "TR", 27.14, 38.42], ["trebizond", "Trabzon", "TR", 39.72, 41.0], ["christiania", "Oslo", "NO", 10.75, 59.91],
    ["lemberg", "Lviv", "UA", 24.03, 49.84], ["lwow", "Lviv", "UA", 24.03, 49.84], ["fiume", "Rijeka", "HR", 14.44, 45.33], ["pola", "Pula", "HR", 13.85, 44.87], ["esseg", "Osijek", "HR", 18.69, 45.55],
    ["zara", "Zadar", "HR", 15.23, 44.12], ["aintab", "Gaziantep", "TR", 37.38, 37.07]
  ];
  var EXO_BY = (function () { var m = Object.create(null); EXO.forEach(function (e) { m[e[0]] = e; }); return m; })();
  /* THE CITY THE WORLD MEANS. "Athens", "Cairo", "Warsaw" and "Alexandria" are, in the gazetteer, mostly villages in the US (Athens, Georgia; Cairo,
     Illinois), and the city itself is often not in the index under that name. A story that names only one of them, with nothing pointing to the US,
     means the city. Each is [name as told, modern name, country, longitude, latitude]; the city is added as a reading (taken from the Atlas's own
     row when it has one, else a point) with a small lead, so a country the story names, or a state ("Athens, Georgia"), still wins. Never a stop on
     its own; only the order of the readings changes and the other is still one tap away. */
  var WORLD = [
    ["alexandria", "Alexandria", "EG", 29.92, 31.2], ["warsaw", "Warsaw", "PL", 21.01, 52.23], ["athens", "Athens", "GR", 23.73, 37.98], ["cairo", "Cairo", "EG", 31.24, 30.04],
    ["rome", "Rome", "IT", 12.5, 41.9], ["oxford", "Oxford", "GB", -1.26, 51.75], ["cambridge", "Cambridge", "GB", 0.12, 52.2], ["damascus", "Damascus", "SY", 36.3, 33.51],
    ["bethlehem", "Bethlehem", "PS", 35.2, 31.7], ["berlin", "Berlin", "DE", 13.4, 52.52], ["sparta", "Sparta", "GR", 22.43, 37.07], ["jerusalem", "Jerusalem", "IL", 35.22, 31.77],
    ["valencia", "Valencia", "ES", -0.38, 39.47], ["seville", "Sevilla", "ES", -5.98, 37.39], ["zurich", "Zürich", "CH", 8.54, 47.37], ["belfast", "Belfast", "GB", -5.93, 54.6], ["newcastle", "Newcastle upon Tyne", "GB", -1.61, 54.98],
    ["york", "York", "GB", -1.08, 53.96], ["belgrade", "Beograd", "RS", 20.46, 44.8], ["leipzig", "Leipzig", "DE", 12.37, 51.34], ["casablanca", "Casablanca", "MA", -7.59, 33.57], ["lagos", "Lagos", "NG", 3.39, 6.52],
    ["durban", "Durban", "ZA", 31.02, -29.86], ["wellington", "Wellington", "NZ", 174.78, -41.29], ["toronto", "Toronto", "CA", -79.38, 43.65], ["cologne", "Köln", "DE", 6.96, 50.94], ["hanover", "Hannover", "DE", 9.73, 52.37],
    ["nicosia", "Nicosia", "CY", 33.38, 35.17], ["lisbon", "Lisboa", "PT", -9.14, 38.72], ["geneva", "Genève", "CH", 6.14, 46.2], ["cardiff", "Cardiff", "GB", -3.18, 51.48], ["copenhagen", "København", "DK", 12.57, 55.68],
    ["moscow", "Moskva", "RU", 37.62, 55.75], ["sofia", "Sofia", "BG", 23.32, 42.7], ["strasbourg", "Strasbourg", "FR", 7.75, 48.57], ["frankfurt", "Frankfurt am Main", "DE", 8.68, 50.11], ["bratislava", "Bratislava", "SK", 17.11, 48.15],
    ["skopje", "Skopje", "MK", 21.43, 42.0], ["padua", "Padova", "IT", 11.88, 45.41], ["brunswick", "Braunschweig", "DE", 10.52, 52.27], ["valletta", "Valletta", "MT", 14.51, 35.9]
  ];
  var WORLD_BY = (function () { var m = Object.create(null); WORLD.forEach(function (e) { m[e[0]] = e; }); return m; })();
  function withWorldCities(text, ctx) {
    if (!ctx || !ctx.map) return;
    var f = " " + S.fold(text).replace(/\s+/g, " ") + " ";
    WORLD.forEach(function (e) {
      if (f.indexOf(" " + e[0] + " ") < 0) return;
      var rows = ctx.map[e[0]] || (ctx.map[e[0]] = []);
      if (rows.some(function (r) { return r.fam; })) return;
      var mine = rows.filter(function (r) { return r.cc === e[2] && S.fold(r.n) === e[0]; })[0];
      if (mine) { mine.fam = 1; return; }
      rows.push({ i: "w-" + e[0], n: e[1], cc: e[2], x: e[3], y: e[4], a: 1, c: 0, w: 1, gaz: true, fam: 1 });
    });
  }
  /* put the rows for any old name the story uses at the FRONT of its word, so "Bombay" is the city before it is a village */
  function withExonyms(text, ctx) {
    if (!ctx || !ctx.map) return;
    var f = " " + S.fold(text).replace(/\s+/g, " ") + " ";
    EXO.forEach(function (e) {
      if (f.indexOf(" " + e[0] + " ") < 0) return;
      var rows = ctx.map[e[0]] || (ctx.map[e[0]] = []);
      if (rows.some(function (r) { return r.exo === e[0]; })) return;
      var own = function (r) { return r.cc === e[2] && S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "")) === S.fold(e[1]); };   /* the place itself, not a village whose name carries it (Zverinac (Zadar)) */
      var modern = (ctx.map[S.fold(e[1])] || []).filter(function (r) { return own(r) && r.c > 0; })[0] || (ctx.map[S.fold(e[1])] || []).filter(own)[0] || (ctx.map[S.fold(e[1])] || []).filter(function (r) { return r.cc === e[2] && r.c > 0; })[0];
      var row = modern ? Object.assign({}, modern, { exo: e[0] }) : { i: "x-" + e[0].replace(/ /g, "-"), n: e[1], cc: e[2], x: e[3], y: e[4], a: 1, c: 0, w: 1, gaz: true, exo: e[0] };
      rows.unshift(row);
    });
  }


  /* WHICH OF SEVERAL SAME-NAMED PLACES, from the rest of the story. "Brooklyn" is a village in Nova Scotia and a borough of New York; "Liverpool" is in
     Australia, Canada and England; "Perth" in Scotland and Western Australia. A story about a family names places that belong together, so each place
     is read in the country the others point to: a country named in the story counts most, a place that has only one reading counts a lot, a place with
     several counts a little in each. A place the Atlas holds records for counts a little more, and an old name's own place always wins. Only the order
     of the readings changes: nothing is dropped, and the next reading is still one tap away. */
  function withContext(cands, ctx, isNot) {
    var votes = Object.create(null), hint = ctx.__hint || {};
    /* a word that is no place here (the "born" of "was born in", which is also Born in the Netherlands) neither votes for a country nor pulls a reading toward itself */
    var live = isNot ? cands.filter(function (c) { return !isNot(c); }) : cands;
    Object.keys(hint).forEach(function (cc) { votes[cc] = (votes[cc] || 0) + 4; });
    function ccs(c) { var seen = Object.create(null), out = []; c.rows.forEach(function (r) { if (r.cc && !seen[r.cc]) { seen[r.cc] = 1; out.push(r.cc); } }); return out; }
    live.forEach(function (c) { if (c.country) { if (c.word !== "america") votes[c.country] = (votes[c.country] || 0) + 4; return; }   /* "went to America" is where they ended up, not a hint where the rest of the places are */ var l = ccs(c); if (l.length === 1) votes[l[0]] = (votes[l[0]] || 0) + 3; });   /* only a place with one reading votes: a namesake-rich country (every name has a village in the US) would win them all */
    /* and a reading near the other places of the story counts: Tanta in Egypt sits beside Alexandria and Cairo, Tanta in Bolivia beside nothing */
    function km(a, b) { var r = Math.PI / 180, dl = (b.x - a.x) * r, dn = (b.y - a.y) * r, h = Math.sin(dn / 2) * Math.sin(dn / 2) + Math.cos(a.y * r) * Math.cos(b.y * r) * Math.sin(dl / 2) * Math.sin(dl / 2); return 12742 * Math.asin(Math.sqrt(h)); }
    var located = live.filter(function (c) { return !c.country && c.rows.some(function (r) { return r.x != null && r.y != null; }); });
    function prox(self, r) {
      if (r.x == null || r.y == null) return 0;
      var sum = 0;
      located.forEach(function (c) {
        if (c === self) return;
        var best = 0; c.rows.forEach(function (o) { if (o.x == null || o.y == null) return; var d = km(r, o), k = d < 1500 ? Math.exp(-d / 1000) : 0; if (k > best) best = k;   /* beyond about 1,500 km nothing is "beside": a family's places are far apart, and distance must not tip Sydney to Nova Scotia because it is nearer Croatia */ });
        sum += best / Math.max(1, ccs(c).length);
      });
      return sum;
    }
    var typed = ctx.__typed || {};
    cands.forEach(function (c) {
      if (c.country || (ccs(c).length < 2 && !c.rows.some(function (r) { return r.gaz && !r.exo && !r.fam; }))) return;   /* a name with several readings in one country, from the gazetteer (Peoria), is chosen by what it sits beside */
      c.rows = c.rows.map(function (r, i) { return { r: r, i: i, s: (votes[r.cc] || 0) + (r.c > 0 ? 2 : 0) + (r.v > 0 ? 0.5 + Math.min(0.5, 0.2 * Math.log10(r.v)) : 0) + (r.exo ? 100 : 0) + (S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "")) === c.word ? 1 : 0) + (r.fam ? 4 : 0) - (r.partial ? 5 : 0) + 2 * prox(c, r) + (typed[c.word] && String(r.n).normalize("NFC").toLowerCase() === typed[c.word] ? 3 : 0) - i * 0.01 }; })
        .sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.r; });
    });
    return usualPlaces(cands, ctx.hintTokens || [], ctx);
  }


  /* people named right after the word for what they are to someone, with the birth and death years the same sentence gives them */
  function apposed(t, ctx) {
    var out = [], seen = Object.create(null), text = String(t || "");
    var re = /\b([Mm]y|[Oo]ur|[Hh]is|[Hh]er|[Tt]heir)\s+((?:(?:older|elder|younger|little|big|eldest|youngest|late|first|second|step)\s+)?(?:grand(?:father|mother)|father|mother|dad|mum|mom|brother|sister|uncle|aunt|cousin|relative|wife|husband|son|daughter|nephew|niece))\s+(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, m;
    while ((m = re.exec(text))) {
      var nm = m[3].replace(/['\u2019]s$/i, ""), f = S.fold(nm);
      if (nm.length < 2 || STOP[f] || COMMON[f] || MONTHS[f] || KINW.test(f) || REL.test(nm) || (ctx.map && ctx.map[f] && !(ctx.given && ctx.given[f])) || seen[f]) continue;
      var sn = m[4] && !/['\u2019]s$/i.test(m[3]) ? m[4] : "", fs = sn ? S.fold(sn) : "";
      if (sn && (STOP[fs] || COMMON[fs] || MONTHS[fs])) sn = "";
      seen[f] = 1;
      var kin = m[2].toLowerCase().replace(/^(?:older|elder|younger|little|big|eldest|youngest|late|first|second|step)\s+/, "");
      var o = { poss: m[1].toLowerCase(), kin: /^(?:dad)$/.test(kin) ? "father" : /^(?:mum|mom)$/.test(kin) ? "mother" : kin, name: cased(nm) + (sn ? " " + cased(sn) : ""), born: null, died: null };
      var after = text.slice(m.index + m[0].length - (sn ? 0 : 0), m.index + m[0].length + 140).split(/[.!?;]/)[0];
      var nextName = /,\s*(?:while|and)?\s*\p{Lu}[\p{L}'\u2019-]+,/u.exec(after); if (nextName) after = after.slice(0, nextName.index);
      var by = /\b(?:born|b\.)\s*(?:in|about|around|c\.)?\s*(\d{4})/i.exec(after) || /\((?:b\.?\s*)?(\d{4})\s*[\u2013-]/.exec(after); if (by) o.born = +by[1];
      var dy = /\b(?:died|passed away|d\.)[^.]{0,50}?(\d{4})/i.exec(after) || /[\u2013-]\s*(\d{4})\)/.exec(after); if (dy) o.died = +dy[1];
      out.push(o);
    }
    /* "married Rosa Calabrese", "a son, Tommaso, was born", "their daughter Lucia": the wife, husband or child named in passing */
    function add(kin, poss, nm0, sn0, from) {
      var nm = String(nm0).replace(/['\u2019]s$/i, ""), f = S.fold(nm);
      if (nm.length < 2 || STOP[f] || COMMON[f] || MONTHS[f] || KINW.test(f) || REL.test(nm) || /^(?:him|her|them|me|us|you|again|someone)$/.test(f) || (ctx.map && ctx.map[f] && !(ctx.given && ctx.given[f])) || seen[f]) return;
      var sn = sn0 && !/['\u2019]s$/i.test(nm0) ? sn0 : "", fs = sn ? S.fold(sn) : ""; if (sn && (STOP[fs] || COMMON[fs] || MONTHS[fs])) sn = "";
      seen[f] = 1;
      var o = { poss: poss, kin: kin, name: cased(nm) + (sn ? " " + cased(sn) : ""), born: null, died: null }, after = text.slice(from, from + 140).split(/[.!?;]/)[0];
      var by = /\b(?:born|b\.)\s*(?:in|about|around|c\.)?\s*(\d{4})/i.exec(after); if (by) o.born = +by[1];
      out.push(o);
    }
    var mre = /\bmarried\s+(?:an?\s+[\p{L}' -]{0,25}?\s+named\s+)?(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, mm;
    while ((mm = mre.exec(text))) add("spouse", "", mm[1], mm[2], mm.index + mm[0].length);
    var cre = /\b(?:a|an|the|their|his|her|my|our)\s+(?:(?:elder|older|younger|eldest|youngest|first|second|little|baby|only)\s+)*(son|daughter|child|brother|sister)(?:,|\s+named)?\s+(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, cm;
    while ((cm = cre.exec(text))) add(cm[1].toLowerCase(), "", cm[2], "", cm.index + cm[0].length);
    return out.slice(0, 16);
  }

  var FORMER = {
    "rhodesia": { cc: ["ZW", "ZM"], stop: "ZW", drop: 1 }, "southern rhodesia": { cc: ["ZW"], stop: "ZW" }, "northern rhodesia": { cc: ["ZM"], stop: "ZM" }, "yugoslavia": { cc: ["HR", "RS", "SI", "BA", "MK", "ME", "XK"], drop: 1 },
    "czechoslovakia": { cc: ["CZ", "SK"], drop: 1 }, "ussr": { cc: ["RU", "UA", "BY", "LT", "LV", "EE", "MD", "GE", "AM", "AZ", "KZ"], drop: 1 }, "soviet union": { cc: ["RU", "UA", "BY", "LT", "LV", "EE", "MD", "GE", "AM", "AZ", "KZ"] },
    "east germany": { cc: ["DE"] }, "west germany": { cc: ["DE"] }, "zaire": { cc: ["CD"], stop: "CD", drop: 1 }, "belgian congo": { cc: ["CD"], stop: "CD" }, "ceylon": { cc: ["LK"], stop: "LK", drop: 1 },
    "south west africa": { cc: ["NA"], stop: "NA" }, "british honduras": { cc: ["BZ"], stop: "BZ" }, "gold coast": { cc: ["GH"], stop: "GH" }, "dutch east indies": { cc: ["ID"], stop: "ID" }, "east pakistan": { cc: ["BD"] },
    "burma": { cc: ["MM"], stop: "MM" }, "persia": { cc: ["IR"] }, "siam": { cc: ["TH"], stop: "TH" }, "prussia": { cc: ["DE", "PL", "RU"] }
  };
  /* "a woman named Cheryl", "married a man called Ivan Kosina", "his daughter named Anna": the person named is not the one the story is about */
  var KIN_NAMED = /\b(married(?:\s+an?\s+\p{L}+)?|woman|lady|wife|husband|spouse|partner|bride|groom|man|girl|daughter|son|boy|child)\s+(?:named|called)\s+([\p{L}'\u2019-]+)(?:\s+([\p{Lu}][\p{L}'\u2019-]+))?/giu;
  /* "moved to America" is the United States (see withCountries: only straight after to / in / from, so "South America" and "Captain America" are not) */
  var COUNTRY_ALIAS = { "macedonia": "MK", "bosnia": "BA", "bosnia herzegovina": "BA", "usa": "US", "united states": "US", "united states of america": "US", "america": "US", "uk": "GB", "united kingdom": "GB" };
  var ALIAS_TOWN = { macedonia: 1 }, ALIAS_TOWN_NEXT = /^(?:ohio|iowa|illinois|indiana|nebraska|kentucky|georgia|alabama|tennessee|oklahoma|virginia|michigan|wisconsin|missouri|pennsylvania|ontario|connecticut|carolina|new|north|south|west|oh|ia|il|ky|ga|tn|va|mi|wi|mo|ct|nc|sc|nj|ny)$/;
  var NATIONS = { "scotland": ["Scotland", -4.2, 56.8], "wales": ["Wales", -3.7, 52.3], "northern ireland": ["Northern Ireland", -6.7, 54.7] };
  var PLACE_MARK = /^(?:from|to|in|of|at|into|near|towards|toward)$/;
  /* A COUNTRY NAMED IN A STORY IS A COUNTRY. "from County Cork in Ireland" is not a village called Ireland in Canada. A country the gazetteer holds a
     place of that name for (South Africa) is that place; one it does not (Ireland) is a stop at the middle of the places the Atlas holds in it,
     named for the country and plainly one. A single word that is also a given name ("Jordan", "Israel") counts only after a place word. */
  function withCountries(cands, tokens, ctx, gset) {
    var cen = ctx.map && ctx.map["#country"]; if (!cen || !ctx.countries) return cands;
    var byName = Object.create(null);
    Object.keys(ctx.countries).forEach(function (cc) { var n = S.fold(ctx.countries[cc]); if (n) byName[n] = cc; });
    Object.keys(COUNTRY_ALIAS).forEach(function (a) { byName[a] = COUNTRY_ALIAS[a]; });
    var used = [], hits = [];
    for (var len = 5; len >= 1; len--) for (var i = 0; i + len <= tokens.length; i++) {
      var free = true; for (var j = i; j < i + len; j++) if (used[j]) free = false;
      if (!free) continue;
      var w = tokens.slice(i, i + len).join(" "), cc = byName[w];
      if (!cc || !cen[cc]) continue;
      if (w === "america" && !PLACE_MARK.test(tokens[i - 1] || "")) continue;
      if (ALIAS_TOWN[w] && ALIAS_TOWN_NEXT.test(tokens[i + len] || "")) continue;   /* «Macedonia, Ohio» is a town, not the country */
      if (len === 1 && ((gset[w] && !PLACE_MARK.test(tokens[i - 1] || "")) || STOP[w] || COMMON[w])) continue;
      if (cands.some(function (c) { var cl = c.word.split(" ").length; return cl > len && c.at <= i && i < c.at + cl; })) continue;   /* "Jersey City" is not the island of Jersey */
      for (j = i; j < i + len; j++) used[j] = 1;
      hits.push({ at: i, len: len, cc: cc, word: w });
    }
    /* A COUNTRY THAT NO LONGER EXISTS, NAMED AS A PLACE TO GO: "moved to Rhodesia" is a stop, at Zimbabwe, called what the family called it. Only straight
       after a place word (so "Salisbury, Rhodesia" stays Salisbury), only where one country took over the name, and never where a place already covers it. */
    Object.keys(FORMER).forEach(function (nm) {
      var f = FORMER[nm]; if (!f.stop) return;
      var w = nm.split(" "), cc = f.stop;
      for (var i = 1; i + w.length <= tokens.length; i++) {
        if (tokens.slice(i, i + w.length).join(" ") !== nm || !PLACE_MARK.test(tokens[i - 1] || "") || !cen[cc]) continue;
        if (hits.some(function (h) { return h.at < i + w.length && i < h.at + h.len; })) continue;
        if (cands.some(function (c) { var cl = c.word.split(" ").length; return c.at < i + w.length && i < c.at + cl; })) continue;
        hits.push({ at: i, len: w.length, cc: cc, word: nm, former: nm });
      }
    });
    /* THE NATIONS OF THE UNITED KINGDOM that are not countries to the Atlas: «from Wales to Australia» is Wales, not New South Wales; «from Scotland» is not Scotland County in Missouri. A stop at the middle of the nation. */
    Object.keys(NATIONS).forEach(function (nm) {
      var w = nm.split(" "), N = NATIONS[nm];
      for (var i = 0; i + w.length <= tokens.length; i++) {
        if (tokens.slice(i, i + w.length).join(" ") !== nm) continue;
        var pv = tokens[i - 1] || "", pv2 = tokens[i - 2] || "";
        if (/^(?:new|south|north|east|west|prince|princess|university|bank|bank of|of)$/.test(pv) && !(pv === "of" && !/^(?:prince|princess|university|bank)$/.test(pv2))) continue;
        if (tokens[i + w.length] === "county" || tokens[i + w.length] === "road" || tokens[i + w.length] === "street") continue;
        if (hits.some(function (h) { return h.at < i + w.length && i < h.at + h.len; })) continue;
        if (cands.some(function (c) { var cl = c.word.split(" ").length; return cl > w.length && c.at <= i && i < c.at + cl; })) continue;
        hits.push({ at: i, len: w.length, cc: "GB", word: nm, nation: N });
      }
    });
    if (!hits.length) return cands;
    var keep = cands.filter(function (c) { var cl = c.word.split(" ").length; return !hits.some(function (h) { return c.at < h.at + h.len && h.at < c.at + cl; }); });
    hits.forEach(function (h) {
      if (h.nation) {
        keep.push({ word: h.word, at: h.at, rows: [{ i: "n-" + h.word.replace(/ /g, "-"), n: h.nation[0], cc: "GB", x: h.nation[1], y: h.nation[2], a: 1, c: 0, w: 1, country: true, gaz: true }], country: "GB" });
        return;
      }
      if (h.former) {   /* a stop named as the family named it, standing at the country that has the name now */
        var fn = h.former.replace(/\b\p{L}/gu, function (m) { return m.toUpperCase(); });
        keep.push({ word: h.word, at: h.at, rows: [{ i: "f-" + h.former.replace(/ /g, "-"), n: fn, cc: h.cc, x: cen[h.cc].x, y: cen[h.cc].y, a: 1, c: 0, w: 1, country: true, gaz: true, former: ctx.countries[h.cc] }], country: h.cc });
        return;
      }
      var nm = ctx.countries[h.cc], f = S.fold(nm);
      var exact = (ctx.map[f] || []).filter(function (r) { return r.cc === h.cc && S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "")) === f; })[0];
      var row = exact || { i: "c-" + h.cc.toLowerCase(), n: nm, cc: h.cc, x: cen[h.cc].x, y: cen[h.cc].y, a: 1, c: 0, w: 1, country: true, gaz: true };
      keep.push({ word: h.word, at: h.at, rows: [row], country: h.cc });
    });
    return keep.sort(function (a, b) { return a.at - b.at; });
  }

  /* A STORY TYPED IN A HURRY: "once my dad Ivan defranceski travelled to his home town of senj croatia. His father iVan was born in israel and was
     married to hedviga in south africa. she was from cape town." The reader looks for capitals to tell a name or a place from an ordinary word, so
     a name or place written small is first given its capital, and only where the sentence marks it: a place after in / at / from / to / near (not
     "married to"), after "town of", or straight after a place already found; a given name after a kin word or "married to"; a surname after that
     name when a verb follows. Letters are never changed, only the case, and an ordinary word is never touched. The story as typed is kept for
     everything that shows it back. */
  var KINW = /^(?:dad|father|mother|mum|mom|grandfather|grandmother|grandpa|grandma|uncle|aunt|aunty|auntie|brother|sister|son|daughter|wife|husband|cousin|nephew|niece|partner|fiance|fiancee)$/;
  var VERBW = /^(?:was|is|were|travelled|traveled|went|moved|came|lived|born|died|married|left|emigrated|migrated|returned|sailed|had|then|who|arrived|settled|worked|grew|got|came|always|never)$/;
  var PLACE_KIND = /^(?:town|city|village|hometown|island|region|province|county|state|port|capital|district|area|parish|country)$/;
  /* "an Argentinian grandfather": the people of a country, written as an adjective, for the countries the stories name most. The country is then read as if the
     story had said "from Argentina", so it goes through the same place finder. */
  var DEMONYM = (function () {
    var m = Object.create(null);
    [["argentinian argentine argentinean", "Argentina"], ["croatian", "Croatia"], ["italian", "Italy"], ["german", "Germany"], ["irish", "Ireland"], ["scottish scots", "Scotland"], ["english", "England"], ["welsh", "Wales"],
     ["french", "France"], ["spanish", "Spain"], ["portuguese", "Portugal"], ["greek", "Greece"], ["polish", "Poland"], ["czech", "Czechia"], ["slovenian slovene", "Slovenia"], ["serbian", "Serbia"], ["bosnian", "Bosnia and Herzegovina"],
     ["hungarian", "Hungary"], ["austrian", "Austria"], ["swiss", "Switzerland"], ["dutch", "Netherlands"], ["belgian", "Belgium"], ["swedish", "Sweden"], ["norwegian", "Norway"], ["danish", "Denmark"], ["finnish", "Finland"],
     ["russian", "Russia"], ["ukrainian", "Ukraine"], ["lithuanian", "Lithuania"], ["latvian", "Latvia"], ["estonian", "Estonia"], ["romanian", "Romania"], ["bulgarian", "Bulgaria"], ["turkish", "Turkey"], ["lebanese", "Lebanon"],
     ["brazilian", "Brazil"], ["chilean", "Chile"], ["uruguayan", "Uruguay"], ["paraguayan", "Paraguay"], ["peruvian", "Peru"], ["colombian", "Colombia"], ["mexican", "Mexico"], ["cuban", "Cuba"], ["canadian", "Canada"], ["american", "United States"],
     ["australian", "Australia"], ["zealand", "New Zealand"], ["indian", "India"], ["chinese", "China"], ["japanese", "Japan"], ["filipino", "Philippines"], ["egyptian", "Egypt"], ["rhodesian", "Rhodesia"], ["zimbabwean", "Zimbabwe"],
     ["botswanan batswana", "Botswana"], ["zambian", "Zambia"], ["mozambican", "Mozambique"], ["namibian", "Namibia"], ["kenyan", "Kenya"], ["nigerian", "Nigeria"]].forEach(function (r) { r[0].split(" ").forEach(function (d) { m[d] = r[1]; }); });
    return m;
  })();
  var CHAIN_WORD = /^(?:and|then|next|later|finally|eventually|afterwards|afterward|after|that|also|but|so|now)$/, CHAIN_THEN = /^(?:then|next|later|finally|eventually|afterwards|afterward)$/;
  function repairCase(text, ctx) {
    if (!ctx || !ctx.map) return text;
    /* texting and shorthand: "moved 2 Manchester", "NYC" */
    text = String(text).replace(/\b(moved|move|went|followed|go|came|come|travelled|traveled|emigrated|sailed|relocated|returned|back|off)\s+2\b/gi, "$1 to").replace(/\bNYC\b/g, "New York").replace(/\bfrm\b/gi, "from");
    var parts = String(text).split(/(\s+)/), W = [];
    parts.forEach(function (x, i) { if (i % 2 === 0 && x) W.push(i); });
    var info = W.map(function (i) { var raw = parts[i], core = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), lead = raw.slice(0, raw.indexOf(core)); return { i: i, raw: raw, core: core, lead: lead, trail: raw.slice(lead.length + core.length), f: S.fold(core), cap: /^\p{Lu}/u.test(core) }; });
    function set(k, v) { var w = info[k]; if (v !== w.core) { w.core = v; w.f = S.fold(v); w.cap = /^\p{Lu}/u.test(v); parts[w.i] = w.lead + v + w.trail; } }
    function capw(c) { return c.charAt(0).toUpperCase() + c.slice(1); }
    /* an adverb between a kin word and a verb is not a name: "my grandfather nearly died" was becoming "my grandfather was Nearly, died" */
    var ADV = /^(?:nearly|almost|barely|never|always|also|later|soon|then|once|finally|sadly|suddenly|really|still|only|just|already|often|sometimes|probably|maybe|perhaps|quietly|unfortunately|apparently|reportedly|eventually|tragically|slowly|quickly|simply|even|ever|later)$/;
    function plain(f) { return !f || f.length < 3 || STOP[f] || COMMON[f] || LC[f] || OCC[f] || MONTHS[f] || NUMW[f] || REL.test(f) || ADV.test(f); }
    var given = ctx.given || {}, lastPlaceEnd = -9, lastName = -9, sentStart = 0, cn = Object.create(null);
    Object.keys(ctx.countries || {}).forEach(function (cc) { cn[S.fold(ctx.countries[cc])] = 1; });
    cn["usa"] = cn["united states"] = cn["uk"] = cn["united kingdom"] = cn["america"] = 1;
    function known(ph) { return !!(ctx.map[ph] || cn[ph]); }
    for (var k = 0; k < info.length; k++) {
      var w = info[k], p1 = k ? info[k - 1].f : "", p2 = k > 1 ? info[k - 2].f : "";
      if (!w.core) continue;
      /* odd capitals inside a word ("iVan") are the person's name typed fast */
      if (/^\p{Ll}\p{Lu}/u.test(w.core) && given[w.f]) { set(k, capw(w.core.toLowerCase())); }
      /* a name after a kin word, or after "married to" / "named" / "called" */
      var afterKin = KINW.test(p1), afterWed = (p1 === "to" && /^(?:married|wed|engaged|betrothed)$/.test(p2)) || /^(?:named|called)$/.test(p1) || /^(?:married|marry|wed)$/.test(p1);
      if (!w.cap && (afterKin || afterWed) && !plain(w.f) && !(info[k - 1] && info[k - 1].trail.indexOf(",") > -1)) {
        if (given[w.f] || (afterWed && !(ctx.map[w.f] && ctx.map[w.f].length)) || (afterKin && !ctx.map[w.f])) { if (given[w.f] || afterWed || /^(?:was|is|had|and|lived|moved|came|died|married|born|left|emigrated|worked|travelled|traveled|went)$/.test(k + 1 < info.length ? info[k + 1].f : "")) { set(k, capw(w.core)); lastName = k; continue; } }
      }
      /* a surname after that name, when a verb follows: "my dad Ivan defranceski travelled" */
      if (!w.cap && lastName === k - 1 && info[k - 1].cap && !plain(w.f) && !ctx.map[w.f] && !given[w.f] && k + 1 < info.length && VERBW.test(info[k + 1].f) && /^[\p{L}'\u2019-]{4,}$/u.test(w.core)) { set(k, capw(w.core)); continue; }
      if (w.cap && afterKin && given[w.f]) lastName = k;
      /* a place: longest run first, three words down to one, where the sentence marks it */
      if (w.cap && !plain(w.f)) { /* already written right */ }
      if (k && /[.!?]$/.test(info[k - 1].raw)) sentStart = k;
      /* "moved to Botswana, then Salisbury, and then Johannesburg and then Brisbane": a run of "and" / "then" / "next" is still the same list of places. David wrote his
         father's journey in lower case and the last two places were lost, because only one connecting word was allowed between them. */
      var chain = (function () {
        var j = k - 1, n = 0, then = false;
        while (j >= sentStart && n < 4 && CHAIN_WORD.test(info[j].f)) { if (CHAIN_THEN.test(info[j].f)) then = true; j--; n++; }
        return then && lastPlaceEnd >= sentStart;
      })();
      var marked = PREP_PLACE.test(p1) && !(p1 === "to" && /^(?:married|wed|engaged|betrothed|related|devoted|attached)$/.test(p2)) || (p1 === "of" && PLACE_KIND.test(p2)) || k - 1 === lastPlaceEnd || (k - 2 === lastPlaceEnd && /^(?:and|then|,)$/.test(p1)) || chain;
      if (!marked) { if (w.cap && known(w.f)) lastPlaceEnd = k; continue; }
      var done = false;
      for (var n = 3; n >= 1 && !done; n--) {
        if (k + n > info.length) continue;
        var ph = info.slice(k, k + n).map(function (x) { return x.f; }).join(" ");
        if (!known(ph)) continue;
        if (n === 1 && (plain(ph) || ph.length < 4)) continue;
        if (n > 1 && info.slice(k, k + n).some(function (x, j) { return j < n - 1 && /[.,;:!?]$/.test(x.raw); })) continue;
        for (var j = 0; j < n; j++) if (!info[k + j].cap && !(j > 0 && /^(?:de|del|della|di|of|the|am|an|im|la|le|el|on|upon|and)$/.test(info[k + j].f))) set(k + j, capw(info[k + j].core));
        lastPlaceEnd = k + n - 1; k += n - 1; done = true;
      }
    }
    return parts.join("");
  }

  /* THE YEARS OF THE MAIN PERSON ONLY. «he married my mother in 1980», «his father ivan was born in 1925», «my grandfather ivan was born in 1925»: the story's born and left years were
     taken from every year in the text, so a marriage became a departure, a grandfather's birth year became the father's, and a father born in 1951 was drawn as born in 1955.
     The sentences that start with another relation (his father, her mother, my grandmother ...) are about someone else (the family reader reads those into the family tree), and a
     year that comes after married, died, buried or divorced is that event's, not the journey's. Words are not changed anywhere else; this only decides which years count here. */
  function mainYearsText(t) {
    t = String(t || "");
    var first = /\bmy\s+(?:great[- ])*(father|mother|grandfather|grandmother|uncle|aunt|brother|sister|husband|wife|son|daughter)\b/i.exec(t), main = first ? first[1].toLowerCase() : "";
    var other = /^\s*(?:(?:and|but|so|also)\s+)?(?:(?:his|her|their)\s+(?:great[- ])*(?:father|mother|parents?|grandfather|grandmother|uncle|aunt|brother|sister|wife|husband|son|daughter)\b|my\s+(?:great[- ])*(father|mother|grandfather|grandmother|uncle|aunt|brother|sister|husband|wife|son|daughter)\b)/i;
    var parts = t.match(/[^.!?\n]+[.!?\n]*/g) || [t];
    return parts.filter(function (p) {
      var m = other.exec(p); if (!m) return true;
      if (m[1]) return main && m[1].toLowerCase() === main;           /* «my father ...» is the main person, «my grandfather ...» is not */
      return false;                                                  /* «his father ...», «her mother ...» */
    }).join("").replace(/\b(?:married|marry|marrying|wed|divorced|divorce|died|dies|passed away|buried|death|funeral|engaged)\b[^.!?;]*?\b(?:1[5-9]\d\d|20[0-2]\d)\b/gi, function (x) { return x.replace(/\b(?:1[5-9]\d\d|20[0-2]\d)\b/g, ""); });
  }
  /* «IVAN'S FATHER MATE WAS BORN IN SENJ», said of the person the story is about by his first name instead of «his father». David: «father still not showing». Once the story has
     named its person, «Ivan's father» / «Ivan's mother» is read as «his father» / «his mother» when no parent of that kind has been found yet, and the story is read again. */
  /* WHAT PEOPLE PASTE IS NOT WHAT THEY MEANT. Invisible characters inside a word (a soft hyphen, a zero-width space), full-width letters and digits (Ｃｏｒｋ １９００), decomposed accents, a non-breaking space,
     «m.» for married, a ship's name after SS/RMS/HMS (which is neither a person nor a place), and a sentence that opens with Grandad, Nan, Mum or Dad (the teller's own, though it does not say «my»). */
  function cleanInput(text) {
    var t = String(text == null ? "" : text);
    t = t.replace(/[\u00AD\u200B-\u200F\u2060\uFEFF\u202A-\u202E]/g, "").replace(/[\u00A0\u2007\u202F\u3000]/g, " ");
    t = t.replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    try { t = t.normalize("NFC"); } catch (e) { /* old engines */ }
    t = t.replace(/(\p{Lu}[\p{L}'\u2019-]+)\s+(?:"[\p{L} .'\u2019-]{1,25}"|\u201c[\p{L} .'\u2019-]{1,25}\u201d|\([\p{L} .'\u2019-]{1,25}\))\s+(\p{Lu}[\p{L}'\u2019-]+)/gu, "$1 $2");   /* Ivan "Johnny" Horvat, Ivan (Johnny) Horvat: the nickname between the names is not the surname */
    t = t.replace(/\b\d{1,5}(?=\s+(?:\p{Lu}[\p{L}'\u2019-]*\s+){1,2}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Terrace|Place|Way|Crescent|Gardens|Close|Boulevard|Blvd|Square)\b)/gu, "");   /* «1923 Main Street» is an address, not a year */
    t = t.replace(/\bAustria[-\u2013\u2014 ]Hungary\b/gi, "the Habsburg Empire").replace(/\bBosnia(?: and |[-\u2013\u2014 ])Herzegovina\b/gi, "Bosnia");
    t = t.replace(/(^|[;,(]\s*|\n\s*)m\.\s+(?=\p{Lu})/gu, "$1married ");
    t = t.replace(/\b(?:S\.?S\.?|R\.?M\.?S\.?|H\.?M\.?S\.?|H\.?M\.?A\.?S\.?|U\.?S\.?S\.?|M\.?V\.?|S\.?V\.?)\s+(?:(?:the|of)\s+)?\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?/gu, function (m) { return /^(?:US|MV|SS|SV)\b/.test(m) && !/^(?:SS|S\.S\.|RMS|HMS|HMAS|USS|MV|SV)\s/.test(m) ? m : "the ship"; });
    t = t.replace(/(^|[.!?]\s+|\n\s*)(Grandad|Granddad|Grandpa|Gramps|Granny|Grandma|Nan|Nana|Nanna|Nanny|Nonno|Nonna|Opa|Oma|Mum|Mom|Mam|Dad|Papa|Mamma|Mama)(?=\s+(?:was|is|were|had|lived|moved|came|died|married|born|grew|left|emigrated|migrated|worked|travelled|traveled|went|sailed|returned|settled|arrived|always|never|used|loved|hated)\b)/g, "$1My $2");
    return t;
  }
  /* CROATIAN, SLOVENE AND POLISH PLACES IN THE CASE A SENTENCE PUTS THEM IN: «u Senju» (in Senj), «iz Rijeke» (from Rijeka), «u Zagrebu», «w Krakowie», «v Ljubljani». The word after u / iz / od / do / kod / w / v / z that the
     index does not hold, but holds once the ending is taken off or changed, is read as that place. Only the ending is changed: nothing is guessed that the index does not already hold. */
  function nominative(text, ctx) {
    if (!ctx || !ctx.map) return text;
    return String(text).replace(new RegExp(SLAV_PREP.source, "gu"), function (m, a, prep, w) {
      var f = S.fold(w), have = ctx.map[f]; if (have && have.length && have.some(function (r) { return S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "").split(",")[0]) === f; })) return m;   /* a place of exactly that name: leave it (Senj); a name the index only holds inside others (Dol pri Ljubljani for Ljubljani) is still a case ending */
      if (ctx.given && ctx.given[f]) return m;
      var cands = stemsOf(f);
      var pick = null, first = null;
      cands.forEach(function (c) { var rows = ctx.map[c]; if (!rows || !rows.length) return; if (!first) first = rows[0]; if (!pick) { var ex = rows.filter(function (r) { return S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "").split(",")[0]) === c; })[0]; if (ex) pick = ex; } });   /* a place of that very name beats one that only lists it among its other names */
      pick = pick || first;
      return pick ? a + prep + " " + String(pick.n).replace(/\s*\([^)]*\)/, "") : m;
    });
  }
  function parseStory(text, ctx, attached) {
    text = nominative(cleanInput(text), ctx);
    var lin = ancestorTold(text) ? splitLineage(text) : null;
    if (lin) { var lo = parseStory1(lin.subject, ctx, attached); if (lo) { applyLineage(lo, readLineage(lin.rest, ctx), lin, ctx); lo.life = readLife(lin.subject + " " + lin.rest.join(" "), ctx, lo); } return lo; }
    var out = parseStory1(text, ctx, attached), g = out && out.givenWord;
    if (g && /['\u2019]s\s+(?:father|dad|mother|mum|mom)\b/i.test(text)) {
      var have = {}; (out.people || []).forEach(function (p) { have[p.role] = 1; });
      var changed = false, re = /(\p{Lu}[\p{L}-]+?)(?:'s|\u2019s)\s+(father|dad|mother|mum|mom)\b/gu;
      var t2 = String(text).replace(re, function (m, nm, kin) {
        var role = /^(?:mother|mum|mom)$/i.test(kin) ? "mother" : "father";
        if (S.fold(nm) !== S.fold(g) || have[role]) return m;
        changed = true; return "his " + kin;
      });
      if (changed) return parseStory1(t2, ctx, attached);
    }
    return out;
  }
  /* THE ANCESTOR'S LINE, TOLD IN PIECES. «My great grandfather is Ivan and his wife, my great grandmother, is Lucija ... They had 5 children and one of them is my grandma born 1942.
     I think one of their sons, Franjo, moved away to Slovenia while my grandma went to Slovenia too, then Bosnia ... Their 5 kids are Jana, Mila, Manda, Franjo and one unknown
     brother.» One reading of it all put the grandmother's year and every place on the great-grandfather. So the story is cut in two before it is read: the sentences about the
     ancestors themselves (read as the one-person story), and the sentences about their children and the grandmother (read here, a person at a time). Nothing is guessed: which child
     is the grandmother is not said, so she is a line of her own beside the five. */
  var LN_KID = /\b(?:kids?|children|sons?|daughters?|brothers?|sisters?|grand(?:ma|mother|pa|father|dad|mum|mom)|gran|granny|nan|nana|nonna|nonno)\b/i, LN_GREAT = /\bmy\s+(?:great|step)[- ]?(?:great[- ]?)*grand/i;
  var LN_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  function splitLineage(text) {
    var subj = [], rest = [];
    String(text || "").split(/(?<=[.!?])\s+|\n+/).forEach(function (sn) {
      if (!sn.trim()) return;
      if (LN_KID.test(sn) && !LN_GREAT.test(sn)) rest.push(sn);
      else if (/^\s*(?:(?:and|so|but)\s+)?(?:i|i['’]m|i['’]ve|if|please|thanks?|thank)\b/i.test(sn)) return;   /* the teller about themselves: nothing about the family */
      else subj.push(sn);
    });
    return { subject: subj.join(" "), rest: rest };
  }
  function lnNum(w) { return /^\d/.test(w) ? Number(w) : LN_NUM[String(w).toLowerCase()] || null; }
  function lnSex(w) { w = String(w || "").toLowerCase(); return /^(?:daughters?|sisters?|girls?)$/.test(w) ? "F" : /^(?:sons?|brothers?|boys?)$/.test(w) ? "M" : ""; }
  function readLineage(sents, ctx) {
    var kids = [], listed = [], count = null, stayed = null, grandma = null;
    function okGiven(w) { var f = S.fold(w); return /^\p{Lu}[\p{L}'’-]+$/u.test(w) && w.length > 1 && !STOP[f] && !COMMON[f] && !MONTHS[f] && !KINW.test(f) && !NOT_NAME.test(w); }
    function kid(name, sex) {
      var f = S.fold(name || ""), k = f ? kids.filter(function (x) { return S.fold(x.name) === f; })[0] : null;
      if (!k) { k = { name: name || "", sex: sex || "", notes: [], ev: null }; kids.push(k); } else if (sex && !k.sex) k.sex = sex;
      return k;
    }
    function names(list, sex, note) { String(list || "").split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i).forEach(function (pc) { pc = pc.trim(); if (okGiven(pc)) { var k = kid(pc, sex); if (note && k.notes.indexOf(note) < 0) k.notes.push(note); } }); }
    sents.forEach(function (sn) {
      var m;
      if ((m = /\b(?:had|have|has)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:kids?|children)\b/i.exec(sn))) count = count || lnNum(m[1]);
      /* «Their 5 kids are Jana, Mila, Manda, Franjo, and one unknown brother» */
      if ((m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:kids?|children)\s+(?:are|were|named|called)\s*:?\s*([^.;!?]+)/i.exec(sn))) {
        count = count || lnNum(m[1]);
        m[2].split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i).forEach(function (pc) {
          pc = pc.trim().replace(/^and\s+/i, ""); var un = /^(?:one|a|an)\s+(?:(?:unknown|unnamed|other|more)\s+)?(brother|sister|son|daughter|child)\b/i.exec(pc);
          if (un) { var uk = { name: "", sex: lnSex(un[1]), notes: [], ev: null }; kids.push(uk); listed.push(uk); } else if (okGiven(pc)) listed.push(kid(pc, ""));
        });
      }
      /* «a picture of Lucija with two of her daughters beside her, Jana and Manda» */
      if ((m = /\b(?:picture|photo|photograph)\s+of\s+(\p{Lu}[\p{L}'’-]+)\s+with\s+(?:\w+\s+of\s+)?(?:her|his|their)\s+(daughters|sons|children)\b[^,.]*,\s*([^.]*?)(?:\s+(?:if|that|so)\b[^.]*)?[.!?]*\s*$/iu.exec(sn))) names(m[3], lnSex(m[2]), "In the photo with " + m[1]);
      /* «one of their sons, Franjo, moved away to Slovenia» */
      if ((m = /\b(?:one|two)\s+of\s+(?:their|her|his)\s+(sons|daughters),\s*(\p{Lu}[\p{L}'’-]+)\s*,/iu.exec(sn)) && okGiven(m[2])) kid(m[2], lnSex(m[1]));
      /* «one of them is my grandma born 1942» */
      if ((m = /\b(?:grandma|grandmother|nan|nana|nonna|granny|gran)\b[^.]*?\bborn\s+(?:in\s+)?(\d{4})\b/i.exec(sn)) || (m = /\bborn\s+(?:in\s+)?(\d{4})\b[^.]*?\bmy\s+(?:grandma|grandmother|nan|nana|nonna|granny|gran)\b/i.exec(sn))) { grandma = grandma || { born: Number(m[1]), ev: null }; }
      else if (/\bmy\s+(?:grandma|grandmother|nan|nana|nonna|granny|gran)\b/i.test(sn)) grandma = grandma || { born: null, ev: null };
      /* the 3 who stayed */
      if ((m = /\b(?:the\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:kids?|children|of them)\s+(?:stayed|remained|still\s+live[sd]?|live[sd]?)\s+(?:in|at)\b/i.exec(sn))) {
        var se = readEvents(sn.slice(m.index), ctx), pl = se.origin || (se.moves[0] && se.moves[0].place);
        if (pl) stayed = { n: lnNum(m[1]), place: pl };
      }
      /* who went where: one clause per person («Franjo moved away to Slovenia while my grandma went to Slovenia too, then Bosnia ...») */
      if (/\b(?:moved|went|left|settled|settling|emigrated|migrated|came|travelled|traveled|relocated)\b/i.test(sn)) sn.split(/\s+(?:while|whereas|but)\s+|;\s*/i).forEach(function (cl) {
        if (!/\b(?:moved|went|left|settled|settling|emigrated|migrated|came|travelled|traveled|relocated)\b/i.test(cl)) return;
        var ev = null, who = null;
        if (/\bmy\s+(?:grandma|grandmother|nan|nana|nonna|granny|gran)\b/i.test(cl)) { grandma = grandma || { born: null, ev: null }; who = grandma; }
        else kids.forEach(function (k) { if (!who && k.name && new RegExp("\\b" + k.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(cl)) who = k; });
        if (!who) { var nm = /\bone\s+of\s+(?:their|her|his)\s+(?:sons|daughters),\s*(\p{Lu}[\p{L}'’-]+)\s*,/iu.exec(cl); if (nm && okGiven(nm[1])) who = kid(nm[1], ""); }
        if (!who) return;
        ev = readEvents(cl.replace(/^[^]*?\b(?:moved|went|left|settled|settling|emigrated|migrated|came|travelled|traveled|relocated)\b/i, "moved"), ctx);
        who.ev = ev;
      });
    });
    if (listed.length) kids = listed.concat(kids.filter(function (k) { return listed.indexOf(k) < 0; }));   /* the order the list gives them */
    return { kids: kids, count: count, stayed: stayed, grandma: grandma };
  }
  /* Fold the line into the one-person reading: the wife, the children, the grandmother, and what was told of the couple in decades. */
  function applyLineage(out, L, lin, ctx) {
    var people = out.people || (out.people = []), kin = out.kin || (out.kin = []), self = people.filter(function (x) { return x.role === "self"; })[0], T = lin.subject;
    function stop(pl, role) { return { row: pl.row, alts: pl.alts, word: pl.word, role: role || "move", year: null, approx: false }; }
    var male = /father$/.test(out.rel || ""), told = function (pe, text) { (pe.events || (pe.events = [])).push({ type: "told", text: text }); };
    /* the wife: «his wife, my great grandmother is Lucija, born FRATROVIĆ» */
    var sp = people.filter(function (x) { return x.role === "spouse"; })[0], gre = /\bmy\s+(?:great|step)[- ]?(?:great[- ]?)*grand(mother|father)\s+(?:name\s+)?(?:is|was|named|called)\s+(\p{Lu}[\p{L}'’-]+)(?:\s*,?\s*(?:born|n[eé]e)\s+(\p{Lu}[\p{L}'’-]+))?/giu, gm, mate = null;
    while ((gm = gre.exec(T))) if ((gm[1].toLowerCase() === "mother") === male) { mate = gm; break; }
    if (!sp && mate) { sp = { role: "spouse", key: "S", name: cased(mate[2]), given: cased(mate[2]), surname: mate[3] ? cased(mate[3]) : "", place: self && self.place || null, events: [] }; people.push(sp); }
    else if (sp && mate && mate[3] && !sp.surname) { sp.surname = cased(mate[3]); }
    if (sp && mate && mate[3]) told(sp, "Born " + cased(mate[3]));
    /* «They're born likely 1910s and Married late 1930s»: decades, kept as told */
    var bm = /\bborn\s+(?:(likely|probably|about|around|maybe|perhaps)\s+)?(?:in\s+)?(?:the\s+)?(\d{3}0)s\b/i.exec(T), mm = /\bmarried\s+(?:(early|mid|late)\s+)?(?:in\s+)?(?:the\s+)?(\d{3}0)s\b/i.exec(T);
    [self, sp].forEach(function (pe) {
      if (!pe) return;
      if (bm) told(pe, "Born " + (bm[1] ? bm[1].toLowerCase() + " " : "") + "in the " + bm[2] + "s");
      if (mm) told(pe, "Married " + (mm[1] ? mm[1].toLowerCase() + " " : "in the ") + mm[2] + "s");
    });
    if (mm && out.left != null && Number(mm[2]) === out.left) out.left = null;   /* «married late 1930s» is not a year they left */
    if (bm && out.born != null && String(out.born).slice(0, 3) === bm[2].slice(0, 3)) out.born = null;
    /* the children, each with what was told of them */
    L.kids.forEach(function (k, i) {
      var key = "K" + (i + 1), pe = { role: "child", ofSubject: true, key: key, name: k.name, given: k.name, surname: "", unnamed: !k.name, sex: k.sex, label: k.sex === "F" ? "daughter" : k.sex === "M" ? "son" : "child", place: null, events: [] };
      if (!k.name) pe.nameNote = (k.sex === "M" ? "A son" : k.sex === "F" ? "A daughter" : "A child") + ", not named";
      k.notes.forEach(function (n) { told(pe, n); });
      people.push(pe);
      if (k.ev) { var st = []; if (k.ev.origin) st.push(stop(k.ev.origin, "origin")); (k.ev.moves || []).forEach(function (mv) { st.push(stop(mv.place, "move")); }); if (st.length) kin.push({ key: key, name: "", label: (k.sex === "M" ? "son " : k.sex === "F" ? "daughter " : "child ") + (k.name || "(not named)"), stops: st }); }
    });
    /* the grandmother: one of the children, which one is not said */
    if (L.grandma) {
      var g = { role: "line", key: "GM", ofSubject: true, name: "", given: "", surname: "", unnamed: true, nameNote: L.count ? "One of the " + L.count + " children, not said which" : "One of the children, not said which", label: "your grandmother", place: null, events: [] };
      if (L.grandma.born != null) g.events.push({ type: "born", year: L.grandma.born, place: null });
      people.push(g);
      if (L.grandma.ev) { var gs = []; if (L.grandma.ev.origin) gs.push(stop(L.grandma.ev.origin, "origin")); (L.grandma.ev.moves || []).forEach(function (mv) { gs.push(stop(mv.place, "move")); }); if (gs.length) kin.push({ key: "GM", name: "", label: "your grandmother", stops: gs }); }
    }
    if (L.stayed && L.stayed.place) kin.push({ key: "KS", name: "", label: (L.stayed.n ? L.stayed.n + " of the children" : "Some of the children") + " stayed", stops: [stop(L.stayed.place, "lived")] });
    out.lineage = { children: L.count, grandmother: !!L.grandma };
    return out;
  }
  /* A STORY ABOUT A NAMED ANCESTOR ("my great grandfather is Ivan Mihaljević and his wife, my great grandmother, is Lucija"): readMe draws the teller's own
     parents, grandparents and children and cannot draw a great-grandparent, so "They married in the 1930s" in such a story became the TELLER's parents' wedding.
     The ancestor is the subject, as in the one-person story. */
  function ancestorTold(t) { return /\bmy\s+(?:great|step)[- ]?(?:great[- ]?)*grand(?:father|mother|parent|pa|ma)\s+(?:name\s+)?(?:is|was|named|called)\s+\p{Lu}/u.test(String(t || "")); }
  function parseStory1(text, ctx, attached) {
    withExonyms(text, ctx);
    withWorldCities(text, ctx);
    var typed = String(text || ""), t = repairCase(typed.replace(/^\u2014 Picture \d+ \([^\n]*\) \u2014[ \t]*$/gm, " "), ctx), teller = "";   /* the line that names a picture read into the story is not story */
    /* "my name is David" says who is telling, not who the story is about */
    t = t.replace(/(^|[.!?]\s+|\n\s*)(Mum|Mom|Mam|Dad)(?=['\u2019]s\s+(?:(?:real|own|biological|birth|natural|step)[- ]?)?(?:mum|mom|mam|mother|dad|father|parents?|stepfather|stepmother|brother|sister|side|family)\b)/g, function (m, a, w) { return a + "My " + w.toLowerCase(); });
    t = t.replace(/\b((?:mum|mom|mother|dad|father)['\u2019]s\s+)(?:real|own|biological|birth|natural)\s+(?=mum|mom|mother|dad|father|parents?\b)/gi, "$1");
    /* «My mum's side is from Slovenia. Her mother, Marija Kos, ...»: «her» is your mum, so her mother is your mum's mother, a grandparent, not your mum */
    { var side = /\b(?:my|our)\s+(mum|mom|mother|dad|father)['\u2019]s\s+(?:side|family)\b/i.exec(t);
      if (side) { var who = side[1].toLowerCase(), pro = /^m/.test(who) ? "[Hh]er" : "[Hh]is"; t = t.slice(0, side.index) + t.slice(side.index).replace(new RegExp("\\b" + pro + "\\s+(?=(?:mum|mom|mother|dad|father)\\b)", "g"), "my " + who + "'s "); } }
    /* «my father, Marija Kos, was born» and «her mother, Anna, who» name the person in passing: the commas are not a list */
    t = t.replace(/\b((?:mother|father|mum|mom|dad|grandmother|grandfather|grandma|grandpa|nan|nana|nonna|nonno),)\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)\s*,(?=\s+(?:was|is|who|came|had|moved|left|lived|died|married)\b)/gu, function (m, kin, nm) { var f = S.fold(nm.split(" ")[0]); return STOP[f] || MONTHS[f] ? m : kin.slice(0, -1) + " " + nm; });
    /* «a small village near Udine called Ovaro»: Ovaro is the place, Udine is where it is */
    t = t.replace(/\b(?:an?\s+|the\s+)?(?:(?:small|little|tiny|mountain|farming|fishing)\s+){0,2}(?:village|town|hamlet|place|suburb|parish)\s+(?:just\s+)?(?:near|outside(?:\s+of)?|close\s+to)\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)\s*,?\s+(?:called|named)\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)/gu, "$2 near $1");
    /* «born in Pula when it was Italy»: who ruled it then is an aside, not a place anyone went */
    t = t.replace(/,?\s*\(?\b(?:back\s+)?(?:when|while)\s+(?:it|that|this|the\s+(?:town|city|area|region|place))\s+(?:was\s+|belonged\s+to\s+|still\s+belonged\s+to\s+)(?:still\s+)?(?:(?:a\s+)?part\s+of\s+|under\s+|in\s+)?(?:the\s+)?\p{Lu}[\p{L}'\u2019-]+(?:[ -](?:\p{Lu}[\p{L}'\u2019-]+|rule|empire|Empire))*\)?/gu, "");
    /* «my great grandad», «great-great nan»: the great- belongs to the word for a grandparent, whichever it is */
    t = t.replace(/\b((?:[Gg]reat[- ])+)(grandad|granddad|grandpa|gramps|grandma|granny|nana|nanna|nanny|nonno|nonna)\b/g, function (m, g, w) { return g + (/^(?:grandad|granddad|grandpa|gramps|nonno)$/.test(w) ? "grandfather" : "grandmother"); });
    t = t.replace(/\b([Mm]y|[Oo]ur)\s+((?:[Gg]reat[- ])+)(gran|nan)\b/g, "$1 $2grandmother");
    /* «twins Anna and Maria Novak»: both bear the surname written after the two names */
    t = t.replace(/\b([Tt]wins,?\s+)(\p{Lu}[\p{Ll}'\u2019-]+)(\s+(?:and|&)\s+\p{Lu}[\p{Ll}'\u2019-]+)\s+(\p{Lu}[\p{L}'\u2019-]+)/gu, function (m, a, n1, mid, sn) { var f = S.fold(sn); return STOP[f] || MONTHS[f] || COMMON[f] ? m : a + n1 + " " + sn + mid + " " + sn; });
    t = t.replace(/\bmy name is\s+([\p{L}'’-]+)(?:\s+([\p{Lu}][\p{L}'’-]+))?/iu, function (m, g, sn) { teller = cased(g) + (sn && /^\p{Lu}/u.test(sn) && !CONNECT.test(sn) && !STOP[S.fold(sn)] && !(ctx.map && ctx.map[S.fold(sn)]) ? " " + cased(sn) : ""); return " "; });
    t = t.replace(/\b[Ii] (?=(?:1[4-9][0-9]{2}|20[0-2][0-9])(?![0-9]))/g, "in ");   /* "moved to South Africa i 1942" */
    t = t.replace(/\b(my|his|her|their)\s+(grandfather|grandmother|father|mother|dad|mum|mom)\s+(\p{L}[\p{L}'\u2019-]+)((?:\s+(?:de|del|della|degli|dei|di|da|dos|das|van|von|der|den|ter|ten|la|le|Van|Von|De|Di|Da|La|Le))*\s+\p{Lu}[\p{L}'\u2019-]+)?(?=\s+(?:was|is|were|had|lived|moved|came|died|married|born|grew|left|emigrated|migrated|worked|travelled|traveled|went|sailed|returned|settled|arrived|and)\b|[,.;])/giu, function (m, pos, kin, nm, sn) {
      if (sn) { var lw = S.fold(sn.trim().split(/\s+/).pop()); if (STOP[lw] || COMMON[lw] || MONTHS[lw]) sn = ""; }   /* a surname that is also a village or a given name (Murphy, Berlin, Rossi) is still the surname */
      return !/^\p{Lu}/u.test(nm) || STOP[S.fold(nm)] || COMMON[S.fold(nm)] ? m : pos + " " + kin + " was " + nm + (sn || "") + ",";   /* "my father Marco was born in Florence" is "my father was Marco, was born in Florence" */
    });
    t = t.replace(/<\/?[a-z][^>]*>/gi, " ").replace(/\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/gi, " ");                  /* a link or an address in a pasted story is not a place */
    { var modern = /\b(?:19[89]\d|20[0-2]\d)\b/.test(t);   /* «left in '23» in a family story is 1923, unless the story itself reaches the 1980s or later */
      t = t.replace(/(^|[\s(])['\u2019](\d\d)(?=$|[\s.,;:)])/g, function (m, a, yy) { return a + (Number(yy) > 26 || !modern ? "19" : "20") + yy; }); }   /* "left in '45" */
    var out = { rel: "", given: "", surname: "", name: "", holds: "story", left: null, born: null, from: null, to: null };
    out.teller = teller;
    /* A LIFE TOLD IN THE THIRD PERSON ("Born in 1898 in a village near Split, Ivan Kovač inherited his father's hands..."): nobody says "my", so "his father"
       is the person's own father, not a relation of the reader; and the opening "Born in 1898 in X, Name verb" is the same as "Name was born in 1898 in X." */
    var firstPerson = /\b(?:my|our|me|mine|we)\b/i.test(t) || /\bI\b/.test(t);
    if (!firstPerson) t = t.replace(/^\s*Born in (\d{4})(?:,| in)?\s*([^]*?),\s*(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)\s+(?=\p{Ll})/u, function (m, y, pl, nm) { return nm + " was born in " + y + (pl ? " in " + pl.replace(/^in\s+/i, "") : "") + ". " + nm + " "; });
    var side = sideRelatives(t); t = side.rest; out.side = side.list;
    var rm = firstPerson ? REL.exec(t.replace(SIB_HAVE, " ")) : null;   /* «I have two brothers» tells of no relation the story is about */
    if (rm) rm = REL.exec(t.replace(SIB_HAVE, function (x) { return x.replace(/\S/g, "_"); }));
    /* "my husband Tom was born in Galway. His father Sean was ...": the father is the HUSBAND's. The teller's own relation is the spouse (or child), who is
       not on the list of relations, so "his father" / "her mother" after it is not the teller's father */
    var viaSp = firstPerson && rm && /\b(?:my|our)\s+(?:(?:late|ex|first|second|third)[- ])?(husband|wife|partner|fianc[e\u00e9]e?|son|daughter|boyfriend|girlfriend)\b/i.exec(t);
    if (viaSp && viaSp.index < rm.index && /\b(?:his|her|their)\s+$/i.test(t.slice(0, rm.index).slice(-8))) { rm = null; out.via = viaSp[1].toLowerCase(); }
    if (rm) { out.rel = rm[1].toLowerCase().replace(/ /g, "-"); out.rel = REL_ALIAS[out.rel] || out.rel; }
    { var cr = firstPerson ? composeRel(t) : ""; if (cr) out.rel = cr; }
    var ft = S.fold(t), tokens = ft.split(" ").filter(Boolean);
    ctx = Object.assign({}, ctx, { hintTokens: tokens });
    /* "he married a woman named Cheryl": Cheryl is his wife, not him. Names so introduced are taken out before the story's own name is looked for. */
    var spouse = null, tg = t.replace(KIN_NAMED, function (m, who, g, sn) {
      var okSn = sn && /^\p{Lu}/u.test(sn) && !STOP[S.fold(sn)] && !COMMON[S.fold(sn)] && !MONTHS[S.fold(sn)];
      if (!spouse && /^(?:married|woman|lady|wife|husband|spouse|partner|bride|groom|man|girl)/i.test(who)) spouse = { given: cased(g), surname: okSn ? cased(sn) : "" };
      return " ";
    });
    /* "He married Anna Horvat in Karlovac": a capitalised name straight after married is the spouse, not the person the story is about */
    tg = tg.replace(/\b(?:married|marry|wed|wedded)\s+(?!an?\b|the\b|my\b|his\b|her\b|their\b|in\b|on\b|at\b|into\b)(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, function (m, g, sn) {
      var fg = S.fold(g), fs2 = sn ? S.fold(sn) : "";
      if (STOP[fg] || COMMON[fg] || MONTHS[fg] || /^(?:him|her|them|me|us)$/.test(fg) || (ctx.map && ctx.map[fg] && !(ctx.given && ctx.given[fg]))) return m;
      var okSn = sn && !STOP[fs2] && !COMMON[fs2] && !MONTHS[fs2];
      if (!spouse) spouse = { given: cased(g), surname: okSn ? cased(sn) : "" };
      return " ";
    });
    /* "his third wife was Anna", "his wife Anna": the name belongs to the wife */
    tg = tg.replace(/\b(?:wife|husband|spouse|partner|fianc[e\u00e9]e?)\s+(?:was\s+|is\s+|named\s+|called\s+)?(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, function (m, g, sn) {
      var fg = S.fold(g); if (STOP[fg] || COMMON[fg] || MONTHS[fg] || (ctx.map && ctx.map[fg] && !(ctx.given && ctx.given[fg]))) return m;
      var fs3 = sn ? S.fold(sn) : "", okSn = sn && !STOP[fs3] && !COMMON[fs3] && !MONTHS[fs3];
      if (!spouse) spouse = { given: cased(g), surname: okSn ? cased(sn) : "" };
      return " ";
    });
    var kidsR = listedKids(tg, ctx); tg = kidsR.rest; out.kidsListed = kidsR.list; out.kidsCount = kidsR.count; out.kidsUnnamed = kidsR.unnamed;
    var sibs = readSiblings(tg, ctx); tg = sibs.rest;
    var sibLead = function (mine) { return mine ? "your " : /(?:mother|aunt|sister|wife|mum|mom|nonna)$/.test(out.rel || "") ? "her " : /(?:father|uncle|brother|husband|dad|nonno)$/.test(out.rel || "") ? "his " : "their "; };
    out.siblings = sibs.list.map(function (x) { return { rel: x.rel, name: x.name, label: sibLead(x.mine) + x.rel }; });
    unnamedSiblings(tg).forEach(function (u) {
      var named = out.siblings.filter(function (x) { return x.rel === u.rel; }).length;
      for (var k = named; k < u.n && out.siblings.length < 14; k++) out.siblings.push({ rel: u.rel, name: "", label: sibLead(u.mine) + u.rel });   /* told of, not named: shown so, never given a name */
    });
    /* "Athens, Georgia" and "Alexandria, Virginia": the state after a place and a comma is not the person's given name */
    var stateW = [];
    tg = tg.replace(/(\p{Lu}[\p{L}'\u2019-]+)(\s*,\s*)(\p{Lu}[\p{L}'\u2019-]+)/gu, function (m, a, sep, w) {
      var rw = ctx.map && ctx.map[S.fold(w)];
      if (!(ctx.map && ctx.map[S.fold(a)] && ctx.map[S.fold(a)].some(function (r) { return r.cc === "US"; }) && rw && rw.some(function (r) { return r.cc === "US" && S.fold(r.n) === S.fold(w) && (r.v || 0) >= 500; }))) return m;
      stateW.push(S.fold(w)); return a + " ";
    });
    var gv = ctx.given ? S.givenIn(tg, ctx.given, ctx.skip) : [];
    /* "his father Sean", "my mother Nora": a name straight after a word for a relation is that relation's, not the person the story is about, unless the
       story is told about that very relation ("my father Marco was born in ..."): the first such name is no longer taken for the subject's own */
    var kinOf = Object.create(null);
    (t.match(/\b(?:[Mm]other|[Mm]um|[Mm]om|[Ff]ather|[Dd]ad|[Uu]ncle|[Aa]unt(?:ie|y)?|[Bb]rother|[Ss]ister|[Cc]ousin|[Nn]ephew|[Nn]iece|[Ss]on|[Dd]aughter|[Ww]ife|[Hh]usband|[Gg]rand(?:father|mother|pa|ma|ad))\s+(?:(?:was|is|named|called)\s+)?\p{Lu}[\p{L}'\u2019-]+/gu) || []).forEach(function (m) {
      var ws = m.split(/\s+/), nm = S.fold(ws.pop()), kw = ws.join(" ").toLowerCase().replace(/\s+(?:was|is|named|called)$/, "");
      (kinOf[nm] || (kinOf[nm] = [])).push(kw);
    });
    var gvAll = gv; gv = gv.filter(function (g) { var ks = kinOf[g.word]; if (!ks) return true; return ks.some(function (kw) { kw = kw.replace(/\s+/g, "-"); var k2 = REL_ALIAS[kw] || kw; return out.rel && (out.rel === k2 || out.rel.slice(-k2.length - 1) === "-" + k2); }) || tokens.some(function (tk, i) { return tk === g.word && !ks.length; }); });
    /* a given name written only straight after in / at / from / near / to, and that is also a place ("lived in Sydney", "his mother in Zara"), is the place,
       not a person: every time the story writes it, a place marker stands before it */
    function markedOnly(w) {
      if (!(ctx.map && ctx.map[w] && ctx.map[w].length)) return false;
      var seenAt = 0, bare = false;
      tokens.forEach(function (tk, i) { if (tk !== w) return; seenAt++; if (!/^(?:in|at|from|near|to|into|en|nach|aus|von|iz|u|nel|nella)$/.test(tokens[i - 1] || "") && !forPlace(tokens, i)) bare = true; });
      return seenAt > 0 && !bare;
    }
    gv = gv.filter(function (g) { return !markedOnly(g.word); });
    /* a given name that is a month beside a day or a year (the 3rd of June, in May 1923), or the last word of a two-word place (Los Angeles, not Angeles), is not the person */
    gv = gv.filter(function (g) {
      var w = g.word, any = false, allMonth = !!MONTHS[w], allPlace = true;
      tokens.forEach(function (tk, i) {
        if (tk !== w) return; any = true;
        var p = tokens[i - 1] || "", n = tokens[i + 1] || "";
        if (!(/^\d{1,4}(?:st|nd|rd|th)?$/.test(p) || /^\d{1,4}(?:st|nd|rd|th)?$/.test(n) || /^(?:in|of|on|since|until|till|by|during|early|late|mid|this|last|next|every|each)$/.test(p))) allMonth = false;
        if (!(p && ctx.map && ctx.map[p + " " + w] && ctx.map[p + " " + w].length)) allPlace = false;
      });
      return !(any && (allMonth || allPlace));
    });
    var gset = Object.create(null); gvAll.forEach(function (g) { gset[g.word] = 1; }); stateW.forEach(function (w) { if (ctx.given && ctx.given[w]) gset[w] = 1; });
    if (gv.length) {
      out.given = gv[0].row.canon;
      var raw = tg.split(/\s+/), gi = -1;
      for (var i = 0; i < raw.length; i++) { var rf = S.fold(raw[i]); if (rf === gv[0].word || (/\p{L}-\p{L}/u.test(raw[i]) && rf.indexOf(gv[0].word + " ") === 0)) { gi = i; break; } }   /* «Mary-Jane» is one name, kept as written */
      if (gi > -1 && raw[gi + 1]) {
        var pj = gi + 1, pts = [], PRE = new RegExp("^(?:" + PARTICLES + ")$", "i");
        while (raw[pj + 1] && PRE.test(raw[pj].replace(/[,.;:]+$/, "")) && !/[,.;:]$/.test(raw[pj]) && (/^[A-ZÀ-ÖØ-ÝČĆŽŠĐ]/.test(raw[pj + 1]) || PRE.test(raw[pj + 1]))) { pts.push(raw[pj]); pj++; }
        var nx = raw[pj].replace(/^[("']+|[,.;:)"']+$/g, ""), partPre = pts.length ? pts.join(" ") + " " : "";
        var fx = S.fold(nx), cap = /^[A-ZÀ-ÖØ-ÝČĆŽŠĐ][\p{L}'’-]+$/u.test(nx);
        if (/^[\p{L}'’-]{3,}$/u.test(nx) && !STOP[fx] && !REL.test(nx) && (cap || (!/[A-ZÀ-ÖØ-Þ]/.test(t) && !COMMON[fx] && !OCC[fx] && !(ctx.map && ctx.map[fx] && ctx.map[fx].length > 2)))) out.surname = partPre + nx;
      }
      if (gi > 0 && !out.surname) {   /* «Horvat, Ivan b. Senj 1880», «HORVAT Ivan»: a capitalised word before the first name, with a comma or in capitals, and not a place or a common word, is the surname */
        var pv = raw[gi - 1].replace(/^[("']+/, ""), pvf = S.fold(pv.replace(/[,.;:]+$/, ""));
        if (/^\p{Lu}[\p{L}'\u2019-]{2,},$/u.test(pv) || /^\p{Lu}{3,}$/u.test(pv)) if (!STOP[pvf] && !COMMON[pvf] && !MONTHS[pvf] && !REL.test(pv) && !(ctx.map && ctx.map[pvf] && ctx.map[pvf].length) && !(ctx.given && ctx.given[pvf])) out.surname = pv.replace(/[,.;:]+$/, "");
      }
      out.givenWord = raw[gi] ? raw[gi].replace(/[,.;:]+$/, "") : gv[0].word;   /* the name as the story has it, never the family's other form */
      out.givenWord = cased(out.givenWord); if (out.surname) out.surname = surnameCase(out.surname);
      out.name = out.givenWord + (out.surname ? " " + out.surname : "");
    }
    /* "Jan van der Berg was born in Utrecht", "Seán Mac Carthy left Cork": a sentence that opens with a name and says what the person did. A short or accented first
       name is not in the list the page loads, so the shape of the sentence is what says it is a name: capitalised first word (no place, no common word), surname, a verb of a life. */
    if (!out.name || (out.given && /\s(?:Mac|Mc)$/.test(out.name))) {
      var om = /(?:^|[.!?]\s+|\n\s*)(\p{Lu}[\p{Ll}'\u2019-]+)(?=[ \t]+\p{L})/gu, o1;
      while ((o1 = om.exec(tg))) {
        var of1 = S.fold(o1[1]); if (STOP[of1] || COMMON[of1] || MONTHS[of1] || KINW.test(of1) || REL.test(o1[1]) || OCC[of1] || ADVERBISH.test(of1) || CONNECT.test(o1[1]) || (ctx.map && ctx.map[of1] && ctx.map[of1].length)) continue;
        var osa = surnameAfter(tg.slice(o1.index + o1[0].length));
        if (!osa || !/^\s*,?\s*(?:was born|born|left|emigrated|migrated|came|moved|married|died|sailed|arrived|lived|settled|went)\b/.test(tg.slice(o1.index + o1[0].length + osa.len))) continue;
        out.givenWord = o1[1]; out.surname = osa.sur; out.name = o1[1] + " " + osa.sur; break;
      }
    }
    /* A SURNAME THE STORY SAYS IS ONE: «the surname was Kosina», «family name: Kosina». The answer to the page's own «What was the surname?» is that sentence, and it was not read. */
    if (!out.surname) {
      var sm = /\b(?:sur|family|last)\s?names?(?:\s+(?:was|is|were))?\s*:?\s+(\p{L}[\p{L}'\u2019-]{2,})/iu.exec(tg);
      if (sm) {
        var sx = S.fold(sm[1]), scap = /^\p{Lu}/u.test(sm[1]);
        if (!STOP[sx] && !REL.test(sm[1]) && !MONTHS[sx] && (scap || (/^\s*(?:[.!?;,]|$)/.test(tg.slice(sm.index + sm[0].length)) && !COMMON[sx] && !/(?:ed|ing)$/.test(sx) && !(ctx.map && ctx.map[sx] && ctx.map[sx].length > 2)))) { out.surname = cased(sm[1]); out.name = (out.givenWord ? out.givenWord + " " : "") + out.surname; }
      }
    }
    var all = [];
    if (/\b(photo|photograph|picture|snapshot|portrait)\b/i.test(t)) all.push("photo");
    if (/\b(document|certificate|passport|papers|record|register|manifest|visa)\b/i.test(t)) all.push("document");
    if (/\b(letter|postcard|diary)\b/i.test(t)) all.push("letter");
    (Array.isArray(attached) ? attached : attached ? [attached] : []).forEach(function (k) { if (HOLDS[k] && all.indexOf(k) < 0) all.push(k); });
    out.holdsAll = all.length ? all : ["story"];
    out.holds = (Array.isArray(attached) ? attached[0] : attached) || (all.indexOf("photo") > -1 ? "photo" : all.indexOf("letter") > -1 ? "letter" : all.indexOf("document") > -1 ? "document" : "story");

    /* WHAT THEY DID FOR A LIVING, as the story says it ("a stonemason", "worked as a coal miner", "farmer"): kept as told, never looked up */
    out.occupations = [];
    (t.match(/[\p{L}]+/gu) || []).forEach(function (w) { var f = S.fold(w); if (OCC[f] && f.length > 3 && out.occupations.indexOf(f) < 0 && out.occupations.length < 4 && !(ctx.given && ctx.given[f] && /^[A-ZÀ-ÖØ-Þ]/.test(w))) out.occupations.push(f); });
    out.occupation = out.occupations[0] || "";
    var ys = yearsIn(mainYearsText(t)), born = null, left = null, rest = [];
    ys.forEach(function (y) { if (/(born|birth|b|b\.)(?:\s+in)?\s*$/.test(y.before) && born == null) born = y.y; else rest.push(y); });
    if (rest.length) {
      var lab = rest.filter(function (y) { return /(came|arriv|left|emigrat|sail|around|about|circa|c\.|abt|in|by|moved)\s*$/.test(y.before); })[0] || rest[rest.length - 1];
      left = lab.y;
      var rngStart = Object.create(null); String(t).replace(/\b(?:from|between|during)\s+(1[4-9]\d\d|20[0-2]\d)\s+(?:to|until|till|through|and|-)\s+(?:1[4-9]\d\d|20[0-2]\d)\b/gi, function (m0, a0) { rngStart[a0] = 1; return m0; });   /* «from 1950 to 1960» is a stay, not a birth */
      if (born == null && rest.length > 1) { var e = rest.map(function (y) { return y.y; }).sort(function (a, b) { return a - b; })[0]; if (e < left && !rngStart[e]) born = e; }
    }
    out.left = left; out.born = born;

    var cands = ctx.map ? S.candidates(t, ctx.map, ctx.skip) : [];
    cands = withCountryHints(cands, tokens, ctx);
    cands = withCountries(cands, tokens, ctx, gset);
    ctx.__typed = Object.create(null); String(t).normalize("NFC").split(/[\s,;.!?()"]+/).forEach(function (w) { var lw = w.toLowerCase(); if (/[^\u0000-\u007f]/.test(lw)) ctx.__typed[S.fold(lw)] = lw; });   /* a place typed with its own accents (Kraków) is that place, not its accentless namesakes */
    var ci0 = capInfo(t, tokens);
    cands = withContext(cands, ctx, function (c) { return notPlace(c, tokens, ci0, ctx); });
    ctx.__rank = Object.create(null); cands.forEach(function (c) { ctx.__rank[c.word] = c.rows; });   /* the readings, in the story's own order, for the readings of each person */
    /* a word that is no place's own name but sits inside the names of several ("Friuli" in Pozzuolo del Friuli) is not a place: it is offered, not used */
    var suggest = [];
    cands = cands.filter(function (c) {
      if (c.word.indexOf(" ") > -1 || c.country || !c.rows.length) return true;
      var exact = c.rows.some(function (r) { return S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "")) === c.word || S.fold(String(r.n).split(",")[0]) === c.word; });
      if (exact || !c.rows.every(function (r) { return (" " + S.fold(r.n) + " ").indexOf(" " + c.word + " ") > -1; })) return true;
      if (gset && gset[c.word]) return false;   /* "mother Catherine" is a person: not offered as Saint Catherine Parish */
      if (!PREP_PLACE.test(tokens[c.at - 1] || "")) return false;   /* "the Church of St Anne", "the family name Schmidt": only a word the story puts after in / at / from / to is offered as a place */
      suggest.push({ typed: c.word.charAt(0).toUpperCase() + c.word.slice(1), kind: "partial", options: c.rows.slice(0, 3).map(function (r) { return { n: String(r.n).replace(/\s*\([^)]*\)/g, ""), cc: r.cc, cn: ctx.countries && ctx.countries[r.cc] || r.cc }; }) });
      return false;
    });
    /* a name the story gives a person ("my dad is Ivan", "his dad is Giovanni") is a person, never a place, unless a "from"/"in" comes before it */
    var fam = ctx.map ? readFamily(t, ctx) : null, me = ctx.map && !fam && !ancestorTold(t) ? readMe(t, ctx) : null, sought = ctx.map && !fam && !me ? readSought(t, ctx) : null, nameW = Object.create(null);
    [fam, me, sought].forEach(function (f) { if (f) Object.keys(f.people).forEach(function (k) { var pe = f.people[k]; [pe.given, pe.surname].forEach(function (n) { if (n) nameW[S.fold(n)] = 1; }); }); });
    if (spouse && spouse.given) nameW[S.fold(spouse.given)] = 1;
    (out.kidsListed || []).forEach(function (k) { nameW[S.fold(k.name)] = 1; });
    var kinName = "";
    (t.match(/\b(?:[Mm]other|[Mm]um|[Mm]om|[Ff]ather|[Dd]ad|[Uu]ncle|[Aa]unt(?:ie|y)?|[Bb]rother|[Ss]ister|[Cc]ousin|[Nn]ephew|[Nn]iece|[Ff]riend|[Nn]eighbou?r|[Ss]on|[Dd]aughter|[Ww]ife|[Hh]usband|[Gg]rand(?:father|mother|pa|ma|ad))(?:\s*,)?\s+(?:(?:was|is|named|called)\s+)?\p{Lu}[\p{L}'\u2019-]+/gu) || []).forEach(function (m) {
      var comma = /,/.test(m), ws = m.replace(/\s*,/, "").replace(/\s+(?:was|is|named|called)\s+/, " ").split(/\s+/), nm = ws.pop(), kw = ws.join(" ").toLowerCase();
      if (comma && ctx.map && ctx.map[S.fold(nm)] && !(ctx.given && ctx.given[S.fold(nm)])) return;   /* «my mother, Cork» is not a name */
      nameW[S.fold(nm)] = 1;                                                    /* "my uncle Jordan" is a man, not South Jordan */
      if (!kinName && out.rel && (out.rel === kw || REL_ALIAS[kw] === out.rel || KINC[kw] === out.rel) && !STOP[S.fold(nm)] && !MONTHS[S.fold(nm)] && !ADVERBISH.test(S.fold(nm))) kinName = nm;   /* a capital right after «my mum» is a name, even «Peg» or «Will» */
    });
    /* «my mum Peg Murphy»: the word after the name, written with a capital, is the surname, with its particles (de la Cruz, van der Berg) */
    var kinSur = "";
    if (kinName) { var ksm = new RegExp("\\b" + kinName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+((?:(?:" + PARTICLES + ")\\s+)*\\p{Lu}[\\p{L}'\u2019-]+)", "u").exec(t);
      if (ksm) { var kw0 = ksm[1].split(/\s+/), kl = kw0[kw0.length - 1], kf = S.fold(kl); if (!STOP[kf] && !MONTHS[kf] && !REL.test(kl) && !KINW.test(kf) && !ADVERBISH.test(kf) && !EV_BORN.test(kf) && !EV_DIED.test(kf) && !EV_WED.test(kf) && !EV_MOVE.test(kf)) kinSur = ksm[1]; } }
    var ci = capInfo(t, tokens);
    if (!out.name && kinName) { out.givenWord = kinName; out.name = kinName; if (kinSur && !out.surname) { out.surname = kinSur; out.name = kinName + " " + kinSur; } }
    /* the place finder gives a word once, at its first place in the text; for a name that is also a person's ("My father Sydney lived in Sydney") the
       place is the occurrence a place marker stands before */
    cands.forEach(function (c) {
      if (c.country || c.word.indexOf(" ") > -1 || !(gset[c.word] || nameW[c.word])) return;
      var MK = /^(?:in|at|from|near|to|into|nach|aus|von|iz|u|nel|nella)$/;
      if (MK.test(tokens[c.at - 1] || "") || forPlace(tokens, c.at)) return;
      for (var i = c.at + 1; i < tokens.length; i++) if (tokens[i] === c.word && (MK.test(tokens[i - 1] || "") || forPlace(tokens, i))) { c.at = i; return; }
    });
    var rolesFor = cands.map(function (c) {
      var p1 = tokens[c.at - 1] || "", p2 = tokens[c.at - 2] || "", isGiven = !!gset[c.word] || !!nameW[c.word];
      var role = PLACE_BEFORE[p1] || ((p1 === "in" && p2 === "born") ? "from" : (p1 === "in" && /^(settled|arrived|lived|living|came|went|emigrated|moved)$/.test(p2)) ? "to" : "");
      var drop = (isGiven && !role && !listTail(c, cands, t) && !stateTail(c, cands, t) && !placeList(c, cands, tokens, function (w) { return !!gset[w] || !!nameW[w]; }) && !(c.word.indexOf(" ") < 0 && (/^(?:in|at|near|from|to|into|nach|aus|von|iz|u|nel|nella)$/.test(p1) || forPlace(tokens, c.at)) && ctx.map && ctx.map[c.word] && ctx.map[c.word].length)) || (c.word.indexOf(" ") < 0 && (STOP[c.word] || COMMON[c.word] || REL.test(c.word))) || notPlace(c, tokens, ci, ctx);
      return { c: c, role: role, drop: drop };
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
    rolesFor.forEach(function (x, xi) {
      var c = x.c, prev = stops[stops.length - 1], len = c.word.split(" ").length;
      var nx2 = rolesFor[xi + 1], nextAdj = !!nx2 && (nx2.c.at === c.at + len || (nx2.c.at === c.at + len + 1 && tokens[c.at + len] === "and"));
      /* "New York, United States": a country (or place) written right after a stop says which of the same-named places was meant */
      if (prev && prev.row && prev.row.i === "n-galicia-central" && c.country && c.at === prev.at + prev.len) return;   /* «Galicia, Austria»: the country says which Galicia, it is not a second place */
      if (prev && (c.at === prev.at + prev.len || (c.at === prev.at + prev.len + 1 && tokens[c.at - 1] === "in")) && !prev.country) {
        /* a place written right after another says which one was meant ("Paris, Texas", "Lerwick in Scotland") unless they are two in a list
           ("Cork, Dublin, Liverpool and Boston"), where each is a stop of its own */
        var pool = prev.pool || [prev.row].concat(prev.alts || []), tail = " " + c.word, listy = !c.country && (prev.adjPrev || nextAdj), q0 = c.rows[0];
        function nearest(list) { if (list.length < 2 || !q0 || q0.x == null) return list[0]; var best = list[0], bd = 1e18; list.forEach(function (r) { if (r.x == null) return; var dx = (r.x - q0.x) * Math.cos(r.y * Math.PI / 180), dy = r.y - q0.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = r; } }); return best; }
        var pick = listy ? null : pool.filter(function (r) { var fn = S.fold(String(r.n)); return fn.slice(-tail.length) === tail && fn.indexOf(prev.word) === 0; })[0]
          || (listy ? null : (c.country ? pool.filter(function (r) { return c.rows.some(function (cr) { return cr.cc === r.cc; }); })[0] : nearest(pool.filter(function (r) { return c.rows.some(function (cr) { return cr.cc === r.cc; }); }))));   /* a COUNTRY after the place (Zagreb, Croatia) keeps the place's own ranking among that country's: the nearest to the country's middle was a county */
        if (pick) { prev.alts = pool.filter(function (r) { return r !== pick; }).slice(0, 5); prev.row = pick; prev.country = c.word; return; }
      }
      var lo = Math.max(prev ? prev.at + prev.len : 0, c.at - 6), win = tokens.slice(lo, c.at).join(" ").replace(/(?: (?:county|co|province|state|city|town|village|parish|district|region|island))+$/, "");
      var anc = null, am, are = new RegExp(ANC.source, "g");
      while ((am = are.exec(win))) anc = am[1];
      var role = anc ? (/mother|mum|mom|grandmother/.test(anc) ? "mother" : "father") + "-from"
        : /\bborn\b/.test(win) && !MOVE.test(win.slice(win.lastIndexOf("born"))) ? "born"   /* "born in 1951 and moved to Botswana": Botswana is where he moved, not where he was born */
        : /(^| )(from|of)$/.test(win) ? "origin"
        : MOVE.test(win) ? "move" : "lived";
      stops.push({ row: c.rows[0], alts: c.rows.slice(1, 6), pool: c.rows, word: c.word, at: c.at, len: len, role: role, age: null, year: null, approx: false, isCountry: !!c.country, before: /(?:^| )(?:before that|previously|earlier|prior to that|originally|beforehand)(?: |$)/.test(win),
        beforeMove: /(?:^| )before (?:moving|going|coming|leaving|travelling|traveling|emigrating|settling|relocating|returning|heading|sailing|migrating)(?: (?:to|in|into|back to))?$/.test(tokens.slice(Math.max(0, c.at - 4), c.at).join(" ")),
        adjPrev: !!prev && (c.at === prev.at + prev.len || (c.at === prev.at + prev.len + 1 && tokens[c.at - 1] === "and")) });
    });
    /* a place told again after a return ("left for Boston, and returned to Cork") is a stop again, which the place finder (a word once per text) does not give */
    stops.slice().forEach(function (st) {
      if (st.isCountry) return;
      var ws = st.word.split(" ");
      for (var i = st.at + st.len; i + ws.length <= tokens.length; i++) {
        if (tokens.slice(i, i + ws.length).join(" ") !== st.word) continue;
        if (!(/^(returned|back|again|home)$/.test(tokens[i - 1] || "") || /^(returned|back|again|home)$/.test(tokens[i - 2] || "") || /^(returned|back)$/.test(tokens[i - 3] || ""))) continue;
        if (stops.some(function (x) { return x.at === i; })) continue;
        stops.push({ row: st.row, alts: st.alts, pool: st.pool, word: st.word, at: i, len: ws.length, role: "move", age: null, year: null, approx: false, isCountry: false, again: true });
      }
    });
    stops.sort(function (a, b) { return a.at - b.at; });
    /* «they lived in Dreznik near Nova Gradiska»: a place after «near» that stands right after another place says where THAT place is; it is not a stop on the way */
    for (var ni = stops.length - 1; ni > 0; ni--) {
      var ns = stops[ni], np = stops[ni - 1];
      if (tokens[ns.at - 1] === "near" && !ns.isCountry && !np.isCountry && ns.at - (np.at + np.len) <= 1) { np.nearTo = ns; stops.splice(ni, 1); }   /* kept as np.nearTo: the plan anchors on the place the story pins the first one to */
    }
    /* a place told backwards ("He ended up in Perth. Before that he lived in Cork.") goes before the one told just ahead of it */
    for (var bi = 1; bi < stops.length; bi++) if (stops[bi].before && !stops[bi - 1].before) { var tmp = stops[bi]; stops[bi] = stops[bi - 1]; stops[bi - 1] = tmp; }
    /* «from Genoa to Buenos Aires via Marseille»: the place after "via" is between the two before it. «Before moving to Boston he lived in Cork»: Cork came first. */
    for (var vi = 1; vi < stops.length; vi++) if (tokens[stops[vi].at - 1] === "via" && tokens[stops[vi - 1].at - 1] !== "via") { var tv = stops[vi]; stops[vi] = stops[vi - 1]; stops[vi - 1] = tv; }
    for (var mi = 0; mi < stops.length - 1; mi++) if (stops[mi].beforeMove && !stops[mi + 1].beforeMove && !stops[mi + 1].before) { var tm = stops[mi]; stops[mi] = stops[mi + 1]; stops[mi + 1] = tm; mi++; }
    /* THE YEAR A STORY GIVES BESIDE A PLACE belongs to that place: "from County Cork in Ireland in 1928", "moved to South Africa in 1942". A year
       after a place and close to it is its year; a year just before a place ("in 1942 he moved to Perth") is the next place's. A birth year is not. */
    tokens.forEach(function (w, i) {
      if (!/^(?:1[4-9][0-9]{2}|20[0-2][0-9])$/.test(w) || /^(?:born|birth|b)$/.test(tokens[i - 1] || "") || (tokens[i - 1] === "in" && tokens[i - 2] === "born")) return;
      var before = null, after = null;
      stops.forEach(function (st) { var end = st.at + st.len; if (end <= i && i - end <= 4 && st.year == null) before = st; if (!after && st.at > i && st.at - i <= 5 && st.year == null) after = st; });
      /* «Born 1880 in Senj, died 1950 in Rijeka», «Born: 1880, Senj  Died: 1950, Rijeka»: a year right after an event word ("died 1950", "married in 1950") belongs to the place told AFTER it,
         not to the place told before the event word. «Senj 1880 - Rijeka 1950» (the year right after its place) is unchanged. */
      var cue = YEAR_CUE.test(tokens[i - 1] || "") || (tokens[i - 1] === "in" && YEAR_CUE.test(tokens[i - 2] || ""));
      var own = (cue && after && after.at - i <= 3) ? after : (before || after); if (own) { own.year = Number(w); own.yearTold = true; }
    });
    /* the same place twice running is one stop: "Fiume (now Rijeka)" names it by its two names, and the year told of either is the place's */
    for (var di = stops.length - 1; di > 0; di--) {
      var d1 = stops[di], d0 = stops[di - 1];
      if (d1.row.i === d0.row.i && !d1.again) { if (d0.year == null && d1.year != null) { d0.year = d1.year; d0.yearTold = d1.yearTold; } stops.splice(di, 1); }
    }
    /* a country named on its way to a place in it ("to South Africa ... then to Johannesburg") is that place's country, not a stop of its own; its year goes on */
    for (var ci = stops.length - 1; ci >= 0; ci--) {
      var cs = stops[ci], nx = stops[ci + 1];
      if (cs.isCountry && nx && !nx.isCountry && nx.row.cc === cs.row.cc) { if (cs.year != null && nx.year == null) { nx.year = cs.year; nx.yearTold = true; } stops.splice(ci, 1); }
    }
    /* TWO PEOPLE IN ONE STORY: "my grandfather was born in Cork. My wife was born in Sydney." or "my husband Tom was born in Galway and my father was
       born in Cork". The story is about the teller's relation; a place told of the teller's own husband, wife or partner is theirs, kept off that
       relation's journey and given to the spouse. Only where the story has a relation to be about. */
    var spStops = [];
    if (firstPerson && out.rel) {
      var spre = /\b(?:my|our)\s+(?:(?:late|ex|first|second|third)[- ])?(?:husband|wife|partner|fianc[e\u00e9]e?|boyfriend|girlfriend)\b(?!['\u2019]s)(?!\s+(?:and|or)\s+(?:i|me)\b)/gi, sm0;
      while ((sm0 = spre.exec(t))) {
        var clause = t.slice(sm0.index).split(/[.!?;\n]|\s(?:and|but|while)\s+(?:my|our)\b/i)[0];
        var c0 = S.fold(t.slice(0, sm0.index)).split(" ").filter(Boolean).length, c1 = c0 + S.fold(clause).split(" ").filter(Boolean).length;
        stops.forEach(function (st) { if (st.at >= c0 && st.at < c1 && !st.isCountry && /^(?:born|lived|move|origin)$/.test(st.role) && spStops.indexOf(st) < 0) spStops.push(st); });
      }
      spStops.forEach(function (st) { st.of = "spouse"; });
    }
    /* THE SAME-NAMED PLACES, SETTLED BY THE COMPANY THEY KEEP. «Perth, Sydney and Melbourne» are Australian whichever Perth the index ranks first; a place named bare is the place itself, not the county that
       shares its name (Austin, not Austin County). A place the story qualified ("Paris, Texas") is left as the story said. */
    (function () {
      var cnt = Object.create(null), sumV = Object.create(null), own = new Map();
      stops.forEach(function (st) {
        if (st.isCountry) return; var best = Object.create(null), mine = Object.create(null), mineV = Object.create(null);
        var first = (st.pool && st.pool[0] && st.pool[0].cc) || (st.row && st.row.cc);
        (st.pool || [st.row]).forEach(function (r) { if (r && r.cc) best[r.cc] = Math.max(best[r.cc] || 0, r.v || 0); });
        Object.keys(best).forEach(function (cc) { var w = (cc === first ? 1 : 0.4) + (cc === first ? Math.min(1, Math.log10(1 + best[cc]) / 2) : 0); mine[cc] = w; mineV[cc] = best[cc]; cnt[cc] = (cnt[cc] || 0) + w; sumV[cc] = (sumV[cc] || 0) + best[cc]; });   /* the first reading counts in full, a namesake in the pool a little, and the books the Atlas holds there (Sydney, Perth and Melbourne have far more in Australia than in Canada) */
        own.set(st, { w: mine, v: mineV });
      });
      var cur0 = null;   /* what the OTHER stops say: a place is moved by its company, never by its own namesakes (Lisbon is not moved to Ohio by the Lisbon in Ohio) */
      var others = function (cc) { var o = own.get(cur0) || { w: {}, v: {} }; return (cnt[cc] || 0) - (o.w[cc] || 0); };
      var beats = function (a, b) { var o = own.get(cur0) || { w: {}, v: {} }, d = others(a) - others(b); return d > 0.01 || (Math.abs(d) <= 0.01 && ((sumV[a] || 0) - (o.v[a] || 0)) > ((sumV[b] || 0) - (o.v[b] || 0))); };
      stops.forEach(function (st) {
        if (st.isCountry || typeof st.country === "string" || !st.pool || st.pool.length < 2) return;
        cur0 = st;
        var cur = st.row, best = cur;
        var withSuffix = !cur.usual && S.fold(String(cur.n)).indexOf(st.word + " ") === 0;   /* "Austin County" for the word "austin" */
        var exact = withSuffix ? st.pool.filter(function (r) { return r.cc === cur.cc && S.fold(String(r.n)) === st.word; })[0] : null;
        if (exact) best = exact;
        var tw = (ctx.__typed || {})[st.word], strong = (cur.v || 0) >= 50 || cur.c > 0 || cur.al || cur.exo || cur.fam || cur.usual || (tw && String(cur.n).normalize("NFC").toLowerCase() === tw);   /* a place the shelf holds well, or that came by an older name (Fiume), is not moved by its neighbours */
        if (!strong) st.pool.forEach(function (r) {
          if (r.cc !== best.cc && others(r.cc) >= 1 && beats(r.cc, best.cc)) { var ex2 = st.pool.filter(function (q) { return q.cc === r.cc && S.fold(String(q.n)) === st.word; })[0]; best = ex2 || r; }
        });
        if (best !== cur) { st.alts = st.pool.filter(function (r) { return r !== best; }).slice(0, 5); st.row = best; }
      });
    })();
    var route = stops.filter(function (x) { return x.role !== "father-from" && x.role !== "mother-from" && x.of !== "spouse"; });
    /* ages: "when he was 3 years old he moved to Harare" gives Harare age 3; a stop with no age sits between its neighbours */
    var AGE = /(?:(?:when|by the time) (?:he|she|they|i|we) (?:was|were|turned)|aged?|at the age of|at age|by the age of|at) (\d{1,2})(?: years?(?: old)?)?(?= |$)/g, am2, ages = [];
    while ((am2 = AGE.exec(ft))) { if (/^at \d/.test(am2[0]) && /^ (?:\S+ )?(?:street|st|road|rd|avenue|ave|lane|ln|square|drive|court|terrace|place|way|park|row|hill|crescent|gardens|close)\b/.test(ft.slice(am2.index + am2[0].length))) continue; ages.push({ age: Number(am2[1]), tok: ft.slice(0, am2.index).split(" ").length - 1, end: ft.slice(0, am2.index).split(" ").length - 1 + am2[0].split(" ").length }); }
    /* AN AGE TOLD AFTER THE PLACE BELONGS TO THAT PLACE. «My dad moved to Botswana when he was 3 years old, then he moved to Salisbury»: the 3 is the age at Botswana, and the old
       rule (an age belongs to the next place after it) gave it to Salisbury, so Botswana had no age and no years, and showed every era. An age that starts within two words of a place and is
       followed by «then», «and», «but» or nothing is that place's; one followed by «he moved…», «they went…» (the «when he was 3 he moved to Harare» order) stays with the next place. */
    var AGE_AFTER_OK = /^(?:then|and|but|later|so|until|before|after|where|there|whereupon)$/, AGE_NEXT_MOVES = /^(?:he|she|they|i|we|his|her|their|moved|went|came|left|emigrated|travelled|traveled|sailed|arrived|settled|returned)$/, agesTaken = Object.create(null);
    route.forEach(function (st) {
      if (st.role === "born" || st.at == null) return;
      var endTok = st.at + String(st.word || "").split(" ").length;
      for (var k = 0; k < ages.length; k++) {
        if (agesTaken[k]) continue;
        var d = ages[k].tok - endTok; if (d < 0 || d > 2) continue;
        var nxt = tokens[ages[k].end] || "";
        if (nxt && !AGE_AFTER_OK.test(nxt) && AGE_NEXT_MOVES.test(nxt)) continue;
        if (route.some(function (o) { return o !== st && o.at >= endTok && o.at <= ages[k].tok; })) continue;
        st.age = ages[k].age; st.ageTold = true; agesTaken[k] = true; break;
      }
    });
    var au = 0, lastAt = -1;
    route.forEach(function (st) {
      if (st.role === "born") st.age = 0;
      else if (st.ageTold) { /* already read from the words just after it */ }
      else for (var k = au; k < ages.length; k++) if (!agesTaken[k] && ages[k].tok >= lastAt && ages[k].tok < st.at) { st.age = ages[k].age; au = k + 1; break; }
      lastAt = st.at;
    });
    for (var i0 = 0; i0 < route.length; i0++) {
      if (route[i0].age != null) continue;
      var a0 = i0 - 1, b0 = i0 + 1; while (b0 < route.length && route[b0].age == null) b0++;
      var from0 = a0 >= 0 && route[a0].age != null ? route[a0].age : null, to0 = b0 < route.length ? route[b0].age : null;
      if (from0 != null && to0 != null) { route[i0].age = Math.round(from0 + (to0 - from0) * (i0 - a0) / (b0 - a0)); route[i0].approx = true; }
      else if (from0 != null) { route[i0].age = from0; route[i0].approx = true; }
    }
    if (out.born != null) route.forEach(function (st) { if (st.age != null && !st.yearTold) st.year = out.born + st.age; });
    /* the place a person was born is where the journey starts, however the story came to it ("He died in Boston. He had been born in Cork.") */
    var borns = route.filter(function (x) { return x.role === "born"; });
    if (borns.length === 1 && route[0] !== borns[0]) { route.splice(route.indexOf(borns[0]), 1); route.unshift(borns[0]); stops.splice(stops.indexOf(borns[0]), 1); stops.unshift(borns[0]); }
    out.stops = stops.filter(function (x) { return x.of !== "spouse"; }); out.route = route;
    if (route.length) {
      out.from = { row: route[0].row, alts: route[0].alts, word: route[0].word };
      out.to = route.length > 1 ? { row: route[route.length - 1].row, alts: route[route.length - 1].alts, word: route[route.length - 1].word } : null;
    }

    /* the people: the one the story is about, and the parents it names */
    var people = [];
    if (out.name || out.rel) people.push({ role: "self", rel: out.rel, name: out.name, given: out.givenWord || "", surname: out.surname || "", place: route[0] || null, unnamed: !out.name, occupation: out.occupation });
    function kin(which, re) {
      var m = re.exec(t); if (!m) return null;
      var g = m[1] || "", sn = m[2] || "", fg = S.fold(g), fs = S.fold(sn);
      if (!g || STOP[fg] || COMMON[fg] || EV_BORN.test(fg) || EV_DIED.test(fg) || EV_WED.test(fg) || EV_MOVE.test(fg) || /^(?:killed|drowned|executed|hanged|shot|lost|ill|sick|buried|single|widowed|divorced|alive|old|young|tall|short|poor|rich)$/.test(fg)) return null;
      var ok = sn && /^[\p{L}'’-]{3,}$/u.test(sn) && !STOP[fs] && !COMMON[fs] && !(ctx.given && ctx.given[fs]);
      var full = surnameAfter(t.slice(m.index + (m[2] ? m[0].lastIndexOf(g, m[0].length - m[2].length - 1) : m[0].lastIndexOf(g)) + g.length));   /* "van der Berg", "Rossi": a capitalised surname right after the name */
      var sur = full ? full.sur : ok ? cased(sn) : "";
      return { role: which, name: cased(g) + (sur ? " " + sur : ""), given: cased(g), surname: sur, presumed: false };
    }
    /* "my father was Ivan Defranceski ... his father was Ivan": when the story is about the teller's own father, "his father" is HIS father, not the teller's */
    var ABOUT_PARENT = /^(?:father|mother|grandfather|grandmother)$/.test(out.rel || ""), POSS = ABOUT_PARENT ? "his|her|their" : "his|her|their|my";
    var fa = kin("father", new RegExp("\\b(?:" + POSS + ")\\s+(?:father|dad)(?:'?s)?(?:\\s+name)?\\s+(?:was|is|named|called)\\s+([\\p{L}'\u2019-]+)(?:\\s+([\\p{L}'\u2019-]+))?", "iu"));
    var mo = kin("mother", new RegExp("\\b(?:" + POSS + ")\\s+(?:mother|mum|mom)(?:'?s)?(?:\\s+name)?\\s+(?:was|is|named|called)\\s+([\\p{L}'\u2019-]+)(?:\\s+([\\p{L}'\u2019-]+))?", "iu"));
    var fromP = stops.filter(function (x) { return x.role === "father-from"; })[0], fromM = stops.filter(function (x) { return x.role === "mother-from"; })[0];
    if (!fa && fromP) fa = { role: "father", name: "", given: "", surname: "", presumed: false };
    if (!mo && fromM) mo = { role: "mother", name: "", given: "", surname: "", presumed: false };
    var self = people[0];
    if (fa) { fa.place = fromP || null; if (!fa.surname && self && self.surname && (!self.rel || /father|mother|grand|uncle|aunt|brother|sister|ancestor|relative/.test(self.rel))) { fa.surname = self.surname; fa.presumed = true; fa.name = (fa.given ? fa.given + " " : "") + fa.surname; } people.push(fa); }
    if (mo) { mo.place = fromM || null; people.push(mo); }
    if (spouse && !people.length) people.push({ role: "self", rel: out.rel, name: "", given: "", surname: "", place: route[0] || null, unnamed: true, occupation: out.occupation });
    if (spouse && people.length) people.push({ role: "spouse", name: spouse.given + (spouse.surname ? " " + spouse.surname : ""), given: spouse.given, surname: spouse.surname, place: spStops[0] || null });
    else if (spStops.length && people.length) people.push({ role: "spouse", name: "", given: "", surname: "", place: spStops[0], unnamed: true });
    out.people = people;
    if (fam) applyFamily(out, fam, ctx); else if (me) applyMe(out, me, ctx, teller); else if (sought) applyMe(out, sought, ctx, "");
    if (spStops.length && !fam && !me && !sought) out.kin = (out.kin || []).concat([{ key: "S", name: spouse ? spouse.given : "", label: "your " + (/\b(?:my|our)\s+(?:(?:late|ex|first|second|third)[- ])?(wife|husband|partner)\b/i.exec(t) || [0, "partner"])[1].toLowerCase(), stops: spStops.map(function (x) { return { row: x.row, alts: x.alts, word: x.word, role: x.role, year: x.year, approx: false }; }) }]);
    out.suggest = suggest.concat(didYouMean(typed, ctx));
    out.life = readLife(t, ctx, out);
    /* married three times and only one wife named: the others are on the tree, unnamed and said to be told; "5 children, 12 grandchildren" is a line on the card */
    if (!fam && !me && !sought) {
      var lf = out.life, pl = out.people || (out.people = []), cnt = lf.counts && Object.keys(lf.counts).length;
      if ((lf.married > 1 || cnt) && !pl.some(function (x) { return x.role === "self"; })) pl.unshift({ role: "self", rel: out.rel, name: "", given: "", surname: "", place: null, unnamed: true, occupation: out.occupation });
      var me0 = pl.filter(function (x) { return x.role === "self"; })[0];
      if (me0 && cnt) me0.counts = lf.counts;
      if (lf.married > 1) {
        var word = /\b(?:wife|wives)\b/i.test(t) ? "wife" : /\bhusbands?\b/i.test(t) ? "husband" : "spouse", have = pl.filter(function (x) { return x.role === "spouse"; }).length, ORD = ["", "first", "second", "third", "fourth", "fifth"];
        for (var mk = have + 1; mk <= lf.married; mk++) pl.push({ role: "spouse", name: "", given: "", surname: "", place: null, unnamed: true, told: true, label: (have ? "another " : (ORD[mk] || mk + "th") + " ") + word + " (not named)" });
      }
    }
    /* EVERYONE NAMED BY WHAT THEY ARE TO SOMEONE: "his father Mate, born in 1872", "her mother Kari", "my brother Jirjis", "Ana's prayer book" is not one.
       Told by the words of the story ("her father"), never worked out into a tree: the person the pronoun means can be anyone. The one exception is a
       story with no "my" at all (a life told in the third person), where the first "his/her father" and "mother" are the person's own parents. */
    out.others = apposed(t, ctx);
    if (side.list.length) {
      /* the story's own person is the parent the step-relative was told through («my dad's stepfather»), when the family reading is about that parent */
      var vp = side.list.map(function (o) { return /(?:dad|father)['\u2019]s$/.test(o.poss) ? "father" : /(?:mum|mom|mother)['\u2019]s$/.test(o.poss) ? "mother" : ""; }).filter(Boolean)[0];
      var sf = (out.people || []).filter(function (x) { return x.role === "self"; })[0];
      if (vp && fam && fam.subject === (vp === "father" ? "F" : "M")) { out.rel = vp; if (sf) sf.rel = vp; }
      applySide(out, side.list, ctx);
    }
    /* the children the story lists: "also named in the story", as somebody's child */
    (out.kidsListed || []).forEach(function (k) { if (!out.others.some(function (o) { return S.fold(o.name) === S.fold(k.name); }) && !(out.people || []).some(function (pe) { return S.fold(pe.name || "").split(" ")[0] === S.fold(k.name); })) out.others.push({ poss: k.poss, kin: k.kin, name: k.name, born: null, died: null }); });
    for (var un = 0; un < (out.kidsUnnamed || 0) && un < 12; un++) out.others.push({ poss: out.kidsListed[0] && out.kidsListed[0].poss || "", kin: "child", name: "", born: null, died: null });
    /* «twins Anna Novak and Maria Novak»: the second twin is named too */
    var tw = /\btwins?,?\s+(\p{Lu}[\p{Ll}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)\s+(?:and|&)\s+(\p{Lu}[\p{Ll}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)/u.exec(t);
    if (tw) [tw[1], tw[2]].forEach(function (nm) { var f = S.fold(nm.split(" ")[0]); if (!STOP[f] && !MONTHS[f] && !out.others.some(function (o) { return S.fold(o.name.split(" ")[0]) === f; }) && !(out.people || []).some(function (pe) { return S.fold(String(pe.name || "").split(" ")[0]) === f; })) out.others.push({ poss: "", kin: "twin", name: nm, born: null, died: null }); });
    if (!firstPerson && out.others.length) {
      var selfP = (out.people || []).filter(function (x) { return x.role === "self"; })[0];
      if (selfP) ["father", "mother"].forEach(function (k) {
        var o = out.others.filter(function (x) { return x.kin === k && /^(?:his|her|their)$/.test(x.poss); })[0];
        if (!o || (out.people || []).some(function (x) { return x.role === k; })) return;
        var evs = []; if (o.born != null) evs.push({ type: "born", year: o.born, place: null }); if (o.died != null) evs.push({ type: "died", year: o.died, place: null });
        out.people.push({ role: k, name: o.name, given: o.name.split(" ")[0], surname: o.name.split(" ").slice(1).join(" "), place: null, events: evs, presumed: false });
        o.inTree = true;
      });
    }
    /* EVERY PLACE THE STORY NAMES. A long story names places in sentences the reading of who-went-where does not follow ("the family went down to
       Christiania and sailed to New York, then west by rail to Duluth"). None of them is thrown away: what no person's route took is kept as "also named
       in the story", for the map and the records, attributed to nobody. A place in a "whose grandfather came from X" clause is somebody else's, so it is left out. */
    (function () {
      var usedW = Object.create(null), usedI = Object.create(null), extra = [];
      function use(st) { if (!st) return; if (st.word) usedW[st.word] = 1; if (typeof st.country === "string") usedW[st.country] = 1; if (st.row && st.row.i != null) usedI[st.row.i] = 1; }
      (out.stops || []).forEach(use); (out.route || []).forEach(use); (out.people || []).forEach(function (pe) { use(pe.place); });
      (out.kin || []).forEach(function (k) { (k.stops || []).forEach(use); });
      var nameSet = Object.create(null);   /* a word that is part of someone's name, or the story's own surname, is not a place named in passing */
      [out.name, out.surname, out.given, out.givenWord, teller].concat((out.people || []).map(function (pe) { return pe.name; }), (out.kin || []).map(function (k) { return k.name; })).forEach(function (n) { String(n || "").split(/\s+/).forEach(function (w) { if (w) nameSet[S.fold(w)] = 1; }); });
      Object.keys(nameW || {}).forEach(function (w) { nameSet[w] = 1; });
      rolesFor.forEach(function (x) {
        if (nameSet[x.c.word] || Object.keys(usedW).some(function (k) { return k !== x.c.word && (" " + k + " ").indexOf(" " + x.c.word + " ") > -1; })) return;   /* the short name of a place already told ("Rukavac" in "Gornji Rukavac") */
        var c = x.c, r0 = c.rows && c.rows[0]; if (!r0 || usedW[c.word] || usedI[r0.i]) return;
        var win = tokens.slice(Math.max(0, c.at - 9), c.at).join(" ");
        if (/(?:^| )(?:whose|whos|who s)(?: |$)/.test(win)) return;
        usedI[r0.i] = 1;
        extra.push({ row: r0, alts: c.rows.slice(1, 6), word: c.word, role: "mention", year: null, approx: false });
      });
      if (extra.length) (out.kin || (out.kin = [])).push({ key: "X", name: "", label: "also named in the story", stops: extra });
    })();
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
  /* "my mother Cheryl who's grandfather was from Argentina": the words after "who's grandfather" are about HER grandfather, not about her.
     Returns the text about the person themselves, and what is told of the relative (with the word that names them), if any. */
  var OF_RELATIVE = /\b(?:who(?:['\u2019]?s|se)|whose)\s+((?:(?:great|step)[- ]?)*(?:grand)?(?:father|mother|dad|mum|mom|parents?|ancestors?|family|people))\b/i;
  function cutRelative(rest) {
    var m = OF_RELATIVE.exec(String(rest || ""));
    if (!m) return { own: rest, rel: null, word: "" };
    return { own: rest.slice(0, m.index), rel: rest.slice(m.index + m[0].length), word: m[1].toLowerCase() };
  }
  var KIN_STEP = { father: "F", dad: "F", mother: "M", mum: "M", mom: "M" };
  var KIN_NOUN = { F: "father", M: "mother" };
  var INTRO = /(?:\b(my|his|her|their)\s+)?\b((?:(?:father|dad|mother|mum|mom)(?:'?s)?\s+)*(?:father|dad|mother|mum|mom))(?:'?s)?\s+(?:name\s+)?(?:was|is|named|called)\s+(?:(?:named|called)\s+)?([\p{L}'’-]+)/giu;
  var EV_BORN = /^(born|birth)$/, EV_DIED = /^(died|dies|passed|deceased|buried|murdered|killed)$/, EV_WED = /^(married|wed|wedded|weds)$/;
  var EV_MOVE = /^(moved|move|went|followed|emigrated|migrated|relocated|settled|came|arrived|lived|living|returned|then|travelled|traveled|sailed|left)$/;
  var EV_CAUSE = /^(frmo|fro|from|due|after|of|with|because)$/;

  function stepsOf(words) {
    return words.split(/\s+/).map(function (w) { w = w.toLowerCase(); if (!KIN_STEP[w]) w = w.replace(/'?s$/, ""); return KIN_STEP[w] || ""; }).join("");
  }
  function chainLabel(rel) { return rel.split("").map(function (c) { return KIN_NOUN[c]; }).join("'s "); }

  var LINE_OF = /\b(?:long\s+line\s+of|line\s+of\s+\p{L}+|originally\s+(?:came|cam|from)|family\s+(?:line|were|was)\s+from)\b/iu;
  /* What one person's stretch of the story says of them. Returns {origin, born:{year,place}, died:{year,place,cause}, married:{year,place,spouse}, moves:[{place,year}]}. */
  function readEvents(text, ctx) {
    var out = { origin: null, born: null, died: null, married: null, moves: [] };
    var ft = S.fold(text).split(" ").filter(Boolean); if (!ft.length) return out;
    var gv = ctx.given ? S.givenIn(text, ctx.given, ctx.skip) : [], gset = Object.create(null); gv.forEach(function (g) { gset[g.word] = 1; });
    var cands = withCountryHints(S.candidates(text, ctx.map, ctx.skip), ft, ctx), atMap = Object.create(null), ci = capInfo(text, ft);
    if (ctx.__rank) cands.forEach(function (c) { var rk = ctx.__rank[c.word]; if (rk && rk.length === c.rows.length && c.rows.every(function (r) { return rk.indexOf(r) > -1; })) c.rows = rk.slice(); });
    cands = withCountries(cands, ft, ctx, gset);   /* "born in Israel": a country is a place a person was born in */
    cands.forEach(function (c) {
      var p1 = ft[c.at - 1] || "", role = PLACE_BEFORE[p1] || "";
      if (notPlace(c, ft, ci, ctx)) return;
      if (/^(?:married|wed|wedded|marry)$/.test(p1) || (p1 === "to" && /^(?:married|wed|wedded|engaged)$/.test(ft[c.at - 2] || ""))) return;   /* "married to Hedviga": a person */
      if (KINW.test(p1) && c.word.indexOf(" ") < 0 && ci.capAt[c.at] && ci.capAt[c.at].cap) return;                                              /* "his mother Nora": a person */
      var one = c.word.indexOf(" ") < 0;
      if ((gset[c.word] && !role) || (one && (STOP[c.word] || COMMON[c.word] || REL.test(c.word) || EV_BORN.test(c.word) || EV_DIED.test(c.word) || EV_WED.test(c.word) || EV_MOVE.test(c.word) || EV_CAUSE.test(c.word)))) return;
      atMap[c.at] = c;
    });
    /* "Senj Croatia", "Cork, Ireland": a country written right after a place says which place was meant; it is not a second place */
    var ats = Object.keys(atMap).map(Number).sort(function (a, b) { return a - b; });
    ats.forEach(function (at, j) {
      var c = atMap[at], pv = j ? atMap[ats[j - 1]] : null;
      if (!c || !c.country || !pv || pv.country) return;
      var pl = pv.word.split(" ").length;
      if (ats[j - 1] + pl !== at && !(ats[j - 1] + pl + 1 === at && /^(?:in|of)$/.test(ft[at - 1] || ""))) return;
      var cc = c.rows[0] && c.rows[0].cc, hit = pv.rows.filter(function (r) { return r.cc === cc; });
      if (!hit.length) return;
      pv.rows = hit.concat(pv.rows.filter(function (r) { return r.cc !== cc; }));
      delete atMap[at];
    });
    var mode = "origin", pending = null, preYear = null, pendAge = null;
    function place(c) { return { row: c.rows[0], alts: c.rows.slice(1, 6), word: c.word }; }
    for (var i = 0; i < ft.length; i++) {
      var tk = ft[i], c = atMap[i];
      if (!c && (tk === "hometown" || (tk === "home" && ft[i + 1] === "town") || (tk === "birthplace"))) { mode = "origin"; continue; }
      if (EV_BORN.test(tk)) { mode = "born"; out.born = out.born || { year: null, place: null }; continue; }
      if (EV_DIED.test(tk)) { mode = "died"; out.died = out.died || { year: null, place: null, cause: "" }; continue; }
      if (EV_WED.test(tk)) { mode = "married"; out.married = out.married || { year: null, place: null, spouse: "" }; continue; }
      if (EV_MOVE.test(tk) && !c) { if (mode !== "move") { mode = "move"; pending = preYear; preYear = null; } continue; }   /* "by 1955 they were living in Salisbury": the year came before the verb */
      if (mode === "died" && EV_CAUSE.test(tk) && (out.died.place || out.died.year != null)) { out.died.cause = ft.slice(i + 1).join(" "); break; }
      if (/^(1[4-9][0-9]{2}|20[0-2][0-9])$/.test(tk)) {
        var y = Number(tk);
        if (mode === "born") out.born.year = y; else if (mode === "died") out.died.year = y; else if (mode === "married") out.married.year = y;
        else if (mode === "move") { if (out.moves.length && out.moves[out.moves.length - 1].year == null) out.moves[out.moves.length - 1].year = y; else pending = y; }
        else preYear = y;
        continue;
      }
      /* "by the time he was 18 he moved to Johannesburg", "at 14 she left": an age before a move belongs to that move */
      if (/^\d{1,2}$/.test(tk) && /^(?:was|were|aged?|at|turned)$/.test(ft[i - 1] || "") && mode !== "born" && mode !== "died") { pendAge = Number(tk); continue; }
      if (!c) continue;
      var pl = place(c); i += c.word.split(" ").length - 1;
      if (mode === "born") { if (!out.born.place) out.born.place = pl; }
      else if (mode === "died") { if (!out.died.place) out.died.place = pl; }
      else if (mode === "married") { if (!out.married.place) out.married.place = pl; }
      else if (mode === "move") { out.moves.push({ place: pl, year: pending, age: pendAge }); pending = null; pendAge = null; }
      else if (!out.origin) out.origin = pl;
    }
    if (out.married) {
      var sm = /\bmarried\s+(?:to\s+)?(?:my\s+)?(?:(?:other|mother|mum|mom|wife)\s+)?([\p{L}'’-]{2,})(?:\s+([\p{Lu}][\p{L}'’-]+))?/iu.exec(text);
      if (sm && !/^(in|on|at|a|the|her|his|him|their|and)$/i.test(sm[1])) { var ssa = surnameAfter(text.slice(text.indexOf(sm[1], sm.index) + sm[1].length)); out.married.spouse = cased(sm[1]) + (ssa ? " " + ssa.sur : ""); }
    }
    return out;
  }

  /* BROTHERS AND SISTERS, as told: "he had a brother and sister, Robert and Ada", "his brother Robert and sister Ada", "two brothers, Tom and Ned". Their names are
     the siblings' own: they are taken out of the text before the story's person is named (a story about a man whose brother is Robert was naming the man Robert), and
     kept as { rel, name }. "your" for the teller's own ("my brother Tom"), "his" or "her" for the person the story is about. Written in capitals or not. */
  var SIB_NAME = "\\p{Lu}[\\p{L}'\u2019-]+", SIB_NOUN = "(?:(?:[Hh]alf|[Ss]tep)[- ]?)?(?:[Bb]rothers?|[Ss]isters?|[Ss]iblings?|BROTHERS?|SISTERS?|SIBLINGS?)", SIB_AND = "(?:,|[Aa]nd|AND|&)";
  var SIB_RE = new RegExp("((?:(?:[Aa]n?|[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|A|AN|ONE|TWO|THREE|FOUR|FIVE|\\d+)\\s+)?" + SIB_NOUN + "(?:\\s*" + SIB_AND + "\\s*(?:(?:[Aa]n?|[Oo]ne|A|AN|ONE)\\s+)?" + SIB_NOUN + ")*)\\s*(?:,|:|\\s(?:[Nn]amed|[Cc]alled|[Ww]ere|[Aa]re|[Ww]as|[Ii]s|NAMED|CALLED|WERE|ARE|WAS|IS))?\\s*(" + SIB_NAME + "(?:\\s*" + SIB_AND + "\\s*(?:" + SIB_AND + "\\s*)?" + SIB_NAME + ")*)", "gu");
  function readSiblings(text, ctx) {
    var out = [], rest = String(text || ""), seen = Object.create(null);
    function ok(w) { var f = S.fold(w); return w.length > 1 && !STOP[f] && !COMMON[f] && !MONTHS[f] && !REL.test(w) && !KINW.test(f) && !OCC[f] && !(ctx && ctx.map && ctx.map[f] && !(ctx.given && ctx.given[f])); }
    rest = rest.replace(SIB_RE, function (m, nouns, names, at) {
      var ns = (nouns.match(/(?:(?:half|step)[- ]?)?(?:brothers?|sisters?|siblings?)/gi) || []).map(function (x) { return x.toLowerCase().replace(/s$/, "").replace(/^(half|step)[- ]?/, "$1-"); });
      var nm = names.split(new RegExp("\\s*" + SIB_AND + "\\s*(?:" + SIB_AND + "\\s*)?", "u")).map(function (x) { return x.trim(); }).filter(function (x) { return x && ok(x); });
      if (!nm.length) return m;
      var mine = /\b(?:my|our|MY|OUR|[Ii] (?:have|had)|[Ww]e (?:have|had)|I (?:HAVE|HAD))\s*$/.test(rest.slice(Math.max(0, at - 14), at));
      nm.forEach(function (n, i) { var rel = ns.length === nm.length ? ns[i] : ns.length === 1 ? ns[0] : "sibling", k = rel + "|" + S.fold(n); if (seen[k]) return; seen[k] = 1; out.push({ rel: rel, name: cased(n), mine: mine }); });
      return m.slice(0, m.length - names.length) + " ";
    });
    return { list: out, rest: rest };
  }
  /* STEP-, GOD- AND IN-LAW RELATIVES ARE THEIR OWN PEOPLE. «My dad's stepfather Franz Huber came from Graz» is not about the dad: what is told of Franz stays with
     Franz, and he is never drawn as the parent. A sentence that opens with such a relative (and the «he / she» sentences that follow it) is taken out of the story of
     whoever it is about, when the story is about somebody else too; one named in passing only loses the name. A story ONLY about them is left as it is. */
  var SIDE_KIN = "(?:step[- ]?(?:grand)?(?:father|mother|dad|mum|mom|parents?)|(?:father|mother|brother|sister|son|daughter|parents)[- ]in[- ]law|god[- ]?(?:father|mother|parents?|son|daughter)|(?:half|step)[- ]?(?:brother|sister|son|daughter))";
  var SIDE_RE = new RegExp("\\b((?:[Mm]y\\s+|[Oo]ur\\s+)?(?:(?:[Mm]um|[Mm]om|[Mm]am|[Mm]other|[Dd]ad|[Ff]ather|(?:[Gg]reat[- ])*[Gg]rand(?:father|mother|pa|ma|ad)|[Nn]ana?|[Nn]onn[ao])['\u2019]s\\s+)|(?:[Mm]y|[Oo]ur|[Hh]is|[Hh]er|[Tt]heir)\\s+)((?:(?:late|first|second)\\s+)?" + SIDE_KIN + ")(?![\\p{L}-])(?:\\s*,)?(?:\\s+(?:(?:was|is|named|called)\\s+)?(\\p{Lu}[\\p{L}'\u2019-]+(?:\\s+(?:(?:de|del|della|di|da|van|von|der|den|la|le)\\s+)*\\p{Lu}[\\p{L}'\u2019-]+)?))?(?:\\s*,)?", "u");
  var OWN_SIB = /^\s*(?:(?:and|but|so)\s+)?(His|Her|Their|My|Our|his|her|their|my|our)\s+((?:(?:older|elder|younger|little|big|eldest|youngest|twin|late)\s+)?(?:brother|sister|Brother|Sister))\b(?:\s*,)?(\s+(?:(?:Father|Fr\.?|Sister|Brother)\s+)?["'\u2018\u201c]?\p{Lu}[\p{L}'\u2019-]+["'\u2019\u201d]?(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)?(?:\s*,)?/u;
  var OWN_GRAND = /^\s*(?:(?:and|but|so)\s+)?(My|Our|my|our)\s+(grandmother|grandfather|grandma|grandpa|gran|nan|nana)\b(?:\s*,)?(\s+(?!(?:was|is)\b)\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)?(?:\s*,)?/u;
  function sideRelatives(t) {
    var sents = String(t || "").match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) || [], list = [], keep = [], other = false;
    var parsed = sents.map(function (x) {
      var m = SIDE_RE.exec(x);
      if (m && /^(?:(?:late|first|second)\s+)?(?:half|step)[- ]?(?:brother|sister|son|daughter)$/i.test(m[2]) && !/['\u2019]s\s*$/.test(m[1])) m = null;   /* «my half-brother Tom»: a brother, told with the others */
      var lead = m && /^\W*(?:(?:and|but|so|also|then)\s+)?$/i.test(x.slice(0, m.index));
      if (!m || !lead) { if (/\b(?:my|our|i|mum|mom|dad|mother|father|grand\w+|nan\w*|nonn[ao])\b/i.test(m ? x.replace(m[0], " ") : x) && !/^\W*(?:he|she|they)\b/i.test(x)) other = true; }
      return { s: x, m: m, lead: !!lead };
    });
    if (!other && parsed.length < 2) return { list: [], rest: t };
    var cur = null;
    parsed.forEach(function (q) {
      var m = q.m, nm = m && m[3] ? m[3] : "", word = m ? S.fold(nm.split(/\s+/)[0]) : "";
      if (nm && (STOP[word] || COMMON[word] || MONTHS[word] || DEMONYM[word] || EV_BORN.test(word) || EV_MOVE.test(word) || EV_DIED.test(word))) { nm = ""; }
      if (m && other) {
        var poss = m[1].trim().toLowerCase().replace(/^(?:my|our)(?=\s|$)/, "your"); if (/^(?:mum|mom|mam|mother|dad|father)['\u2019]s$/.test(poss)) poss = "your " + poss;
        var o = { poss: poss, kin: m[2].toLowerCase().replace(/^(?:late|first|second)\s+/, ""), name: nm ? nm.split(/\s+/).map(cased).join(" ") : "", text: "" };
        list.push(o);
        var cut = m[0].slice(0, m[0].length - (m[3] && !nm ? m[3].length : 0));
        if (q.lead) { o.text = q.s.slice(m.index + cut.length); cur = o; return; }
        cur = null; keep.push(q.s.slice(0, m.index) + " " + q.s.slice(m.index + cut.length)); return;
      }
      if (cur) { var male = /(?:father|dad|brother|son)(?:[- ]in[- ]law)?$/.test(cur.kin), pr = /^\W*(he|she)\b/i.exec(q.s); if (pr && /^he$/i.test(pr[1]) === male) { cur.text += " " + q.s; return; } }
      cur = null; keep.push(q.s);
    });
    /* «His brother Mario moved to Rome»: Rome is Mario's. The brother or sister stays named in the story; what is said of them goes to them. In a story told of an
       aunt, uncle or cousin, a grandparent's sentence is the grandparent's the same way. */
    var first = parsed[0] && parsed[0].s || "", aunty = /\b(?:my|our)\s+(?:great[- ])*(?:aunt|uncle|cousin|aunty|auntie)\b/i.test(first);
    keep = keep.map(function (k, i) {
      if (!i || first === k) return k;
      var m = OWN_SIB.exec(k) || (aunty ? OWN_GRAND.exec(k) : null); if (!m) return k;
      var rest = k.slice(m[0].length); if (!/^\s*,?\s*(?:(?:also|then|later|who|never|always)\s+)*(?:was|went|moved|came|lived|left|emigrated|migrated|died|married|became|stayed|sailed|settled|worked|served|joined|returned|remained)\b/i.test(rest)) return k;
      var nm = (m[3] || "").trim().replace(/^(?:Father|Fr\.?|Sister|Brother)\s+/, "").replace(/["'\u2018\u2019\u201c\u201d]/g, "");
      var bn = /^\s*(?:was\s+)?born\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)/u.exec(rest); if (!nm && bn && !MONTHS[S.fold(bn[1])]) { nm = bn[1]; rest = rest.replace(bn[1], ""); }
      var kin = m[2].toLowerCase(); list.push({ poss: m[1].toLowerCase().replace(/^(?:my|our)$/, "your"), kin: kin, name: nm, text: rest, own: true });
      return /brother|sister/i.test(kin) ? m[1] + " " + m[2] + (nm ? " " + nm : "") + ". " : "";
    });
    if (!list.length) return { list: [], rest: t };
    /* the parent the step-relative was told through is still in the story: said plainly, with nothing told of them */
    var stub = ""; list.forEach(function (o) { var w = /^your (dad|father|mum|mom|mam|mother|(?:great[- ])*grand(?:father|mother|pa|ma|ad)|nana?|nonn[ao])['\u2019]s$/.exec(o.poss); if (w && !stub) stub = "My " + w[1] + ". "; });
    return { list: list, rest: stub + keep.join("") };
  }
  function applySide(out, side, ctx) {
    if (!side.length) return;
    var self = (out.people || []).filter(function (x) { return x.role === "self"; })[0];
    side.forEach(function (o, i) {
      var key = "X" + (i + 1), e = readEvents(o.text, ctx), st = [];
      function push(pl, role, yr) { if (pl && !st.some(function (x) { return x.row.i === pl.row.i; })) st.push({ row: pl.row, alts: pl.alts, word: pl.word, role: role, year: yr == null ? null : yr, approx: false }); }
      if (e.born && e.born.place) push(e.born.place, "born", e.born.year);
      /* «From» only where the words say from: «was a priest in Senj» is a place of their life, not where they came from */
      if (e.origin) push(e.origin, new RegExp("\\bfrom\\s+(?:\\p{L}+\\s+){0,2}?" + e.origin.word.split(" ")[0], "iu").test(S.fold(o.text)) ? "origin" : "move"); e.moves.forEach(function (mv) { var from = !st.length && mv.place.word && new RegExp("\\bfrom\\s+(?:\\p{L}+\\s+){0,2}?" + mv.place.word.split(" ")[0], "iu").test(S.fold(o.text)); push(mv.place, from ? "origin" : "move", mv.year); }); if (e.died && e.died.place) push(e.died.place, "move", e.died.year);
      var label = o.poss + " " + o.kin, evs = [];
      ["born", "married", "died"].forEach(function (k) { var v = e[k]; if (v && v.year != null) evs.push({ type: k, year: v.year, place: null }); });
      if (st.length) (out.kin || (out.kin = [])).push({ key: key, name: o.name, label: label, stops: st });
      /* a step-parent of the person the tree is about stands in their parents' row, beside the parent, never as the parent */
      var of = /(?:dad|father)['\u2019]s$/.test(o.poss) ? "father" : /(?:mum|mom|mam|mother)['\u2019]s$/.test(o.poss) ? "mother" : "";
      if (o.own) {
        /* the brother already in the row takes the whole name the story gave («Her brother, Father Josip Horvat, …»), so he is one box, not two */
        if (o.name) (out.siblings || []).forEach(function (x) { if (x.rel === o.kin && x.name && o.name.indexOf(x.name + " ") === 0) x.name = o.name; });
        var g = /^(?:grand(?:mother|ma)|gran|nan|nana)$/.test(o.kin) ? "grandmother" : /^grand/.test(o.kin) ? "grandfather" : "";
        if (g) {
          (out.people || (out.people = [])).push({ role: g, rel: "", name: o.name, given: o.name.split(" ")[0], surname: o.name.split(" ").slice(1).join(" "), place: st[0] || null, events: evs, label: "your " + g, key: key });
          var wed = /\bmarried\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)/u.exec(o.text);
          if (wed) (out.others || (out.others = [])).push({ poss: "your " + g + "'s", kin: g === "grandmother" ? "husband" : "wife", name: wed[1], born: null, died: null });
        }
        return;
      }
      var tree = !!self && /^step[- ]?(?:father|mother|dad|mum|mom)$/.test(o.kin) && (of ? self.rel === of : (o.poss !== "your" || !!self.me));
      if (tree) out.people.push({ role: "inlaw", rel: "", name: o.name, given: o.name.split(" ")[0], surname: o.name.split(" ").slice(1).join(" "), place: st[0] || null, events: evs, label: label, key: key });
      if (o.name && !(out.others || (out.others = [])).some(function (x) { return S.fold(x.name) === S.fold(o.name); })) out.others.push({ poss: o.poss, kin: o.kin, name: o.name, born: e.born ? e.born.year : null, died: e.died ? e.died.year : null, inTree: tree });
    });
  }
  /* «He had a brother who stayed behind and three sisters»: how many, when no names are given */
  var SIB_HAVE = /\b(he|she|they|i|we|who)\s+(?:also\s+)?(?:had|has|have)\s+((?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:(?:older|elder|younger|little|big|half|step)[ -])?(?:brother|sister)s?\b[^.;!?]*)/gi;
  function unnamedSiblings(text) {
    var out = [], re = new RegExp(SIB_HAVE.source, "gi"), m;
    while ((m = re.exec(String(text || "")))) {
      var part = m[2], mine = /^(?:i|we)$/i.test(m[1]), p, pr = /(?:^|\band\s+|,\s*)(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:(?:older|elder|younger|little|big|half|step)[ -])?(brother|sister)s?\b(?!\s*,?\s*(?:named|called|:)?\s*\p{Lu})/gu;
      while ((p = pr.exec(part))) { var n = /^(a|an)$/i.test(p[1]) ? 1 : KID_NUMV[p[1].toLowerCase()] || +p[1] || 0; if (n) out.push({ rel: p[2].toLowerCase(), n: n, mine: mine }); }
    }
    return out;
  }
  /* CHILDREN, AS LISTED: "they had four children: Giovanni, Luisa, Paolo and my mother Anna", "Their kids were Tom, Peg and Mary", "my mum was one of four children:
     Tom, Peg, Mary and Paddy". Each name is a child of the couple the story is telling of; they are taken out of the text before the story's person is named (it was
     naming the person Mary, or "Mary Peg"), and kept as { kin, poss, name }. "my mother Anna" in the list is the teller's own parent (read elsewhere), so she is
     counted but not listed again. The count the story gives ("four") is kept, so that what the list does not name can be said to be unnamed. */
  var KID_NUM = "(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  var KID_RES = [
    { re: new RegExp("\\b(?:had|have|has|with|raised)\\s+(?:(" + KID_NUM + ")\\s+)?(children|kids|sons|daughters|boys|girls|twins)\\s*[:,]\\s*", "giu"), poss: "their" },
    { re: new RegExp("\\b(their|his|her|our|my)\\s+(?:(" + KID_NUM + ")\\s+)?(children|kids|sons|daughters)\\s*(?:were|are|named|called|:|,)\\s*", "giu"), poss: "" },
    { re: new RegExp("\\b(their|his|her|our)\\s+(?:(" + KID_NUM + ")\\s+)?(children|kids|sons|daughters)\\s+(?=\\p{Lu}[\\p{L}'\u2019-]+\\s*(?:,|and\\b|&))", "giu"), poss: "" },
    { re: new RegExp("\\bone of\\s+(?:the\\s+)?(" + KID_NUM + ")\\s+(children|kids|siblings|sons|daughters)\\s*[:,]\\s*", "giu"), poss: "" }
  ];
  var KID_NUMV = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  function listedKids(text, ctx) {
    var out = [], rest = String(text || ""), count = 0, told = 0, oneOf = false, seen = Object.create(null);
    function ok(w) { var f = S.fold(w); return w.length > 1 && /^\p{Lu}/u.test(w) && !STOP[f] && !MONTHS[f] && !REL.test(w) && !KINW.test(f) && !ADVERBISH.test(f) && !(ctx && ctx.map && ctx.map[f] && ctx.map[f].length && !(ctx.given && ctx.given[f])); }
    KID_RES.forEach(function (R, ri) {
      var re = new RegExp(R.re.source, R.re.flags), m, cuts = [];
      while ((m = re.exec(rest))) {
        var start = m.index + m[0].length, tail = rest.slice(start), end = tail.search(/[.;!?\n]/); if (end < 0) end = tail.length; tail = tail.slice(0, end);
        var items = tail.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i), used = 0, listed = 0, got = [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i].trim(); if (!it) { used += 0; continue; }
          var pm = /^(?:my|our)\s+(?:mother|mum|mom|father|dad|aunt|uncle)\s+(?:was\s+)?(\p{Lu}[\p{L}'’-]+)(?:\s+\p{Lu}[\p{L}'’-]+)?$/u.exec(it);
          var nm = pm ? null : /^(\p{Lu}[\p{L}'’-]+)(?:\s+(?:(?:de|del|della|di|da|van|von|der|den|la|le)\s+)*\p{Lu}[\p{L}'’-]+)?(?=$|\s+(?:were|are|was|all|born|who)\b)/u.exec(it);
          if (!pm && !(nm && ok(nm[1]))) break;
          listed++; if (nm) got.push(nm[1]);
          if (nm && nm[0].length < it.length) break;
        }
        if (!listed) continue;
        told = told || listed; if (ri === 3) oneOf = true;
        /* the span the list took, up to the end of its last name, is removed */
        var cutEnd = start, pos = 0; for (var k2 = 0; k2 < listed; k2++) { var ix = tail.indexOf(items.filter(Boolean)[k2], pos); if (ix < 0) break; pos = ix + items.filter(Boolean)[k2].length; cutEnd = start + pos; }
        var n = KID_NUMV[String(m[1] || m[2] || "").toLowerCase()] || (/^\d+$/.test(m[1] || "") ? +m[1] : 0); if (!n && m[2] && /^\d+$/.test(m[2])) n = +m[2];
        if (ri === 1 || ri === 2) { n = KID_NUMV[String(m[2] || "").toLowerCase()] || (/^\d+$/.test(m[2] || "") ? +m[2] : 0); }
        count = count || n;
        got.forEach(function (g) { var k = S.fold(g); if (seen[k]) return; seen[k] = 1; out.push({ kin: /^(?:sons|boys)$/i.test(m[ri === 1 || ri === 2 ? 3 : 2] || "") ? "son" : /^(?:daughters|girls)$/i.test(m[ri === 1 || ri === 2 ? 3 : 2] || "") ? "daughter" : "child", poss: R.poss || ((ri === 1 || ri === 2) && m[1] ? m[1].toLowerCase() : "") , name: cased(g) }); });
        cuts.push([m.index + m[0].length - m[0].replace(/^[^]*?(?=\b(?:children|kids|sons|daughters|boys|girls|siblings)\b)/i, "").length, cutEnd]);
      }
      cuts.sort(function (x, y) { return y[0] - x[0]; }).forEach(function (c) { rest = rest.slice(0, c[0]) + " " + rest.slice(c[1]); });
    });
    var self = oneOf && told === out.length ? 1 : 0;   /* «one of five children»: the one told of is one of the five (unless the list itself names «my mother») */
    return { list: out, count: count, unnamed: count > told + self && told ? count - told - self : 0, rest: rest };   /* «four children: Tom and Peg»: two are told of and not named */
  }
  function readFamily(t, ctx) {
    var people = Object.create(null), order = [], subject = null, cur = null;
    function person(key, name) {
      var p = people[key];
      if (!p) { p = people[key] = { key: key, name: "", given: "", surname: "", text: "", chunks: [] }; order.push(key); }
      if (name && !p.name) {
        var parts = name.split(/\s+/); p.name = cased(parts[0]); p.given = p.name; if (parts[1]) { p.surname = surnameCase(parts.slice(1).join(" ")); p.name += " " + p.surname; }
      }
      return p;
    }
    var hist = [], myParents = Object.create(null);
    function mention(k) { var i = hist.indexOf(k); if (i > -1) hist.splice(i, 1); hist.push(k); }
    function sexOf(k) { var q = people[k]; if (q && q.sex) return q.sex; return /F$/.test(k) ? "M" : /M$/.test(k) ? "F" : null; }
    /* "THEY" is the couple just told of: the last two people mentioned, when one is a man and one a woman ("his mother ... his father ... They moved to Harare") */
    var THEY = /^\W*(?:(?:and|then|later)\s+)?they\b/i;
    function couple() { var a = hist[hist.length - 1], b = hist[hist.length - 2], sa = a && sexOf(a), sb = b && sexOf(b); return sa && sb && sa !== sb ? [a, b] : null; }
    /* a word that can be a person's given name after "my dad" / "his mother": written with a capital, or a given name the Atlas knows when typed in lower case */
    function nameWord(w) {
      var f = S.fold(w);
      if (!w || STOP[f] || COMMON[f] || OCC[f] || MONTHS[f] || EV_BORN.test(f) || EV_DIED.test(f) || EV_WED.test(f) || EV_MOVE.test(f) || EV_CAUSE.test(f) || KINW.test(f) || REL.test(f) || (ctx.map && ctx.map[f] && !(ctx.given && ctx.given[f]))) return false;
      return /^\p{Lu}/u.test(w) || !!(ctx.given && S.givenIn(w, ctx.given, ctx.skip).length);
    }
    /* WHO "SHE" IS: the last person mentioned who can be a woman; a man's sentence is never given to her */
    function heFor(pro) { var want = /^he$/i.test(pro) ? "M" : "F"; for (var i = hist.length - 1; i >= 0; i--) { var sx = sexOf(hist[i]); if (!sx || sx === want) return hist[i]; } return null; }
    /* "was married to Hedviga": a wife (or husband) of that person, a person of her own. The subject's is S, anyone else's is their key and S. */
    function spouseOf(key, chunk) {
      var sm = /\bmarried\s+(?:to\s+)?(\p{Lu}[\p{L}'’-]{2,})(?:\s+(\p{Lu}[\p{L}'’-]{2,}))?/u.exec(chunk) || /\b(?:[Hh]is|[Hh]er|[Tt]heir)\s+(?:wife|husband|spouse|partner)\s+(?:(?:was|is|named|called)\s+)?(\p{Lu}[\p{L}'’-]{2,})(?:\s+(\p{Lu}[\p{L}'’-]{2,}))?/u.exec(chunk);
      if (!sm || STOP[S.fold(sm[1])] || COMMON[S.fold(sm[1])] || MONTHS[S.fold(sm[1])] || /^(?:In|On|At|My|His|Her|Their|The|And)$/.test(sm[1])) return;
      var sk2 = key === subject ? "S" : key + "S"; if (people[sk2] && people[sk2].name) return;
      var after = surnameAfter(chunk.slice(chunk.indexOf(sm[1], sm.index) + sm[1].length)), sn = after ? " " + after.sur : "";
      var sp = person(sk2, sm[1] + sn), own = sexOf(key); sp.sex = own === "M" ? "F" : own === "F" ? "M" : null; mention(sk2);
    }
    String(t || "").split(/[.!?]+(?:\s+|$)|\n+/).forEach(function (sent) {
      if (!sent.trim()) return;
      var re = new RegExp(INTRO.source, "giu"), ms = [], m;
      while ((m = re.exec(sent))) ms.push({ at: m.index, end: m.index + m[0].length, poss: (m[1] || "").toLowerCase(), steps: stepsOf(m[2]), name: m[3] });
      /* "his mother ... met his father there", "my dad moved to Johannesburg": a parent named without a verb after the word. The first one is only the subject when it is "my dad Ivan". */
      { var bre = /\b(my|his|her|their)\s+((?:(?:father|dad|mother|mum|mom)(?:'?s)?\s+)*(?:father|dad|mother|mum|mom))\b(?!(?:'?s)?\s+(?:name\s+)?(?:was|is|named|called)\b)/giu, bm;
        while ((bm = bre.exec(sent))) {
          var bs = bm.index, be = bm.index + bm[0].length;
          if (ms.some(function (o) { return bs < o.end && be > o.at; })) continue;
          if (/'s\s*$/i.test(sent.slice(0, bs))) continue;
          ms.push({ at: bs, end: be, poss: bm[1].toLowerCase(), steps: stepsOf(bm[2]), name: "", bare: true });
        }
        ms.sort(function (x, y) { return x.at - y.at; }); }
      /* "HIS FATHER IVAN AND MOTHER HEDVIGA": the second parent shares the "his" of the first, so it has no word of its own to be found by. It is
         read as "his mother Hedviga" (and "her father X and mother Y" the same), or Hedviga was lost and her places went to the father. */
      { var sre = /^\s*,?\s*(?:and|&)\s+(mother|mum|mom|father|dad)\s+(?:named\s+|called\s+)?([\p{L}'’-]+)/iu, extra = [];
        ms.slice().forEach(function (o) {
          if (!o.poss || o.poss === "has" || o.bare || !o.steps || o.steps.length !== 1) return;
          var sm = sre.exec(sent.slice(o.end)); if (!sm) return;
          var nf = S.fold(sm[2]);
          if (/^(?:a|an|the|my|his|her|their|not|also|now|and|who|was|is|were|are)$/i.test(sm[2]) || STOP[nf] || COMMON[nf] || OCC[nf] || MONTHS[nf]) return;
          var k0 = o.end + sm[0].toLowerCase().indexOf(sm[1].toLowerCase()), k1 = o.end + sm[0].length;
          if (ms.concat(extra).some(function (q) { return k0 < q.end && k1 > q.at; })) return;
          extra.push({ at: k0, end: k1, poss: o.poss, steps: KIN_STEP[sm[1].toLowerCase()], name: sm[2], grp: true });
        });
        if (extra.length) { ms = ms.concat(extra); ms.sort(function (x, y) { return x.at - y.at; }); } }
      /* "HAS A MOTHER HEDVIGA AND A FATHER IVAN": the parents of the person just named, told as a list instead of "his mother was ... his father was ...".
         The person they belong to is the one named just before "has" (the entry before them), so each is a parent of THAT person. */
      { var hre = /\b(?:has|had|have)\s+(?:a|an)\s+(mother|mum|mom|father|dad)\s+(?:named\s+|called\s+)?([\p{L}'’-]+)/giu, hm, hasAt = -1;
        while ((hm = hre.exec(sent))) {
          if (hasAt < 0) hasAt = hm.index;
          ms.push({ at: hm.index, end: hm.index + hm[0].length, poss: "has", steps: KIN_STEP[hm[1].toLowerCase()], name: hm[2] });
        }
        if (hasAt > -1) {
          var lre = /(?:,|\band)\s+(?:a|an)\s+(mother|mum|mom|father|dad)\s+(?:named\s+|called\s+)?([\p{L}'’-]+)/giu, lm;
          while ((lm = lre.exec(sent))) if (lm.index > hasAt && !ms.some(function (o) { return lm.index < o.end && lm.index + lm[0].length > o.at; }))
            ms.push({ at: lm.index, end: lm.index + lm[0].length, poss: "has", steps: KIN_STEP[lm[1].toLowerCase()], name: lm[2] });
          ms.sort(function (x, y) { return x.at - y.at; });
        } }
      /* "IVAN SENIOR'S FATHER'S NAME WAS ANTON": the father (or mother) of a man already named, told by his name and "senior" rather than by "his father".
         The elder of the people with that first name is the one meant (a namesake son is the younger), and the new person is one step above him. */
      { var sn1 = /([\p{L}'’-]+)\s+(?:senior|snr|sr)\.?(?:'?s)?\s+(father|dad|mother|mum|mom)(?:'?s)?\s+(?:name\s+)?(?:was|is|named|called)\s+([\p{L}'’-]+)/iu.exec(sent);
        if (sn1) {
          var hk = null; order.forEach(function (k) { if (people[k].given && S.fold(people[k].given) === S.fold(sn1[1]) && (!hk || k.length > hk.length)) hk = k; });
          if (hk && nameWord(sn1[3])) { var nk = hk + KIN_STEP[sn1[2].toLowerCase()]; person(nk, sn1[3]); return; }   /* not "mentioned": the couple that "they" means is still the parents */
        } }
      /* "IVAN'S FATHER MATE WAS BORN IN SENJ IN 1920", "Ivan's father was Mate": the father (or mother) of a person already NAMED, told with his name rather than "his father".
         David: «Ivan's father Mate was born in Senj in 1920 ... father still not showing». The person is the one step up from whoever has that first name; what is said of the new
         one after his name is kept for him. A name no one in the story bears is left to the rules below. */
      { var np1 = /(\p{Lu}[\p{L}'\u2019-]+?)(?:'s|\u2019s)\s+(father|dad|mother|mum|mom)\s+(?:name\s+)?(?:(?:was|is|named|called)\s+)?(\p{Lu}[\p{L}'\u2019-]+)/u.exec(sent);
        if (np1) {
          var hk2 = null; order.forEach(function (k) { if (people[k].given && S.fold(people[k].given) === S.fold(np1[1]) && (!hk2 || k.length > hk2.length)) hk2 = k; });
          if (hk2 && nameWord(np1[3]) && KIN_STEP[np1[2].toLowerCase()]) {
            var nk2 = hk2 + KIN_STEP[np1[2].toLowerCase()], pp2 = person(nk2, np1[3]);
            var after = sent.slice(np1.index + np1[0].length).replace(/^\s*,?\s*/, ""); if (after) pp2.chunks.push(" " + after);
            mention(nk2); return;
          }
        } }
      /* "WHEN MY FATHER WAS AROUND 3 THEY MOVED TO BOTSWANA": the move is the couple's (his parents), and the child went with them, so it is told of him too */
      { var wm = /^\W*(?:when|while|once|after)\s+(my|his|her)\s+(father|dad|mother|mum|mom)\s+was\s+(?:(?:only|just|about|around|aged?|nearly|almost)\s+)*\d{1,2}(?:\s+years?(?:\s+old)?)?\s*,?\s+(?=they\b)(.*)$/i.exec(sent);
        if (wm && subject && couple()) {
          var ck = (/^my$/i.test(wm[1]) ? "" : subject) + KIN_STEP[wm[2].toLowerCase()];
          /* "..., and when he was around 18 he moved to Johannesburg": from there it is the child's own move, not his parents' */
          var sp2 = /,?\s+and\s+(?:when|then|later|after|once)\b[^,]*?\b(?:he|she)\b/i.exec(wm[3]), famPart = sp2 ? wm[3].slice(0, sp2.index) : wm[3], ownPart = sp2 ? wm[3].slice(sp2.index) : "";
          couple().forEach(function (k) { people[k].chunks.push(famPart); });
          if (people[ck]) { if (couple().indexOf(ck) < 0) people[ck].chunks.push(famPart); if (ownPart) people[ck].chunks.push(ownPart); mention(ck); cur = ck; }
          return;
        } }
      if (!ms.length) {
        if (!cur) return;
        if (THEY.test(sent) && couple()) { couple().forEach(function (k) { people[k].chunks.push(sent); }); return; }
        var hp = /^\W*(?:(?:also|after|before|then|later|in|by|when|until|once|now)\b[^,.]{0,40},?\s+)?(he|she)\b/i.exec(sent), who = hp ? heFor(hp[1]) : null, to = who || cur;
        /* "His father came from a long line of Defranceschi who were from X and originally came from Y": where the LINE came from. The man did not
           move to X or Y, so it is not put on his route (that gave him Crikvenica, then Carnia). */
        if (LINE_OF.test(sent)) { mention(to); return; }
        people[to].chunks.push(sent); spouseOf(to, sent); mention(to); return;
      }
      /* "BY 1955 HIM AND HIS FATHER IVAN AND MOTHER HEDVIGA WERE LIVING IN SALISBURY, AND BY THE TIME HE WAS 18 HE MOVED TO JOHANNESBURG": the person told
         of so far and the people named after "and" are one party. What they did together is told of each of them, and the clause that starts again with
         "he" is the first of them (the one the page is about) alone, not whoever was named last. */
      var coll = null, gk = [];
      if (cur && ms.length) { var pre0 = sent.slice(0, ms[0].at);
        if (/\b(?:him|me|he|she|her|us|i|them)\s+and\s*$/i.test(pre0)) coll = { head: cur, lead: pre0.replace(/\b(?:him|me|he|she|her|us|i|them)\s+and\s*$/i, "") }; }
      if (coll) gk.push(coll.head);
      if (!coll && cur && ms[0].at > 0) { var pre = sent.slice(0, ms[0].at), cp = THEY.test(pre) ? couple() : null; if (cp) cp.forEach(function (k) { people[k].chunks.push(pre); }); else people[cur].chunks.push(pre); }
      var prevKey = null;
      ms.forEach(function (x, i) {
        /* «My mum was born in 1955», «my dad was from Cork»: the word after "was" is what happened, not a name, so the sentence is still told of that parent */
        if (!x.bare && x.steps && x.poss !== "has" && !x.grp && subject) { var xf = S.fold(x.name); if (xf === "from" || EV_BORN.test(xf) || EV_DIED.test(xf) || EV_MOVE.test(xf) || EV_WED.test(xf)) { x.end -= x.name.length; x.name = ""; x.bare = true; } }
        var unnamed = !!subject && !x.bare && x.steps && /^(?:a|an|the)$/i.test(x.name);   /* "his mother was a singer": a person with no name, and the words after "a" are about her */
        if (x.bare && !x.steps) return;
        if (x.bare && !subject && !(x.poss === "my" && x.steps.length === 1)) return;
        if (!unnamed && !x.bare && (!x.steps || /^(a|the|an|my|his|her|their|not|also|now)$/i.test(x.name) || STOP[S.fold(x.name)] || COMMON[S.fold(x.name)] || OCC[S.fold(x.name)] || MONTHS[S.fold(x.name)] || EV_BORN.test(S.fold(x.name)) || EV_DIED.test(S.fold(x.name)) || EV_WED.test(S.fold(x.name)) || EV_MOVE.test(S.fold(x.name)) || /^(?:murdered|killed|drowned|executed|hanged|shot|lost|ill|sick|dead|buried|married|single|widowed|divorced|alive|old|young|tall|short|poor|rich)$/.test(S.fold(x.name)))) return;   /* "my father was from Cork": from is not his name */
        var base = x.poss === "my" || !subject ? "" : subject, key;
        /* "her father was Nuno" after a man's story: her is the woman last told of, not him */
        if ((x.poss === "her" && sexOf(subject) === "M") || (x.poss === "his" && sexOf(subject) === "F")) { var ow = heFor(x.poss === "his" ? "he" : "she"); if (ow && ow !== subject) base = ow; }
        if (x.poss === "has") { if (!prevKey) return; base = prevKey; }   /* prevKey stays the person the list belongs to: "has a mother X and a father Y" are both HIS */
        key = base + x.steps;
        if (x.poss === "my" && x.steps.length === 1 && (key === "F" || key === "M")) myParents[key] = true;
        if (!subject) { if (x.poss !== "my" || x.steps.length !== 1) return; subject = key; }
        var rest = sent.slice(x.end, i + 1 < ms.length ? ms[i + 1].at : sent.length), nm = unnamed ? "" : x.name;
        if (x.bare) { var nx = /^\s+([\p{L}'’-]{2,})(?=\s|,|$)/u.exec(rest); if (nx && nameWord(nx[1])) { nm = nx[1]; rest = rest.slice(nx[0].length); } }
        var sx = nm ? surnameAfter(rest) : null;
        if (sx) { nm += " " + sx.sur; rest = rest.slice(sx.len); }
        var pk = (subject === "F" && key === "M") || (subject === "M" && key === "F") ? "S" : key;
        var p = person(pk, nm);
        if (x.poss !== "has") prevKey = pk;
        /* "met his father there who was born in X" / "married my mother Cheryl in 1975": a person met, not the one the next words are about, unless "who" says so */
        var objOf = x.bare && cur && cur !== pk && /\b(?:married|marry|wed|met|meet|to|with)\s*$/i.test(sent.slice(0, x.at)) && !/^\s*(?:there\s*)?,?\s*(?:who|that)\b/i.test(rest);
        if (objOf) { rest = cutRelative(rest).own; people[cur].chunks.push(rest); spouseOf(cur, rest); mention(pk); return; }
        rest = cutRelative(rest).own;   /* "my mother Cheryl who's grandfather was from X": X is her grandfather's, not hers */
        if (coll) {
          if (gk.indexOf(pk) < 0) gk.push(pk);
          if (i === ms.length - 1) {
            var fam = rest, own = "", sp3 = /,?\s+and\s+(?:by|when|then|later|after|once)\b[^,]*?\b(?:he|she)\b/i.exec(rest);
            if (sp3) { fam = rest.slice(0, sp3.index); own = rest.slice(sp3.index).replace(/^,?\s+and\s+/i, ""); }
            var party = (coll.lead + " " + fam).trim();
            gk.forEach(function (gkey) { if (people[gkey]) people[gkey].chunks.push(party); });
            if (own) people[coll.head].chunks.push(own);
            gk.forEach(function (gkey) { if (gkey !== coll.head) mention(gkey); }); mention(coll.head); cur = coll.head;
          } else mention(pk);
          return;
        }
        if (!LINE_OF.test(rest)) p.chunks.push(rest);   /* "came from a long line of Defranceschi who were from X": the line's places, not his */
        cur = pk; mention(pk); spouseOf(pk, rest);
      });
    });
    if (!subject || order.length < 2) return null;
    /* "My mother Ana was born in Split. My father died in 1999 in Brisbane.": the teller's OWN two parents, each told with "my", and nobody's parents
       above them. The story is the teller's family, told from the middle, not the mother's with her husband beside her: the first parent told is
       not "the subject" just because they came first, and adding a sentence about the other one must not change who the page is about.
       (Only for a short telling, one or two sentences about each parent: a life told at length, "My father ... went to Cracow ... married ... moved to Danzig", is the parent's own story. When BOTH are named, "My father Marco ... My mother Lucia ...", the first named is the person the page follows: that is the reading the tests fix.) */
    if ((subject === "F" || subject === "M") && myParents.F && myParents.M && people[subject].chunks.length <= 2 && !(people[subject].name && (people.S || people[subject === "F" ? "M" : "F"] || {}).name) && !order.some(function (k) { return k.length > 1 && k !== "S"; })) return null;
    /* each stretch is read on its own: the place finder names a word once per text, and a town may be told twice ("then Johannesburg ... married in Johannesburg") */
    order.forEach(function (k) {
      var all = { origin: null, born: null, died: null, married: null, moves: [] };
      people[k].chunks.forEach(function (c) {
        var e = readEvents(c, ctx);
        all.origin = all.origin || e.origin; all.born = all.born || e.born; all.died = all.died || e.died; all.married = all.married || e.married; all.moves = all.moves.concat(e.moves);
      });
      people[k].ev = all; people[k].occ = occIn(people[k].chunks.join(" "));
    });
    /* nobody but the subject has anything told of them: the one-person reading (ages, "father from Senj") says it better */
    var told = function (e) { return !!(e.born || e.origin || e.died || e.married || (e.moves && e.moves.length)); };
    if (!order.some(function (k) { return k !== subject && told(people[k].ev); })) return null;
    /* the subject's own married clause names the spouse when no sentence did ("he married my mother Cheryl") */
    var sp = people[subject].ev.married;
    if (sp && sp.spouse && !people.S) { var s2 = person("S", sp.spouse); s2.ev = readEvents("", ctx); s2.ev.married = { year: sp.year, place: sp.place, spouse: "" }; }
    else if (sp && people.S && !people.S.ev.married) people.S.ev.married = { year: sp.year, place: sp.place, spouse: "" };
    return { people: people, order: order, subject: subject, kids: readKids(t, ctx) };
  }

  /* ---- THE TELLER'S OWN FAMILY ---------------------------------------------------------------------------------------------
     "I have two children, Alessio and Mateo, both born in Brisbane. My mum is from Argentina and my dad from Senj, Croatia. They were
     married in Johannesburg." is a family told from the middle: the teller, the children, and two parents who need no name to be on the
     tree. Keys: ME is the teller, F and M the parents, S a partner, C1, C2 ... the children. Only what was said is read. */
  var CHILD_LIST = /\b(?:i|we)\s+(?:then\s+|later\s+|now\s+)?(?:have|has|had)\s+(?:(?:two|three|four|five|six|\d)\s+)?(?:children|kids|sons|daughters|boys|girls)\b\s*[,:]?\s*(?:named|called)?\s*([^.;]*)/i;
  var CHILD_LIST2 = /\bmy\s+(?:children|kids|sons|daughters)\s+(?:are|were)\s+(?:named\s+|called\s+)?([^.;]*)/i;
  var NOT_NAME = /^(both|all|born|from|in|who|they|are|were|is|was|aged|each|and|also|then|now|the|a|an|of|to|my|his|her|their|our)$/i;
  /* THE TELLER'S OWN CHILDREN, read from a family told through the teller's father: "i then has 2 children, alessio and mateo." Names only; the teller is not
     otherwise on the tree, so they are drawn under "You". */
  function readKids(t, ctx) {
    var kids = [];
    String(t || "").split(/[.!?]+(?:\s+|$)|\n+/).forEach(function (sent) {
      var cm = CHILD_LIST.exec(sent) || CHILD_LIST2.exec(sent); if (!cm) return;
      cm[1].replace(/,\s*(?:both|all|who|and they|they|each)\b.*$/i, "").split(/\s*,\s*|\s+and\s+|\s*&\s*/i).forEach(function (piece) {
        var w = piece.trim().split(/\s+/)[0], f = S.fold(w || "");
        if (w && /^[\p{L}'’-]{2,}$/u.test(w) && !NOT_NAME.test(w) && !STOP[f] && !COMMON[f] && !CONNECT.test(w) && !EV_BORN.test(f) && !EV_MOVE.test(f) && !EV_DIED.test(f) && !EV_WED.test(f) && kids.length < 8 && kids.indexOf(cased(w)) < 0) kids.push(cased(w));
      });
    });
    return kids;
  }
  function readMe(t, ctx) {
    var P = Object.create(null), order = [], nKids = 0, nGrand = 0;
    function person(key, name) {
      var p = P[key];
      if (!p) { p = P[key] = { key: key, name: "", given: "", surname: "", ev: { origin: null, born: null, died: null, married: null, moves: [] } }; order.push(key); }
      if (name && !p.name) { var np = String(name).split(/\s+/); p.given = cased(np[0]); if (np.length > 1) p.surname = surnameCase(np.slice(1).join(" ")); p.name = p.given + (p.surname ? " " + p.surname : ""); }
      return p;
    }
    function okName(w) { var f = S.fold(w); return w && /^[\p{L}'’-]{2,}$/u.test(w) && !NOT_NAME.test(w) && !STOP[f] && !COMMON[f] && !CONNECT.test(w) && !EV_BORN.test(f) && !EV_MOVE.test(f) && !EV_DIED.test(f) && !EV_WED.test(f) && !/^(?:killed|drowned|executed|hanged|shot|lost|ill|sick|buried|single|widowed|divorced|alive|old|young|tall|short|poor|rich)$/.test(f); }
    function merge(p, e) { var o = p.ev; o.origin = o.origin || e.origin; o.born = o.born || e.born; o.died = o.died || e.died; o.married = o.married || e.married; o.moves = o.moves.concat(e.moves); }
    var sents = String(t || "").split(/[.!?]+(?:\s+|$)|\n+/), parentsWed = null, hist = [];
    /* WHO "HE" IS. "My mother told me he was born in Naples ... He sent money home to his mother Concetta. After the war he moved to Brooklyn." The
       mother is the teller of it, not the man; a pronoun goes to the last person mentioned whose sex it can be (a mother is never "he"). */
    function sexOf(k) { var q = P[k]; return !q ? null : k === "F" ? "M" : k === "M" ? "F" : q.sex || null; }
    function heFor(pro) { var want = /^he$/i.test(pro) ? "M" : "F"; for (var i = hist.length - 1; i >= 0; i--) { var sx = sexOf(hist[i]); if (hist[i] !== "ME" && (!sx || sx === want)) return hist[i]; } return null; }
    function mention(k) { var i = hist.indexOf(k); if (i > -1) hist.splice(i, 1); hist.push(k); }
    var TELLS = /^\s+(?:always\s+|often\s+|once\s+)?(?:told|tells|said|says|remember\w*|mentioned|wrote|reckon\w*)\b(?:\s+(?:me|us))?(?:\s+that)?/i;
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
      while ((m = re.exec(sent))) { if (/^['\u2019]?s\s+(?:father|dad|mother|mum|mom)\b/i.test(sent.slice(m.index + m[0].length))) continue; ms.push({ at: m.index, end: m.index + m[0].length, key: KIN_STEP[m[1].toLowerCase()] }); }   /* "my father's father" is a grandparent, read below */
      /* «He married Maria in 1946 and they had ... my mother Anna»: the words before the parent are still about «he» */
      var lead = ms.length && /^\W*(?:(?:and|then|later)\s+)?(he|she)\b/i.exec(sent.slice(0, ms[0].at));
      if (lead) { var lw = heFor(lead[1]); if (lw && P[lw]) merge(P[lw], readEvents(sent.slice(0, ms[0].at), ctx)); }
      ms.forEach(function (x, i) {
        var rest = sent.slice(x.end, i + 1 < ms.length ? ms[i + 1].at : sent.length), nm = /^\s+(?:name\s+)?(?:is|was|named|called)\s+(?:(?:named|called)\s+)?([\p{L}'’-]+)/iu.exec(rest), p = person(x.key, "");
        var tm = TELLS.exec(rest);
        if (tm) {
          /* what a parent TELLS is about someone else: the person named in the same breath ("told me he"), else the last one mentioned */
          var said = rest.slice(tm[0].length), pr = /^\s*(he|she)\b/i.exec(said), tgt = pr ? heFor(pr[1]) : null;
          if (tgt) { merge(P[tgt], readEvents(said, ctx)); P[tgt].occ = P[tgt].occ || occIn(said); mention(tgt); }
          mention(x.key); return;
        }
        if (nm && okName(nm[1])) {
          var full = nm[1];   /* "my father was named Ivan Kovač": the surname that follows */
          rest = rest.slice(nm[0].length);
          var sn2 = surnameAfter(rest); if (sn2) { full += " " + sn2.sur; rest = rest.slice(sn2.len); }
          person(x.key, full);
        }
        else if (nm) rest = rest.slice(nm[0].length - nm[1].length);
        else {
          /* "my mother Cheryl who's grandfather...", "my mother cheryl": the name follows with no "is/was", capitalised or typed in lower case but a given name the Atlas knows */
          var bn = /^\s+([\p{L}'\u2019-]{2,})(?=\s|,|$)/u.exec(rest);
          if (bn && okName(bn[1]) && !KINW.test(bn[1]) && !REL.test(bn[1]) && (/^\p{Lu}/u.test(bn[1]) || (ctx.given && S.givenIn(bn[1], ctx.given, ctx.skip).length))) {
            var bfull = bn[1].charAt(0).toUpperCase() + bn[1].slice(1); rest = rest.slice(bn[0].length);
            var bsur = surnameAfter(rest); if (bsur) { bfull += " " + bsur.sur; rest = rest.slice(bsur.len); }
            person(x.key, bfull);
          }
        }
        rest = cutRelative(rest).own;   /* "my mother Cheryl who's grandfather was from X": that is HER grandfather, your great-grandfather, who the tree does not draw yet, so X is not put on her */
        merge(p, readEvents(rest, ctx)); p.occ = p.occ || occIn(rest); mention(x.key);
      });
      /* THE PARENTS' PARENTS: "my father's father was Ivan and his mother was Hedviga", "her father was Nuno and mother Catherine". The owner is the parent
         named ("my father's ..."), or the parent a "his" / "her" can be: the one just told of when it is the right sex, else the last mentioned. They are
         told by name here, so the tree can draw them even when no place is said of them yet. */
      { var GR = /\b(?:[Mm]y\s+(father|dad|mother|mum|mom)['\u2019]?s?|([Hh]is|[Hh]er))\s+(father|dad|mother|mum|mom)(?:\s+(?:name\s+)?(?:was|is|named|called)\s+(?:(?:named|called)\s+)?|\s+(?=\p{Lu}))([\p{L}'\u2019-]+)/gu, gm2, gl = [];
        while ((gm2 = GR.exec(sent))) gl.push({ at: gm2.index, end: gm2.index + gm2[0].length, own: gm2[1] ? KIN_STEP[gm2[1].toLowerCase()] : "", pro: (gm2[2] || "").toLowerCase(), step: KIN_STEP[gm2[3].toLowerCase()], name: gm2[4] });
        var lastOwn = null;
        gl.forEach(function (g, i) {
          var own = g.own;
          if (!own) { if (!(P.F && P.M)) return;   /* a bare "his mother" in a story about one parent is that parent's own, read as the one-person story; it is the PARENTS' parent only when both of the teller's parents are told */
            var want = g.pro === "his" ? "M" : "F"; own = lastOwn && sexOf(lastOwn) === want ? lastOwn : (function () { for (var q = hist.length - 1; q >= 0; q--) if ((hist[q] === "F" || hist[q] === "M") && sexOf(hist[q]) === want) return hist[q]; return null; })(); }
          if (!own || !okName(g.name)) return;
          var gnext = i + 1 < gl.length ? gl[i + 1].at : sent.length, grest = sent.slice(g.end, gnext), gsur = surnameAfter(grest);
          if (gsur) grest = grest.slice(gsur.len);
          lastOwn = own; var gkey = own + g.step, gper = person(gkey, g.name + (gsur ? " " + gsur.sur : ""));
          /* "... was Nuno and mother Catherine": the other parent of the same person, with no "his" or "her" of its own */
          var oth = /^\s*,?\s*(?:and|&)\s+(?:(?:his|her)\s+)?(mother|mum|mom|father|dad)\s+(?:was\s+|is\s+|named\s+|called\s+)?([\p{L}'\u2019-]+)/iu.exec(grest);
          if (oth && KIN_STEP[oth[1].toLowerCase()] !== g.step && okName(oth[2])) { grest = grest.slice(oth[0].length); var osur = surnameAfter(grest); if (osur) grest = grest.slice(osur.len); person(own + KIN_STEP[oth[1].toLowerCase()], oth[2] + (osur ? " " + osur.sur : "")); }
          merge(gper, readEvents(cutRelative(grest).own, ctx)); gper.occ = gper.occ || occIn(grest); mention(gkey);
        }); }
      /* "my mother Cheryl who had an Argentinian grandfather", "whose grandfather was from Argentina": a line the tree does not draw yet, kept as a note on her
         and as a place on the map, so it is not lost. Which of her grandparents is not said, so none is guessed. */
      { var HR = /\b(?:my\s+(mother|mum|mom|father|dad)\b[^.;]*?)?(?:had|has|have|with)\s+(?:an?|their)\s+(\p{L}+)\s+(grand(?:father|mother|parent)|great[- ]grand(?:father|mother|parent))\b/iu, hr = HR.exec(sent), dem = hr && DEMONYM[S.fold(hr[2])];
        var WH = /\bmy\s+(mother|mum|mom|father|dad)\b[^.;]*?\bwho(?:['\u2019]?s|se)\s+(grand(?:father|mother|parent))\s+(?:was|is)\s+([^.;]*)/iu, wh = WH.exec(sent);
        var hKey = hr && hr[1] ? KIN_STEP[hr[1].toLowerCase()] : wh ? KIN_STEP[wh[1].toLowerCase()] : null, hWho = hr ? hr[3].toLowerCase() : wh ? wh[2].toLowerCase() : "";
        if (hKey && P[hKey]) {
          var hev = dem ? readEvents("from " + dem, ctx) : wh ? readEvents(wh[3].replace(/^(?:from\s+)?/i, "from "), ctx) : null, hpl = hev && (hev.origin || (hev.moves && hev.moves[0] && hev.moves[0].place));
          if (hpl) (P[hKey].heritage = P[hKey].heritage || []).push({ who: hWho, place: hpl });
        } }
      /* "my grandfather lived in Crikvenica in 1990" (which side is not said, so none is guessed) */
      var gre = /\bmy\s+(gran\w*\s*(?:f[ae]\w*|dad|pa|pop\w*)|gran\w*\s*(?:mo\w*|ma|mum|nan\w*)|grand\w*)\b([^.;]*)/gi, gm;
      while ((gm = gre.exec(sent))) {
        var gmale = /^gran\w*\s*(?:f[ae]|dad|pa|pop)/i.test(gm[1]), grest = gm[2], gnm = /^\s+(?:is|was|named|called)\s+([\p{L}'’-]+)/iu.exec(grest);
        /* "my grandfather was born in Cork. My grandfather died in Boston." is one grandfather unless a different name is given to the second */
        var gsame = order.map(function (k) { return P[k]; }).filter(function (q) { return /^G/.test(q.key) && q.sex === (gmale ? "M" : "F") && (!gnm || !okName(gnm[1]) || !q.name || S.fold(q.name) === S.fold(gnm[1])); })[0];
        var gp = gsame || person("G" + (++nGrand), "");
        gp.sex = gmale ? "M" : "F";
        if (gnm && okName(gnm[1])) { grest = grest.slice(gnm[0].length); var gsa = surnameAfter(grest); if (gsa) grest = grest.slice(gsa.len); person(gp.key, gnm[1] + (gsa ? " " + gsa.sur : "")); } else if (gnm) grest = grest.slice(gnm[0].length - gnm[1].length);
        merge(gp, readEvents(grest, ctx)); gp.occ = gp.occ || occIn(grest); mention(gp.key);
      }
      /* «They left for Australia in 1952»: the one just told of (or both parents), who went together */
      if (!ms.length && !cm && /^\W*(?:(?:and|then|later)\s+)?they\b(?!\s+(?:were\s+|got\s+)?(?:married|wed))/i.test(sent)) {
        var they = P.F && P.M && hist.indexOf("F") > -1 && hist.indexOf("M") > -1 ? ["F", "M"] : hist.filter(function (k) { return /^G/.test(k); }).slice(-1);
        they.forEach(function (k) { if (P[k]) merge(P[k], readEvents(sent, ctx)); });
      }
      /* a sentence that is only about "he" or "she" goes to the person it can be */
      if (!ms.length && !cm) {
        var hp = /^\W*(?:(?:after|before|then|later|in|by|when|until|once)\b[^,.]{0,40},?\s+)?(he|she)\b/i.exec(sent), who = hp ? heFor(hp[1]) : null;
        if (who) { merge(P[who], readEvents(sent, ctx)); P[who].occ = P[who].occ || occIn(sent); }
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

  /* ---- A MAN (OR WOMAN) SOMEONE IS LOOKING FOR ---------------------------------------------------------------------------------
     "Can you help me find this man. Father, Andreas Slavic, b 1874 in Gornji Rukavac; mother Teresia Laginja, b 1877 in Gornji Rukavac."
     The person asked about has no name; the parents are given as labelled lines. They are the parents OF HIM, not of the teller, and the
     teller is not on the tree unless the story says they are related. Only read when no "my father"-style sentence is there to say otherwise. */
  function readSought(t, ctx) {
    if (/\b(?:my|our)\s+(?:(?:great|step)[- ]?)*(?:grand)?(?:father|mother|dad|mum|mom|parents?)\b/i.test(t)) return null;
    var P = Object.create(null), order = [], own = [];
    String(t || "").split(/;|\n|,\s+(?=[Ff]ather\b|[Mm]other\b)|[.!?]+(?:\s+(?=\p{Lu})|$)/u).forEach(function (cl) {
      var m = /^\s*(?:and\s+)?(?:(?:his|her)\s+)?(father|dad|mother|mum|mom)\b\s*(?:[,:\u2013-]|\s+(?:is|was|named|called)\b|(?=\s))\s*(.*)$/i.exec(cl);
      if (!m) { own.push(cl); return; }
      var key = KIN_STEP[m[1].toLowerCase()], nm = /^(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/u.exec(m[2]);
      if (!nm || P[key]) return;
      var words = nm[1].split(/\s+/).filter(function (w) { return !STOP[S.fold(w)] && !CONNECT.test(w); });
      if (!words.length) return;
      var rest = m[2].slice(nm[1].length).replace(/\bb\.?(?=\s*\d{4})/gi, "born").replace(/\bd\.?(?=\s*\d{4})/gi, "died");
      var ev = readEvents(rest, ctx);
      /* a place the Atlas does not hold is still the place they wrote: keep the words so the card can say it, and say it is not placed */
      if (ev.born && !ev.born.place) { var tx = /\b(?:in|at)\s+(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/u.exec(rest); if (tx) ev.born.text = tx[1]; }
      P[key] = { key: key, name: cased(words.join(" ")), given: cased(words[0]), surname: words.length > 1 ? cased(words.slice(1).join(" ")) : "", ev: ev };
      order.push(key);
    });
    if (!order.length) return null;
    var sex = /\bthis\s+(?:man|gentleman|guy|fellow)\b|\bfind\s+him\b/i.test(t) ? "man" : /\bthis\s+(?:woman|lady)\b|\bfind\s+her\b/i.test(t) ? "woman" : "";
    /* the man's own life: what the rest of the story says of him, read like any one person's stretch of a family story */
    /* each sentence is read on its own (the place finder names a phrase once per text, and a town is told in several pictures) */
    var ownText = own.join(". "), life = { origin: null, born: null, died: null, married: null, moves: [] };
    own.forEach(function (cl) {
      var e = readEvents(cl.replace(/\bb\.?(?=\s*\d{4})/gi, "born").replace(/\bd\.?(?=\s*\d{4})/gi, "died"), ctx);
      life.origin = life.origin || e.origin; life.born = life.born || e.born; life.died = life.died || e.died; life.married = life.married || e.married; life.moves = life.moves.concat(e.moves);
    });
    var seenAt = Object.create(null), mv = [];
    life.moves.forEach(function (x) { var k = x.place.row.i, e = seenAt[k]; if (e) { if (e.year == null && x.year != null) e.year = x.year; return; } seenAt[k] = x; mv.push(x); });
    var prev = 0, keyed = mv.map(function (x, i) { if (x.year != null) prev = x.year; return { x: x, k: prev, i: i }; });
    life.moves = keyed.sort(function (a, b) { return a.k - b.k || a.i - b.i; }).map(function (z) { return z.x; });
    var pk = Object.keys(P).map(function (k) { return S.fold(P[k].surname); }).filter(Boolean), nm = null;
    var cands = [], nre = /(?:\bnames?\b[^.;:]{0,40}?\b(?:is|was|are|:)\s*|\bfind\s+|\bthis\s+(?:man|woman|person)\s+(?:is|was)\s+|^|[.;]\s+)(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,2})(?=\s+(?:was|is|born|b\.?\b|aged|\(|,|:)|[.;,]|$)/gmu, nmm;
    while ((nmm = nre.exec(ownText))) { var ws = nmm[1].split(/\s+/).filter(function (w) { return !STOP[S.fold(w)] && !CONNECT.test(w) && !COMMON[S.fold(w)]; }); if (ws.length >= 2 && !(ctx.map && ctx.map[S.fold(ws.join(" "))])) cands.push(ws); }
    function near(a, b) { a = a.slice(0, 5); b = b.slice(0, 5); var d = 0; for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d++; return d <= 1; }
    cands.forEach(function (ws) { if (!nm && pk.some(function (k) { return near(S.fold(ws[ws.length - 1]), k); })) nm = ws; });
    var hasLife = !!(life.born || life.origin || life.moves.length || life.died);
    P.ME = { key: "ME", name: nm ? cased(nm.join(" ")) : "", given: nm ? cased(nm[0]) : "", surname: nm ? cased(nm.slice(1).join(" ")) : "", ev: hasLife ? life : { origin: null, born: null, died: null, married: null, moves: [] } };
    order.push("ME");
    return { people: P, order: order, subject: "ME", sought: { label: "The " + (sex || "person") + " you're looking for", poss: sex === "man" ? "his " : sex === "woman" ? "her " : "", life: hasLife } };
  }

  /* Fold readMe into the parse: the people (named or not), and the lines each of them travels. The teller's own route is not told, so none is
     drawn for them; the parents and children each get their pins. */
  function occIn(text) { var m = String(text || "").match(/[\p{L}]+/gu) || []; for (var i = 0; i < m.length; i++) { var f = S.fold(m[i]); if (OCC[f] && f.length > 3) return f; } return ""; }
  function applyMe(out, me, ctx, teller) {
    var P = me.people, SO = !!me.sought;
    function evOf(pe) {
      var e = pe.ev, list = [];
      if (e.born && (e.born.year != null || e.born.place)) list.push({ type: "born", year: e.born.year, place: e.born.place, text: e.born.text || "" });
      if (e.married && (e.married.year != null || e.married.place)) list.push({ type: "married", year: e.married.year, place: e.married.place });
      if (e.died && (e.died.year != null || e.died.place)) list.push({ type: "died", year: e.died.year, place: e.died.place, cause: e.died.cause });
      /* "lived in Crikvenica in 1990" is where they were, not where they were from: it is said that way on the card */
      if ((!e.born && !e.origin) || SO) (e.moves || []).forEach(function (mv) { list.push({ type: "lived", year: mv.year, place: mv.place }); });
      return list;
    }
    var gname = teller ? teller.split(" ")[0] : "";
    var people = [], kin = [];
    function put(key, role, label) {
      var pe = P[key]; if (!pe) return;
      var place = pe.ev.born && pe.ev.born.place ? pe.ev.born.place : pe.ev.origin;
      var isMe = key === "ME" && !SO;
      people.push({ role: role, rel: "", name: isMe ? teller : pe.name, given: isMe ? gname : pe.given, surname: isMe ? teller.split(" ").slice(1).join(" ") : pe.surname,
        givenWord: isMe ? gname : pe.given, place: place || null, presumed: false, occupation: pe.occ || "", label: key === "ME" && me.sought ? me.sought.label : label, events: evOf(pe), key: key, me: isMe, sought: key === "ME" && SO, unnamed: !(pe.name || (isMe && teller)) });
      if (key === "ME") return;
      var st = [], e = pe.ev;
      if (e.born && e.born.place) st.push({ row: e.born.place.row, alts: e.born.place.alts, word: e.born.place.word, role: "born", year: e.born.year, approx: false });
      else if (e.origin) st.push({ row: e.origin.row, alts: e.origin.alts, word: e.origin.word, role: "origin", year: null, approx: false });
      if (e.married && e.married.place && (key === "F" || key === "M")) st.push({ row: e.married.place.row, alts: e.married.place.alts, word: e.married.place.word, role: "married", year: e.married.year, approx: false });
      e.moves.forEach(function (mv) { st.push({ row: mv.place.row, alts: mv.place.alts, word: mv.place.word, role: "move", year: mv.year, approx: false }); });
      /* where they died is a place on their line, with the year they died told for it: "my father died in 1999 in Brisbane" */
      if (e.died && e.died.place) { var dsame = st.filter(function (x) { return x.row.i === e.died.place.row.i; })[0]; if (dsame) (dsame.ev = dsame.ev || []).push({ type: "died", year: e.died.year }); else st.push({ row: e.died.place.row, alts: e.died.place.alts, word: e.died.place.word, role: "move", year: e.died.year, approx: false, ev: [{ type: "died", year: e.died.year }] }); }
      if (st.length) kin.push({ key: key, name: pe.name, label: label, stops: st });
    }
    put("ME", "self", "");
    var pq = me.sought ? me.sought.poss : "your ";
    put("F", "father", pq + "father"); put("M", "mother", pq + "mother"); put("S", "spouse", "your partner");
    ["FF", "FM", "MF", "MM"].forEach(function (k) { if (P[k]) put(k, /F$/.test(k) ? "grandfather" : "grandmother", "your " + (k.charAt(0) === "F" ? "father" : "mother") + "'s " + (/F$/.test(k) ? "father" : "mother")); });
    me.order.filter(function (k) { return /^G/.test(k); }).forEach(function (k) { put(k, P[k].sex === "M" ? "grandfather" : "grandmother", P[k].sex === "M" ? "your grandfather" : "your grandmother"); });
    me.order.filter(function (k) { return /^C/.test(k); }).forEach(function (k) { put(k, "child", "your child"); });
    /* the grandparent a parent's line came from, told without a name: a place on the map and a line on the parent's card */
    ["F", "M"].forEach(function (k) {
      var pe = P[k]; if (!pe || !pe.heritage) return;
      pe.heritage.forEach(function (h, i) {
        var who = (k === "F" ? "your father's " : "your mother's ") + h.who.replace(/^great[- ]/, "great-");
        kin.push({ key: k + "H" + (i + 1), name: "", label: who, stops: [{ row: h.place.row, alts: h.place.alts, word: h.place.word, role: "origin", year: null, approx: false }] });
        var card = people.filter(function (x) { return x.key === k; })[0];
        if (card) card.events.push({ type: "told", text: (k === "F" ? "His " : "Her ") + h.who.replace(/^great[- ]/, "great-") + " was from " + (h.place.row.cc && ctx.countries && ctx.countries[h.place.row.cc] && /^(?:area|country)$/i.test(h.place.row.kind || "country") ? ctx.countries[h.place.row.cc] : h.place.word) });
      });
    });
    out.people = people; out.kin = kin;
    out.name = teller || ""; out.givenWord = gname; out.surname = ""; out.given = ""; out.rel = "";
    out.stops = []; out.route = []; out.from = null; out.to = null; out.noRoute = true; out.born = null; out.left = null;
    /* the one being looked for has a life of their own in the story: draw it as a journey, with the years that were told */
    if (SO && me.sought.life) {
      var ev = P.ME.ev, rs = [];
      function add(pl, role, yr) { if (pl) rs.push({ row: pl.row, alts: pl.alts, word: pl.word, role: role, age: null, year: yr == null ? null : yr, approx: false, told: yr != null }); }
      if (ev.born && ev.born.place) add(ev.born.place, "born", ev.born.year); else if (ev.origin) add(ev.origin, "origin");
      (ev.moves || []).forEach(function (mv) { if (rs.length && rs[rs.length - 1].row.i === mv.place.row.i) return; add(mv.place, "move", mv.year); });
      out.sought = true; out.name = P.ME.name || ""; out.given = P.ME.given || ""; out.givenWord = P.ME.given || ""; out.surname = P.ME.surname || "";
      out.born = ev.born && ev.born.year != null ? ev.born.year : null; out.endYear = ev.died && ev.died.year != null ? ev.died.year : null;
      if (rs.length) {
        out.noRoute = false; out.route = rs; out.stops = rs;
        out.from = { row: rs[0].row, alts: rs[0].alts, word: rs[0].word }; out.to = rs.length > 1 ? { row: rs[rs.length - 1].row, alts: rs[rs.length - 1].alts, word: rs[rs.length - 1].word } : null;
      }
    } else if (SO) out.sought = true;
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
    if (ev.origin && !(rs[0] && rs[0].row.i === ev.origin.row.i)) add(ev.origin, "origin");   /* where they are from is not a move */
    ev.moves.forEach(function (mv) { if (rs.length && rs[rs.length - 1].row.i === mv.place.row.i) return; add(mv.place, "move", mv.year); rs[rs.length - 1].mvAge = mv.age == null ? null : mv.age; });
    var endYear = ev.died && ev.died.year != null ? ev.died.year : null;
    function stopFor(pl) { for (var i = 0; i < rs.length; i++) if (pl && rs[i].row.i === pl.row.i) return rs[i]; return null; }
    var stopEv = [];
    if (ev.married) { var ms = stopFor(ev.married.place); if (ms) { if (ev.married.year != null && ms.year == null) { ms.year = ev.married.year; ms.told = true; } (ms.ev = ms.ev || []).push({ type: "married", year: ev.married.year }); } }
    if (ev.died) { var dsx = stopFor(ev.died.place); if (!dsx && ev.died.place) { add(ev.died.place, "move", ev.died.year); dsx = rs[rs.length - 1]; } if (dsx) (dsx.ev = dsx.ev || []).push({ type: "died", year: ev.died.year, cause: ev.died.cause || "" }); }
    var kids = rs.length;
    /* when was he born: told, else worked out from the mother, the father, or the marriage, and said to be about */
    var born = ev.born && ev.born.year != null ? ev.born.year : null, bornApprox = false;
    if (born == null) {
      var my = year(P[sk + "M"]), fy = year(P[sk + "F"]);
      born = my != null ? my + 26 : fy != null ? fy + 30 : ev.married && ev.married.year != null ? ev.married.year - 26 : null; bornApprox = born != null;
    }
    /* "by the time he was 18 he moved to Johannesburg": the year is the birth year and the age, said to be about when the birth is itself worked out */
    if (born != null) rs.forEach(function (x) { if (x.year == null && x.mvAge != null) { x.year = born + x.mvAge; x.told = !bornApprox; x.approx = bornApprox; } });
    if (born != null && rs.length) {
      if (rs[0].year == null && !bornApprox) { rs[0].year = born; rs[0].approx = bornApprox; }
      /* a stop the story gave no year gets none (nothing carries a year the words do not): only a rough AGE, between its neighbours', said to be about */
      if (rs[0].year == null) rs[0].est = born;
      var known = [];
      rs.forEach(function (x, i) { if (x.year != null || x.est != null) known.push(i); });
      var yv = function (x) { return x.year != null ? x.year : x.est; };
      for (var a = 0; a < known.length - 1; a++) {
        var i0 = known[a], i1 = known[a + 1];
        for (var k = i0 + 1; k < i1; k++) { rs[k].est = Math.round(yv(rs[i0]) + (yv(rs[i1]) - yv(rs[i0])) * (k - i0) / (i1 - i0)); rs[k].approx = true; }
      }
      var last = known[known.length - 1], tail = rs.length - 1 - last;
      for (var j = 1; j <= tail; j++) { rs[last + j].est = endYear != null && endYear > yv(rs[last]) ? Math.round(yv(rs[last]) + (endYear - yv(rs[last])) * j / (tail + 1)) : yv(rs[last]) + 5 * j; rs[last + j].approx = true; }
      rs.forEach(function (x) { x.yearTold = !!x.told; x.age = yv(x) - born; delete x.est; if (bornApprox || x.approx) x.approx = true; if (x.told && !(bornApprox && x.age != null)) x.approx = false; x.age = Math.max(0, x.age); });
      rs[0].age = 0;
    }
    if (rs.length) {
      out.stops = rs; out.route = rs;
      out.from = { row: rs[0].row, alts: rs[0].alts, word: rs[0].word };
      out.to = rs.length > 1 ? { row: rs[rs.length - 1].row, alts: rs[rs.length - 1].alts, word: rs[rs.length - 1].word } : null;
      out.born = bornApprox ? null : born; out.bornApprox = bornApprox; out.left = rs.length > 1 && rs[1].year != null ? rs[1].year : out.left; out.endYear = endYear;
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
      people.push({ role: role, rel: rel || "", name: pe.name, given: pe.given, surname: pe.surname, givenWord: pe.given, place: place || null, presumed: false, occupation: pe.occ || "", label: key === sk ? "" : lab(key), events: evOf(pe), key: key });
    }
    put(sk, "self", out.rel || KIN_NOUN[sk]);
    put(sk + "F", "father"); put(sk + "M", "mother");
    Object.keys(P).sort(function (x, y) { return x.length - y.length || (x < y ? -1 : 1); }).forEach(function (k) {
      if (k === "S") put(k, "spouse"); else if (/S$/.test(k) && k.length > 1) put(k, "inlaw");
      else if (k.indexOf(sk) === 0 && k.length - sk.length >= 2) put(k, KIN_NOUN[k.slice(-1)] === "father" ? "grandfather" : "grandmother");
    });
    people.forEach(function (pp) { if (pp.role === "inlaw") { var ow = P[pp.key.slice(0, -1)], sx = P[pp.key].sex; pp.label = (sx === "F" ? "wife" : sx === "M" ? "husband" : "spouse") + " of " + (ow && ow.name ? ow.name : lab(pp.key.slice(0, -1)) || "the one before"); } });
    (fam.kids || []).forEach(function (kn, i) { people.push({ role: "child", rel: "your child", name: kn, given: kn, surname: "", givenWord: kn, place: null, presumed: false, occupation: "", label: "", events: [], key: "C" + (i + 1) }); });
    out.people = people;
    if (me.name) { out.name = me.name; out.givenWord = me.given; out.surname = me.surname; var gg = ctx.given ? S.givenIn(me.given, ctx.given, ctx.skip) : []; out.given = gg.length ? gg[0].row.canon : me.given; }
    else if (out.givenWord && Object.keys(P).some(function (k) { return k !== sk && P[k].given && S.fold(P[k].given) === S.fold(out.givenWord); })) { out.name = ""; out.givenWord = ""; out.given = ""; out.surname = ""; if (people.length) { var sf = people.filter(function (x) { return x.key === sk; })[0]; if (sf) { sf.name = ""; sf.given = ""; sf.givenWord = ""; sf.surname = ""; } } }
    out.rel = out.rel || KIN_NOUN[sk];
    /* the lines the others travel: where they were born, then where they moved, each at its year when it was given */
    var kin = [];
    Object.keys(P).forEach(function (k) {
      if (k === sk) return;
      var pe = P[k], e = pe.ev, st = [];
      if (e.born && e.born.place) st.push({ row: e.born.place.row, alts: e.born.place.alts, word: e.born.place.word, role: "born", year: e.born.year, approx: false });
      else if (e.origin) st.push({ row: e.origin.row, alts: e.origin.alts, word: e.origin.word, role: "origin", year: null, approx: false });
      e.moves.forEach(function (mv) { st.push({ row: mv.place.row, alts: mv.place.alts, word: mv.place.word, role: "move", year: mv.year, approx: false }); });
      if (e.died && e.died.place) { var dsame2 = st.filter(function (x) { return x.row.i === e.died.place.row.i; })[0]; if (dsame2) (dsame2.ev = dsame2.ev || []).push({ type: "died", year: e.died.year }); else st.push({ row: e.died.place.row, alts: e.died.place.alts, word: e.died.place.word, role: "move", year: e.died.year, approx: false, ev: [{ type: "died", year: e.died.year }] }); }
      if (k !== "S" && e.married && e.married.place && !st.some(function (x) { return x.row.i === e.married.place.row.i; })) st.push({ row: e.married.place.row, alts: e.married.place.alts, word: e.married.place.word, role: "married", year: e.married.year, approx: false });
      if (st.length) kin.push({ key: k, name: pe.name, label: !lab(k) ? "" : P[sk].given ? cased(P[sk].given) + "'s " + lab(k) : /^[FM]+$/.test(k) ? "your " + chainLabel(k) : "", stops: st });
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

  /* WHICH LANGUAGES A CLERK WOULD HAVE USED, from where a person lived and when. David: «we can deduce which alternate spellings he would have based on who held the ground / the country
     of the time of his life, rather than throwing all languages up». A person born in Senj in 1951 was written in Croatian (Yugoslavia) and, in Sydney, in English; not in Latin, Italian or
     Hungarian, which Senj's registers used under other rulers. The language of the country as it is now is always included; the polity of each era the person was there adds the language its
     administration wrote (Austria-Hungary: German, and Hungarian for the Hungarian half); Latin is the language of Catholic registers until the 1940s. Everything not expected is kept, folded
     away, never dropped: a clerk can surprise. `stays` = [{info, from, to}] with from/to the years they were there (null when not told). Returns null when nothing can be said. */
  var NATIVE_LANG = { HR: ["croatian"], SI: ["slovene"], RS: ["serbian"], BA: ["croatian", "serbian"], ME: ["serbian"], MK: ["macedonian"], XK: ["albanian", "serbian"], BG: ["bulgarian"], GR: ["greek"], AL: ["albanian"], IT: ["italian"], SM: ["italian"], VA: ["italian", "latin"],
    AT: ["german"], DE: ["german"], LI: ["german"], HU: ["hungarian"], SK: ["slovak"], CZ: ["czech"], PL: ["polish"], RO: ["romanian"], MD: ["romanian", "russian"], UA: ["ukrainian"], BY: ["belarusian"], RU: ["russian"], LT: ["lithuanian"], LV: ["latvian"], EE: ["estonian"],
    FI: ["finnish", "swedish"], SE: ["swedish"], NO: ["norwegian"], DK: ["danish"], IS: ["icelandic"], FO: ["faroese"], NL: ["dutch"], BE: ["dutch", "french"], FR: ["french"], LU: ["french", "german"], CH: ["german", "french", "italian"], ES: ["spanish"], PT: ["portuguese"],
    MT: ["maltese"], TR: ["turkish"], IL: ["hebrew", "english"], GB: ["english"], IE: ["english", "irish"], US: ["english"], CA: ["english", "french"], AU: ["english"], NZ: ["english"], ZA: ["english", "afrikaans"], MX: ["spanish"], AR: ["spanish"], UY: ["spanish"],
    CL: ["spanish"], PE: ["spanish"], CO: ["spanish"], VE: ["spanish"], BO: ["spanish"], PY: ["spanish"], EC: ["spanish"], CU: ["spanish"], DO: ["spanish"], BR: ["portuguese"] };
  var POLITY_LANG = [[/austria|habsburg|austrian|k\.u\.k|imperial and royal/i, ["german"]], [/hungar/i, ["hungarian"]], [/ital|venice|venetian|veneto|fiume|dalmatia|fascis|savoy|piedmont/i, ["italian"]], [/venice|venetian/i, ["venetian"]],
    [/napoleon|illyria|french|france/i, ["french"]], [/german|prussia|reich|bavaria|saxony|wurttemberg|baden/i, ["german"]], [/russia|soviet|ussr|tsar/i, ["russian"]], [/ottoman|turk/i, ["turkish"]], [/polish|poland/i, ["polish"]], [/spanish|spain/i, ["spanish"]],
    [/portug/i, ["portuguese"]], [/british|england|english|united kingdom|dominion|crown colony|empire of india/i, ["english"]], [/dutch|netherlands/i, ["dutch"]], [/danish|denmark/i, ["danish"]], [/swedish|sweden/i, ["swedish"]]];
  function clerkLanguages(stays) {
    var keys = {}, notes = [], any = false;
    (stays || []).forEach(function (st) {
      var info = st && st.info; if (!info) return;
      var got = {}, from = st.from, to = st.to != null ? st.to : st.from;
      (NATIVE_LANG[info.cc] || []).forEach(function (l) { got[l] = 1; });
      var eras = info.eras || [];
      if (from != null) eras.forEach(function (e) { if (e.to > from && e.from <= to) POLITY_LANG.forEach(function (r) { if (r[0].test((e.polity || "") + " " + ((info.regimes && info.regimes[e.regime] && info.regimes[e.regime].label) || ""))) r[1].forEach(function (l) { got[l] = 1; }); }); });
      if (from == null || from < 1946) got.latin = 1;
      var ls = Object.keys(got); if (!ls.length) return;
      any = true; ls.forEach(function (l) { keys[l] = 1; });
      notes.push({ place: info.name, from: from, to: to, langs: ls });
    });
    return any ? { keys: keys, notes: notes } : null;
  }

  var api = { toYear: toYear, suggest: suggest, windows: windows, volumesFor: volumesFor, captionAt: captionAt, progress: progress, between: between,
              readFamily: readFamily, readMe: readMe, readEvents: readEvents, repairCase: repairCase, givenForms: givenForms, volLabel: volLabel, buildPlan: buildPlan, parseStory: parseStory, startFamily: startFamily, familyName: familyName, flagFor: flagFor, leaderAt: leaderAt, leadersBetween: leadersBetween, givenGroups: givenGroups, surnameBlock: surnameBlock, short: short, yearsIn: yearsIn,
              HOLDS: HOLDS, YEAR_MIN: YEAR_MIN, YEAR_MAX: YEAR_MAX, readLife: readLife, gazWants: gazWants, gazMerge: gazMerge, didYouMean: didYouMean, aliasMerge: aliasMerge, countryPoints: countryPoints, repairCase: repairCase, clerkLanguages: clerkLanguages };
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
            return Promise.all([getJSON("place-aliases.json").catch(function () { return null; }), getJSON("country-points.json").catch(function () { return null; })]).then(function (x) {
              var al = x[0], cp = x[1], givenRows = g.rows || [], given = S.buildGiven(givenRows), map = S.buildMap(rows);
              if (al && al.aliases) aliasMerge(map, rows, al.aliases, given);
              if (cp && cp.countries) countryPoints(map, cp.countries);
              data = { rows: rows, countries: d.countries || {}, givenRows: givenRows, languages: g.languages || [], given: given, map: map, skip: Object.create(null) };
              return data;
            });
          });
      }).catch(function (e) { loading = null; throw e; });
      return loading;
    }
    /* A place the story names that the Atlas's own list does not hold ("Gornji Rukavac", a village) may still be in the worldwide gazetteer, which
       the search box already reads. Only a name that follows in / at / from / near / to is looked up, so a surname is never taken for a village,
       and only an exact name (or one of its other names) counts. The rows found are added to the map the reader parses with. */
    var gazDone = Object.create(null);
    function resolveMissing(text) {
      return load().then(function (d) {
        var want = gazWants(text, d.map, d.given).filter(function (w) { var k = w.ph + "|" + (w.ccs || []).join(); if (gazDone[k]) return false; gazDone[k] = 1; return true; });
        if (!want.length || !window.raShardKey) return d;
        return getJSON("shards.json").catch(function () { return {}; }).then(function (info) {
          return Promise.all(want.map(function (w) {
            var key = window.raShardKey(w.ph, info.g || {});
            if (!key) return null;
            return getJSON("g/" + encodeURIComponent(key) + ".json").then(function (rows) { gazMerge(d.map, w, rows); }).catch(function () { return null; });
          }));
        }).then(function () { return d; });
      });
    }
    /* The Atlas places within 15 km that hold books, nearest first: a village's records are often in the next parish. */
    function nearbyVolumes(info) {
      if (!data || info.lat == null) return [];
      var rad = Math.PI / 180, out = [];
      data.rows.forEach(function (r) {
        if (!r.c || r.i === info.row.i || r.y == null || r.x == null) return;
        var dy = (r.y - info.lat) * 111.2; if (Math.abs(dy) > 15) return;
        var dx = (r.x - info.lon) * 111.2 * Math.cos(info.lat * rad); if (Math.abs(dx) > 15) return;
        var km = Math.sqrt(dx * dx + dy * dy); if (km <= 15) out.push({ i: r.i, n: r.n, c: r.c, km: Math.max(1, Math.round(km)) });
      });
      return out.sort(function (a, b) { return a.km - b.km || b.c - a.c; }).slice(0, 5);
    }
    function placeInfo(row) {
      var regionsP = getJSON("regions.json").catch(function () { return null; });
      return Promise.all([row.country ? Promise.resolve(null) : getJSON("p/" + encodeURIComponent(row.i) + ".json").catch(function () { return null; }), regionsP]).then(function (r) {
        var p = r[0], regs = r[1], region = p && regs ? regs.regions.filter(function (x) { return x.id === p.region; })[0] : null;
        return { row: row, p: p, name: row.n.replace(/\s*\(([^)]*)\)/, function (m, x) { return S.fold(x) === S.fold(row.n.replace(/\s*\([^)]*\)/, "")) ? "" : m; }), lat: p ? p.lat : row.y, lon: p ? p.lon : row.x, cc: row.cc, countryName: (data.countries[row.cc] || row.cc || ""),
          older: p ? (p.names || []).map(function (n) { return n.n; }) : [], named: p && p.named ? p.named : [], cols: p ? p.collections || [] : [],
          eras: region ? region.eras : null, regimes: regs ? regs.regimes : null, region: region, href: row.gaz ? BASE + "?q=" + encodeURIComponent(row.n) : BASE + "place/" + encodeURIComponent(row.i) + "/" };
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
        var slugOf = Object.create(null); if (r[3] && r[3].slug) Object.keys(r[3].slug).forEach(function (sl) { slugOf[r[3].slug[sl]] = sl; });
        r[0].forEach(function (i) { i.flagSlug = slugOf[i.cc] || ""; });
        r[0].forEach(function (i) { i.provs = provs.filter(function (x) { return (x.countries || []).indexOf(i.cc) > -1; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); i.pname = pname; i.world = provs.filter(function (x) { return (x.countries || []).indexOf("*") > -1; }); i.flagRows = fm ? fm[String(i.cc || "").toUpperCase()] : null; i.leaders = lead ? lead[String(i.cc || "").toUpperCase()] : null; });
        r[0].forEach(function (i) { i.near = i.p && (i.cols || []).length ? [] : nearbyVolumes(i); });
        var from = parsed.from ? infos[parsed.from.row.i] : null, to = parsed.to ? infos[parsed.to.row.i] : null;
        var facts = { rel: parsed.rel, name: parsed.name, siblings: parsed.siblings || [], holds: parsed.holds, holdsAll: parsed.holdsAll, left: parsed.left, born: parsed.born, from: from, to: to, base: BASE,
          providers: to ? provs.filter(function (p) { return (p.countries || []).indexOf(to.cc) > -1; }) : (from ? provs.filter(function (p) { return (p.countries || []).indexOf(from.cc) > -1; }) : []),
          given: parsed.given && data.given ? S.givenIn(parsed.givenWord || parsed.given, data.given, null) : [],
          route: route.map(function (x) { return { info: infos[x.row.i], age: x.age, year: x.year, approx: x.approx, yearTold: x.yearTold, role: x.role, country: x.country, ev: x.ev, nearInfo: x.nearTo && x.nearTo.row ? infos[x.nearTo.row.i] : undefined, alts: (x.alts || []).slice(0, 3).map(function (r) { return { n: r.n, cc: r.cc }; }) }; }),
          bornApprox: !!parsed.bornApprox, endYear: parsed.endYear != null ? parsed.endYear : null,
          kin: (parsed.kin || []).map(function (k) { return { key: k.key, name: k.name, label: k.label, stops: k.stops.filter(function (x) { return infos[x.row.i]; }).map(function (x) { return { info: infos[x.row.i], year: x.year, role: x.role, ev: x.ev }; }) }; }).filter(function (k) { return k.stops.length; }),
          ancestors: anc.map(function (x) { return { info: infos[x.row.i], who: x.role === "mother-from" ? "mother" : "father" }; }) };
        var labels = {}; (data.languages || []).forEach(function (l) { labels[l.key] = l.label; });
        /* where, and when, each person lived: the story's own route for the person asked about; the family's place (or the start of the route) around that person's birth for the rest */
        var bornY = parsed.born != null ? parsed.born : null;
        function yr(x) { return x.year != null ? x.year : (bornY != null && x.age != null ? bornY + x.age : null); }
        var routeStays = route.map(function (x, k) { var y = yr(x), nx = route[k + 1], ny = nx ? yr(nx) : null, to = ny != null ? ny : (k === 0 && parsed.left != null ? parsed.left : (k === route.length - 1 && parsed.endYear != null ? parsed.endYear : y)); return { info: infos[x.row.i], from: y, to: to }; }).filter(function (z) { return z.info; });
        function staysOf(pe) {
          if (pe.role === "self") return routeStays;
          var inf = pe.place && infos[pe.place.row.i], around = bornY != null ? [bornY - 40, bornY + 10] : [null, null];
          if (inf) return [{ info: inf, from: around[0], to: around[1] }];
          return routeStays.length ? [{ info: routeStays[0].info, from: around[0], to: around[1] }] : [];
        }
        var out = r[6].map(function (pe, i) {
          var gr = pe.given && data.given ? S.givenIn(pe.given, data.given, null) : [];
          return { role: pe.role, rel: pe.rel, name: pe.name, given: gr.length ? { canon: gr[0].row.canon, typed: pe.given, groups: givenGroups(gr[0].row, labels) } : (pe.given ? { canon: "", typed: pe.given, groups: [] } : null),
            langs: clerkLanguages(staysOf(pe)), surname: r[5][i], surnameTyped: pe.surname, occupation: pe.occupation || "", counts: pe.counts || null, told: !!pe.told, presumed: !!pe.presumed, me: !!pe.me, sought: !!pe.sought, key: pe.key, ofSubject: !!pe.ofSubject, nameNote: pe.nameNote || "", place: pe.place && infos[pe.place.row.i] ? infos[pe.place.row.i].name : "", label: pe.label || "",
            events: (pe.events || []).map(function (e) { var inf = e.place && infos[e.place.row.i]; if (e.type === "told") return { type: "told", text: e.text }; return { type: e.type, year: e.year, place: inf ? inf.name : (e.place ? e.place.word : e.text ? e.text + " (not among the Atlas's places)" : ""), country: inf ? inf.countryName : "", cause: e.cause || "" }; }) };
        });
        return { facts: facts, plan: buildPlan(facts), mort: r[2], names: { people: out }, people: out, others: parsed.others || [], life: parsed.life || null };
      });
    }
    return { getJSON: getJSON, load: load, resolveMissing: resolveMissing, placeInfo: placeInfo, gather: gather, surname: surname };
  }

  /* The journey: a year slider, play button and captions for who held each place in each year, a still list of what changed, and a
     dashed line with a moving dot on a map. `o.els` = {cap, slider, yearOut, play, moments, time, mapBox}; `o.getMap()` resolves to
     {L, map}, so the page's own map or the home map can host it; `o.pad` is the room to leave round the places (the drawer). */
  /* THE EVENTS ON THE JOURNEY MAP, AS SMALL, SLOW ANIMATIONS. David: «could it show some of the events like war, genocide, pandemic as little animations on the map?». The area of
     each event that covers a place in the story is drawn in a colour for its kind and moves in a way that suits it: a war's edge marches, an epidemic breathes and drifts in
     dots, a famine slowly fades, a genocide or massacre glows slowly and does not move its edge. A war or epidemic with a small area also sends out a soft ring from its centre.
     These are mass deaths, so nothing flashes, shakes or counts: slow, low, and a legend names what is on the map in the year shown. A button hides them all. Under
     «reduce motion» they are still, not gone. Only the events whose area covers a place in the story's years are drawn, as before; nothing is placed that the Atlas does not hold. */
  var EVC = { war: "#b3452e", genocide: "#7b1f1f", epidemic: "#8e3f78", famine: "#a8741a", massacre: "#8a2a2a", atrocity: "#6b2d3a", displacement: "#4f6b7a" };
  var EV_CSS = ".ev-t-war{--c:#b3452e}.ev-t-genocide{--c:#7b1f1f}.ev-t-epidemic{--c:#8e3f78}.ev-t-famine{--c:#a8741a}.ev-t-massacre{--c:#8a2a2a}.ev-t-atrocity{--c:#6b2d3a}.ev-t-displacement{--c:#4f6b7a}" +
    ".ev-pg{transition:fill-opacity .6s ease,stroke-opacity .6s ease}" +
    ".ev-pg.ev-on{animation:evBreath 3.4s ease-in-out infinite}" +
    ".ev-pg.ev-t-war.ev-on{stroke-dasharray:7 6;animation:evBreath 2.6s ease-in-out infinite,evMarch 1.6s linear infinite}" +
    ".ev-pg.ev-t-epidemic.ev-on{stroke-dasharray:1 8;stroke-linecap:round;stroke-width:3;animation:evBreath 3.8s ease-in-out infinite,evMarch 6s linear infinite}" +
    ".ev-pg.ev-t-famine.ev-on{animation:evWilt 6s ease-in-out infinite}" +
    ".ev-pg.ev-t-genocide.ev-on,.ev-pg.ev-t-massacre.ev-on,.ev-pg.ev-t-atrocity.ev-on{animation:evBreath 6s ease-in-out infinite}" +
    ".ev-pg.ev-t-displacement.ev-on{stroke-dasharray:2 9;stroke-linecap:round;animation:evBreath 4s ease-in-out infinite,evMarch 5s linear infinite}" +
    "@keyframes evBreath{0%,100%{fill-opacity:.05}50%{fill-opacity:.24}}@keyframes evWilt{0%{fill-opacity:.26}100%{fill-opacity:.03}}@keyframes evMarch{to{stroke-dashoffset:-28}}" +
    ".ev-rip{display:block;width:0;height:0}.ev-rip b{position:absolute;left:-34px;top:-34px;width:68px;height:68px;border-radius:50%;border:2px solid var(--c);opacity:0;pointer-events:none}" +
    ".ev-rip.ev-halo b:nth-child(2){display:none}.ev-rip.ev-halo.ev-on b{border-width:3px;animation:evHalo 5.5s ease-in-out infinite}@keyframes evHalo{0%,100%{transform:scale(.5);opacity:.3}50%{transform:scale(.85);opacity:.6}}" +
    ".ev-rip.ev-on b{animation:evRip 3.2s ease-out infinite}.ev-rip.ev-on b:nth-child(2){animation-delay:1.6s}@keyframes evRip{0%{transform:scale(.15);opacity:.6}100%{transform:scale(1.7);opacity:0}}" +
    ".ev-leg{position:absolute;left:10px;bottom:24px;z-index:800;max-width:min(80%,440px);display:flex;flex-direction:column;gap:5px;align-items:flex-start;pointer-events:none;font:13px/1.35 system-ui,sans-serif}" +
    ".ev-leg .ev-row{background:rgba(255,255,255,.93);color:#1c2630;border:1px solid rgba(0,0,0,.12);border-left:4px solid var(--c);border-radius:6px;padding:4px 9px;box-shadow:0 1px 4px rgba(0,0,0,.12);animation:evIn .6s ease both}" +
    ".ev-leg .ev-row b{font-weight:700}.ev-leg .ev-row i{font-style:normal;opacity:.75}" +
    ".ev-leg .ev-btn{pointer-events:auto;font:inherit;font-size:12px;padding:2px 9px;border-radius:999px;border:1px solid rgba(0,0,0,.25);background:rgba(255,255,255,.93);color:#1c2630;cursor:pointer}" +
    "@keyframes evIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){.ev-pg.ev-on{animation:none!important;fill-opacity:.14}.ev-rip.ev-on b,.ev-leg .ev-row{animation:none!important}.ev-rip.ev-on b{opacity:.35;transform:scale(.8)}}";
  function ensureEvStyle() {
    if (typeof document === "undefined" || document.getElementById("ev-style")) return;
    var st = document.createElement("style"); st.id = "ev-style"; st.textContent = EV_CSS; document.head.appendChild(st);
  }
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
        d.append(el("div", (prefix || "") + info.name + (ageText ? ", " + ageText : "") + ": add a birth year to see who held the ground, the flag and what was going on.", "lf-caphead"));
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
    function clear() { if (stopPlay) stopPlay(); if (layers) { if (layers.map && layers.tidy) layers.map.off("moveend zoomend", layers.tidy); layers.group.remove(); if (layers.legend) layers.legend.remove(); layers = null; } if (askEl) askEl.hidden = true; }

    /* The stops with a time each: years when the story gives a birth year or dates, else ages, else none. */
    function timeline(f) {
      var route = (f.route && f.route.length ? f.route : [f.from && { info: f.from }, f.to && { info: f.to }].filter(Boolean)).filter(function (x) { return x.info; });
      if (!route.length) return { mode: "none", stops: [] };
      var withYear = route.some(function (x) { return x.year != null; }), withAge = route.some(function (x) { return x.age != null; });
      if (withYear) {
        /* the years the story gave stand; a place with none sits between its neighbours', before the first at the birth (or a generation earlier), after the last a year apiece, and is marked as a guess */
        var ts = route.map(function (x) { return x.year != null ? x.year : null; }), guess = ts.map(function (t) { return t == null; });
        for (var i2 = 0; i2 < ts.length; i2++) {
          if (ts[i2] != null) continue;
          var a2 = i2 - 1; while (a2 >= 0 && ts[a2] == null) a2--;
          var b2 = i2 + 1; while (b2 < ts.length && ts[b2] == null) b2++;
          if (a2 >= 0 && b2 < ts.length) ts[i2] = Math.round(ts[a2] + (ts[b2] - ts[a2]) * (i2 - a2) / (b2 - a2));
          else if (a2 >= 0) ts[i2] = ts[a2] + (i2 - a2);
          else ts[i2] = f.born != null ? f.born : ts[b2] - 25;
        }
        return { mode: "year", stops: route.map(function (x, i) { return { info: x.info, t: ts[i], age: x.age, approx: x.approx || guess[i], guess: guess[i], role: x.role }; }) };
      }
      if (withAge && f.born == null && f.left == null) return { mode: "age", stops: route.filter(function (x) { return x.age != null; }).map(function (x) { return { info: x.info, t: x.age, age: x.age, approx: x.approx, role: x.role }; }) };
      if (f.left != null && route.length) {
        var y0 = f.born != null ? f.born : f.left - 25;
        return { mode: "year", stops: route.length === 1 ? [{ info: route[0].info, t: y0 }] : route.map(function (x, i) { return { info: x.info, t: i === 0 ? y0 : (i === route.length - 1 ? f.left : Math.round(y0 + (f.left - y0) * i / (route.length - 1))), age: x.age, approx: x.approx, role: x.role }; }), left: f.left };
      }
      /* no year and no age told: the places still play, one after another in the order the story gave them, with no year claimed */
      if (route.length > 1) return { mode: "order", stops: route.map(function (x, i) { return { info: x.info, t: i * 6, age: null, role: x.role }; }) };
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

    /* A story about the family told through one relative (\"my father was from Senj. He moved to Botswana...\") has no route of its own: the person it follows
       is a relative, and the relative's places are what should play. The one with the longest journey becomes the route; the others stay as they were. */
    function asTraveller(f) {
      if ((f.route && f.route.length) || f.from || f.to) return f;
      var ks = (f.kin || []).filter(function (k) { return k.stops && k.stops.filter(function (x) { return x.info; }).length > 1; });
      if (!ks.length) return f;
      ks.sort(function (a, b) { return b.stops.length - a.stops.length; });
      var k = ks[0], route = k.stops.filter(function (x) { return x.info; }).map(function (x) { return { info: x.info, age: null, year: x.year != null ? x.year : null, approx: !!x.approx, role: x.role }; });
      return Object.assign({}, f, { route: route, kin: f.kin.filter(function (x) { return x !== k; }) });
    }

    function draw(f, mort, names) {
      clear();
      f = asTraveller(f);
      var tl = timeline(f), stops = tl.stops, anc = (f.ancestors || []).filter(function (x) { return x.info; });
      /* the others in the family who travel too: each pin appears at its year, so the story plays the ancestry first, then the person's own journey */
      var kin = (f.kin || []).map(function (k) { return { name: k.name, label: k.label, stops: k.stops.filter(function (x) { return x.info; }) }; }).filter(function (k) { return k.stops.length; }), kinMarks = [];
      var legs = [], stopMarks = [], mortPgs = [], curT = null, legKey = "", evShow = true;
      try { evShow = sessionStorage.getItem("ra-journey-events") !== "0"; } catch (e) { evShow = true; }
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
        t0 = stops[0].t; t1 = stops[stops.length - 1].t + (tl.mode === "age" ? 4 : tl.mode === "order" ? 3 : 10);
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

      /* each event's area moves while the year shown is inside its years; the legend names those, at most three, newest to oldest as the years run */
      function paintEvents(t) {
        var act = [];
        mortPgs.forEach(function (m) {
          var on = t != null && t >= m.f && t <= m.t, show = on && evShow;
          var p = m.pg.getElement && m.pg.getElement(), r = m.rip && m.rip.getElement && m.rip.getElement();
          if (p && p.classList) p.classList.toggle("ev-on", show);
          if (r && r.classList) r.classList.toggle("ev-on", show);
          m.pg.setStyle({ opacity: show ? .8 : (evShow ? .2 : 0), fillOpacity: show ? .08 : 0 });
          if (show) act.push(m);
        });
        if (!layers || !layers.legend) return;
        var key = evShow + "|" + act.map(function (m) { return m.ev.id || m.ev.n; }).join(",");
        if (key === legKey) return; legKey = key;
        var lg = layers.legend; lg.textContent = "";
        if (!mortPgs.length) return;
        act.slice(0, 3).forEach(function (m) {
          var row = el("div", null, "ev-row ev-t-" + m.ev.ty);
          row.append(el("b", m.ev.f + (m.ev.t !== m.ev.f ? "\u2013" + m.ev.t : "") + " "), document.createTextNode(typeLabel(m.ev.ty) + " \u00b7 "), el("i", m.ev.n));
          lg.append(row);
        });
        var btn = el("button", evShow ? "Hide events" : "Show events", "ev-btn"); btn.type = "button";
        btn.setAttribute("aria-pressed", evShow ? "true" : "false");
        btn.addEventListener("click", function () { evShow = !evShow; try { sessionStorage.setItem("ra-journey-events", evShow ? "1" : "0"); } catch (e) { /* the choice lasts this page */ } legKey = ""; paintEvents(curT); });
        lg.append(btn);
      }

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
          E.cap.append(line(cur.info, ye, evMap.get(cur.info), at.moving ? "On the way from " : "", tl.mode === "age" ? "age " + t : (cur.guess ? "year not told, placed between the years that were" : f.born != null ? "age " + (t - f.born) : "")));
          if (at.moving && stops[at.idx + 1]) E.cap.append(el("div", "…to " + stops[at.idx + 1].info.name + (stops[at.idx + 1].age != null ? " (" + ageWord(stops[at.idx + 1]) + ")" : ""), "lf-filed"));
        }
        anc.forEach(function (x) { E.cap.append(line(x.info, tl.mode === "year" ? t : null, evMap.get(x.info), "His " + x.who + "'s family, ", "")); });
        if (E.slider) E.slider.value = String(t);
        if (E.yearOut) E.yearOut.textContent = tl.mode === "age" ? "age " + t : tl.mode === "order" ? (stops.length ? "Stop " + (at.idx + 1) + " of " + stops.length : "") : String(t);
        if (E.slider) E.slider.setAttribute("aria-valuetext", (tl.mode === "age" ? "age " : "") + (tl.mode === "order" ? "stop " + (at.idx + 1) + " of " + stops.length : t) + (cur ? ". " + (at.moving ? "On the way" : "At " + cur.info.name) : ""));
        legs.forEach(function (lg) {
          var kk = Math.min(1, Math.max(0, (t - lg.t0) / Math.max(1, lg.t1 - lg.t0))), pt = between(lg.a, lg.b, kk), on = t >= lg.t0;
          lg.dot.setLatLng(pt); lg.dot.setStyle({ opacity: on ? 1 : 0, fillOpacity: on ? 1 : 0 }); lg.line.setStyle({ opacity: on ? .55 : .12 });
        });
        stopMarks.forEach(function (m) { var on = m.t == null || t >= m.t, tp = m.ly.getTooltip(); m.ly.setStyle({ opacity: on ? 1 : .3, fillOpacity: on ? 1 : .3 }); if (tp && tp.setOpacity) tp.setOpacity(on ? 1 : .35); });
        curT = t; paintEvents(t);
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
            var from = Number(E.slider.value) >= t1 ? t0 : Number(E.slider.value), ts0 = null, span = (t1 - from) * (tl.mode === "age" ? 260 : tl.mode === "order" ? 280 : 450);
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
        /* «nearby» and «in the wider world» read side by side, two columns, and stack on a phone */
        var duo = el("div", null, "lf-duo"), colA = el("div", null, "lf-col"), colB = el("div", null, "lf-col");
        if (evl.length) {
          colA.append(el("h4", "What was going on: epidemics, famines, wars and mass deaths nearby"));
          var ue = el("ul", null, "lf-events");
          evl.slice(0, 8).forEach(function (x) {
            var li = el("li", null, "lf-ev lf-ev-" + x.e.ty), t = x.e.toll && x.e.toll.text ? " " + short(x.e.toll.text, 160) : "";
            li.append(el("b", x.e.f + (x.e.t !== x.e.f ? "–" + x.e.t : "") + " "), el("span", typeLabel(x.e.ty), "lf-tag"), document.createTextNode(" " + x.e.n + " (near " + x.where + "). " + short(x.e.says, 200) + t));
            if (x.e.open) li.append(el("div", "Disputed: " + short(x.e.open, 160), "lf-filed"));
            ue.append(li);
          });
          colA.append(ue);
        }
        /* An event that has no area (the Second World War, a pandemic) belongs to every place and so to none on a map: it is said once, for the years of the story. */
        var wide = ((mort && mort.events) || []).filter(function (e) { return e.g && e.f <= t1 && e.t >= t0 && !seen[e.id]; });
        if (wide.length) {
          colB.append(el("h4", "In the wider world in those years"));
          var uw = el("ul", null, "lf-events");
          wide.slice(0, 4).forEach(function (e) {
            var li = el("li", null, "lf-ev lf-ev-" + e.ty);
            li.append(el("b", e.f + (e.t !== e.f ? "\u2013" + e.t : "") + " "), el("span", typeLabel(e.ty), "lf-tag"), document.createTextNode(" " + e.n + ". " + short(e.says, 200) + (e.toll && e.toll.text ? " " + short(e.toll.text, 160) : "")));
            uw.append(li);
          });
          colB.append(uw);
        }
        if (colA.childNodes.length) duo.append(colA); if (colB.childNodes.length) duo.append(colB);
        if (duo.childNodes.length) { if (duo.childNodes.length === 1) duo.className = "lf-duo lf-duo-one"; E.moments.append(duo); }
        var seenCc = Object.create(null);
        stops.concat(anc).forEach(function (st) {
          var info = st.info; if (!info.leaders || seenCc[info.cc]) return; seenCc[info.cc] = 1;
          var ls = leadersBetween(info.leaders, t0, t1).slice(0, 8);
          if (!ls.length) { E.moments.append(el("p", "The Atlas names no head of state of today's " + info.countryName + " for those years: that is silence in Wikidata, not a country without one.", "lf-filed")); return; }
          E.moments.append(el("h4", "Leaders of today's " + info.countryName + " in those years"));
          var ul2 = el("ul"); ls.forEach(function (r) { var li = el("li"); li.append(el("b", r[2] + (r[3] == null ? " on " : "–" + r[3] + " ")), r[0]); ul2.append(li); });
          E.moments.append(ul2);
        });
        if (items.length || evl.length || wide.length) E.moments.append(el("p", "This is the setting, not a fact about them: the events are those whose area covers the place in those years, and the leaders are those of the country as it is drawn today.", "cap"));
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
        ensureEvStyle();
        if (E.mapBox && E.mapBox.appendChild) { var lgEl = el("div", null, "ev-leg"); lgEl.setAttribute("aria-hidden", "true"); layers.legend = lgEl; E.mapBox.appendChild(lgEl); if (L.DomEvent) L.DomEvent.disableClickPropagation(lgEl); }
        /* the mass-mortality events (epidemics, famines, wars, genocides) of the countries in the story, as black outlines, and only those of the
           years the story gives: a story with no year draws none, and says so */
        var yrs = [];
        stops.forEach(function (st) { if (tl.mode === "year" && st.t != null) yrs.push(st.t); });
        kin.forEach(function (k) { k.stops.forEach(function (st) { if (st.year != null) yrs.push(st.year); }); });
        if (f.born != null) yrs.push(f.born); if (f.endYear != null) yrs.push(f.endYear);
        if (mort && mort.events && yrs.length) {
          var y0 = Math.min.apply(null, yrs), y1 = Math.max.apply(null, yrs), pts = [], seenEv = Object.create(null);
          /* the years the map PLAYS, not only the years the story names: the list under the map («What was going on») already reads from the start of the timeline to its end, and the map must show the same events */
          if (can && t0 != null && t1 != null && tl.mode === "year") { y0 = Math.min(y0, t0); y1 = Math.max(y1, t1); }
          function addPt(i) { if (i && i.lat != null) pts.push(i); }
          stops.concat(anc).forEach(function (st) { addPt(st.info); });
          kin.forEach(function (k) { k.stops.forEach(function (st) { addPt(st.info); }); });
          /* an event is shown when its area covers one of the story's places, in the story's years: not every event of the country */
          pts.forEach(function (i) {
            S.eventsAt(mort.events, i.lat, i.lon, (y0 + y1) / 2, (y1 - y0) / 2).forEach(function (ev) {
              if (seenEv[ev.id || ev.n] || !ev.poly || !ev.poly.length) return; seenEv[ev.id || ev.n] = 1;
              var evc = EVC[ev.ty] || "#444444";
              var pg = L.polygon(ev.poly, { className: "ev-pg ev-t-" + ev.ty, color: evc, weight: 1.6, opacity: .2, fillColor: evc, fillOpacity: 0, dashArray: "3 5" }).addTo(g);
              pg.bindTooltip(ev.f + (ev.t !== ev.f ? "\u2013" + ev.t : "") + " " + typeLabel(ev.ty) + ": " + ev.n + " (covers " + i.name + ")", { sticky: true, className: "lf-mort-tip" });
              if (pg.bringToBack) pg.bringToBack();
              /* a marker at the centre only where the area is small enough for a centre to mean a place (a siege, a bombing, a camp), never for a country or a continent: a ring that spreads for a war or an epidemic, one slow halo that does not spread for a genocide, massacre or atrocity. It keeps its size at any zoom, so a small area is still seen on a map framed on a whole journey. */
              var rip = null, bb = pg.getBounds && pg.getBounds();
              if (ev.at && ev.at.length === 2 && (ev.ty === "war" || ev.ty === "epidemic" || ev.ty === "genocide" || ev.ty === "massacre" || ev.ty === "atrocity") && bb && (bb.getNorth() - bb.getSouth()) < 12 && (bb.getEast() - bb.getWest()) < 20)
                rip = L.marker(ev.at, { interactive: false, keyboard: false, icon: L.divIcon({ className: "ev-rip ev-t-" + ev.ty + (ev.ty === "war" || ev.ty === "epidemic" ? "" : " ev-halo"), iconSize: [0, 0], html: "<b></b><b></b>" }) }).addTo(g);
              mortPgs.push({ pg: pg, f: ev.f, t: ev.t, ev: ev, rip: rip });
            });
          });
          if (can) setT(Number(E.slider.value)); else paintEvents(null);
        } else if (mort && mort.events) E.moments.append(el("p", "Give a year, even a rough one, and the mass-mortality events of those years in these countries are drawn here as black outlines.", "lf-filed"));
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
      /* one plain line per source: the name, then «kind · access» in small grey, then (if we know one) an envelope to write to it. David: «reduce space waste, align
         font sizes/colours, add the email add here if we know them». */
      function mailSvg() {
        var NS = "http://www.w3.org/2000/svg", v = document.createElementNS(NS, "svg"), r = document.createElementNS(NS, "rect"), pa = document.createElementNS(NS, "path");
        [["viewBox", "0 0 20 20"], ["width", "15"], ["height", "15"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.5"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"]].forEach(function (x) { v.setAttribute(x[0], x[1]); });
        [["x", "2.5"], ["y", "4.5"], ["width", "15"], ["height", "11"], ["rx", "1.8"]].forEach(function (x) { r.setAttribute(x[0], x[1]); }); pa.setAttribute("d", "M3.2 6.2L10 11l6.8-4.8");
        v.append(r, pa); return v;
      }
      var MAIL_WHY = { answered: "It has answered a letter from our research.", delivered: "A letter was delivered here; no reply is recorded.", listed: "Listed by the institution itself.", unverified: "Found in a third-party listing: confirm it on the institution's own page first.", wikidata: "From the institution's Wikidata entry." };
      function mailLink(p) {
        var em = p && p.em; if (!em || !em.length) return null;
        var a = el("a", null, "lf-mail lf-mail-" + em[0][1]), tip = "Write to " + p.name + ": " + em.map(function (x) { return x[0] + (x[2] ? " (" + x[2] + ")" : ""); }).join(" \u00b7 ") + ". " + (MAIL_WHY[em[0][1]] || "");
        a.href = "mailto:" + em[0][0]; a.title = tip; a.setAttribute("aria-label", tip); a.append(mailSvg()); return a;
      }
      /* the pencil beside the envelope: a letter to this institution, drafted on My research from a plain template, kept there, never sent from here */
      function penLink(p) {
        if (!p || !p.id || !p.em || !p.em.length) return null;
        var NS = "http://www.w3.org/2000/svg", v = document.createElementNS(NS, "svg"), a = el("a", null, "lf-mail lf-pen"), tip = "Draft a letter to " + p.name + ". It is kept in My research; nothing is sent from the Atlas.";
        [["viewBox", "0 0 20 20"], ["width", "15"], ["height", "15"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.5"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"]].forEach(function (x) { v.setAttribute(x[0], x[1]); });
        ["M13.5 3.8l2.7 2.7L7 15.7l-3.6.9.9-3.6z", "M12 5.3l2.7 2.7"].forEach(function (d) { var pa = document.createElementNS(NS, "path"); pa.setAttribute("d", d); v.append(pa); });
        a.href = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/") + "my-research/?errand=" + encodeURIComponent(p.id) + "#mr-errands";
        a.title = tip; a.setAttribute("aria-label", tip); a.append(v); return a;
      }
      function srcLine(p, extra) {
        var li = el("li", null, "lf-src"), a = el("a", p.name); a.href = p.url; a.rel = "noopener"; li.append(a);
        var meta = [String(p.kind || "").replace(/-/g, " "), p.access && p.access !== "unsurveyed" ? p.access : ""].filter(Boolean).join(" \u00b7 ");
        if (extra || meta) li.append(el("span", extra || meta, "lf-filed"));
        var m = mailLink(p); if (m) li.append(m); var pn = penLink(p); if (pn) li.append(pn);
        return li;
      }
      function volumeList(info, kinds, win, cap) {
        var any = false, wrap = el("div");
        KINDS.forEach(function (k) {
          if (kinds.indexOf(k[0]) < 0) return;
          var vs = volumesFor(info.cols, k[0], win); if (!vs.length) return;
          any = true; wrap.append(el("h5", k[1]));
          var ul = el("ul", null, "lf-vols lf-srcs");
          vs.slice(0, cap || 4).forEach(function (c) {
            var li = el("li", null, "lf-src"), a = el("a", volLabel(c)); a.href = info.href; li.append(a); if (c.held || c.access) li.append(el("span", [c.held ? "held by " + c.held : "", c.access || ""].filter(Boolean).join(" \u00b7 "), "lf-filed")); ul.append(li);
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
          var ul = el("ul", null, "lf-vols lf-srcs"); vols.forEach(function (v) { var li = el("li", null, "lf-src"), a = el("a", v.t); a.href = v.url; a.rel = "noopener"; li.append(a); ul.append(li); items.push({ vol: v, href: v.url }); }); wrap.append(ul);
        }
        if (cols.length) {
          any = true; wrap.append(el("h5", "FamilySearch collections that cover " + info.name));
          var u2 = el("ul", null, "lf-vols lf-srcs"); cols.forEach(function (c) { var li = el("li"), a = el("a", c.t); a.href = c.url; a.rel = "noopener"; li.className = "lf-src"; li.append(a, el("span", c.from + "–" + c.to + (c.n ? " \u00b7 " + c.n.toLocaleString("en") + " records" : ""), "lf-filed")); u2.append(li); }); wrap.append(u2);
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
        var ul = el("ul", null, "lf-vols lf-srcs"); ws.forEach(function (x) { ul.append(srcLine(x)); items.push({ src: x, href: x.url }); }); wrap.append(ul);
        return wrap;
      }
      var srcSeen = Object.create(null);
      function sources(info) {
        var ps = info.provs || [], wrap = el("div");
        if (ps.length && srcSeen[info.cc]) { wrap.append(el("p", "The archives and sources for " + (info.countryName || info.name) + " are listed under " + srcSeen[info.cc] + ".", "lf-filed")); return wrap; }
        if (ps.length) srcSeen[info.cc] = info.name;
        if (!ps.length) { wrap.append(el("p", "The source catalogue lists nothing yet for " + (info.countryName || info.name) + ". Look for its national archive and the state or county records directly: that is a gap in the Atlas, not proof nothing exists.", "lf-filed")); return wrap; }
        wrap.append(el("h5", "Archives and sources for " + (info.countryName || info.name)));
        var ul = el("ul", null, "lf-vols lf-srcs");
        ps.slice(0, 6).forEach(function (p) { ul.append(srcLine(p)); items.push({ src: p, href: p.url }); });
        if (ps.length > 6) { var li2 = el("li"), a2 = el("a", "and " + (ps.length - 6) + " more in the source catalogue"); a2.href = base + "providers/"; li2.append(a2); ul.append(li2); }
        wrap.append(ul); return wrap;
      }
      /* The place over the whole of its history, as a place search shows it: every era with its flag and who held the ground, the one they were
         there in marked, then the epidemics, famines, wars and mass deaths whose area covers the place. Shown on every card, dated or not. */
      function ground(info, years, span, ends) {
        var wrap = el("div", null, "lf-ground"), eras = info.eras || [];
        if (eras.length) {
          wrap.append(el("h5", (eras.length && years.length ? "Who held this ground while they were there" : "Who held this ground, era by era")));
          var ul = el("ul", null, "lf-eras"), now = new Date().getFullYear(), hiddenN = 0;
          /* ONLY THE ERAS THEY WERE THERE FOR. David: «he was born 1951 and left in 1954, no need to show a 1200-1469 era». The stay runs from the first year told here to the year
             the next place begins (the year they left); with no year told, every era is shown, as before, and the rest can always be opened. */
          var lo = null, hi = null;
          if (years.length) {
            lo = Math.min.apply(null, years); hi = Math.max.apply(null, years);
            if (f.left != null && f.left >= lo && f.left - lo < 80 && f.route && f.route[0] && f.route[0].info && f.route[0].info.name === info.name && f.route[0].info.cc === info.cc) hi = Math.max(hi, f.left);
            if (ends && ends.length) hi = Math.max(hi, Math.max.apply(null, ends));   /* a stay with its own end year (the place they came from) ends there, not at the next place in the order told */
            else (f.route || []).forEach(function (r, i, all) { if (r.info === info || (r.info && r.info.name === info.name && r.info.cc === info.cc)) { var nx = all.slice(i + 1).filter(function (z) { return yearOf(z) != null; })[0], ny = nx ? yearOf(nx) : null; if (ny != null && ny > hi && ny - hi < 80) hi = ny; } });
          }
          eras.forEach(function (e) {
            var li = el("li", null, years.some(function (y) { return y >= e.from && y < e.to; }) ? "on" : ""), fl = flagFor(info, e.from);
            if (lo != null && !(e.to > lo && e.from <= hi)) { li.hidden = true; li.setAttribute("data-extra", "1"); hiddenN++; }
            /* the flag and the name of the era go to that era on the country's flag page (its entries are anchored by the year their flag begins); the years open the History theatre at that year */
            var fr = info.flagRows ? info.flagRows.filter(function (r) { return e.from >= r[0] && (r[1] == null || e.from < r[1]); }).sort(function (a, b) { return b[0] - a[0]; })[0] : null;
            var fhref = info.flagSlug ? base + "flags/" + info.flagSlug + "/" + (fr ? "#era-" + fr[0] : "") : "";
            if (fl) {
              var im = el("img", null, "lf-flag"); im.src = base + "fl/" + encodeURIComponent(fl) + ".svg"; im.alt = ""; im.title = "From the flag history of today's " + info.countryName + " in " + e.from;
              if (fhref) { var fa = el("a", null, "lf-flag-link"); fa.href = fhref; fa.title = "This flag, and who held the ground under it, on the flags page of " + info.countryName; fa.setAttribute("aria-label", "The flag of " + e.polity + " on the flags page"); fa.append(im); li.append(fa); }
              else li.append(im);
            }
            var rg = info.regimes && info.regimes[e.regime];
            var yb = el("b", null), ya = el(e.from >= 600 ? "a" : "span", e.from + "\u2013" + (e.to >= now ? "now" : e.to)); if (e.from >= 600) { ya.href = base + "history/?y=" + e.from; ya.title = "See what was happening in " + e.from + ", in the History theatre"; } yb.append(ya, " ");   /* the History theatre starts in 600 */
            var pn = e.polity + (rg && rg.label && rg.label !== e.polity ? " (" + rg.label + ")" : "");
            li.append(yb);
            if (fhref) { var pa = el("a", pn, "lf-era-link"); pa.href = fhref; pa.title = "More about this era and its flag, on the flags page of " + info.countryName; li.append(pa); } else li.append(document.createTextNode(pn));
            ul.append(li);
          });
          wrap.append(ul);
          if (hiddenN) {
            var more = el("button", "Show the other " + hiddenN + " era" + (hiddenN === 1 ? "" : "s") + " of " + info.name, "lf-eras-more"); more.type = "button"; more.setAttribute("aria-expanded", "false");
            more.addEventListener("click", function () { var open = more.getAttribute("aria-expanded") === "true"; [].forEach.call(ul.querySelectorAll("li[data-extra]"), function (x) { x.hidden = open; }); more.setAttribute("aria-expanded", open ? "false" : "true"); more.textContent = open ? "Show the other " + hiddenN + " era" + (hiddenN === 1 ? "" : "s") + " of " + info.name : "Show only the years they were there"; });
            wrap.append(more);
          }
        } else wrap.append(el("p", "The Atlas has no era table for this area, so there is no era-by-era list here: it is " + (info.countryName || "today's country") + " as it is now.", "lf-filed"));
        /* only the years the people there could have lived through (a war of 306 is no part of a life that began in 1874) */
        var evs = mort && info.lat != null ? (span ? S.eventsAt(mort.events, info.lat, info.lon, (span[0] + span[1]) / 2, (span[1] - span[0]) / 2) : S.eventsAt(mort.events, info.lat, info.lon, 1500, 1500)) : [];
        if (!evs.length && span && mort && info.lat != null) wrap.append(el("p", "The Atlas lists no mass-mortality event covering this area in " + span[0] + "\u2013" + span[1] + ".", "lf-filed"));
        if (evs.length) {
          wrap.append(el("h5", "Mass mortality whose area covers " + info.name + (span ? ", " + span[0] + "\u2013" + span[1] : "")));
          var ue = el("ul", null, "lf-eras lf-mort");
          evs.slice(0, 8).forEach(function (e) { var li = el("li", null, "lf-now-" + e.ty), yb = el("b", null), hist = e.f >= 600, ya = el(hist ? "a" : "span", e.f + (e.t !== e.f ? "\u2013" + e.t : "")); yb.append(ya, " "); li.append(yb);
            if (hist) { ya.href = base + "history/?y=" + e.f; ya.title = "See it on the map, from " + e.f + ", in the History theatre"; var ea = el("a", typeLabel(e.ty) + ": " + e.n, "lf-era-link"); ea.href = base + "history/?y=" + e.f; ea.title = "See where and when it happened, in the History theatre"; li.append(ea); }
            else li.append(document.createTextNode(typeLabel(e.ty) + ": " + e.n));
            ue.append(li); });
          if (evs.length > 8) ue.append(el("li", "and " + (evs.length - 8) + " more on the place page", "lf-filed"));
          wrap.append(ue);
        }
        return wrap;
      }
      /* One card per place. A father and a mother born in the same village, or three relatives from one town, are one place with several people
         in it: the card names each of them, and the sources, the ground and the nearby books are told once. A place the person's own route
         comes back to stays a card of its own for each visit. */
      var groups = [], byKey = Object.create(null);
      function put(info, e, own) {
        var key = info.row ? info.row.i : info.name + "|" + info.cc, g = byKey[key];
        if (g && !own) { g.es.push(e); return; }
        g = { info: info, es: [e] }; groups.push(g); if (!byKey[key]) byKey[key] = g;
      }
      /* The years a person there could have lived through: a birth year opens a life (their parents' time before it, 70 years after), anything
         else a few years either side. Not told: their own life from the birth year in the story, or no limit at all. */
      function spanOf(y, role, wide) {
        if (y == null) return f.born != null ? [f.born, f.born + 80] : null;
        if (wide) return [y - 40, y + 40];
        return role === "born" ? [y - 10, y + 70] : [y - 5, y + 15];
      }
      /* Places the Atlas does hold books for, close to a place it holds none for */
      function nearList(info, kinds) {
        var ns = info.near || []; if (!ns.length || !kinds.length) return null;
        var wrap = el("div"); wrap.append(el("h5", "Nearby places the Atlas does hold books for"));
        wrap.append(el("p", "A village's records are often kept in a neighbouring parish or town. These are leads, not findings: open one and check which places its book covers.", "lf-filed"));
        var ul = el("ul", null, "lf-vols");
        ns.forEach(function (x) { var li = el("li"), a = el("a", x.n); a.href = base + "place/" + encodeURIComponent(x.i) + "/"; li.append(a, el("span", " " + x.km + " km; " + x.c + " volume" + (x.c === 1 ? "" : "s"), "lf-filed")); ul.append(li); items.push({ href: a.href }); });
        wrap.append(ul); return wrap;
      }
      /* What the place page holds, in one strip under the name: the other names it was filed under (with their years where the catalogue has them),
         and plain links to the place page, the country, its flags and the region. Nothing here is a finding: names are search terms. */
      function placeStrip(info) {
        var box = el("div", null, "lf-strip"), seen = Object.create(null), names = [];
        seen[S.fold(info.name)] = 1;
        (info.named || []).forEach(function (n) {
          var k = S.fold(n.n); if (!k || seen[k]) return; seen[k] = 1;
          var yrs = n.f != null || n.t != null ? (n.f != null ? n.f : "") + "\u2013" + (n.t != null ? n.t : "") : "";
          names.push({ n: n.n, note: [yrs, n.k === "exonym" ? "another language" : n.k === "official" ? "official" : n.k === "colonial" ? "colonial" : n.k === "historic" ? "historic" : ""].filter(Boolean).join(", "), s: n.s });
        });
        (info.older || []).forEach(function (n) { var k = S.fold(n); if (!k || seen[k]) return; seen[k] = 1; names.push({ n: n, note: "older name" }); });
        if (names.length) {
          var p = el("p", null, "lf-also"); p.append(el("b", "Also known as "));
          names.slice(0, 8).forEach(function (x, i) {
            if (i) p.append(document.createTextNode(" \u00b7 "));
            if (x.s) { var a = el("a", x.n); a.href = x.s; a.rel = "noopener"; p.append(a); } else p.append(el("em", x.n));
            if (x.note) p.append(document.createTextNode(" (" + x.note + ")"));
          });
          if (names.length > 8) p.append(document.createTextNode(" and " + (names.length - 8) + " more on the place page"));
          p.append(el("span", " A record is filed under the name of its year: search each.", "lf-filed"));
          box.append(p);
        }
        var links = el("p", null, "lf-links");
        function link(text, href) { var a = el("a", text); a.href = href; links.append(a); }
        link(info.row && info.row.gaz ? "Find " + info.name + " on the map" : "The place page", info.href);
        if (info.cc && !(info.row && info.row.gaz)) link(info.countryName || info.cc, base + "country/" + String(info.cc).toLowerCase() + "/");
        if (info.flagSlug) link("Flags of " + (info.countryName || info.cc), base + "flags/" + info.flagSlug + "/");
        if (info.region && info.region.id) link(String(info.region.label || "The region").split(" \u2014 ")[0], base + "region/" + encodeURIComponent(info.region.id) + "/");
        if (info.named && info.named.length) link("Names by date", base + "place-names/");
        box.append(links);
        return box;
      }
      function renderGroup(g) {
        var info = g.info, es = g.es, kicks = [], whens = [], years = [], ends = [], look = [], kinds = [], win = null, span = null, unbounded = false, withSources = false;
        n++;
        es.forEach(function (e) {
          if (kicks.indexOf(e.kicker) < 0) kicks.push(e.kicker);
          if (e.whenText && whens.indexOf(e.whenText) < 0) whens.push(e.whenText);
          if (e.year != null) years.push(e.year);
          if (e.end != null) ends.push(e.end);
          e.look.forEach(function (x) { if (look.indexOf(x) < 0) look.push(x); });
          e.kinds.forEach(function (k) { if (kinds.indexOf(k) < 0) kinds.push(k); });
          if (e.win) win = win ? [Math.min(win[0], e.win[0]), Math.max(win[1], e.win[1])] : e.win.slice();
          if (e.span) span = span ? [Math.min(span[0], e.span[0]), Math.max(span[1], e.span[1])] : e.span.slice(); else unbounded = true;
          if (e.withSources) withSources = true;
        });
        if (unbounded) span = null;
        var sec = el("section", null, "lf-stop"), hd = el("header", null, "lf-stop-h");
        hd.append(el("span", String(n), "lf-stop-n"));
        var tt = el("div"); tt.append(el("div", kicks.join("; "), "lf-stop-k"), el("h3", info.name)); var sub = [info.countryName, whens.join(", ")].filter(Boolean).join(" \u00b7 "); if (sub) tt.append(el("div", sub, "lf-stop-s"));
        hd.append(tt); sec.append(hd);
        sec.append(placeStrip(info));
        var grid = el("div", null, "lf-stop-grid"), then = el("div", null, "lf-stop-then"), where = el("div", null, "lf-stop-where");
        then.append(el("h4", "Who held the ground"));
        if (!years.length) {
          var nowFlag = flagFor(info, new Date().getFullYear());
          if (nowFlag) { var fr = el("div", null, "lf-capline"), fi = el("img", null, "lf-flag"); fi.src = base + "fl/" + encodeURIComponent(nowFlag) + ".svg"; fi.alt = ""; fi.width = 36; fi.height = 24; fi.loading = "lazy"; fr.append(fi, el("div", "Today's flag of " + info.countryName + ". Give a year, even a rough one, and the flag and ruler of that time are shown.", "lf-caphead")); then.append(fr); }
          else then.append(el("p", "Give a year, even a rough one, and the one that applies is marked below.", "lf-filed"));
        }
        else es.forEach(function (e) { if (e.year != null) then.append(line(info, e.year, evHere(mort, info, e.year - 5, e.year + 5), e.prefix || "", e.ageText || "")); });
        then.append(ground(info, years, span, ends));
        where.append(el("h4", "Where to search"));
        var ul = el("ul", null, "lf-look"); look.forEach(function (x) { ul.append(el("li", x)); }); where.append(ul);
        var fl = fsList(info, kinds, win); if (fl) where.append(fl);
        var vl = volumeList(info, kinds, win); if (vl) where.append(vl); else if (kinds.length) { where.append(el("p", "The Atlas lists no " + (kinds.length > 1 ? "birth, baptism or marriage" : kinds[0] === "b" ? "birth or baptism" : kinds[0] === "m" ? "marriage" : "burial") + " volume for " + info.name + (win ? " in those years" : "") + ". That is a gap in the Atlas, not proof the records do not exist.", "lf-filed")); var nl = nearList(info, kinds); if (nl) where.append(nl); }
        if (withSources) where.append(sources(info));
        var wl = worldList(info); if (wl) where.append(wl);
        var pl = el("p"), pa = el("a", "Every volume the Atlas lists for " + info.name + " \u2192"); pa.href = info.href; pl.append(pa); where.append(pl);
        grid.append(then, where); sec.append(grid);
        var fp = fullPanel(info); if (fp) sec.append(fp);
        box.append(sec);
      }
      var w = windows(f.left, f.born);
      /* the years they were at this stop, when both ends are told: arrival (or birth) to the year the next place begins. A little either side, never the whole life. */
      function stay(y, i) {
        if (y == null) return null;
        if (!route[i + 1]) return i === 0 && f.left != null && f.left >= y && f.left - y < 80 ? [y - 1, f.left + 1] : null;
        var ny = yearOf(route[i + 1]); if (ny == null || ny < y || ny - y > 80) return null;
        return [y - 1, ny + 1];
      }
      route.forEach(function (x, i) {
        var info = x.info, first = i === 0, last = i === route.length - 1 && route.length > 1, y = yearOf(x), look = [], kinds = [], win = null;
        /* THE PLACE THEY CAME FROM, FROM THE BIRTH YEAR TO THE YEAR THEY LEFT. David: «croatia he left when he was 3, but we don't see who held the ground at the time he was born until
           the time he leaves.» A place the story says they came from, with a birth year told, is held from that year until the earliest year they are known to be somewhere else. The
           story does not say they were born there, so the card says «from birth» only as the years it is read over, never as a birthplace. */
        var fromBirth = false, endYear = null;
        if (x.role === "origin" && y == null && f.born != null) {
          route.forEach(function (o, j) { if (j === i) return; var oy = yearOf(o); if (oy != null && oy >= f.born && oy - f.born < 80 && (endYear == null || oy < endYear)) endYear = oy; });
          y = f.born; fromBirth = true;
        }
        var kicker = first ? (x.role === "born" ? "Born here" : "Where it starts") : x.role === "origin" ? "Where it starts" : last ? "Where they arrived" : "On the way";
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
        put(info, { kicker: kicker + (tags ? " · " + tags : ""), whenText: fromBirth ? "from birth, " + y + (endYear != null ? ", until " + endYear : "") : when(x, y), year: y, end: endYear, ageText: x.age != null ? (x.approx ? "about age " : "age ") + x.age : "", look: look, kinds: kinds, win: win, withSources: true, prefix: "", span: (fromBirth && endYear != null ? [y - 1, endYear + 1] : null) || stay(y, i) || spanOf(y, x.role) }, true);
      });
      (f.kin || []).forEach(function (k) {
        var who = ((k.label ? k.label + " " : "") + (k.name || "")).trim() || "Family";
        k.stops.forEach(function (st) {
          if (!st.info) return;
          var y = st.year, born = st.role === "born", look = [born ? "Look for the baptism or birth entry of " + (k.name || "this person") + ": it names the parents, and the godparents are often relatives." : "Look for where " + (k.name || "this person") + " lived here: a census or population register and the parish records."];
          put(st.info, { kicker: who + (born ? " · born here" : st.role === "origin" ? " · from here" : st.role === "married" ? " · married here" : st.role === "mention" ? "" : " · lived here"), whenText: y != null ? String(y) : "", year: y, ageText: "", look: look, kinds: born ? ["b"] : [], win: born && y != null ? [y - 1, y + 1] : null, withSources: true, prefix: who + ", ", span: spanOf(y, st.role) });
        });
      });
      anc.forEach(function (x) {
        var info = x.info, y = f.born != null ? f.born : null;
        put(info, { kicker: "His " + x.who + "'s family", whenText: "", year: y, ageText: "", look: ["Look for the generation before: the parents' marriage and the " + x.who + "'s baptism in the parish registers of " + info.name + ", and the same surname written other ways."], kinds: ["b", "m"], win: f.born != null ? [f.born - 70, f.born - 10] : null, withSources: false, prefix: "His " + x.who + "'s family, ", span: spanOf(y, "", true) });
      });
      groups.forEach(renderGroup);
      return box;
    }
    return { draw: draw, clear: clear, stops: stopsBlock };
  }

  /* How one person's first name and surname were written: the catalogue's forms, with leads kept apart. Null when it holds nothing. */
  function personNames(g, sn, base, langs) {
    var box = el("div", null, "lf-pnames"), any = false;
    if (g && g.groups && g.groups.length) {
      any = true;
      box.append(el("h4", "First name: " + g.typed + " is also written"));
      /* the languages a clerk would have used where and when this person lived come first; the rest are kept, folded away, because a clerk can surprise */
      var want = langs && langs.keys, main = g.groups, rest = [];
      if (want) { main = g.groups.filter(function (x) { return want[x.lang]; }); rest = g.groups.filter(function (x) { return !want[x.lang]; }); if (!main.length) { main = g.groups; rest = []; } }
      if (want && rest.length) {
        var lab = {}; g.groups.forEach(function (x) { lab[x.lang] = x.label; });
        var parts = langs.notes.map(function (n) { return n.langs.map(function (l) { return lab[l] || l.charAt(0).toUpperCase() + l.slice(1); }).join(", ") + " (" + n.place + (n.from != null ? ", " + (n.to != null && n.to !== n.from ? n.from + "\u2013" + n.to : n.from) : "") + ")"; });
        box.append(el("p", "What the clerks wrote where and when they lived: " + parts.join(" \u00b7 "), "lf-filed lf-lang-why"));
      }
      function listFor(groups, withLeads) {
        var ul = el("ul", null, "lf-forms lf-forms-cols"), shown = Object.create(null), leads = [];
        groups.forEach(function (x) {
          x.forms.forEach(function (f) { shown[S.fold(f)] = 1; });
          if (x.forms.length) { var li = el("li"); li.append(el("b", x.label + ": "), document.createTextNode(x.forms.slice(0, 8).join(", ") + (x.forms.length > 8 ? " and " + (x.forms.length - 8) + " more case endings and spellings" : ""))); ul.append(li); }
        });
        groups.forEach(function (x) { x.leads.forEach(function (f) { var k = S.fold(f); if (!shown[k]) { shown[k] = 1; leads.push(f); } }); });
        if (leads.length && withLeads !== false) { var ll = el("li", null, "lf-leads"); ll.append(el("b", "Worth trying (never yet seen on a record): "), document.createTextNode(leads.slice(0, 14).join(", ") + (leads.length > 14 ? " and " + (leads.length - 14) + " more" : ""))); ul.append(ll); }
        return ul;
      }
      box.append(listFor(main));
      if (rest.length) {
        var n = rest.reduce(function (a, x) { return a + x.forms.length + x.leads.length; }, 0), dt = el("details", null, "lf-otherlangs"), sm = el("summary", "Show the other " + rest.length + " language" + (rest.length === 1 ? "" : "s") + ": not expected where they lived, kept in case a clerk used one");
        dt.append(sm, listFor(rest)); box.append(dt);
      }
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
    var box = el("div", null, "lf-names"), any = false, seen = [];
    base = (base || "/").replace(/\/?$/, "/");
    /* two people who share a first name and a surname (the person asked about and his father, both Ivan) read the same: one card says both */
    var people = ((names && names.people) || []), cards = [];
    people.forEach(function (pe, i) {
      var inner = personNames(pe.given, pe.surname, base, pe.langs);
      if (!inner) return;
      var key = (pe.given ? pe.given.canon + "|" + pe.given.typed : "") + "|" + (pe.surname ? pe.surnameTyped || pe.surname.name : "") + "|" + inner.textContent;
      var hit = cards.filter(function (c) { return c.key === key; })[0];
      if (hit) { hit.labels.push(roleLabel(pe, people) + (pe.presumed ? " (surname assumed the same)" : "")); return; }
      cards.push({ key: key, pe: pe, inner: inner, labels: [roleLabel(pe, people) + (pe.presumed ? " (surname assumed the same)" : "")] });
    });
    cards.forEach(function (c, i) {
      any = true;
      var d = el("details", null, "lf-person"); if (i === 0) d.open = true;
      var sm = el("summary"); sm.append(el("b", c.pe.name || roleLabel(c.pe, people)), el("span", " \u00b7 " + c.labels.join(", and "), "lf-filed"));
      d.append(sm, c.inner); box.append(d);
    });
    if (any) {
      var p = el("p", null, "cap"); p.append("Leads are where to look, not findings. ");
      var a = el("a", "Every spelling in the Atlas →"); a.href = base + "your-name/"; p.append(a); box.append(p);
    }
    return any ? box : null;
  }

  /* The family as told: the parents named above the person, and the visitor below. Each card carries the place and the few forms of the name
     the catalogue holds. Nothing is drawn that the story did not say, and a missing parent is left out, not guessed. */
  function treeBlock(people, rel, opts) {
    var self = (people || []).filter(function (x) { return x.role === "self"; })[0];
    /* EDITING THE BOXES (the story page passes opts.onEdit). A box can be filled in by hand: the page turns what is typed into plain sentences in the
       story, so the story stays the one source and everything else re-reads from it. Only where the words exist to say it: "my father's mother ...". */
    var onEdit = opts && opts.onEdit, relS = self && self.rel ? String(self.rel).replace(/-/g, " ") : "";
    var canEdit = !!(onEdit && self && (self.me || /^(?:father|mother)$/.test(relS)) && !self.sought);
    var selfRef = self ? (self.me ? "I" : "my " + relS) : "";
    function slotOf(kind) { return { kind: kind, me: !!(self && self.me), ref: kind === "self" ? selfRef : kind === "spouse" ? selfRef : (self && self.me ? "my " : selfRef + "'s ") + kind }; }
    var fa = (people || []).filter(function (x) { return x.role === "father"; })[0], mo = (people || []).filter(function (x) { return x.role === "mother"; })[0];
    if (!self) return null;
    function forms(pe) {
      var out = [];
      if (pe.given && pe.given.groups) pe.given.groups.forEach(function (g) { g.forms.forEach(function (f) { if (out.length < 5 && out.indexOf(f) < 0 && S.fold(f) !== S.fold(pe.given.typed)) out.push(f); }); });
      var sn = pe.surname;
      if (sn && sn.family) sn.family.by.same.concat(sn.family.by.attested, sn.family.by.rule).forEach(function (f) { if (out.length < 8 && out.indexOf(f) < 0 && S.fold(f) !== S.fold(pe.surnameTyped)) out.push(f); });
      return out;
    }
    function card(pe, label, kind) {
      var c = el("div", null, "lf-card lf-card-" + pe.role + (pe.empty ? " lf-card-empty" : ""));
      c.append(el("div", label, "lf-card-role"), el("div", pe.name || pe.nameNote || (pe.empty ? "Not in the story yet" : pe.me ? "The one telling the story" : "Name not given"), "lf-card-name"));
      var hasBorn = (pe.events || []).some(function (e) { return e.type === "born" && e.place; });
      /* the places told of this person, in order, from the reading of the family (what used to be a row of pills under the story box) */
      var kinRoute = (opts && opts.kin || []).filter(function (k) { return (k.key && pe.key && k.key === pe.key) || (!pe.key && k.label && new RegExp("\\b" + pe.role + "\\b", "i").test(k.label)); })[0], rs = kinRoute ? (kinRoute.stops || []).filter(function (x) { return x.info; }) : [];
      if (pe.name) c.setAttribute("data-person", pe.name);
      /* THE FLAG OF THE TIME, AT BIRTH AND AT DEATH. David: «could we add the flag of the country in here, the flag at the time of that persons birth and death.» The
         flag is the Atlas's flag history of the country the place is in today (flagAt on its era rows), picked for the year told. With no year told it is today's flag,
         drawn faint and said so, because a flag of "now" must not read as a flag of "then". */
      var FB = ((opts && opts.base) || document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/"), marks = [];
      (function () {
        var b = rs.filter(function (x) { return x.role === "born" || x.role === "origin"; })[0];
        if (b && rs.indexOf(b) === 0) marks.push({ word: b.role === "origin" ? "From" : "Born", st: b, year: b.year });
        var d = rs.filter(function (x) { return (x.ev || []).some(function (v) { return v.type === "died"; }); })[0];
        if (d) marks.push({ word: "Died", st: d, year: (d.ev.filter(function (v) { return v.type === "died"; })[0] || {}).year });
      })();
      /* the flag sits NEXT TO the birth or the death it belongs to, inside the line that already says it: «From Senj [flag] → Botswana 1954 → …», «Died 1999, Brisbane [flag]» */
      function flagImg(m) {
        var yr = m.year != null ? m.year : null, fl = flagFor(m.st.info, yr); if (!fl) return null;
        var cap = yr != null ? captionAt(m.st.info, yr) : null, im = el("img", null, "lf-cflag" + (yr == null ? " lf-cflag-now" : ""));
        var at = (m.word === "From" ? "From " : m.word + " in ") + m.st.info.name;
        im.src = FB + "fl/" + encodeURIComponent(fl) + ".svg"; im.alt = "";
        im.title = yr != null ? at + ", " + yr + ": the flag of the time" + (cap && cap.polity ? ", under " + cap.polity : "") + " (from the Atlas's flag history of today's " + m.st.info.countryName + ")"
                              : at + ", year not told: this is today's flag of " + m.st.info.countryName + ". Add a year to see the flag of the time.";
        return im;
      }
      var flagOf = { start: null, died: null };
      marks.forEach(function (m) { var im = flagImg(m); if (im) flagOf[m.word === "Died" ? "died" : "start"] = im; });
      if (rs.length) {
        var first = rs[0].role, rt = (first === "born" ? "Born in " : first === "origin" ? "From " : "Places: ") + rs.map(function (x) { return x.info.name + (x.year != null ? " " + x.year : ""); }).join(" \u2192 ");
        var rd = el("div", null, "lf-card-place lf-card-route"), rb = rt.indexOf(" \u2192 "), r1 = rb < 0 ? rt : rt.slice(0, rb);
        rd.append(document.createTextNode(r1)); if (flagOf.start) rd.append(flagOf.start); if (rb >= 0) rd.append(document.createTextNode(rt.slice(rb)));
        c.append(rd);
      }
      else if (pe.place && !hasBorn) {   /* "Born in" only for a place the story gives as the birth place: a nun «in Zagreb» was not born there for all we are told */
        var pw = String(typeof pe.place === "string" ? pe.place : pe.place.word).replace(/(^|[\s-])(\p{Ll})/gu, function (m0, a, b) { return a + b.toUpperCase(); }), pr = typeof pe.place === "string" ? "" : pe.place.role;
        c.append(el("div", (pr === "born" || (!pr && pe.role === "self" && !pe.events) ? "Born in " : pr === "lived" ? "Lived in " : "From ") + pw, "lf-card-place"));
      }
      (pe.events || []).forEach(function (e) {
        var t = e.type === "told" ? e.text : (e.type === "born" ? "Born" : e.type === "married" ? "Married" : e.type === "lived" ? "Lived" : "Died") + (e.year != null ? " " + e.year : "") + (e.place ? (e.year != null ? ", " : " in ") + e.place : "") + (e.cause ? " (" + e.cause + ")" : "");
        if (e.type === "born" && rs.length && rs[0].role === "born") return;   /* the route line already begins with where they were born */
        var ev = el("div", t, "lf-card-place lf-card-ev"); if (e.type === "died" && flagOf.died) { ev.append(flagOf.died); flagOf.died = null; } else if (e.type === "born" && flagOf.start && !rs.length) { ev.append(flagOf.start); flagOf.start = null; }
        c.append(ev);
      });
      if (pe.occupation) c.append(el("div", "Work: " + pe.occupation, "lf-card-forms"));
      if (pe.counts) { var cb = []; ["children", "grandchildren", "sons", "daughters"].forEach(function (k2) { if (pe.counts[k2] != null) cb.push(pe.counts[k2] + " " + k2); }); if (cb.length) c.append(el("div", "Told: " + cb.join(", "), "lf-card-forms")); }
      var f = forms(pe); if (f.length) c.append(el("div", "Also written: " + f.join(", "), "lf-card-forms"));
      if (pe.presumed) c.append(el("div", "Surname assumed the same", "lf-card-forms"));
      if (canEdit && kind) editor(c, pe, slotOf(kind), label);
      return c;
    }
    /* the small form inside a box: what is typed becomes sentences, the page re-reads, the tree is drawn again with it */
    function editor(c, pe, slot, label) {
      var btn = el("button", pe.empty || (!pe.name && !(pe.events || []).length && !pe.place) ? "+ Add details" : "Add or change details", "lf-edit"); btn.type = "button";
      var form = null;
      btn.addEventListener("click", function () {
        if (form) { form.remove(); form = null; c.classList.remove("editing"); btn.setAttribute("aria-expanded", "false"); return; }
        form = el("form", null, "lf-form"); c.classList.add("editing"); btn.setAttribute("aria-expanded", "true");
        var spouse = slot.kind === "spouse", me = slot.kind === "self" && slot.me, f = {};
        function field(key, text, ph, small) { var l = el("label", null, small ? "sm" : ""), i = el("input"); i.type = "text"; i.placeholder = ph || ""; i.autocomplete = "off"; l.append(el("span", text), i); form.append(l); f[key] = i; }
        if (!me) field("name", spouse ? "Their name" : "Name", pe.name ? "now: " + pe.name : "first name and surname");
        if (spouse) { field("married", "Married in (year)", "1975", true); field("marriedAt", "Married at (place)", "a town", true); }
        else {
          field("born", "Born in (year)", "1898", true); field("bornAt", "Born at (place)", "a town", true);
          if (!me) { field("died", "Died in (year)", "1984", true); field("diedAt", "Died at (place)", "a town", true); }
          field("lived", me ? "Live in" : "Lived in", "a town or country");
          field("work", "Work", "stonemason, nurse, …");
        }
        field("note", "Anything else", "a sentence about them");
        var row = el("div", null, "lf-form-row"), go = el("button", "Add to the story"), no = el("button", "Cancel"); go.type = "submit"; no.type = "button"; row.append(go, no); form.append(row);
        form.append(el("p", "This is written into your story as plain sentences, so you can read and change it there.", "lf-form-note"));
        no.addEventListener("click", function () { btn.click(); });
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var v = {}; Object.keys(f).forEach(function (k) { v[k] = f[k].value.replace(/\s+/g, " ").trim(); });
          if (!Object.keys(v).some(function (k) { return v[k]; })) { btn.click(); return; }
          onEdit(slot, v);
        });
        c.append(form); var first = form.querySelector("input"); if (first) first.focus();
      });
      c.append(btn);
    }
    var tree = el("div", null, "lf-tree"), others = (people || []).slice();
    function gen(cls) { var g = el("div", null, "lf-gen " + (cls || "")); tree.append(g); return g; }
    var gps = (people || []).filter(function (x) { return x.role === "grandfather" || x.role === "grandmother"; }), sp = (people || []).filter(function (x) { return x.role === "spouse"; })[0];
    if (gps.length) {
      var g0 = gen("lf-grand"), sided = gps.every(function (x) { return /^[FM][FM]$/.test(x.key || ""); });
      /* the parents' parents sit in two groups, the father's side and the mother's, so four boxes do not wrap into a pile */
      if (sided) [["F", "Father's side"], ["M", "Mother's side"]].forEach(function (sd) {
        var mem = gps.filter(function (x) { return x.key.charAt(0) === sd[0]; }); if (!mem.length) return;
        var box = el("div", null, "lf-side"), row = el("div", null, "lf-side-row"); box.append(el("div", sd[1], "lf-side-h"));
        mem.forEach(function (x) { var lb = x.label || x.role; row.append(card(x, lb.charAt(0).toUpperCase() + lb.slice(1))); });
        box.append(row); g0.append(box);
      });
      else gps.forEach(function (x) { var lb = x.label || x.role; g0.append(card(x, lb.charAt(0).toUpperCase() + lb.slice(1))); });
      tree.append(el("div", null, "lf-tie"));
    }
    if (fa || mo || canEdit || (people || []).some(function (x) { return x.role === "inlaw"; })) { var g1 = gen("lf-parents"); var cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
      var kinOf = self.rel && !self.me && !self.sought ? "Your " + String(self.rel).replace(/-/g, " ") + "'s " : "";
      /* with editing on, both parents are drawn even when the story names neither: an empty box, to be filled in */
      if (!fa && canEdit) fa = { role: "father", name: "", empty: true }; if (!mo && canEdit) mo = { role: "mother", name: "", empty: true };
      if (fa) g1.append(card(fa, self.sought && fa.label ? cap(fa.label) : kinOf ? cap(kinOf) + "father" : "Father", "father")); if (mo) g1.append(card(mo, self.sought && mo.label ? cap(mo.label) : kinOf ? cap(kinOf) + "mother" : "Mother", "mother"));
      (people || []).filter(function (x) { return x.role === "inlaw"; }).forEach(function (x) { g1.append(card(x, cap(x.label || "Spouse"))); });
      tree.append(el("div", null, "lf-tie")); }
    /* the people between are drawn even when the story names nobody there: "my grandfather was Ivan" has a parent between him and you */
    function gap(n, above) { for (var i = 0; i < n; i++) { if (!above) tree.append(el("div", null, "lf-tie")); var gg = gen("lf-gap"), ph = el("div", null, "lf-card lf-card-you"); ph.append(el("div", n > 1 && i === 0 ? "Parent of yours, not named" : "Your parent, not named", "lf-card-role"), el("div", "Not in the story yet: name them to add them here", "lf-card-place")); gg.append(ph); if (above) tree.append(el("div", null, "lf-tie")); } }
    if (self.me && !fa && !mo && gps.length) gap(1, true);
    /* BROTHERS AND SISTERS HAVE PARENTS. David: «if he has siblings, surely we should show unknown parents». When the story names the person's brothers or sisters but not their parents,
       the parents are drawn above the row as boxes waiting to be told, the way a father's parents already are. */
    if (((opts && opts.siblings) || []).length && !fa && !mo && !self.me && !self.sought) {
      var gsb = gen("lf-parents"), whoS = String(self.name || "").split(/\s+/)[0];
      gsb.append(card({ role: "father", name: "", empty: true }, whoS ? whoS + "'s father" : "Their father"), card({ role: "mother", name: "", empty: true }, whoS ? whoS + "'s mother" : "Their mother"));
      tree.append(el("div", null, "lf-tie"));
    }
    var g2 = gen(); g2.append(card(self, self.sought ? self.label : self.me ? "You" : self.rel ? "Your " + self.rel.replace(/-/g, " ") : "The person you asked about", "self"));
    var sps = (people || []).filter(function (x) { return x.role === "spouse"; });
    var rl0 = String(self.rel || "");
    sps.forEach(function (x, i) { g2.append(card(x, x.label && (i || x.told) ? x.label.charAt(0).toUpperCase() + x.label.slice(1) : self.me ? "Your partner" : self.rel === "father" ? "Wife, your mother" : self.rel === "mother" ? "Husband, your father" : /(?:father|uncle|brother)$/.test(rl0) ? "His wife" : /(?:mother|aunt|sister)$/.test(rl0) ? "Her husband" : "Spouse", i ? "" : "spouse")); });
    /* THE SIBLINGS THE STORY NAMES ("he had a brother Robert and a sister Ada") stand beside the person they are siblings of, on the same row, as told */
    ((opts && opts.siblings) || []).forEach(function (sb) { var lb = String(sb.label || sb.rel || "sibling"); g2.append(card({ role: "sibling", name: sb.name }, lb.charAt(0).toUpperCase() + lb.slice(1))); });
    if (!sps.length && canEdit) g2.append(card({ role: "spouse", name: "", empty: true }, self.me ? "Your partner" : self.rel === "father" ? "Wife, your mother" : "Husband, your father", "spouse"));
    var kids = (people || []).filter(function (x) { return x.role === "child" && !x.ofSubject; });
    var rl = String(self.rel || ""), between = /grand/.test(rl) && !self.me ? (rl.match(/great/g) || []).length + 1 : 0;
    /* THE ANCESTOR'S OWN CHILDREN, as told: a row under the couple. They are the generation between the ancestor and you, so they take the place of one «parent, not named»;
       the grandmother is one of them but which one is not said, so she is a card of her own beneath, never placed on a name. */
    var lk = (people || []).filter(function (x) { return x.role === "child" && x.ofSubject; }), lg = (people || []).filter(function (x) { return x.role === "line"; })[0];
    if (!self.me && (lk.length || lg)) {
      g2.classList.add("lf-couple");
      tree.append(el("div", null, "lf-tie"));
      if (lk.length) { var gk = gen("lf-kids"); lk.forEach(function (x) { var lb = String(x.label || "child"); gk.append(card(x, lb.charAt(0).toUpperCase() + lb.slice(1))); }); }
      if (lg) {
        var gl = gen("lf-line"), lc = card(lg, "Your grandmother"); lc.classList.add("lf-card-line");
        if (lk.length) gl.append(el("div", "One of the " + (lk.length > 1 ? lk.length + " children above" : "children above") + ". The story does not say which.", "lf-line-note"));
        gl.append(lc);
      }
      between = Math.max(0, between - 1);
    }
    if (between) gap(between);
    if (self.me) { if (kids.length) { tree.append(el("div", null, "lf-tie")); var g4 = gen(); kids.forEach(function (x) { g4.append(card(x, "Your child")); }); } return tree; }
    if (self.sought || !self.rel) return tree;   /* "you" are on the tree only when the story says they are related */
    tree.append(el("div", null, "lf-tie"));
    var g3 = gen(), you = el("div", null, "lf-card lf-card-you"); you.append(el("div", "You", "lf-card-role"), el("div", "who is asking", "lf-card-place")); g3.append(you);
    if (kids.length) { tree.append(el("div", null, "lf-tie")); var g5 = gen(); kids.forEach(function (x) { g5.append(card(x, "Your child")); }); }
    return tree;
  }

  /* The others the story names by what they are to someone ("her father Ola, born 1868"): small cards under the tree, as told. */
  function othersBlock(others, siblings) {
    var sibs = Object.create(null); (siblings || []).forEach(function (x) { sibs[x.rel + "|" + S.fold(x.name)] = 1; });
    var list = (others || []).filter(function (o) { return !o.inTree && !sibs[o.kin + "|" + S.fold(o.name)]; }); if (!list.length) return null;
    var box = el("div", null, "lf-others"); box.append(el("div", "Also named in the story", "lf-others-h"));
    var row = el("div", null, "lf-others-row");
    list.forEach(function (o) {
      var c = el("div", null, "lf-other"); c.append(el("div", o.name || "Name not given", "lf-other-name"), el("div", (o.poss ? o.poss + " " : "") + o.kin + (o.born != null ? " \u00b7 born " + o.born : "") + (o.died != null ? " \u00b7 died " + o.died : ""), "lf-other-rel")); row.append(c);
    });
    box.append(row); return box;
  }
  api.namesBlock = namesBlock; api.othersBlock = othersBlock; api.treeBlock = treeBlock; api.lifeBlock = lifeBlock; api.lifeEvents = lifeEvents; api.aliasMerge = aliasMerge; api.countryPoints = countryPoints; api.gazWants = gazWants; api.gazMerge = gazMerge; api.didYouMean = didYouMean;
  api.createLoader = createLoader; api.createJourney = createJourney; api.el = el;
})();
