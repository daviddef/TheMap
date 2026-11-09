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

    /* THE FLAGS: the lead country first, then the one with most people counted; the eras from the earliest record on (or from 1800 when no
       date is known), at most six each, newest last. */
    var order = [];
    if (m.lead) order.push(m.lead.cc);
    where.forEach(function (w) { if (order.indexOf(w.cc) < 0) order.push(w.cc); });
    var slugOf = {}; var sm = (ctx.map && ctx.map.slug) || {};
    Object.keys(sm).forEach(function (s) { slugOf[sm[s]] = s; });
    order.slice(0, 2).forEach(function (cc) {
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

  /* BASE: the site root with its trailing slash, for the links and the flag images. */
  function render(m, base) {
    /* A DETAILS, OPEN BY DEFAULT: the card is long, and the research under it is the page's job. Closing it is remembered. */
    var root = el("details", "ni"), sum = el("summary", "ni-sum");
    var KEY = "ra-name-intro-closed";
    try { root.open = localStorage.getItem(KEY) !== "1"; } catch (e) { root.open = true; }
    root.addEventListener("toggle", function () { try { localStorage.setItem(KEY, root.open ? "0" : "1"); } catch (e) {} });
    root.append(sum);
    if (!m.found) {
      sum.append(el("h2", "ni-h", "About the name"));
      root.append(el("p", "ni-p", "The registers held here have no entry for this surname yet. That is a gap in our data, not a finding about the name."));
      return root;
    }
    sum.append(el("h2", "ni-h", "About the name " + m.name));
    if (m.lede) root.append(el("p", "ni-p", m.lede));
    if (m.where.length) {
      var ul = el("ul", "ni-where");
      m.where.forEach(function (w) { ul.append(el("li", "", w.name + (w.n != null ? " " + w.n.toLocaleString("en-US") : ""))); });
      root.append(ul);
    }
    m.flags.forEach(function (c, i) {
      /* the first country's strip is open; the next is folded, so the card stays a card */
      var box = el(i ? "details" : "div", "ni-flags"), head = el(i ? "summary" : "div", "ni-h3-row");
      if (i) box.append(head); else box.append(head);
      head.append(el("h3", "ni-h3", "Whose flag flew over " + c.name + (c.since && c.since > 1800 ? " from the " + decade(c.since) : "")));
      var ol = el("ol", "ni-eras");
      c.rows.forEach(function (r) {
        var li = el("li", "ni-era");
        if (r.image) { var im = el("img"); im.src = base + "fl/" + r.image + ".svg"; im.alt = ""; im.width = 36; im.height = 24; im.loading = "lazy"; li.append(im); }
        var t = el("span", "ni-era-t"); t.append(el("b", "", r.polity), el("small", "", r.dates));
        if (r.note) t.append(el("small", "ni-era-n", r.note));
        li.append(t); ol.append(li);
      });
      box.append(ol);
      var a = el("a", "ni-more", c.more ? "and " + c.more + " more eras: the flags of " + c.name + " →" : "The flags of " + c.name + " →");
      a.href = base + "flags/" + c.slug + "/"; box.append(a);
      root.append(box);
    });
    if (m.sounds.length) root.append(el("p", "ni-p ni-fine", "Sounds alike, which is a guess and not a record: " + m.sounds.slice(0, 5).join(", ") + "."));
    var go = el("p", "ni-go");
    var map = el("a", "", "Find it on the map →"); map.href = base + "?q=" + encodeURIComponent(m.name);
    var sp = el("a", "", "Its spellings →"); sp.href = base + "your-name/?kind=surname&q=" + encodeURIComponent(m.name);
    go.append(map, sp); root.append(go);
    return root;
  }

  var api = { fold: fold, pick: pick, build: build, render: render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.raNameIntro = api;
})();
