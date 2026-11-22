/* THE BASEMAPS OF THE MAPS, AND WHICH ONE OPENS FIRST. One small classic script, shared by the Atlas map (RecordMap.astro), Compass
   (tree-canvas/compass-view.js) and the History map (history-theatre.js), so they cannot disagree about what opens, what is offered, or how
   a look is built. Pure rules at the top (tested in test/basemaps.test.js), Leaflet parts below.

   THE LOOKS. Ten, each made for the light theme, the dark theme, or either:
     light   Map (Esri light grey), Smooth, Liberty, Ink
     dark    Night dots, Smooth dark, Ink dark, Imagery at night
     either  Terrain, Satellite
   Smooth, Smooth dark, Ink and Ink dark are our own MapLibre styles (public/basemap-styles/, drawn by scripts/build-basemap-styles.py) over
   the free OpenFreeMap vector tiles; Liberty is OpenFreeMap's own style. They need MapLibre GL JS, which is self-hosted
   (public/vendor/maplibre/) and fetched only the first time one of them is shown. Imagery at night is Esri's imagery under a CSS filter, with
   Esri's dark place names on top. No look needs a key or an account.

   THE DEFAULT FOLLOWS THE THEME: DEFAULT_BY_THEME is the ONE constant to change. Dark site theme opens on Night dots, light on the light
   map. "Dark" is read the way the whole site reads it (theme.js): <html data-theme="dark"|"light"> when the reader chose, else the device's
   prefers-color-scheme.

   A READER'S OWN CHOICE ALWAYS WINS, in this order: ?base= in the address bar (the Atlas map only), the choice they last made with a
   switcher (kept in this browser, key ra-basemap), and only then the theme's default. With no choice made, the default follows the theme
   live: toggle the theme and the map follows. Once they have chosen, it stays, even if the look was made for the other theme.

   THE SWITCHER lists the looks that suit the current theme first, then Terrain and Satellite, then a "More looks" fold with the other
   theme's looks. If the look in use is one of those, the fold is open, so the pressed button is never hidden.

   IF A LOOK CANNOT BE DRAWN (no WebGL, the tile host does not answer, the library file is missing) the map goes to the standard Map and the
   switcher says so in a sentence. The reader's saved choice is left alone: a bad network is not a change of mind.

   Under Compass's strict CSP everything here is same-origin: the scripts (script-src 'self'), the stylesheets (style-src 'self'), the
   style files and land outlines (connect-src), MapLibre's worker (the CSP build, a same-origin file: worker-src 'self'), and nothing is
   inline. The tile host tiles.openfreemap.org is reached by fetch, which connect-src's https: already allows; Esri's tiles are images
   (img-src). See test/basemaps.test.js. */
