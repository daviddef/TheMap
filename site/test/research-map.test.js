/* The map on My research (public/js/research-map.js): one world, soft discs where places would sit on one another, and the Atlas home's look. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fakeStore } from "./fakedom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const load = (p, ...names) => { const m = { exports: {} }; new Function("module", ...names.map(n => n[0]), read(p))(m, ...names.map(n => n[1])); return m.exports; };
const RM = load("public/js/research-map.js");

test("the map stops where one world fills the box", () => {
  for (const [w, h] of [[1100, 560], [343, 322], [800, 600], [256, 200], [0, 0]]) {
    const z = RM.minZoom(w, h);
    assert.ok(256 * 2 ** z >= Math.max(w, h) - 0.01, w + "x" + h);
    assert.ok(z === 0 || 256 * 2 ** (z - 0.25) < Math.max(w, h), "and no further in than it must");
    assert.equal(z * 4, Math.round(z * 4), "a quarter step");
  }
});

test("places on top of one another become one group; a lone one stays itself", () => {
  const pts = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 5 }, { id: 3, x: 300, y: 0 }, { id: 4, x: 20, y: 10 }];
  const g = RM.cluster(pts, p => [p.x, p.y], 35);
  assert.deepEqual(g.map(x => x.places.map(p => p.id)), [[1, 2, 4], [3]]);
  assert.deepEqual(RM.cluster([], p => [0, 0], 35), []);
});

test("a disc says what is in it, in the legend's words", () => {
  assert.deepEqual(RM.summary([{ complete: true, found: true }, { flight: true }, {}, {}]),
    { found: 1, text: "4 places: 1 read to the end, 1 in progress, 2 planned, found something at 1" });
  assert.equal(RM.summary([{}]).text, "1 place: 1 planned");
  assert.ok(RM.radius(1, 50) >= 13 && RM.radius(50, 50) === 29);
});

test("the research map opens in whatever look the home shows", () => {
  const store = fakeStore();
  const BM = load("public/js/basemaps.js", ["localStorage", store]);
  /* what attach() would open with followHome */
  const opens = () => BM.choose({ keys: BM.ATLAS_KEYS, url: BM.homeLook(BM.ATLAS_KEYS), stored: BM.stored(BM.ATLAS_KEYS), theme: "light" }).key;
  const home = url => { const pick = BM.choose({ keys: BM.ATLAS_KEYS, url, stored: BM.stored(BM.ATLAS_KEYS), theme: "light" }); BM.homeOpened(pick); return pick.key; };
  assert.equal(opens(), home(null), "a fresh browser");
  BM.remember("smooth"); assert.equal(opens(), "smooth");
  assert.equal(home("satellite"), "satellite"); assert.equal(opens(), "satellite", "the home opened in a look from its address");
  assert.equal(BM.stored(BM.ATLAS_KEYS), "smooth", "which is not saved as a choice");
  assert.equal(home(null), "smooth"); assert.equal(opens(), "smooth", "a plain visit shows the choice again");
  home("satellite"); BM.remember("ink"); assert.equal(opens(), "ink", "a choice made anywhere afterwards wins");
  BM.remember("terrain"); assert.equal(opens(), "terrain", "Terrain is a home look too");
  home("constructor"); assert.equal(opens(), "terrain");
});

test("only My research follows the home; Compass, History and the story map open as before", () => {
  assert.match(read("public/js/basemaps.js"), /if \(o\.followHome\) keys = ATLAS_KEYS;/);
  assert.match(read("public/js/basemaps.js"), /url: o\.followHome \? homeLook\(keys\) : ""/);
  assert.match(read("src/components/RecordMap.astro"), /if \(BM\.homeOpened\) BM\.homeOpened\(pick\);/);
  assert.match(read("src/pages/my-research.astro"), /followHome: true, terrain: terrain/);
  assert.match(read("public/js/basemaps.js"), /if \(!o\.terrain\) keys = keys\.filter/, "no Terrain button on a map that hands over no layer for it");
  for (const p of ["public/js/history-theatre.js", "public/js/story-page.js", "public/tree-canvas/compass-view.js"]) assert.doesNotMatch(read(p), /followHome/, p);
});

test("the page's map: no second world, a tall box, discs far out and every state still in the legend", () => {
  const page = read("src/pages/my-research.astro");
  assert.match(page, /maxBounds: \[\[-85\.05, -180\], \[85\.05, 180\]\], maxBoundsViscosity: 1/);
  assert.match(page, /setMinZoom\(RM\.minZoom\(box\.clientWidth, box\.clientHeight\)\)/);
  assert.match(page, /#mr-map \{ height: clamp\(360px, 62vh, 600px\)/);
  assert.ok(page.indexOf("/js/research-map.js") > 0);
  for (const say of ["every book read to the end", "in flight (some books read)", "planned", "found something", "other place with records", "recommended next", "places close together"]) assert.ok(page.includes(say), say);
});

test("far out, the recommended-next letters never pile on one spot or sit on a disc", () => {
  const at = p => [p.x, p.y];
  const path6 = Array.from({ length: 6 }, (_, i) => ({ x: 100 + i, y: 100 }));
  const [all] = RM.nextMarks(path6, at, [{ x: 103, y: 100, r: 29 }], 22);
  assert.equal(all.label, "A–F"); assert.deepEqual(all.items, [0, 1, 2, 3, 4, 5]);
  assert.ok(all.y + all.dy >= 100 + 29 + 12, "moved below the disc");
  const two = RM.nextMarks([{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 4, y: 3 }], at, [], 22);
  assert.deepEqual(two.map(m => [m.label, m.dy]), [["A, C", 0], ["B", 0]], "alone, they stay where they are");
  const stacked = RM.nextMarks([{ x: 0, y: 0 }], at, [{ x: 0, y: 30, r: 13 }, { x: 0, y: 0, r: 12 }], 22)[0];
  for (const d of [{ y: 30, r: 13 }, { y: 0, r: 12 }]) assert.ok(Math.abs(d.y - stacked.dy) >= d.r + 10, "clear of both");
  assert.deepEqual(RM.nextMarks([], at, [], 22), []);
});
