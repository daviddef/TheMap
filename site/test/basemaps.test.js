/* The basemap list, its default, and how ?base= is read and written (src/lib/basemaps.js, used by RecordMap.astro). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASEMAP_KEYS, DEFAULT_BASEMAP, resolveBasemap, basemapParam } from "../src/lib/basemaps.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const map = fs.readFileSync(path.join(here, "../src/components/RecordMap.astro"), "utf8");

test("four basemaps, Night dots the fourth, and the map is still what opens", () => {
  assert.deepEqual(BASEMAP_KEYS, ["map", "terrain", "satellite", "night"]);
  assert.equal(DEFAULT_BASEMAP, "map");
  assert.ok(BASEMAP_KEYS.includes(DEFAULT_BASEMAP));
});

test("?base= reads through the list; anything else is the default", () => {
  for (const k of BASEMAP_KEYS) assert.equal(resolveBasemap(k), k);
  for (const bad of [null, undefined, "", "Night", "night ", "dark", "constructor", "__proto__", "toString", 3, ["night"]]) assert.equal(resolveBasemap(bad), DEFAULT_BASEMAP, String(bad));
});

test("the default is written as nothing, every other key as itself, and it follows a changed default", () => {
  assert.equal(basemapParam("map"), "");
  assert.equal(basemapParam("night"), "night");
  assert.equal(basemapParam("terrain"), "terrain");
  /* if Night dots ever becomes the default, the light map must then say so in the address bar */
  assert.equal(basemapParam("night", "night"), "");
  assert.equal(basemapParam("map", "night"), "map");
  assert.equal(resolveBasemap("x", BASEMAP_KEYS, "night"), "night");
});

test("RecordMap reads and writes ?base= through the list and the one default constant", () => {
  assert.match(map, /BASEMAPS\.keys\.indexOf\(Q\.get\("base"\)\) >= 0 \? Q\.get\("base"\) : BASEMAPS\.def/);
  assert.match(map, /setQ\("base", k === BASEMAPS\.def \? "" : k\)/);
  assert.match(map, /BASEMAPS\.keys\.map\(function \(k\)/, "the switcher is built from the list");
  assert.match(map, /import \{ BASEMAP_KEYS, DEFAULT_BASEMAP \} from "\.\.\/lib\/basemaps\.js"/);
});

test("every basemap has a layer, a one-line title and a name, and Night dots is keyboard-operable", () => {
  for (const k of BASEMAP_KEYS) assert.match(map, new RegExp("(^|\\n)\\s*(" + k + ":|BASES\\." + k + " =)"), k + " has no layer");
  assert.match(map, /night: "Night dots: a quiet dark map so the colours stand out"/);
  assert.match(map, /role="button" data-b=/);
  assert.match(map, /aria-pressed/);
  assert.match(map, /e\.key !== " "/, "Space presses a link that says it is a button");
});
