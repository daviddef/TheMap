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

  var REL = /\b(great[- ]great[- ]grand(?:father|mother|parent)|great[- ]grand(?:father|mother|parent)|grand(?:father|mother|parent)|great[- ](?:uncle|aunt)|father|mother|uncle|aunt|brother|sister|ancestor|relative|nonno|nonna|granny|grandad|grandma|grandpa|oma|opa|djed|baka)\b/i;
  var REL_ALIAS = { nonno: "grandfather", grandad: "grandfather", grandpa: "grandfather", opa: "grandfather", djed: "grandfather", nonna: "grandmother", granny: "grandmother", grandma: "grandmother", oma: "grandmother", baka: "grandmother" };
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
    var capAt = [], sentStart = true;
    String(raw || "").split(/\s+/).filter(Boolean).forEach(function (w) {
      var cap = /^[("'\u201c\u2018]*\p{Lu}/u.test(w), pieces = S.fold(w).split(" ").filter(Boolean);
      pieces.forEach(function () { capAt.push({ cap: cap, init: sentStart }); });
      sentStart = /[.!?:]["')]*$/.test(w);
    });
    if (capAt.length !== tokens.length) return { capAt: [], mixed: false };
    return { capAt: capAt, mixed: capAt.some(function (x) { return x.cap && !x.init; }) };
  }
  var NEG = /(?:^| )(?:not|never|neither|nor|didn t|wasn t|weren t|hadn t|hasn t|haven t)(?: \S+){0,3}$/;
  /* Is this candidate not a place, from how the story wrote it? Months and counting words; trades and kinds of ground written small; a word
     written small in a story that capitalises its places; a surname straight after a given name; a place the story says nobody went to. */
  function notPlace(c, tokens, ci, ctx) {
    var p1 = tokens[c.at - 1] || "", single = c.word.indexOf(" ") < 0, ca = ci.capAt[c.at], pa = ci.capAt[c.at - 1], marked = PREP_PLACE.test(p1);
    if (single && /^(?:flu|influenza|fever|plague|pox|cholera|war|famine|epidemic|pandemic|virus|disease|measles|typhus|typhoid|civil|inquisition|armada)$/.test(tokens[c.at + 1] || "")) return true;   /* "Spanish flu" is not Spanish Wells */
    if (single && (MONTHS[c.word] || NUMW[c.word])) return true;
    if (single && (OCC[c.word] || LC[c.word]) && !(ca && ca.cap && !ca.init && marked)) return true;
    if (single && ci.mixed && ca && !ca.cap && !marked) return true;
    if (single && ca && ca.cap && pa && pa.cap && !marked && !PLACE_BEFORE[p1] && ctx && ctx.given && ctx.given[p1]) return true;
    return NEG.test(tokens.slice(Math.max(0, c.at - 4), c.at).join(" "));
  }
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
    var out = [], tx = String(text || ""), re = /\b(?:in|at|from|near|to|into|en|nach|iz|u)\s+(\p{Lu}[\p{L}'\u2019-]{3,})((?:\s*(?:,|and|then|&)\s+\p{Lu}[\p{L}'\u2019-]{3,})*)/gu, m, seen = Object.create(null), words = [];
    while ((m = re.exec(tx))) {
      words.push(m[1]);
      (m[2] || "").replace(/\p{Lu}[\p{L}'\u2019-]{3,}/gu, function (x) { words.push(x); return x; });
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
      out.push({ typed: m[1], kind: "typo", options: keys.slice(0, 3).map(function (k) { var r = map[k][0]; return { n: String(r.n).replace(/\s*\([^)]*\)/g, ""), cc: r.cc, cn: ctx.countries && ctx.countries[r.cc] || r.cc }; }) });
    }
    return out.slice(0, 4);
  }
  /* WHAT TO ASK THE WORLDWIDE GAZETTEER FOR. A name after in / at / from / near / to the Atlas does not hold; and a town that has the name only in
     other countries when the story says where it is ("Dublin, Ohio": the Atlas holds a Dublin in Ireland and one in Canada, not the one in Ohio).
     Pure, so the page and the tests use the same rule; the loader fetches the shards and calls gazMerge. */
  function gazWants(text, map, given) {
    var fold = S.fold, want = [], t = String(text || ""), re = /\b(?:in|at|from|near|to|en|nach|aus|von|iz|nel|nella)\s+(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+){0,2})/gu, m;
    while ((m = re.exec(t))) {
      var ws = m[1].split(/\s+/);
      for (var n = ws.length; n >= 1; n--) { var ph = fold(ws.slice(0, n).join(" ")); if (map[ph]) break; want.push({ ph: ph, ccs: null }); }
    }
    var pr = /(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)\s*,\s*(\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)/gu;
    while ((m = pr.exec(t))) {
      var fx = fold(m[1]), fy = fold(m[2]), rx = map[fx], ry = map[fy]; if (!rx || !ry) continue;
      var ccs = []; ry.forEach(function (r) { if (r.cc && ccs.indexOf(r.cc) < 0) ccs.push(r.cc); });
      if (ccs.length && !rx.some(function (r) { return ccs.indexOf(r.cc) > -1; })) want.push({ ph: fx, ccs: ccs });
    }
    var seen = Object.create(null);
    return want.filter(function (w) { var k = w.ph + "|" + (w.ccs || []).join(); if (w.ph.length < 4 || seen[k] || (given && given[w.ph])) return false; if (!w.ccs && map[w.ph]) return false; seen[k] = 1; return true; }).slice(0, 10);
  }
  /* rows from a gazetteer shard are [name, lat, lon, cc, otherNames]; the ones that are this name are added to the map */
  function gazMerge(map, w, shardRows) {
    var fold = S.fold, hit = (shardRows || []).filter(function (r) { return fold(r[0]) === w.ph || (r[4] || []).some(function (a) { return fold(a) === w.ph; }); });
    if (w.ccs) hit = hit.filter(function (r) { return w.ccs.indexOf(r[3]) > -1; });
    hit = hit.slice(0, w.ccs ? 20 : 4); if (!hit.length) return 0;
    var rows = hit.map(function (r) { return { i: "g-" + w.ph.replace(/ /g, "-") + "-" + String(r[3]).toLowerCase() + "-" + Math.round(r[1] * 100), n: r[0], y: r[1], x: r[2], cc: r[3], c: 0, gaz: 1 }; });
    map[w.ph] = (map[w.ph] || []).concat(rows);
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
    { key: "gave", title: "What they gave up", re: /\b(sacrific\w+|gave up|went without|worked (?:two|three|\w+ )?jobs|sent money|sending money|saved (?:every|up)|never went back|never saw (?:his|her|them|their)|left (?:his|her|their) (?:family|children|home|village|country)|left behind|put (?:his|her) children)\b/i },
    { key: "wanted", title: "What they wanted", re: /\b(wanted|dreamed|dreamt|hoped|longed|wished|ambition|aspired|planned to|always wanted|yearned|promised)\b/i },
    { key: "world", title: "The weather and the world around them", re: /\b(snow\w*|blizzard|storm\w*|flood\w*|drought|famine|frost\w*|freezing|heat ?wave|earthquake|volcano|eruption|hurricane|cyclone|typhoon|monsoon|tornado|landslide|avalanche|shipwreck\w*|bushfire|fire|epidemic|plague|cholera|locusts|hard winter|bitter winter|voyage|crossing|steamer)\b/i }
  ];
  /* the causes a story may give for a death, as told; "of / from / after / due to" or the verb itself carries it */
  var CAUSE_RE = /\b(tuberculosis|consumption|\bTB\b|cholera|typhoid|typhus|smallpox|measles|diphtheria|scarlet fever|whooping cough|spanish (?:flu|influenza)|influenza|the flu|\bflu\b|pneumonia|malaria|dysentery|the plague|\bplague\b|cancer|leuk(?:a)?emia|heart attack|heart failure|heart disease|stroke|childbirth|giving birth|old age|natural causes|accident|mining accident|mine collapse|fire|drowning|starvation|famine|exposure|frostbite|suicide|his own life|her own life|the war|war|battle|combat|bombing|air raid|execution|murder|stabbed|poison(?:ed|ing)?|infection|fever|a long illness|illness|kidney failure|diabetes|covid(?:-19)?|coronavirus|polio|sepsis|gangrene|wounds)\b/i;
  var DEATH_RE = /\b(died|dies|passed away|killed|drowned|murdered|executed|hanged|shot dead|perished|lost (?:his|her) life|took (?:his|her) own life|succumbed|was lost at sea|was lost)\b([^.;!?\n]*)/i;
  function readLife(t, ctx, out) {
    var text = String(t || "").replace(/\s+/g, " "), groups = Object.create(null), any = 0, seen = Object.create(null);
    function add(key, clause) {
      var c = clause.replace(/^[\s,;:-]+|[\s,;:.!?-]+$/g, "").replace(/^(?:and|but|then|so|yet|because|until|after|when|while|before|that|who|which)\s+/i, "")
        .replace(/^(?:[Mm]y|[Oo]ur|[Hh]is|[Hh]er|[Tt]heir)\s+(?:great[- ])*(?:grand\w+|father|mother|dad|mum|mom|uncle|aunt|brother|sister|husband|wife)(?:\s+(?:from|of|in)\s+\p{Lu}[\p{L}'\u2019-]+(?:\s+\p{Lu}[\p{L}'\u2019-]+)?)?\s+(?=\p{L})/u, "");
      if (c.length < 6 || c.length > 160 || c.split(" ").length < 2) return;
      var k = key + "|" + c.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      (groups[key] = groups[key] || []); if (groups[key].length < 6) { groups[key].push(c.charAt(0).toUpperCase() + c.slice(1)); any++; }
    }
    text.split(/(?<=[.!?])\s+/).forEach(function (sent) {
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
    var died = null, dm = DEATH_RE.exec(text);
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
    /* the death is told once, under its own heading, not again as a hard time */
    if (died) Object.keys(groups).forEach(function (k) { groups[k] = groups[k].filter(function (x) { var a = x.toLowerCase(), b = died.clause.toLowerCase(); return b.indexOf(a) < 0 && a.indexOf(b) < 0 && !(died.cause && a.replace(/^(?:he|she|they) (?:was |were )?/, "") === died.cause); }); });
    var occ = (out && out.occupations) || [];
    var gl = LIFE_GROUPS.map(function (g) { return { key: g.key, title: g.title, items: groups[g.key] || [] }; }).filter(function (g) { return g.items.length; });
    return { groups: gl,
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
    if (life.died) hints.push("a death record, a burial entry or a newspaper notice, which often name the cause");
    if (life.married > 1 || life.groups.some(function (g) { return g.key === "romance" && g.items.some(function (x) { return /divorc|separat|annul/i.test(x); }); })) hints.push("one marriage record for each marriage, and a divorce or court file where it ended in one");
    if (life.groups.some(function (g) { return g.key === "hard" && g.items.some(function (x) { return /jail|prison|arrest|convict|sentenc|trial|fined|deport|intern/i.test(x); }); })) hints.push("court, police or prison registers and the local newspaper");
    if (life.groups.some(function (g) { return g.key === "hard" && g.items.some(function (x) { return /war|battle|conscript|draft|enlist|fought|wounded|prisoner/i.test(x); }); })) hints.push("military service and prisoner-of-war records");
    if (hints.length) box.append(el("p", "Where such things usually leave a record: " + hints.join("; ") + ". These are places to look, not findings.", "cap"));
    return box;
  }

  /* A country written in the story ("Worthington, United States") says which of the same-named places is meant: places in the countries the
     story names come first, and the words of a country's long name ("United States of America") are not themselves places. */
  function withCountryHints(cands, tokens, ctx) {
    if (!ctx || !ctx.countries) return cands;
    var cov = Object.create(null), hint = Object.create(null);
    /* every run of up to six words in the story, by the words joined: a country name is then one lookup, not a scan of the story per country */
    function grams(list) {
      var g = Object.create(null);
      for (var i = 0; i < list.length; i++) { var k = ""; for (var n = 0; n < 6 && i + n < list.length; n++) { k += (n ? " " : "") + list[i + n]; (g[k] = g[k] || []).push(i); } }
      return g;
    }
    var allToks = ctx.hintTokens || tokens, gAll = grams(allToks), gTok = allToks === tokens ? gAll : grams(tokens);
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
    if (!Object.keys(hint).length) return cands;
    cands = cands.filter(function (c) { return !cov[c.at]; });
    cands.forEach(function (c) { c.rows = c.rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (hint[b.r.cc] ? 1 : 0) - (hint[a.r.cc] ? 1 : 0) || a.i - b.i; }).map(function (x) { return x.r; }); });
    return cands;
  }

  var FORMER = {
    "rhodesia": { cc: ["ZW", "ZM"], drop: 1 }, "southern rhodesia": { cc: ["ZW"] }, "northern rhodesia": { cc: ["ZM"] }, "yugoslavia": { cc: ["HR", "RS", "SI", "BA", "MK", "ME", "XK"], drop: 1 },
    "czechoslovakia": { cc: ["CZ", "SK"], drop: 1 }, "ussr": { cc: ["RU", "UA", "BY", "LT", "LV", "EE", "MD", "GE", "AM", "AZ", "KZ"], drop: 1 }, "soviet union": { cc: ["RU", "UA", "BY", "LT", "LV", "EE", "MD", "GE", "AM", "AZ", "KZ"] },
    "east germany": { cc: ["DE"] }, "west germany": { cc: ["DE"] }, "zaire": { cc: ["CD"], drop: 1 }, "belgian congo": { cc: ["CD"] }, "ceylon": { cc: ["LK"], drop: 1 },
    "south west africa": { cc: ["NA"] }, "british honduras": { cc: ["BZ"] }, "gold coast": { cc: ["GH"] }, "dutch east indies": { cc: ["ID"] }, "east pakistan": { cc: ["BD"] },
    "burma": { cc: ["MM"] }, "persia": { cc: ["IR"] }, "siam": { cc: ["TH"] }, "prussia": { cc: ["DE", "PL", "RU"] }
  };
  /* "a woman named Cheryl", "married a man called Ivan Kosina", "his daughter named Anna": the person named is not the one the story is about */
  var KIN_NAMED = /\b(married(?:\s+an?\s+\p{L}+)?|woman|lady|wife|husband|spouse|partner|bride|groom|man|girl|daughter|son|boy|child)\s+(?:named|called)\s+([\p{L}'\u2019-]+)(?:\s+([\p{Lu}][\p{L}'\u2019-]+))?/giu;
  var COUNTRY_ALIAS = { "usa": "US", "united states": "US", "united states of america": "US", "uk": "GB", "united kingdom": "GB" };
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
      if (len === 1 && ((gset[w] && !PLACE_MARK.test(tokens[i - 1] || "")) || STOP[w] || COMMON[w])) continue;
      if (cands.some(function (c) { var cl = c.word.split(" ").length; return cl > len && c.at <= i && i < c.at + cl; })) continue;   /* "Jersey City" is not the island of Jersey */
      for (j = i; j < i + len; j++) used[j] = 1;
      hits.push({ at: i, len: len, cc: cc, word: w });
    }
    if (!hits.length) return cands;
    var keep = cands.filter(function (c) { var cl = c.word.split(" ").length; return !hits.some(function (h) { return c.at < h.at + h.len && h.at < c.at + cl; }); });
    hits.forEach(function (h) {
      var nm = ctx.countries[h.cc], f = S.fold(nm);
      var exact = (ctx.map[f] || []).filter(function (r) { return r.cc === h.cc && S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "")) === f; })[0];
      var row = exact || { i: "c-" + h.cc.toLowerCase(), n: nm, cc: h.cc, x: cen[h.cc].x, y: cen[h.cc].y, a: 1, c: 0, w: 1, country: true, gaz: true };
      keep.push({ word: h.word, at: h.at, rows: [row], country: h.cc });
    });
    return keep.sort(function (a, b) { return a.at - b.at; });
  }

  function parseStory(text, ctx, attached) {
    var t = String(text || "").replace(/^\u2014 Picture \d+ \([^\n]*\) \u2014[ \t]*$/gm, " "), teller = "";   /* the line that names a picture read into the story is not story */
    /* "my name is David" says who is telling, not who the story is about */
    t = t.replace(/\bmy name is\s+([\p{L}'’-]+)(?:\s+([\p{Lu}][\p{L}'’-]+))?/iu, function (m, g, sn) { teller = cased(g) + (sn && /^\p{Lu}/u.test(sn) && !CONNECT.test(sn) && !STOP[S.fold(sn)] && !(ctx.map && ctx.map[S.fold(sn)]) ? " " + cased(sn) : ""); return " "; });
    t = t.replace(/\b[Ii] (?=(?:1[4-9][0-9]{2}|20[0-2][0-9])(?![0-9]))/g, "in ");   /* "moved to South Africa i 1942" */
    t = t.replace(/\b(my|his|her|their)\s+(grandfather|grandmother|father|mother|dad|mum|mom)\s+(\p{L}[\p{L}'\u2019-]+)(?=\s+(?:was|is|were|had|lived|moved|came|died|married|born|grew|left|emigrated|worked|and)\b|[,.;])/giu, function (m, pos, kin, nm) {
      return !/^\p{Lu}/u.test(nm) || STOP[S.fold(nm)] || COMMON[S.fold(nm)] ? m : pos + " " + kin + " was " + nm + ",";   /* "my father Marco was born in Florence" is "my father was Marco, was born in Florence" */
    });
    t = t.replace(/<\/?[a-z][^>]*>/gi, " ").replace(/\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/gi, " ");                  /* a link or an address in a pasted story is not a place */
    t = t.replace(/(^|[\s(])['\u2019](\d\d)(?=$|[\s.,;:)])/g, function (m, a, yy) { return a + (Number(yy) > 26 ? "19" : "20") + yy; });   /* "left in '45" */
    var out = { rel: "", given: "", surname: "", name: "", holds: "story", left: null, born: null, from: null, to: null };
    out.teller = teller;
    var rm = REL.exec(t); if (rm) { out.rel = rm[1].toLowerCase().replace(/ /g, "-"); out.rel = REL_ALIAS[out.rel] || out.rel; }
    var ft = S.fold(t), tokens = ft.split(" ").filter(Boolean);
    ctx = Object.assign({}, ctx, { hintTokens: tokens });
    /* "he married a woman named Cheryl": Cheryl is his wife, not him. Names so introduced are taken out before the story's own name is looked for. */
    var spouse = null, tg = t.replace(KIN_NAMED, function (m, who, g, sn) {
      var okSn = sn && /^\p{Lu}/u.test(sn) && !STOP[S.fold(sn)] && !COMMON[S.fold(sn)] && !(ctx.map && ctx.map[S.fold(sn)]);
      if (!spouse && /^(?:married|woman|lady|wife|husband|spouse|partner|bride|groom|man|girl)/i.test(who)) spouse = { given: cased(g), surname: okSn ? cased(sn) : "" };
      return " ";
    });
    /* "He married Anna Horvat in Karlovac": a capitalised name straight after married is the spouse, not the person the story is about */
    tg = tg.replace(/\b(?:married|marry|wed|wedded)\s+(?!an?\b|the\b|my\b|his\b|her\b|their\b|in\b|on\b|at\b|into\b)(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, function (m, g, sn) {
      var fg = S.fold(g), fs2 = sn ? S.fold(sn) : "";
      if (STOP[fg] || COMMON[fg] || MONTHS[fg] || (ctx.map && ctx.map[fg] && !(ctx.given && ctx.given[fg]))) return m;
      var okSn = sn && !STOP[fs2] && !COMMON[fs2] && !MONTHS[fs2] && !(ctx.map && ctx.map[fs2]);
      if (!spouse) spouse = { given: cased(g), surname: okSn ? cased(sn) : "" };
      return " ";
    });
    /* "his third wife was Anna", "his wife Anna": the name belongs to the wife */
    tg = tg.replace(/\b(?:wife|husband|spouse|partner|fianc[e\u00e9]e?)\s+(?:was\s+|is\s+|named\s+|called\s+)?(\p{Lu}[\p{L}'\u2019-]+)(?:\s+(\p{Lu}[\p{L}'\u2019-]+))?/gu, function (m, g, sn) {
      var fg = S.fold(g); if (STOP[fg] || COMMON[fg] || MONTHS[fg] || (ctx.map && ctx.map[fg] && !(ctx.given && ctx.given[fg]))) return m;
      var fs3 = sn ? S.fold(sn) : "", okSn = sn && !STOP[fs3] && !COMMON[fs3] && !MONTHS[fs3] && !(ctx.map && ctx.map[fs3]);
      if (!spouse) spouse = { given: cased(g), surname: okSn ? cased(sn) : "" };
      return " ";
    });
    var gv = ctx.given ? S.givenIn(tg, ctx.given, ctx.skip) : [];
    var gset = Object.create(null); gv.forEach(function (g) { gset[g.word] = 1; });
    if (gv.length) {
      out.given = gv[0].row.canon;
      var raw = tg.split(/\s+/), gi = -1;
      for (var i = 0; i < raw.length; i++) if (S.fold(raw[i]) === gv[0].word) { gi = i; break; }
      if (gi > -1 && raw[gi + 1]) {
        var nx = raw[gi + 1].replace(/^[("']+|[,.;:)"']+$/g, "");
        var fx = S.fold(nx), cap = /^[A-ZÀ-ÖØ-ÝČĆŽŠĐ][\p{L}'’-]+$/u.test(nx);
        if (/^[\p{L}'’-]{3,}$/u.test(nx) && !STOP[fx] && !REL.test(nx) && (cap || (!/[A-ZÀ-ÖØ-Þ]/.test(t) && !COMMON[fx] && !OCC[fx] && !(ctx.map && ctx.map[fx] && ctx.map[fx].length > 2)))) out.surname = nx;
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

    /* WHAT THEY DID FOR A LIVING, as the story says it ("a stonemason", "worked as a coal miner", "farmer"): kept as told, never looked up */
    out.occupations = [];
    (t.match(/[\p{L}]+/gu) || []).forEach(function (w) { var f = S.fold(w); if (OCC[f] && f.length > 3 && out.occupations.indexOf(f) < 0 && out.occupations.length < 4 && !(ctx.given && ctx.given[f] && /^[A-ZÀ-ÖØ-Þ]/.test(w))) out.occupations.push(f); });
    out.occupation = out.occupations[0] || "";
    var ys = yearsIn(t), born = null, left = null, rest = [];
    ys.forEach(function (y) { if (/(born|birth|b|b\.)\s*$/.test(y.before) && born == null) born = y.y; else rest.push(y); });
    if (rest.length) {
      var lab = rest.filter(function (y) { return /(came|arriv|left|emigrat|sail|around|about|circa|c\.|abt|in|by|moved)\s*$/.test(y.before); })[0] || rest[rest.length - 1];
      left = lab.y;
      if (born == null && rest.length > 1) { var e = rest.map(function (y) { return y.y; }).sort(function (a, b) { return a - b; })[0]; if (e < left) born = e; }
    }
    out.left = left; out.born = born;

    var cands = ctx.map ? S.candidates(t, ctx.map, ctx.skip) : [];
    cands = withCountryHints(cands, tokens, ctx);
    cands = withCountries(cands, tokens, ctx, gset);
    /* a word that is no place's own name but sits inside the names of several ("Friuli" in Pozzuolo del Friuli) is not a place: it is offered, not used */
    var suggest = [];
    cands = cands.filter(function (c) {
      if (c.word.indexOf(" ") > -1 || c.country || !c.rows.length) return true;
      var exact = c.rows.some(function (r) { return S.fold(String(r.n).replace(/\s*\([^)]*\)/g, "")) === c.word || S.fold(String(r.n).split(",")[0]) === c.word; });
      if (exact || !c.rows.every(function (r) { return (" " + S.fold(r.n) + " ").indexOf(" " + c.word + " ") > -1; })) return true;
      suggest.push({ typed: c.word.charAt(0).toUpperCase() + c.word.slice(1), kind: "partial", options: c.rows.slice(0, 3).map(function (r) { return { n: String(r.n).replace(/\s*\([^)]*\)/g, ""), cc: r.cc, cn: ctx.countries && ctx.countries[r.cc] || r.cc }; }) });
      return false;
    });
    /* a name the story gives a person ("my dad is Ivan", "his dad is Giovanni") is a person, never a place, unless a "from"/"in" comes before it */
    var fam = ctx.map ? readFamily(t, ctx) : null, me = ctx.map && !fam ? readMe(t, ctx) : null, sought = ctx.map && !fam && !me ? readSought(t, ctx) : null, nameW = Object.create(null);
    [fam, me, sought].forEach(function (f) { if (f) Object.keys(f.people).forEach(function (k) { var pe = f.people[k]; [pe.given, pe.surname].forEach(function (n) { if (n) nameW[S.fold(n)] = 1; }); }); });
    if (spouse && spouse.given) nameW[S.fold(spouse.given)] = 1;
    var kinName = "";
    (t.match(/\b(?:[Uu]ncle|[Aa]unt(?:ie|y)?|[Bb]rother|[Ss]ister|[Cc]ousin|[Nn]ephew|[Nn]iece|[Ff]riend|[Nn]eighbou?r|[Ss]on|[Dd]aughter|[Ww]ife|[Hh]usband|[Gg]rand(?:father|mother|pa|ma|ad))\s+\p{Lu}[\p{L}'\u2019-]+/gu) || []).forEach(function (m) {
      var ws = m.split(/\s+/), nm = ws.pop(), kw = ws.join(" ").toLowerCase();
      nameW[S.fold(nm)] = 1;                                                    /* "my uncle Jordan" is a man, not South Jordan */
      if (!kinName && out.rel && (out.rel === kw || REL_ALIAS[kw] === out.rel) && !STOP[S.fold(nm)] && !COMMON[S.fold(nm)]) kinName = nm;
    });
    var ci = capInfo(t, tokens);
    if (!out.name && kinName) { out.givenWord = kinName; out.name = kinName; }
    var rolesFor = cands.map(function (c) {
      var p1 = tokens[c.at - 1] || "", p2 = tokens[c.at - 2] || "", isGiven = !!gset[c.word] || !!nameW[c.word];
      var role = PLACE_BEFORE[p1] || ((p1 === "in" && p2 === "born") ? "from" : (p1 === "in" && /^(settled|arrived|lived|living|came|went|emigrated|moved)$/.test(p2)) ? "to" : "");
      var drop = (isGiven && !role) || (c.word.indexOf(" ") < 0 && (STOP[c.word] || COMMON[c.word] || REL.test(c.word))) || notPlace(c, tokens, ci, ctx);
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
      if (prev && (c.at === prev.at + prev.len || (c.at === prev.at + prev.len + 1 && tokens[c.at - 1] === "in")) && !prev.country) {
        /* a place written right after another says which one was meant ("Paris, Texas", "Lerwick in Scotland") unless they are two in a list
           ("Cork, Dublin, Liverpool and Boston"), where each is a stop of its own */
        var pool = prev.pool || [prev.row].concat(prev.alts || []), tail = " " + c.word, listy = !c.country && (prev.adjPrev || nextAdj), q0 = c.rows[0];
        function nearest(list) { if (list.length < 2 || !q0 || q0.x == null) return list[0]; var best = list[0], bd = 1e18; list.forEach(function (r) { if (r.x == null) return; var dx = (r.x - q0.x) * Math.cos(r.y * Math.PI / 180), dy = r.y - q0.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = r; } }); return best; }
        var pick = listy ? null : pool.filter(function (r) { var fn = S.fold(String(r.n)); return fn.slice(-tail.length) === tail && fn.indexOf(prev.word) === 0; })[0]
          || (listy ? null : nearest(pool.filter(function (r) { return c.rows.some(function (cr) { return cr.cc === r.cc; }); })));
        if (pick) { prev.alts = pool.filter(function (r) { return r !== pick; }).slice(0, 5); prev.row = pick; prev.country = c.word; return; }
      }
      var lo = Math.max(prev ? prev.at + prev.len : 0, c.at - 6), win = tokens.slice(lo, c.at).join(" ").replace(/(?: (?:county|co|province|state|city|town|village|parish|district|region|island))+$/, "");
      var anc = null, am, are = new RegExp(ANC.source, "g");
      while ((am = are.exec(win))) anc = am[1];
      var role = anc ? (/mother|mum|mom|grandmother/.test(anc) ? "mother" : "father") + "-from"
        : /\bborn\b/.test(win) ? "born"
        : /(^| )(from|of)$/.test(win) ? "origin"
        : MOVE.test(win) ? "move" : "lived";
      stops.push({ row: c.rows[0], alts: c.rows.slice(1, 6), pool: c.rows, word: c.word, at: c.at, len: len, role: role, age: null, year: null, approx: false, isCountry: !!c.country, before: /(?:^| )(?:before that|previously|earlier|prior to that|originally|beforehand)(?: |$)/.test(win),
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
    /* a place told backwards ("He ended up in Perth. Before that he lived in Cork.") goes before the one told just ahead of it */
    for (var bi = 1; bi < stops.length; bi++) if (stops[bi].before && !stops[bi - 1].before) { var tmp = stops[bi]; stops[bi] = stops[bi - 1]; stops[bi - 1] = tmp; }
    /* THE YEAR A STORY GIVES BESIDE A PLACE belongs to that place: "from County Cork in Ireland in 1928", "moved to South Africa in 1942". A year
       after a place and close to it is its year; a year just before a place ("in 1942 he moved to Perth") is the next place's. A birth year is not. */
    tokens.forEach(function (w, i) {
      if (!/^(?:1[4-9][0-9]{2}|20[0-2][0-9])$/.test(w) || /^(?:born|birth|b)$/.test(tokens[i - 1] || "") || (tokens[i - 1] === "in" && tokens[i - 2] === "born")) return;
      var before = null, after = null;
      stops.forEach(function (st) { var end = st.at + st.len; if (end <= i && i - end <= 4 && st.year == null) before = st; if (!after && st.at > i && st.at - i <= 5 && st.year == null) after = st; });
      var own = before || after; if (own) { own.year = Number(w); own.yearTold = true; }
    });
    /* a country named on its way to a place in it ("to South Africa ... then to Johannesburg") is that place's country, not a stop of its own; its year goes on */
    for (var ci = stops.length - 1; ci >= 0; ci--) {
      var cs = stops[ci], nx = stops[ci + 1];
      if (cs.isCountry && nx && !nx.isCountry && nx.row.cc === cs.row.cc) { if (cs.year != null && nx.year == null) { nx.year = cs.year; nx.yearTold = true; } stops.splice(ci, 1); }
    }
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
    if (out.born != null) route.forEach(function (st) { if (st.age != null && !st.yearTold) st.year = out.born + st.age; });
    /* the place a person was born is where the journey starts, however the story came to it ("He died in Boston. He had been born in Cork.") */
    var borns = route.filter(function (x) { return x.role === "born"; });
    if (borns.length === 1 && route[0] !== borns[0]) { route.splice(route.indexOf(borns[0]), 1); route.unshift(borns[0]); stops.splice(stops.indexOf(borns[0]), 1); stops.unshift(borns[0]); }
    out.stops = stops; out.route = route;
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
    if (spouse && !people.length) people.push({ role: "self", rel: out.rel, name: "", given: "", surname: "", place: route[0] || null, unnamed: true, occupation: out.occupation });
    if (spouse && people.length) people.push({ role: "spouse", name: spouse.given + (spouse.surname ? " " + spouse.surname : ""), given: spouse.given, surname: spouse.surname, place: null });
    out.people = people;
    if (fam) applyFamily(out, fam, ctx); else if (me) applyMe(out, me, ctx, teller); else if (sought) applyMe(out, sought, ctx, "");
    out.suggest = suggest.concat(didYouMean(t, ctx));
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
    var cands = withCountryHints(S.candidates(text, ctx.map, ctx.skip), ft, ctx), atMap = Object.create(null), ci = capInfo(text, ft);
    cands.forEach(function (c) {
      var p1 = ft[c.at - 1] || "", role = PLACE_BEFORE[p1] || "";
      if (notPlace(c, ft, ci, ctx)) return;
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
        if (!x.steps || /^(a|the|an|my|his|her|their|not|also|now)$/i.test(x.name) || STOP[S.fold(x.name)] || COMMON[S.fold(x.name)] || OCC[S.fold(x.name)] || MONTHS[S.fold(x.name)] || EV_BORN.test(S.fold(x.name)) || EV_DIED.test(S.fold(x.name)) || EV_WED.test(S.fold(x.name)) || EV_MOVE.test(S.fold(x.name)) || /^(?:murdered|killed|drowned|executed|hanged|shot|lost|ill|sick|dead|buried|married|single|widowed|divorced|alive|old|young|tall|short|poor|rich)$/.test(S.fold(x.name))) return;   /* "my father was from Cork": from is not his name */
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
      people[k].ev = all; people[k].occ = occIn(people[k].chunks.join(" "));
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
      while ((m = re.exec(sent))) ms.push({ at: m.index, end: m.index + m[0].length, key: KIN_STEP[m[1].toLowerCase()] });
      ms.forEach(function (x, i) {
        var rest = sent.slice(x.end, i + 1 < ms.length ? ms[i + 1].at : sent.length), nm = /^\s+(?:name\s+)?(?:is|was|named|called)\s+([\p{L}'’-]+)/iu.exec(rest), p = person(x.key, "");
        var tm = TELLS.exec(rest);
        if (tm) {
          /* what a parent TELLS is about someone else: the person named in the same breath ("told me he"), else the last one mentioned */
          var said = rest.slice(tm[0].length), pr = /^\s*(he|she)\b/i.exec(said), tgt = pr ? heFor(pr[1]) : null;
          if (tgt) { merge(P[tgt], readEvents(said, ctx)); P[tgt].occ = P[tgt].occ || occIn(said); mention(tgt); }
          mention(x.key); return;
        }
        if (nm && okName(nm[1])) { person(x.key, nm[1]); rest = rest.slice(nm[0].length); }
        else if (nm) rest = rest.slice(nm[0].length - nm[1].length);
        merge(p, readEvents(rest, ctx)); p.occ = p.occ || occIn(rest); mention(x.key);
      });
      /* "my grandfather lived in Crikvenica in 1990" (which side is not said, so none is guessed) */
      var gre = /\bmy\s+(gran\w*\s*(?:f[ae]\w*|dad|pa|pop\w*)|gran\w*\s*(?:mo\w*|ma|mum|nan\w*)|grand\w*)\b([^.;]*)/gi, gm;
      while ((gm = gre.exec(sent))) {
        var gmale = /^gran\w*\s*(?:f[ae]|dad|pa|pop)/i.test(gm[1]), grest = gm[2], gnm = /^\s+(?:is|was|named|called)\s+([\p{L}'’-]+)/iu.exec(grest);
        /* "my grandfather was born in Cork. My grandfather died in Boston." is one grandfather unless a different name is given to the second */
        var gsame = order.map(function (k) { return P[k]; }).filter(function (q) { return /^G/.test(q.key) && q.sex === (gmale ? "M" : "F") && (!gnm || !okName(gnm[1]) || !q.name || S.fold(q.name) === S.fold(gnm[1])); })[0];
        var gp = gsame || person("G" + (++nGrand), "");
        gp.sex = gmale ? "M" : "F";
        if (gnm && okName(gnm[1])) { person(gp.key, gnm[1]); grest = grest.slice(gnm[0].length); } else if (gnm) grest = grest.slice(gnm[0].length - gnm[1].length);
        merge(gp, readEvents(grest, ctx)); gp.occ = gp.occ || occIn(grest); mention(gp.key);
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
      if (st.length) kin.push({ key: key, name: pe.name, label: label, stops: st });
    }
    put("ME", "self", "");
    var pq = me.sought ? me.sought.poss : "your ";
    put("F", "father", pq + "father"); put("M", "mother", pq + "mother"); put("S", "spouse", "your partner");
    me.order.filter(function (k) { return /^G/.test(k); }).forEach(function (k) { put(k, P[k].sex === "M" ? "grandfather" : "grandmother", P[k].sex === "M" ? "your grandfather" : "your grandmother"); });
    me.order.filter(function (k) { return /^C/.test(k); }).forEach(function (k) { put(k, "child", "your child"); });
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
      people.push({ role: role, rel: rel || "", name: pe.name, given: pe.given, surname: pe.surname, givenWord: pe.given, place: place || null, presumed: false, occupation: pe.occ || "", label: key === sk ? "" : lab(key), events: evOf(pe), key: key });
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
              HOLDS: HOLDS, YEAR_MIN: YEAR_MIN, YEAR_MAX: YEAR_MAX, readLife: readLife, gazWants: gazWants, gazMerge: gazMerge, didYouMean: didYouMean, aliasMerge: aliasMerge };
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
            return getJSON("place-aliases.json").catch(function () { return null; }).then(function (al) {
              var givenRows = g.rows || [], given = S.buildGiven(givenRows), map = S.buildMap(rows);
              if (al && al.aliases) aliasMerge(map, rows, al.aliases, given);
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
            surname: r[5][i], surnameTyped: pe.surname, occupation: pe.occupation || "", counts: pe.counts || null, told: !!pe.told, presumed: !!pe.presumed, me: !!pe.me, sought: !!pe.sought, key: pe.key, place: pe.place && infos[pe.place.row.i] ? infos[pe.place.row.i].name : "", label: pe.label || "",
            events: (pe.events || []).map(function (e) { var inf = e.place && infos[e.place.row.i]; return { type: e.type, year: e.year, place: inf ? inf.name : (e.place ? e.place.word : e.text ? e.text + " (not among the Atlas's places)" : ""), country: inf ? inf.countryName : "", cause: e.cause || "" }; }) };
        });
        return { facts: facts, plan: buildPlan(facts), mort: r[2], names: { people: out }, people: out, life: parsed.life || null };
      });
    }
    return { getJSON: getJSON, load: load, resolveMissing: resolveMissing, placeInfo: placeInfo, gather: gather, surname: surname };
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
      var legs = [], stopMarks = [], mortPgs = [];
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
          E.cap.append(line(cur.info, ye, evMap.get(cur.info), at.moving ? "On the way from " : "", tl.mode === "age" ? "age " + t : (cur.guess ? "year not told, placed between the years that were" : f.born != null ? "age " + (t - f.born) : "")));
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
        mortPgs.forEach(function (m) { var on = t >= m.f && t <= m.t; m.pg.setStyle({ opacity: on ? .85 : .12, fillOpacity: on ? .06 : 0 }); });
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
        /* An event that has no area (the Second World War, a pandemic) belongs to every place and so to none on a map: it is said once, for the years of the story. */
        var wide = ((mort && mort.events) || []).filter(function (e) { return e.g && e.f <= t1 && e.t >= t0 && !seen[e.id]; });
        if (wide.length) {
          E.moments.append(el("h4", "In the wider world in those years"));
          var uw = el("ul", null, "lf-events");
          wide.slice(0, 4).forEach(function (e) {
            var li = el("li", null, "lf-ev lf-ev-" + e.ty);
            li.append(el("b", e.f + (e.t !== e.f ? "\u2013" + e.t : "") + " "), el("span", typeLabel(e.ty), "lf-tag"), document.createTextNode(" " + e.n + ". " + short(e.says, 200) + (e.toll && e.toll.text ? " " + short(e.toll.text, 160) : "")));
            uw.append(li);
          });
          E.moments.append(uw);
        }
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
        /* the mass-mortality events (epidemics, famines, wars, genocides) of the countries in the story, as black outlines, and only those of the
           years the story gives: a story with no year draws none, and says so */
        var yrs = [];
        stops.forEach(function (st) { if (tl.mode === "year" && st.t != null) yrs.push(st.t); });
        kin.forEach(function (k) { k.stops.forEach(function (st) { if (st.year != null) yrs.push(st.year); }); });
        if (f.born != null) yrs.push(f.born); if (f.endYear != null) yrs.push(f.endYear);
        if (mort && mort.events && yrs.length) {
          var y0 = Math.min.apply(null, yrs), y1 = Math.max.apply(null, yrs), pts = [], seenEv = Object.create(null);
          function addPt(i) { if (i && i.lat != null) pts.push(i); }
          stops.concat(anc).forEach(function (st) { addPt(st.info); });
          kin.forEach(function (k) { k.stops.forEach(function (st) { addPt(st.info); }); });
          /* an event is shown when its area covers one of the story's places, in the story's years: not every event of the country */
          pts.forEach(function (i) {
            S.eventsAt(mort.events, i.lat, i.lon, (y0 + y1) / 2, (y1 - y0) / 2).forEach(function (ev) {
              if (seenEv[ev.id || ev.n] || !ev.poly || !ev.poly.length) return; seenEv[ev.id || ev.n] = 1;
              var pg = L.polygon(ev.poly, { color: "#000", weight: 1.6, opacity: .85, fillColor: "#000", fillOpacity: .06, dashArray: "5 4" }).addTo(g);
              pg.bindTooltip(ev.f + (ev.t !== ev.f ? "\u2013" + ev.t : "") + " " + typeLabel(ev.ty) + ": " + ev.n + " (covers " + i.name + ")", { sticky: true, className: "lf-mort-tip" });
              if (pg.bringToBack) pg.bringToBack();
              mortPgs.push({ pg: pg, f: ev.f, t: ev.t });
            });
          });
          if (can) setT(Number(E.slider.value));
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
      function ground(info, years, span) {
        var wrap = el("div", null, "lf-ground"), eras = info.eras || [];
        if (eras.length) {
          wrap.append(el("h5", "Who held this ground, era by era"));
          var ul = el("ul", null, "lf-eras"), now = new Date().getFullYear();
          eras.forEach(function (e) {
            var li = el("li", null, years.some(function (y) { return y >= e.from && y < e.to; }) ? "on" : ""), fl = flagFor(info, e.from);
            if (fl) { var im = el("img", null, "lf-flag"); im.src = base + "fl/" + encodeURIComponent(fl) + ".svg"; im.alt = ""; im.title = "From the flag history of today's " + info.countryName + " in " + e.from; li.append(im); }
            var rg = info.regimes && info.regimes[e.regime];
            li.append(el("b", e.from + "\u2013" + (e.to >= now ? "now" : e.to) + " "), document.createTextNode(e.polity + (rg && rg.label && rg.label !== e.polity ? " (" + rg.label + ")" : "")));
            ul.append(li);
          });
          wrap.append(ul);
        } else wrap.append(el("p", "The Atlas has no era table for this area, so there is no era-by-era list here: it is " + (info.countryName || "today's country") + " as it is now.", "lf-filed"));
        /* only the years the people there could have lived through (a war of 306 is no part of a life that began in 1874) */
        var evs = mort && info.lat != null ? (span ? S.eventsAt(mort.events, info.lat, info.lon, (span[0] + span[1]) / 2, (span[1] - span[0]) / 2) : S.eventsAt(mort.events, info.lat, info.lon, 1500, 1500)) : [];
        if (!evs.length && span && mort && info.lat != null) wrap.append(el("p", "The Atlas lists no mass-mortality event covering this area in " + span[0] + "\u2013" + span[1] + ".", "lf-filed"));
        if (evs.length) {
          wrap.append(el("h5", "Mass mortality whose area covers " + info.name + (span ? ", " + span[0] + "\u2013" + span[1] : "")));
          var ue = el("ul", null, "lf-eras lf-mort");
          evs.slice(0, 8).forEach(function (e) { var li = el("li", null, "lf-now-" + e.ty); li.append(el("b", e.f + (e.t !== e.f ? "\u2013" + e.t : "") + " "), document.createTextNode(typeLabel(e.ty) + ": " + e.n)); ue.append(li); });
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
        var info = g.info, es = g.es, kicks = [], whens = [], years = [], look = [], kinds = [], win = null, span = null, unbounded = false, withSources = false;
        n++;
        es.forEach(function (e) {
          if (kicks.indexOf(e.kicker) < 0) kicks.push(e.kicker);
          if (e.whenText && whens.indexOf(e.whenText) < 0) whens.push(e.whenText);
          if (e.year != null) years.push(e.year);
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
        then.append(ground(info, years, span));
        where.append(el("h4", "Where to search"));
        var ul = el("ul", null, "lf-look"); look.forEach(function (x) { ul.append(el("li", x)); }); where.append(ul);
        if ((info.older || []).length) where.append(el("p", info.name + " is also found as " + info.older.slice(0, 8).join(", ") + ". Search all of them.", "lf-filed"));
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
        put(info, { kicker: kicker + (tags ? " · " + tags : ""), whenText: when(x, y), year: y, ageText: x.age != null ? (x.approx ? "about age " : "age ") + x.age : "", look: look, kinds: kinds, win: win, withSources: true, prefix: "", span: spanOf(y, x.role) }, true);
      });
      (f.kin || []).forEach(function (k) {
        var who = ((k.label ? k.label + " " : "") + (k.name || "")).trim() || "Family";
        k.stops.forEach(function (st) {
          if (!st.info) return;
          var y = st.year, born = st.role === "born", look = [born ? "Look for the baptism or birth entry of " + (k.name || "this person") + ": it names the parents, and the godparents are often relatives." : "Look for where " + (k.name || "this person") + " lived here: a census or population register and the parish records."];
          put(st.info, { kicker: who + (born ? " · born here" : st.role === "origin" ? " · from here" : st.role === "married" ? " · married here" : " · lived here"), whenText: y != null ? String(y) : "", year: y, ageText: "", look: look, kinds: born ? ["b"] : [], win: born && y != null ? [y - 1, y + 1] : null, withSources: true, prefix: who + ", ", span: spanOf(y, st.role) });
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
        var t = (e.type === "born" ? "Born" : e.type === "married" ? "Married" : e.type === "lived" ? "Lived" : "Died") + (e.year != null ? " " + e.year : "") + (e.place ? (e.year != null ? ", " : " in ") + e.place : "") + (e.cause ? " (" + e.cause + ")" : "");
        c.append(el("div", t, "lf-card-place lf-card-ev"));
      });
      if (pe.occupation) c.append(el("div", "Work: " + pe.occupation, "lf-card-forms"));
      if (pe.counts) { var cb = []; ["children", "grandchildren", "sons", "daughters"].forEach(function (k2) { if (pe.counts[k2] != null) cb.push(pe.counts[k2] + " " + k2); }); if (cb.length) c.append(el("div", "Told: " + cb.join(", ") + " (not named)", "lf-card-forms")); }
      var f = forms(pe); if (f.length) c.append(el("div", "Also written: " + f.join(", "), "lf-card-forms"));
      if (pe.presumed) c.append(el("div", "Surname assumed the same", "lf-card-forms"));
      return c;
    }
    var tree = el("div", null, "lf-tree"), others = (people || []).slice();
    function gen(cls) { var g = el("div", null, "lf-gen " + (cls || "")); tree.append(g); return g; }
    var gps = (people || []).filter(function (x) { return x.role === "grandfather" || x.role === "grandmother"; }), sp = (people || []).filter(function (x) { return x.role === "spouse"; })[0];
    if (gps.length) { var g0 = gen("lf-grand"); gps.forEach(function (x) { var lb = x.label || x.role; g0.append(card(x, lb.charAt(0).toUpperCase() + lb.slice(1))); }); tree.append(el("div", null, "lf-tie")); }
    if (fa || mo) { var g1 = gen("lf-parents"); var cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
      if (fa) g1.append(card(fa, self.sought && fa.label ? cap(fa.label) : "Father")); if (mo) g1.append(card(mo, self.sought && mo.label ? cap(mo.label) : "Mother")); tree.append(el("div", null, "lf-tie")); }
    /* the people between are drawn even when the story names nobody there: "my grandfather was Ivan" has a parent between him and you */
    function gap(n, above) { for (var i = 0; i < n; i++) { if (!above) tree.append(el("div", null, "lf-tie")); var gg = gen("lf-gap"), ph = el("div", null, "lf-card lf-card-you"); ph.append(el("div", n > 1 && i === 0 ? "Parent of yours, not named" : "Your parent, not named", "lf-card-role"), el("div", "Not in the story yet: name them to add them here", "lf-card-place")); gg.append(ph); if (above) tree.append(el("div", null, "lf-tie")); } }
    if (self.me && !fa && !mo && gps.length) gap(1, true);
    var g2 = gen(); g2.append(card(self, self.sought ? self.label : self.me ? "You" : self.rel ? "Your " + self.rel.replace(/-/g, " ") : "The person you asked about"));
    var sps = (people || []).filter(function (x) { return x.role === "spouse"; });
    sps.forEach(function (x, i) { g2.append(card(x, x.label && (i || x.told) ? x.label.charAt(0).toUpperCase() + x.label.slice(1) : self.me ? "Your partner" : self.rel === "father" ? "Wife, your mother" : self.rel === "mother" ? "Husband, your father" : "Spouse")); });
    var kids = (people || []).filter(function (x) { return x.role === "child"; });
    var rl = String(self.rel || ""), between = /grand/.test(rl) && !self.me ? (rl.match(/great/g) || []).length + 1 : 0;
    if (between) gap(between);
    if (self.me) { if (kids.length) { tree.append(el("div", null, "lf-tie")); var g4 = gen(); kids.forEach(function (x) { g4.append(card(x, "Your child")); }); } return tree; }
    if (self.sought || !self.rel) return tree;   /* "you" are on the tree only when the story says they are related */
    tree.append(el("div", null, "lf-tie"));
    var g3 = gen(), you = el("div", null, "lf-card lf-card-you"); you.append(el("div", "You", "lf-card-role"), el("div", "who is asking", "lf-card-place")); g3.append(you);
    return tree;
  }
  api.namesBlock = namesBlock; api.treeBlock = treeBlock; api.lifeBlock = lifeBlock; api.lifeEvents = lifeEvents; api.aliasMerge = aliasMerge; api.gazWants = gazWants; api.gazMerge = gazMerge; api.didYouMean = didYouMean;
  api.createLoader = createLoader; api.createJourney = createJourney; api.el = el;
})();
