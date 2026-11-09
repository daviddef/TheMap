/* THE SOURCES PAGE — search, country and access filters over the table that is already on the page.
 *
 * The tables are written by the build (so the page reads without script, and every source is in the HTML); this
 * only hides what does not match and puts the best matches first. The matcher is sources-search.js, shared with the
 * header's Sources pop-up. State lives in the address (?q=&c=&a=&d=) so a filtered view can be sent to somebody. */
(function () {
  "use strict";
  var form = document.getElementById("pv-find");
  if (!form) return;
  var S = window.SourcesSearch;
  var q = document.getElementById("pv-q"), cSel = document.getElementById("pv-c"), world = document.getElementById("pv-world");
  var worldRow = document.getElementById("pv-world-row"), say = document.getElementById("pv-say"), none = document.getElementById("pv-none");
  var clear = document.getElementById("pv-clear"), newFilter = document.getElementById("pv-newfilter");
  var accBtns = [].slice.call(document.querySelectorAll("[data-acc]"));
  var rows = [].slice.call(document.querySelectorAll("tr[data-id]"));
  var sections = [].slice.call(document.querySelectorAll("section[data-kind]"));
  var jump = {};
  [].forEach.call(document.querySelectorAll("a[data-jump]"), function (a) { jump[a.getAttribute("data-jump")] = a; });
  var byId = {}, orig = 0;
  rows.forEach(function (r) { r._o = orig++; byId[r.getAttribute("data-id")] = r; });

  var state = { q: "", c: "", world: true, acc: {}, d: "", t: "" };
  var index = null, providers = null;

  function fromUrl() {
    var p = new URLSearchParams(location.search);
    state.t = p.get("t") || ""; state.q = p.get("q") || ""; state.c = (p.get("c") || "").toLowerCase(); state.d = p.get("d") || "";
    state.world = p.get("w") !== "0";
    (p.get("a") || "").split(",").forEach(function (a) { if (a) state.acc[a] = true; });
  }
  function toUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.c) p.set("c", state.c);
    if (state.c && !state.world) p.set("w", "0");
    var a = Object.keys(state.acc).filter(function (k) { return state.acc[k]; });
    if (a.length) p.set("a", a.join(","));
    if (state.d) p.set("d", state.d);
    if (state.t) p.set("t", state.t);
    var s = p.toString();
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash); } catch (e) { /* blocked: the view still works */ }
  }
  function fmt(n) { return n.toLocaleString("en"); }

  function accepts(p) {
    var rowCodes = p.countries.map(function (x) { return x.toLowerCase(); });
    if (state.c === "*") { if (rowCodes.indexOf("*") < 0) return false; }
    else if (state.c && rowCodes.indexOf(state.c) < 0 && !(state.world && rowCodes.indexOf("*") >= 0)) return false;
    var any = Object.keys(state.acc).some(function (k) { return state.acc[k]; });
    if (any && !state.acc[p.access]) return false;
    if (state.d && (p._added || p.checked) !== state.d) return false;
    if (state.t && p.triage !== state.t) return false;
    return true;
  }

  function queueView() { var k = Object.keys(state.acc).filter(function (x) { return state.acc[x]; }); return k.length === 1 && k[0] === "unsurveyed"; }

  function apply() {
    var active = !!(state.q || state.c || state.d || state.t || Object.keys(state.acc).some(function (k) { return state.acc[k]; }));
    var rank = null, shown = {};
    if (providers) {
      var hits = S.search(index, state.q, accepts);
      rank = {}; hits.forEach(function (p, i) { rank[p.id] = i; });
    }
    var n = 0, perKind = {};
    rows.forEach(function (r) {
      var id = r.getAttribute("data-id"), ok;
      if (rank) ok = rank[id] !== undefined;
      else {
        /* before the directory has arrived (or if it never does): plain text, and the filters the rows themselves carry */
        var cs = (" " + r.getAttribute("data-c") + " "), a = r.getAttribute("data-a");
        ok = !state.q || r.textContent.toLowerCase().indexOf(state.q.toLowerCase()) >= 0;
        if (ok && state.c) ok = cs.indexOf(" " + state.c + " ") >= 0 || (state.c !== "*" && state.world && cs.indexOf(" * ") >= 0);
        if (ok && Object.keys(state.acc).some(function (k) { return state.acc[k]; })) ok = !!state.acc[a];
        if (ok && state.d) ok = r.getAttribute("data-d") === state.d;
      }
      r.hidden = !ok;
      /* the queue reads easiest first (homepage already read), then by name */
      r._r = rank && state.q ? rank[id] : (queueView() ? Number(r.getAttribute("data-r")) * 100000 + r._o : r._o);
      if (ok) { n++; var k = r.getAttribute("data-k"); perKind[k] = (perKind[k] || 0) + 1; }
    });
    sections.forEach(function (sec) {
      var k = sec.getAttribute("data-kind"), body = sec.querySelector("tbody");
      var kids = [].slice.call(body.children).sort(function (a, b) { return (a._r === undefined ? a._o : a._r) - (b._r === undefined ? b._o : b._r); });
      kids.forEach(function (tr) { body.appendChild(tr); });
      sec.hidden = !perKind[k];
      var cnt = sec.querySelector(".k-count"); if (cnt) cnt.textContent = fmt(perKind[k] || 0);
      if (jump[k]) { jump[k].hidden = !perKind[k]; var sp = jump[k].querySelector("span"); if (sp) sp.textContent = fmt(perKind[k] || 0); }
    });
    var total = rows.length;
    say.textContent = active ? "Showing " + fmt(n) + " of " + fmt(total) + " sources" : fmt(total) + " sources";
    none.hidden = n > 0;
    clear.hidden = !active;
    accBtns.forEach(function (b) { b.setAttribute("aria-pressed", state.acc[b.getAttribute("data-acc")] ? "true" : "false"); });
    worldRow.hidden = !(state.c && state.c !== "*");
    world.checked = state.world;
    if (newFilter) newFilter.hidden = !state.d;
    document.body.classList.toggle("pv-filtered", active);
    toUrl();
  }

  function setIndex(list) {
    var added = {};
    [].forEach.call(document.querySelectorAll("tr[data-id]"), function (r) { added[r.getAttribute("data-id")] = r.getAttribute("data-d"); });
    list.forEach(function (p) { p._added = added[p.id]; });
    providers = list; index = S.build(list);
    apply();
  }

  /* the country list: only countries that have a source, by name, with how many */
  (function fillCountries() {
    var n = {};
    rows.forEach(function (r) { (r.getAttribute("data-c") || "").split(" ").forEach(function (c) { if (c && c !== "*") n[c] = (n[c] || 0) + 1; }); });
    var opts = Object.keys(n).map(function (c) { return { c: c, name: S.countryName(c.toUpperCase()) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = '<option value="">All countries</option><option value="*">Worldwide services only</option>';
    opts.forEach(function (o) { html += '<option value="' + o.c + '">' + o.name.replace(/&/g, "&amp;").replace(/</g, "&lt;") + " (" + n[o.c] + ")</option>"; });
    cSel.innerHTML = html;
  })();

  fromUrl();
  q.value = state.q; cSel.value = state.c;
  if (cSel.value !== state.c) { state.c = ""; cSel.value = ""; }
  var t = null;
  q.addEventListener("input", function () { state.q = q.value; clearTimeout(t); t = setTimeout(apply, 90); });
  form.addEventListener("submit", function (e) { e.preventDefault(); state.q = q.value; apply(); });
  cSel.addEventListener("change", function () { state.c = cSel.value; apply(); });
  world.addEventListener("change", function () { state.world = world.checked; apply(); });
  accBtns.forEach(function (b) {
    b.addEventListener("click", function () { var k = b.getAttribute("data-acc"); state.acc[k] = !state.acc[k]; apply(); });
  });
  clear.addEventListener("click", function () { state = { q: "", c: "", world: true, acc: {}, d: "", t: "" }; q.value = ""; cSel.value = ""; apply(); q.focus(); });
  [].forEach.call(document.querySelectorAll("[data-newday]"), function (b) {
    b.addEventListener("click", function () {
      state.d = b.getAttribute("data-newday"); apply();
      var first = document.querySelector("section[data-kind]:not([hidden])"); if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  if (newFilter) newFilter.addEventListener("click", function () { state.d = ""; apply(); });
  function toList() { var first = document.querySelector("section[data-kind]:not([hidden])"); if (first) first.scrollIntoView({ behavior: "smooth", block: "start" }); }
  var easy = document.getElementById("pv-easy"), allun = document.getElementById("pv-allunchecked");
  if (easy) easy.addEventListener("click", function () { state.acc = { unsurveyed: true }; state.t = "read"; apply(); toList(); });
  if (allun) allun.addEventListener("click", function () { state.acc = { unsurveyed: true }; state.t = ""; apply(); toList(); });

  apply();   // first with the plain text fallback, then with the real matcher once the directory has arrived
  var base = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  fetch(base + "providers.json").then(function (r) { return r.json(); }).then(function (j) { setIndex(j.providers); }).catch(function () { /* the plain filter stays */ });
  if (location.hash === "#find" || state.q) { /* arrived from the header: put the cursor where the typing goes */ q.focus(); }
})();
