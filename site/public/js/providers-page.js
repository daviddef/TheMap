/* THE SOURCES PAGE — builds the lists, and searches and filters them.
 *
 * The page is controls and explanations; the rows are made here from providers.json (every archive, library, index and portal) and, when
 * the Whose archive view is opened, regions.json (every record region and era). Neither is in the HTML: 1,801 sources were 7.5 MB of it,
 * the regions would have been far more. Lists are drawn 40 sources or 15 regions at a time, and drawn whole once a search leaves few.
 * The matcher is sources-search.js, shared with the header's Sources box. State is in the address (?q=&c=&a=&d=&t=&v=) so a view can be sent.
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
  var vKind = $("pv-view-kind"), vReg = $("pv-view-regions"), rNote = $("pv-rnote"), rLoad = $("pv-rload"), easy = $("pv-easy");
  var accBoxes = [].slice.call(document.querySelectorAll("input[data-acc]")), kindBoxes = [].slice.call(document.querySelectorAll("input[data-kind]"));
  var tabs = [].slice.call(document.querySelectorAll(".pv-tab"));
  var PAGE = 40, RPAGE = 15, ALL_UNDER = 150;

  var state = { view: "kind", q: "", acc: {}, kinds: {}, d: "", t: "" };
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
    state.q = p.get("q") || ""; state.d = p.get("d") || ""; state.t = p.get("t") || "";
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
    if (state.t) p.set("t", state.t);
    if (state.view === "regions") p.set("v", "regions");
    var s = p.toString();
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + (/^#(help|k-|r-)/.test(location.hash) ? location.hash : "")); } catch (e) { /* blocked: the view still works */ }
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
    return "<tr><td><a href=\"" + BASE + "archive/" + esc(p.id) + '/">' + esc(p.name) + "</a>" +
      (p.url ? '<a class="pv-site" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="Open ' + esc(p.name) + ' itself (its own website)">Site ↗</a>' : "") + "</td>" +
      '<td class="what">' + cell + know + "</td>" +
      '<td class="m"><span class="chip acc-' + esc(p.access) + '" title="' + esc(conf.accDefs[p.access] || "") + '">' + esc(conf.short[p.access] || p.access) + "</span></td>" +
      '<td class="m w">' + esc(where) + '</td><td class="m">' + esc(p.checked) + "</td></tr>";
  }

  function renderKinds() {
    var hits = S.search(index, state.q, accepts), total = hits.length;
    var groups = {};
    hits.forEach(function (p) { (groups[p.kind] = groups[p.kind] || []).push(p); });
    if (queueView()) Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return (TRIAGE[a.triage] == null ? 9 : TRIAGE[a.triage]) - (TRIAGE[b.triage] == null ? 9 : TRIAGE[b.triage]) || a.name.localeCompare(b.name); });
    });
    var html = "";
    conf.kinds.forEach(function (kl) {
      var k = kl[0], g = groups[k]; if (!g || !g.length) return;
      var shown = total <= ALL_UNDER ? g.length : Math.min(g.length, lim[k] || PAGE);
      html += '<section class="pv-sec" id="k-' + esc(k) + '"><h2 class="k-h">' + esc(kl[1]) + ' <span class="k-count">' + fmt(g.length) + "</span></h2>" +
        '<table class="k-table"><thead><tr><th class="c-name">Source</th><th class="c-what">What it is</th><th class="m c-acc">Cost to look</th><th class="m c-where">Where</th><th class="m c-date">Checked</th></tr></thead><tbody>' +
        g.slice(0, shown).map(rowHtml).join("") + "</tbody></table>" +
        (shown < g.length ? '<button type="button" class="pv-btn ghost pv-more" data-more="' + esc(k) + '">Show ' + Math.min(PAGE, g.length - shown) + " more of " + fmt(g.length - shown) + " left</button>" : "") + "</section>";
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
    REG.regions.forEach(function (r, i) {
      for (var j = 0; j < words.length; j++) if (regHay[i].indexOf(words[j]) < 0) return;
      hits.push(r);
    });
    var shown = hits.length <= 40 ? hits.length : Math.min(hits.length, rlim);
    regionsEl.innerHTML = hits.slice(0, shown).map(regionHtml).join("") +
      (shown < hits.length ? '<button type="button" class="pv-btn ghost pv-more" data-morer="1">Show ' + Math.min(RPAGE, hits.length - shown) + " more of " + fmt(hits.length - shown) + " regions left</button>" : "");
    rLoad.hidden = true;
    say.textContent = state.q ? "Showing " + fmt(hits.length) + " of " + fmt(REG.regions.length) + " regions" : fmt(REG.regions.length) + " regions";
    none.hidden = hits.length > 0;
  }
  function loadRegions() {
    if (REG || regLoading) return;
    regLoading = true; rLoad.hidden = false;
    fetch(BASE + "regions.json").then(function (r) { return r.json(); }).then(function (j) { REG = j; regLoading = false; apply(true); })
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
    easy.checked = !!state.t;
    var n = on(state.acc).length + on(state.kinds).length + (state.t ? 1 : 0);
    drop.classList.toggle("has-filter", n > 0); badge.hidden = !n; badge.textContent = n || "";
    newFilter.hidden = !state.d || regions;
    var active = regions ? !!state.q : !!(state.q || anyFilter());
    clear.hidden = !active;
    document.body.classList.toggle("pv-filtered", active);
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
  easy.addEventListener("change", function () { state.t = easy.checked ? "read" : ""; apply(); });
  tabs.forEach(function (b) { b.addEventListener("click", function () { state.view = b.getAttribute("data-view"); apply(); }); });
  function clearAll(focus) { state.q = ""; state.acc = {}; state.kinds = {}; state.d = ""; state.t = ""; q.value = ""; apply(); if (focus) q.focus(); }
  clear.addEventListener("click", function () { clearAll(true); });
  clear2.addEventListener("click", function () { state.acc = {}; state.kinds = {}; state.d = ""; state.t = ""; apply(); });
  /* the panel closes on a click anywhere else, or Escape, like the home screen's */
  document.addEventListener("click", function (e) { if (drop.open && !(e.target.closest && e.target.closest("#pv-filters"))) drop.open = false; });
  drop.addEventListener("keydown", function (e) { if (e.key === "Escape") { drop.open = false; $("pv-fsum").focus(); } });
  newFilter.addEventListener("click", function () { state.d = ""; apply(); });
  function toList(first) { var el = first || kindsEl; if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  $("pv-easy-link").addEventListener("click", function () { state.view = "kind"; state.acc = { unsurveyed: true }; state.kinds = {}; state.t = "read"; apply(); toList(); });
  $("pv-unchecked-link").addEventListener("click", function () { state.view = "kind"; state.acc = { unsurveyed: true }; state.kinds = {}; state.t = ""; apply(); toList(); });
  root.addEventListener("click", function (e) {
    var m = e.target.closest && e.target.closest("[data-more]");
    if (m) { var k = m.getAttribute("data-more"); lim[k] = (lim[k] || PAGE) + PAGE; renderKinds(); return; }
    if (e.target.closest && e.target.closest("[data-morer]")) { rlim += RPAGE; renderRegions(); }
  });
  window.addEventListener("hashchange", function () {
    if (location.hash === "#regions") { state.view = "regions"; apply(); }
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
