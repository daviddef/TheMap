/* One research view for any selection, and the stories inside it (the My story tab is gone). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, "..", f), "utf8");
const win = {};
new Function("window", read("public/js/research-synopsis.js"))(win);
const SY = win.raSynopsis;

const lines = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
const m = { walked: [[1, 10]], by: { a: { done: [[8, 20]], state: "searched", note: "first", since: "2026-01-01" }, b: { done: [[30, 40]], state: "found", note: "second", since: "2026-03-01" } } };

test("the scope is the ticked families, else the active one, else nothing", () => {
  assert.deepEqual(SY.scopeOf(lines, "b", null), ["b"]);
  assert.deepEqual(SY.scopeOf(lines, "b", { slugs: ["a", "c", "zz"] }), ["a", "c"]);
  assert.deepEqual(SY.scopeOf(lines, "b", { all: true }), ["a", "b", "c"]);
  assert.deepEqual(SY.scopeOf(lines, "gone", { slugs: [] }), []);
});

test("a row for several families takes the union, the furthest state, and says whose note is whose", () => {
  const r = SY.rowBy(m, ["a", "b"], { a: "Alpha", b: "Beta" });
  assert.deepEqual(r.fams.sort(), ["a", "b"]);
  assert.equal(r.b.state, "found");
  assert.deepEqual(r.b.done, [[8, 20], [30, 40]]);
  assert.match(r.b.note, /Alpha/);
  assert.match(r.b.note, /Beta/);
  assert.equal(r.b.since, "2026-03-01");
});

test("a row for one family is that family's own entry, and for none is empty", () => {
  assert.deepEqual(SY.rowBy(m, ["a"], { a: "Alpha" }).fams, ["a"]);
  assert.equal(SY.rowBy(m, ["c"], { c: "C" }).fams.length, 0);
  assert.deepEqual(SY.rowCov(m, ["a", "b"]), [[1, 20], [30, 40]], "walked pages and each family's pages are joined");
});

test("the Research page has one families panel, and the My story tab and its script are gone", () => {
  const page = read("src/pages/my-research.astro");
  assert.doesNotMatch(page, /mr-t-story|id="mr-story"|story-tab\.js/);
  assert.match(page, /id="mr-stories"/);
  assert.match(page, /research-stories\.js/);
  assert.equal(fs.existsSync(path.join(here, "../public/js/story-tab.js")), false);
  assert.match(page, /research-fixes\.js/);
  assert.match(fs.readFileSync(path.join(here, "../public/js/research-fixes.js"), "utf8"), /\^story\(\\\/\|\$\)/, "old #story and #story/<id> addresses still land here");
});

test("a saved story opens in the one story tool, by id, and a first save makes it the current story", () => {
  const sp = read("public/js/story-page.js");
  assert.match(sp, /QS\.get\("story"\)/);
  assert.match(sp, /QS\.get\("family"\)/);
  assert.match(sp, /My research/);
  assert.doesNotMatch(sp, /Open it in My story/);
  const rs = read("public/js/research-stories.js");
  assert.match(rs, /read\/\?/);
  assert.doesNotMatch(rs, /innerHTML/, "a story's name and words are never markup");
});
