/* THE BASEMAPS OF THE MAPS, AND WHICH ONE OPENS FIRST. One small classic script, shared by the Atlas map (RecordMap.astro), Compass
   (tree-canvas/compass-view.js) and the History map (history-theatre.js), so they cannot disagree about what opens or how Night dots
   is built. Pure rules at the top (tested in test/basemaps.test.js), Leaflet parts below.

   THE DEFAULT FOLLOWS THE THEME: DEFAULT_BY_THEME is the ONE constant to change. Dark site theme opens on Night dots, light on the light
   map. "Dark" is read the way the whole site reads it (theme.js): <html data-theme="dark"|"light"> when the reader chose, else the device's
   prefers-color-scheme.

   A READER'S OWN CHOICE ALWAYS WINS, in this order: ?base= in the address bar (the Atlas map only), the choice they last made with a
   switcher (kept in this browser, key ra-basemap), and only then the theme's default. With no choice made, the default follows the theme
   live: toggle the theme and the map follows. Once they have chosen, it stays.

   Night dots itself (night-dots.js and the land outlines) is fetched only when it is first shown, so a light-theme reader who never picks it
   downloads none of it. Under Compass's strict CSP this works as is: the script and the stylesheet are same-origin files (script-src and
   style-src 'self'), the outlines are same-origin fetches (connect-src), the tiles are on the allowed Esri host, and nothing is inline. */
