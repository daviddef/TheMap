/* THE SOURCES PAGE — builds the lists, and searches and filters them.
 *
 * The page is controls and explanations; the rows are made here from providers.json (every archive, library, index and portal) and, when
 * the Whose archive view is opened, regions.json (every record region and era). Neither is in the HTML: 1,801 sources were 7.5 MB of it,
 * the regions would have been far more. Lists are drawn 40 sources or 15 regions at a time, and drawn whole once a search leaves few.
 * The matcher is sources-search.js, shared with the header's Sources box. State is in the address (?q=&c=&a=&d=&t=&v=) so a view can be sent.
 * A PLACE typed as the search (Durban, Senj, Fiume) is looked up in the gazetteer shards the map already uses; the list then answers
 * "who covers this ground": the archives near it, the sources for its country, the worldwide ones, and the record region it lies in.
 * Every source still has its own page, so nothing here is the only way to reach one. */
(function () {
  "use strict";
  var root = document.getElementById("pv-root");
  if (!root) return;
  var S = window.SourcesSearch;
  var conf = JSON.parse(document.getElementById("pv-conf").textContent);
  var BASE = (conf.base || "/").replace(/\/?$/, "/");
  var $ = function (id) { return document.getElementById(id); };
  var q = $("pv-q"), say = $("pv-say"), none = $("pv-none"), drop = $("pv-filters"), badge = $("pv-badge");
  var clear = $("pv-clear"), clear2 = $("pv-clear2"), newFilter = $("pv-newfilter"), kindsEl = $("pv-kinds"), regionsEl = $("pv-regions");
  var vKind = $("pv-view-kind"), vReg = $("pv-view-regions"), rNote = $("pv-rnote"), rLoad = $("pv-rload"), placeEl = $("pv-place"), helpDlg = $("pv-helpdlg");
  var accBoxes = [].slice.call(document.querySelectorAll("input[data-acc]")), kindBoxes = [].slice.call(document.querySelectorAll("input[data-kind]"));
  var tabs = [].slice.call(document.querySelectorAll(".pv-tab"));
  var PAGE = 40, RPAGE = 15, ALL_UNDER = 150;

  var state = { view: "kind", q: "", acc: {}, kinds: {}, d: "", t: "", pc: "" };
  var lim = {}, rlim = RPAGE;
  var PV = null, index = null, byId = {}, REG = null, regLoading = false, regHay = null;

  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fmt(n) { return n.toLocaleString("en"); }
  function added(p) { return p.added || p.checked; }
  function on(o) { return Object.keys(o).filter(function (k) { return o[k]; }); }
  function anyAcc() { return on(state.acc).length > 0; }
  function anyFilter() { return !!(anyAcc() || on(state.kinds).length || state.t || state.d); }

  /* ---- the address ---- */
  function fromUrl() {
    var p = new URLSearchParams(location.search);
    state.q = p.get("q") || ""; state.d = p.get("d") || ""; state.t = p.get("t") || ""; state.pc = p.get("pc") || "";
    (p.get("a") || "").split(",").forEach(function (a) { if (a) state.acc[a] = true; });
    (p.get("k") || "").split(",").forEach(function (k) { if (k) state.kinds[k] = true; });
    if (p.get("v") === "regions" || location.hash === "#regions" || /^#r-/.test(location.hash)) state.view = "regions";
  }
  function toUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    var a = on(state.acc), k = on(state.kinds);
    if (a.length) p.set("a", a.join(","));
    if (k.length) p.set("k", k.join(","));
    if (state.d) p.set("d", state.d);
    if (state.pc && PL.cands.length > 1) p.set("pc", state.pc);
    if (state.t) p.set("t", state.t);
    if (state.view === "regions") p.set("v", "regions");
    var s = p.toString();
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + (/^#(k-|r-)/.test(location.hash) ? location.hash : "")); } catch (e) { /* blocked: the view still works */ }
  }

  /* ---- the sources view ---- */
  function accepts(p) {
    if (anyAcc() && !state.acc[p.access]) return false;
    if (on(state.kinds).length && !state.kinds[p.kind]) return false;
    if (state.d && added(p) !== state.d) return false;
    if (state.t && !(p.access === "unsurveyed" && p.triage === state.t)) return false;
    return true;
  }
  var TRIAGE = { read: 0, "needs-browser": 1, http: 2, unreachable: 3, declined: 4 };
  function queueView() { var k = on(state.acc); return !state.q && ((k.length === 1 && k[0] === "unsurveyed") || !!state.t); }

  function rowHtml(p) {
    var what = String(p.what || "");
    var cell = what.length > 220
      ? '<details class="k-more"><summary><span class="k-clip">' + esc(what) + '</span> <span class="k-mt">more</span></summary><div>' + esc(what) + "</div></details>"
      : esc(what);
    var know = "";
    if (p.access === "unsurveyed" && p.url) {
      know = '<p class="pv-know"><span>' + esc(p.triageNote || "Not yet opened by anybody.") + '</span><a href="' + esc(p.url) + '" target="_blank" rel="noopener">Open the site ↗</a>, then <a href="' + BASE + 'add/">tell us what it costs to look</a>.</p>';
    }
    var where = p.countries.indexOf("*") >= 0 ? "worldwide" : p.countries.join(" ");
    if (p._km != null) where += " · " + (p._km < 1 ? "<1" : Math.round(p._km)) + " km";
    return "<tr><td><a href=\"" + BASE + "archive/" + esc(p.id) + '/">' + esc(p.name) + "</a>" +
      (p.url ? '<a class="pv-site" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="Open ' + esc(p.name) + ' itself (its own website)">Site ↗</a>' : "") + "</td>" +
      '<td class="what">' + cell + know + "</td>" +
      '<td class="m"><span class="chip acc-' + esc(p.access) + '" title="' + esc(conf.accDefs[p.access] || "") + '">' + esc(conf.short[p.access] || p.access) + "</span></td>" +
      '<td class="m w">' + esc(where) + '</td><td class="m">' + esc(p.checked) + "</td></tr>";
  }

  function sectionHtml(id, title, g, total, note) {
    var shown = total <= ALL_UNDER ? g.length : Math.min(g.length, lim[id] || PAGE);
    return '<section class="pv-sec" id="k-' + esc(id) + '"><h2 class="k-h">' + esc(title) + ' <span class="k-count">' + fmt(g.length) + "</span></h2>" + (note ? '<p class="cap">' + note + "</p>" : "") +
      '<table class="k-table"><thead><tr><th class="c-name">Source</th><th class="c-what">What it is</th><th class="m c-acc">Cost to look</th><th class="m c-where">Where</th><th class="m c-date">Checked</th></tr></thead><tbody>' +
      g.slice(0, shown).map(rowHtml).join("") + "</tbody></table>" +
      (shown < g.length ? '<button type="button" class="pv-btn ghost pv-more" data-more="' + esc(id) + '">Show ' + Math.min(PAGE, g.length - shown) + " more of " + fmt(g.length - shown) + " left</button>" : "") + "</section>";
  }

  /* ---- a place typed as the search ---- */
  var PL = { key: "", cands: [], pick: 0, regions: [] };
  var SHARDS = null, KINDWORDS = null;
  function kindWords() {
    if (!KINDWORDS) {
      KINDWORDS = {};
      Object.keys(S.KINDS).forEach(function (k) { (k + " " + S.KINDS[k]).split(/[\s-]+/).forEach(function (w) { KINDWORDS[w] = 1; }); });
      "archive archives record records census library libraries parish register registers index indexes newspaper newspapers portal portals".split(" ").forEach(function (w) { KINDWORDS[w] = 1; });
    }
    return KINDWORDS;
  }
  /* The words of the search that could be a place, or null: a country on its own, or a word about kinds of source, is not one. */
  function placeWanted() {
    if (!index || state.q.trim().length < 3) return null;
    var p = S.parse(state.q, index);
    if (!p.words.length) return null;
    var kw = kindWords();
    for (var i = 0; i < p.words.length; i++) if (kw[p.words[i]]) return null;
    return { f: p.words.join(" "), codes: p.codes };
  }
  function placeKey() { var w = placeWanted(); return w ? w.f + "|" + w.codes.join(",") : ""; }
  function km(a, b, c, d) {
    var R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
    var h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function inRing(ring, lat, lon) {
    var ins = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((xi > lon) !== (xj > lon) && lat < (yj - yi) * (lon - xi) / (xj - xi) + yi) ins = !ins;
    }
    return ins;
  }
  function lookupPlace(w) {
    var f = window.raFold ? window.raFold(w.f) : w.f;
    var shards = SHARDS ? Promise.resolve(SHARDS) : fetch(BASE + "shards.json").then(function (r) { return r.json(); }).catch(function () { return {}; });
    return shards.then(function (sh) {
      SHARDS = sh;
      var key = window.raShardKey ? window.raShardKey(f, sh.g || {}) : "";
      if (!key) return [];
      return fetch(BASE + "g/" + encodeURIComponent(key) + ".json").then(function (r) { return r.json(); });
    }).then(function (rows) {
      var out = [];
      (rows || []).forEach(function (r) {
        if (w.codes.length && w.codes.indexOf(String(r[3]).toLowerCase()) < 0) return;
        var hit = S.norm(r[0]) === w.f || (r[4] || []).some(function (a) { return S.norm(a) === w.f; });
        if (!hit) return;
        for (var i = 0; i < out.length; i++) if (out[i].cc === r[3] && km(out[i].lat, out[i].lon, r[1], r[2]) < 60) return;
        out.push({ name: r[0], lat: r[1], lon: r[2], cc: r[3], alts: (r[4] || []).filter(function (a) { return S.norm(a) !== S.norm(r[0]); }) });
      });
      return out;
    }).catch(function () { return []; });
  }
  function ccCount(cc) { var n = 0; (PV || []).forEach(function (p) { if (p.countries.indexOf(cc) >= 0) n++; }); return n; }
  function schedulePlace() {
    var key = placeKey();
    if (key === PL.key) return;
    PL = { key: key, cands: [], pick: 0, regions: [] };
    if (!key) return;
    var w = placeWanted();
    lookupPlace(w).then(function (c) {
      if (PL.key !== key || !c.length) return;
      /* the place with the most other names is nearly always the one meant (Durban in South Africa over Durban in the Aude) */
      c.sort(function (a, b) { return b.alts.length - a.alts.length || ccCount(b.cc) - ccCount(a.cc); });
      PL.cands = c.slice(0, 6);
      PL.pick = 0;
      if (state.pc) for (var i = 0; i < PL.cands.length; i++) if (PL.cands[i].cc === state.pc) PL.pick = i;
      if (state.view !== "regions") loadRegions(true);
      placeRegions();
      apply(true);
    });
  }
  function curPlace() { return PL.cands.length ? PL.cands[PL.pick] : null; }
  function placeRegions() {
    var c = curPlace(); PL.regions = [];
    if (!c || !REG) return;
    REG.regions.forEach(function (r) { if (r.ring && inRing(r.ring, c.lat, c.lon)) PL.regions.push(r); });
  }
  function placeStrip(c, g) {
    var cn = S.countryName(c.cc);
    var h = "<b>" + esc(c.name) + ", " + esc(cn) + "</b>" + (c.alts.length ? ' <span class="cap">also written ' + esc(c.alts.slice(0, 4).join(", ")) + "</span>" : "") + "<br>" +
      "Sources that cover this ground: " + g.near.length + " near it, " + g.country.length + " for " + esc(cn) + ", " + g.world.length + " worldwide.";
    if (!g.near.length && !g.country.length) h += " <b>None is filed for " + esc(cn) + " yet</b>, so the worldwide ones are all that can be offered.";
    if (PL.regions.length) h += "<br>Record region: " + PL.regions.map(function (r) { return '<a class="pv-reg" href="#r-' + esc(r.id) + '">' + esc(r.label) + "</a>"; }).join(", ") + " (whose archive, by years).";
    if (PL.cands.length > 1) h += "<br>Other places by that name: " + PL.cands.map(function (x, i) { return '<button type="button" class="pv-pc" data-pick="' + i + '" aria-pressed="' + (i === PL.pick ? "true" : "false") + '">' + esc(x.name + ", " + S.countryName(x.cc)) + "</button>"; }).join("");
    placeEl.innerHTML = h; placeEl.hidden = false;
  }

  function renderKinds() {
    var c = curPlace();
    var hits = S.search(index, state.q, accepts), total = hits.length, html = "";
    if (c) {
      var all = S.search(index, "", accepts), g = { near: [], country: [], world: [], mention: [] }, seen = {};
      PV.forEach(function (p) { p._km = null; });
      all.forEach(function (p) {
        if (p.at && km(c.lat, c.lon, p.at.lat, p.at.lon) <= 100) { p._km = km(c.lat, c.lon, p.at.lat, p.at.lon); g.near.push(p); seen[p.id] = 1; }
        else if (p.countries.indexOf(c.cc) >= 0) { g.country.push(p); seen[p.id] = 1; }
        else if (p.countries.indexOf("*") >= 0) { g.world.push(p); seen[p.id] = 1; }
      });
      hits.forEach(function (p) { if (!seen[p.id]) g.mention.push(p); });
      g.near.sort(function (a, b) { return a._km - b._km; });
      var order = {}; conf.kinds.forEach(function (kl, i) { order[kl[0]] = i; });
      g.country.sort(function (a, b) { return (order[a.kind] || 0) - (order[b.kind] || 0) || a.name.localeCompare(b.name); });
      total = g.near.length + g.country.length + g.world.length + g.mention.length;
      var cn = S.countryName(c.cc);
      placeStrip(c, g);
      if (g.near.length) html += sectionHtml("near", "Near " + c.name, g.near, total, "Archives and libraries whose own location is within 100 km.");
      if (g.country.length) html += sectionHtml("country", "In " + cn, g.country, total, "Sources for the whole country or another part of it: they may hold " + esc(c.name) + "'s records, or tell you where those went.");
      if (g.world.length) html += sectionHtml("world", "Worldwide", g.world, total, "Sources that cover every country.");
      if (g.mention.length) html += sectionHtml("mention", "Also name it", g.mention, total, "Sources whose own words mention what you typed.");
      kindsEl.innerHTML = html;
      say.textContent = "Showing " + fmt(total) + " sources for " + c.name + ", " + cn;
      none.hidden = total > 0;
      return;
    }
    placeEl.hidden = true; placeEl.innerHTML = "";
    var groups = {};
    hits.forEach(function (p) { p._km = null; (groups[p.kind] = groups[p.kind] || []).push(p); });
    if (queueView()) Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return (TRIAGE[a.triage] == null ? 9 : TRIAGE[a.triage]) - (TRIAGE[b.triage] == null ? 9 : TRIAGE[b.triage]) || a.name.localeCompare(b.name); });
    });
    conf.kinds.forEach(function (kl) {
      var k = kl[0], g2 = groups[k]; if (!g2 || !g2.length) return;
      html += sectionHtml(k, kl[1], g2, total);
    });
    kindsEl.innerHTML = html;
    var active = !!(state.q || anyFilter());
    say.textContent = active ? "Showing " + fmt(total) + " of " + fmt(PV.length) + " sources" : fmt(PV.length) + " sources";
    none.hidden = total > 0;
  }

  /* ---- the Whose archive view ---- */
  function mid(r) {
    var a = r.ring.map(function (p) { return p[0]; }), b = r.ring.map(function (p) { return p[1]; });
    var f = function (x) { return Math.round(((Math.min.apply(null, x) + Math.max.apply(null, x)) / 2) * 1000) / 1000; };
    return [f(a), f(b)];
  }
  function buildHay() {
    regHay = REG.regions.map(function (r) {
      var parts = [r.label, r.sub, (r.countries || []).map(function (c) { return S.countryName(c); }).join(" "), (r.countries || []).join(" ")];
      (r.eras || []).forEach(function (e) {
        parts.push(e.polity || (REG.regimes[e.regime] || {}).label || "");
        (e.filedUnder || []).forEach(function (f) { parts.push((byId[f] || {}).name || f); });
      });
      return S.norm(parts.join(" "));
    });
  }
  function regionHtml(r) {
    var flags = (r.countries || []).filter(function (cc) { return conf.flags[cc]; });
    var m = mid(r);
    var rows = r.eras.map(function (e) {
      var rg = REG.regimes[e.regime] || {};
      var filed = (e.filedUnder || []).length
        ? "<span>" + e.filedUnder.map(function (f) { return '<a href="' + BASE + "archive/" + esc(f) + '/">' + esc((byId[f] || {}).name || f) + "</a>"; }).join(" · ") + "</span>"
        : '<span class="none">no registers survive</span>';
      return '<tr><td class="m"><a href="' + BASE + "?layers=shelf,jurisdiction&amp;years=" + e.from + "," + e.to + "&amp;view=" + m[0] + "," + m[1] + ',8" title="See ' + esc(r.label) + " between " + e.from + " and " + e.to + '">' + e.from + "–" + e.to + "</a></td>" +
        '<td><span class="reg" style="--c:var(' + esc(rg.var || "--ink-3") + ')"><i></i>' + esc(e.polity || rg.label || "") + "</span></td>" +
        "<td>" + filed + (e.note ? '<p class="enote' + (/^THE /.test(e.note) ? " trap" : "") + '">' + esc(e.note) + "</p>" : "") + "</td></tr>";
    }).join("");
    return '<section class="pv-reg" id="r-' + esc(r.id) + '"><h2 class="k-h"><a href="' + BASE + "region/" + esc(r.id) + '/">' + esc(r.label) + '</a> <span class="k-count">' + r.eras.length + " eras</span></h2>" +
      (flags.length ? '<p class="cap" style="margin:2px 0 8px">Flags flown over this ground: ' + flags.map(function (cc) { return '<a href="' + BASE + "flags/" + conf.flags[cc] + '-flags/">' + esc(cc) + "</a>"; }).join(" · ") + "</p>" : "") +
      '<p class="cap" style="margin-top:2px">' + esc(r.sub) + "</p>" +
      '<table class="k-table" style="margin-top:12px"><thead><tr><th class="m c-yrs">Years</th><th class="c-who">Who held it</th><th class="c-arch">Whose archive that means</th></tr></thead><tbody>' + rows + "</tbody></table></section>";
  }
  function renderRegions() {
    if (!REG || !PV) return;
    if (!regHay) buildHay();
    var words = S.norm(state.q).split(" ").filter(Boolean);
    var hits = [];
    var here = {}; PL.regions.forEach(function (r) { here[r.id] = 1; });
    REG.regions.forEach(function (r, i) {
      if (!here[r.id]) for (var j = 0; j < words.length; j++) if (regHay[i].indexOf(words[j]) < 0) return;
      hits.push(r);
    });
    hits.sort(function (a, b) { return (here[b.id] ? 1 : 0) - (here[a.id] ? 1 : 0); });
    var shown = hits.length <= 40 ? hits.length : Math.min(hits.length, rlim);
    regionsEl.innerHTML = hits.slice(0, shown).map(regionHtml).join("") +
      (shown < hits.length ? '<button type="button" class="pv-btn ghost pv-more" data-morer="1">Show ' + Math.min(RPAGE, hits.length - shown) + " more of " + fmt(hits.length - shown) + " regions left</button>" : "");
    rLoad.hidden = true;
    say.textContent = state.q ? "Showing " + fmt(hits.length) + " of " + fmt(REG.regions.length) + " regions" : fmt(REG.regions.length) + " regions";
    none.hidden = hits.length > 0;
  }
  function loadRegions(quiet) {
    if (REG || regLoading) return;
    regLoading = true; rLoad.hidden = !!quiet;
    fetch(BASE + "regions.json").then(function (r) { return r.json(); }).then(function (j) { REG = j; regLoading = false; placeRegions(); apply(true); })
      .catch(function () { regLoading = false; rLoad.textContent = "The regions could not load just now. Try again in a moment."; });
  }

  /* ---- shared ---- */
  function apply(keepLimits) {
    if (keepLimits !== true) { lim = {}; rlim = RPAGE; }
    var regions = state.view === "regions";
    vKind.hidden = regions; vReg.hidden = !regions;
    drop.hidden = regions; rNote.hidden = !(regions && anyFilter());
    tabs.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === state.view ? "true" : "false"); });
    accBoxes.forEach(function (b) { b.checked = !!state.acc[b.getAttribute("data-acc")]; });
    kindBoxes.forEach(function (b) { b.checked = !!state.kinds[b.getAttribute("data-kind")]; });
    var n = on(state.acc).length + on(state.kinds).length + (state.t ? 1 : 0);
    drop.classList.toggle("has-filter", n > 0); badge.hidden = !n; badge.textContent = n || "";
    newFilter.hidden = !state.d || regions;
    var active = regions ? !!state.q : !!(state.q || anyFilter());
    clear.hidden = !active;
    document.body.classList.toggle("pv-filtered", active);
    if (PV && index) schedulePlace();
    if (regions) { if (REG && PV) renderRegions(); else { loadRegions(); } }
    else if (PV) renderKinds();
    toUrl();
  }

  var base0 = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  fromUrl();
  q.value = state.q;
  var t = null;
  q.addEventListener("input", function () { state.q = q.value; clearTimeout(t); t = setTimeout(apply, 90); });
  $("pv-find").addEventListener("submit", function (e) { e.preventDefault(); state.q = q.value; apply(); });
  accBoxes.forEach(function (b) { b.addEventListener("change", function () { state.acc[b.getAttribute("data-acc")] = b.checked; apply(); }); });
  kindBoxes.forEach(function (b) { b.addEventListener("change", function () { state.kinds[b.getAttribute("data-kind")] = b.checked; apply(); }); });
  tabs.forEach(function (b) { b.addEventListener("click", function () { state.view = b.getAttribute("data-view"); apply(); }); });
  function clearAll(focus) { state.q = ""; state.acc = {}; state.kinds = {}; state.d = ""; state.t = ""; q.value = ""; apply(); if (focus) q.focus(); }
  clear.addEventListener("click", function () { clearAll(true); });
  clear2.addEventListener("click", function () { state.acc = {}; state.kinds = {}; state.d = ""; state.t = ""; apply(); });
  /* the panel closes on a click anywhere else, or Escape, like the home screen's */
  document.addEventListener("click", function (e) { if (drop.open && !(e.target.closest && e.target.closest("#pv-filters"))) drop.open = false; });
  drop.addEventListener("keydown", function (e) { if (e.key === "Escape") { drop.open = false; $("pv-fsum").focus(); } });
  newFilter.addEventListener("click", function () { state.d = ""; apply(); });
  function toList(first) { var el = first || kindsEl; if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  /* HELP CHECK A SOURCE is an invitation, not the page's job: it lives in a dialog, opened from the line under the search */
  function openHelp() { if (helpDlg.showModal) { if (!helpDlg.open) helpDlg.showModal(); } else helpDlg.setAttribute("open", ""); }
  function closeHelp() { if (helpDlg.close) helpDlg.close(); else helpDlg.removeAttribute("open"); }
  $("pv-help-open").addEventListener("click", openHelp);
  helpDlg.addEventListener("click", function (e) { if (e.target === helpDlg) closeHelp(); });
  $("pv-easy-link").addEventListener("click", function () { closeHelp(); state.view = "kind"; state.q = ""; q.value = ""; state.acc = { unsurveyed: true }; state.kinds = {}; state.t = "read"; apply(); toList(); });
  $("pv-unchecked-link").addEventListener("click", function () { closeHelp(); state.view = "kind"; state.q = ""; q.value = ""; state.acc = { unsurveyed: true }; state.kinds = {}; state.t = ""; apply(); toList(); });
  if (location.hash === "#help") openHelp();
  root.addEventListener("click", function (e) {
    var pk = e.target.closest && e.target.closest("[data-pick]");
    if (pk) { PL.pick = +pk.getAttribute("data-pick"); state.pc = PL.cands[PL.pick].cc; placeRegions(); apply(true); return; }
    var m = e.target.closest && e.target.closest("[data-more]");
    if (m) { var k = m.getAttribute("data-more"); lim[k] = (lim[k] || PAGE) + PAGE; renderKinds(); return; }
    if (e.target.closest && e.target.closest("[data-morer]")) { rlim += RPAGE; renderRegions(); }
  });
  window.addEventListener("hashchange", function () {
    if (location.hash === "#help") openHelp();
    else if (location.hash === "#regions") { state.view = "regions"; apply(); }
    else if (/^#r-/.test(location.hash)) { state.view = "regions"; reveal(); }
    else if (/^#k-/.test(location.hash)) { reveal(); }
  });

  /* a link to #r-<region> or #k-<kind> lands on it even when it is beyond the first page */
  function reveal() {
    var id = location.hash.slice(1); if (!id) return;
    if (/^r-/.test(id) && REG && PV) {
      var i = REG.regions.map(function (r) { return "r-" + r.id; }).indexOf(id);
      if (i >= 0 && i >= rlim) { rlim = i + 1; }
      state.view = "regions"; apply(true);
    }
    var el = document.getElementById(id); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
  }

  /* the directory: the lists wait for it; the controls work at once */
  apply();
  fetch(BASE + "providers.json").then(function (r) { return r.json(); }).then(function (j) {
    PV = j.providers; PV.forEach(function (p) { byId[p.id] = p; });
    index = S.build(PV); apply(true); reveal();
    if (state.q) q.focus();
  }).catch(function () { kindsEl.innerHTML = '<p class="pv-none">The directory could not load just now. Every source has its own page; the list of them is on the <a href="' + BASE + 'sitemap-index.xml">sitemap</a>.</p>'; });
  void base0;
})();
