/* TELL US WHO YOU'RE LOOKING FOR: a sentence with blanks, an animated line from where they started to where they arrived, and a short
   plan of what to look at first.

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
      var items2 = bv.slice(0, 6).map(function (c) { return { text: volLabel(c) + (c.held ? ", held by " + c.held : "") + (c.access ? ", access: " + c.access : ""), href: o.href }; });
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
      mv.slice(0, 4).forEach(function (c) { items3.push({ text: volLabel(c), href: o.href }); });
      dv.slice(0, 4).forEach(function (c) { items3.push({ text: volLabel(c), href: o.href }); });
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
    ps.slice(0, 6).forEach(function (p) { arr.push({ text: p.name + " (" + p.kind + "; access: " + p.access + ")", href: p.url }); });
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

  var api = { toYear: toYear, suggest: suggest, windows: windows, volumesFor: volumesFor, captionAt: captionAt, progress: progress, between: between,
              givenForms: givenForms, volLabel: volLabel, buildPlan: buildPlan, HOLDS: HOLDS, YEAR_MIN: YEAR_MIN, YEAR_MAX: YEAR_MAX };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  window.raLookingFor = api;

  /* ---- the page ---------------------------------------------------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function link(text, href, cls) { var a = el("a", text, cls); a.href = href; return a; }

  function boot() {
    var form = $("lf-form");
    if (!form) return;
    var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
    var data = null, loading = null;
    var chosen = { from: null, to: null };

    function getJSON(path) { return fetch(BASE + path).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }

    /* The place rows, as the search box and the Read page load them: the main index, the tail shards and the quiet places. */
    function load() {
      if (data) return Promise.resolve(data);
      if (loading) return loading;
      loading = getJSON("index.json").then(function (d) {
        var rows = d.places.slice(), tail = d.tail && d.tail.cells ? Object.keys(d.tail.cells) : [];
        return Promise.all(tail.map(function (k) { return getJSON(d.tail.dir + k + ".json").then(function (c) { rows = rows.concat(c.places || []); }).catch(function () {}); }))
          .then(function () { return getJSON("index-quiet.json").then(function (q) { rows = rows.concat(q.places || []); }).catch(function () {}); })
          .then(function () { return getJSON("given-names.json").catch(function () { return { rows: [] }; }); })
          .then(function (g) { data = { rows: rows, countries: d.countries || {}, given: S.buildGiven(g.rows || []) }; return data; });
      }).catch(function (e) { loading = null; throw e; });
      return loading;
    }

    /* A combobox for a place: type, pick from the list with the mouse or the arrows, or leave it as free text. */
    function picker(key, input, list) {
      var shown = [], at = -1;
      function close() { list.hidden = true; list.textContent = ""; input.setAttribute("aria-expanded", "false"); at = -1; input.removeAttribute("aria-activedescendant"); }
      function choose(s) {
        chosen[key] = s.r; input.value = s.r.n + (data.countries[s.r.cc] ? ", " + data.countries[s.r.cc] : "");
        input.classList.add("is-set"); close();
      }
      function mark() {
        [].forEach.call(list.children, function (li, i) { li.setAttribute("aria-selected", i === at ? "true" : "false"); });
        if (at > -1) input.setAttribute("aria-activedescendant", list.children[at].id);
      }
      function open() {
        if (!data) return;
        shown = suggest(data.rows, input.value, 8);
        list.textContent = "";
        if (!shown.length) { close(); return; }
        shown.forEach(function (s, i) {
          var li = el("li", null, "lf-opt"); li.id = list.id + "-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
          li.append(el("b", s.r.n), el("span", (data.countries[s.r.cc] || s.r.cc || "") + (s.via ? " · also " + s.via : "")));
          li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(s); });
          list.append(li);
        });
        list.hidden = false; input.setAttribute("aria-expanded", "true");
      }
      input.addEventListener("focus", function () { load().then(function () { if (input.value) open(); }).catch(function () {}); });
      input.addEventListener("input", function () {
        chosen[key] = null; input.classList.remove("is-set");
        load().then(open).catch(function () { $("lf-status").textContent = "The place list did not load. Check your connection and try again."; });
      });
      input.addEventListener("keydown", function (e) {
        if (list.hidden) return;
        if (e.key === "ArrowDown") { at = Math.min(shown.length - 1, at + 1); mark(); e.preventDefault(); }
        else if (e.key === "ArrowUp") { at = Math.max(0, at - 1); mark(); e.preventDefault(); }
        else if (e.key === "Enter" && at > -1) { choose(shown[at]); e.preventDefault(); }
        else if (e.key === "Escape") close();
      });
      input.addEventListener("blur", function () { setTimeout(close, 120); });
    }
    picker("from", $("lf-from"), $("lf-from-list"));
    picker("to", $("lf-to"), $("lf-to-list"));

    /* A place typed but not picked: take the top suggestion only when the text is exactly its name, so a guess is never silent. */
    function resolve(key, input) {
      if (chosen[key]) return chosen[key];
      var t = S.fold(input.value.split(",")[0]);
      if (!t) return null;
      var hits = suggest(data.rows, t, 8).filter(function (s) { return S.fold(s.r.n) === t || s.via === t; });
      return hits.length === 1 ? hits[0].r : null;
    }

    function placeInfo(row, regionsP) {
      return Promise.all([getJSON("p/" + encodeURIComponent(row.i) + ".json").catch(function () { return null; }), regionsP]).then(function (r) {
        var p = r[0], regs = r[1], region = p && regs ? regs.regions.filter(function (x) { return x.id === p.region; })[0] : null;
        return { row: row, p: p, name: row.n, lat: p ? p.lat : row.y, lon: p ? p.lon : row.x, cc: row.cc, countryName: (data.countries[row.cc] || row.cc || ""),
          older: p ? (p.names || []).map(function (n) { return n.n; }) : [], cols: p ? p.collections || [] : [],
          eras: region ? region.eras : null, regimes: regs ? regs.regimes : null, region: region, href: BASE + "place/" + encodeURIComponent(row.i) + "/" };
      });
    }

    var map = null, L = null, layers = null, played = null;

    $("lf-go").addEventListener("click", function (ev) {
      ev.preventDefault();
      var say = $("lf-status");
      say.textContent = ""; say.className = "lf-status";
      var left = toYear($("lf-left").value), born = toYear($("lf-born").value);
      if ($("lf-left").value.trim() && left == null) { say.textContent = "Type the year as four digits, for example 1905, or leave it empty."; say.className = "lf-status lf-bad"; return; }
      if ($("lf-born").value.trim() && born == null) { say.textContent = "Type the birth year as four digits, or leave it empty."; say.className = "lf-status lf-bad"; return; }
      if (born != null && left != null && left < born) { say.textContent = "They cannot leave before they are born. Check the two years."; say.className = "lf-status lf-bad"; return; }
      say.textContent = "Reading the Atlas…";
      var regionsP = null;
      load().then(function () {
        regionsP = getJSON("regions.json").catch(function () { return null; });
        var fromRow = resolve("from", $("lf-from")), toRow = resolve("to", $("lf-to"));
        if (!fromRow && $("lf-from").value.trim()) { say.textContent = "The Atlas did not recognise \"" + $("lf-from").value.trim() + "\" as one place. Pick one from the list that appears as you type, or try an older name."; say.className = "lf-status lf-bad"; throw new Error("stop"); }
        return Promise.all([fromRow ? placeInfo(fromRow, regionsP) : null, toRow ? placeInfo(toRow, regionsP) : null,
          getJSON("providers.json").catch(function () { return { providers: [] }; }), getJSON("mortality.json").catch(function () { return null; })]);
      }).then(function (r) {
        var from = r[0], to = r[1], provs = (r[2].providers || []), mort = r[3];
        var pname = Object.create(null);
        provs.forEach(function (x) { pname[x.id] = x.name; });
        if (from) from.pname = pname;
        if (to) to.pname = pname;
        var holds = form.elements["holds"].value || "story", name = $("lf-name").value.trim().slice(0, 80);
        var rel = $("lf-rel").value;
        var toCc = to ? to.cc : "", toProviders = toCc ? provs.filter(function (p) { return (p.countries || []).indexOf(toCc) > -1; }) : [];
        var given = name ? S.givenIn(name.split(/\s+/)[0], data.given, null) : [];
        var facts = { rel: rel, name: name, holds: holds, left: left, born: born, from: from, to: to, providers: toProviders, given: given, base: BASE };
        var plan = buildPlan(facts);
        draw(facts, plan, mort);
        say.textContent = "";
      }).catch(function (e) { if (e && e.message !== "stop") { say.textContent = "Something did not load. Check your connection and try again."; say.className = "lf-status lf-bad"; } });
    });

    /* ---- the results ---- */

    function draw(f, plan, mort) {
      $("lf-out").hidden = false;
      drawJourney(f, mort);
      var ol = $("lf-plan"); ol.textContent = "";
      plan.forEach(function (s) {
        var li = el("li", null, "lf-step"); li.id = "lf-s-" + s.id;
        var head = el("h3"); head.append(el("span", String(s.n), "lf-num"), " " + s.title);
        li.append(head, el("p", s.why, "lf-why"));
        var ul = el("ul", null, "lf-items");
        s.items.forEach(function (it) { var x = el("li"); if (it.href) x.append(link(it.text, it.href)); else x.textContent = it.text; ul.append(x); });
        li.append(ul);
        (s.links || []).forEach(function (l) { var p = el("p"); p.append(link(l.text + " →", l.href)); li.append(p); });
        if (s.ask) { var a = el("p", null, "lf-ask"); a.append(el("b", "Ask: "), s.ask); li.append(a); }
        if (s.not) { var n = el("p", null, "lf-not"); n.append(el("b", "Do not conclude: "), s.not); li.append(n); }
        ol.append(li);
      });
      var out = $("lf-out");
      if (out.scrollIntoView) out.scrollIntoView({ behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    function drawJourney(f, mort) {
      var box = $("lf-journey"), a = f.from, b = f.to, left = f.left;
      var y0 = f.born != null ? f.born : (left != null ? left - 25 : null), y1 = left != null ? Math.min(left + 12, YEAR_MAX) : null;
      var slider = $("lf-year"), cap = $("lf-cap"), moments = $("lf-moments"), playBtn = $("lf-play");
      box.hidden = false;
      var can = y0 != null && y1 != null && (a || b);
      $("lf-time").hidden = !can;
      moments.textContent = "";
      if (!a && !b) { $("lf-map").hidden = true; cap.textContent = "Choose where they started and where they arrived to see the journey."; return; }
      $("lf-map").hidden = false;

      function line(info, year) {
        var c = captionAt(info, year), d = el("div", null, "lf-capline");
        d.append(el("b", info.name + ", " + year + ": "), document.createTextNode(c.polity ? "under " + c.polity : "no era table"));
        if (c.regime) d.append(el("span", " (" + c.regime + ")", "lf-regime"));
        if (c.tracked && c.filedUnder.length) d.append(el("div", "Records of this period: " + c.filedUnder.join(", "), "lf-filed"));
        if (!c.tracked && c.note) d.append(el("div", c.note, "lf-filed"));
            return d;
      }
      function setYear(y) {
        cap.textContent = "";
        if (a) cap.append(line(a, y));
        if (b) cap.append(line(b, y));
        slider.value = String(y);
        $("lf-yearout").textContent = String(y);
        var t = progress(left, y);
        slider.setAttribute("aria-valuetext", y + ". " + (t >= 1 ? "Arrived in " + (b ? b.name : "the new country") : t > 0 ? "On the way" : "Still in " + (a ? a.name : "the first place")));
        if (layers && a && b) { var pt = between([a.lat, a.lon], [b.lat, b.lon], t); layers.dot.setLatLng(pt); layers.line.setLatLngs([[a.lat, a.lon], pt]); }
      }
      if (can) {
        slider.min = String(y0); slider.max = String(y1); slider.value = String(y0);
        setYear(y0);
        slider.oninput = function () { stop(); setYear(Number(slider.value)); };
        var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
        playBtn.hidden = reduce;
        var raf = null;
        var stop = function () { if (raf) cancelAnimationFrame(raf); raf = null; playBtn.textContent = "▶ Play"; };
        playBtn.onclick = function () {
          if (raf) { stop(); return; }
          playBtn.textContent = "❚❚ Pause";
          var from = Number(slider.value) >= y1 ? y0 : Number(slider.value), t0 = null, span = (y1 - from) * 450;
          function tick(ts) {
            if (t0 == null) t0 = ts;
            var k = Math.min(1, (ts - t0) / span), y = Math.round(from + (y1 - from) * k);
            setYear(y);
            if (k < 1) raf = requestAnimationFrame(tick); else stop();
          }
          raf = requestAnimationFrame(tick);
        };
        if (played) { try { played(); } catch (e) { /* the previous drawing's animation is cancelled by its own handler */ } }
        played = stop;
      } else {
        cap.textContent = "";
        if (a) cap.append(line(a, left != null ? left : 1900));
        if (b) cap.append(line(b, left != null ? left : 1900));
        if (left == null) cap.append(el("p", "Add a year and this becomes a timeline you can play.", "cap"));
      }

      /* the still version: what changed in these years, in date order, as a list that needs no animation */
      if (y0 != null && y1 != null) {
        var mid = Math.round((y0 + y1) / 2), half = Math.ceil((y1 - y0) / 2) + 1, items = [];
        [a, b].forEach(function (info) {
          if (!info) return;
          var ev = mort && info.lat != null ? S.eventsAt(mort.events, info.lat, info.lon, mid, half).slice(0, 6) : [];
          S.aroundYear(info.eras || [], ev, mid, half).forEach(function (x) { if (x.y >= y0 - 1 && x.y <= y1 + 1) items.push({ y: x.y, t: info.name + ": " + x.title + (x.note && x.kind === "event" ? " (" + x.note + ")" : "") }); });
        });
        items.sort(function (p, q) { return p.y - q.y; });
        if (items.length) {
          moments.append(el("h4", "What changed around then"));
          var ul = el("ul");
          items.slice(0, 10).forEach(function (x) { var li = el("li"); li.append(el("b", x.y + " "), x.t); ul.append(li); });
          moments.append(ul);
          moments.append(el("p", "These are events in the area in those years, not facts about them.", "cap"));
        }
      }

      /* the map */
      S.loadLeaflet().then(function (LL) {
        L = LL;
        if (!map) {
          map = L.map($("lf-map"), { scrollWheelZoom: false });
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Tiles © Esri" }).addTo(map);
        }
        if (layers) layers.group.remove();
        var g = L.layerGroup().addTo(map), pts = [];
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
          if (can) setYear(Number(slider.value));
        }
        if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(.3)); else if (pts.length) map.setView(pts[0], 8);
        setTimeout(function () { map.invalidateSize(); }, 60);
      }).catch(function () { $("lf-map").textContent = "The map could not load (the tile service is on another site). The caption and the plan are unaffected."; });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
