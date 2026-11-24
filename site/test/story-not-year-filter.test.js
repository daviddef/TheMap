/* A story sentence with a year in it ("...around 1905") is a story, not a request for the records of 1905. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/components/RecordMap.astro"), "utf8");

test("typed years do not switch the Year pill on while the box holds a story", () => {
  const i = src.indexOf("function syncTypedYears()");
  const body = src.slice(i, src.indexOf("[yin, yin2].forEach", i));
  assert.match(body, /ra-story-on/);
  assert.match(body, /MutationObserver/);
  assert.match(body, /fnd\._ytw/, "the watcher is installed once, inside the function, after qbox exists");
});

test("a place with typed years still switches the pill on", () => {
  assert.match(src, /var t = yearsIn\(qbox\.value\);[\s\S]{0,1800}yon\.checked = true; readRange\(\); yearUI\(\)/);
});
