/* Which basemap opens, and how: public/js/basemaps.js (pure rules) and how the three maps use it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, "..", f), "utf8");
const BM = (() => { const m = { exports: {} }; new Function("module", read("public/js/basemaps.js"))(m); return m.exports; })();
const atlas = read("src/components/RecordMap.astro");
const compass = read("public/tree-canvas/compass-view.js");
const history = read("public/js/history-theatre.js");

test("the lists: eleven looks on the Atlas map, ten on Compass and History (no Terrain: its tile host is not on Compass's CSP)", () => {
  assert.deepEqual(BM.ATLAS_KEYS, ["map", "smooth", "liberty", "ink", "lightdots", "terrain", "satellite", "night", "smoothdark", "inkdark", "imagenight"]);
  assert.deepEqual(BM.EMBED_KEYS, BM.ATLAS_KEYS.filter((k) => k !== "terrain"));
  assert.deepEqual(Object.keys(BM.LOOKS), BM.ATLAS_KEYS, "every key has a look, in the same order");
  assert.deepEqual(BM.VECTOR_KEYS, ["smooth", "liberty", "ink", "smoothdark", "inkdark"]);
  for (const k of BM.ATLAS_KEYS) {
    const l = BM.LOOKS[k];
    assert.ok(l.name && l.title, k + " has a name and a one-line title");
    assert.ok(["light", "dark", "any"].includes(l.suits), k + " suits a theme");
    assert.ok(["raster", "vector", "night", "imagery"].includes(l.kind), k);
  }
});

test("the looks are grouped by the theme they were made for", () => {
  const by = (s) => BM.ATLAS_KEYS.filter((k) => BM.LOOKS[k].suits === s);
  assert.deepEqual(by("light"), ["map", "smooth", "liberty", "ink", "lightdots"]);
  assert.deepEqual(by("dark"), ["night", "smoothdark", "inkdark", "imagenight"]);
  assert.deepEqual(by("any"), ["terrain", "satellite"]);
  for (const k of ["night", "smoothdark", "inkdark", "imagenight"]) assert.equal(BM.isDark(k), true, k + " is a dark ground");
  for (const k of ["map", "smooth", "liberty", "ink", "lightdots", "terrain", "satellite"]) assert.equal(BM.isDark(k), false, k);
  assert.equal(BM.isDark("constructor"), false);
});

test("the switcher layout: this theme's looks first, then Terrain and Satellite, the other theme's behind More looks", () => {
  const light = BM.layout("light", BM.ATLAS_KEYS, "map", false);
  assert.deepEqual(light.bar, ["map", "smooth", "liberty", "ink", "lightdots", "terrain", "satellite"]);
  assert.deepEqual(light.more, ["night", "smoothdark", "inkdark", "imagenight"]);
  assert.equal(light.open, false); assert.equal(light.moreTheme, "dark");
  const dark = BM.layout("dark", BM.ATLAS_KEYS, "night", false);
  assert.deepEqual(dark.bar, ["night", "smoothdark", "inkdark", "imagenight", "terrain", "satellite"]);
  assert.deepEqual(dark.more, ["map", "smooth", "liberty", "ink", "lightdots"]);
  /* nothing is ever listed twice or left out */
  for (const l of [light, dark]) assert.deepEqual([...l.bar, ...l.more].sort(), [...BM.ATLAS_KEYS].sort());
  /* Compass and History have no Terrain to list */
  assert.deepEqual(BM.layout("light", BM.EMBED_KEYS, "map", false).bar, ["map", "smooth", "liberty", "ink", "lightdots", "satellite"]);
});

test("the fold is open when the reader opened it, and always when the look in use is in it (the pressed button is never hidden)", () => {
  assert.equal(BM.layout("light", BM.ATLAS_KEYS, "map", true).open, true);
  const s = BM.layout("light", BM.ATLAS_KEYS, "smoothdark", false);
  assert.equal(s.open, true); assert.equal(s.forced, true, "a dark look chosen in the light theme keeps working, and shows");
  assert.equal(BM.layout("dark", BM.ATLAS_KEYS, "liberty", false).open, true);
  assert.equal(BM.layout("dark", BM.ATLAS_KEYS, "satellite", false).open, false, "Satellite is in the bar for either theme");
});

