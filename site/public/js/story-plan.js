/* THE RESEARCH PLAN, ON THE STORY PAGE. The story reader has already matched the places to the Atlas's own records (archives, nearby
   volumes, the sources of the country). This turns those matches into a short, numbered list of candidates, sends them with what the
   story says (places, relationships, years: never a name, never a picture, never the full text) to the Worker's /v1/plan route, and draws
   the answer. Claude Haiku ranks and explains the candidates and may add ideas; the Worker checks every line it calls "atlas" against the
   candidate list and takes the link from the candidate, so a link or a record the model made up cannot reach the page.

   Pure helpers are exported for the tests (module.exports). The call itself goes through story-read.js (window.raStoryRead.call), which
   already carries the bot check and the optional six-word identity. Everything the server sends is put in with textContent. */
(function (root) {
  "use strict";
  var MAX_CAND = 60, MAX_STOPS = 12;

  function clip(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(x)); }

  /* The places the plan starts from: the person's own route; when the story only places the relatives (a father born here, a grandmother
     buried there), their places and the ancestors' places stand in, so a story about "my father's village" still gets a plan. */
  function stopsOf(g) {
    var f = (g && g.facts) || {}, own = (f.route || []).filter(function (x) { return x && x.info; });
    if (own.length) return own;
    var out = [], seen = Object.create(null);
    function add(s, role, label) { if (s && s.info && !seen[s.info.href || s.info.name]) { seen[s.info.href || s.info.name] = 1; out.push({ info: s.info, role: role || "family", year: s.year, age: s.age, label: label }); } }
    (f.kin || []).forEach(function (k) { (k.stops || []).forEach(function (s) { add(s, "family", k.label); }); });
    (f.ancestors || []).forEach(function (a) { add(a, "family", a.who); });
    return out;
  }

  /* The Atlas records matched to the story's places. `g` is the reader's gathered result (g.facts.route[].info), `countries` maps a code to
     today's country name, `base` is the site's base path. Archives within 150 km of a stop, the Atlas's own page for each place, the volumes
     it knows of around it, then the country-level sources. Each id is c1, c2, ... and is the only thing the model may tag "atlas". */
  function candidates(g, countries, base) {
    var out = [], seen = Object.create(null), n = 0;
    function add(kind, name, where, what, url) {
      if (!name || !url || out.length >= MAX_CAND) return;
      var k = kind + "|" + url; if (seen[k]) return; seen[k] = 1;
      out.push({ id: "c" + (++n), kind: kind, name: clip(name, 120), where: clip(where, 120), what: clip(what, 240), url: String(url) });
    }
    var route = stopsOf(g);
    var cc = countries || {};
    route.forEach(function (x) {
      var i = x.info, here = i.name + (cc[i.cc] ? ", " + cc[i.cc] : "");
      var held = (i.cols || []).length;
      add("place", i.name, here, "The Atlas's page for this place" + (held ? ", with " + held + " record collection" + (held === 1 ? "" : "s") + " listed" : "") + ".", i.href);
      (i.provs || []).filter(function (p) { return p && p.at && p.at.lat != null && i.lat != null; })
        .map(function (p) { return { p: p, km: hav(i.lat, i.lon, p.at.lat, p.at.lon) }; })
        .filter(function (y) { return y.km <= 150; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 3)
        .forEach(function (y) { add(/cemet|burial/i.test(y.p.kind || "") ? "cemetery" : "archive", y.p.name, here + " (" + Math.round(y.km) + " km)", y.p.what || y.p.kind || "", y.p.url); });
      (i.cols || []).slice(0, 3).forEach(function (c) { add("volume", c.t || c.name || c.title || "", here, c.what || c.kind || "A record collection the Atlas lists for this place.", c.url || c.href || i.href); });
      (i.near || []).slice(0, 2).forEach(function (v) { add("place", v.n, (v.km || 0) + " km from " + i.name, "Holds " + v.c + " volume" + (v.c === 1 ? "" : "s") + " in the Atlas.", base + "place/" + encodeURIComponent(v.i) + "/"); });
    });
    var seenCc = Object.create(null);
    route.forEach(function (x) {
      var i = x.info; if (!i.cc || seenCc[i.cc]) return; seenCc[i.cc] = 1;
      (i.provs || []).filter(function (p) { return p && (!p.at || p.at.lat == null); }).slice(0, 4)
        .forEach(function (p) { add("source", p.name, cc[i.cc] || i.cc, p.what || p.kind || "", p.url); });
    });
    return out;
  }

  /* What the story says, with no name in it: a relation word, a birth year, the route as told, the family's places and the facts as short phrases. */
  function facts(g, countries) {
    var f = (g && g.facts) || {}, cc = countries || {};
    var route = stopsOf(g).slice(0, MAX_STOPS).map(function (x) {
      return { place: clip(x.info.name, 80), country: clip(cc[x.info.cc] || "", 60), cc: String(x.info.cc || "").slice(0, 3), role: x.role || "move",
        age: typeof x.age === "number" ? x.age : null, year: typeof x.year === "number" ? x.year : null };
    });
    var kin = []; (f.kin || []).forEach(function (k) { (k.stops || []).forEach(function (s) { if (s.info && kin.length < 12) kin.push({ label: clip(k.label || "family", 40), place: clip(s.info.name, 80), country: clip(cc[s.info.cc] || "", 60) }); }); });
    (f.ancestors || []).forEach(function (a) { if (a.info && kin.length < 12) kin.push({ label: clip("his " + a.who, 40), place: clip(a.info.name, 80), country: clip(cc[a.info.cc] || "", 60) }); });
    var life = []; ((g && g.life && g.life.groups) || []).forEach(function (gr) { (gr.items || []).forEach(function (it) { if (life.length < 12) life.push(clip(it, 160)); }); });
    var out = { route: route };
    if (f.rel) out.rel = clip(f.rel, 40);
    if (typeof f.born === "number") out.born = f.born;
    if (kin.length) out.kin = kin;
    if (life.length) out.life = life;
    return out;
  }

  function payload(g, countries, base) { return { facts: facts(g, countries), candidates: candidates(g, countries, base) }; }

  /* Draw the answer. `answer` is the Worker's result object: {headline, summary, groups:[{key, title, items:[{title, detail, source, ref, url, name, where}]}], cautions}. */
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function render(answer, mount) {
    mount.textContent = "";
    if (!answer || answer.unparsed) { mount.append(el("p", "Claude's answer could not be laid out. " + (answer && answer.draft ? "Here is what it wrote:" : ""), "sp-fine")); if (answer && answer.draft) mount.append(el("pre", String(answer.draft).slice(0, 4000), "sp-fine")); return; }
    var lg = el("div", null, "sp-ai-legend"), a = el("span"), s = el("span");
    a.append(el("span", "Atlas", "sp-src atlas"), " a record the Atlas holds"); s.append(el("span", "Suggested", "sp-src suggested"), " an idea to check, not a finding"); lg.append(a, s); mount.append(lg);
    if (answer.headline) mount.append(el("p", answer.headline, "sp-ai-lead"));
    if (answer.summary) mount.append(el("p", answer.summary, "sp-sublede"));
    var cols = el("div", null, "sp-ai-cols");
    (answer.groups || []).forEach(function (gr) {
      if (!gr || !gr.items || !gr.items.length) return;
      var card = el("div", null, "sp-ai-card"); card.append(el("h3", gr.title || gr.key));
      gr.items.forEach(function (it) {
        var d = el("div", null, "sp-ai-item"), line = el("span"), at = it.source === "atlas";
        line.append(el("span", at ? "Atlas" : "Suggested", "sp-src " + (at ? "atlas" : "suggested")));
        var t = it.title || it.name || "";
        var b = el("b");
        if (at && it.url && /^(https?:\/\/|\/)/.test(it.url)) { var l = el("a", t); l.href = it.url; if (/^https?:/.test(it.url)) { l.target = "_blank"; l.rel = "noopener"; } b.append(l); }
        else b.textContent = t;
        line.append(b);
        d.append(line);
        if (it.where && at) d.append(el("span", it.where));
        if (it.detail) d.append(el("span", it.detail));
        card.append(d);
      });
      cols.append(card);
    });
    mount.append(cols);
    (answer.cautions || []).forEach(function (c) { mount.append(el("p", c, "sp-ai-foot")); });
    mount.append(el("p", "A draft to check against the pages, made by Claude Haiku. “Atlas” lines come from the Atlas’s catalogues; “Suggested” lines are ideas and can be wrong.", "sp-ai-foot"));
  }

  /* The plan as plain text, to keep beside the story in My research. */
  function asText(answer) {
    if (!answer || answer.unparsed) return "";
    var L = [];
    if (answer.headline) L.push(answer.headline);
    if (answer.summary) L.push(answer.summary);
    (answer.groups || []).forEach(function (gr) {
      if (!gr || !gr.items || !gr.items.length) return;
      L.push("", String(gr.title || gr.key).toUpperCase());
      gr.items.forEach(function (it) { L.push("- [" + (it.source === "atlas" ? "Atlas" : "Suggested") + "] " + (it.title || it.name || "") + (it.detail ? ": " + it.detail : "") + (it.source === "atlas" && it.url ? " (" + it.url + ")" : "")); });
    });
    (answer.cautions || []).forEach(function (c) { L.push("", "Caution: " + c); });
    return L.join("\n").slice(0, 5800);
  }

  var api = { stopsOf: stopsOf, candidates: candidates, facts: facts, payload: payload, render: render, asText: asText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryPlan = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
