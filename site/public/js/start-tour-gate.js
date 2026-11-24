/* THE STORY TOUR, THE PART THAT IS ON EVERY PAGE. This file is small on purpose: it decides whether to open the tour, puts the "The story"
   button in the header and the drawer, and listens for the T key. The tour itself (start-tour.css, start-tour.js, the land mask and the
   chapters at /start-tour.html) is fetched only when the tour opens, so a visitor who never opens it never downloads it.

   WHEN IT OPENS BY ITSELF (switched off for now: see AUTO_OPEN below; these are the rules for when it is switched on). Once per browser, on the two front doors only: the home page and /start/, with no query string and no
   hash. A deep link (a place, a surname, a tool, a map view, ?q=, ?spot=) is somebody who already knows where they are going, and is
   never interrupted. Never for a robot or an automated browser, and never when this browser cannot remember that it has been shown
   (storage blocked): a tour that reopens on every visit is worse than none. It is marked seen the moment it appears, so a reload,
   a skip and a close all mean "not again". Opening it by hand (the button, the T key, /start/#story) always works, seen or not.

   Written as a classic script that also exports its decisions (module.exports) so test/start-tour-gate.test.js can run them with
   no browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.boot(root);
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  /* THE FIRST-VISIT AUTO-OPEN IS OFF. David, 22 Nov 2026: the tour stays a button for now. Everything else works as it did: the header "The story"
     button, the drawer and About-menu rows, the T key, /start/#story and "Play the story" on /start/ all open it. The first-visit logic below
     (shouldAutoOpen, "seen" once opened) is kept and tested; turning it on later is this one line: AUTO_OPEN = true. While it is false a page
     view never opens the tour and never writes "ra-tour-seen". */
  var AUTO_OPEN = false;
  var SEEN = "ra-tour-seen";
  var BOT = /bot\b|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|lighthouse|pagespeed|headlesschrome|phantomjs|wget|curl\//i;
  /* query keys that say nothing about where the visitor is going */
  var NEUTRAL = /^(lang|utm_[a-z_]+|fbclid|gclid|ref)$/i;

  function baseOf(b) { b = String(b || "/"); return b.replace(/\/?$/, "/"); }
  /* "/TheMap/start/index.html" with base "/TheMap/" -> "/start/" */
  function cleanPath(path, base) {
    var b = baseOf(base), p = String(path || "/");
    if (p.indexOf(b.replace(/\/$/, "") + "/") === 0 && b !== "/") p = p.slice(b.length - 1);
    return p.replace(/index\.html$/, "").replace(/\/{2,}/g, "/") || "/";
  }
  function isFrontDoor(path, base) { var p = cleanPath(path, base); return p === "/" || p === "/start/" || p === "/start"; }
  function plainQuery(search) {
    var s = String(search || "").replace(/^\?/, "");
    if (!s) return true;
    return s.split("&").every(function (kv) { var k = kv.split("=")[0]; return !k || NEUTRAL.test(decodeURIComponent(k)); });
  }
  /* c: { path, base, search, hash, seen, canStore, webdriver, ua }  ->  true when the tour should open by itself */
  function shouldAutoOpen(c) {
    if (!c) return false;
    if (c.webdriver) return false;
    if (BOT.test(String(c.ua || ""))) return false;
    if (!isFrontDoor(c.path, c.base)) return false;
    if (!plainQuery(c.search)) return false;
    if (c.hash && c.hash !== "#" && c.hash !== "#story") return false;
    if (!c.canStore) return false;
    if (c.seen) return false;
    return true;
  }
  /* what boot() asks: the first-visit rules, and the switch above */
  function autoOpenNow(c) { return AUTO_OPEN && shouldAutoOpen(c); }
  /* "t" opens it unless the visitor is typing or has a modifier down */
  function isTourKey(e) {
    if (!e || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key !== "t" && e.key !== "T") return false;
    var t = e.target, tag = t && t.tagName ? t.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return false;
    return true;
  }

  function boot(w) {
    var d = w.document, root = d.documentElement, base = baseOf(root.getAttribute("data-base"));
    var T = function (x) { return w.RA_T ? w.RA_T(x) : x; };
    var store = (function () {
      try { var k = "ra-tour-probe"; w.localStorage.setItem(k, "1"); w.localStorage.removeItem(k); return w.localStorage; } catch (e) { return null; }
    })();
    function seen() { try { return !!store && store.getItem(SEEN) === "1"; } catch (e) { return false; } }
    function markSeen() { try { store && store.setItem(SEEN, "1"); } catch (e) { /* storage blocked */ } }

    var state = { loading: null, api: null };
    function script(src) {
      return new Promise(function (ok, no) { var s = d.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; d.head.appendChild(s); });
    }
    /* The tour lives in a shadow root: its stylesheet cannot touch the page and the page's cannot touch it. Chapters (HTML, with the live numbers
       already in it), land mask (text) and engine (script) are fetched in parallel, once, and only now. */
    function load() {
      if (state.loading) return state.loading;
      /* Caveat, the handwriting on the photograph and the register page: self-hosted (public/fonts, SIL OFL 1.1), declared only now, when the tour
         opens, and in the document, because a font-face inside a shadow root is ignored. The browser fetches the file only when text uses it. */
      if (!d.getElementById("ra-tour-font")) {
        var fs = d.createElement("style"); fs.id = "ra-tour-font";
        var face = function (file, range) { return '@font-face{font-family:"Caveat";font-style:normal;font-weight:500;font-display:swap;src:url("' + base + 'fonts/' + file + '") format("woff2");unicode-range:' + range + '}'; };
        /* two files, with the unicode ranges Google gives them: the browser fetches the second only if a Ž, ć, č, š or đ is actually drawn */
        fs.textContent = face("caveat-latin-500.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")
          + face("caveat-latin-ext-500.woff2", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF");
        d.head.appendChild(fs);
      }
      var hostEl = d.createElement("div"); hostEl.id = "ra-tour-host";
      if (!hostEl.attachShadow) return (state.loading = Promise.reject(new Error("no shadow dom")));
      var sh = hostEl.attachShadow({ mode: "open" });
      var link = d.createElement("link"); link.rel = "stylesheet"; link.href = base + "start-tour.css";
      var cssReady = new Promise(function (ok, no) { link.onload = ok; link.onerror = no; });
      sh.appendChild(link); d.body.appendChild(hostEl);   /* a stylesheet in a shadow root that is not in the document never loads */
      var frag = w.fetch(base + "start-tour.html").then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
      var mask = w.fetch(base + "js/start-tour-land.txt").then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
      state.loading = Promise.all([frag, mask, script(base + "js/start-tour.js"), cssReady]).then(function (v) {
        var holder = d.createElement("div"); holder.innerHTML = v[0];
        var tour = holder.querySelector("#ra-tour"), data = JSON.parse(holder.querySelector("#ra-tour-data").textContent);
        tour.hidden = true; sh.appendChild(tour);
        state.api = w.raTourInit(tour, data, v[1]);
        return state.api;
      });
      state.loading.catch(function () { state.loading = null; if (hostEl.parentNode) hostEl.parentNode.removeChild(hostEl); });
      return state.loading;
    }
    /* ON THE MAP, THE TOUR IS THE MAP (js/live-tour.js, loaded only now); anywhere else, or if that cannot start, it is the film. A tour closed by closing the
       page leaves the reader's research copied aside, so a page that finds that copy loads the same file, which puts it back. */
    function live() {
      if (!d.getElementById("ra-map") || !w.raTourApi) return Promise.resolve(false);
      if (w.raLiveTour) return Promise.resolve(!!w.raLiveTour.open());
      return script(base + "js/live-tour.js").then(function () { return !!(w.raLiveTour && w.raLiveTour.open()); }, function () { return false; });
    }
    try { if (w.sessionStorage.getItem("ra-tour-backup")) script(base + "js/live-tour.js"); } catch (e) { /* none */ }
    function open(from, auto) {
      if (state.api && state.api.S.open || w.raLiveTour && w.raLiveTour.isOpen) return;
      markSeen();
      var opener = from || d.activeElement;
      (auto ? Promise.resolve(false) : live()).then(function (ok) { if (!ok) film(opener, auto); });
    }
    function film(opener, auto) {
      load().then(function (api) {
        api.open(0, opener, function () {
          if (w.location.hash === "#story") { try { w.history.replaceState(null, "", w.location.pathname + w.location.search); } catch (e) { /* leave it */ } }
        });
      }).catch(function () {
        /* the tour could not load (offline, blocked): a visitor who asked for it gets the same story as a page; one who did not is left alone */
        if (!auto) w.location.href = base + "start/";
      });
    }
    w.raTour = { open: function (from) { open(from, false); }, seen: seen, get api() { return state.api; } };

    /* ---- the buttons: the header icon, the drawer row, and any link or button that asks for it ---- */
    var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.2 8.4l5.2 3.6-5.2 3.6z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    var tip = T("The story: a two-minute tour of what the Atlas is for (key T)");
    function mount() {
      var nav = d.querySelector("header.site nav.topnav");
      if (nav && !nav.querySelector(".ra-story")) {
        var b = d.createElement("button"); b.type = "button"; b.className = "ra-story"; b.innerHTML = ICON; b.title = tip; b.setAttribute("aria-label", tip);
        b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-tour-open", "");
        var before = nav.querySelector(".ra-reader") || nav.querySelector(".ra-canvas") || nav.querySelector(".ra-theme");
        if (before) nav.insertBefore(b, before); else nav.appendChild(b);
      }
      var q = d.querySelector("#ra-quick .dq-story");
      if (q) q.hidden = false;
      return !!nav;
    }
    /* theme.js (loaded before this, deferred) adds the Reader, Canvas and theme icons; this goes in front of them. If the menu is not
       there yet, look again a few times, as theme.js does. */
    var tries = 0; (function look() { if (!mount() && ++tries < 20) w.setTimeout(look, 150); })();

    d.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-tour-open],a[href$='/start/#story'],a[href='#story']") : null;
      if (!el || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      var dr = d.getElementById("drawer"); if (dr && !dr.hasAttribute("hidden")) { dr.setAttribute("hidden", ""); var bg = d.querySelector(".burger"); if (bg) bg.setAttribute("aria-expanded", "false"); }
      var menu = el.closest && el.closest("details.menu"); if (menu) menu.open = false;
      open(el.tagName === "A" || el.closest("details") ? d.querySelector(".ra-story") || el : el, false);
    });
    d.addEventListener("keydown", function (e) {
      if (!isTourKey(e)) return;
      if (state.api && state.api.S.open || w.raLiveTour && w.raLiveTour.isOpen) return;
      e.preventDefault(); open(d.activeElement, false);
    });

    /* ---- opening by itself, once ---- */
    var here = { path: w.location.pathname, base: base, search: w.location.search, hash: w.location.hash, seen: seen(), canStore: !!store,
                 webdriver: !!(w.navigator && w.navigator.webdriver), ua: w.navigator && w.navigator.userAgent };
    if (w.location.hash === "#story" && isFrontDoor(here.path, base)) { w.setTimeout(function () { open(null, false); }, 0); }
    else if (autoOpenNow(here)) {
      var go = function () { (w.requestIdleCallback || function (f) { w.setTimeout(f, 300); })(function () { if (!seen()) open(null, true); }, { timeout: 2500 }); };
      if (d.readyState === "complete") go(); else w.addEventListener("load", go);
    }
  }
  return { AUTO_OPEN: AUTO_OPEN, autoOpenNow: autoOpenNow, shouldAutoOpen: shouldAutoOpen, isFrontDoor: isFrontDoor, plainQuery: plainQuery, cleanPath: cleanPath, isTourKey: isTourKey, boot: boot, SEEN: SEEN };
});
