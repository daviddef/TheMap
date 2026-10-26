/* HistoryTheatre — the History playback as a module. /history/ mounts it on its own map
   (history-map.js is only that bootstrap); the records map mounts it on ITS map, so one map
   shows both the records and the ground changing hands. Reads history.json (built by
   scripts/build-history.py), flag-map.json, leaders.json and history-ground.json.

   Rules kept from the records map: an arrow never claims a route, a stub says it has no
   second place, and anything uncertain is worded as the source worded it.

   HistoryTheatre.create(opts) -> Promise of a controller
     opts.base      site base path
     opts.map       an existing Leaflet map to draw on (otherwise #hm-map is created)
     opts.scope     element whose .hm-chip[data-ch] buttons pick a chapter (default document)
     opts.els       id -> element for hm-year, hm-ch, hm-range, hm-play, hm-speed, hm-trail,
                    hm-list, hm-list-h, hm-card, hm-load, hm-dens, hm-ticks, hm-gnote, hm-tour,
                    hm-tour-btn and the hm-l-* layer boxes; anything missing is a harmless stub
     opts.keys      false = no keyboard shortcuts
     opts.syncUrl   false = leave the address alone
     opts.followChapterView  true = each era zooms to its own region (off by default: the world stays framed)
     opts.start     "chapter" (default, the /history/ behaviour) | "none"
     opts.onYear(y), opts.onPlay(bool), opts.onChapter(chapter|null)
   controller: setYear, play, stop, setChapter, tour, year(), playing(), destroy() */
