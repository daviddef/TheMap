/* Surname ending rules: the usual respellings of a South-Slavic name, computed, for searching only. The page script and the Python tool must agree. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const w = {};
new Function("window", fs.readFileSync(path.join(here, "../public/js/surname-rules.js"), "utf8"))(w);
const R = w.raSurnameRules;

test("Kauzlarić gives the forms an immigration officer, a German clerk and a Hungarian one would write", () => {
  const f = R.forms("Kauzlarić");
  for (const x of ["Kauzlarich", "Kauzlaric", "Kauzlaritch", "Kauzlaritsch", "Kauzlarics"]) assert.ok(f.includes(x), x);
  assert.ok(!f.includes("Kauzlarić"), "the typed form is not offered back");
});

test("an American spelling gets the original back", () => {
  assert.ok(R.forms("Brozenich").includes("Brozenić"));
  assert.ok(R.forms("Pavlich").includes("Pavlić"));
});

test("letters with a hook are written out too: č, š, ž, đ", () => {
  assert.ok(R.forms("Martinčić").includes("Martinchich"));
  assert.ok(R.forms("Đurđević").includes("Djurdjevich"));
  assert.ok(R.forms("Šimić").includes("Shimich"));
});

test("a name the rules do not touch gets nothing, and short strings are left alone", () => {
  assert.deepEqual(R.forms("Kowalski"), []);
  assert.deepEqual(R.forms("Smith"), []);
  assert.deepEqual(R.forms("Ić"), []);
  assert.ok(R.forms("Kauzlarić").length <= 14);
});

test("scripts/surname_variants.py rule-forms gives the same answers as the page", () => {
  for (const n of ["Kauzlarić", "Brozenich", "Martinčić", "Đurđević", "Kowalski", "Šimić"]) {
    const py = JSON.parse(execFileSync("python3", [path.join(here, "../../scripts/surname_variants.py"), "rule-forms", n], { encoding: "utf8" }));
    assert.deepEqual(py, R.forms(n), n);
  }
});

test("the map page loads the rules and shows them as a lead, not a finding", () => {
  const map = fs.readFileSync(path.join(here, "../src/components/RecordMap.astro"), "utf8");
  assert.match(map, /js\/surname-rules\.js/);
  assert.match(map, /ra-forms/);
  assert.match(map, /None is known to be your family's until a record shows it/);
});
