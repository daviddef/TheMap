/* AN INTRODUCTION TO THE NAME, FOR MY RESEARCH.
 *
 * David, looking at a family called Anile that had one mark and nothing else: «could we add rich info from our surname and flags? consider not
 * copying, but providing an intuitive introduction to the name.» The surname page and the Flags Atlas already hold the facts; this tells a
 * first-time reader what they add up to, in a few lines and one strip of flags, and points at the full pages. It copies neither.
 *
 *   what it is    the language Wiktionary files the name under (a name's language is not where a family is from, and the card says so)
 *   where it is   the countries whose registers count it, with the counts, said to be «people counted here», never how common it is
 *   where from    the atlas's own derived lead, with its earliest record, always called a lead
 *   what flew     the flags that flew over that country from the earliest record on: the polity, the dates, one line of migration
 *
 * ONLY POSITIVE EVIDENCE. A name this atlas holds nothing for gets one plain line saying that is a gap in the data and not a finding about
 * the name. Nothing about a person is ever read or shown. The code is a pure builder (`build`) and a renderer (`render`) so the sentences
 * can be tested without a browser.
 */
(function () {
  function fold(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[đłøßæœı]/g, function (c) { return { "đ": "d", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i" }[c]; })
      .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  /* The row in a shard that is this name: the exact spelling (accents and capitals aside), else nothing. A near spelling is not this name. */
  function pick(rows, name) {
    var f = fold(name), hit = null;
    (rows || []).forEach(function (r) { if (!hit && fold(r.n) === f) hit = r; });
    return hit;
  }

  function joinWords(a) {
    if (a.length <= 1) return a.join("");
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function decade(y) { return Math.floor(y / 10) * 10 + "s"; }

  /* ctx: { names: {cc: "Italy"}, eras: [ {slug, polity, dates, from, to, present, tags:[{t}]} ], map: { f: {cc: [[from,to,image]]}, slug: {slug: cc} } } */
  function build(row, ctx) {
    ctx = ctx || {};
    var names = ctx.names || {};
    if (!row) return { found: false };
    var cs = (row.countries || []).filter(function (c) { return c.how === "register" || c.how === "archive"; });
    cs.sort(function (a, b) { return (b.n == null ? -1 : b.n) - (a.n == null ? -1 : a.n) || String(a.cc).localeCompare(b.cc); });
    var where = cs.map(function (c) { return { cc: c.cc, name: names[c.cc] || c.cc, n: c.n == null ? null : c.n }; });

    var m = { found: true, name: row.n, where: where, lead: null, lang: null, flags: [], sounds: [] };
    if (row.wk && row.wk.langs && row.wk.langs.length) m.lang = { langs: row.wk.langs, cite: row.wk.cite || "" };
    if (row.or && row.or.cc) {
      var f = row.or.f;
      m.lead = { cc: row.or.cc, name: names[row.or.cc] || row.or.cc, since: f && f[1] ? f[1] : null };
    }
    (row.variants || []).forEach(function (v) { if (v.how === "sounds" && m.sounds.indexOf(v.n) < 0) m.sounds.push(v.n); });

    /* THE FLAGS: one strip per country with flag data, the lead country first, then the one with most people counted; the eras from the
       earliest record on (or from 1800 when no date is known), at most six each, newest last. The card shows one strip at a time: the
       reader picks it by clicking the country's pill. */
    var order = [];
    if (m.lead) order.push(m.lead.cc);
    where.forEach(function (w) { if (order.indexOf(w.cc) < 0) order.push(w.cc); });
    var slugOf = {}; var sm = (ctx.map && ctx.map.slug) || {};
    Object.keys(sm).forEach(function (s) { slugOf[sm[s]] = s; });
    order.forEach(function (cc) {   /* every country the name is counted in, so each pill can open its own strip */
      var slug = slugOf[cc]; if (!slug) return;
      var from = (m.lead && m.lead.since) ? m.lead.since : 1800;   /* one window for every country: the earliest record held, else 1800 */
      var imgs = {}; ((ctx.map && ctx.map.f && ctx.map.f[cc]) || []).forEach(function (r) { imgs[r[0]] = r[2]; });
      var eras = (ctx.eras || []).filter(function (e) { return e.slug === slug && typeof e.from === "number" && (e.present || (e.to == null ? true : e.to > from)); })
        .sort(function (a, b) { return a.from - b.from; });
      if (!eras.length) return;
      var rows = eras.map(function (e) {
        var mig = ((e.tags || []).filter(function (t) { return /^(Emigration|Immigration)/.test(t.t || ""); })[0] || {}).t || "";
        return { polity: e.polity, dates: e.dates, image: imgs[e.from] || "", note: mig };
      });
      var more = 0;
      if (rows.length > 6) { more = rows.length - 6; rows = rows.slice(0, 6); }
      m.flags.push({ cc: cc, name: names[cc] || cc, slug: slug, since: from, rows: rows, more: more });
    });

    /* THE LEDE, in plain words. */
    var s = [];
    if (m.lang) s.push(row.n + " is filed as " + (/^[aeiou]/i.test(m.lang.langs[0]) ? "an " : "a ") + joinWords(m.lang.langs) + " surname. A name's language is not where a family is from.");
    if (where.length) {
      var bits = where.slice(0, 4).map(function (w) { return w.name + (w.n != null ? " (" + w.n.toLocaleString("en-US") + ")" : ""); });
      s.push("The registers held here count it in " + (where.length > 4 ? bits.join(", ") + " and " + (where.length - 4) + " more, all listed below" : joinWords(bits)) + ". That is people counted in those registers, not how common the name is.");
    }
    if (m.lead) s.push("The atlas's own data leans to " + m.lead.name + " as where it began" + (m.lead.since ? ", with the earliest record held from the " + decade(m.lead.since) : "") + ". That is a lead, not a finding.");
    m.lede = s.join(" ");
    return m;
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* BASE: the site root with its trailing slash, for the links and the flag images. opts.panel: the card is being shown under its chip in the row of
     names, so it is already open and has no line of its own to press. */
  function render(m, base, opts) {
    var root, sum;
    if (opts && opts.panel) { root = el("section", "ni"); sum = root; }
    else {
      /* A DETAILS, SHUT BY DEFAULT: the card is long (about 500px), and the page's job is the map and the research under it. Opening it is remembered; it
         is stored only when the reader presses the heading, so the card being drawn does not count as a choice. */
      root = el("details", "ni"); sum = el("summary", "ni-sum");
      var KEY = "ra-name-intro-open";
      try { root.open = localStorage.getItem(KEY) === "1"; } catch (e) { root.open = false; }
      sum.addEventListener("click", function () { setTimeout(function () { try { localStorage.setItem(KEY, root.open ? "1" : "0"); } catch (e) {} }, 0); });
      root.append(sum);
    }
    if (!m.found) {
      sum.append(el("h2", "ni-h", "About the name" + (m.name ? " " + m.name : "")));
      root.append(el("p", "ni-p", m.failed ? "This card could not be loaded just now. Reload the page to try again. That says nothing about the name." : "The registers held here have no entry for this surname yet. That is a gap in our data, not a finding about the name."));
      return root;
    }
    sum.append(el("h2", "ni-h", "About the name " + m.name));
    if (m.lede) root.append(el("p", "ni-p", m.lede));
    /* THE COUNTRY PILLS ARE THE TABS. David: «instead of showing the "whose flag flew over" for Croatia and France, could it be dynamic: when I
       click on the country pill it shows the flags?» One strip is drawn, for the pill that is pressed (the lead country at first); a country
       with no flag data is a plain pill, not a button, so nothing invites a click that shows nothing. */
    var strip = el("div", "ni-flags"), pills = [], hint = null;
    var byCc = {}; m.flags.forEach(function (c) { byCc[c.cc] = c; });
    function show(cc) {
      var c = byCc[cc]; if (!c) return;
      pills.forEach(function (p) { p.b.setAttribute("aria-pressed", String(p.cc === cc)); });
      strip.textContent = "";
      strip.append(el("h3", "ni-h3", "Whose flag flew over " + c.name + (c.since && c.since > 1800 ? " from the " + decade(c.since) : "")));
      var ol = el("ol", "ni-eras");
      c.rows.forEach(function (r) {
        var li = el("li", "ni-era");
        if (r.image) { var im = el("img"); im.src = base + "fl/" + r.image + ".svg"; im.alt = ""; im.width = 36; im.height = 24; im.loading = "lazy"; li.append(im); }
        var t = el("span", "ni-era-t"); t.append(el("b", "", r.polity), el("small", "", r.dates));
        if (r.note) t.append(el("small", "ni-era-n", r.note));
        li.append(t); ol.append(li);
      });
      strip.append(ol);
      var a = el("a", "ni-more", c.more ? "and " + c.more + " more eras: the flags of " + c.name + " \u2192" : "The flags of " + c.name + " \u2192");
      a.href = base + "flags/" + c.slug + "/"; strip.append(a);
    }
    if (m.where.length) {
      var ul = el("ul", "ni-where");
      m.where.forEach(function (w) {
        var li = el("li", "", ""), label = w.name + (w.n != null ? " " + w.n.toLocaleString("en-US") : "");
        if (byCc[w.cc]) {
          var b = el("button", "ni-pill", label); b.type = "button"; b.setAttribute("aria-pressed", "false");
          b.title = "Show the flags that flew over " + w.name; b.addEventListener("click", function () { show(w.cc); });
          pills.push({ cc: w.cc, b: b }); li.append(b);
        } else li.textContent = label;
        ul.append(li);
      });
      root.append(ul);
    }
    if (pills.length) {
      hint = el("p", "ni-fine ni-hint", pills.length > 1 ? "Click a country to see whose flag flew over it." : "");
      if (pills.length > 1) root.append(hint);
      /* the strip opens on the lead country, or the first with flags */
      var first = m.flags[0] && byCc[m.flags[0].cc] ? m.flags[0].cc : pills[0].cc;
      show(first); root.append(strip);
    }
    if (m.sounds.length) root.append(el("p", "ni-p ni-fine", "Sounds alike, which is a guess and not a record: " + m.sounds.slice(0, 5).join(", ") + "."));
    var go = el("p", "ni-go");
    var map = el("a", "", "Find it on the map →"); map.href = base + "?q=" + encodeURIComponent(m.name);
    var sp = el("a", "", "Its spellings →"); sp.href = base + "your-name/?kind=surname&q=" + encodeURIComponent(m.name);
    go.append(map, sp); root.append(go);
    return root;
  }

  /* HOW THE CARDS SIT ON THE PAGE. One family: its card as one shut line, as it always was. Several: one slim row of name chips, «About the names», and
     one card open at a time underneath. A card each, stacked, took the whole first screen with six families and pushed the map off it. With many
     families the row shows the first few and «Show all»; the chip whose card is open is never folded away.
     Every family gets its place as soon as the set changes, and says so while its card is still coming or when it could not be loaded; a card that has
     arrived is kept, so a redraw (every mark causes one) neither flickers nor shuts what the reader opened or moves the keyboard focus. */
  var FOLD = 12, FOLD_NARROW = 6, SEQ = 0;
  function view(host, base, opts) {
    var narrow = (opts && opts.narrow) || function () { try { return window.matchMedia("(max-width: 600px)").matches; } catch (e) { return false; } };
    var items = {}, order = [], mode = "", open = null, all = false, chips = null, more = null, panel = null;
    var uid = "ni-row-" + (++SEQ);

    function shown() { return order.filter(function (n) { return items[n].state !== "none"; }); }
    function stub(name) {
      var d = el("details", "ni"), sm = el("summary", "ni-sum");
      sm.append(el("h2", "ni-h", "About the name " + name), el("span", "ni-wait", "loading\u2026")); d.append(sm); return d;
    }
    function waiting(name) {
      var d = el("section", "ni"), p = el("p", "ni-p ni-fine", "Loading the card for " + name + "\u2026"); p.setAttribute("role", "status");
      d.append(el("h2", "ni-h", "About the name " + name), p); return d;
    }
    function cardOf(it) {
      if (!it.node) it.node = it.model ? render(it.model, base, { panel: mode === "row" }) : mode === "row" ? waiting(it.name) : stub(it.name);
      return it.node;
    }
    function build() {
      var rowEl = el("div", "ni-row"), lab = el("span", "ni-row-l", "About the names");
      lab.id = uid + "-l"; rowEl.setAttribute("role", "group"); rowEl.setAttribute("aria-labelledby", lab.id);
      chips = el("div", "ni-chips"); chips.id = uid + "-chips";
      more = el("button", "ni-allbtn"); more.type = "button"; more.setAttribute("aria-controls", chips.id);
      more.addEventListener("click", function () { all = !all; paint(); });
      panel = el("div", "ni-panel"); panel.id = uid + "-open"; panel.hidden = true;
      panel.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !open) return;
        var c = items[open].chip; open = null; paint(); if (c) c.focus();
      });
      rowEl.append(lab, chips, more); host.append(rowEl, panel);
    }
    function chipOf(it) {
      if (it.chip) return it.chip;
      var b = el("button", "ni-chip"); b.type = "button"; b.setAttribute("aria-controls", panel.id);
      b.addEventListener("click", function () { open = open === it.name ? null : it.name; paint(); });
      return (it.chip = b);
    }
    function paint() {
      var names = shown();
      host.hidden = !names.length;
      if (mode === "one") {
        var one = names.length ? cardOf(items[names[0]]) : null;
        if (host.children.length !== 1 || host.children[0] !== one) { host.textContent = ""; if (one) host.append(one); }
        return;
      }
      if (mode !== "row") return;
      if (open && names.indexOf(open) < 0) open = null;
      var limit = narrow() ? FOLD_NARROW : FOLD, folds = names.length > limit + 1;
      [].slice.call(chips.children).forEach(function (c) { if (!names.some(function (n) { return items[n].chip === c; })) c.remove(); });
      names.forEach(function (n, i) {
        var it = items[n], b = chipOf(it);
        if (chips.children[i] !== b) chips.insertBefore(b, chips.children[i] || null);   /* only the new ones are put in, so focus stays where it is */
        if (b.getAttribute("data-state") !== it.state) {
          b.setAttribute("data-state", it.state); b.textContent = ""; b.append(el("span", "", n));
          if (it.state === "failed") b.append(el("span", "ni-chip-s", " (not loaded)"));
          if (it.state === "loading") b.append(el("span", "ni-vh", " (loading)"));
          b.className = "ni-chip is-" + it.state;
        }
        b.setAttribute("aria-expanded", String(open === n));
        b.hidden = folds && !all && i >= limit && open !== n;
      });
      chips.classList.toggle("is-all", folds && all);
      more.hidden = !folds; more.textContent = all ? "Show fewer" : "Show all " + names.length; more.setAttribute("aria-expanded", String(folds && all));
      panel.hidden = !open;
      var want = open ? cardOf(items[open]) : null;
      if (panel.children[0] !== want) { panel.textContent = ""; if (want) panel.append(want); }
    }
    return {
      /* the families the page reads, in the picker's order */
      set: function (list) {
        var next = list.length > 1 ? "row" : list.length ? "one" : "";
        if (next !== mode) {
          host.textContent = ""; mode = next; chips = more = panel = null; open = null; all = false;
          Object.keys(items).forEach(function (n) { items[n].node = null; items[n].chip = null; });   /* drawn differently in the other mode */
          if (mode === "row") build();
        }
        order = list.slice();
        Object.keys(items).forEach(function (n) { if (order.indexOf(n) < 0) delete items[n]; });
        order.forEach(function (n) { if (!items[n]) items[n] = { name: n, state: "loading", model: null, node: null, chip: null }; });
        paint();
      },
      done: function (name) { var it = items[name]; return !!it && (it.state === "ready" || it.state === "none"); },
      /* a card that has arrived, or the model saying it could not be loaded; a late real card still replaces that line */
      put: function (name, model) {
        var it = items[name];
        if (!it || !model || it.state === "ready" || it.state === "none" || (model.failed && it.state === "failed")) return;
        it.state = model.failed ? "failed" : "ready"; it.model = model; it.node = null; paint();
      },
      /* a family that is not a surname has no card, so its place goes */
      drop: function (name) { var it = items[name]; if (!it) return; it.state = "none"; it.node = null; paint(); }
    };
  }

  var api = { fold: fold, pick: pick, build: build, render: render, view: view, FOLD: FOLD, FOLD_NARROW: FOLD_NARROW };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.raNameIntro = api;
})();