test("the default follows the theme, from the ONE constant: dark opens on Night dots, light on the light map", () => {
  assert.deepEqual(BM.DEFAULT_BY_THEME, { light: "map", dark: "night" });
  assert.equal(BM.defaultFor("dark"), "night");
  assert.equal(BM.defaultFor("light"), "map");
  assert.equal(BM.defaultFor(undefined), "map");
  for (const k of Object.values(BM.DEFAULT_BY_THEME)) assert.ok(BM.ATLAS_KEYS.includes(k));
  assert.equal(BM.LOOKS[BM.DEFAULT_BY_THEME.light].suits, "light"); assert.equal(BM.LOOKS[BM.DEFAULT_BY_THEME.dark].suits, "dark");
  /* any look can be made the default by changing the one constant: every one is a valid default */
  for (const k of BM.ATLAS_KEYS) assert.equal(BM.choose({ keys: BM.ATLAS_KEYS, url: null, stored: "", theme: "dark" }).explicit, false, k);
});

test("dark is read the way the whole site reads it: data-theme wins, else the device", () => {
  assert.equal(BM.themeOf("dark", false), "dark");
  assert.equal(BM.themeOf("light", true), "light", "a reader who chose light on a dark device gets light");
  assert.equal(BM.themeOf(null, true), "dark");
  assert.equal(BM.themeOf(null, false), "light");
  assert.equal(BM.themeOf("", true), "dark");
  assert.equal(BM.themeOf("sepia", true), "dark", "an unknown value is no choice: the device decides");
  /* the same rule as theme.js and Compass's own isDark */
  assert.match(compass, /t === 'dark' \|\| \(!t && window\.matchMedia/);
  assert.match(read("public/js/theme.js"), /t \|\| \(mq && mq\.matches \? "dark" : "light"\)/);
});

test("a reader's own choice always wins: the address bar, then the saved choice, then the theme", () => {
  const K = BM.ATLAS_KEYS;
  assert.deepEqual(BM.choose({ keys: K, url: "terrain", stored: "night", theme: "dark" }), { key: "terrain", explicit: true, from: "url" });
  assert.deepEqual(BM.choose({ keys: K, url: "", stored: "map", theme: "dark" }), { key: "map", explicit: true, from: "saved" });
  /* the new keys are choices like any other, and a look made for the other theme is kept when the theme is toggled */
  assert.deepEqual(BM.choose({ keys: K, url: "", stored: "smoothdark", theme: "light" }), { key: "smoothdark", explicit: true, from: "saved" });
  assert.deepEqual(BM.choose({ keys: K, url: "", stored: "liberty", theme: "dark" }), { key: "liberty", explicit: true, from: "saved" });
  assert.deepEqual(BM.choose({ keys: K, url: "imagenight", stored: "ink", theme: "light" }), { key: "imagenight", explicit: true, from: "url" });
  for (const k of K) assert.equal(BM.choose({ keys: K, url: k, stored: "", theme: "light" }).key, k, k + " can be asked for");
  assert.deepEqual(BM.choose({ keys: K, url: null, stored: "", theme: "dark" }), { key: "night", explicit: false, from: "theme" });
  assert.deepEqual(BM.choose({ keys: K, url: null, stored: "", theme: "light" }), { key: "map", explicit: false, from: "theme" });
  assert.equal(BM.choose({ keys: K, url: "map", stored: "", theme: "dark" }).key, "map", "?base=map in dark theme is the light map");
});

test("unknown values are no choice at all, so they fall back to the theme's default", () => {
  for (const bad of [null, undefined, "", "Night", "night ", "dark", "constructor", "__proto__", "toString", 3, ["night"]]) {
    assert.equal(BM.valid(bad, BM.ATLAS_KEYS), "", String(bad));
    assert.deepEqual(BM.choose({ keys: BM.ATLAS_KEYS, url: bad, stored: bad, theme: "dark" }), { key: "night", explicit: false, from: "theme" });
  }
  /* Compass and History have no Terrain: a saved "terrain" from the Atlas map is not one of theirs, and the theme decides */
  assert.deepEqual(BM.choose({ keys: BM.EMBED_KEYS, stored: "terrain", theme: "light" }), { key: "map", explicit: false, from: "theme" });
  assert.deepEqual(BM.choose({ keys: BM.EMBED_KEYS, stored: "smooth", theme: "dark" }), { key: "smooth", explicit: true, from: "saved" });
});

test("the saved choice is read and written through the key list, and a blocked store is survivable", () => {
  const mem = {}; globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  try {
    assert.equal(BM.stored(), "");
    BM.remember("terrain"); assert.equal(BM.stored(), "terrain");
    mem[BM.STORE] = "bogus"; assert.equal(BM.stored(), "");
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    assert.equal(BM.stored(), ""); BM.remember("night");
  } finally { delete globalThis.localStorage; }
});

test("the Atlas map decides before it builds, follows the theme only while nobody has chosen, and remembers a choice", () => {
  assert.match(atlas, /BM\.choose\(\{ keys: BM\.ATLAS_KEYS, url: Q\.get\("base"\), stored: BM\.stored\(BM\.ATLAS_KEYS\), theme: BM\.themeNow\(\) \}\)/);
  assert.ok(atlas.indexOf("var pick = BM.choose") < atlas.indexOf("BASES[baseNow].addTo(map)"), "settled before the first layer is added");
  assert.match(atlas, /BM\.watchTheme\(function \(t\) \{ baseSw\.setTheme\(t\); if \(!baseExplicit\) setBase\(BM\.defaultFor\(t\), false\); \}\)/);
  assert.match(atlas, /if \(explicit\) \{ baseExplicit = true; BM\.remember\(k\); setQ\("base", k\); \}/);
  assert.match(atlas, /src=\{base\.replace\(\/\\\/\$\/, ""\) \+ "\/js\/basemaps\.js"\}/, "loaded before the inline script, so the answer is known at first paint");
  assert.doesNotMatch(atlas, /BASEMAPS\./, "no second copy of the default");
});

test("the Atlas map uses the one shared switcher, and builds every look lazily from the one list", () => {
  assert.match(atlas, /BM\.switcher\(L, \{ keys: BM\.ATLAS_KEYS, key: baseNow/);
  assert.match(atlas, /BM\.ATLAS_KEYS\.forEach\(function \(k\) \{\s*if \(BASES\[k\]\) return;\s*BASES\[k\] = BM\.lookLayer\(L, k,/);
  assert.match(atlas, /onFail: function \(text\) \{ if \(baseNow === k\) \{ setBase\("map", false\); baseSw\.note\(text\); \} \}/, "a look that fails shows the standard Map and says why, without changing the saved choice");
  assert.match(atlas, /href=\{base \+ "basemaps-switch\.css"\}/, "the switcher is styled before the first paint");
  assert.doesNotMatch(atlas, /<a href="#" role="button" data-b=/, "no second copy of the switcher");
  assert.match(BM.switcher.toString(), /<button type="button" data-b=/);
  assert.match(BM.switcher.toString(), /aria-pressed/);
  assert.match(BM.switcher.toString(), /role="status"/);
  assert.match(BM.switcher.toString(), /aria-expanded/);
});

/* A tiny Leaflet and DOM, just enough to drive the switcher and the failure path without a browser. */
function fakeEnv() {
  const classes = new Set(), added = [], handlers = {};
  const el = { innerHTML: "", setAttribute() {}, contains: () => false, querySelector: () => null };
  const L = {
    Layer: { extend(proto) { function C(o) { this.options = o || {}; } Object.assign(C.prototype, proto); return C; } },
    control(o) { const c = { onAdd: null, addTo(m) { c.map = m; return c; } }; return c; },
    DomUtil: { create: () => el },
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {}, on(e, t, f) { handlers[t] = f; }, stop() {} }
  };
  const map = { getContainer: () => ({ classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n) } }), removeLayer() {}, addLayer() {} };
  return { L, el, classes, map, added, handlers };
}
function press(env, attrs) {
  const btn = { hasAttribute: (n) => n in attrs, getAttribute: (n) => attrs[n], closest: () => btn };
  env.handlers.click({ target: btn });
}

test("the switcher draws real buttons: the theme's looks, Terrain and Satellite, and a More looks fold with the others", () => {
  globalThis.document = { querySelectorAll: () => [], createElement: () => ({ setAttribute() {} }), head: { appendChild() {} }, activeElement: null };
  try {
    const env = fakeEnv(), picked = [];
    const sw = BM.switcher(env.L, { keys: BM.ATLAS_KEYS, key: "map", theme: "light", onPick: (k) => picked.push(k) });
    sw.control.onAdd();
    let h = env.el.innerHTML;
    for (const k of ["map", "smooth", "liberty", "ink", "terrain", "satellite"]) assert.match(h, new RegExp('<button type="button" data-b="' + k + '"'));
    assert.match(h, /data-b="map"[^>]*aria-pressed="true" class="on"/);
    assert.match(h, /data-b="smooth"[^>]*aria-pressed="false"/);
    for (const k of ["night", "smoothdark", "inkdark", "imagenight"]) assert.doesNotMatch(h, new RegExp('data-b="' + k + '"'), k + " is folded away in the light theme");
    assert.match(h, /data-more[^>]*aria-expanded="false"[^>]*>More looks</);
    assert.doesNotMatch(h, /<a /, "no links pretending to be buttons");
    /* picking a look reports it; the More looks button opens the fold */
    press(env, { "data-b": "liberty" }); assert.deepEqual(picked, ["liberty"]);
    press(env, { "data-more": "" });
    h = env.el.innerHTML;
    for (const k of ["night", "smoothdark", "inkdark", "imagenight"]) assert.match(h, new RegExp('data-b="' + k + '"'), k + " shows once the fold is open");
    assert.match(h, /aria-label="Looks for the dark theme"/);
    assert.match(h, /aria-expanded="true"/);
    /* the theme toggled: the dark looks come first, with the light ones folded */
    sw.setTheme("dark");
    h = env.el.innerHTML;
    assert.ok(h.indexOf('data-b="night"') < h.indexOf('data-b="terrain"'), "dark looks lead in the dark theme");
    /* a look in the fold shows even with the fold closed by the reader */
    sw.setActive("smoothdark");
    assert.match(env.el.innerHTML, /data-b="smoothdark"[^>]*aria-pressed="true"/);
    /* the note is a polite status, shown only when there is one */
    assert.match(env.el.innerHTML, /role="status" hidden/);
    sw.note("Smooth could not get its map pieces just now.");
    assert.match(env.el.innerHTML, /role="status">Smooth could not get/);
    sw.note("");
    assert.match(env.el.innerHTML, /role="status" hidden/);
    /* picking clears an old note */
    sw.note("old"); press(env, { "data-b": "map" }); assert.doesNotMatch(env.el.innerHTML, /role="status">old/);
  } finally { delete globalThis.document; }
});

test("failure handling: no WebGL means the standard Map and a plain sentence, at once and without touching the saved choice", async () => {
  const doc = { querySelectorAll: () => [], createElement: () => ({ getContext: () => null, setAttribute() {} }), head: { appendChild() {} } };
  globalThis.document = doc;
  const mem = {}; globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  try {
    BM.remember("liberty");
    const env = fakeEnv(); let said = null, reason = null;
    const layer = BM.lookLayer(env.L, "liberty", { onFail: (t, r) => { said = t; reason = r; } });
    layer.onAdd(env.map);
    assert.ok(env.classes.has("ra-look") && env.classes.has("ra-look-liberty"), "the look's own ground and the filter reset are on at once");
    assert.equal(said, null, "the callback waits a tick, so a page can finish building its switcher");
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(reason, "webgl");
    assert.match(said, /^Liberty needs WebGL, which this device does not have, so you are looking at the standard Map instead\.$/);
    assert.equal(BM.stored(), "liberty", "the choice is not erased by a device that cannot draw it");
    layer.onRemove(env.map);
    assert.equal(env.classes.size, 0, "everything it put on the container is taken off");
    assert.equal(BM.webglOk(), false);
    doc.createElement = () => ({ getContext: (t) => (t === "webgl" ? {} : null), setAttribute() {} });
    assert.equal(BM.webglOk(), false, "WebGL 1 alone is not enough for MapLibre 5");
    doc.createElement = () => ({ getContext: (t) => (t === "webgl2" ? {} : null), setAttribute() {} });
    assert.equal(BM.webglOk(), true);
  } finally { delete globalThis.document; delete globalThis.localStorage; }
});

test("a vector look fails over when its style, its tile index or its tiles do not arrive, and not for a lost font or one lost piece", async () => {
  const handlers = {};
  const gl = { on(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); } };
  const emit = (ev, e) => (handlers[ev] || []).forEach((f) => f(e));
  const inner = { addTo() {}, getMaplibreMap: () => gl, getContainer: () => null, getAttribution: null };
  globalThis.window = { maplibregl: {}, L: { maplibreGL: () => inner }, matchMedia: () => ({ matches: false }) };
  globalThis.document = { querySelectorAll: () => [], createElement: () => ({ getContext: (t) => (t === "webgl2" ? {} : null), setAttribute() {} }), head: { appendChild() {} } };
  try {
    const run = async (events) => {
      for (const k of Object.keys(handlers)) delete handlers[k];
      const env = fakeEnv(); let failed = null;
      const layer = BM.lookLayer(env.L, "smooth", { onFail: (t, r) => { failed = r; } });
      layer.onAdd(env.map);
      await new Promise((r) => setTimeout(r, 5));        /* the library promise resolves, the inner map is built and watched */
      events(); await new Promise((r) => setTimeout(r, 5));
      layer.onRemove(env.map);
      return failed;
    };
    assert.equal(await run(() => emit("error", { error: new Error("style 404") })), "tiles", "the style file would not load");
    /* MapLibre throwing as it starts (a context it cannot get) is a WebGL failure, not a blank map */
    const was = inner.addTo; inner.addTo = () => { throw new Error("Failed to initialize WebGL"); };
    try { assert.equal(await run(() => {}), "webgl"); } finally { inner.addTo = was; }
    assert.equal(await run(() => { emit("styledata", {}); emit("error", { sourceId: "openmaptiles" }); }), "tiles", "the tile index would not load");
    assert.equal(await run(() => { emit("styledata", {}); for (let i = 0; i < 3; i++) emit("error", { sourceId: "openmaptiles", tile: {} }); }), null, "three lost pieces are not yet a failure");
    assert.equal(await run(() => { emit("styledata", {}); for (let i = 0; i < 4; i++) emit("error", { sourceId: "openmaptiles", tile: {} }); }), "tiles", "four lost and none arrived is");
    assert.equal(await run(() => { emit("styledata", {}); emit("data", { dataType: "source", tile: {} }); for (let i = 0; i < 9; i++) emit("error", { sourceId: "openmaptiles", tile: {} }); }), null, "once pieces are arriving, a few lost ones are only gaps");
    assert.equal(await run(() => { emit("styledata", {}); emit("error", { error: new Error("glyph range") }); }), null, "a lost label font costs the labels, not the map");
  } finally { delete globalThis.window; delete globalThis.document; }
});

test("the failure sentences are short, plain and name the look and the fallback", () => {
  for (const k of BM.VECTOR_KEYS) for (const r of ["webgl", "tiles", "library"]) {
    const t = BM.failMessage(k, r);
    assert.ok(t.startsWith(BM.LOOKS[k].name), t);
    assert.match(t, /standard Map/); assert.ok(t.length < 140, t.length + " characters");
    assert.match(t, /\.$/);
  }
  assert.match(BM.failMessage("night", "library"), /^Night dots /);
  assert.match(BM.failMessage("webgl-less", "tiles"), /^That look /);
});

test("a look's style comes from our own folder, except Liberty, which is OpenFreeMap's own URL", () => {
  assert.equal(BM.styleUrl("smooth", "/TheMap/"), "/TheMap/basemap-styles/smooth.json");
  assert.equal(BM.styleUrl("inkdark", "/"), "/basemap-styles/ink-dark.json");
  assert.equal(BM.styleUrl("liberty", "/"), "https://tiles.openfreemap.org/styles/liberty");
  assert.equal(BM.styleUrl("map", "/"), "");
  assert.equal(BM.styleUrl("constructor", "/"), "");
});

test("Compass and History use the same switcher and the same layer code, not a copy of night-dots.js", () => {
  assert.match(compass, /window\.raBasemaps\.attach\(L, map, \{ light, labelsPane: 'cpLabels' \}\)/);
  assert.match(compass, /s\.src = '\/js\/basemaps\.js'/);
  assert.match(history, /window\.raBasemaps\.attach\(L, map, \{ light: light, labelsPane: "baseLabels" \}\)/);
  assert.match(read("src/pages/history.astro"), /js\/basemaps\.js/);
  for (const f of [compass, history]) assert.doesNotMatch(f, /World_Dark_Gray|natural-earth|raNightDots/, "the dark layer code lives only in night-dots.js");
});

test("under Compass's CSP the Night dots files are all allowed: same-origin script, stylesheet and fetch, the Esri host for tiles, nothing inline", () => {
  const csp = read("src/pages/tree-canvas/index.astro").match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self'/); assert.match(csp, /style-src 'self'/);
  assert.match(csp, /connect-src 'self'/); assert.match(csp, /img-src [^;]*https:\/\/server\.arcgisonline\.com/);
  /* The vector looks add nothing to the policy: the style files are same-origin fetches, the tile host is reached by fetch (connect-src already
     allows https:), the label fonts and sprite are fetches too, and MapLibre's CSP build runs in a same-origin worker (worker-src 'self'), not a blob:. */
  assert.match(csp, /connect-src [^;]*\bhttps:/, "tiles.openfreemap.org is a fetch, which connect-src's https: allows");
  assert.match(csp, /worker-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /worker-src[^;]*blob:/, "no blob: worker is allowed");
  assert.doesNotMatch(csp, /openfreemap|'unsafe-inline'|'unsafe-eval'/, "nothing loosened, nothing inline");
  assert.match(read("public/js/basemaps.js"), /maplibre-gl-csp\.js/); assert.match(read("public/js/basemaps.js"), /setWorkerUrl\(absolute\(dir \+ "maplibre-gl-csp-worker\.js"\)\)/);
  assert.doesNotMatch(read("public/js/basemaps.js"), /(?<![-\w])maplibre-gl\.js["']/, "never the ordinary build, which starts a blob: worker");
  const files = ["public/js/basemaps.js", "public/js/night-dots.js"].map(read).join("\n");
  for (const f of ["public/vendor/maplibre/maplibre-gl-csp.js", "public/vendor/maplibre/maplibre-gl-csp-worker.js", "public/vendor/maplibre/leaflet-maplibre-gl.js", "public/vendor/maplibre/maplibre-gl.css",
    "public/vendor/maplibre/LICENSE-maplibre-gl.txt", "public/vendor/maplibre/LICENSE-maplibre-gl-leaflet.txt", "public/vendor/maplibre/NOTICE.txt"]) assert.ok(fs.existsSync(path.join(here, "..", f)), f);
  assert.doesNotMatch(files, /\.innerHTML\s*=[^;]*style=|<style|setAttribute\(["']style/, "no inline style");
  assert.doesNotMatch(files, /\beval\(|new Function\(/);
  for (const f of ["public/basemaps.css", "public/basemaps-switch.css", "public/vendor/natural-earth/land-110m.json", "public/vendor/natural-earth/land-50m.json"]) assert.ok(fs.existsSync(path.join(here, "..", f)), f);
});

test("a look other than the light map is not run through the pages' own dark-theme tile filters", () => {
  const css = read("public/basemaps.css");
  assert.match(css, /\.leaflet-container\.ra-look \.leaflet-tile-pane[\s\S]*filter: none !important/);
  for (const k of ["smooth", "liberty", "ink", "smoothdark", "inkdark", "imagenight", "satellite"]) assert.match(css, new RegExp("\\.leaflet-container\\.ra-look-" + k + " \\{ background: "), k + " has its own ground");
  assert.match(css, /\.ra-imgnight \{ filter: /, "the night tint is on the imagery tile layer alone");
  assert.doesNotMatch(css, /\.leaflet-marker|\.leaflet-overlay-pane \{[^}]*filter|\.leaflet-container \{[^}]*filter/, "never on the markers or the whole map");
  assert.match(css, /\.leaflet-container\.ra-night \.leaflet-tile-pane|ra-look \.leaflet-tile-pane/);
  assert.match(css, /\.leaflet-cpLabels-pane|leaflet-cpLabels-pane/);
  assert.match(css, /\.leaflet-baseLabels-pane/);
});

test("the default load carries none of Night dots or MapLibre: no script tag for either, no land file or library named outside basemaps.js", () => {
  assert.doesNotMatch(atlas, /<script[^>]*night-dots\.js/);
  assert.doesNotMatch(atlas, /land-(110|50)m/);
  for (const f of [atlas, compass, history, read("src/pages/history.astro"), read("src/pages/tree-canvas/index.astro")]) assert.doesNotMatch(f, /vendor\/maplibre|maplibre-gl/i, "MapLibre's files are named only in basemaps.js, which fetches them on first use");
  assert.match(read("public/js/basemaps.js"), /function loadMaplibre/);
  assert.doesNotMatch(read("public/js/basemaps.js").split("function loadMaplibre")[0].split("var glLoading")[0], /loadScript\(dir/, "nothing fetched at load time");
});

test("every vector look is created only when first shown, and MapLibre is pinned to one exact version", () => {
  assert.equal(BM.MAPLIBRE_VERSION, "5.24.1");
  assert.match(read("public/vendor/maplibre/NOTICE.txt"), /MapLibre GL JS 5\.24\.1/);
  assert.match(read("public/vendor/maplibre/maplibre-gl-csp.js"), /v5\.24\.1/);
  assert.match(read("public/vendor/maplibre/NOTICE.txt"), /maplibre-gl-leaflet 0\.1\.4/);
  /* addTo is what starts the download: building a layer must not */
  const env = fakeEnv();
  globalThis.document = { querySelectorAll: () => [], createElement: () => { throw new Error("built a layer touched the DOM"); }, head: { appendChild() { throw new Error("fetched at build"); } } };
  try { for (const k of ["smooth", "liberty", "ink", "smoothdark", "inkdark", "night", "imagenight"]) assert.ok(BM.lookLayer(env.L, k, {}), k); } finally { delete globalThis.document; }
});

test("History and Compass offer the same looks as the Atlas map, from the one list", () => {
  assert.match(BM.attach.toString(), /keys = EMBED_KEYS/);
  assert.match(BM.attach.toString(), /switcher\(L, \{ keys: keys/);
  assert.match(BM.attach.toString(), /lookLayer\(L, k,/);
  assert.match(BM.attach.toString(), /sw\.note\(text\)/, "a failed look says so in the switcher");
});
