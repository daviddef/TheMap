/* THE PLACE HEADER ON MY RESEARCH: the country, the doors out of the page, and the ground's own history as a strip you can press to filter.
 *
 * David, looking at the place cards on My research (Kaštelir, Kraljevica) and at the Ližnjan page: «for each of the place headers, could you also
 * add the country and then add the buttons, icon like you have in the place page, and the mini map with mortality events from the main overlay,
 * allowing me to click and filter the results for that period.» This is that, on the same data the place page and the map read:
 *
 *   the country        its name beside the place, from the place's own file
 *   the four doors     Country, Flags, Archives, Map: the same four the place page's «at a glance» offers
 *   the strip          who held the ground, to scale (regions.json, the ground's own era table), with the mass-mortality events whose outline
 *                      contains the place (or lies within a few miles of it) as marks above it (mortality.json). Pressing an era or an event
 *                      shows only the books whose years overlap it; pressing it again, or «Show all», puts the rest back.
 *
 * WHAT IT CLAIMS. Only what the data holds. A place with no era table of its own gets no band (the country's flags are not offered as the ground's
 * history); a place no event reached gets no marks, which is not a claim that it was spared. A book with no years in its title is never hidden by
 * a filter, and the card says how many were left in.
 *
 * Pure rules at the top (tested in test/place-strip.test.js); the DOM below. A classic script; it fetches nothing itself. */