(function (root, factory) {
  var api = factory(typeof document !== "undefined" ? document.currentScript : null);
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  root.raBasemaps = api;
})(typeof window !== "undefined" ? window : this, function (self) {
  "use strict";

  var DEFAULT_BY_THEME = { light: "map", dark: "night" };   /* the one constant */
  var STORE = "ra-basemap";
  var MAPLIBRE_VERSION = "5.24.1";                           /* public/vendor/maplibre/NOTICE.txt */
  var HERE = (self && self.src) || "";
  var ROOT = HERE ? HERE.replace(/js\/basemaps\.js(\?.*)?$/, "") : "/";   /* the site's root, with any /TheMap/ prefix */

  var OFM = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  var ESRI_IMAGERY = "Esri, Maxar, Earthstar Geographics";
  var ESRI_LABELS = "Esri, HERE, Garmin &middot; &copy; OpenStreetMap contributors";

  /* Every look, in the order they are listed. suits: the theme it was made for, or "any". kind: how it is drawn. */
  var LOOKS = {
    map:        { name: "Map",              suits: "light", kind: "raster",  title: "Map: place names and borders, easiest to read" },
    smooth:     { name: "Smooth",           suits: "light", kind: "vector",  style: "basemap-styles/smooth.json",      attribution: OFM, ground: "#e9edf2",
                  title: "Smooth: a soft blue-grey map, quiet roads and clear country borders" },
    liberty:    { name: "Liberty",          suits: "light", kind: "vector",  style: "https://tiles.openfreemap.org/styles/liberty", attribution: OFM, ground: "#f8f4f0",
                  title: "Liberty: a fuller map with roads, parks and place names (OpenFreeMap)" },
    ink:        { name: "Ink",              suits: "light", kind: "vector",  style: "basemap-styles/ink.json",         attribution: OFM, ground: "#ffffff",
                  title: "Ink: black on white, like a printed map" },
    terrain:    { name: "Terrain",          suits: "any",   kind: "raster",  title: "Terrain: hills and rivers, which is often why a parish is where it is" },
    satellite:  { name: "Satellite",        suits: "any",   kind: "raster",  title: "Satellite: what the ground looks like now" },
    night:      { name: "Night dots",       suits: "dark",  kind: "night",   title: "Night dots: a quiet dark map so the colours stand out" },
    smoothdark: { name: "Smooth dark",      suits: "dark",  kind: "vector",  style: "basemap-styles/smooth-dark.json", attribution: OFM, ground: "#4a5567", dark: true,
                  title: "Smooth dark: a soft blue-grey dark map, lighter than Night dots" },
    inkdark:    { name: "Ink dark",         suits: "dark",  kind: "vector",  style: "basemap-styles/ink-dark.json",    attribution: OFM, ground: "#0a0a0a", dark: true,
                  title: "Ink dark: white on black" },
    imagenight: { name: "Imagery at night", suits: "dark",  kind: "imagery", ground: "#0b1522", dark: true,
                  title: "Imagery at night: satellite photographs, darkened, with place names" }
  };
  var ATLAS_KEYS = ["map", "smooth", "liberty", "ink", "terrain", "satellite", "night", "smoothdark", "inkdark", "imagenight"];
  /* Compass and History: the same looks, minus Terrain, whose tile host (OpenTopoMap) is not on Compass's img-src list and is not worth loosening it for. */
  var EMBED_KEYS = ["map", "smooth", "liberty", "ink", "satellite", "night", "smoothdark", "inkdark", "imagenight"];
  var VECTOR_KEYS = ATLAS_KEYS.filter(function (k) { return LOOKS[k].kind === "vector"; });

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
  /* Is this look a dark ground? (The cluster discs and anything else inked for the ground ask.) */
  function isDark(key) { return !!(LOOKS[key] && (LOOKS[key].dark || LOOKS[key].kind === "night")); }
  function isVector(key) { return !!(LOOKS[key] && LOOKS[key].kind === "vector"); }
  /* What the switcher shows. `bar`: the looks for this theme, then the ones for either; `more`: the other theme's. The fold is open when
     the reader opened it or when the look in use is in it, so the pressed button is always on screen. */
  function layout(theme, keys, active, openByReader) {
    var mine = theme === "dark" ? "dark" : "light", other = mine === "dark" ? "light" : "dark";
    function pick(s) { return (keys || ATLAS_KEYS).filter(function (k) { return LOOKS[k] && LOOKS[k].suits === s; }); }
    var bar = pick(mine).concat(pick("any")), more = pick(other);
    var inMore = more.indexOf(active) >= 0;
    return { bar: bar, more: more, moreTheme: other, open: more.length > 0 && (!!openByReader || inMore), forced: inMore };
  }
  /* The sentence the switcher shows when a look could not be drawn and the standard Map is shown instead. reason: "webgl" | "tiles" | "library". */
  function failMessage(key, reason) {
    var n = (LOOKS[key] && LOOKS[key].name) || "That look";
    if (reason === "webgl") return n + " needs WebGL, which this device does not have, so you are looking at the standard Map instead.";
    if (reason === "library") return n + " could not be loaded just now, so you are looking at the standard Map instead.";
    return n + " could not get its map pieces just now (offline, or its map host is busy), so you are looking at the standard Map instead.";
  }
  /* Where a vector look's style comes from: our own file on this site, or OpenFreeMap's own URL. */
  function styleUrl(key, root) {
    var s = LOOKS[key] && LOOKS[key].style;
    if (!s) return "";
    return /^https:\/\//.test(s) ? s : (root === undefined ? ROOT : root) + s;
  }
  /* The theme changing: calls back with "dark"|"light" whenever the data-theme attribute or the device's scheme changes. */
  function watchTheme(cb) {
    var last = themeNow();
    function check() { var t = themeNow(); if (t !== last) { last = t; cb(t); } }
    try { new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch (e) { /* none */ }
    try { var mq = window.matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", check); else if (mq.addListener) mq.addListener(check); } catch (e) { /* none */ }
  }

  /* ---------- loading, lazily ---------- */

  function absolute(u) { try { var a = document.createElement("a"); a.href = u; return a.href; } catch (e) { return u; } }
  function addCss(href) {
    if (!href) return;
    var abs = absolute(href), have = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < have.length; i++) if (have[i].href === abs) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.setAttribute("data-ra-bm", href); document.head.appendChild(l);
  }
  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src; s.onload = function () { ok(); }; s.onerror = function () { no(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function still() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function webglOk() {
    try { var c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
  }

  var nightLoading = null;
  function loadNightScript(src) {
    if (typeof window !== "undefined" && window.raNightDots) return Promise.resolve(window.raNightDots);
    return nightLoading || (nightLoading = loadScript(src || (ROOT + "js/night-dots.js")).then(function () {
      if (!window.raNightDots) throw new Error("night-dots");
      return window.raNightDots;
    }).catch(function (e) { nightLoading = null; throw e; }));
  }

  /* MapLibre GL JS and its Leaflet bridge, fetched the first time a vector look is shown. The CSP build, pointed at a same-origin worker. */
  var glLoading = null;
  function loadMaplibre(L, o) {
    o = o || {};
    if (window.maplibregl && window.L && window.L.maplibreGL) return Promise.resolve();
    if (glLoading) return glLoading;
    var dir = (o.dir || ROOT + "vendor/maplibre/");
    addCss(dir + "maplibre-gl.css");
    glLoading = loadScript(dir + "maplibre-gl-csp.js").then(function () {
      if (!window.maplibregl) throw new Error("maplibre-gl");
      window.maplibregl.setWorkerUrl(absolute(dir + "maplibre-gl-csp-worker.js"));
      if (!window.L) window.L = L;   /* the bridge reads the Leaflet global */
      return loadScript(dir + "leaflet-maplibre-gl.js");
    }).then(function () {
      if (!window.L || !window.L.maplibreGL) throw new Error("leaflet-maplibre-gl");
    }).catch(function (e) { glLoading = null; throw e; });
    return glLoading;
  }

  /* ---------- Leaflet layers ---------- */

  /* The classes a look puts on the map's container: ra-look (the page's own dark-theme tile filters stand down: they are for the light grey),
     ra-look-<key> (the ground colour while tiles are on their way), and, for the dark ones, ra-night as Night dots always had. */
  function mark(m, key, on) {
    var c = m.getContainer(), names = ["ra-look", "ra-look-" + key];
    if (isDark(key)) names.push("ra-dark-look");
    if (key === "night") names.push("ra-night");
    names.forEach(function (n) { c.classList[on ? "add" : "remove"](n); });
  }
  function baseCss(o) { addCss(o && o.css !== undefined ? o.css : ROOT + "basemaps.css"); }

  /* The Night dots basemap as a Leaflet layer that costs nothing until it is added: o = { labelsPane, onFail, css, dir, script }. */
  function nightLayer(L, o) {
    o = o || {};
    return new (L.Layer.extend({
      onAdd: function (m) {
        var me = this;
        me._live = true;
        mark(m, "night", true);   /* the dark ground at once, while the dots are on their way */
        baseCss(o);
        loadNightScript(o.script).then(function (ND) {
          if (!me._live) return;
          me._in = ND.create(L, { dir: o.dir || ROOT + "vendor/natural-earth/", labelsPane: o.labelsPane, reduce: still });
          me._in.addTo(m);
        }, function () { if (me._live && o.onFail) o.onFail(failMessage("night", "library"), "library"); });
      },
      onRemove: function (m) {
        this._live = false;
        mark(m, "night", false);
        if (this._in) m.removeLayer(this._in);
        this._in = null;
      },
      bringToBack: function () { if (this._in) this._in.bringToBack(); return this; }
    }))();
  }

  /* Esri's imagery, darkened and tinted navy by a CSS filter on THAT tile layer alone (basemaps.css .ra-imgnight), with Esri's dark place
     names above it from zoom 5, as Night dots has. o = { labelsPane }. */
  function imageryNightLayer(L, o) {
    o = o || {};
    var ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
    return new (L.Layer.extend({
      onAdd: function (m) {
        mark(m, "imagenight", true);
        baseCss(o);
        this._img = L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", { className: "ra-imgnight", attribution: ESRI_IMAGERY, maxNativeZoom: 17, maxZoom: 18 });
        this._names = L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
          { pane: o.labelsPane || "overlayPane", minZoom: 5, maxNativeZoom: 16, maxZoom: 18, className: "ra-nd-names", attribution: ESRI_LABELS });
        this._img.addTo(m); this._names.addTo(m);
        this.bringToBack();
      },
      onRemove: function (m) {
        mark(m, "imagenight", false);
        [this._img, this._names].forEach(function (l) { if (l && m.hasLayer(l)) m.removeLayer(l); });
        this._img = this._names = null;
      },
      bringToBack: function () { if (this._names) this._names.bringToBack(); if (this._img) this._img.bringToBack(); return this; }
    }))();
  }

  /* A vector look: MapLibre drawing one of the styles, as one Leaflet layer, fetched when first added. o = { onFail(message, reason), labelsPane, dir, root, css }.
     It fails over (onFail) when WebGL is missing, the library cannot be loaded, the style cannot be read, or no map piece arrives in 12 seconds. */
  function vectorLayer(L, key, o) {
    o = o || {};
    var look = LOOKS[key];
    return new (L.Layer.extend({
      getAttribution: function () { return look.attribution; },
      onAdd: function (m) {
        var me = this, reduced = still();
        me._live = true; me._failed = false;
        mark(m, key, true);   /* the look's own ground at once, while the library and the first pieces are on their way */
        baseCss(o);
        if (!webglOk()) { me._fail("webgl"); return; }
        loadMaplibre(L, o).then(function () {
          if (!me._live) return;
          var inner = window.L.maplibreGL({ style: styleUrl(key, o.root), fadeDuration: reduced ? 0 : 200, maxZoom: 20, updateInterval: 32 });
          inner.getAttribution = function () { return ""; };   /* the attribution is ours, so it is there before the first piece and for every look */
          me._in = inner;
          inner.addTo(m);
          me._watch(inner.getMaplibreMap());
          /* A page that gives the map a new height after it is built (the Atlas does) never tells Leaflet, and the vector canvas would stop short.
             While this look is on, a resize of the container is passed on to Leaflet, which tells the canvas; if the size is unchanged it does nothing. */
          if (window.ResizeObserver) {
            me._map = m;
            me._ro = new ResizeObserver(function () {
              cancelAnimationFrame(me._raf);
              me._raf = requestAnimationFrame(function () { if (me._live && me._map) me._map.invalidateSize({ animate: false }); });
            });
            me._ro.observe(m.getContainer());
          }
        }, function () { me._fail("library"); });
      },
      onRemove: function (m) {
        this._live = false;
        clearTimeout(this._timer);
        if (this._ro) { this._ro.disconnect(); this._ro = null; cancelAnimationFrame(this._raf); }
        this._map = null;
        mark(m, key, false);
        if (this._in) { try { m.removeLayer(this._in); } catch (e) { /* already gone */ } }
        this._in = null;
      },
      bringToBack: function () {
        var c = this._in && this._in.getContainer && this._in.getContainer();
        if (c && c.parentNode && c.parentNode.firstChild !== c) c.parentNode.insertBefore(c, c.parentNode.firstChild);
        return this;
      },
      /* Watching for a look that is not coming: a style that cannot be read, a map host that does not answer. A single lost piece is not
         a failure (the others draw); none at all in 12 seconds, or four lost and none arrived, is. */
      _watch: function (gl) {
        var me = this, got = 0, lost = 0;
        me._timer = setTimeout(function () { if (!got) me._fail("tiles"); }, 12000);
        gl.on("data", function (e) { if (e.dataType === "source" && e.tile && !got) { got = 1; clearTimeout(me._timer); } });
        gl.on("error", function (e) {
          if (!me._live || got) return;
          var src = e && e.sourceId;
          if (!src) { me._fail("tiles"); return; }               /* the style itself, or its tile index, would not load */
          if (++lost >= 4) me._fail("tiles");
        });
      },
      _fail: function (reason) {
        var me = this;
        if (me._failed || !me._live) return;
        me._failed = true;
        /* A tick later, so a look that fails the instant it is added (no WebGL) calls back after the page has finished building its switcher. */
        setTimeout(function () { if (me._live && o.onFail) o.onFail(failMessage(key, reason), reason); }, 0);
      }
    }))();
  }

  /* Any look that is not one of the three plain tile layers, as a layer: night, imagery at night, or a vector look. */
  function lookLayer(L, key, o) {
    var k = LOOKS[key] && LOOKS[key].kind;
    if (k === "night") return nightLayer(L, o);
    if (k === "imagery") return imageryNightLayer(L, o);
    if (k === "vector") return vectorLayer(L, key, o);
    return null;
  }

  /* ---------- the switcher ---------- */

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* The control, the same on every map: o = { keys, key (the one in use), theme, position, onPick(key), label(key, name) (a translator for the names) }. Returns
     { control, setActive(key), setTheme(theme), note(text) }. Real <button>s with aria-pressed; the note is a polite live region. */
  function switcher(L, o) {
    var keys = o.keys || ATLAS_KEYS, active = o.key, theme = o.theme || themeNow(), open = false, msg = "", el = null;
    function btn(k) {
      var on = k === active;
      return '<button type="button" data-b="' + k + '" title="' + esc(LOOKS[k].title) + '" aria-pressed="' + on + '"' + (on ? ' class="on"' : "") + ">" + esc(typeof o.label === "function" ? o.label(k, LOOKS[k].name) : LOOKS[k].name) + "</button>";
    }
    function render() {
      if (!el) return;
      var focus = el.contains(document.activeElement) ? (document.activeElement.getAttribute("data-b") || (document.activeElement.hasAttribute("data-more") ? "!more" : "")) : "";
      var lay = layout(theme, keys, active, open), h = '<div class="ra-base-row">' + lay.bar.map(btn).join("");
      if (lay.more.length) h += '<button type="button" data-more class="ra-base-morebtn" aria-expanded="' + lay.open + '"' + (lay.forced ? " disabled" : "") + ' title="' + (lay.moreTheme === "dark" ? "Looks made for the dark theme" : "Looks made for the light theme") + '">More looks</button>';
      h += "</div>";
      if (lay.more.length && lay.open) h += '<div class="ra-base-row ra-base-more" role="group" aria-label="Looks for the ' + lay.moreTheme + ' theme"><span class="ra-base-lbl">' + (lay.moreTheme === "dark" ? "Dark" : "Light") + "</span>" + lay.more.map(btn).join("") + "</div>";
      h += '<p class="ra-base-note" role="status"' + (msg ? "" : " hidden") + ">" + esc(msg) + "</p>";
      el.innerHTML = h;
      if (focus) { var f = el.querySelector(focus === "!more" ? "[data-more]" : '[data-b="' + focus + '"]'); if (f) f.focus(); }
    }
    var ctl = L.control({ position: o.position || "topright" });
    ctl.onAdd = function () {
      var b = el = L.DomUtil.create("div", "leaflet-bar ra-base");
      b.setAttribute("role", "group"); b.setAttribute("aria-label", "Basemap");
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.disableScrollPropagation(b);
      L.DomEvent.on(b, "click", function (e) {
        var t = e.target.closest && e.target.closest("button"); if (!t) return;
        L.DomEvent.stop(e);
        if (t.hasAttribute("data-more")) { open = !open; render(); return; }
        var k = t.getAttribute("data-b"); if (!k) return;
        msg = ""; o.onPick(k); render();
      });
      render();
      return b;
    };
    addCss(o.switchCss === undefined ? ROOT + "basemaps-switch.css" : o.switchCss);
    return {
      control: ctl,
      setActive: function (k) { active = k; render(); },
      setTheme: function (t) { theme = t; render(); },
      note: function (text) { msg = text || ""; render(); }
    };
  }

  /* The switcher for a map that has the light grey as its own layers and takes the rest from here (Compass and History), with the same
     rules as the Atlas map: o = { light: [layers drawn for the light map], labelsPane, position, css, onChange(key) }. Returns { key(), set(key) }. */
  function attach(L, map, o) {
    var keys = EMBED_KEYS, built = {}, now = "", explicit = false, sw = null;
    var first = choose({ keys: keys, stored: stored(keys), theme: themeNow() });
    explicit = first.explicit;
    function layerFor(k) {
      if (k === "map") return null;
      if (built[k]) return built[k];
      if (k === "satellite") {
        built[k] = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: ESRI_IMAGERY, maxNativeZoom: 17, maxZoom: 18 });
      } else {
        built[k] = lookLayer(L, k, { labelsPane: o.labelsPane, css: o.css, onFail: function (text) { if (now === k) { show("map"); if (sw) sw.note(text); } } });
      }
      return built[k];
    }
    function show(key) {
      if (key === now) return;
      var before = now; now = key;
      if (before === "map") (o.light || []).forEach(function (l) { map.removeLayer(l); });
      else if (before && built[before]) { map.removeLayer(built[before]); mark(map, before, false); }
      if (key === "map") (o.light || []).forEach(function (l) { l.addTo(map); if (l.bringToBack && l.options && !l.options.pane) l.bringToBack(); });
      else {
        var lay = layerFor(key);
        if (key === "satellite") mark(map, key, true);   /* the pages' own dark-theme tile filters are for the light grey, not for photographs */
        lay.addTo(map); if (lay.bringToBack) lay.bringToBack();
      }
      if (sw) sw.setActive(key);
      if (o.onChange) o.onChange(key);
    }
    sw = switcher(L, { keys: keys, key: first.key, theme: themeNow(), position: o.position, onPick: function (k) { explicit = true; remember(k); show(k); } });
    show(first.key);
    sw.control.addTo(map);
    baseCss(o);
    watchTheme(function (t) { sw.setTheme(t); if (!explicit) show(defaultFor(t)); });
    return { key: function () { return now; }, set: function (k) { if (keys.indexOf(k) >= 0) show(k); } };
  }

  return {
    DEFAULT_BY_THEME: DEFAULT_BY_THEME, ATLAS_KEYS: ATLAS_KEYS, EMBED_KEYS: EMBED_KEYS, VECTOR_KEYS: VECTOR_KEYS, LOOKS: LOOKS, STORE: STORE,
    MAPLIBRE_VERSION: MAPLIBRE_VERSION,
    themeOf: themeOf, themeNow: themeNow, defaultFor: defaultFor, valid: valid, stored: stored, remember: remember, choose: choose, watchTheme: watchTheme,
    isDark: isDark, isVector: isVector, layout: layout, failMessage: failMessage, styleUrl: styleUrl, webglOk: webglOk,
    nightLayer: nightLayer, imageryNightLayer: imageryNightLayer, vectorLayer: vectorLayer, lookLayer: lookLayer, switcher: switcher, attach: attach
  };
});
