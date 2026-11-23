/* "Your N areas" panel (RecordMap.astro): it uses the full width in two CSS columns, and keeps each place with its books.
   No browser here: these check the stylesheet rules and the markup the panel writes. The widths were checked by hand at 1900, 1440, 1024, 768 and 400px. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/RecordMap.astro", import.meta.url), "utf8");
const rule = sel => { const i = src.indexOf(sel + " {"); assert.ok(i >= 0, "missing rule " + sel); return src.slice(i, src.indexOf("}", i) + 1); };

test("the area panel is no longer capped at a narrow width", () => {
  assert.doesNotMatch(rule(":global(.ra-area)"), /max-width/);
});

test("places flow into two columns that collapse to one when narrow", () => {
  assert.match(src, /:global\(\.ra-area-g > ul\)\s*\{[^}]*columns:\s*2 25rem/);
});

test("a place is never split from its books, and big places and sub-headings span the width", () => {
  assert.match(src, /:global\(\.ra-area-g > ul > li\)\s*\{\s*break-inside:\s*avoid/);
  assert.match(src, /:global\(\.ra-area-g > ul > li\.ra-area-big\)[^{]*\{[^}]*column-span:\s*all/);
  assert.match(src, /:global\(\.ra-area-big \.ra-vl\)\s*\{[^}]*columns:\s*2 24rem/);
});

test("the markup marks a place with ten or more books as big", () => {
  assert.match(src, /nv >= 10 \? ' class="ra-area-big"' : ""/);
});

test("a place with books folds, and the count of books is in its name line", () => {
  assert.match(src, /<details class="ra-area-pl" data-vols=/);
  assert.match(src, /<span class="ra-area-n">/);
  assert.match(src, /box\.querySelector\("\.ra-area-n"\)\.textContent = vs\.length/);
});

test("the name opens the place and does not also fold the row", () => {
  assert.match(src, /if \(o\) \{ e\.preventDefault\(\);/);
});

test("sources that cover a whole country are listed under the area, regional archives elsewhere are not", () => {
  assert.match(src, /function areaCountrySources\(R\)/);
  assert.match(src, /p\.kind !== "regional-archive" && p\.kind !== "diocesan"/);
  assert.match(src, /Sources that cover all of /);
});
