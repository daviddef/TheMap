/* WHAT THE ATLAS HOLDS ON THIS LINE: the card under the reading on /read/.

   It is DRAWN FROM THE ATLAS'S OWN FILES, not written by a model: the places the line names are found in the place index, and the
   place's names, eras, volumes and nearby events are read out of files this site already publishes. So every number in it is true
   by construction, it costs no tokens, and it works without the Ask Claude button (it has its own). An empty row says "not in
   the catalogue", never "nothing happened". Nothing is sent anywhere.

   Classic script (no module) so the tests can evaluate it; the helpers are pure and exported through module.exports. The DOM is
   built with textContent only: a place name or a note from a data file is never parsed as markup. */
(function () {
  "use strict";

  /* ---- pure helpers ------------------------------------------------------------------------------------------------ */

  function fold(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/đ/g, "d").replace(/ł/g, "l").replace(/ø/g, "o").replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  /* The first year in the text, 1000 to 2030, or null. A line may say "1863" or "anno 1863"; a Roman-numeral year is not read. */
  function yearIn(text) {
    var m = /(?:^|[^0-9])(1[0-9]{3}|20[0-3][0-9])(?![0-9])/.exec(String(text || ""));
    return m ? Number(m[1]) : null;
  }

  /* Index rows by every name they answer to. `n` is the name; `q` is the folded older names, space-joined, so a row is matched on
     the whole of `q`, or on a single word of it when `q` is short, never on any word of a long list ("bronx the", "county iredell"). */
  /* "Gornji" is Upper, "Donji" Lower, "Veliki" Great: half the villages in Croatia start with one, so on its own it names no place ("Gornji Rukavac" is not Gornji Draganec). */
  var QUALIFIER = { gornji: 1, gornja: 1, gornje: 1, donji: 1, donja: 1, donje: 1, veliki: 1, velika: 1, veliko: 1, mali: 1, mala: 1, malo: 1, novi: 1, nova: 1, stari: 1, stara: 1, srednji: 1, sredn: 1, upper: 1, lower: 1, little: 1, great: 1, grand: 1, grosse: 1, gross: 1, klein: 1, ober: 1, unter: 1, nieder: 1, saint: 1, santa: 1, santo: 1 };
  function buildMap(rows) {
    var map = Object.create(null);
    function add(k, r) { if (!k) return; (map[k] || (map[k] = [])).push(r); }
    rows.forEach(function (r) {
      add(fold(r.n), r);
      var bare = r.n.indexOf("(") > 0 ? fold(r.n.replace(/\s*\([^)]*\)/g, "")) : "";
      if (bare && bare !== fold(r.n)) add(bare, r);
      var q = r.q ? fold(r.q) : "";
      if (!q) return;
      add(q, r);
      var w = q.split(" ");
      if (w.length > 1 && w.length <= 3) w.forEach(function (x) { if (x.length >= 5 && !QUALIFIER[x]) add(x, r); });
    });
    /* WHERE EACH COUNTRY IS, for a country named in a story ("from Ireland") that the gazetteer has no place of its own for: the middle of the
       places the Atlas holds in it (the median, so a far island does not drag it). Hidden from the word list, read only through map["#country"]. */
    var by = Object.create(null), cen = Object.create(null);
    rows.forEach(function (r) { if (r.cc && typeof r.x === "number" && typeof r.y === "number") (by[r.cc] || (by[r.cc] = [])).push(r); });
    function med(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    Object.keys(by).forEach(function (cc) { cen[cc] = { x: med(by[cc].map(function (r) { return r.x; })), y: med(by[cc].map(function (r) { return r.y; })) }; });
    Object.defineProperty(map, "#country", { value: cen, enumerable: false });
    return map;
  }

  /* The places a text names. Windows of three, two, then one word, longest first, so "San Giovanni" is not also "Giovanni"; a one-word
     window must be four letters or more and not be a word the term finder already knows ("uxoris", "natus", "anno").
     Returns [{word, rows}] with the places the Atlas holds volumes for first. */
  function candidates(text, map, skip) {
    var t = fold(text).split(" ").filter(Boolean), used = [], out = [], seen = Object.create(null);
    for (var len = 4; len >= 1; len--) {
      for (var i = 0; i + len <= t.length; i++) {
        var covered = false;
        for (var j = i; j < i + len; j++) if (used[j]) covered = true;
        if (covered) continue;
        var w = t.slice(i, i + len).join(" ");
        if (len === 1 && (w.length < 4 || (skip && skip[w]) || QUALIFIER[w])) continue;
        var rows = map[w];
        if (!rows || seen[w]) continue;
        seen[w] = 1;
        for (j = i; j < i + len; j++) used[j] = 1;
        /* The places the Atlas holds volumes for first; among equals, a place called exactly what was typed before one that merely has the
           word in an older or longer name ("London" before "New London"), then the Atlas's own places before the bare gazetteer's. */
        var exact = function (r) { return fold(r.n.replace(/\s*\([^)]*\)/g, "")) === w ? 0 : 1; }, own = function (r) { return /^[gp]-/.test(String(r.i)) ? 1 : 0; };
        /* An Atlas place that bears the typed name itself ("Tasmania") comes before one that only lists it among its older or containing names ("Launceston, Tasmania"), whatever their volumes. */
        var hasAl = rows.some(function (r) { return r.al && r.c > 0; });
        var named = function (r) { return hasAl && !r.al && !(r.c > 0) ? 2 : exact(r) === 0 && !own(r) ? 0 : 1; };
        out.push({ word: w, at: i, rows: rows.slice().sort(function (a, b) { return named(a) - named(b) || (b.c || 0) - (a.c || 0) || (b.v || 0) - (a.v || 0) || exact(a) - exact(b) || own(a) - own(b) || String(a.cc).localeCompare(b.cc); }) });
      }
    }
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  /* The era a year falls in. An era runs from `from` up to but not including `to`, because the next one starts there. */
  function eraAt(eras, year) {
    if (year == null) return -1;
    for (var i = 0; i < eras.length; i++) if (year >= eras[i].from && year < eras[i].to) return i;
    return -1;
  }

  function volumesCovering(cols, year) {
    return (cols || []).filter(function (c) { return year != null && c.from <= year && year <= c.to; });
  }

  function inRing(lat, lon, ring) {
    var inside = false, i, j, a, b;
    for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a = ring[i]; b = ring[j];
      if ((a[1] > lon) !== (b[1] > lon) && lat < (b[0] - a[0]) * (lon - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  /* Events in mortality.json whose area holds the point and whose years come within `span` of the year. Polygons are [lat, lon]. */
  function eventsAt(events, lat, lon, year, span) {
    if (year == null) return [];
    return (events || []).filter(function (e) {
      if (e.f > year + span || e.t < year - span) return false;
      var p = e.poly || [];
      var rings = p.length && Array.isArray(p[0][0]) ? p : [p];
      return rings.some(function (r) { return r.length > 2 && inRing(lat, lon, r); });
    }).sort(function (a, b) { return a.f - b.f; });
  }

  /* Given names in the text, from the catalogue: every word of four letters or more that is a form of a catalogued name. */
  function buildGiven(rows) {
    var map = Object.create(null);
    rows.forEach(function (r) {
      var langs = r.langs || {};
      Object.keys(langs).forEach(function (l) {
        (langs[l] || []).forEach(function (f) { var k = fold(f.form); if (k.length >= 4 && !map[k]) map[k] = r; });
      });
      var c = fold(r.canon); if (c.length >= 4 && !map[c]) map[c] = r;
    });
    return map;
  }
  function givenIn(text, map, skip) {
    var seen = Object.create(null), out = [];
    fold(text).split(" ").forEach(function (w) {
      var r = map[w];
      if (!r || (skip && skip[w]) || seen[r.id]) return;
      seen[r.id] = 1; out.push({ word: w, row: r });
    });
    return out;
  }

  /* The language of the line, from the register words in it, never guessed from the place: each term card carries its own `lang`.
     `tlang` maps a folded word to a language code; returns [{lang, words}] most-used first. */
  function languageIn(text, tlang) {
    var by = Object.create(null), seen = Object.create(null);
    fold(text).split(" ").forEach(function (w) {
      var l = tlang[w]; if (!l || seen[w]) return;
      seen[w] = 1; (by[l] || (by[l] = [])).push(w);
    });
    return Object.keys(by).map(function (l) { return { lang: l, words: by[l] }; }).sort(function (a, b) { return b.words.length - a.words.length; });
  }

  /* The flag of a country in a year: of the era rows [from, to, image] that hold the year, the one that began last (the most
     specific). With no year, the newest. Returns the image name or null. */
  function flagAt(rows, year) {
    if (!rows || !rows.length) return null;
    var pick = null;
    rows.forEach(function (r) {
      var on = year == null ? true : (year >= r[0] && (r[1] == null || year < r[1]));   /* the present era has no end: null */
      if (on && (!pick || r[0] > pick[0])) pick = r;
    });
    return pick ? pick[2] : null;
  }

  /* What changed around a year, for the "around this date" list: era starts and events that overlap [year-span, year+span], in date
     order. Each is {y, title, note, kind}. */
  function aroundYear(eras, events, year, span) {
    if (year == null) return [];
    var out = [];
    (eras || []).forEach(function (e, i) {
      if (i && e.from >= year - span && e.from <= year + span) out.push({ y: e.from, title: "Under " + e.polity, note: e.note || "", kind: "era" });
    });
    (events || []).forEach(function (e) {
      if (e.f <= year + span && e.t >= year - span) out.push({ y: e.f, title: e.n, note: e.ty + (e.t !== e.f ? ", " + e.f + " to " + e.t : ""), kind: "event" });
    });
    return out.sort(function (a, b) { return a.y - b.y; });
  }

  /* The id a volume is marked under: the waypoint, else its address, else its title. progress-kit reduces a FamilySearch address to
     the waypoint, so the same volume added from here and from the map is one mark. */
  function volumeId(c) { return "volume:" + (c.waypoint || c.url || c.title); }

  var KIND = { b: "baptisms and births", m: "marriages", d: "burials and deaths", i: "indexes" };
  function kindsOf(cols) {
    var n = Object.create(null);
    (cols || []).forEach(function (c) { (c.kinds || []).forEach(function (k) { n[k] = (n[k] || 0) + 1; }); });
    return Object.keys(n).sort().map(function (k) { return n[k] + " " + (KIND[k] || k); });
  }

  var api = { fold: fold, yearIn: yearIn, buildMap: buildMap, candidates: candidates, eraAt: eraAt, volumesCovering: volumesCovering,
              eventsAt: eventsAt, buildGiven: buildGiven, givenIn: givenIn, kindsOf: kindsOf, inRing: inRing,
              languageIn: languageIn, flagAt: flagAt, aroundYear: aroundYear, volumeId: volumeId };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  window.raAtlasSummary = api;

  /* ---- the page ---------------------------------------------------------------------------------------------------- */

  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function link(text, href, cls) { var a = el("a", text, cls); a.href = href; return a; }
  var LANG = { la: "Latin", it: "Italian", de: "German", hr: "Croatian", en: "English" };

  /* Leaflet, from the same CDN and version the map page uses, loaded only when a card is drawn. */
  var leaflet = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leaflet) return leaflet;
    leaflet = new Promise(function (ok, fail) {
      var css = document.createElement("link"); css.rel = "stylesheet"; var VB = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/") + "vendor/leaflet/"; css.href = VB + "leaflet.min.css"; document.head.appendChild(css);
      var sc = document.createElement("script"); sc.src = VB + "leaflet.min.js";
      sc.onload = function () { window.L ? ok(window.L) : fail(new Error("leaflet")); }; sc.onerror = function () { leaflet = null; fail(new Error("leaflet")); };
      document.head.appendChild(sc);
    });
    return leaflet;
  }
  api.loadLeaflet = loadLeaflet;

  function boot() {
    var box = document.getElementById("ask-sum"), btn = document.getElementById("ask-atlas");
    if (!box || !btn) return;
    var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
    var text = document.getElementById("ask-text"), where = document.getElementById("ask-where"), status = document.getElementById("ask-status");
    var data = null, loading = null;
    api.getJSON = getJSON; api.load = load;

    function getJSON(path) { return fetch(BASE + path).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }
    function say(msg, bad) { status.textContent = msg || ""; status.className = "cap ask-status" + (bad ? " ask-bad" : ""); }
    function placeHref(id) { return BASE + "place/" + encodeURIComponent(id) + "/"; }

    /* Everything the finder needs, once: the place rows (as the search box loads them), the given-name catalogue, the words the
       term finder already knows (so "uxoris" is not taken for a place) and the language each of them is in. */
    function load() {
      if (data) return Promise.resolve(data);
      if (loading) return loading;
      loading = getJSON("index.json").then(function (d) {
        var rows = d.places.slice(), tail = d.tail && d.tail.cells ? Object.keys(d.tail.cells) : [];
        return Promise.all(tail.map(function (k) { return getJSON(d.tail.dir + k + ".json").then(function (c) { rows = rows.concat(c.places || []); }).catch(function () {}); }))
          .then(function () { return getJSON("index-quiet.json").then(function (q) { rows = rows.concat(q.places || []); }).catch(function () {}); })
          .then(function () { return getJSON("given-names.json").catch(function () { return { rows: [] }; }); })
          .then(function (g) {
            var skip = Object.create(null), tlang = Object.create(null);
            try {
              var D = JSON.parse(document.getElementById("rr-data").textContent);
              D.terms.forEach(function (t) { (t.forms || []).concat(t.abbr || []).forEach(function (f) { fold(f).split(" ").forEach(function (w) { skip[w] = 1; if (t.lang) tlang[w] = t.lang; }); }); });
            } catch (e) { /* the skip list is an aid; without it a few register words may be offered as places */ }
            data = { map: buildMap(rows), rows: rows, given: buildGiven(g.rows || []), countries: d.countries || {}, access: d.access || {}, skip: skip, tlang: tlang, built: g.built };
            return data;
          });
      }).catch(function () { say("The place index did not load. Check your connection and press again.", true); loading = null; throw new Error("index"); });
      return loading;
    }

    function tile(label, big, small, href) {
      var d = el(href ? "a" : "div", null, "as-tile" + (href ? " is-link" : ""));
      if (href) d.href = href;
      d.append(el("span", label, "as-lab"), el("b", big), el("span", small || "", "as-sub"));
      return d;
    }
    function section(title, tag) {
      var s = el("section", null, "as-sec"), h = el("h4", title);
      if (tag) h.append(" ", el("span", tag, "as-tag"));
      s.append(h); return s;
    }

    /* The map: the place, other places with the same name, and the parish churches near it, on the same light-grey Esri base the
       main map uses. Drawn after the card is in the page, because a map needs a size. */
    function drawMap(div, p, others, parishes) {
      loadLeaflet().then(function (L) {
        var map = L.map(div, { scrollWheelZoom: false, attributionControl: true }).setView([p.lat, p.lon], 11);
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 16, attribution: "Tiles © Esri" }).addTo(map);
        var near = [[p.lat, p.lon]];
        parishes.forEach(function (c) {
          if (c.y == null || c.x == null) return;
          L.circleMarker([c.y, c.x], { radius: 4, weight: 1, color: "#6b4e2e", fillColor: "#b98a4a", fillOpacity: .85 }).bindTooltip(c.n + (c.km != null ? " · " + Math.round(c.km * 10) / 10 + " km" : "")).addTo(map);
          near.push([c.y, c.x]);
        });
        others.forEach(function (o) {
          if (o.y == null || o.x == null) return;
          L.circleMarker([o.y, o.x], { radius: 5, weight: 2, color: "#7a7a7a", fillColor: "#fff", fillOpacity: 1 }).bindTooltip(o.n + (o.cc ? " · " + o.cc : "") + " (another place with this name)").addTo(map);
          if (Math.abs(o.y - p.lat) < 2 && Math.abs(o.x - p.lon) < 3) near.push([o.y, o.x]);
        });
        L.circleMarker([p.lat, p.lon], { radius: 9, weight: 3, color: "#fff", fillColor: "#b3452e", fillOpacity: 1 }).bindTooltip(p.name, { permanent: true, direction: "top", offset: [0, -8] }).addTo(map);
        if (near.length > 1) map.fitBounds(L.latLngBounds(near).pad(.25), { maxZoom: 13 });
        setTimeout(function () { map.invalidateSize(); }, 50);
      }).catch(function () { div.replaceChildren(el("p", "The map could not load (the tile service is on another site). The rest of the card is unaffected.", "cap")); });
    }

    /* Add to my research. The unit the progress kit tracks is a FAMILY LINE (a surname in a place), not a person: the Atlas
       holds no people. So the choice offered is the reader's own lines, or a new one. */
    function addBlock(p, id, cols, cov, year) {
      var P = window.raProgress, s = section("Add to my research");
      if (!P) { s.append(el("p", "Your research list did not load on this page, so nothing can be added from here. Open the place page instead.", "cap")); return s; }
      var sel = el("select"); sel.id = "as-line"; sel.setAttribute("aria-label", "Which family line to add to");
      var lines = P.lines(), act = lines.filter(function (l) { return l.active; })[0];
      lines.forEach(function (l) { var o = el("option", l.name + (l.where ? " · " + l.where : "")); o.value = l.slug; if (act && act.slug === l.slug) o.selected = true; sel.append(o); });
      var no = el("option", "A new family line…"); no.value = "__new"; sel.append(no);
      var nm = el("input"); nm.type = "text"; nm.maxLength = 60; nm.placeholder = "Name of the line, e.g. Kosina"; nm.hidden = lines.length > 0; nm.setAttribute("aria-label", "Name for the new family line");
      if (!lines.length) sel.value = "__new";
      sel.addEventListener("change", function () { nm.hidden = sel.value !== "__new"; if (!nm.hidden) nm.focus(); });
      var row = el("p", null, "as-addrow"); row.append(el("label", "Add to", "as-lab"), sel, nm);
      s.append(row);

      var choices = [];
      function check(label, ids, on) {
        if (!ids.length) return;
        var lb = el("label", null, "as-chk"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!on; lb.append(cb, " " + label);
        choices.push({ cb: cb, ids: ids }); s.append(lb);
      }
      var covIds = cov.map(function (c) { return { id: volumeId(c), c: c }; });
      check(year != null ? "The " + cov.length + (cov.length === 1 ? " volume" : " volumes") + " that cover " + year : "", covIds, true);
      var allIds = cols.map(function (c) { return { id: volumeId(c), c: c }; });
      check("All " + cols.length + " volumes for " + p.name, allIds, !covIds.length);
      var provs = [], seenP = Object.create(null);
      cols.forEach(function (c) { if (c.provider && !seenP[c.provider]) { seenP[c.provider] = 1; provs.push({ id: "source:" + c.provider, c: { title: c.provider, provider: c.provider } }); } });
      check("The " + provs.length + (provs.length === 1 ? " source" : " sources") + " that hold them (as places to ask)", provs, false);
      var go = el("button", "Add to research", "chip ask-btn"); go.type = "button";
      var out = el("p", null, "cap as-addout"); out.setAttribute("role", "status");
      go.addEventListener("click", function () {
        var slug = sel.value;
        if (slug === "__new") {
          var name = nm.value.trim();
          if (!name) { out.textContent = "Name the new family line first (a surname, say)."; out.className = "cap as-addout ask-bad"; nm.hidden = false; nm.focus(); return; }
          slug = P.addLine(name, p.name);
        } else P.setActive(slug);
        var want = {}; choices.forEach(function (c) { if (c.cb.checked) c.ids.forEach(function (x) { want[x.id] = x; }); });
        var keys = Object.keys(want);
        if (!keys.length) { out.textContent = "Tick what to add."; out.className = "cap as-addout ask-bad"; return; }
        var added = 0, had = 0;
        keys.forEach(function (k) {
          var x = want[k], cur = P.get(k) || {};
          if (cur.state) { had++; return; }
          P.setWhat(k, { t: x.c.title, where: p.name, href: placeHref(id) });
          P.setState(k, "planned"); added++;
        });
        document.dispatchEvent(new CustomEvent("ra-progress-changed"));
        var ln = P.lines().filter(function (l) { return l.slug === P.active(); })[0];
        out.className = "cap as-addout";
        out.textContent = "Added " + added + " to " + (ln ? ln.name : "your research") + " as planned" + (had ? " (" + had + " already marked, left as they were)" : "") + ". It is now your active line. ";
        out.append(link("See My research", BASE + "my-research/"));
      });
      s.append(el("p", null, "as-addrow")); s.lastChild.append(go);
      s.append(out, el("p", "A line is a family, such as a surname in a place. The Atlas keeps no people, so there is no per-person list: name the line for the family you are tracing. Marks stay in this browser.", "cap"));
      return s;
    }

    function drawPlace(row, year, line, G, others) {
      box.hidden = false; box.textContent = "";
      var c = el("div", null, "rr-card as-card");
      var wait = el("p", "Reading the place…", "cap as-wait"); c.append(el("h3", "What the Atlas holds on this"), wait);
      box.append(c);
      var id = row.i;
      Promise.all([getJSON("p/" + encodeURIComponent(id) + ".json"), getJSON("regions.json").catch(function () { return null; }),
                   getJSON("mortality.json").catch(function () { return null; }), getJSON("providers.json").catch(function () { return null; }),
                   getJSON("flag-map.json").catch(function () { return null; })]).then(function (r) {
        c.textContent = "";
        var p = r[0], regs = r[1], mort = r[2], pname = Object.create(null), fm = r[4];
        ((r[3] && r[3].providers) || []).forEach(function (x) { pname[x.id] = x.name; });
        var region = regs && regs.regions ? regs.regions.filter(function (x) { return x.id === p.region; })[0] : null;
        var eras = region ? region.eras : [], ei = eraAt(eras, year), era = ei > -1 ? eras[ei] : null;
        var regime = era && regs.regimes ? regs.regimes[era.regime] : null;
        var cols = p.collections || [], span = p.span || (cols.length ? [Math.min.apply(null, cols.map(function (x) { return x.from; })), Math.max.apply(null, cols.map(function (x) { return x.to; }))] : null);
        var older = (p.names || []).map(function (n) { return n.n; });
        var held = []; cols.forEach(function (x) { if (x.held && held.indexOf(x.held) < 0) held.push(x.held); });
        var accs = []; cols.forEach(function (x) { if (x.access && accs.indexOf(x.access) < 0) accs.push(x.access); });
        var cov = volumesCovering(cols, year);
        var flag = fm && fm.f ? flagAt(fm.f[String(row.cc || "").toUpperCase()], year) : null;
        var langs = languageIn(line, G.tlang);
        var pageHref = placeHref(id);
        /* what the handover (handover.js) quotes: the facts this card shows, as plain text */
        try {
          window.raAtlasFacts = { place: p.name, country: p.country || "", older: older.slice(0, 4), year: year, polity: era ? era.polity : "", regime: regime ? regime.label : "",
            language: langs.length ? (LANG[langs[0].lang] || langs[0].lang) : "", page: new URL(pageHref, location.href).href,
            volumes: (year != null && cov.length ? cov : cols).slice(0, 6).map(function (x) { return { title: x.title, from: x.from, to: x.to }; }) };
        } catch (e) { window.raAtlasFacts = null; }

        /* The head: accent bar, flag, the place, the regime it was under in that year. */
        var head = el("header", null, "as-head");
        if (flag) { var im = el("img", null, "as-flag"); im.src = BASE + "fl/" + flag + ".svg"; im.alt = "Flag in use in " + (year == null ? "the latest era" : year); im.width = 52; im.height = 34; im.loading = "lazy"; head.append(im); }
        var ht = el("div", null, "as-ht");
        ht.append(el("span", "WHAT THE ATLAS HOLDS ON THIS", "as-lab"), el("h3", p.name + (p.country ? ", " + p.country : "")));
        var pills = el("p", null, "as-pills");
        if (regime) { var pl = el("span", regime.label + (year != null ? " in " + year : ""), "as-pill"); if (regime.var) pl.style.borderColor = "var(" + regime.var + ", currentColor)"; pills.append(pl); }
        else if (year != null) pills.append(el("span", "No era in the catalogue for " + year, "as-pill is-none"));
        if (year != null) pills.append(el("span", "Year read from the line: " + year, "as-pill"));
        ht.append(pills); head.append(ht); c.append(head);
        c.append(el("p", "Drawn from the Atlas's own files, not written by Claude. A missing row means not in the catalogue, never that it did not happen.", "cap"));

        var tiles = el("div", null, "as-tiles");
        tiles.append(tile("Place", p.name, older.length ? "was " + older.slice(0, 3).join(", ") : p.country),
          era ? tile("In " + year, era.polity, era.from + " to " + era.to)
              : tile("Eras", eras.length ? eras.length + " in this region" : "none yet", year == null ? "no year found in the line" : "no era covers " + year),
          tile("Volumes", String(cols.length), cols.length ? "See them: " + (span ? span[0] + " to " + span[1] : "") : "none catalogued", pageHref),
          langs.length ? tile("Language", LANG[langs[0].lang] || langs[0].lang, "from " + langs[0].words.length + " register " + (langs[0].words.length === 1 ? "word" : "words") + ": " + langs[0].words.slice(0, 4).join(", "))
                       : tile("Language", "not shown", "no register word was found in the line, and it is not guessed from the place"),
          tile("Paper", held.length === 1 ? held[0] : held.length ? held.length + " holders" : "not recorded",
               (held.length > 1 ? held.slice(0, 3).join(", ") + (held.length > 3 ? " and more" : "") + ". " : "") + (accs.length ? accs.map(function (a) { return G.access[a] || a; }).join("; ") : "")));
        c.append(tiles);

        /* Places, as on the tree page's right pane: the map and the parishes around. */
        var s = section("Places", "from Record Atlas");
        var mapDiv = el("div", null, "as-map"); mapDiv.setAttribute("role", "img"); mapDiv.setAttribute("aria-label", "Map of " + p.name + " and the churches near it");
        s.append(mapDiv);
        var near = (p.parishes || []).slice(0, 30);
        s.append(el("p", null, "as-key")); s.lastChild.append(el("i", null, "k-here"), " the place   ", el("i", null, "k-parish"), " " + near.length + " parish churches nearby   ", el("i", null, "k-other"), " " + ((others || []).length) + " other places with this name");
        c.append(s);
        drawMap(mapDiv, p, others || [], near);

        s = section("Around this date", "era changes and events");
        var ev = mort ? eventsAt(mort.events, p.lat, p.lon, year, 25) : [];
        var around = aroundYear(eras, ev, year, 25);
        if (year == null) s.append(el("p", "No year was found in the line, so nothing is matched. Add one in the place box, like Gračišće 1863."));
        else if (!around.length) s.append(el("p", "No change of rule, epidemic, famine, massacre or war in the catalogue falls within 25 years of " + year + " on this ground. That means not in the catalogue, not that nothing happened."));
        else {
          var al = el("ol", null, "as-around");
          around.slice(0, 12).forEach(function (a) {
            var li = el("li", null, "is-" + a.kind); li.append(el("b", String(a.y), "as-ay"), el("span", a.title, "as-at"));
            if (a.note) li.append(el("span", a.note, "as-an")); al.append(li);
          });
          s.append(al);
        }
        c.append(s);

        s = section("Names", "catalogue");
        s.append(el("p", p.name + (older.length ? " (today). Older or other forms: " + older.join(", ") + "." : " (no other forms are catalogued).")));
        var gn = givenIn(line, G.given, G.skip);
        if (gn.length) {
          var ul = el("ul", null, "as-list");
          gn.forEach(function (g) {
            var forms = []; Object.keys(g.row.langs || {}).forEach(function (l) { (g.row.langs[l] || []).slice(0, 3).forEach(function (f) { if (forms.indexOf(f.form) < 0) forms.push(f.form); }); });
            ul.append(el("li", g.word + ": the catalogue holds this as " + g.row.canon + ". Other forms: " + forms.slice(0, 8).join(", ") + "."));
          });
          s.append(el("p", "Given names in the line", "lab"), ul);
        }
        c.append(s);

        s = section("Whose ground it was", "catalogue");
        if (!eras.length) s.append(el("p", "No record region covers this place yet, so there is no era table. That is a gap in the catalogue."));
        else {
          var t = el("div", null, "as-eras");
          eras.forEach(function (e, i) {
            var row2 = el("div", null, "as-era" + (i === ei ? " is-here" : "") + (/TRAP/i.test(e.note || "") ? " is-trap" : ""));
            row2.append(el("span", e.from + "–" + e.to, "as-yrs"),
              el("span", e.polity + (i === ei ? ". Your line is here." : "") + (e.note && (i === ei || /TRAP/i.test(e.note)) ? (i === ei ? " " : ". ") + e.note : ""), "as-pol"));
            t.append(row2);
          });
          s.append(t);
        }
        c.append(s);

        s = section("Volumes and records", "catalogue");
        if (!cols.length) s.append(el("p", "No volumes are catalogued for this place yet. That means nobody has listed them, not that none exist."));
        else {
          s.append(el("p", null)); s.lastChild.append(link(cols.length + " volumes", pageHref), " in the catalogue, " + kindsOf(cols).join(", ") + ". ", link("Open the place page", pageHref));
          var shown = year != null && cov.length ? cov : cols.slice(0, 8);
          s.append(el("p", year != null ? (cov.length ? "Covering " + year : "None covers " + year + ". The first few instead") : "The first few", "lab"));
          var l2 = el("ul", null, "as-vols");
          shown.slice(0, 10).forEach(function (x) {
            var li = el("li"), tt = x.title + (x.title.indexOf(String(x.from)) > -1 ? "" : " (" + x.from + "–" + x.to + ")");
            li.append(link(tt, pageHref, "as-vt"));
            li.append(el("span", [x.held ? "held at " + x.held : "", x.access ? (G.access[x.access] || x.access) : ""].filter(Boolean).join(" · "), "as-vm"));
            if (x.url) { var ex = link("open at " + (pname[x.provider] || x.provider || "the source"), x.url); ex.rel = "noopener"; ex.className = "as-vx"; li.append(ex); }
            l2.append(li);
          });
          s.append(l2);
          if (shown.length > 10) s.append(el("p", (shown.length - 10) + " more on the place page.", "cap"));
          (p.fs || []).slice(0, 3).forEach(function (f) { var q = el("p", "FamilySearch: ", "cap"); var a = link(f.t, f.url || "#"); a.rel = "noopener"; q.append(a, " (collection " + f.cc + ", " + f.from + "–" + f.to + ")."); s.append(q); });
        }
        c.append(s);

        c.append(addBlock(p, id, cols, cov, year));

        s = section("Where to look next");
        var chips = el("p", null, "as-chips");
        chips.append(link("The place page, with every volume", pageHref), link("On the map", BASE + "?q=" + encodeURIComponent(p.name)),
          link("Archives for " + p.country, BASE + "country/" + String(p.country).toLowerCase() + "/"));
        if (era && (era.filedUnder || []).length) chips.append(link("Records of " + era.from + "–" + era.to + " are filed under: " + era.filedUnder.map(function (x) { return pname[x] || x; }).join(", "), BASE + "jurisdictions/"));
        s.append(chips); c.append(s);
        c.append(el("p", "Each section is from the catalogue. A draft reading from Claude, if you ask for one, is a separate card and is not.", "cap"));
      }).catch(function () { wait.textContent = "That place's file did not load. Press the button again."; wait.className = "cap ask-bad"; });
    }

    function render() {
      var line = (text.value || "") + " " + (where ? where.value : "");
      if (!line.trim()) { say("Paste a line or type a place first, then press the button again.", true); text.focus(); return; }
      say("");
      /* A card appears at once, so the press is never silent while the index (a few hundred KB, once) comes in. */
      box.hidden = false; box.textContent = "";
      var first = el("div", null, "rr-card as-card");
      first.append(el("h3", "What the Atlas holds on this"), el("p", "Looking in the Atlas…", "cap as-wait")); box.append(first);
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      load().then(function (G) {
        var year = yearIn(line), cands = candidates(line, G.map, G.skip);
        box.textContent = "";
        if (!cands.length) {
          var c = el("div", null, "rr-card as-card");
          c.append(el("h3", "What the Atlas holds on this"),
            el("p", "No place the Atlas knows was found in that text. Type the place in the box above, in any spelling it has had, and press again."));
          box.append(c); return;
        }
        var flat = [];
        cands.forEach(function (g) { g.rows.slice(0, 6).forEach(function (r) { flat.push({ g: g, r: r }); }); });
        if (flat.length === 1) { drawPlace(flat[0].r, year, line, G, []); return; }
        var c2 = el("div", null, "rr-card as-card");
        c2.append(el("h3", "Which place?"), el("p", "The line names " + (cands.length === 1 ? "a name" : "names") + " that more than one place carries. Choose the one you mean.", "cap"));
        var ul = el("ul", null, "as-pick");
        flat.slice(0, 12).forEach(function (x) {
          var b = el("button", x.r.n + " · " + (x.r.cc || "") + " · " + (x.r.c || 0) + ((x.r.c || 0) === 1 ? " volume" : " volumes"), "chip");
          b.type = "button";
          b.addEventListener("click", function () {
            var others = flat.filter(function (y) { return y.r.i !== x.r.i && y.g === x.g; }).map(function (y) { return y.r; });
            drawPlace(x.r, year, line, G, others); box.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
          var li = el("li"); li.append(b); ul.append(li);
        });
        c2.append(ul); box.append(c2);
      }).catch(function () { box.textContent = ""; /* the status line already says */ });
    }

    btn.addEventListener("click", render);
    /* After a Claude reading the same card is drawn for the same text, so the two always agree about which place was meant. */
    document.addEventListener("ra-ask-read", render);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