(function (root) {
  "use strict";
  var TS_END = 2026;

  /* The scale: before 1650 a table that starts before 1500 gets 14% of the width, so the centuries a family left registers in are not squeezed
     away by the 1200s (the same rule the map's strip uses). */
  function axis(a) {
    var br = a < 1500 ? [1650, 0.14] : null;
    return {
      a: a, br: br,
      x: function (y) {
        y = Math.max(a, Math.min(TS_END, y));
        if (br && y < br[0]) return (y - a) / (br[0] - a) * br[1];
        if (br) return br[1] + (y - br[0]) / (TS_END - br[0]) * (1 - br[1]);
        return (y - a) / (TS_END - a);
      }
    };
  }

  /* An event reaches a place when its outline contains it, or an edge lies within a few miles (the outlines are simplified, so the coast is allowed). */
  function mortHit(e, lat, lon) {
    var near = 0.35;
    return (e.poly || []).some(function (ring) {
      var inside = false, n = ring.length, i, j, a, b;
      for (i = 0, j = n - 1; i < n; j = i++) {
        a = ring[i]; b = ring[j];
        if ((a[1] > lon) !== (b[1] > lon) && lat < (b[0] - a[0]) * (lon - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      if (inside) return true;
      for (i = 0, j = n - 1; i < n; j = i++) {
        a = ring[i]; b = ring[j];
        var dx = b[1] - a[1], dy = b[0] - a[0], L2 = dx * dx + dy * dy,
            t = L2 ? Math.max(0, Math.min(1, ((lon - a[1]) * dx + (lat - a[0]) * dy) / L2)) : 0,
            ex = a[1] + t * dx - lon, ey = a[0] + t * dy - lat;
        if (ex * ex + ey * ey < near * near) return true;
      }
      return false;
    });
  }
  function eventsFor(events, lat, lon, from) {
    if (lat == null || lon == null) return [];
    return (events || []).filter(function (e) { return e.f <= TS_END && e.t >= from && mortHit(e, lat, lon); })
      .sort(function (a, b) { return a.f - b.f || a.t - b.t; });
  }

  /* The first and last year written in a title («Births 1753-1893», «Óbitos 1977, Abr-Ago»), or null. */
  function yearsIn(t) {
    var ys = (String(t || "").match(/\b(1[2-9]\d\d|20[0-2]\d)\b/g) || []).map(Number);
    return ys.length ? [Math.min.apply(null, ys), Math.max.apply(null, ys)] : null;
  }
  /* Does a book that runs a..b overlap the period p0..p1? A book with no known years always stays. */
  function keeps(a, b, p0, p1) {
    if (a == null || isNaN(a)) return true;
    if (b == null || isNaN(b)) b = a;
    return a <= p1 && b >= p0;
  }
  function span(f, t) { return f === t ? String(f) : f + "–" + (t >= TS_END ? "present" : t); }

  /* The flag of a country today and the slug of its flags page, from flag-map.json ({slug: {slug: cc}, f: {cc: [[from, to, image], ...]}}). */
  function flagOf(map, cc) {
    var slug = null, S = (map && map.slug) || {};
    Object.keys(S).some(function (s) { if (S[s] === cc) { slug = s; return true; } return false; });
    var rows = (map && map.f && map.f[cc]) || [], last = rows.length ? rows[rows.length - 1] : null;
    return { slug: slug, image: last ? last[2] : null };
  }

  var KIND = { war: "#a4302a", genocide: "#6d1f4b", atrocity: "#6d1f4b", massacre: "#6d1f4b", epidemic: "#2f7d6d", famine: "#b8860b", displacement: "#35606e" };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var SVG = "http://www.w3.org/2000/svg";
  function icon(path) {
    var s = document.createElementNS(SVG, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "22"); s.setAttribute("height", "22");
    s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "mrpg-i");
    var p = document.createElementNS(SVG, "path"); p.setAttribute("d", path); s.appendChild(p); return s;
  }
  var ICON = { flag: "M5 21V4M5 5h12l-2 4 2 4H5", book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM8 8h7M8 12h7", pin: "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" };

  /* THE FOUR DOORS. o: { base, id, name, lat, lon, cc, country, flagMap } */
  function doors(o) {
    var ul = el("ul", "mrpg-links"), cc = String(o.cc || "").toUpperCase(), lc = cc.toLowerCase(), f = flagOf(o.flagMap, cc);
    function chip(href, small, text, lead) {
      var li = el("li"), a = el("a", "mrpg-chip"); a.href = href;
      if (lead) a.appendChild(lead);
      var sp = el("span"); sp.append(el("small", "", small), document.createTextNode(text)); a.appendChild(sp); li.appendChild(a); ul.appendChild(li);
    }
    if (cc) {
      var lead = null;
      if (f.image) { lead = el("img", "mrpg-flag"); lead.src = o.base + "fl/" + f.image + ".svg"; lead.width = 32; lead.height = 21; lead.alt = ""; lead.loading = "lazy"; }
      chip(o.base + "country/" + lc + "/", "Country", o.country || cc, lead);
      if (f.slug) chip(o.base + "flags/" + f.slug + "/", "Flags", "Flags of " + (o.country || cc), icon(ICON.flag));
      chip(o.base + "country/" + lc + "/sources/", "Archives", "Sources for " + (o.country || cc), icon(ICON.book));
    }
    var ml = o.base + "?q=" + encodeURIComponent(o.name) + "&at=" + encodeURIComponent(o.id) + (o.lat != null ? "&view=" + o.lat + "," + o.lon + ",12" : "");
    chip(ml, "Map", "Show on the map", icon(ICON.pin));
    return ul;
  }

  /* THE STRIP. o: { eras: [{from,to,polity,regime}], events: [...], onPick(period|null), period }. Returns an element, or null when there is nothing to draw. */
  function strip(o) {
    var eras = (o.eras || []).filter(function (e) { return +e.from && +e.to; }).sort(function (a, b) { return a.from - b.from; });
    var events = o.events || [];
    if (eras.length < 2 && !events.length) return null;
    var start = eras.length ? +eras[0].from : Math.max(1500, events.length ? Math.min.apply(null, events.map(function (e) { return e.f; })) : 1500);
    var A = axis(start), box = el("div", "mrpg-tl"), cur = o.period || null;
    var btns = [];
    function pick(f, t) {
      var same = cur && cur[0] === f && cur[1] === t;
      cur = same ? null : [f, t]; paint(); o.onPick(cur);
    }
    function paint() {
      btns.forEach(function (b) { b.el.classList.toggle("on", !!cur && cur[0] === b.f && cur[1] === b.t); });
      box.classList.toggle("has", !!cur);
    }
    if (events.length) {
      var lane = el("div", "mrpg-evl"), lanes = [];
      events.forEach(function (e) {
        var x0 = A.x(Math.max(e.f, start)), x1 = Math.max(A.x(Math.min(e.t, TS_END)), x0 + 0.012), ln = 0;
        while (lanes[ln] != null && lanes[ln] > x0 - 0.006) ln++;
        if (ln > 5) return;
        lanes[ln] = x1;
        var b = el("button", "mrpg-ev k-" + e.ty); b.type = "button";
        b.style.left = x0 * 100 + "%"; b.style.width = (x1 - x0) * 100 + "%"; b.style.top = ln * 10 + "px";
        if (KIND[e.ty]) b.style.background = KIND[e.ty];
        b.title = e.n + ", " + span(e.f, e.t) + ". Shows only the books for these years.";
        b.setAttribute("aria-label", e.n + ", " + span(e.f, e.t) + ". Show only the books for these years.");
        b.addEventListener("click", function () { pick(Math.max(e.f, start), Math.min(e.t, TS_END)); });
        btns.push({ el: b, f: Math.max(e.f, start), t: Math.min(e.t, TS_END) });
        lane.appendChild(b);
      });
      lane.style.height = Math.max(1, lanes.length) * 10 + "px";
      box.appendChild(lane);
    }
    var band = el("div", "mrpg-band");
    eras.forEach(function (e) {
      var b = el("button", "mrpg-seg"); b.type = "button";
      var tint = e.regime ? "var(--r-" + String(e.regime).replace(/[^a-z0-9-]/gi, "") + ", #7C8A91)" : "#7C8A91";
      b.style.setProperty("--seg", tint);
      b.style.left = (A.x(+e.from) * 100).toFixed(3) + "%";
      b.style.width = ((A.x(Math.min(+e.to, TS_END)) - A.x(+e.from)) * 100).toFixed(3) + "%";
      var t = el("span", "mrpg-segt"); t.append(el("b", "", String(e.from)), document.createTextNode(" " + (e.polity || "")));
      b.appendChild(t);
      b.title = (e.polity || "") + ", " + span(+e.from, +e.to) + ". Shows only the books for these years.";
      b.setAttribute("aria-label", (e.polity || "an era") + ", " + span(+e.from, +e.to) + ". Show only the books for these years.");
      b.addEventListener("click", function () { pick(+e.from, Math.min(+e.to, TS_END)); });
      btns.push({ el: b, f: +e.from, t: Math.min(+e.to, TS_END) });
      band.appendChild(b);
    });
    if (eras.length) box.appendChild(band);
    var ax = el("div", "mrpg-ax");
    [start, 1700, 1800, 1900, TS_END].filter(function (y, i, a) { return y >= start && a.indexOf(y) === i; }).forEach(function (y) {
      var s = el("span", "", String(y)); s.style.left = A.x(y) * 100 + "%"; ax.appendChild(s);
    });
    box.appendChild(ax);
    paint();
    return box;
  }

  var api = { axis: axis, mortHit: mortHit, eventsFor: eventsFor, yearsIn: yearsIn, keeps: keeps, span: span, flagOf: flagOf, doors: doors, strip: strip };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.raPlaceStrip = api;
})(typeof window !== "undefined" ? window : this);
