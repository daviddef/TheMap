/* The vector basemap looks: public/basemap-styles/*.json (drawn by scripts/build-basemap-styles.py). Valid MapLibre style JSON, over the one free
   tile host, carrying its attribution, with labels that can be read. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "public", "basemap-styles");
const BM = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "..", "public/js/basemaps.js"), "utf8"))(m); return m.exports; })();
const KEYS = { smooth: "smooth", smoothdark: "smooth-dark", ink: "ink", inkdark: "ink-dark" };
const style = (file) => JSON.parse(fs.readFileSync(path.join(dir, file + ".json"), "utf8"));

/* The hosts a basemap style may name: the free OpenFreeMap tile host, and nothing else. */
const ALLOWED = ["tiles.openfreemap.org"];
function hosts(obj) {
  const out = new Set();
  JSON.stringify(obj, (k, v) => { if (typeof v === "string") for (const m of v.matchAll(/https?:\/\/([^/"'\s<>]+)/g)) out.add(m[1]); return v; });
  return [...out];
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const layer = (s, id) => s.layers.find((l) => l.id === id);

test("every vector look has a style file, and every file is one a look names", () => {
  for (const [k, f] of Object.entries(KEYS)) {
    assert.ok(fs.existsSync(path.join(dir, f + ".json")), f);
    assert.equal(BM.LOOKS[k].style, "basemap-styles/" + f + ".json");
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), Object.values(KEYS).map((f) => f + ".json").sort());
  assert.equal(BM.LOOKS.liberty.style, "https://tiles.openfreemap.org/styles/liberty", "Liberty is OpenFreeMap's own, by URL, with nothing of ours to ship");
});

test("each style is valid MapLibre style JSON: version 8, glyphs, one vector source, layers that point at real sources, unique ids", () => {
  for (const f of Object.values(KEYS)) {
    const s = style(f);
    assert.equal(s.version, 8, f);
    assert.match(s.glyphs, /\{fontstack\}\/\{range\}\.pbf$/, f);
    assert.deepEqual(Object.keys(s.sources), ["openmaptiles"], f);
    assert.equal(s.sources.openmaptiles.type, "vector");
    assert.ok(s.layers.length > 20 && s.layers.length < 80, f + " " + s.layers.length + " layers");
    const ids = s.layers.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, f + ": layer ids are unique");
    assert.equal(s.layers[0].type, "background", f + ": the background is first");
    for (const l of s.layers) {
      assert.ok(["background", "fill", "line", "symbol"].includes(l.type), f + " " + l.id + " " + l.type);
      if (l.type !== "background") { assert.equal(l.source, "openmaptiles", l.id); assert.ok(l["source-layer"], f + " " + l.id + " has a source-layer"); }
      if (l.type === "symbol") { assert.ok(l.layout["text-field"] && l.layout["text-font"], l.id); assert.ok(l.paint["text-color"], l.id); }
    }
    /* the fonts named are ones OpenFreeMap serves */
    const fonts = new Set(); for (const l of s.layers) for (const x of (l.layout && l.layout["text-font"]) || []) fonts.add(x);
    for (const x of fonts) assert.ok(["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"].includes(x), f + " font " + x);
    assert.ok(!/\bundefined\b|NaN/.test(JSON.stringify(s)), f);
  }
});

test("each style names only the OpenFreeMap host: no key, no account, no Stadia, no Stamen", () => {
  for (const f of Object.values(KEYS)) {
    const s = style(f), raw = fs.readFileSync(path.join(dir, f + ".json"), "utf8");
    /* hosts in the style itself, not in the attribution's credit links */
    const bare = { ...s, sources: { openmaptiles: { type: "vector", url: s.sources.openmaptiles.url } }, metadata: undefined };
    assert.deepEqual(hosts(bare), ALLOWED, f);
    assert.equal(s.sources.openmaptiles.url, "https://tiles.openfreemap.org/planet", "the TileJSON, which names the current dated tile set (a pinned date would stop working)");
    assert.doesNotMatch(raw, /stadia|stamen|maptiler|mapbox|api_key|apikey|access_token|\?key=/i, f);
    assert.match(s.glyphs, /^https:\/\/tiles\.openfreemap\.org\/fonts\//);
    assert.ok(!("sprite" in s), f + " needs no sprite, so there is nothing more to fetch");
  }
  /* what basemaps.js itself reaches for: the Esri tile host, OpenFreeMap, and our own files */
  const js = fs.readFileSync(path.join(here, "..", "public/js/basemaps.js"), "utf8");
  const named = new Set([...js.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]));
  for (const h of named) assert.ok(["server.arcgisonline.com", "tiles.openfreemap.org", "openfreemap.org", "www.openmaptiles.org", "www.openstreetmap.org"].includes(h), "basemaps.js names " + h);
});

test("each style carries its attribution: OpenFreeMap, OpenMapTiles, OpenStreetMap, as OpenFreeMap asks, and the look shows it in the map's attribution control", () => {
  for (const f of Object.values(KEYS)) {
    const s = style(f);
    for (const a of [s.sources.openmaptiles.attribution, s.metadata["ra:attribution"]]) {
      assert.match(a, /OpenFreeMap/); assert.match(a, /OpenMapTiles/); assert.match(a, /OpenStreetMap/);
      assert.match(a, /href="https:\/\/openfreemap\.org"/); assert.match(a, /href="https:\/\/www\.openmaptiles\.org\/"/); assert.match(a, /href="https:\/\/www\.openstreetmap\.org\/copyright"/);
      assert.doesNotMatch(a, /<script|onerror|javascript:/i);
    }
  }
  /* the attribution control gets the text from the look, so it is there for every look and from the first frame */
  for (const k of BM.VECTOR_KEYS) { const a = BM.LOOKS[k].attribution; assert.match(a, /OpenFreeMap/); assert.match(a, /OpenMapTiles/); assert.match(a, /OpenStreetMap/); }
  const src = fs.readFileSync(path.join(here, "..", "public/js/basemaps.js"), "utf8");
  assert.match(src, /getAttribution: function \(\) \{ return look\.attribution; \}/);
  assert.match(src, /imageryNightLayer[\s\S]*attribution: ESRI_IMAGERY[\s\S]*attribution: ESRI_LABELS/, "imagery at night credits Esri for the photographs and for the names");
  assert.match(fs.readFileSync(path.join(here, "..", "public/js/night-dots.js"), "utf8"), /Natural Earth[^"]*Esri[^"]*OpenStreetMap/);
});

test("country borders are drawn clearly on every look, and the borders of a country's parts quietly", () => {
  for (const f of Object.values(KEYS)) {
    const s = style(f), b2 = layer(s, "boundary-2"), b4 = layer(s, "boundary-4");
    assert.ok(b2 && b4, f);
    assert.equal(b2.minzoom, undefined, f + ": country borders show from the first zoom");
    const widths = (l) => l.paint["line-width"].slice(3).filter((_, i) => i % 2 === 1); /* [zoom, width, zoom, width ...] -> the widths */
    const w2 = widths(b2), w4 = widths(b4);
    assert.ok(w2[1] >= 1 && w2[w2.length - 1] >= 2, f + " country widths " + w2);
    assert.ok(b4.paint["line-dasharray"], f + ": first-level borders are dashed");
    assert.ok(w4[w4.length - 1] < w2[w2.length - 1], f + ": quieter than the country line");
  }
});

test("labels can be read: every label colour is at least 4.5:1 against its own ground (country, city, town, village, water, road)", () => {
  for (const f of Object.values(KEYS)) {
    const s = style(f), bg = layer(s, "background").paint["background-color"], water = layer(s, "water").paint["fill-color"];
    for (const l of s.layers.filter((x) => x.type === "symbol")) {
      const ground = /^water-name/.test(l.id) ? water : bg;
      const c = contrast(l.paint["text-color"], ground);
      assert.ok(c >= 4.5, `${f} ${l.id}: ${l.paint["text-color"]} on ${ground} is ${c.toFixed(2)}:1`);
    }
  }
});

test("Smooth dark is visibly lighter than Esri's dark grey and than Night dots, and its map reads as blue-grey, not black", () => {
  const sd = style("smooth-dark"), land = layer(sd, "background").paint["background-color"], water = layer(sd, "water").paint["fill-color"];
  /* Measured from Esri's World_Dark_Gray_Base tiles (22 Nov 2026, the commonest pixels): land rgb(64,64,64) = #404040, water rgb(36,36,40) = #242428.
     Night dots' ground is #121b22. David found the dark map too dark, so Smooth dark's land must be clearly brighter than Esri's. */
  assert.ok(lum(land) >= lum("#404040") * 1.6, "land " + land + " is " + (lum(land) / lum("#404040")).toFixed(2) + "x Esri's land");
  assert.ok(lum(water) >= lum("#242428") * 2, "water " + water + " is well above Esri's water");
  assert.ok(lum(land) > lum("#121b22") * 6);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(land.slice(i, i + 2), 16));
  assert.ok(b > r + 8 && b >= g, "the land is blue-grey (" + land + ")");
  assert.ok(lum(water) < lum(land), "water is a step darker than land, as on a good dark map");
  assert.ok(lum(land) < 0.14, "still a dark map: " + lum(land).toFixed(3));
});

test("the dots and fills of the Atlas read on the quiet grounds: the teal, orange and white halo stay at 3:1 against every ground", () => {
  /* the colours the data wears: teal (#6FB6C6, also the cluster ink on dark), a white halo, the orange of 'someone is looking' */
  const grounds = { smooth: "#e9edf2", smoothdark: "#4a5567", inkdark: "#0a0a0a", ink: "#ffffff" };
  for (const k of ["smoothdark", "inkdark"]) {
    assert.ok(contrast("#ffffff", grounds[k]) >= 3, k + " white halo");
    assert.ok(contrast("#6FB6C6", grounds[k]) >= 3, k + " cluster ink");
  }
  /* the price of a lighter dark: the grey of a 'nobody has looked' marker has less contrast than on Night dots (night-dots.test.js asks 3:1 there). Its rim is
     dark and the white halo carries the edge, so it is required to stay at 2:1 and the PR says so. */
  assert.ok(contrast("#8A8E86", grounds.smoothdark) >= 2, "the grey 'nobody has looked' fill on Smooth dark: " + contrast("#8A8E86", grounds.smoothdark).toFixed(2));
});

test("each look's ground colour in basemaps.js is its style's own background (so there is no flash of another colour)", () => {
  for (const [k, f] of Object.entries(KEYS)) assert.equal(BM.LOOKS[k].ground, style(f).layers[0].paint["background-color"], k);
  const css = fs.readFileSync(path.join(here, "..", "public/basemaps.css"), "utf8");
  for (const k of BM.VECTOR_KEYS) assert.match(css, new RegExp("ra-look-" + k + " \\{ background: " + BM.LOOKS[k].ground), k);
});

test("the styles are small", () => {
  for (const f of Object.values(KEYS)) assert.ok(fs.statSync(path.join(dir, f + ".json")).size < 30000, f);
});

test("the generator and the files agree: every colour in a palette is the one in its file", () => {
  const py = fs.readFileSync(path.join(here, "..", "..", "scripts/build-basemap-styles.py"), "utf8");
  for (const [k, f] of Object.entries(KEYS)) {
    const bg = style(f).layers[0].paint["background-color"];
    assert.ok(py.includes('land="' + bg + '"'), f + " background " + bg + " is in the generator");
  }
});
