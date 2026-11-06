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
      var row = b.classList.contains("ra-theme-row");
      b.innerHTML = (now === "dark" ? MOON : SUN) + (row ? "<span>" + T(now === "dark" ? "Dark mode — switch to light" : "Light mode — switch to dark") + "</span>" : "");
      var say = T("Colour theme: " + now + (stored() ? "" : " (following your device)") + ". Switch to " + next + ".");
      b.setAttribute("aria-label", say); b.title = say;
    });
  }
  function flip() { try { localStorage.setItem(KEY, effective() === "dark" ? "light" : "dark"); } catch (e) { /* storage blocked: it lasts until the page closes */ root.setAttribute("data-theme", effective() === "dark" ? "light" : "dark"); } apply(); paint(); }
  function make(cls) { var b = document.createElement("button"); b.type = "button"; b.className = cls; b.addEventListener("click", flip); buttons.push(b); return b; }
  function mount() {
    var nav = document.querySelector("header.site nav.topnav"), wrap = document.querySelector("header.site .drawer .wrap");
    if (!nav && !wrap) return false;
    if (nav && !nav.querySelector(".ra-theme")) nav.appendChild(make("ra-theme"));
    if (wrap && !wrap.querySelector(".ra-theme-row")) { var g = document.createElement("div"); g.className = "dgrp"; g.appendChild(make("ra-theme-row")); wrap.appendChild(g); }
    paint(); return true;
  }
  apply();
  var tries = 0; (function look() { if (!mount() && ++tries < 20) setTimeout(look, 150); })();
  window.addEventListener("storage", function (e) { if (e.key === KEY) { apply(); paint(); } });
  if (mq && mq.addEventListener) mq.addEventListener("change", paint);
})();
