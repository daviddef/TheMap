/* The way between the Atlas, the Tree Canvas and Compass without losing the file (24 Nov 2026). Static checks: the pieces that make it work are in the files that must carry them. */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");

test("the Atlas bar has a Compass icon that reopens the kept tree", () => {
  const t = read("public/js/theme.js");
  assert.match(t, /ra-compass/); assert.match(t, /resume=1&to=compass/); assert.match(t, /tcRecent/);
  assert.match(t, /indexedDB\.databases/, "never creates the canvas's database from another page");
  assert.match(read("public/styles.css"), /header\.site nav \.ra-compass/);
  assert.match(read("src/layouts/Base.astro"), /dq-compass/);
  assert.match(read("src/lib/nav.js"), /demo=compass/);
});

test("the canvas page reopens the newest kept file for ?resume=1 and lands on Compass for to=compass", () => {
  const a = read("public/tree-canvas/app.js");
  assert.match(a, /get\('resume'\)/); assert.match(a, /get\('to'\) === 'compass'/); assert.match(a, /get\('demo'\) === 'compass'/);
  assert.match(a, /openKept\(kept\[0\], to\)/);
});

test("the switcher shows the words and one colour per view", () => {
  const c = read("public/tree-canvas/switcher.css");
  assert.match(c, /--sw-c-compass/); assert.match(c, /data-v="compass"/);
});

test("the front page offers the kept tree first and tucks the rest under one fold", () => {
  const h = read("src/pages/tree-canvas/index.astro");
  assert.match(h, /Pick up where you left off/); assert.match(h, /More ways to start/); assert.match(h, /class="stviews"/);
  for (const id of ["stArchBtns", "stUrl", "stGo", "stDemo", "stDemoMap", "stLinkMsg", "stLink"]) assert.ok(h.includes('id="' + id + '"'), id);
  assert.match(read("public/tree-canvas/page.css"), /\.stwrap\.haskept #stRecent/);
});
