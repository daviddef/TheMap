/* Dresden (David, 24 Nov): the /places/ find box said «not in the gazetteer either» about a place the gazetteer holds, the map answered the Dutch
   surname and left the city in Germany under four screens, and a gazetteer-only place had no flag history. These pin the three fixes. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const read = (f) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", f), "utf8");

test("/places/ hands its find box the gazetteer shards, so its empty state is true", () => {
  assert.match(read("src/pages/places/[...page].astro"), /<SmartFind[\s\S]*?gazShards=\{u\("\/g\/"\)\}/);
});

test("a place typed in full goes ahead of a surname of the same name, with who held the ground, and the front door does not hide it", () => {
  const src = read("src/components/RecordMap.astro"), css = read("public/front-door-v2.css");
  assert.match(src, /ra-isplace/);
  assert.match(src, /It is also a place/);
  assert.match(src, /h\.splice\(placeAt, 0, blk\.join\(""\)\)/);
  assert.match(css, /\.ra-juris:not\(\.ra-isplace\)/);
});

test("a place with no books still gets the who-held-this-ground strip, and the band controls are wired", () => {
  const src = read("src/components/RecordMap.astro");
  assert.match(src, /heldBy\(\{ lat: hits\[0\]\[1\], lon: hits\[0\]\[2\], country: hits\[0\]\[3\]/);
  assert.match(src, /panel\.innerHTML = h\.join\(""\); try \{ bandsInit\(panel\)/);
});

test("the panel starts below the search box however tall it has grown", () => {
  const src = read("src/components/RecordMap.astro"), css = read("public/front-door-v2.css");
  assert.match(src, /--ra-panel-top/);
  assert.match(src, /new ResizeObserver/);
  assert.match(css, /top: var\(--ra-panel-top, 92px\)/);
});
