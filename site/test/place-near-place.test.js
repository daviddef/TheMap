/* «Gorica, Karlovac» is a place and where it is, not a surname and a place. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/components/RecordMap.astro"), "utf8");

test("splitQuery reads «A, B» as A's places near the place B before it tries a surname and a place", () => {
  const i = src.indexOf("function splitQuery(");
  const body = src.slice(i, i + 3000);
  assert.match(body, /qPlace = qName = qNear = null/);
  assert.match(body, /replace\(\/\[,;\]\+\$\/, ""\)/, "the comma is punctuation");
  assert.match(body, /<= 60/);
  assert.ok(body.indexOf("nearA") < body.indexOf("qPlace = right; qName = left"), "the place reading comes first");
});

test("keep() narrows to the places that were found near the second name", () => {
  assert.match(src, /if \(qNear && !qNear\[p\.i\]\) return false;/);
});
