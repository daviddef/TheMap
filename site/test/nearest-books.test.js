/* A place with no books of its own says which nearby places do: a village's registers are often filed under the next parish along. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/components/RecordMap.astro"), "utf8");

test("nearestBooks looks only at places that hold volumes, within a distance, nearest first", () => {
  const i = src.indexOf("function nearestBooks(");
  const body = src.slice(i, i + 700);
  assert.match(body, /p\.v > 0/);
  assert.match(body, /haversine\(/);
  assert.match(body, /sort\(function \(a, b\) \{ return a\.d - b\.d; \}\)/);
});

test("the «That name is a place» rows carry the line, and not for a place that has books of its own", () => {
  assert.match(src, /ra-nearbooks/);
  assert.match(src, /ownBooks/);
  assert.match(src, /A village's registers are often filed under the next parish along/);
});

test("the nearest places open their own card", () => {
  assert.match(src, /closest\("\.ra-near"\)[\s\S]{0,200}raPlacePanel\.open/);
});
