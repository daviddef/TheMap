/* /history/ — the second room. Reads history.json (built by scripts/build-history.py)
   and flag-map.json, draws arrows on a Leaflet SVG map, and plays the years.

   Rules kept from the records map: an arrow never claims a route, a stub says it has no
   second place, and anything uncertain is worded as the source worded it. */
(function () {
  "use strict";
  var root = document.getElementById("hm");
  if (!root) return;
  var BASE = root.getAttribute("data-base") || "/";
  var MIN = 600, MAX = 2026;
  var COL = { conquest: "#B3442E", occupation: "#C9792B", migration: "#2E6F8E" };
  var KIND = { conquest: "Conquest", occupation: "Occupation", migration: "Migration" };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return document.getElementById(id); };
  var elYear = $("hm-year"), elCh = $("hm-ch"), elRange = $("hm-range"), elPlay = $("hm-play"),
      elSpeed = $("hm-speed"), elTrail = $("hm-trail"), elList = $("hm-list"), elCard = $("hm-card"),
      elLoad = $("hm-load"), elDens = $("hm-dens"), elTicks = $("hm-ticks"), elListH = $("hm-list-h");
  var on = { conquest: $("hm-l-conquest"), occupation: $("hm-l-occupation"),
             migration: $("hm-l-migration"), flags: $("hm-l-flags"), ground: $("hm-l-ground") };
  var elG = $("hm-gnote"), GROUND = null, groundLayer, groundKey = "";

  var D = null, FM = null, chapter = null, year = 1914, timer = null, selected = null;
  var map, arcLayer, flagLayer;

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
        L.circleMarker(c, { radius: 5, color: col, weight: 2, fillColor: col, fillOpacity: .5 * fade, opacity: fade })
          .on("click", click).bindTooltip(label(m), { sticky: true }).addTo(arcLayer);
        var tail = [c[0] + 5 * dir, c[1] - 6 * dir];
        L.polyline(curve(m.d === "in" ? tail : c, m.d === "in" ? c : tail),
          { color: col, weight: 1.6, opacity: .55 * fade, className: "hm-stub", interactive: false }).addTo(arcLayer);
        return;
      }
      var pts = curve(m.a, m.b);
      var line = L.polyline(pts, {
        color: col, weight: m.v === "migration" ? 2.2 : 2.8, opacity: .85 * fade,
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
    list(vis);
    drawFlags();
    drawGround();
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
      ? act.length + " polities have a boundary in this atlas for " + yr(year) + ". Where none is drawn, nothing is known here, not nothing happened."
      : "No boundary data for " + yr(year) + ", so the ground is left untinted.";
    if (key === groundKey) return;
    groundKey = key; groundLayer.clearLayers();
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    act.forEach(function (sh) {
      var col = "hsl(" + hue(sh.q || sh.n) + "," + (dark ? 55 : 50) + "%," + (dark ? 58 : 42) + "%)";
      sh.p.forEach(function (ring) {
        var ll = ring.map(function (c) { return [c[1], c[0]]; });
        L.polygon(ll, { pane: "ground", color: col, weight: 1, opacity: .7, fillColor: col, fillOpacity: dark ? .2 : .24, interactive: true, smoothFactor: 1 })
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

  function list(vis) {
    elListH.textContent = "Under way, " + (year) + (vis.length ? " (" + vis.length + ")" : "");
    elList.innerHTML = "";
    vis.slice(0, 30).forEach(function (v) {
      var m = v.m, li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--c", COL[m.v]);
      b.innerHTML = esc(m.ot) + "<small>" + esc(KIND[m.v]) + " · " + esc(m.s) + " · from " + m.f + "</small>";
      b.addEventListener("click", function () { select(v.i, true); });
      li.appendChild(b); elList.appendChild(li);
    });
    if (!vis.length) { var li2 = document.createElement("li"); li2.textContent = "Nothing in this atlas began in these years, with these layers."; elList.appendChild(li2); }
  }

  function select(i, pan) {
    selected = i;
    var m = D.moves[i];
    var how = { country: "Both ends are countries this atlas draws; the arrow joins their label points.",
      seat: "The other party is drawn from the seat it ruled from or the home of the people: " + (m.seat || "") + ". It means “from there”, not a route.",
      origin: "The people are named by nationality, so the arrow starts at that country's label point. It is not a route.",
      stub: "The page names no second place, so this is a stub at the country." }[m.how];
    var span = m.f + (m.t !== m.f ? "–" + (m.present ? "present" : m.t) : "");
    elCard.innerHTML = "<h2 style='border-left:4px solid " + COL[m.v] + ";padding-left:8px'>" + esc(KIND[m.v]) + " · " + esc(span) + "</h2>" +
      "<p><b>" + esc(m.ot) + "</b></p>" +
      "<p>Recorded on the page for <b>" + esc(m.s) + "</b>, " + (m.d === "in" ? "coming in." : "going out.") + "</p>" +
      "<p class='hm-fine'>" + esc(dated) + " " + esc(how) + "</p>" +
      "<p><a href='" + BASE + "flags/" + esc(m.p) + "/#" + esc(m.e) + "'>Read it on the flag page &rarr;</a></p>";
    if (pan && m.b) map.panTo(m.b);
  }

  /* ---- time ------------------------------------------------------------- */
  function setYear(y, fromUser) {
    year = Math.max(MIN, Math.min(MAX, y));
    elRange.value = year; elYear.textContent = yr(year);
    if (fromUser) stop();
    draw(); url();
  }
  function stop() {
    if (!timer) return;
    clearInterval(timer); timer = null;
    elPlay.innerHTML = "&#9654;"; elPlay.setAttribute("aria-pressed", "false");
  }
  function play() {
    if (timer) return stop();
    var end = chapter ? chapter.to : MAX;
    if (year >= end) setYear(chapter ? chapter.from : MIN);
    elPlay.innerHTML = "&#9632;"; elPlay.setAttribute("aria-pressed", "true");
    var step = reduce ? 5 : 1, per = reduce ? 1000 / (parseInt(elSpeed.value, 10) / 5) : 1000 / parseInt(elSpeed.value, 10);
    timer = setInterval(function () {
      var e = chapter ? chapter.to : MAX;
      if (year >= e) { stop(); return; }
      setYear(year + step);
    }, per);
  }

  function setChapter(id, autoplay) {
    stop();
    chapter = D.chapters.filter(function (c) { return c.id === id; })[0] || null;
    document.querySelectorAll(".hm-chip").forEach(function (b) {
      if (chapter && b.getAttribute("data-ch") === chapter.id) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
    if (!chapter) { elCh.textContent = ""; return; }
    elCh.textContent = chapter.title + " — " + chapter.blurb;
    ["conquest", "occupation", "migration"].forEach(function (k) { on[k].checked = chapter.layers.indexOf(k) > -1; });
    map.setView([chapter.view[0], chapter.view[1]], chapter.view[2]);
    year = chapter.from; elRange.value = year; elYear.textContent = yr(year);
    draw(); url();
    if (autoplay) play();
  }

  function url() {
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
  function init() {
    map = L.map("hm-map", { worldCopyJump: true, minZoom: 2, zoomControl: false, preferCanvas: false })
      .setView([30, 20], 2);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 8, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    map.scrollWheelZoom.disable();
    map.on("click focus", function () { map.scrollWheelZoom.enable(); });
    map.on("mouseout", function () { map.scrollWheelZoom.disable(); });
    map.createPane("ground"); map.getPane("ground").style.zIndex = 380;
    groundLayer = L.layerGroup().addTo(map);
    arcLayer = L.layerGroup().addTo(map); flagLayer = L.layerGroup().addTo(map);
    map.on("zoomend moveend", drawFlags);

    Promise.all([
      fetch(BASE + "history.json").then(function (r) { return r.json(); }),
      fetch(BASE + "flag-map.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      D = res[0]; FM = res[1];
      elLoad.hidden = true;
      strip();
      elRange.addEventListener("input", function () { setYear(parseInt(elRange.value, 10), true); });
      elPlay.addEventListener("click", play);
      elSpeed.addEventListener("change", function () { if (timer) { stop(); play(); } });
      elTrail.addEventListener("change", draw);
      Object.keys(on).forEach(function (k) { on[k].addEventListener("change", draw); });
      document.querySelectorAll(".hm-chip").forEach(function (b) {
        b.addEventListener("click", function () { setChapter(b.getAttribute("data-ch"), true); });
      });
      document.addEventListener("keydown", function (e) {
        var t = e.target || {};
        if (t.tagName === "INPUT" && t.type === "text" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
        if (e.key === " " && t !== elPlay && !(t.tagName === "BUTTON")) { e.preventDefault(); play(); }
        else if (e.key === "ArrowRight" && t !== elRange) { setYear(year + (e.shiftKey ? 10 : 1), true); }
        else if (e.key === "ArrowLeft" && t !== elRange) { setYear(year - (e.shiftKey ? 10 : 1), true); }
      });
      var q = new URLSearchParams(location.search), ch = q.get("chapter"), y = parseInt(q.get("y"), 10);
      if (ch) { setChapter(ch, false); if (y >= MIN && y <= MAX) setYear(y); play(); }
      else if (y >= MIN && y <= MAX) setYear(y);
      else { setChapter("world-wars", false); if (!reduce) play(); }
    }).catch(function () {
      elLoad.textContent = "The movements could not be loaded. Try reloading the page.";
    });
  }
  if (window.L) init(); else window.addEventListener("load", init);
})();