(function (root, factory) {
  var api = factory(typeof document !== "undefined" ? document.currentScript : null);
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  root.raBasemaps = api;
})(typeof window !== "undefined" ? window : this, function (self) {
  "use strict";

  var DEFAULT_BY_THEME = { light: "map", dark: "night" };   /* the one constant */
  var ATLAS_KEYS = ["map", "terrain", "satellite", "night"];
  var PAIR_KEYS = ["map", "night"];                          /* Compass and History have only the light grey to offer besides */
  var STORE = "ra-basemap";
  var HERE = (self && self.src) || "";
  var ROOT = HERE ? HERE.replace(/js\/basemaps\.js(\?.*)?$/, "") : "/";   /* the site's root, with any /TheMap/ prefix */

  /* ---------- pure rules ---------- */

  /* The site's own rule (theme.js, Base.astro, Compass): an explicit data-theme wins, otherwise the device. */
  function themeOf(dataTheme, deviceDark) { return dataTheme === "dark" || (dataTheme !== "light" && !!deviceDark) ? "dark" : "light"; }
  function themeNow() {
    var t = null, dev = false;
    try { t = document.documentElement.getAttribute("data-theme"); } catch (e) { /* no document */ }
    try { dev = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); } catch (e) { /* no matchMedia */ }
    return themeOf(t, dev);
  }
  function defaultFor(theme) { return DEFAULT_BY_THEME[theme === "dark" ? "dark" : "light"]; }
  /* A value, if it is on the list; anything else (a typo, "constructor", null) is nothing. */
  function valid(value, keys) { return typeof value === "string" && (keys || ATLAS_KEYS).indexOf(value) >= 0 ? value : ""; }
  function stored(keys) { try { return valid(localStorage.getItem(STORE), keys); } catch (e) { return ""; } }
  function remember(key) { try { localStorage.setItem(STORE, key); } catch (e) { /* blocked: it lasts until the page closes */ } }
  /* What opens: the address bar, then the saved choice, then the theme's default. `explicit` says a reader chose it. */
  function choose(o) {
    var keys = o.keys || ATLAS_KEYS, u = valid(o.url, keys), s = valid(o.stored, keys);
    var key = u || s;
    return key ? { key: key, explicit: true, from: u ? "url" : "saved" } : { key: defaultFor(o.theme), explicit: false, from: "theme" };
  }
  /* The theme changing: calls back with "dark"|"light" whenever the data-theme attribute or the device's scheme changes. */
  function watchTheme(cb) {
    var last = themeNow();
    function check() { var t = themeNow(); if (t !== last) { last = t; cb(t); } }
    try { new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch (e) { /* none */ }
    try { var mq = window.matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", check); else if (mq.addListener) mq.addListener(check); } catch (e) { /* none */ }
  }

  /* ---------- Leaflet ---------- */

  var loading = null;
  function loadNightScript(src) {
    if (typeof window !== "undefined" && window.raNightDots) return Promise.resolve(window.raNightDots);
    return loading || (loading = new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src || (ROOT + "js/night-dots.js");
      s.onload = function () { window.raNightDots ? ok(window.raNightDots) : no(new Error("night-dots")); };
      s.onerror = function () { no(new Error("night-dots")); };
      document.head.appendChild(s);
    }).catch(function (e) { loading = null; throw e; }));
  }
  function addCss(href) {
    if (!href || document.querySelector('link[data-ra-bm="' + href + '"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.setAttribute("data-ra-bm", href); document.head.appendChild(l);
  }
  function still() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }

  /* The Night dots basemap as a Leaflet layer that costs nothing until it is added: o = { labelsPane, onFail, css, dir, script }. */
  function nightLayer(L, o) {
    o = o || {};
    return new (L.Layer.extend({
      onAdd: function (m) {
        var me = this;
        me._live = true;
        m.getContainer().classList.add("ra-night");   /* the dark ground at once, while the dots are on their way */
        addCss(o.css === undefined ? ROOT + "basemaps.css" : o.css);
        loadNightScript(o.script).then(function (ND) {
          if (!me._live) return;
          me._in = ND.create(L, { dir: o.dir || ROOT + "vendor/natural-earth/", labelsPane: o.labelsPane, reduce: still });
          me._in.addTo(m);
        }, function () { if (me._live && o.onFail) o.onFail(); });
      },
      onRemove: function (m) {
        this._live = false;
        m.getContainer().classList.remove("ra-night");
        if (this._in) m.removeLayer(this._in);
        this._in = null;
      },
      bringToBack: function () { if (this._in) this._in.bringToBack(); return this; }
    }))();
  }

  /* A two-button switcher (Map | Night dots) for a map that has only the light grey besides, with the same rules as the Atlas map:
     o = { light: [layers drawn for the light map], labelsPane, position, css, onChange(key) }. Returns { key(), set(key) }. */
  function attach(L, map, o) {
    var keys = PAIR_KEYS, night = null, now = "", explicit = false, bar = null;
    var first = choose({ keys: keys, stored: stored(keys), theme: themeNow() });
    explicit = first.explicit;
    var TITLES = { map: "Plain map: place names and borders, easiest to read", night: "Night dots: a quiet dark map so the colours stand out" };
    var NAMES = { map: "Map", night: "Night dots" };
    function show(key) {
      if (key === now) return;
      if (now === "night" && night) map.removeLayer(night);
      if (now === "map") (o.light || []).forEach(function (l) { map.removeLayer(l); });
      now = key;
      if (key === "night") { night = night || nightLayer(L, { labelsPane: o.labelsPane, css: o.css, onFail: function () { show("map"); } }); night.addTo(map); night.bringToBack(); }
      else (o.light || []).forEach(function (l) { l.addTo(map); if (l.bringToBack && l.options && !l.options.pane) l.bringToBack(); });
      if (bar) bar.querySelectorAll("a").forEach(function (x) { var on = x.getAttribute("data-b") === key; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
      if (o.onChange) o.onChange(key);
    }
    var ctl = L.control({ position: o.position || "topright" });
    ctl.onAdd = function () {
      var b = bar = L.DomUtil.create("div", "leaflet-bar ra-base");
      b.setAttribute("role", "group"); b.setAttribute("aria-label", "Basemap");
      b.innerHTML = keys.map(function (k) {
        return '<a href="#" role="button" data-b="' + k + '" title="' + TITLES[k] + '" aria-pressed="' + (k === now) + '"' + (k === now ? ' class="on"' : "") + ">" + NAMES[k] + "</a>";
      }).join("");
      L.DomEvent.disableClickPropagation(b);
      function pick(e) {
        var a = e.target.closest && e.target.closest("a[data-b]"); if (!a) return;
        L.DomEvent.stop(e);
        explicit = true; remember(a.getAttribute("data-b")); show(a.getAttribute("data-b"));
      }
      L.DomEvent.on(b, "click", pick);
      L.DomEvent.on(b, "keydown", function (e) { if (e.key === " " || e.key === "Spacebar") pick(e); });
      return b;
    };
    show(first.key);
    ctl.addTo(map);
    addCss(o.css === undefined ? ROOT + "basemaps.css" : o.css);
    addCss(o.switchCss === undefined ? ROOT + "basemaps-switch.css" : o.switchCss);
    watchTheme(function (t) { if (!explicit) show(defaultFor(t)); });
    return { key: function () { return now; }, set: function (k) { if (keys.indexOf(k) >= 0) show(k); } };
  }

  return {
    DEFAULT_BY_THEME: DEFAULT_BY_THEME, ATLAS_KEYS: ATLAS_KEYS, PAIR_KEYS: PAIR_KEYS, STORE: STORE,
    themeOf: themeOf, themeNow: themeNow, defaultFor: defaultFor, valid: valid, stored: stored, remember: remember, choose: choose, watchTheme: watchTheme,
    nightLayer: nightLayer, attach: attach
  };
});
