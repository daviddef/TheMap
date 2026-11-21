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

test("the lists: four on the Atlas map, Map and Night dots on Compass and History, Night dots last", () => {
  assert.deepEqual(BM.ATLAS_KEYS, ["map", "terrain", "satellite", "night"]);
  assert.deepEqual(BM.PAIR_KEYS, ["map", "night"]);
});

test("the default follows the theme, from the ONE constant: dark opens on Night dots, light on the light map", () => {
  assert.deepEqual(BM.DEFAULT_BY_THEME, { light: "map", dark: "night" });
  assert.equal(BM.defaultFor("dark"), "night");
  assert.equal(BM.defaultFor("light"), "map");
  assert.equal(BM.defaultFor(undefined), "map");
  for (const k of Object.values(BM.DEFAULT_BY_THEME)) assert.ok(BM.ATLAS_KEYS.includes(k));
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
  assert.deepEqual(BM.choose({ keys: K, url: null, stored: "", theme: "dark" }), { key: "night", explicit: false, from: "theme" });
  assert.deepEqual(BM.choose({ keys: K, url: null, stored: "", theme: "light" }), { key: "map", explicit: false, from: "theme" });
  assert.equal(BM.choose({ keys: K, url: "map", stored: "", theme: "dark" }).key, "map", "?base=map in dark theme is the light map");
});

test("unknown values are no choice at all, so they fall back to the theme's default", () => {
  for (const bad of [null, undefined, "", "Night", "night ", "dark", "constructor", "__proto__", "toString", 3, ["night"]]) {
    assert.equal(BM.valid(bad, BM.ATLAS_KEYS), "", String(bad));
    assert.deepEqual(BM.choose({ keys: BM.ATLAS_KEYS, url: bad, stored: bad, theme: "dark" }), { key: "night", explicit: false, from: "theme" });
  }
  /* Compass and History offer two: a saved "satellite" from the Atlas map is not one of theirs */
  assert.deepEqual(BM.choose({ keys: BM.PAIR_KEYS, stored: "satellite", theme: "light" }), { key: "map", explicit: false, from: "theme" });
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
  assert.match(atlas, /BM\.watchTheme\(function \(t\) \{ if \(!baseExplicit\) setBase\(BM\.defaultFor\(t\), false\); \}\)/);
  assert.match(atlas, /if \(explicit\) \{ baseExplicit = true; BM\.remember\(k\); setQ\("base", k\); \}/);
  assert.match(atlas, /src=\{base\.replace\(\/\\\/\$\/, ""\) \+ "\/js\/basemaps\.js"\}/, "loaded before the inline script, so the answer is known at first paint");
  assert.doesNotMatch(atlas, /BASEMAPS\./, "no second copy of the default");
});

test("the switcher: four buttons from the list, one-line title, name, pressed state, Enter and Space", () => {
  assert.match(atlas, /BM\.ATLAS_KEYS\.map\(function \(k\)/);
  assert.match(atlas, /night: "Night dots: a quiet dark map so the colours stand out"/);
  assert.match(atlas, /role="button" data-b=/);
  assert.match(atlas, /aria-pressed/);
  assert.match(atlas, /e\.key !== " "/, "Space presses a link that says it is a button");
  assert.match(BM.attach.toString(), /Night dots: a quiet dark map so the colours stand out/, "the same sentence on Compass and History");
  assert.match(BM.attach.toString(), /role="button"/);
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
  const files = ["public/js/basemaps.js", "public/js/night-dots.js"].map(read).join("\n");
  assert.doesNotMatch(files, /\.innerHTML\s*=[^;]*style=|<style|setAttribute\(["']style/, "no inline style");
  assert.doesNotMatch(files, /\beval\(|new Function\(/);
  for (const f of ["public/basemaps.css", "public/basemaps-switch.css", "public/vendor/natural-earth/land-110m.json", "public/vendor/natural-earth/land-50m.json"]) assert.ok(fs.existsSync(path.join(here, "..", f)), f);
});

test("a night map is not run through the pages' own dark-theme tile filters", () => {
  const css = read("public/basemaps.css");
  assert.match(css, /\.leaflet-container\.ra-night \.leaflet-tile-pane[\s\S]*filter: none !important/);
  assert.match(css, /\.leaflet-cpLabels-pane|leaflet-cpLabels-pane/);
  assert.match(css, /\.leaflet-baseLabels-pane/);
});

test("the default load carries none of Night dots: no script tag for it, no land file named outside it", () => {
  assert.doesNotMatch(atlas, /<script[^>]*night-dots\.js/);
  assert.doesNotMatch(atlas, /land-(110|50)m/);
});
