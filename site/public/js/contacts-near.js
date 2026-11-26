/* WHO TO CONTACT, ROUND A PLACE OR FOR ONE DOT ON THE MAP. Reads the one-degree squares scripts/contacts/build.py writes under contacts/,
   only those the ground touches, and only when the reader gets that far down the page. Rows from different sources are joined where they
   share an exact identifier and never on a name or on nearness; every value says which source gave it. A classic script: pages load it with
   a plain tag (data-base on the section), the tests load it as a module. */
(function (root) {
  "use strict";
  var REACH = ["email", "tel", "post", "form"];
  var KINDS = [["town-hall", "Town halls (where civil registers are usually kept or asked for)"], ["church", "Parishes and places of worship"],
    ["diocese", "Dioceses and church archives"], ["cemetery", "Burial grounds"], ["cemetery-manager", "Cemetery managers"], ["archive", "Archives"],
    ["library", "Libraries"], ["museum", "Museums and memorials"], ["society", "Societies and volunteers"], ["university", "Universities"], ["other", "Others"]];
  var SHOWN = 5, RADIUS = 20;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function km(a, b, c, d) {
    var p = Math.PI / 180, x = Math.pow(Math.sin((c - a) * p / 2), 2) + Math.cos(a * p) * Math.cos(c * p) * Math.pow(Math.sin((d - b) * p / 2), 2);
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }

  /* The files to fetch: every square the circle's bounding box touches that the index lists, with all its parts. */
  function filesFor(lat, lon, radius, index) {
    var dy = radius / 111, dx = radius / (111 * Math.max(0.1, Math.cos(lat * Math.PI / 180))), out = [];
    Object.keys(index.groups).forEach(function (g) {
      for (var y = Math.floor(lat - dy); y <= Math.floor(lat + dy); y++)
        for (var x = Math.floor(lon - dx); x <= Math.floor(lon + dx); x++) {
          var key = y + "_" + x, n = index.groups[g][key] || 0;
          for (var i = 0; i < n; i++) out.push(g + "/" + key + (i ? "-" + i : "") + ".json");
        }
    });
    return out;
  }

  /* Rows to institutions: joined where they share any identifier. Values keep their source, best source first. */
  function entities(rows, sources) {
    var rank = function (s) { return (sources[s] || {}).rank || 9; };
    var parent = {}, find = function (a) { if (parent[a] === undefined) parent[a] = a; while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    var idsOf = function (r) { return r.ids && r.ids.length ? r.ids : [r.id]; };
    rows.forEach(function (r) { var ids = idsOf(r); ids.slice(1).forEach(function (i) { parent[find(i)] = find(ids[0]); }); });
    var by = {};
    rows.slice().sort(function (a, b) { return rank(a.src) - rank(b.src) || (a.id < b.id ? -1 : 1); }).forEach(function (r) {
      var k = find(idsOf(r)[0]);
      var e = by[k] || (by[k] = { kind: r.kind, name: "", y: r.y, x: r.x, ids: [], srcs: [], url: r.url || "", email: [], tel: [], web: [], post: [], form: [], operator: [] });
      if (!e.name && r.name) e.name = r.name;
      idsOf(r).forEach(function (i) { if (e.ids.indexOf(i) < 0) e.ids.push(i); });
      if (e.srcs.indexOf(r.src) < 0) e.srcs.push(r.src);
      ["email", "tel", "web", "post", "form", "operator"].forEach(function (f) {
        [].concat(r[f] || []).forEach(function (v) {
          if (!e[f].some(function (h) { return same(f, h.v, v); })) e[f].push({ v: v, src: r.src });
        });
      });
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function same(field, a, b) {
    var f = field === "tel" ? function (s) { return s.replace(/\D/g, ""); }
      : field === "web" ? function (s) { return s.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }
        : function (s) { return s.toLowerCase(); };
    return f(a) === f(b);
  }

  function near(list, lat, lon, radius) {
    return list.map(function (e) { e.km = km(lat, lon, e.y, e.x); return e; }).filter(function (e) { return e.km <= radius; })
      /* what can be written to or rung first, then by distance */
      .sort(function (a, b) { return (reach(b) ? 1 : 0) - (reach(a) ? 1 : 0) || a.km - b.km; });
  }
  function reach(e) { return REACH.some(function (f) { return e[f].length; }); }

  function link(href, text) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(text) + "</a>"; }
  function host(u) { return u.replace(/^https?:\/\/(www\.)?/, "").replace(/[\/?#].*$/, ""); }
  /* The ways to reach one institution, as HTML. Only http(s) addresses become links, whatever a source says. */
  function ways(e) {
    var out = [];
    e.email.slice(0, 2).forEach(function (h) { out.push('<a href="mailto:' + esc(encodeURI(h.v)) + '">' + esc(h.v) + "</a>"); });
    e.tel.slice(0, 2).forEach(function (h) { out.push('<a href="tel:' + esc(h.v.replace(/ext\..*$/, "").replace(/[^+0-9]/g, "")) + '">' + esc(h.v) + "</a>"); });
    e.form.slice(0, 1).forEach(function (h) { if (/^https:\/\//.test(h.v)) out.push(link(h.v, "contact form")); });
    e.web.slice(0, 1).forEach(function (h) { if (/^https?:\/\//.test(h.v)) out.push(link(h.v, host(h.v))); });
    if (e.post.length) out.push(esc(e.post[0].v));
    if (e.operator.length) out.push("Run by " + esc(e.operator[0].v));
    return out.join(" · ");
  }
  function credit(ids, sources) { return ids.map(function (s) { return (sources[s] || {}).title || s; }).join(", "); }

  function item(e, sources) {
    var name = e.name || (e.kind === "cemetery" ? "A burial ground" : "Unnamed");
    return "<li>" + (/^https?:\/\//.test(e.url) ? link(e.url, name) : esc(name)) + ' <span class="y">' + (Math.round(e.km * 10) / 10) + " km</span>" +
      '<div>' + ways(e) + '</div><span class="who">Source: ' + esc(credit(e.srcs, sources)) + "</span></li>";
  }

  /* The whole section for a place, or "" where the Atlas holds nothing near it: an empty heading would read as «there is nobody to ask». */
  function section(list, sources) {
    if (!list.length) return "";
    var used = {}, h = '<h2 id="who-to-contact">Who to contact near here</h2><p class="cap">Within ' + RADIUS + " km, as each source states it. <b>Unchecked</b> unless the " +
      "source is Record Atlas: confirm on the institution's own page before sending anything personal. A place missing here is one the Atlas has no contact for yet, " +
      "not one with nobody to ask.</p>";
    KINDS.forEach(function (K) {
      var of = list.filter(function (e) { return e.kind === K[0]; });
      if (!of.length) return;
      of.forEach(function (e) { e.srcs.forEach(function (s) { used[s] = 1; }); });
      h += "<h3>" + esc(K[1]) + '</h3><ul class="vols">' + of.slice(0, SHOWN).map(function (e) { return item(e, sources); }).join("") + "</ul>";
      if (of.length > SHOWN) h += "<details><summary>" + (of.length - SHOWN) + ' more</summary><ul class="vols">' + of.slice(SHOWN, 60).map(function (e) { return item(e, sources); }).join("") + "</ul></details>";
    });
    return h + '<p class="cap">Sources: ' + Object.keys(used).map(function (s) { var m = sources[s] || {}; return link(m.url || "#", m.attribution || s) + " (" + esc(m.licence || "") + ")"; }).join(" · ") + ".</p>";
  }

  /* The index once per page, then only the squares needed. A square the index lists and cannot be read is a failure, said as one. */
  var cache = {};
  function get(url) {
    return cache[url] || (cache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); })
      .catch(function (e) { delete cache[url]; throw e; }));
  }
  function load(base, lat, lon, radius, getter) {
    var g = getter || get;
    return g(base + "contacts/index.json").then(function (index) {
      return Promise.all(filesFor(lat, lon, radius, index).map(function (f) { return g(base + "contacts/" + f); })).then(function (parts) {
        var rows = [].concat.apply([], parts.map(function (p) { return p.rows; }));
        return { list: near(entities(rows, index.sources), lat, lon, radius), sources: index.sources };
      });
    });
  }

  /* One dot on the map: the institution holding `id` («wd:Q1», «osm:n2») at that spot. */
  function fill(box, base, lat, lon, id, getter) {
    box.innerHTML = '<p class="at-sub">Looking for contacts…</p>';
    return load(base, lat, lon, 2, getter).then(function (r) {
      var e = r.list.filter(function (x) { return x.ids.indexOf(id) >= 0; })[0];
      box.innerHTML = e && ways(e) ? '<p class="at-sub"><b>Contact</b><br>' + ways(e) + "<br><small>Source: " + esc(credit(e.srcs, r.sources)) + ", unchecked unless Record Atlas</small></p>"
        : '<p class="at-sub">No contact held for this one yet.</p>';
    }).catch(function () { box.innerHTML = '<p class="at-sub">The contacts did not load.</p>'; });
  }

  function mount(el) {
    var lat = parseFloat(el.getAttribute("data-lat")), lon = parseFloat(el.getAttribute("data-lon")), base = el.getAttribute("data-base") || "/";
    if (!isFinite(lat) || !isFinite(lon)) return;
    var hashed = !!root.location && root.location.hash === "#who-to-contact";
    var started = false, go = function () {
      if (started) return;
      started = true;
      load(base, lat, lon, RADIUS).then(function (r) {
        el.innerHTML = section(r.list, r.sources);
        /* a link straight to the section arrives before the section exists */
        if (hashed && el.firstChild) el.scrollIntoView();
      }).catch(function () { el.innerHTML = '<p class="cap">The contacts near here did not load. Reload the page to try again.</p>'; });
    };
    if (hashed || !("IntersectionObserver" in root)) return go();
    var io = new IntersectionObserver(function (seen) { if (seen.some(function (s) { return s.isIntersecting; })) { io.disconnect(); go(); } }, { rootMargin: "800px" });
    io.observe(el);
  }

  var api = { filesFor: filesFor, entities: entities, near: near, ways: ways, section: section, load: load, fill: fill, mount: mount };
  if (typeof module !== "undefined" && module && module.exports !== undefined) module.exports = api;
  else {
    root.RAContacts = api;
    var el = root.document && root.document.getElementById("contacts-near");
    if (el) mount(el);
  }
})(typeof window !== "undefined" ? window : this);
