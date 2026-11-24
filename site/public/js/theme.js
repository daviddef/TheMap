/* LIGHT / DARK TOGGLE. David: «could you add a dark/light mode toggle?» The site already follows the device (prefers-color-scheme) and its
   stylesheets already honour data-theme="light" | "dark" on <html>; this adds the switch. One small round button at the end of the menu
   bar, and a row in the burger drawer. It shows the theme you are looking at and switches to the other; the choice is kept in this browser
   (ra-theme) and applied before the page paints by a tiny inline line in each <head>, so there is no flash. Never chosen = follows the device.
   Loaded as a classic deferred script on every page that has the site menu. */
(function () {
  "use strict";
  var KEY = "ra-theme", root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function stored() { try { var t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : ""; } catch (e) { return ""; } }
  function effective() { var t = stored(); return t || (mq && mq.matches ? "dark" : "light"); }
  function apply() { var t = stored(); if (t) root.setAttribute("data-theme", t); else root.removeAttribute("data-theme"); }
  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var buttons = [];
  var T = function (x) { return window.RA_T ? window.RA_T(x) : x; };
  function paint() {
    var now = effective(), next = now === "dark" ? "light" : "dark";
    buttons.forEach(function (b) {
      var row = b.classList.contains("ra-theme-row"), quick = b.classList.contains("dq-theme");
      var ico = (now === "dark" ? MOON : SUN).replace(/width="18" height="18"/, 'width="20" height="20"');
      /* the drawer's quick row (Base.astro #ra-quick): a round icon with a short label under it, like its neighbours */
      b.innerHTML = quick ? '<span class="dqi">' + ico + "</span><span>" + T(now === "dark" ? "Dark" : "Light") + "</span>"
        : (now === "dark" ? MOON : SUN) + (row ? "<span>" + T(now === "dark" ? "Dark mode — switch to light" : "Light mode — switch to dark") + "</span>" : "");
      var say = T("Colour theme: " + now + (stored() ? "" : " (following your device)") + ". Switch to " + next + ".");
      b.setAttribute("aria-label", say); b.title = say;
    });
  }
  function flip() { try { localStorage.setItem(KEY, effective() === "dark" ? "light" : "dark"); } catch (e) { /* storage blocked: it lasts until the page closes */ root.setAttribute("data-theme", effective() === "dark" ? "light" : "dark"); } apply(); paint(); }
  /* THE NEWEST KEPT TREE, if any: the canvas keeps its last files in this browser's own database (tcRecent, store m). Only its metadata is read, never the file; and the database is never created here
   (indexedDB.databases() says whether it exists). cb(null) for none, for "Keep the last files" off, and for anything that is not supported. */
function keptTree(cb) {
  try {
    if (localStorage.getItem("tcRemember") === "0" || !window.indexedDB || !indexedDB.databases) return cb(null);
    indexedDB.databases().then(function (l) {
      if (!l.some(function (d) { return d.name === "tcRecent"; })) return cb(null);
      var r = indexedDB.open("tcRecent", 1);
      r.onerror = function () { cb(null); };
      r.onsuccess = function () {
        var db = r.result;
        try {
          var q = db.transaction("m").objectStore("m").getAll();
          q.onsuccess = function () { db.close(); var a = (q.result || []).sort(function (x, y) { return (y.when || 0) - (x.when || 0); }); cb(a[0] || null); };
          q.onerror = function () { db.close(); cb(null); };
        } catch (e) { db.close(); cb(null); }
      };
    }).catch(function () { cb(null); });
  } catch (e) { cb(null); }
}
function make(cls) { var b = document.createElement("button"); b.type = "button"; b.className = cls; b.addEventListener("click", flip); buttons.push(b); return b; }
  function mount() {
    var nav = document.querySelector("header.site nav.topnav"), wrap = document.querySelector("header.site .drawer .wrap");
    if (!nav && !wrap) return false;
    /* THE RECORD READER IS AN ICON BESIDE THE TOGGLE. David: «move record reader button as an icon only to the left of the dark/light
       toggle, similar style and size, and only hover text.» It is made here, next to the toggle, so the two always sit together; the
       drawer keeps the text link from the menu list. */
    if (nav && !nav.querySelector(".ra-reader")) {
      var a = document.createElement("a"), base = (root.getAttribute("data-base") || "/").replace(/\/?$/, "/");
      a.className = "ra-reader"; a.href = base + "read/";
      a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      var tip = T("Record Reader: read a line from an old register"); a.title = tip; a.setAttribute("aria-label", tip);
      if (location.pathname.replace(/\/+$/, "").slice(-5) === "/read") a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    }
    /* THE TREE CANVAS IS A SECOND ROUND ICON, to the right of the Record Reader's. Hover text only, like it. */
    if (nav && !nav.querySelector(".ra-canvas")) {
      var cv = document.createElement("a"), cbase = (root.getAttribute("data-base") || "/").replace(/\/?$/, "/");
      cv.className = "ra-canvas"; cv.href = cbase + "tree-canvas/"; cv.target = "_blank"; cv.rel = "noopener";
      cv.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="7" height="5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="15" width="7" height="5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="4" width="7" height="5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.5h4M6.5 9v8.5H14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var ctip = T("Tree Canvas: draw a family tree file on one canvas"); cv.title = ctip; cv.setAttribute("aria-label", ctip);
      if (location.pathname.replace(/\/+$/, "").slice(-12) === "/tree-canvas") cv.setAttribute("aria-current", "page");
      nav.appendChild(cv);
    }
    /* THE COMPASS IS A THIRD ROUND ICON, beside the canvas (David, 24 Nov 2026: «compass is almost not a feature at all»). It is the same tree on the map through time. With a tree kept in this browser
       (the canvas keeps the last files, tcRecent) both icons REOPEN IT, in this tab, so going from the Atlas to the canvas or the Compass and back never loses the file; with none, the Compass
       opens an invented family so there is something to see. The names are never read here, only the newest kept file's name for the hover text. */
    if (nav && !nav.querySelector(".ra-compass")) {
      var cp = document.createElement("a"), pbase = (root.getAttribute("data-base") || "/").replace(/\/?$/, "/");
      cp.className = "ra-compass"; cp.href = pbase + "tree-canvas/?demo=compass"; cp.target = "_blank"; cp.rel = "noopener";
      cp.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
      var ptip = T("Compass: a family on the map, through time (an invented one until you open your own tree)"); cp.title = ptip; cp.setAttribute("aria-label", ptip);
      var cvn = nav.querySelector(".ra-canvas"); if (cvn && cvn.nextSibling) nav.insertBefore(cp, cvn.nextSibling); else nav.appendChild(cp);
      keptTree(function (k) {
        if (!k) return;
        var nm = String(k.tree || k.name || "your tree").slice(0, 60);
        var cvb = nav.querySelector(".ra-canvas");
        if (cvb) { cvb.href = pbase + "tree-canvas/?resume=1"; cvb.removeAttribute("target"); cvb.removeAttribute("rel"); cvb.title = T("Tree Canvas: open") + " " + nm + " " + T("again"); cvb.setAttribute("aria-label", cvb.title); }
        cp.href = pbase + "tree-canvas/?resume=1&to=compass"; cp.removeAttribute("target"); cp.removeAttribute("rel"); cp.title = T("Compass:") + " " + nm + " " + T("on the map, through time"); cp.setAttribute("aria-label", cp.title);
        document.querySelectorAll("#ra-quick .dq-canvas").forEach(function (d) { d.href = cvb ? cvb.href : d.href; d.removeAttribute("target"); d.removeAttribute("rel"); });
        document.querySelectorAll("#ra-quick .dq-compass").forEach(function (d) { d.href = cp.href; d.removeAttribute("target"); d.removeAttribute("rel"); });
      });
    }
    /* WHAT'S NEW IS A ROUND SPARKLE ICON, like the other sites have: beside the Tree Canvas, before the toggle. Hover text only. It takes the
       same orange dot as the About menu when there is news (raNewsDot in Base.astro). */
    if (nav && !nav.querySelector(".ra-news")) {
      var nw = document.createElement("a"), nbase = (root.getAttribute("data-base") || "/").replace(/\/?$/, "/");
      nw.className = "ra-news"; nw.href = nbase + "whats-new/";
      nw.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10.5 6C11.2 11 12.2 12.3 17 13c-4.8.7-5.8 2-6.5 7C9.8 15 8.8 13.7 4 13c4.8-.7 5.8-2 6.5-7z" fill="currentColor"/><path d="M18 2.8c.3 2 .7 2.4 2.7 2.7-2 .3-2.4.7-2.7 2.7-.3-2-.7-2.4-2.7-2.7 2-.3 2.4-.7 2.7-2.7z" fill="currentColor"/></svg>';
      var ntip = T("What's new: the latest changes to Record Atlas"); nw.title = ntip; nw.setAttribute("aria-label", ntip);
      if (location.pathname.replace(/\/+$/, "").slice(-10) === "/whats-new") nw.setAttribute("aria-current", "page");
      nav.appendChild(nw);
    }
    if (nav && !nav.querySelector(".ra-theme")) nav.appendChild(make("ra-theme"));
    if (wrap && !wrap.querySelector(".ra-theme-row")) { var g = document.createElement("div"); g.className = "dgrp"; g.appendChild(make("ra-theme-row")); wrap.appendChild(g); }
    /* the quick row's button is in the page already (hidden until it can work): bind it the same way as the others */
    var qb = document.querySelector("#ra-quick .dq-theme");
    if (qb && !qb.__ra) { qb.__ra = 1; qb.hidden = false; qb.addEventListener("click", flip); buttons.push(qb); }
    paint(); return true;
  }
  apply();
  var tries = 0; (function look() { if (!mount() && ++tries < 20) setTimeout(look, 150); })();
  window.addEventListener("storage", function (e) { if (e.key === KEY) { apply(); paint(); } });
  if (mq && mq.addEventListener) mq.addEventListener("change", paint);
})();
