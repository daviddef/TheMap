/* THE FAMILY FIRST (the story page, /read/#story). The page had grown long, with no order and too much at once, and it is about a whole family, not one person; the map and
   the sources must not disappear. So it leads with the family, each box a way in; then the three searches to do first; then the one person chosen, with
   their life as a line, the map following them and the books drawn against the years; and everything else on shelves.

   This file arranges. It finds nothing and says nothing about a person: every record, book, source and letter comes from story-engine.js and story-todo.js, and is put in
   one place. The only words of its own are the chart's (which years a book has) and what to try when a search finds nothing. Ticks live in this page only. */
(function (root) {
  "use strict";

  var KIND = { b: { one: "birth", many: "births", cap: "Births" }, m: { one: "marriage", many: "marriages", cap: "Marriages" }, d: { one: "death", many: "deaths", cap: "Deaths" }, a: { one: "arrival", many: "arrivals", cap: "Arrivals" } };
  var SHELVES = [["books", "sp-books"], ["web", "sp-web"], ["archives", "sp-arch"], ["names", "sp-names"], ["times", "sp-setting"], ["plan", "sp-plan"]];
  var WEB_KINDS = /^(index|aggregator|volunteer|commercial|memorial)$/;
  var FREE = /^(free|account)$/;

  function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function cap(t) { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); }
  function yrs(a, b) { return a === b ? String(a) : a + "–" + b; }

  /* ---- who a line of the plan is about ------------------------------------------------------------------------------------------------------- */
  /* a brother or sister is drawn from the story's list of them, so they are matched by name */
  function isAbout(ref, person) {
    if (!ref || !person) return false;
    if (ref === person) return true;
    return person.role === "sibling" && /^(brother|sister)$/.test(ref.rel || "") && (ref.name || "") === (person.name || "");
  }
  function assign(people, items) {
    var by = (people || []).map(function (p) { return (items || []).filter(function (it) { return (it.who || []).some(function (r) { return isAbout(r, p); }); }); });
    var loose = (items || []).filter(function (it) { return !(people || []).some(function (p) { return (it.who || []).some(function (r) { return isAbout(r, p); }); }); });
    return { by: by, loose: loose };
  }
  function nameOf(p) { if (!p) return ""; if (p.me) return "You"; return p.name || (p.label ? cap(p.label) : cap(p.rel || p.role || "")); }
  function helpsOf(item) { var out = []; (item.who || []).forEach(function (r) { var n = nameOf(r); if (n && out.indexOf(n) < 0) out.push(n); }); return out; }
  function idOf(item, step) { return item.title + "|" + step.title; }
  function stepsOf(items) {
    var out = [], seen = Object.create(null);
    (items || []).forEach(function (it) { (it.steps || []).forEach(function (s) { var id = idOf(it, s); if (!seen[id]) { seen[id] = 1; out.push({ id: id, item: it, step: s }); } }); });
    return out;
  }
  /* the life as a line: in the order of the years; what has no year comes after, as the plan gave it */
  function yearOf(s) { return s.ev && s.ev.w ? s.ev.w[0] : null; }
  function lifeLine(steps) {
    return steps.map(function (x, i) { return { x: x, i: i, y: yearOf(x.step) }; })
      .sort(function (a, b) { return (a.y == null ? 1 : 0) - (b.y == null ? 1 : 0) || (a.y || 0) - (b.y || 0) || a.i - b.i; }).map(function (o) { return o.x; });
  }
  function yearLabel(s) { var e = s.ev; if (!e || !e.w) return ""; return (e.by ? "by " : e.est ? "about " : "") + yrs(e.w[0], e.w[1]); }
  function shortTitle(s) { return String(s.title || "").split(" · ")[0]; }
  function placeOf(s) { var e = s.ev; return !e ? "" : e.place || (e.info && e.info.name) || ""; }

  /* ---- the three to do first, for the family as a whole -------------------------------------------------------------------------------------- */
  function chooseThree(items, n) {
    var all = [];
    (items || []).forEach(function (it, ci) {
      (it.steps || []).forEach(function (s, si) {
        if (/^(Whether they are alive|Their descendants)/.test(s.title) || (!s.ev && !s.href)) return;
        var e = s.ev, score = (s.href ? 3 : e && !e.abroad ? 1.5 : e ? 1 : 0.5) + Math.max(0, (it.who || []).length - 1) * 2 - ci * 0.5 - si * 1.5;
        if (/may be alive/i.test(s.why || "")) score -= 3;
        if (e && e.neighbours) score -= 1;
        all.push({ id: idOf(it, s), item: it, step: s, helps: helpsOf(it), score: score, at: all.length });
      });
    });
    all.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    var out = [], used = [];
    all.forEach(function (c) { if (out.length < (n || 3) && used.indexOf(c.item) < 0) { out.push(c); used.push(c.item); } });
    all.forEach(function (c) { if (out.length < (n || 3) && out.indexOf(c) < 0 && !out.some(function (o) { return o.step.title === c.step.title; })) out.push(c); });
    return out;
  }

  /* ---- which book covers these years -------------------------------------------------------------------------------------------------------- */
  function overlap(a, b) { var lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); return hi >= lo ? [lo, hi] : null; }
  function merge(spans) {
    var out = [];
    spans.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (s) {
      var l = out[out.length - 1]; if (l && s[0] <= l[1] + 1) l[1] = Math.max(l[1], s[1]); else out.push([s[0], s[1]]);
    });
    return out;
  }
  /* books that share years go one above another, never end to end */
  function stack(bars) {
    var ends = [];
    bars.sort(function (a, b) { return a.from - b.from || a.to - b.to; }).forEach(function (b) {
      var l = 0; while (l < ends.length && b.from <= ends[l]) l++;
      b.lane = l; ends[l] = b.to;
    });
    return ends.length;
  }
  function barsOf(info, kind, w, spansOf) {
    var out = [];
    ((info && info.cols) || []).filter(Boolean).forEach(function (c) {
      spansOf(c, kind).forEach(function (s) {
        var o = overlap(s, w);
        out.push({ from: s[0], to: s[1], covers: !!o, has: o, title: String(c.title || "Register").replace(/\s+/g, " ").trim(), href: c.url || info.href || "", own: !!c.url, access: c.access || "" });
      });
    });
    return out;
  }
  /* what the story says was already searched, with nothing found, for this kind of record at this place */
  function searchedFor(kind, place, searched) {
    var what = { b: /^(baptism|birth|record)$/, m: /^(marriage|record)$/, d: /^(death|burial|record)$/ }[kind];
    if (!what) return [];
    return (searched || []).filter(function (x) { return what.test(x.what || "") && x.from != null && (!x.place || fold(x.place) === fold(String(place || "").replace(/\s*\([^)]*\)/, ""))); })
      .map(function (x) { return [x.from, x.to != null ? x.to : x.from]; });
  }
  var NEAR_ROWS = 5;
  function chart(step, spansOf, searched) {
    var e = step && step.ev;
    if (!e || !e.w || !e.info || e.info.isCountry || !spansOf || !/^[bmd]$/.test(e.kind)) return null;
    var w = e.w, kind = e.kind, home = { name: e.info.name, km: 0, home: true, href: e.info.href, lat: e.info.lat, lon: e.info.lon, bars: barsOf(e.info, kind, w, spansOf) };
    var others = (e.near || e.info.neigh || []).filter(function (n) { return n && n.info; }).map(function (n) { return { name: n.info.name, km: Math.max(1, Math.round(n.km)), href: n.info.href, lat: n.info.lat, lon: n.info.lon, bars: barsOf(n.info, kind, w, spansOf) }; })
      .filter(function (r) { return r.bars.length; });
    if (!home.bars.length && !others.length) return null;
    function covers(r) { return r.bars.some(function (b) { return b.covers; }); }
    var near = others.filter(covers).sort(function (a, b) { return a.km - b.km; });
    /* the map shows every neighbour with a book of this kind, filled where one has some of the years */
    var onMap = [home].concat(others).filter(function (r) { return r.lat != null && r.lon != null; }).map(function (r) { return { name: r.name, km: r.km, home: !!r.home, lat: r.lat, lon: r.lon, covers: r.bars.some(function (b) { return b.covers; }) }; });
    var more = Math.max(0, near.length - NEAR_ROWS); near = near.slice(0, NEAR_ROWS);
    if (!near.length) near = others.slice().sort(function (a, b) { return a.km - b.km; }).slice(0, 2);
    var rows = [home].concat(near), all = [].concat.apply([], rows.map(function (r) { return r.bars; }));
    /* the stretch drawn: the wanted years, and the books within two generations of them */
    var lo = Math.min(w[0] - 10, Math.max(w[0] - 60, Math.min.apply(null, [w[0]].concat(all.map(function (b) { return b.from; })))));
    var hi = Math.max(w[1] + 10, Math.min(w[1] + 60, Math.max.apply(null, [w[1]].concat(all.map(function (b) { return b.to; })))));
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    rows.forEach(function (r) {
      var shown = r.bars.filter(function (b) { return b.to >= lo && b.from <= hi; });
      r.outside = r.bars.length - shown.length; r.bars = shown; r.lanes = Math.max(1, stack(r.bars));
    });
    var homeHas = merge(home.bars.filter(function (b) { return b.covers; }).map(function (b) { return b.has; }));
    var whole = homeHas.length === 1 && homeHas[0][0] <= w[0] && homeHas[0][1] >= w[1];
    var hit = rows.slice(1).filter(covers), say, K = KIND[kind], want = yrs(w[0], w[1]);
    if (whole) say = "The Atlas lists " + K.many + " for " + want + " at " + home.name + ".";
    else if (homeHas.length) say = "At " + home.name + " the Atlas lists " + K.many + " for only " + homeHas.map(function (s) { return yrs(s[0], s[1]); }).join(" and ") + " of " + want + ".";
    else say = "No book the Atlas lists for " + home.name + " has " + K.many + " for " + want + ".";
    if (!whole) say += hit.length ? " " + (hit.length + more) + " neighbouring place" + (hit.length + more === 1 ? " has" : "s have") + " some of those years: a neighbour’s book is a lead, not proof the family used it." : " It lists none for the neighbouring places either.";
    var step2 = hi - lo > 150 ? 50 : hi - lo > 80 ? 20 : 10, ticks = [];
    for (var y = Math.ceil(lo / step2) * step2; y <= hi; y += step2) ticks.push(y);
    return { kind: kind, want: [w[0], w[1]], lo: lo, hi: hi, rows: rows, map: onMap, more: more, say: say, ticks: ticks, covered: !!(homeHas.length || hit.length), searched: searchedFor(kind, home.name, searched).filter(function (s) { return overlap(s, w); }), near: hit.map(function (r) { return r.name + " (" + r.km + " km)"; }) };
  }
  /* the map's words for the same thing */
  function mapSay(c) {
    var K = KIND[c.kind], want = yrs(c.want[0], c.want[1]);
    return "Filled dots: places where the Atlas lists " + K.many + " for some of " + want + ". Hollow dots: places with " + K.one + " books, none for those years.";
  }
  function barSay(bar, row, c) {
    var K = KIND[c.kind], want = yrs(c.want[0], c.want[1]);
    var cov = bar.covers ? "covers " + yrs(bar.has[0], bar.has[1]) + " of the years wanted, " + want : "does not cover the years wanted, " + want + (bar.to < c.want[0] ? ": it ends in " + bar.to : ": it begins in " + bar.from);
    return K.cap + " " + yrs(bar.from, bar.to) + ", " + row.name + ": " + cov;
  }
  function pct(c, y) { return Math.max(0, Math.min(100, (y - c.lo) / (c.hi - c.lo) * 100)); }

  /* ---- when there is nothing --------------------------------------------------------------------------------------------------------------- */
  var TELLS = { b: "The parents’ names, when and where, and often the godparents, who may be relatives.", m: "Both families, ages, birthplaces and the witnesses.", d: "Age, birthplace, parents, a husband or wife.", a: "Age, nationality, the ship or port, and who travelled with them." };
  function tells(step) { return (step.ev && TELLS[step.ev.kind]) || step.why || "What it records is not known until it is read."; }
  function fallback(step, near) {
    var told = /If nothing turns up: (.+?\.)(?=\s|$)/.exec(step.detail || "");
    if (told) return cap(told[1]);
    var k = step.ev && step.ev.kind, n = near && near.length ? "the books of " + near.slice(0, 3).join(", ") : "the neighbouring parishes";
    if (k === "b") return "Try the years either side, " + n + ", the marriage or death entry (it may name the parents and the birthplace) and every spelling.";
    if (k === "m") return "Try the other partner’s parish, " + n + ", the years either side, both the church and the civil register, and every spelling.";
    if (k === "d") return "Try the gravestones, " + n + ", the years either side and every spelling.";
    return "Ask the older relatives, then the archive under « Write to », and try every spelling.";
  }

  /* ---- the map follows the person -------------------------------------------------------------------------------------------------------------- */
  function kinOf(f, p) {
    return ((f && f.kin) || []).filter(function (k) {
      return (k.key && p.key && k.key === p.key) || (k.name && p.name && fold(k.name) === fold(p.name)) || (!p.key && k.label && p.role && new RegExp("\\b" + p.role + "\\b", "i").test(k.label));
    })[0] || null;
  }
  /* the person's own places as the journey reads them; null where the story's own route is theirs, or where it gives them no place */
  function mapFacts(f, p) {
    if (!f || !p || p.role === "self") return null;
    var k = kinOf(f, p), stops = k ? (k.stops || []).filter(function (s) { return s.info; }) : [];
    if (!stops.length) return null;
    var born = stops.filter(function (s) { return s.role === "born" && s.year != null; })[0];
    return Object.assign({}, f, { route: stops.map(function (s) { return { info: s.info, year: s.year != null ? s.year : null, approx: !!s.approx, age: null, role: s.role, ev: s.ev, said: s.said }; }), kin: [], ancestors: [], from: null, to: null,
      born: born ? born.year : null, left: null, endYear: null, name: p.name, near: [] });
  }

  var pure = { isAbout: isAbout, assign: assign, nameOf: nameOf, helpsOf: helpsOf, stepsOf: stepsOf, lifeLine: lifeLine, yearLabel: yearLabel, chooseThree: chooseThree, chart: chart, barSay: barSay, mapSay: mapSay, stack: stack, searchedFor: searchedFor, fallback: fallback, tells: tells, mapFacts: mapFacts, WEB_KINDS: WEB_KINDS };

  /* ==== the page ============================================================================================================================== */
  /* o: { doc, spansOf, onPerson(person|null, mode), sections: id -> element } */
  function create(o) {
    var D = o.doc || document;
    function $(id) { return D.getElementById(id); }
    function el(tag, text, cls) { var e = D.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
    function link(text, href, cls) { var a = el("a", text, cls); a.href = href; if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; } return a; }
    function button(text, cls, go) { var b = el("button", text, cls); b.type = "button"; if (go) b.addEventListener("click", go); return b; }
    function all(node, sel) { return node ? [].slice.call(node.querySelectorAll(sel)) : []; }
    function empty(id) { var n = $(id); if (n) n.textContent = ""; return n; }
    var still = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    function show(node, where) { if (node && node.scrollIntoView) node.scrollIntoView({ behavior: still ? "auto" : "smooth", block: where || "start" }); }

    /* what is chosen survives a redraw (typing redraws the page); a new story clears it */
    var S = { sel: "", picked: false, ev: "", shelf: "books", marks: Object.create(null), free: false, mode: "person" };
    var entries = [], plan = null, items = [], g = null, lifeNode = null, have = Object.create(null), places = false;

    /* ---- the family: every box is a way in ---------------------------------------------------------------------------------------------- */
    function keyOf(p, role) { return [p.role, p.key || "", p.name || "", role].join("|"); }
    function takeTree(tree) {
      entries = [];
      all(tree, ".lf-card").forEach(function (c) {
        var p = c.raPerson;
        if (!p) { c.classList.add("sp-fam-gap"); return; }
        var roleEl = c.querySelector(".lf-card-role"), nameEl = c.querySelector(".lf-card-name");
        var role = roleEl ? [].filter.call(roleEl.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.nodeValue; }).join("").trim() : "";
        /* the box keeps the role, the name and one line about them; the rest of what the story says moves to the person's own panel */
        var facts = el("div", null, "sp-who-more"), line = null;
        [].slice.call(c.children).forEach(function (n) {
          if (n === roleEl || n === nameEl) return;
          if (!line && n.classList && n.classList.contains("lf-card-place")) { line = n; return; }
          facts.append(n);
        });
        /* where the story gives no line about them the box says nothing: the family reading can know less than the words do, so it must not claim nothing was told */
        if (!line && p.empty) c.append(el("div", "Add what you know about them", "sp-fam-line"));
        var pick = button(null, "sp-fam-pick"); pick.setAttribute("aria-pressed", "false");
        while (nameEl && nameEl.firstChild) pick.append(nameEl.firstChild);
        if (nameEl) nameEl.append(pick);
        var count = el("div", "", "sp-fam-todo"); c.append(count); c.classList.add("sp-fam-card");
        var e = { key: keyOf(p, role), card: c, person: p, role: role, name: pick.textContent, facts: facts, items: [], pick: pick, count: count };
        pick.addEventListener("click", function () { select(e, true); });
        entries.push(e);
      });
    }
    function looseEntry(it, host) {
      var c = el("div", null, "lf-card sp-fam-card sp-fam-loose"), pick = button(it.title, "sp-fam-pick"), count = el("div", "", "sp-fam-todo");
      var nameEl = el("div", null, "lf-card-name"); nameEl.append(pick);
      c.append(el("div", "Also in the plan", "lf-card-role"), nameEl, count); pick.setAttribute("aria-pressed", "false");
      var e = { key: "plan|" + it.title, card: c, person: null, role: "Also in the plan", name: it.title, facts: el("div", null, "sp-who-more"), items: [it], pick: pick, count: count, loose: true };
      pick.addEventListener("click", function () { select(e, true); });
      host.append(c); return e;
    }
    function counts() {
      entries.forEach(function (e) {
        var st = stepsOf(e.items), left = st.filter(function (x) { return !S.marks[x.id]; }).length;
        e.count.textContent = !plan ? "" : !st.length ? "Nothing suggested yet" : left ? left + " still to find" : "All " + st.length + " tried";
      });
    }
    function subject() {
      var withSteps = entries.filter(function (e) { return e.items.length; });
      var self = entries.filter(function (e) { return e.person && e.person.role === "self"; })[0];
      return self && (!plan || self.items.length) ? self : withSteps[0] || self || entries[0] || null;
    }
    function current() { return entries.filter(function (e) { return e.key === S.sel; })[0] || null; }
    function select(e, byHand, ev) {
      if (!e) return;
      if (byHand) { S.picked = true; S.hand = true; }
      var changed = S.sel !== e.key; S.sel = e.key; if (changed) { S.ev = ""; S.mode = "person"; } if (ev) S.ev = ev;
      entries.forEach(function (x) { var on = x === e; x.pick.setAttribute("aria-pressed", on ? "true" : "false"); x.card.classList.toggle("is-on", on); });
      drawWho(e, changed || byHand);
    }

    /* ---- the chosen person ---------------------------------------------------------------------------------------------------------------- */
    function drawWho(e, redrawMap) {
      var head = empty("sp-who-head"), facts = $("sp-who-facts");
      if (!head || !facts) return;
      while (facts.firstChild) facts.removeChild(facts.firstChild);
      if (!e) { head.append(el("h2", "The places in your story", "sp-who-h")); drawLine(null); if (lifeNode) $("sp-life").hidden = false; person(null, redrawMap); return; }
      var no = e.card.getAttribute("data-no"), h = el("h2", null, "sp-who-h");
      if (no) h.append(el("span", no, "lf-no"));
      h.append(D.createTextNode(e.name));
      head.append(el("p", e.role, "sp-who-role"), h);
      e.items.forEach(function (it) {
        var box = el("div", null, "sp-who-about");
        if (e.items.length > 1 || it.title.indexOf(e.name) !== 0) box.append(el("b", it.title, "sp-who-card"));
        if (it.why) box.append(el("p", it.why, "sp-who-why"));
        [["What is known", it.known], ["Still open", it.unknown]].forEach(function (x) { if (!x[1] || !x[1].length) return; var u = el("ul", null, "sp-todo-known"); x[1].forEach(function (k) { u.append(el("li", k)); }); box.append(el("b", x[0], "sp-who-card"), u); });
        facts.append(box);
      });
      if (e.facts.firstChild) facts.append(e.facts);
      var life = $("sp-life"); if (life) life.hidden = !(lifeNode && (!e.person || e.person.role === "self" || e === subject()));
      drawLine(e);
      person(e.person, redrawMap);
    }
    var shownPerson;
    function person(p, redraw) { if (!redraw && shownPerson === p) return; shownPerson = p; if (o.onPerson) o.onPerson(p, S.mode); }

    function mark(id) { return S.marks[id] || ""; }
    function drawLine(e) {
      var host = empty("sp-line"); if (!host) return;
      empty("sp-event");
      if (!e || !plan) { event(null); return; }
      var line = lifeLine(stepsOf(e.items));
      if (!line.length) { event(null); host.append(el("p", "The plan suggests nothing for them yet. Add where they were born or lived, and a rough year.", "sp-fine")); return; }
      var cur = line.filter(function (x) { return x.id === S.ev; })[0] || line.filter(function (x) { return x.step.ev && x.step.ev.w; })[0] || line[0];
      S.ev = cur.id;
      host.append(el("h3", "What to look for, in the order it happened", "sp-sub-h"));
      var ol = el("ol", null, "sp-life-line");
      line.forEach(function (x) {
        var li = el("li"), b = button(null, "sp-life-ev", function () { S.ev = x.id; S.hand = true; all(ol, ".sp-life-ev").forEach(function (n) { n.setAttribute("aria-pressed", n === b ? "true" : "false"); }); drawEvent(x); });
        var m = mark(x.id);
        b.setAttribute("aria-pressed", x === cur ? "true" : "false"); if (m) b.classList.add("is-" + m);
        b.append(el("span", yearLabel(x.step) || "year not told", "sp-life-y"), el("span", shortTitle(x.step), "sp-life-t"));
        var where = placeOf(x.step); if (where) b.append(el("span", where, "sp-life-p"));
        if (m) b.append(el("span", m === "found" ? "Found" : "Nothing there", "sp-life-m"));
        li.append(b); ol.append(li);
      });
      host.append(ol);
      drawEvent(cur);
    }
    /* the event shown: the map is told which books lie around it. `hand` is a tap just made, which the map may answer by showing them */
    function event(c) { var hand = !!S.hand; S.hand = false; if (o.onEvent) o.onEvent(c, hand); }
    function tickRow(id) {
      var row = el("div", null, "sp-tick");
      [["found", "Found it"], ["nil", "Nothing there"]].forEach(function (x) {
        var b = button(x[1], "sp-tick-b sp-tick-" + x[0], function () {
          if (S.marks[id] === x[0]) delete S.marks[id]; else S.marks[id] = x[0];
          var at = D.activeElement === b ? [b.parentNode.getAttribute("data-where"), id, x[0]] : null;
          counts(); drawThree(); var e = current(); if (e) drawLine(e);
          if (at) { var host = $(at[0] === "three" ? "sp-three-list" : "sp-event"); all(host, ".sp-tick").forEach(function (r) { if (r.getAttribute("data-id") === at[1]) { var n = r.querySelector(".sp-tick-" + at[2]); if (n) n.focus(); } }); }
        });
        b.setAttribute("aria-pressed", S.marks[id] === x[0] ? "true" : "false"); row.append(b);
      });
      row.setAttribute("data-id", id);
      return row;
    }
    function writeTo() {
      var s = plan && plan.sections.filter(function (x) { return x.key === "write"; })[0];
      return s ? s.items.filter(function (i) { return i.draft; })[0] || s.items.filter(function (i) { return !i.gap; })[0] || null : null;
    }
    function openLetter() {
      openShelf("plan");
      var d = $("sp-plan-write") && $("sp-plan-write").querySelector("details.sp-todo-draft");
      if (d) { d.open = true; show(d, "center"); var sm = d.querySelector("summary"); if (sm) sm.focus({ preventScroll: true }); }
    }
    function drawEvent(x) {
      var host = empty("sp-event"); if (!host) return;
      var s = x.step, box = el("article", null, "sp-ev"), h = el("h3", null, "sp-ev-h");
      if (s.href && /^(https?:\/\/|\/)/.test(s.href)) h.append(link(s.title, s.href)); else h.textContent = s.title;
      box.append(h);
      var helps = helpsOf(x.item); if (helps.length > 1) box.append(el("p", "Helps " + helps.join(", "), "sp-ev-helps"));
      if (s.why) box.append(el("p", s.why, "sp-ev-why"));
      if (s.detail) box.append(el("p", s.detail, "sp-ev-det"));
      if (s.links && s.links.length) { var row = el("p", null, "sp-todo-links"); s.links.forEach(function (l) { row.append(link(l.t, l.href, "k-pill sp-todo-link")); }); box.append(row); }
      var t = tickRow(x.id); t.setAttribute("data-where", "event"); box.append(t);
      if (mark(x.id) === "nil") box.append(next(s));
      var c = chart(s, o.spansOf, g && g.facts && g.facts.searched);
      if (c) box.append(chartBlock(c));
      if (!c || !c.covered) box.append(noBook(s, c));
      host.append(box);
      event(c);
    }
    function next(s) { var c = chart(s, o.spansOf, g && g.facts && g.facts.searched), p = el("p", null, "sp-next"); p.append(el("b", "Next: "), D.createTextNode(fallback(s, c && c.near))); return p; }
    function noBook(s, c) {
      var box = el("div", null, "sp-nobook");
      function col(head) { var d = el("div", null, "sp-nobook-c"); d.append(el("h4", head)); box.append(d); return d; }
      col("What it may tell you").append(el("p", tells(s)));
      var who = col("Who to ask"), w = writeTo();
      if (s.ev && s.ev.abroad) who.append(el("p", (s.links && s.links.length ? "Start with the sources linked above, and the" : "The") + " registry office, parish or archive of " + (s.ev.place || "the place") + ". The plan drafts no letter for it."));
      else if (w) {
        var p = el("p"); if (w.href && /^(https?:\/\/|\/)/.test(w.href)) p.append(link(w.title, w.href)); else p.textContent = w.title; who.append(p);
        if (w.draft) who.append(button("Open the request letter", "sp-ghost", openLetter));
        else who.append(button("See who to write to", "sp-ghost", function () { openShelf("plan"); show($("sp-plan-write")); }));
      } else who.append(el("p", "The older relatives first; the plan names no archive for this yet."));
      col("If there is nothing").append(el("p", fallback(s, c && c.near)));
      return box;
    }
    function chartBlock(c) {
      var box = el("div", null, "sp-chart"), K = KIND[c.kind], note = el("div", null, "sp-chart-book"); note.setAttribute("aria-live", "polite");
      box.append(el("h4", "Which book covers these years?"), el("p", c.say, "sp-chart-say"));
      /* no book anywhere near these years: the sentence says it, and an empty grid would add nothing */
      if (!c.rows.some(function (r) { return r.bars.length; })) {
        var far = c.rows.reduce(function (n, r) { return n + (r.outside || 0); }, 0);
        if (far) box.append(el("p", far + (far === 1 ? " book is" : " books are") + " listed for other years: see Church books below.", "sp-fine"));
        return box;
      }
      var grid = el("div", null, "sp-chart-grid"); grid.setAttribute("role", "group"); grid.setAttribute("aria-label", K.cap + " books against the years " + yrs(c.want[0], c.want[1]));
      var axis = el("div", null, "sp-chart-row sp-chart-axis"), track0 = el("div", null, "sp-chart-track"); axis.append(el("div", K.cap, "sp-chart-lab"), track0);
      c.ticks.forEach(function (y) { var t = el("span", String(y), "sp-chart-tick"); t.style.left = pct(c, y) + "%"; if (pct(c, y) > 90) t.classList.add("is-end"); track0.append(t); });
      grid.append(axis);
      var first = null;
      c.rows.forEach(function (r) {
        var row = el("div", null, "sp-chart-row" + (r.home ? " is-home" : "")), lab = el("div", null, "sp-chart-lab"), track = el("div", null, "sp-chart-track");
        var nm = el("span", null, "sp-chart-place"); nm.append(r.href ? link(r.name, r.href) : D.createTextNode(r.name)); lab.append(nm, el("span", r.home ? "the place" : r.km + " km", "sp-chart-km"));
        track.style.height = (r.lanes * 26 + 4) + "px";
        var band = el("span", null, "sp-chart-want"); band.style.left = pct(c, c.want[0]) + "%"; band.style.width = Math.max(0.8, pct(c, c.want[1] + 1) - pct(c, c.want[0])) + "%"; band.setAttribute("aria-hidden", "true"); track.append(band);
        r.bars.forEach(function (b) {
          var n = button(yrs(b.from, b.to), "sp-chart-bar " + (b.covers ? "is-covers" : "is-not"), function () { pickBar(); });
          n.style.left = pct(c, b.from) + "%"; n.style.width = Math.max(2.2, pct(c, b.to + 1) - pct(c, b.from)) + "%"; n.style.top = (b.lane * 26 + 3) + "px";
          n.setAttribute("aria-label", barSay(b, r, c)); n.title = barSay(b, r, c); n.setAttribute("aria-pressed", "false");
          function pickBar() {
            all(grid, ".sp-chart-bar").forEach(function (m) { m.setAttribute("aria-pressed", m === n ? "true" : "false"); });
            note.textContent = "";
            note.append(el("b", b.title), el("span", barSay(b, r, c) + "." + (b.access ? " " + (b.access === "account" ? "Free with an account." : cap(b.access) + ".") : "")));
            if (b.href) note.append(link(b.own ? "Open the book" : "Open the place page that lists it", b.href, "sp-ghost sp-chart-open"));
          }
          if (b.covers && !first) first = pickBar;
          track.append(n);
        });
        if (r.home) c.searched.forEach(function (s) {
          if (s[1] < c.lo || s[0] > c.hi) return;
          var h = el("span", null, "sp-chart-searched"); h.style.left = pct(c, s[0]) + "%"; h.style.width = Math.max(1, pct(c, s[1] + 1) - pct(c, s[0])) + "%"; h.title = "Already searched, as your story says: " + yrs(s[0], s[1]) + ", nothing found"; track.append(h);
        });
        if (!r.bars.length) track.append(el("span", r.outside ? "none near these years" : "no " + K.one + " book listed", "sp-chart-none"));
        row.append(lab, track); grid.append(row);
      });
      var scroll = el("div", null, "sp-chart-scroll"); scroll.append(grid); box.append(scroll);
      var key = el("p", null, "sp-chart-key");
      function swatch(cls, text) { var s = el("span"); s.append(el("i", null, cls), D.createTextNode(text)); key.append(s); }
      swatch("sp-key-want", "The years you need: " + yrs(c.want[0], c.want[1])); swatch("sp-key-covers", "A book that has some of them");
      swatch("sp-key-not", "A book that does not");
      if (c.searched.length) swatch("sp-key-searched", "Already searched, as your story says, nothing found: " + c.searched.map(function (s) { return yrs(s[0], s[1]); }).join(", "));
      box.append(key);
      var rest = c.rows.reduce(function (n, r) { return n + (r.outside || 0); }, 0);
      if (rest || c.more) box.append(el("p", [rest ? rest + " more " + (rest === 1 ? "book lies" : "books lie") + " outside these years" : "", c.more ? c.more + " more neighbouring place" + (c.more === 1 ? "" : "s") + " with books for them" : ""].filter(Boolean).join("; ") + ": see Church books below.", "sp-fine"));
      box.append(note); if (first) first(); else note.append(el("span", "No bar here has the years wanted. Tap one to see what it does hold."));
      return box;
    }

    /* ---- the three to do first ------------------------------------------------------------------------------------------------------------- */
    function drawThree() {
      var list = empty("sp-three-list"), done = $("sp-three-done"); if (!list) return;
      var three = plan ? chooseThree(items, 3) : [];
      var sec = $("sp-three"); if (sec && plan) sec.hidden = !three.length;
      var tried = three.filter(function (t) { return mark(t.id); }).length;
      if (done) done.textContent = three.length ? tried + " of " + three.length + " tried" : "";
      three.forEach(function (t, i) {
        var m = mark(t.id), li = el("li", null, "sp-three-item" + (m ? " is-" + m : "")), s = t.step;
        var top = el("div", null, "sp-three-h"); top.append(el("span", m === "found" ? "✓" : m === "nil" ? "✕" : String(i + 1), "sp-three-n"));
        var h = el("h3"); if (s.href && /^(https?:\/\/|\/)/.test(s.href)) h.append(link(s.title, s.href)); else h.textContent = s.title; top.append(h); li.append(top);
        if (t.helps.length) { var p = el("p", null, "sp-three-helps"); p.append(el("span", "Helps")); t.helps.forEach(function (n) { p.append(el("b", n)); }); li.append(p); }
        else li.append(el("p", t.item.title, "sp-three-helps"));
        var why = String(s.why || ""); li.append(el("p", why.length > 150 ? why.slice(0, 149).replace(/\s+\S*$/, "") + "…" : why, "sp-three-why"));
        if (m === "nil") li.append(next(s));
        li.append(button("Show me where", "sp-three-show", function () {
          var e = entries.filter(function (x) { return x.items.indexOf(t.item) > -1; })[0];
          if (!e) return;
          select(e, true, t.id); var who = $("sp-who"); show(who); var b = who && who.querySelector('.sp-life-ev[aria-pressed="true"]'); if (b) b.focus({ preventScroll: true });
        }));
        var tk = tickRow(t.id); tk.setAttribute("data-where", "three"); li.append(tk);
        list.append(li);
      });
    }

    /* ---- the shelves ---------------------------------------------------------------------------------------------------------------------- */
    function tabOf(name) { return $("sp-tab-" + name); }
    function panelOf(name) { return $(SHELVES.filter(function (s) { return s[0] === name; })[0][1]); }
    function shelfOf(node) {
      for (var i = 0; i < SHELVES.length; i++) { var p = $(SHELVES[i][1]); if (p && (p === node || (p.contains && p.contains(node)))) return SHELVES[i][0]; }
      return "";
    }
    function paintShelves() {
      var names = SHELVES.map(function (s) { return s[0]; }).filter(function (n) { return have[n]; });
      var on = names.indexOf(S.shelf) > -1 ? S.shelf : names[0] || "";
      SHELVES.forEach(function (s) {
        var t = tabOf(s[0]), p = $(s[1]), yes = !!have[s[0]];
        if (t) { t.hidden = !yes; t.setAttribute("aria-selected", s[0] === on ? "true" : "false"); t.tabIndex = s[0] === on ? 0 : -1; }
        if (p) p.hidden = s[0] !== on;
        var a = D.querySelector('#sp-rail [data-go="' + s[1] + '"]'); if (a) a.hidden = !yes;
      });
      var sec = $("sp-else"); if (sec) sec.hidden = !names.length;
      var grp = $("sp-grp-research"); if (grp) grp.hidden = !names.length;
      all(D.getElementById("sp-rail"), "a.sub:not(.psub)").forEach(function (a) { a.hidden = !have.books; });
    }
    function openShelf(name) { if (!have[name]) return; S.shelf = name; paintShelves(); }
    function wireTabs() {
      var bar = $("sp-tabs"); if (!bar || bar.raWired) return; bar.raWired = true;
      SHELVES.forEach(function (s) { var t = tabOf(s[0]); if (t) t.addEventListener("click", function () { openShelf(s[0]); }); });
      bar.addEventListener("keydown", function (ev) {
        var names = SHELVES.map(function (s) { return s[0]; }).filter(function (n) { return have[n]; }), i = names.indexOf(S.shelf);
        var to = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? names.length - 1 : null;
        if (to == null || !names.length) return;
        ev.preventDefault(); openShelf(names[(to + names.length) % names.length]); var t = tabOf(S.shelf); if (t) t.focus();
      });
      var free = $("sp-free"); if (free) free.addEventListener("click", function () { S.free = !S.free; paintFree(); });
    }
    function paintFree() {
      var b = $("sp-free"), web = $("sp-web"); if (!b || !web) return;
      b.setAttribute("aria-pressed", S.free ? "true" : "false");
      var hidden = 0;
      all(web, "li[data-access]").forEach(function (li) { var no = S.free && !FREE.test(li.getAttribute("data-access")); li.hidden = no; if (no) hidden++; });
      var say = $("sp-free-say"); if (say) say.textContent = S.free ? (hidden ? hidden + " that may cost money, need a visit or are not checked are hidden." : "Everything here is free or free with an account.") : "";
    }
    function placeBlock(sec, host, cls) {
      var h = sec.querySelector("h3"), k = sec.querySelector(".lf-stop-k"), box = el("section", null, "lf-stop sp-part " + (cls || ""));
      var head = el("div", null, "sp-part-h"); head.append(el("h3", h ? h.textContent : "")); if (k) head.append(el("div", k.textContent, "lf-stop-k"));
      box.append(head); host.append(box); return box;
    }
    /* each place's card is taken apart: the books stay, the rest goes to its own shelf under the place's name */
    function shelveStops(stops) {
      var web = empty("sp-web-places"), arch = empty("sp-arch-places"), times = empty("sp-times-places"), near = empty("sp-near"), q = empty("sp-plan-questions");
      all(stops, ".lf-stop").forEach(function (sec) {
        var name = (sec.querySelector("h3") || {}).textContent || "";
        all(sec, '[data-shelf="near"]').forEach(function (n) { near.append(n); });
        all(sec, '[data-shelf="question"]').forEach(function (n) { var h = n.querySelector("h4"); if (h) h.textContent = "Open question: " + name; q.append(n); });
        var t = all(sec, '[data-shelf="times"]');
        if (t.length) { var tb = placeBlock(sec, times, "sp-part-times"); t.forEach(function (n) { tb.append(n); }); }
        var w = all(sec, '[data-shelf="web"]'), a = all(sec, '[data-shelf="archives"]'), webItems = [];
        a.forEach(function (n) { all(n, "li[data-kind]").forEach(function (li) { if (WEB_KINDS.test(li.getAttribute("data-kind"))) webItems.push(li); }); });
        all(sec, "ul[data-collections]").forEach(function (u) { var h = u.previousElementSibling, d = el("div"); if (h && h.tagName === "H5") d.append(h); d.append(u); w.unshift(d); });
        if (w.length || webItems.length) {
          var wb = placeBlock(sec, web, "sp-part-web");
          if (webItems.length) { var u = el("ul", null, "lf-vols lf-srcs"); webItems.forEach(function (li) { u.append(li); }); wb.append(el("h5", "Family websites and indexes"), u); }
          w.forEach(function (n) { wb.append(n); });
        }
        if (a.length) {
          var ab = placeBlock(sec, arch, "sp-part-arch");
          a.forEach(function (n) {
            all(n, "ul.lf-srcs").forEach(function (u) {
              var lis = [].slice.call(u.children).filter(function (li) { return !li.classList.contains("lf-cat"); }); if (lis.length <= 8) return;
              var d = el("details", null, "sp-more"), rest = el("ul", null, u.className); d.append(el("summary", "And " + (lis.length - 6) + " more"), rest);
              lis.slice(6).forEach(function (li) { rest.append(li); }); u.after(d);
            });
            all(n, "ul.lf-srcs").forEach(function (u) { if (!u.children.length) { var h = u.previousElementSibling; u.remove(); if (h && h.tagName === "H5" && /^Archives and sources/.test(h.textContent)) h.textContent = h.textContent.replace("Archives and sources", "Sources") + ": see Family websites"; } });
            ab.append(n);
          });
        }
      });
    }
    /* the books shelf: every place folds under its own name, so the shelf opens short and is read a place at a time */
    function foldStops(stops) {
      all(stops, ".lf-stop").forEach(function (sec, i) {
        var head = sec.querySelector(".lf-stop-h"), name = (sec.querySelector("h3") || {}).textContent || "";
        if (!head) return;
        var d = el("details", null, "sp-place-fold"); d.append(el("summary", "Books and where to search: " + name));
        [].slice.call(sec.children).forEach(function (n) { if (n !== head) d.append(n); });
        sec.append(d);
      });
    }
    function drop(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
    /* the plan's own cards, each to its shelf. `drawn` is what story-todo.js rendered. */
    function shelvePlan(drawn) {
      var where = { desk: "sp-books-desk", near: "sp-books-near", ground: "sp-books-ground", era: "sp-times-era", home: "sp-plan-home", open: "sp-plan-open", write: "sp-plan-write", village: "sp-plan-village", moves: "sp-plan-moves" };
      Object.keys(where).forEach(function (k) { empty(where[k]); });
      /* the plan can be drawn again (the burial grounds arrive later): what the last drawing added to the places' own lists comes off first */
      [$("sp-stops"), $("sp-web-places")].forEach(function (n) { all(n, ".sp-from-plan").forEach(drop); });
      var notes = empty("sp-plan-notes"), today = empty("sp-plan-today"), fine = empty("sp-plan-fine"), caveats = empty("sp-times-note"), namesNote = empty("sp-names-note");
      all(drawn, ".sp-todo-note").forEach(function (n) { notes.append(n); });
      /* today's other moves: the first line is «Do these three first», the rest (write, ask, visit) stay as they were */
      var ol = drawn.querySelector(".sp-today");
      if (ol) { var lis = [].slice.call(ol.children); drop(lis[0]); all(ol, ".sp-today-n").forEach(drop); if (ol.children.length) today.append(el("h3", "Write, ask, visit", "sp-todo-h"), ol); }
      all(drawn, ".sp-todo-card").forEach(function (card) { var to = where[card.getAttribute("data-key")]; if (to) $(to).append(card); });
      all(drawn, ".sp-fine").forEach(function (n) { fine.append(n); });
      /* a neighbour the place's own list already shows is not listed twice: what only the plan says of it (a doubtful position, the nearest books in time) goes to that line */
      var listed = Object.create(null); all($("sp-stops"), ".lf-neigh-l > li").forEach(function (li) { var a = li.querySelector("a"); if (a && !listed[a.getAttribute("href")]) listed[a.getAttribute("href")] = li; });
      all($("sp-books-near"), ".sp-todo-card > ul > li").forEach(function (li) {
        var a = li.querySelector(".sp-todo-t a"), there = a && listed[a.getAttribute("href")]; if (!there) return;
        var why = li.querySelector(".sp-todo-why"), doubt = why && /Position doubtful.*$/.exec(why.textContent || ""), det = li.querySelector(".sp-todo-det"), regs = li.querySelector(".sp-todo-regs");
        if (doubt) there.append(el("p", doubt[0], "lf-filed sp-from-plan"));
        if (det) there.append(el("p", det.textContent, "lf-filed sp-from-plan"));
        if (det && regs) { regs.classList.add("sp-from-plan"); there.append(regs); }
        drop(li);
      });
      all($("sp-books-near"), ".sp-todo-card").forEach(function (c) { if (!c.querySelector("li")) drop(c); });
      /* an index the websites shelf already lists is listed there, with the plan's words about it */
      var onWeb = Object.create(null); all($("sp-web-places"), "a").forEach(function (a) { if (!onWeb[a.getAttribute("href")]) onWeb[a.getAttribute("href")] = a; });
      all($("sp-books-desk"), ".sp-todo-card > ul > li").forEach(function (li) {
        var a = li.querySelector(".sp-todo-t a"), there = a && onWeb[a.getAttribute("href")], row = there && there.closest && there.closest("li"); if (!row) return;
        all(li, ".sp-todo-why, .sp-todo-det").forEach(function (n) { row.append(el("span", n.textContent, "lf-filed lf-evsay sp-from-plan")); });
        drop(li);
      });
      var sec = function (k) { return plan.sections.filter(function (s) { return s.key === k; })[0]; };
      /* «no mapped event covers the place» is said nowhere else, so that card stays; a card of events is the places' own lists over again */
      var happening = sec("happening"), quiet = happening && happening.items.length && happening.items.every(function (i) { return i.gap; });
      if (quiet) all(drawn, '.sp-todo-card[data-key="happening"]').forEach(function (c) { $("sp-times-era").append(c); });
      if (happening && !quiet) caveats.append(el("p", "Events are listed under each place whose mapped area they cover. The Atlas can say a place was in the area; it cannot say anyone in your family was harmed.", "sp-fine"));
      /* the names themselves are the census block's, on the same shelf; what the plan adds to them is its advice, said once each */
      var names = sec("names");
      if (names) {
        namesNote.append(el("p", "Where a name is common is a good place to ask about it and to read the parish. It does not show that anyone there is your family.", "sp-fine"));
        var said = Object.create(null);
        names.items.forEach(function (i) { if (i.advice && !said[i.advice]) { said[i.advice] = true; namesNote.append(el("p", i.advice, "sp-fine")); } });
      }
    }
    function planIndex() {
      var host = empty("sp-plan-people"); if (!host || !plan) return;
      var withSteps = entries.filter(function (e) { return e.items.length; });
      if (!withSteps.length) return;
      host.append(el("h3", "Person by person", "sp-todo-h"));
      var ul = el("ul", null, "sp-index");
      withSteps.forEach(function (e) {
        var li = el("li"), b = button("Show on the family", "sp-ghost", function () { select(e, true); show($("sp-who")); e.pick.focus({ preventScroll: true }); });
        b.setAttribute("aria-label", "Show " + e.name + " on the family");
        var n = stepsOf(e.items).length, t = el("span"); t.append(el("b", e.name), D.createTextNode(" · " + n + (n === 1 ? " thing to find" : " things to find")));
        li.append(t, b); ul.append(li);
      });
      host.append(ul);
    }
    function haveShelves() {
      function has(id) { var n = $(id); return !!(n && (n.children.length || (n.textContent || "").trim())); }
      have = Object.create(null);
      if (!places) { have.names = has("sp-namesbox"); return; }
      have.books = has("sp-stops") || has("sp-books-desk");
      have.web = has("sp-web-places"); have.archives = has("sp-arch-places"); have.names = has("sp-namesbox");
      have.times = has("sp-times-places") || has("sp-moments") || has("sp-times-era"); have.plan = true;
    }

    /* a jump between a name and its person opens the shelf first, or chooses the person */
    var wired = false;
    function wire() {
      if (wired) return; wired = true; wireTabs();
      var who = $("sp-who"), names = $("sp-names");
      if (who) who.addEventListener("click", function (ev) { var j = ev.target.closest && ev.target.closest(".lf-jump"); if (j) openShelf("names"); }, true);
      if (names) names.addEventListener("click", function (ev) {
        var j = ev.target.closest && ev.target.closest(".lf-jump"); if (!j) return;
        var no = /\d+/.exec(j.textContent), e = no && entries.filter(function (x) { return x.card.getAttribute("data-no") === no[0]; })[0];
        if (e) select(e, true);
      }, true);
    }

    return {
      /* the page has drawn the story: the tree (already numbered), the place cards, the names and the life block */
      draw: function (graph, parts) {
        wire(); g = graph; places = !!parts.here; lifeNode = parts.life || null; plan = null; items = []; shownPerson = undefined;
        if (parts.tree) takeTree(parts.tree); else entries = [];
        empty("sp-fam-more"); empty("sp-three-list");
        ["sp-books-desk", "sp-books-near", "sp-books-ground", "sp-times-era", "sp-times-note", "sp-names-note", "sp-plan-notes", "sp-plan-home", "sp-plan-open", "sp-plan-write", "sp-plan-village", "sp-plan-moves", "sp-plan-today", "sp-plan-people", "sp-plan-fine"].forEach(empty);
        shelveStops(parts.stops); foldStops(parts.stops);
        var three = $("sp-three"); if (three) three.hidden = !places;
        if (places) { var l = $("sp-three-list"); if (l) l.append(el("li", "Working out where to start…", "sp-fine")); var d = $("sp-three-done"); if (d) d.textContent = ""; }
        var who = $("sp-who"); if (who) who.hidden = !(entries.length || places);
        haveShelves(); paintShelves(); paintFree();
        counts();
        var again = current(); if (!S.picked || !again) { S.sel = ""; S.picked = false; again = subject(); }
        if (again) { S.sel = again.key; entries.forEach(function (x) { var on = x === again; x.pick.setAttribute("aria-pressed", on ? "true" : "false"); x.card.classList.toggle("is-on", on); }); }
        drawWho(again, true);
      },
      /* the plan is worked out (and again when the burial grounds arrive) */
      plan: function (p, drawn) {
        plan = p; var sec = p && p.sections && p.sections.filter(function (s) { return s.key === "people"; })[0]; items = sec ? sec.items : [];
        var more = empty("sp-fam-more"), tree = entries.filter(function (e) { return !e.loose; });
        var hand = assign(tree.map(function (e) { return e.person; }), items);
        tree.forEach(function (e, i) { e.items = hand.by[i]; });
        entries = tree.concat(more ? hand.loose.map(function (it) { return looseEntry(it, more); }) : []);
        shelvePlan(drawn); planIndex(); haveShelves(); paintShelves(); paintFree(); counts(); drawThree();
        if (!p || !p.sections || !p.sections.length) { var l = empty("sp-three-list"); if (l) l.append(el("li", (p && p.notes && p.notes[0]) || "Add a place to the story and the plan fills in.", "sp-fine")); var t = $("sp-three"); if (t) t.hidden = !places; }
        var e = current(); if (!e || (!S.picked && e !== subject())) e = subject();
        if (e) { var same = S.sel === e.key; S.sel = e.key; entries.forEach(function (x) { var on = x === e; x.pick.setAttribute("aria-pressed", on ? "true" : "false"); x.card.classList.toggle("is-on", on); }); drawWho(e, !same); }
      },
      failed: function (msg) { var l = empty("sp-three-list"); if (l) l.append(el("li", msg, "sp-fine")); var n = empty("sp-plan-notes"); if (n) n.append(el("p", msg, "sp-fine")); },
      clear: function () { entries = []; plan = null; items = []; g = null; lifeNode = null; S.sel = ""; S.picked = false; S.ev = ""; S.marks = Object.create(null); S.mode = "person"; shownPerson = undefined; have = Object.create(null); },
      /* the rail and the numbered boxes lead here */
      reveal: function (node) {
        if (!node) return;
        var e = entries.filter(function (x) { return x.card === node; })[0];
        if (e) { select(e, true); return; }
        var shelf = shelfOf(node); if (shelf) openShelf(shelf);
        var fold = node.querySelector && node.classList && node.classList.contains("lf-stop") ? node.querySelector(".sp-place-fold") : null; if (fold) fold.open = true;
      },
      mode: function (m) { if (m) { S.mode = m; if (o.onPerson) o.onPerson(shownPerson || null, m); } return S.mode; },
      openShelf: openShelf,
      state: S
    };
  }

  var api = Object.assign({ create: create }, pure);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryFamily = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