(function () {
  "use strict";
  var NOOP_STYLE = { setProperty: function () {}, removeProperty: function () {} };
  function stub() {
    return { style: NOOP_STYLE, innerHTML: "", textContent: "", value: "2", checked: false, hidden: false, tagName: "STUB",
             addEventListener: function () {}, removeEventListener: function () {}, setAttribute: function () {},
             removeAttribute: function () {}, appendChild: function () {} };
  }
  function create(opts) {
  opts = opts || {};
  var scope = opts.scope || document;
  var BASE = opts.base || "/";
  var CHIPS = ".hm-chip[data-ch], .ra-th-chip[data-ch]";
  var listeners = [];                       // [target, type, fn] so destroy() can take them all off
  function listen(t, type, fn) { t.addEventListener(type, fn); listeners.push([t, type, fn]); }
  var MIN = 600, MAX = 2026;
  var COL = { conquest: "#B3442E", occupation: "#C9792B", migration: "#2E6F8E" };
  var KIND = { conquest: "Conquest", occupation: "Occupation", migration: "Migration" };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return (opts.els && opts.els[id]) || document.getElementById(id) || stub(); };
  var elYear = $("hm-year"), elCh = $("hm-ch"), elRange = $("hm-range"), elPlay = $("hm-play"),
      elSpeed = $("hm-speed"), elTrail = $("hm-trail"), elList = $("hm-list"), elCard = $("hm-card"),
      elLoad = $("hm-load"), elDens = $("hm-dens"), elTicks = $("hm-ticks"), elListH = $("hm-list-h");
  var on = { conquest: $("hm-l-conquest"), occupation: $("hm-l-occupation"),
             migration: $("hm-l-migration"), flags: $("hm-l-flags"), ground: $("hm-l-ground"), voyages: $("hm-l-voyages"), leaders: $("hm-l-leaders"), grid: $("hm-l-grid") };
  var LEADERS = null, leaderLayer, leadersFetch = null, leaderWaiters = [], ERAS = null, erasFetch = null, detailPop = null;
  var elG = $("hm-gnote"), GROUND = null, groundLayer, groundKey = "";
  var elTour = $("hm-tour"), elTourBtn = $("hm-tour-btn"), pauseT = null, introT = null, dead = false;
  var elEra = $("hm-era");
  var compact = !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches);
  var focus = null, namesIdx = null, elFocus = $("hm-focus"), elFocusFlags = $("hm-focus-flags");
  var gridLayer, bubbleLayer, bubQ = [], bubT = null, bubShown = [], numFor = {}, numN = 0, lastYear = null;

  var D = null, FM = null, chapter = null, year = 1914, timer = null, selected = null;
  var map, arcLayer, flagLayer, ownMap = false, rArc, rGround, rGrid;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : String(y); }

  /* ---- focus on one country ----------------------------------------------- */
  /* Type a country and the map keeps only the movements that involve it (it was the one that moved, or it is
     the other end of the arrow), flies there, and plays its history from its first recorded movement. The
     flags it flew sit under the year, each marked with the years it held. */
  function involves(m, cc) { return m.s === cc || m.o === cc || (m.how === "origin" && m.seat === cc); }
  function norm(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
  function buildNames() {
    namesIdx = {};
    var ccs = {};
    Object.keys(FM ? FM.at : {}).forEach(function (c) { ccs[c] = 1; });
    D.moves.forEach(function (m) { ccs[m.s] = 1; if (m.o) ccs[m.o] = 1; if (m.how === "origin" && m.seat) ccs[m.seat] = 1; });
    Object.keys(ccs).forEach(function (c) {
      if (c === "CN-TW") { namesIdx.taiwan = c; return; }
      var n = cname(c); if (n && n !== c) namesIdx[norm(n)] = c;
    });
    if (elFocus && elFocus.tagName !== "STUB") {
      var dl = document.createElement("datalist"); dl.id = "hm-focus-dl-" + Math.floor(Math.random() * 1e6);
      dl.innerHTML = Object.keys(namesIdx).sort().map(function (k) { var c = namesIdx[k]; return "<option value=\"" + esc(c === "CN-TW" ? "Taiwan" : cname(c)) + "\">"; }).join("");
      document.body.appendChild(dl); elFocus.setAttribute("list", dl.id);
    }
  }
  function focusStrip() {
    if (!elFocusFlags || elFocusFlags.tagName === "STUB") return;
    if (!focus || !FM || !FM.f[focus]) { elFocusFlags.innerHTML = ""; elFocusFlags.hidden = true; return; }
    elFocusFlags.hidden = false;
    elFocusFlags.innerHTML = "<button type='button' class='hm-ffx' title='Back to the whole world'>" + esc(cname(focus)) + " &times;</button>" + FM.f[focus].map(function (r) {
      var cur = r[0] <= year && (r[1] === null || r[1] === undefined || r[1] >= year);
      var k = r[2].indexOf("--");
      return "<a class='hm-ff" + (cur ? " cur" : "") + "' href='" + BASE + "flags/" + esc(r[2].slice(0, k)) + "/#" + esc(r[2].slice(k + 2)) + "' title='" +
        esc(cname(focus) + ", " + r[0] + "\u2013" + (r[1] || "present") + " \u2014 open its flag page") + "'><img alt='' src='" + BASE + "fl/" + esc(r[2]) + ".svg' loading='lazy' onerror=\"this.style.display='none'\"><small>" + r[0] + "</small></a>";
    }).join("");
  }
  function setFocus(cc) {
    focus = cc || null; listSig = ""; listYear = null;
    stop(); cancelPause(); clearBubbles(); closeDetail();
    if (!focus) { elCh.textContent = chapter ? chapter.title + " \u2014 " + chapter.blurb : ""; if (elFocus && elFocus.value) elFocus.value = ""; focusStrip(); draw(); return; }
    var mv = D.moves.filter(function (m) { return involves(m, focus); });
    var first = mv.length ? Math.min.apply(null, mv.map(function (m) { return m.f; })) : year;
    chapter = null;
    scope.querySelectorAll(CHIPS).forEach(function (b) { b.removeAttribute("aria-current"); });
    ["conquest", "occupation", "migration"].forEach(function (k) { on[k].checked = true; });
    elCh.textContent = cname(focus) + " \u2014 " + mv.length + " movement" + (mv.length === 1 ? "" : "s") + " in the atlas" + (mv.length ? ", the first from " + first : "") + ".";
    if (FM && FM.at[focus]) map.setView(FM.at[focus], Math.max(4, Math.min(map.getZoom(), 5)), { animate: true });   // country-wide, even if a village search had zoomed right in
    focusStrip();
    setYear(Math.max(MIN, Math.min(first - 2, MAX)));
    play();
  }
  /* The records map has its own search box; it hands its text (or the country of the place it opened) to
     this, so there is one place to type. True when the text named a country and the focus moved to it. */
  function focusByName(text) {
    if (!namesIdx) return false;
    var cc = namesIdx[norm(text)];
    if (!cc) return false;
    if (cc !== focus) setFocus(cc);
    return true;
  }
  function focusFromInput() {
    var v = norm(elFocus.value);
    if (!v) { if (focus) setFocus(null); return; }
    var cc = namesIdx && namesIdx[v]; if (cc && cc !== focus) setFocus(cc);
  }

  /* ---- gridlines: a labelled graticule, spaced by how far in the reader is ---- */
  function lonName(l) { l = ((l + 540) % 360) - 180; return Math.abs(l) === 180 ? "180\u00b0" : (l === 0 ? "0\u00b0" : Math.abs(l) + "\u00b0" + (l < 0 ? "W" : "E")); }
  function drawGrid() {
    if (!gridLayer) return;
    gridLayer.clearLayers();
    if (!on.grid || !on.grid.checked) return;
    var z = map.getZoom(), step = z >= 7 ? 2 : z >= 6 ? 5 : z >= 4 ? 10 : z >= 3 ? 15 : 30;
    var b = map.getBounds(), w = b.getWest(), e = b.getEast(), so = Math.max(b.getSouth(), -84), no = Math.min(b.getNorth(), 84);
    var line = function (pts, strong) {
      L.polyline(pts, { renderer: rGrid, className: "hm-gline", color: "#3d4f5a", weight: strong ? 1.1 : 0.7, opacity: strong ? 0.55 : 0.4,
        dashArray: strong ? null : "2 5", interactive: false }).addTo(gridLayer);
    };
    var label = function (at, txt, anchor, cls) {
      L.marker(at, { icon: L.divIcon({ className: "hm-gl" + (cls ? " " + cls : ""), iconSize: [0, 0], iconAnchor: anchor, html: "<span>" + txt + "</span>" }),
        interactive: false, keyboard: false }).addTo(gridLayer);
    };
    var inset = (e - w) * 0.006, pad = (e - w) / 2;      // lines run past the edges so a pan does not show their ends
    for (var lat = Math.ceil(so / step) * step; lat <= no; lat += step) {
      line([[lat, w - pad], [lat, e + pad]], lat === 0);
      // on the right edge: the left is under the year and the list
      label([lat, e - inset], lat === 0 ? "0\u00b0" : Math.abs(lat) + "\u00b0" + (lat < 0 ? "S" : "N"), [0, 12], "hm-gl-r");
    }
    for (var lon = Math.ceil((w - pad) / step) * step; lon <= e + pad; lon += step) {
      line([[-84, lon], [84, lon]], false);
      if (lon >= w && lon <= e) label([b.getNorth() - (b.getNorth() - b.getSouth()) * 0.012, lon], lonName(lon), [-3, -2]);   // along the top: the foot carries the note
    }
  }

  /* ---- geometry --------------------------------------------------------- */
  function curve(a, b) {
    var lat1 = a[0], lon1 = a[1], lat2 = b[0], lon2 = b[1];
    var dl = lon2 - lon1;
    if (dl > 180) lon2 -= 360; else if (dl < -180) lon2 += 360;
    var mx = (lat1 + lat2) / 2, my = (lon1 + lon2) / 2;
    var dx = lat2 - lat1, dy = lon2 - lon1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = Math.min(len * 0.22, 28);
    var cx = mx + (-dy / len) * off, cy = my + (dx / len) * off;
    var pts = [], n = 28;
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      pts.push([u * u * lat1 + 2 * u * t * cx + t * t * lat2, u * u * lon1 + 2 * u * t * cy + t * t * lon2]);
    }
    return pts;
  }
  function bearing(p, q) {
    var dy = q[1] - p[1], dx = q[0] - p[0];
    return Math.atan2(dy, dx) * 180 / Math.PI;       // screen: lon to the right, lat up
  }

  /* ---- drawing ---------------------------------------------------------- */
  function visibleMoves() {
    var trail = parseInt(elTrail.value, 10) || 30, out = [];
    D.moves.forEach(function (m, i) {
      if (!on[m.v] || !on[m.v].checked) return;
      if (m.f > year || year - m.f >= trail) return;
      if (focus && !involves(m, focus)) return;
      out.push({ m: m, i: i, age: (year - m.f) / trail });
    });
    out.sort(function (x, y) { return y.m.f - x.m.f; });
    return out;
  }

  function spanOf(m) {
    if (m.open) return m.f + " onward";
    return m.f + (m.t !== m.f ? "\u2013" + (m.present ? "present" : m.t) : "");
  }
  function label(m) {
    var span = m.f + (m.t !== m.f ? "–" + (m.present ? "present" : m.t) : "");
    return "<b>" + esc(KIND[m.v]) + "</b> · " + esc(m.ot) + " <span style='opacity:.7'>" + esc(span) + "</span>";
  }

  function draw() {
    arcLayer.clearLayers();
    var vis = visibleMoves();
    vis.forEach(function (v) {
      var m = v.m, col = COL[m.v], fade = 1 - v.age * 0.75, fresh = v.age < 0.12;
      var click = function () { select(v.i); };
      if (m.how === "stub") {
        var c = m.a, dir = m.d === "in" ? 1 : -1;
        L.circleMarker(c, { renderer: rArc, radius: 5, color: col, weight: 2, fillColor: col, fillOpacity: .5 * fade, opacity: fade })
          .on("click", click).bindTooltip(label(m), { sticky: true }).addTo(arcLayer);
        var tail = [c[0] + 5 * dir, c[1] - 6 * dir];
        L.polyline(curve(m.d === "in" ? tail : c, m.d === "in" ? c : tail),
          { renderer: rArc, color: col, weight: 1.6, opacity: .55 * fade, className: "hm-stub", interactive: false }).addTo(arcLayer);
        return;
      }
      var pts = curve(m.a, m.b);
      var line = L.polyline(pts, {
        renderer: rArc, color: col, weight: m.v === "migration" ? 2.2 : 2.8, opacity: .85 * fade,
        className: "hm-arc" + (fresh && !reduce ? " hm-grow" : "")
      }).on("click", click).bindTooltip(label(m), { sticky: true }).addTo(arcLayer);
      var n = pts.length, ang = bearing(pts[n - 3], pts[n - 1]);
      var head = L.marker(pts[n - 1], {
        icon: L.divIcon({ className: "", iconSize: [10, 12], iconAnchor: [5, 6],
          html: "<div class='hm-head' style='--c:" + col + ";opacity:" + fade + ";transform:rotate(" + (90 - ang) + "deg)'></div>" }),
        keyboard: false
      }).on("click", click).addTo(arcLayer);
      if (fresh && !reduce) {
        L.marker(pts[n - 1], { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
          html: "<div class='hm-pulse' style='--c:" + col + ";width:26px;height:26px'></div>" }), interactive: false, keyboard: false }).addTo(arcLayer);
      }
    });
    var voy = drawVoyages();
    list(vis, voy);
    drawFlags();
    drawLeaders();
    drawGround();
    drawGrid();
  }

  /* ---- heads of state (Wikidata, CC0) ------------------------------------ */
  function dec(day) { var p = day.split("-"); return +p[0] + ((+p[1] - 1) * 30.44 + (+p[2] - 1)) / 365.25; }
  function leaderAt(cc, y) {
    var rows = LEADERS && LEADERS[cc]; if (!rows) return null;
    var mid = y + 0.5, best = null;
    rows.forEach(function (r) {
      if (r._a <= mid && mid < r._b && (!best || r._a > best._a)) best = r;   // the one who began most recently
    });
    return best;
  }
  function loadLeaders() {
    if (leadersFetch) return;
    leadersFetch = fetch(BASE + "leaders.json").then(function (r) { return r.json(); }).then(function (j) {
      LEADERS = j.countries;
      Object.keys(LEADERS).forEach(function (cc) {
        LEADERS[cc].forEach(function (r) { r._a = r[4] ? dec(r[4]) : r[2]; r._b = r[5] ? dec(r[5]) : 2100; });
      });
      draw();
      leaderWaiters.splice(0).forEach(function (f) { f(); });
    }).catch(function () { elG.textContent = "The leaders could not be loaded."; });
  }
  function drawLeaders() {
    leaderLayer.clearLayers();
    if (!on.leaders.checked) return;
    if (!LEADERS) { loadLeaders(); return; }
    if (!FM || map.getZoom() < 3) return;
    var b = map.getBounds().pad(0.1);
    Object.keys(FM.at).forEach(function (cc) {
      if (focus && cc !== focus) return;
      var at = FM.at[cc]; if (!at || !b.contains(at)) return;
      var r = leaderAt(cc, year); if (!r) return;
      L.marker(at, { icon: L.divIcon({ className: "hm-leader", iconSize: [0, 0], iconAnchor: [0, -8],
        html: "<span>" + esc(r[0]) + "</span>" }), keyboard: false })
        .bindTooltip(esc(r[0]) + " <span style='opacity:.7'>" + r[2] + "\u2013" + (r[3] === null ? "" : r[3]) + " \u00b7 head of state of " + esc(cc) + "</span>", { direction: "top" })
        .on("click", function () { window.open("https://www.wikidata.org/wiki/" + r[1], "_blank", "noopener"); })
        .addTo(leaderLayer);
    });
  }

  /* ---- voyages and expeditions ------------------------------------------ */
  var VCOL = "#7A4FA3", VTRAIL = 25;
  /* A route that crosses the antimeridian (Magellan to Guam) must not be drawn the long way round:
     each waypoint's longitude is shifted by a whole turn to sit within 180 degrees of the one before. */
  function unwrapRoutes() {
    (D.voyages || []).forEach(function (v) {
      var prev = null;
      v.route.forEach(function (w) {
        var l = w.lon;
        if (prev !== null) { while (l - prev > 180) l -= 360; while (l - prev < -180) l += 360; }
        w.ulon = l; prev = l;
      });
    });
  }
  function posAt(route, y) {
    if (y <= route[0].year) return { lat: route[0].lat, lon: route[0].ulon, year: y, upto: 1 };
    for (var i = 1; i < route.length; i++) {
      var a = route[i - 1], b = route[i];
      if (y <= b.year) {
        var t = b.year === a.year ? 1 : (y - a.year) / (b.year - a.year);
        return { lat: a.lat + (b.lat - a.lat) * t, lon: a.ulon + (b.ulon - a.ulon) * t, year: y, upto: i };
      }
    }
    var l = route[route.length - 1]; return { lat: l.lat, lon: l.ulon, year: y, upto: route.length };
  }
  function drawVoyages() {
    var shown = [];
    if (!on.voyages || !on.voyages.checked || !D.voyages || focus) return shown;
    D.voyages.forEach(function (v, i) {
      if (year < Math.floor(v.from) || year > v.to + VTRAIL) return;
      var done = year > v.to, y = Math.min(year + 0.5, v.to + 0.99), age = done ? Math.min(1, (year - v.to) / VTRAIL) : 0;
      var fade = 1 - age * 0.7;
      var cur = posAt(v.route, y), pts = [];
      for (var k = 0; k < Math.min(cur.upto, v.route.length); k++) pts.push([v.route[k].lat, v.route[k].ulon]);
      if (!done) pts.push([cur.lat, cur.lon]);
      if (pts.length < 2) return;
      var click = function () { selectVoyage(i); };
      L.polyline(pts, { renderer: rArc, color: VCOL, weight: 2.6, opacity: .9 * fade, className: "hm-voy" })
        .on("click", click).bindTooltip("<b>Voyage</b> \u00b7 " + esc(v.title) + " <span style='opacity:.7'>" + esc(spanV(v)) + "</span>", { sticky: true }).addTo(arcLayer);
      v.route.forEach(function (w, k) {
        if (k >= cur.upto && !done) return;
        if (w.aid) return;                       // a helper point that keeps the line at sea, not a waypoint a source gives
        L.circleMarker([w.lat, w.ulon], { renderer: rArc, radius: 3, color: VCOL, weight: 1, fillColor: "#fff", fillOpacity: .9 * fade, opacity: fade })
          .on("click", click).bindTooltip(esc(w.name) + " <span style='opacity:.7'>" + Math.floor(w.year) + (w.approx ? ", approximate" : "") + "</span>", { direction: "top" }).addTo(arcLayer);
      });
      (v.reached || []).forEach(function (r) {
        if (year + 0.99 < r.year) return;
        L.circleMarker([r.lat, r.lon], { renderer: rArc, radius: 6, color: "#fff", weight: 2, fillColor: VCOL, fillOpacity: fade, opacity: fade })
          .on("click", click).bindTooltip("<b>" + esc(r.name) + "</b> " + Math.floor(r.year) + "<br>" + esc(r.claim || ""), { direction: "top" }).addTo(arcLayer);
      });
      if (!done) {
        L.marker([cur.lat, cur.lon], { icon: L.divIcon({ className: "hm-ship", iconSize: [22, 22], iconAnchor: [11, 11], html: v.kind === "sea" ? "\u26f5" : v.kind === "space" ? "\ud83d\ude80" : "\ud83e\udded" }), keyboard: false })
          .on("click", click).addTo(arcLayer);
      }
      shown.push({ v: v, i: i });
    });
    return shown;
  }
  function spanV(v) { return Math.floor(v.from) + (Math.floor(v.to) !== Math.floor(v.from) ? "\u2013" + Math.floor(v.to) : ""); }
  function selectVoyage(i) {
    var v = D.voyages[i], fl = "";
    if (FM && v.sponsor && v.sponsor.polity && FM.slug[v.sponsor.polity]) {
      var r = flagAt(FM.f[FM.slug[v.sponsor.polity]] || [], Math.floor(v.from));
      if (r) fl = "<img alt='' src='" + BASE + "fl/" + r[2] + ".svg' style='width:34px;border:1px solid rgba(0,0,0,.35);vertical-align:middle;margin-right:6px;background:#fff'>";
    }
    var q = v.leader && v.leader.q ? " <a href='https://www.wikidata.org/wiki/" + esc(v.leader.q) + "'>Wikidata</a>" : "";
    var h = "<h2 style='border-left:4px solid " + VCOL + ";padding-left:8px'>Voyage \u00b7 " + esc(spanV(v)) + "</h2><p><b>" + esc(v.title) + "</b></p>";
    h += "<p>Led by <b>" + esc(v.leader.name) + "</b>" + q + ".</p>";
    var rv = "";
    if (v.sponsor && v.sponsor.ruler) {
      var vf = v.sponsor.verified && v.sponsor.verified[v.sponsor.ruler_q];
      rv = vf ? (vf.termCoveringStart ? " (reign confirmed in Wikidata)" : vf.aliveAtStart ? " (alive then; reign not in Wikidata)" : "") : "";
    }
    if (v.sponsor) h += "<p>Sponsor: " + fl + esc(v.sponsor.name || "") + (v.sponsor.ruler ? " under " + esc(v.sponsor.ruler) + rv : "") + ". " + esc(v.sponsor.note || "") + "</p>";
    if ((v.reached || []).length) h += "<p>Reached: " + v.reached.map(function (r) { return "<b>" + esc(r.name) + "</b> " + Math.floor(r.year) + " (" + esc(r.claim || "") + (r.already_inhabited ? "; already inhabited: " + esc(r.already_inhabited) : "") + ")"; }).join("; ") + ".</p>";
    h += "<p class='hm-fine'>Evidence: " + esc(v.evidence || "unreviewed") + ". " + esc(v.open || "") + " The route joins dated waypoints; the line between them is not a track. Coordinates of named places come from Wikidata where it has them; otherwise they are approximate.</p>";
    h += "<p class='hm-fine'>" + (v.sources || []).map(function (s) { return "<a href='" + esc(s.url) + "'>" + esc(s.title) + "</a> (" + esc(s.publisher) + ")"; }).join(" \u00b7 ") + "</p>";
    elCard.innerHTML = h;
    if (v.reached && v.reached.length) map.panTo([v.reached[0].lat, v.reached[0].lon]);
  }

  /* ---- who held the ground (OpenHistoricalMap, CC0) --------------------- */
  function hue(str) {
    var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function drawGround() {
    if (!on.ground.checked) { groundLayer.clearLayers(); groundKey = ""; elG.textContent = ""; return; }
    if (!GROUND) { loadGround(); return; }
    var act = GROUND.shapes.filter(function (sh) { return sh.s <= year && year < sh.e; });
    var key = act.map(function (sh) { return sh.n + sh.s; }).join("|");
    elG.textContent = act.length
      ? act.length + " boundaries drawn for " + yr(year) + ". Colours only tell the polities apart. Blank ground means nothing is known there, not that nothing happened."
      : "No boundaries drawn for " + yr(year) + ": nothing is known here, not nothing happened.";
    if (key === groundKey) return;
    groundKey = key; groundLayer.clearLayers();
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    act.forEach(function (sh) {
      var col = "hsl(" + hue(sh.q || sh.n) + "," + (dark ? 55 : 50) + "%," + (dark ? 58 : 42) + "%)";
      sh.p.forEach(function (ring) {
        var ll = ring.map(function (c) { return [c[1], c[0]]; });
        L.polygon(ll, { renderer: rGround, pane: "ground", color: col, weight: 1, opacity: .7, fillColor: col, fillOpacity: dark ? .2 : .24, interactive: true, smoothFactor: 1 })
          .bindTooltip(esc(sh.n) + " <span style='opacity:.7'>" + yr(sh.s) + "\u2013" + (sh.e >= 2027 ? "present" : yr(sh.e)) + "</span>", { sticky: true })
          .addTo(groundLayer);
      });
    });
  }
  var groundFetch = null;
  function loadGround() {
    if (groundFetch) return;
    groundFetch = fetch(BASE + "history-ground.json").then(function (r) { return r.json(); })
      .then(function (g) { GROUND = g; drawGround(); }).catch(function () { elG.textContent = "The boundaries could not be loaded."; });
  }

  function flagAt(rows, y) {
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r[0] > y) break;
      if (r[1] === null || r[1] === undefined || r[1] >= y) best = r;
    }
    return best;
  }
  function drawFlags() {
    flagLayer.clearLayers();
    if (!on.flags.checked || !FM || map.getZoom() < 3) return;
    var b = map.getBounds().pad(0.1);
    Object.keys(FM.f).forEach(function (cc) {
      if (focus && cc !== focus) return;
      var at = FM.at[cc]; if (!at || !b.contains(at)) return;
      var r = flagAt(FM.f[cc], year); if (!r) return;
      L.marker(at, { icon: L.divIcon({ className: "hm-flag", iconSize: [26, 18], iconAnchor: [13, 9],
        html: "<img alt='' src='" + BASE + "fl/" + r[2] + ".svg' loading='lazy'>" }), keyboard: false })
        .bindTooltip(esc(cc) + " in " + year, { direction: "top" }).addTo(flagLayer);
    });
  }

  /* THE ROLLING LIST. Redrawn only when its contents change (not every tick), and a reader who has scrolled
     down keeps their place: it used to be wiped and rebuilt each second, which made it impossible to scroll. */
  /* MINI FLAGS ON EACH ROW: the other party's flag in that year (where it is a country the atlas draws), then the
     flag of the regime on the receiving or sending end, from its own era card. A flag that is not there
     simply does not show. */
  function miniFlag(img, alt) {
    return "<img class='hm-mf' loading='lazy' alt='' title='" + esc(alt) + "' src='" + BASE + "fl/" + esc(img) + ".svg' onerror=\"this.style.display='none'\">";
  }
  function rowFlags(m) {
    var h = "", oc = m.how === "country" ? m.o : (m.how === "origin" ? m.seat : null);
    if (oc && FM && FM.f[oc]) { var of = flagAt(FM.f[oc], m.f); if (of) h += miniFlag(of[2], "The flag of " + cname(oc) + " in " + m.f); }
    h += miniFlag(m.p + "--" + m.e, "The flag of " + cname(m.s) + " in this era");
    return "<span class='hm-rowflags'>" + h + "</span>";
  }
  function voyFlag(v) {
    if (FM && v.sponsor && v.sponsor.polity && FM.slug[v.sponsor.polity]) {
      var r = flagAt(FM.f[FM.slug[v.sponsor.polity]] || [], Math.floor(v.from));
      if (r) return "<span class='hm-rowflags'>" + miniFlag(r[2], "Sponsor: " + (v.sponsor.name || "")) + "</span>";
    }
    return "<span class='hm-rowflags'></span>";
  }
  var listSig = "", listIds = {}, listYear = null;
  function list(vis, voy) {
    voy = voy || [];
    elListH.textContent = (focus ? cname(focus) + ", " : "Under way, ") + (year) + (vis.length + voy.length ? " (" + (vis.length + voy.length) + ")" : "");
    var shown = vis.slice(0, 80);
    var sig = voy.map(function (x) { return "v" + x.i; }).concat(shown.map(function (v) { return v.i + ":" + (numFor[v.i] || ""); })).join(",");
    if (sig === listSig) return;
    listSig = sig;
    var keep = elList.scrollTop || 0;
    /* FLASH WHAT JUST ARRIVED. A row that was not in the last list is new; it pulses so the eye finds it.
       Not after a jump (an era change, a scrub, the first draw): then every row would flash. */
    var flashOK = !reduce && listSig !== "" && listYear !== null && Math.abs(year - listYear) <= 6;
    var was = listIds, now = {};
    listYear = year;
    elList.innerHTML = "";
    voy.forEach(function (x) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--c", VCOL);
      now["v" + x.i] = 1; if (flashOK && !was["v" + x.i]) b.className = "hm-new";
      b.innerHTML = voyFlag(x.v) + "<span class='hm-rowtxt'>" + esc(x.v.title) + "<small>Voyage \u00b7 " + esc(x.v.leader.name) + " \u00b7 " + esc(spanV(x.v)) + "</small></span>";
      b.addEventListener("click", function () { selectVoyage(x.i); });
      li.appendChild(b); elList.appendChild(li);
    });
    shown.forEach(function (v) {
      var m = v.m, li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--c", COL[m.v]);
      now[v.i] = 1;
      b.className = (m.major ? "hm-major" : "") + (flashOK && !was[v.i] ? " hm-new" : "");
      b.innerHTML = rowFlags(m) + "<span class='hm-rowtxt'>" + (numFor[v.i] ? "<i class='hm-numb'>" + numFor[v.i] + "</i>" : "") + esc(m.major || m.ot) + "<small>" + esc(KIND[m.v]) + " · " + esc(m.s) + " · from " + m.f + "</small></span>";
      if (m.tip) b.title = m.tip;
      b.addEventListener("click", function () { select(v.i, true); });
      li.appendChild(b); elList.appendChild(li);
    });
    if (!vis.length && !voy.length) { var li2 = document.createElement("li"); li2.textContent = "Nothing in this atlas began in these years, with these layers."; elList.appendChild(li2); }
    listIds = now;
    elList.scrollTop = keep;
  }

  function leaderLine(m) {
    if (!LEADERS) { if (on.leaders.checked) loadLeaders(); return ""; }
    var r = leaderAt(m.s, m.f);
    return r ? "<p>At its start, " + esc(m.s) + " was led by <b>" + esc(r[0]) + "</b> (" + r[2] + "\u2013" + (r[3] === null ? "" : r[3]) + ", per Wikidata).</p>" : "";
  }
  function select(i, pan) {
    selected = i;
    var m = D.moves[i];
    openDetail(i);
    var how = { country: "Both ends are countries this atlas draws; the arrow joins their label points.",
      seat: "The other party is drawn from the seat it ruled from or the home of the people: " + (m.seat || "") + ". It means “from there”, not a route.",
      origin: "The people are named by nationality, so the arrow starts at that country's label point. It is not a route.",
      stub: "The page names no second place, so this is a stub at the country." }[m.how];
    var span = m.f + (m.t !== m.f ? "–" + (m.present ? "present" : m.t) : "");
    if (!(opts.cardless && !compact)) elCard.innerHTML = "<h2 style='border-left:4px solid " + COL[m.v] + ";padding-left:8px'>" + esc(m.major || KIND[m.v]) + " · " + esc(span) + "</h2>" +
      "<p><b>" + esc(m.ot) + "</b></p>" +
      (m.tip ? "<p>" + esc(m.tip) + "</p>" : "") +
      "<p>Recorded on the page for <b>" + esc(m.s) + "</b>, " + (m.d === "in" ? "coming in." : "going out.") + "</p>" +
      leaderLine(m) +
      "<p class='hm-fine'>" + esc(how) + "</p>" +
      "<p><a href='" + BASE + "flags/" + esc(m.p) + "/#" + esc(m.e) + "'>Read it on the flag page &rarr;</a></p>";
    if (pan && m.b) map.panTo(m.b);
  }

  /* ---- the detail bubble: everything the atlas knows about ONE movement ------ */
  function cname(cc) {
    try { return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || cc; } catch (e) { return cc; }
  }
  /* A flag is the way into its page: the image links to that era's flag page. */
  function flagImg(img, alt) {
    var k = img.indexOf("--"), href = k > 0 ? BASE + "flags/" + img.slice(0, k) + "/#" + img.slice(k + 2) : "";
    var im = "<img class='hm-d-flag' alt='" + esc(alt) + "' src='" + BASE + "fl/" + esc(img) + ".svg' onerror=\"this.style.display='none'\">";
    return href ? "<a class='hm-d-flaglink' href='" + esc(href) + "' title='" + esc(alt + " \u2014 open its flag page") + "'>" + im + "</a>" : im;
  }
  function leaderTxt(cc, y) {
    var r = leaderAt(cc, y);
    return r ? "<b>" + esc(r[0]) + "</b> <span>(" + esc(cname(cc)) + ", " + r[2] + "\u2013" + (r[3] === null ? "" : r[3]) + ")</span>" : "";
  }
  function loadEras(cb) {
    if (ERAS) return cb();
    if (!erasFetch) erasFetch = fetch(BASE + "flag-eras.json").then(function (r) { return r.json(); })
      .then(function (j) { ERAS = j.eras || []; }).catch(function () { ERAS = []; });
    erasFetch.then(cb);
  }
  /* WHO LED, FROM TWO SOURCES, EACH SAID TO BE WHAT IT IS. The flag page names who was in charge of the era it
     describes (a hand-written tag, so it reaches back to Charlemagne and the Song); Wikidata gives heads of
     state only for countries as they are drawn today, which is why it is silent for almost everything before
     1800 and for any empire. Neither is filled in from the other. */
  function leadersHTML(m, ld) {
    var h = (m.lead || []).map(function (l) { return "<b>" + esc(l[0]) + "</b> <span>\u2014 " + esc(l[1]) + "</span>"; });
    if (h.length) h.push("<span class='hm-d-src'>named on the flag page</span>");
    if (ld === null) h.push("<span>Wikidata heads of state: loading\u2026</span>");
    else if (ld.length) h = h.concat(ld.map(function (x) { return x + " <span class='hm-d-src'>Wikidata</span>"; }));
    else if (!h.length) h.push("<span>no leader named for these years</span>");
    return h.join("<br>");
  }
  function detailHTML(m, i) {
    var col = COL[m.v], span = spanOf(m);
    var where = cname(m.s), other = "";
    if (m.how === "country" && m.o) other = cname(m.o);
    else if (m.how === "origin" && m.seat) other = cname(m.seat);
    else if (m.how === "seat" && m.seat) other = m.seat;
    var dir = m.d === "in" ? (other ? "from " + esc(other) + " into " + esc(where) : "into " + esc(where))
                           : (other ? "out of " + esc(where) + " to " + esc(other) : "out of " + esc(where));
    var era = ERAS && ERAS.filter(function (e) { return e.slug === m.p && e.id === m.e; })[0];
    var flags = flagImg(m.p + "--" + m.e, "The flag of " + where + " in this era");
    var oc = m.how === "country" ? m.o : (m.how === "origin" ? m.seat : null);
    if (oc && FM && FM.f[oc]) { var of = flagAt(FM.f[oc], m.f); if (of) flags += flagImg(of[2], "The flag of " + cname(oc) + " in " + m.f); }
    var ld = LEADERS ? [leaderTxt(m.s, m.f), oc ? leaderTxt(oc, m.f) : ""].filter(Boolean) : null;
    var how = { country: "Both ends are countries this atlas draws; the arrow joins their label points.",
      seat: "The other party is drawn from the seat it ruled from: " + (m.seat || "") + ". It means \u201cfrom there\u201d, not a route.",
      origin: "The people are named by nationality, so the arrow starts at that country's label point. It is not a route.",
      stub: "The page names no second place, so this is a stub at the country." }[m.how];
    return "<div class='hm-d'><div class='hm-b-k' style='color:" + col + "'>" + esc(KIND[m.v]) + " \u00b7 " + esc(span) + "</div>" +
      "<b>" + esc(m.major || m.ot) + "</b>" +
      (m.tip ? "<p class='hm-d-what'>" + esc(m.tip) + "</p>" : "") +
      "<dl><dt>Where</dt><dd>" + dir + "</dd>" +
      "<dt>Who</dt><dd>" + esc(m.ot) + "</dd>" +
      (era ? "<dt>Under</dt><dd>" + esc(era.polity) + " <span>(" + esc(era.dates) + ")</span></dd>" : "") +
      "<dt>Flags</dt><dd class='hm-d-flags'>" + flags + "</dd>" +
      "<dt>Leaders</dt><dd>" + leadersHTML(m, ld) + "</dd></dl>" +
      "<p class='hm-fine'>" + esc(how) + "</p></div>";
  }
  /* THE DETAIL BUBBLE IS OUR OWN CARD, NOT A LEAFLET POPUP. A popup opens above its point and is cut off when
     the point is near the top edge, and fixing that by panning the map made the world jump. This card is laid
     over the map beside the arrow, kept inside the map whatever the arrow's position, scrolls when it is
     taller than the map, and the map never moves. A pulsing ring marks which arrow it is about. */
  var detailRing = null, detailOff = null;
  function closeDetail() {
    if (detailPop) { detailPop.remove(); detailPop = null; }
    if (detailRing) { map.removeLayer(detailRing); detailRing = null; }
    if (detailOff) { map.off("move zoom resize", detailOff); detailOff = null; }
  }
  function openDetail(i) {
    var m = D.moves[i];
    if (compact || opts.detail === false) return;
    clearBubbles(); closeDetail();
    var el = document.createElement("div");
    el.className = "hm-dpop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "About this movement");
    el.innerHTML = "<button type='button' class='hm-dpop-x' aria-label='Close'>&times;</button><div class='hm-dpop-body'></div>";
    map.getContainer().appendChild(el);
    L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
    var body = el.querySelector(".hm-dpop-body");
    detailPop = el;
    detailRing = L.marker(m.b, { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      html: "<div class='hm-pulse' style='--c:" + COL[m.v] + ";width:26px;height:26px'></div>" }), interactive: false, keyboard: false }).addTo(map);
    var place = function () {
      if (detailPop !== el) return;
      var sz = map.getSize(), pt = map.latLngToContainerPoint(m.b);
      var w = Math.min(340, sz.x - 16);
      el.style.width = w + "px"; el.style.maxHeight = Math.max(120, sz.y - 16) + "px";
      var h = el.offsetHeight;
      var left = pt.x + 20;
      if (left + w > sz.x - 8) left = pt.x - 20 - w;
      left = Math.max(8, Math.min(left, sz.x - w - 8));
      var top = Math.max(8, Math.min(pt.y - h / 2, sz.y - h - 8));
      el.style.left = left + "px"; el.style.top = top + "px";
    };
    var fill = function () { if (detailPop === el) { body.innerHTML = detailHTML(m, i); place(); } };
    el.querySelector(".hm-dpop-x").addEventListener("click", closeDetail);
    detailOff = place; map.on("move zoom resize", place);
    fill();
    loadEras(fill);
    if (!LEADERS) { leaderWaiters.push(fill); loadLeaders(); }
  }

  /* ---- A: a bubble where a major movement lands --------------------------- */
  /* The curated few (data/history-major.json) announce themselves as they start: one bubble every four
     seconds at most, one on the map at a time, each quoting the sentence the flag page gives. Scrubbing
     by hand makes none (a jump is not an event). On a phone a bubble is bigger than the thing it explains,
     so there it is a numbered pin and the same number sits in the list. */
  function bubbleHTML(m, i) {
    var col = COL[m.v];
    return "<div class='hm-b'><div class='hm-b-k' style='color:" + col + "'>" + esc(KIND[m.v]) + " · " + esc(spanOf(m)) + "</div>" +
      "<b>" + esc(m.major || m.ot) + "</b>" + (m.tip ? "<p>" + esc(m.tip.length > 260 ? m.tip.slice(0, 257).replace(/\s+\S*$/, "") + "…" : m.tip) + "</p>" : "") +
      "<a href='" + BASE + "flags/" + esc(m.p) + "/#" + esc(m.e) + "'>Read it on the flag page &rarr;</a></div>";
  }
  function dropBubble(b) {
    if (b.t) clearTimeout(b.t);
    if (b.layer && bubbleLayer) bubbleLayer.removeLayer(b.layer);
    var k = bubShown.indexOf(b); if (k > -1) bubShown.splice(k, 1);
  }
  function showBubble(item) {
    var m = D.moves[item.i], layer;
    if (compact) {
      numN = numN % 9 + 1; numFor[item.i] = numN;
      layer = L.marker(m.b, { icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
        html: "<div class='hm-num' style='background:" + COL[m.v] + "'>" + numN + "</div>" }), keyboard: false })
        .on("click", function () { select(item.i, false); });
    } else {
      layer = L.popup({ autoPan: false, closeOnClick: false, autoClose: false, closeButton: true,
        className: "hm-bubble", maxWidth: 270, minWidth: 190, offset: [0, -4] })
        .setLatLng(m.b).setContent(bubbleHTML(m, item.i));
    }
    var b = { layer: layer };
    bubbleLayer.addLayer(layer);
    if (!compact) layer.on("remove", function () { var k = bubShown.indexOf(b); if (k > -1) bubShown.splice(k, 1); });
    b.t = setTimeout(function () { dropBubble(b); }, reduce ? 10000 : (compact ? 12000 : 8000));
    bubShown.push(b);
    while (bubShown.length > (compact ? 5 : 1)) dropBubble(bubShown[0]);
  }
  function pumpBubbles() {
    bubT = null;
    if (detailPop) bubQ = [];
    if (!bubQ.length) return;
    showBubble(bubQ.shift());
    bubT = setTimeout(pumpBubbles, compact ? 2300 : 4200);
  }
  function announce(from, to) {
    if (!D || !D.moves || detailPop) return;      // a bubble the reader opened is not talked over
    D.moves.forEach(function (m, i) {
      if (!m.major || !on[m.v] || !on[m.v].checked) return;
      if (focus && !involves(m, focus)) return;
      if (m.f > from && m.f <= to && bubQ.length < 6) bubQ.push({ i: i });
    });
    if (bubQ.length && !bubT) pumpBubbles();
  }
  function clearBubbles() {
    bubQ = []; if (bubT) { clearTimeout(bubT); bubT = null; }
    bubShown.slice().forEach(dropBubble); numFor = {}; numN = 0;
  }

  /* ---- D: the era card ------------------------------------------------------ */
  function majorsOf(ch) {
    return D.moves.filter(function (m) { return m.major && m.f >= ch.from && m.f <= ch.to && ch.layers.indexOf(m.v) > -1; })
      .sort(function (a, b) { return a.f - b.f; });
  }
  function hideEra() { if (introT) { clearTimeout(introT); introT = null; } if (elEra && elEra.hidden === false) elEra.hidden = true; }
  function showEra(ch, then) {
    if (!elEra || !elEra.addEventListener || elEra.tagName === "STUB") { if (then) then(); return; }
    var i = D.chapters.indexOf(ch) + 1, mj = majorsOf(ch);
    elEra.innerHTML = "<div class='hm-era-n'>Era " + i + " of " + D.chapters.length + " · " + ch.from + "–" + ch.to + "</div>" +
      "<h2>" + esc(ch.title) + "</h2><p>" + esc(ch.blurb) + "</p>" +
      (mj.length ? "<div class='hm-era-m'>" + mj.length + " headline movement" + (mj.length === 1 ? "" : "s") + ": " +
        mj.slice(0, 4).map(function (m) { return esc(m.major); }).join(" · ") + (mj.length > 4 ? " · …" : "") + "</div>" : "") +
      "<button type='button' class='hm-era-go'>Start this era</button>";
    elEra.hidden = false;
    var go = function () { hideEra(); if (then) then(); };
    elEra.querySelector(".hm-era-go").addEventListener("click", go);
    introT = setTimeout(go, reduce ? 3000 : 5200);
  }

  /* ---- time ------------------------------------------------------------- */
  function setYear(y, fromUser) {
    var was = year;
    year = Math.max(MIN, Math.min(MAX, y));
    elRange.value = year; elYear.textContent = yr(year);
    if (fromUser) { stop(); cancelPause(); clearBubbles(); }
    draw(); url(); if (focus) focusStrip();
    if (!fromUser && timer && year > was && year - was <= 6) announce(was, year);
    if (opts.onYear) opts.onYear(year, !!fromUser);
  }
  function stop() {
    if (!timer) return;
    clearInterval(timer); timer = null; bubQ = [];
    elPlay.innerHTML = "&#9654;"; elPlay.setAttribute("aria-pressed", "false");
    if (opts.onPlay) opts.onPlay(false);
  }
  function play() {
    if (timer) return stop();
    hideEra();
    var end = chapter ? chapter.to : MAX;
    if (year >= end) setYear(chapter ? chapter.from : MIN);
    elPlay.innerHTML = "&#9632;"; elPlay.setAttribute("aria-pressed", "true");
    if (opts.onPlay) opts.onPlay(true);
    var yps = parseFloat(elSpeed.value) || 0.5;          // years a second; 0.2 is one year every five seconds
    var step = reduce ? 5 : 1, per = reduce ? 1000 / (yps / 5) : 1000 / yps;
    timer = setInterval(function () {
      var e = chapter ? chapter.to : MAX;
      if (year >= e) { stop(); nextEra(); return; }
      setYear(year + step);
    }, per);
  }
  /* ERA BY ERA. When a chapter has run to its end and «Continue to the next era» is on, the
     map says what is coming, waits long enough to read it, then moves its view and years to the
     next chapter and keeps playing. The last chapter just stops. */
  function nextEra() {
    if (!chapter || !elTour || !elTour.checked) return;
    var i = D.chapters.indexOf(chapter), nx = D.chapters[i + 1];
    if (!nx) { elCh.textContent = chapter.title + " \u2014 that was the last era."; return; }
    elCh.textContent = "Next: " + nx.title + " (" + nx.from + "\u2013" + nx.to + ")";
    clearTimeout(pauseT);
    pauseT = setTimeout(function () { pauseT = null; setChapter(nx.id, true); }, reduce ? 800 : 1200);
  }
  function cancelPause() { if (pauseT) { clearTimeout(pauseT); pauseT = null; } hideEra(); }

  function setChapter(id, autoplay) {
    stop(); cancelPause(); clearBubbles(); listYear = null;
    if (focus) { focus = null; if (elFocus && elFocus.value) elFocus.value = ""; focusStrip(); }   // picking an era leaves the one-country view
    chapter = D.chapters.filter(function (c) { return c.id === id; })[0] || null;
    scope.querySelectorAll(CHIPS).forEach(function (b) {
      if (chapter && b.getAttribute("data-ch") === chapter.id) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
    if (opts.onChapter) opts.onChapter(chapter);
    if (!chapter) { elCh.textContent = ""; return; }
    elCh.textContent = chapter.title + " — " + chapter.blurb;
    ["conquest", "occupation", "migration"].forEach(function (k) { on[k].checked = chapter.layers.indexOf(k) > -1; });
    map.invalidateSize();
    /* THE WHOLE WORLD STAYS IN VIEW. David, with the full-world playback in front of him: «can we default our
       map to this zoom?». Each era used to zoom into its own region, which hid the rest of the ground changing
       hands. An era now keeps whatever the reader has framed; opts.followChapterView brings the old zoom back. */
    if (opts.followChapterView) map.setView([chapter.view[0], chapter.view[1]], chapter.view[2], { animate: false });
    year = chapter.from; elRange.value = year; elYear.textContent = yr(year);
    draw(); url();
    if (opts.onYear) opts.onYear(year, false);
    if (autoplay) { lastYear = null; showEra(chapter, play); }
  }

  function url() {
    if (opts.syncUrl === false) return;
    try {
      var q = new URLSearchParams();
      if (chapter) q.set("chapter", chapter.id);
      q.set("y", String(year));
      history.replaceState(null, "", location.pathname + "?" + q.toString());
    } catch (e) { /* the URL is a convenience */ }
  }

  /* ---- the density strip and the ticks ---------------------------------- */
  function strip() {
    var bins = D.density, ks = Object.keys(bins).map(Number), mx = 1;
    ks.forEach(function (k) { if (bins[k] > mx) mx = bins[k]; });
    var span = MAX - MIN, html = "";
    for (var y = MIN; y <= MAX; y += 10) {
      var n = bins[y] || 0; if (!n) continue;
      var h = Math.max(2, Math.round(n / mx * 38)), x = (y - MIN) / span * 1000, w = 10 / span * 1000;
      html += "<rect x='" + x.toFixed(1) + "' y='" + (40 - h) + "' width='" + Math.max(w - 1, 1).toFixed(1) + "' height='" + h + "'><title>" + y + "s: " + n + " began</title></rect>";
    }
    elDens.innerHTML = html;
    var t = "";
    [600, 800, 1000, 1200, 1400, 1600, 1800, 2000].forEach(function (y) {
      t += "<span style='left:" + ((y - MIN) / (MAX - MIN) * 100).toFixed(2) + "%'>" + y + "</span>";
    });
    elTicks.innerHTML = t;
  }

  /* ---- start ------------------------------------------------------------ */
  function whenReady(fn) { if (window.L) fn(); else window.addEventListener("load", fn); }
  function init(resolve, reject) {
    if (opts.map) { map = opts.map; }
    else {
      ownMap = true;
      map = L.map("hm-map", { worldCopyJump: true, minZoom: 2, zoomControl: false, preferCanvas: false })
        .setView([30, 20], 2);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 8, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      map.scrollWheelZoom.disable();
      map.on("click focus", function () { map.scrollWheelZoom.enable(); });
      map.on("mouseout", function () { map.scrollWheelZoom.disable(); });
    }
    if (!map.getPane("ground")) { map.createPane("ground"); map.getPane("ground").style.zIndex = 380; }
    /* A map that draws its own markers on canvas (the records map) still gets SVG here: the arrows
       are styled and animated by CSS class, which a canvas path cannot be. */
    if (opts.map) { rArc = L.svg({ padding: 0.5 }); rGround = L.svg({ pane: "ground", padding: 0.5 }); }
    if (!map.getPane("grid")) { map.createPane("grid"); map.getPane("grid").style.zIndex = 385; map.getPane("grid").style.pointerEvents = "none"; }
    rGrid = L.svg({ pane: "grid", padding: 0.5 });
    gridLayer = L.layerGroup().addTo(map);
    groundLayer = L.layerGroup().addTo(map);
    arcLayer = L.layerGroup().addTo(map); flagLayer = L.layerGroup().addTo(map); leaderLayer = L.layerGroup().addTo(map); bubbleLayer = L.layerGroup().addTo(map);
    var moved = function () { drawFlags(); drawLeaders(); drawGrid(); };
    map.on("zoomend moveend", moved);

    var ctl = {
      setYear: function (y, fromUser) { return D && setYear(y, fromUser); },
      play: function () { if (D) play(); }, stop: function () { stop(); cancelPause(); },
      setChapter: function (id, auto) { if (D) setChapter(id, auto); },
      tour: function () { if (D) { if (elTour) elTour.checked = true; setChapter(D.chapters[0].id, true); } },
      year: function () { return year; }, playing: function () { return !!timer; },
      data: function () { return D; },
      redraw: function () { if (D) draw(); },
      focus: function (cc) { if (D) setFocus(cc || null); },
      focusByName: function (t) { return D ? focusByName(t) : false; },
      destroy: function () {
        dead = true; stop(); cancelPause();
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
        map.off("zoomend moveend", moved);
        clearBubbles(); hideEra();
        if (rGrid) map.removeLayer(rGrid);
        closeDetail();
        [gridLayer, groundLayer, arcLayer, flagLayer, leaderLayer, bubbleLayer].forEach(function (g) { map.removeLayer(g); });
        elG.textContent = "";
        if (rArc) { map.removeLayer(rArc); map.removeLayer(rGround); }
        if (ownMap) map.remove();
      }
    };

    Promise.all([
      fetch(BASE + "history.json").then(function (r) { return r.json(); }),
      fetch(BASE + "flag-map.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      if (dead) return;
      D = res[0]; FM = res[1]; unwrapRoutes();
      elLoad.hidden = true;
      strip(); buildNames();
      if (elFocusFlags && elFocusFlags.tagName !== "STUB") listen(elFocusFlags, "click", function (e) {
        if (e.target.closest && e.target.closest(".hm-ffx")) setFocus(null);
      });
      if (elFocus && elFocus.tagName !== "STUB") {
        listen(elFocus, "input", focusFromInput); listen(elFocus, "change", focusFromInput);
        listen(elFocus, "keydown", function (e) { if (e.key === "Enter") focusFromInput(); });
      }
      listen(elRange, "input", function () { setYear(parseInt(elRange.value, 10), true); });
      listen(elPlay, "click", function () { cancelPause(); play(); });
      if (elTourBtn) listen(elTourBtn, "click", function () { ctl.tour(); });
      listen(elSpeed, "change", function () { if (timer) { stop(); play(); } });
      listen(elTrail, "change", draw);
      Object.keys(on).forEach(function (k) { listen(on[k], "change", draw); });
      scope.querySelectorAll(CHIPS).forEach(function (b) {
        listen(b, "click", function () { setChapter(b.getAttribute("data-ch"), true); });
      });
      if (opts.keys !== false) listen(document, "keydown", function (e) {
        var t = e.target || {};
        if (t.tagName === "INPUT" && t.type === "text" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
        if (e.key === " " && t !== elPlay && !(t.tagName === "BUTTON")) { e.preventDefault(); play(); }
        else if (e.key === "ArrowRight" && t !== elRange) { setYear(year + (e.shiftKey ? 10 : 1), true); }
        else if (e.key === "ArrowLeft" && t !== elRange) { setYear(year - (e.shiftKey ? 10 : 1), true); }
      });
      if (opts.start !== "none") {
        var q = new URLSearchParams(location.search), ch = q.get("chapter"), y = parseInt(q.get("y"), 10);
        if (ch) { setChapter(ch, false); if (y >= MIN && y <= MAX) setYear(y); play(); }
        else if (y >= MIN && y <= MAX) setYear(y);
        else { setChapter("world-wars", false); if (!reduce) play(); }
      }
      resolve(ctl);
    }).catch(function (e) {
      elLoad.textContent = "The movements could not be loaded. Try reloading the page.";
      reject(e);
    });
  }
  return new Promise(function (resolve, reject) { whenReady(function () { init(resolve, reject); }); });
  }
  window.HistoryTheatre = { create: create };
})();
