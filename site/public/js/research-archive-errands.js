/* THE FAMILY ARCHIVES' OPEN ERRANDS, UNDER ERRANDS ON /my-research/. The page said «3 letters out» and, below, «No errands yet»: one counted the family
 * sessions' marks, the other only the letters kept in this browser. This lists what the archives of the chosen families have open, in its own block, apart
 * from the reader's own: who, what for, where it stands, and the month a letter went. Nothing else is published (scripts/publish-archive-errands.py), and
 * the detail stays on each archive's own errands page. */
(function () {
  "use strict";
  var host = document.getElementById("mr-archive-errands"), P = window.raProgress, SY = window.raSynopsis;
  if (!host || !P || !SY) return;
  var BASE = (host.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SAY = { sent: "sent", drafted: "drafted, not sent", "to do": "to do", listed: "listed as a place to ask" };
  var ORDER = ["sent", "drafted", "to do", "listed"];
  var DATA = null, asked = false, failed = false, opened = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function month(m) { var x = /^(\d{4})-(\d\d)$/.exec(m || ""); return x ? MONTHS[+x[2] - 1] + " " + x[1] : ""; }

  /* the archives that research any of the families the page is reading */
  function chosen() {
    var lines = P.lines(), me = lines.filter(function (l) { return l.active; })[0], stored = null;
    try { stored = JSON.parse(localStorage.getItem("ra-synopsis-scope") || "null"); } catch (e) { /* none */ }
    var slugs = SY.scopeOf(lines, me && me.slug, stored), ids = {};
    lines.forEach(function (l) { if (slugs.indexOf(l.slug) > -1) (l.archives || []).forEach(function (a) { ids[a.id] = a.name || a.id; }); });
    return ids;
  }

  function counts(list) {
    return ORDER.map(function (s) { var n = list.filter(function (e) { return e.status === s; }).length; return n ? n + " " + SAY[s] : ""; }).filter(Boolean).join(", ");
  }

  function block(a, only) {
    var d = el("details", "mrae-a"), sum = el("summary"), list = a.errands.slice();
    d.open = a.archive in opened ? opened[a.archive] : only;   /* one archive opens by itself; several stay shut, with their counts */
    d.addEventListener("toggle", function () { opened[a.archive] = d.open; });
    sum.append(el("b", "", a.name + " archive"), el("span", "mrae-n", " " + counts(list)));
    d.append(sum);
    var ul = el("ul", "mrae-l");
    list.sort(function (x, y) { return ORDER.indexOf(x.status) - ORDER.indexOf(y.status) || x.institution.localeCompare(y.institution); }).forEach(function (e) {
      var li = el("li");
      li.append(el("b", "mrae-who", e.institution));
      if (e.kinds && e.kinds.length) li.append(el("span", "mrae-what", e.kinds.join(", ")));
      li.append(el("span", "mrae-st mrae-" + e.status.replace(" ", "-"), SAY[e.status] + (month(e.sent) ? ", " + month(e.sent) : "")));
      ul.append(li);
    });
    var p = el("p", "mrae-more"), go = el("a", "", "The detail is on the " + a.name + " archive’s errands page ↗"); go.href = a.page; go.target = "_blank"; go.rel = "noopener";
    p.append(go); d.append(ul, p);
    return d;
  }

  function draw() {
    var ids = chosen(), want = Object.keys(ids);
    host.textContent = ""; host.hidden = !want.length;
    if (!want.length) return;
    if (!DATA && !failed) { load(); }
    var box = el("section", "mrae");
    box.append(el("h3", "mrs-sub", "Open in the family archives"));
    if (failed) { box.append(el("p", "cap", "The archives’ list could not be loaded just now. Reload the page to try again.")); host.append(box); return; }
    if (!DATA) { box.append(el("p", "cap", "Loading…")); host.append(box); return; }
    var have = (DATA.archives || []).filter(function (a) { return ids[a.archive] && a.errands.length; });
    box.append(el("p", "cap", "These are the archives’ own, not yours: who, what for and where each stands, with no names of people. This list is refreshed by itself, a few times a day."));
    have.forEach(function (a) { box.append(block(a, have.length === 1)); });
    var none = want.filter(function (i) { return !have.some(function (a) { return a.archive === i; }); });
    if (none.length) box.append(el("p", "cap", "Nothing open is published for " + none.map(function (i) { return String(ids[i]).replace(/^The /, "the "); }).join(", ") + "."));
    host.append(box);
  }

  function load() {
    if (asked) return; asked = true;
    fetch(BASE + "archive-errands.json").then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (d) { DATA = d; draw(); }, function () { failed = true; asked = false; draw(); });
  }

  ["ra-progress-changed", "ra-scope-changed"].forEach(function (e) { document.addEventListener(e, function () { failed = false; draw(); }); });
  window.addEventListener("storage", draw);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(draw, 0); }); else setTimeout(draw, 0);
})();
