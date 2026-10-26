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
             migration: $("hm-l-migration"), flags: $("hm-l-flags"), ground: $("hm-l-ground"), voyages: $("hm-l-voyages"), leaders: $("hm-l-leaders") };
  var LEADERS = null, leaderLayer, leadersFetch = null;
  var elG = $("hm-gnote"), GROUND = null, groundLayer, groundKey = "";
  var elTour = $("hm-tour"), elTourBtn = $("hm-tour-btn"), pauseT = null, introT = null, dead = false;
  var elEra = $("hm-era");
  var compact = !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches);
  var bubbleLayer, bubQ = [], bubT = null, bubShown = [], numFor = {}, numN = 0, lastYear = null;

  var D = null, FM = null, chapter = null, year = 1914, timer = null, selected = null;
  var map, arcLayer, flagLayer, ownMap = false, rArc, rGround;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function yr(y) { return y < 0 ? Math.abs(y) + " BCE" : String(y); }

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
    }).catch(function () { elG.textContent = "The leaders could not be loaded."; });
  }
  function drawLeaders() {
    leaderLayer.clearLayers();
    if (!on.leaders.checked) return;
    if (!LEADERS) { loadLeaders(); return; }
    if (!FM || map.getZoom() < 3) return;
    var b = map.getBounds().pad(0.1);
    Object.keys(FM.at).forEach(function (cc) {
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
    if (!on.voyages || !on.voyages.checked || !D.voyages) return shown;
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
      ? act.length + " polities have a boundary in this atlas for " + yr(year) + ". Each polity has its own colour so they can be told apart; the colours mean nothing else, and a polity keeps its colour through the years. Where none is drawn, nothing is known here, not nothing happened."
      : "No boundary data for " + yr(year) + ", so the ground is left untinted.";
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
      var at = FM.at[cc]; if (!at || !b.contains(at)) return;
      var r = flagAt(FM.f[cc], year); if (!r) return;
      L.marker(at, { icon: L.divIcon({ className: "hm-flag", iconSize: [26, 18], iconAnchor: [13, 9],
        html: "<img alt='' src='" + BASE + "fl/" + r[2] + ".svg' loading='lazy'>" }), keyboard: false })
        .bindTooltip(esc(cc) + " in " + year, { direction: "top" }).addTo(flagLayer);
    });
  }

  /* THE ROLLING LIST. Redrawn only when its contents change (not every tick), and a reader who has scrolled
     down keeps their place: it used to be wiped and rebuilt each second, which made it impossible to scroll. */
  var listSig = "";
  function list(vis, voy) {
    voy = voy || [];
    elListH.textContent = "Under way, " + (year) + (vis.length + voy.length ? " (" + (vis.length + voy.length) + ")" : "");
    var shown = vis.slice(0, 80);
    var sig = voy.map(function (x) { return "v" + x.i; }).concat(shown.map(function (v) { return v.i + ":" + (numFor[v.i] || ""); })).join(",");
    if (sig === listSig) return;
    listSig = sig;
    var keep = elList.scrollTop || 0;
    elList.innerHTML = "";
    voy.forEach(function (x) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--c", VCOL);
      b.innerHTML = esc(x.v.title) + "<small>Voyage \u00b7 " + esc(x.v.leader.name) + " \u00b7 " + esc(spanV(x.v)) + "</small>";
      b.addEventListener("click", function () { selectVoyage(x.i); });
      li.appendChild(b); elList.appendChild(li);
    });
    shown.forEach(function (v) {
      var m = v.m, li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--c", COL[m.v]);
      if (m.major) b.className = "hm-major";
      b.innerHTML = (numFor[v.i] ? "<i class='hm-numb'>" + numFor[v.i] + "</i>" : "") + esc(m.major || m.ot) + "<small>" + esc(KIND[m.v]) + " · " + esc(m.s) + " · from " + m.f + "</small>";
      if (m.tip) b.title = m.tip;
      b.addEventListener("click", function () { select(v.i, true); });
      li.appendChild(b); elList.appendChild(li);
    });
    if (!vis.length && !voy.length) { var li2 = document.createElement("li"); li2.textContent = "Nothing in this atlas began in these years, with these layers."; elList.appendChild(li2); }
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
    var how = { country: "Both ends are countries this atlas draws; the arrow joins their label points.",
      seat: "The other party is drawn from the seat it ruled from or the home of the people: " + (m.seat || "") + ". It means “from there”, not a route.",
      origin: "The people are named by nationality, so the arrow starts at that country's label point. It is not a route.",
      stub: "The page names no second place, so this is a stub at the country." }[m.how];
    var span = m.f + (m.t !== m.f ? "–" + (m.present ? "present" : m.t) : "");
    elCard.innerHTML = "<h2 style='border-left:4px solid " + COL[m.v] + ";padding-left:8px'>" + esc(m.major || KIND[m.v]) + " · " + esc(span) + "</h2>" +
      "<p><b>" + esc(m.ot) + "</b></p>" +
      (m.tip ? "<p>" + esc(m.tip) + "</p>" : "") +
      "<p>Recorded on the page for <b>" + esc(m.s) + "</b>, " + (m.d === "in" ? "coming in." : "going out.") + "</p>" +
      leaderLine(m) +
      "<p class='hm-fine'>" + esc(how) + "</p>" +
      "<p><a href='" + BASE + "flags/" + esc(m.p) + "/#" + esc(m.e) + "'>Read it on the flag page &rarr;</a></p>";
    if (pan && m.b) map.panTo(m.b);
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
    if (!bubQ.length) return;
    showBubble(bubQ.shift());
    bubT = setTimeout(pumpBubbles, compact ? 2300 : 4200);
  }
  function announce(from, to) {
    if (!D || !D.moves) return;
    D.moves.forEach(function (m, i) {
      if (!m.major || !on[m.v] || !on[m.v].checked) return;
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
    draw(); url();
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
    var step = reduce ? 5 : 1, per = reduce ? 1000 / (parseInt(elSpeed.value, 10) / 5) : 1000 / parseInt(elSpeed.value, 10);
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
    stop(); cancelPause(); clearBubbles();
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
    groundLayer = L.layerGroup().addTo(map);
    arcLayer = L.layerGroup().addTo(map); flagLayer = L.layerGroup().addTo(map); leaderLayer = L.layerGroup().addTo(map); bubbleLayer = L.layerGroup().addTo(map);
    var moved = function () { drawFlags(); drawLeaders(); };
    map.on("zoomend moveend", moved);

    var ctl = {
      setYear: function (y, fromUser) { return D && setYear(y, fromUser); },
      play: function () { if (D) play(); }, stop: function () { stop(); cancelPause(); },
      setChapter: function (id, auto) { if (D) setChapter(id, auto); },
      tour: function () { if (D) { if (elTour) elTour.checked = true; setChapter(D.chapters[0].id, true); } },
      year: function () { return year; }, playing: function () { return !!timer; },
      data: function () { return D; },
      redraw: function () { if (D) draw(); },
      destroy: function () {
        dead = true; stop(); cancelPause();
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
        map.off("zoomend moveend", moved);
        clearBubbles(); hideEra();
        [groundLayer, arcLayer, flagLayer, leaderLayer, bubbleLayer].forEach(function (g) { map.removeLayer(g); });
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
      strip();
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
