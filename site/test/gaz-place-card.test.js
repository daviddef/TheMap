/* A place the map knows but holds no books for gets the same card as a place with books: folds, not a box and a paragraph of regret. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/components/RecordMap.astro"), "utf8");

test("gazPlaceCards builds the usual folds: nearest books, country sources (sorted by name), family-tree sites once", () => {
  const i = src.indexOf("function gazPlaceCards(");
  const body = src.slice(i, i + 4200);
  assert.match(body, /ra-area-g ra-area-near/);
  assert.match(body, /ra-area-g ra-area-cov/);
  assert.match(body, /localeCompare/);
  assert.match(body, /familyTreeGroup\(cc\)/);
  assert.match(body, /out\.indexOf\(ft\) < 0/);
});

test("a name that is only a place renders the cards and stops: no box, no paragraph, no 57-row list", () => {
  assert.match(src, /if \(!names\.length\) h\.push\(gazPlaceCards\(hits\)\);/);
  assert.match(src, /if \(hits\.length && !\(names && names\.length\)\) \{ panel\.innerHTML = h\.join\(""\);[^\n]*? return; \}/);
});

test("a single place carries its country and other names in the heading, like a place card", () => {
  assert.match(src, /hits\.length === 1[\s\S]{0,400}at-n[\s\S]{0,300}at-also/);
});

test("several places matching a name are listed A to Z in the card's own fold, each opening in the panel", () => {
  const i = src.indexOf("THE MATCHES IN THE CARD'S OWN FOLD");
  const body = src.slice(i, i + 1800);
  assert.match(body, /localeCompare/);
  assert.match(body, /ra-area-g ra-area-near/);
  assert.match(body, /ra-area-p ra-near/);
});

test("«Brseč Istria»: the place half matches a word that BEGINS with it, not Zadnistriani or Transnistria", () => {
  assert.match(src, /function nameStarts\(p, t\)/);
  assert.match(src, /qPlace = right; qName = left; qStrict = true/);
  assert.match(src, /qStrict \? !nameStarts\(p, t\)/);
});
