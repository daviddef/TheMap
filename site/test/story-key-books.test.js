/* THE BOOKS TO OPEN FIRST. David: «this whole "every volume the atlas lists"… cant we suggest some key ones for the periods were looking at rather than a
   blanked meh?» The books are Nova Gradiška's, as the Atlas serves them. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const F = load("story-engine.js", { summary: load("atlas-summary.js") });
const BOOKS = JSON.parse(fs.readFileSync(path.join(here, "fixtures/nova-gradiska-books.json"), "utf8"));
const DATED = [{ kind: "b", label: "Born likely in the 1910s", from: 1910, to: 1919 }, { kind: "m", label: "Married late 1930s", from: 1936, to: 1939 }, { kind: "c", label: "A child born 1942", from: 1942, to: 1942 }];
const titles = (k) => k.picks.map((p) => p.c.title);

test("a bundle's years are read per kind from its title, not from the span it is filed under", () => {
  const b = { title: "Births (Rođeni) 1887-1890 Marriages (Vjenčani) 1878-1907 Deaths (Umrli) 1870-1880", kinds: ["b", "m", "d"], from: 1870, to: 1907 };
  assert.deepEqual(F.spansOf(b, "b"), [[1887, 1890]]);
  assert.deepEqual(F.spansOf(b, "m"), [[1878, 1907]]);
});

test("a title that gives one range for all kinds, or none, falls back to the filed span", () => {
  const c = { title: "Births (Rođeni), Marriages (Vjenčani), Deaths (Umrli) 1827-1849", kinds: ["b", "m", "d"], from: 1827, to: 1849 };
  assert.deepEqual(F.spansOf(c, "b"), [[1827, 1849]]);
  assert.deepEqual(F.spansOf({ title: "Parish book", kinds: ["m"], from: 1900, to: 1910 }, "m"), [[1900, 1910]]);
  assert.deepEqual(F.spansOf({ title: "Parish book", kinds: ["m"], from: 1900, to: 1910 }, "d"), []);
});

test("your dates: nothing reaches them, so it says so and offers the parents' books", () => {
  const k = F.keyBooks(BOOKS, F.bookNeeds(DATED, [], null));
  assert.equal(k.gaps.length, 3);
  assert.equal(k.latest.b, 1896);
  assert.equal(k.latest.m, 1920);
  assert.deepEqual(titles(k), ["Births (Rođeni) 1858-1886", "Births (Rođeni) 1876-1896", "Marriages (Vjenčani) 1881-1920 Deaths (Umrli) 1881-1920"]);
  assert.match(k.picks[0].why[0], /their parents’ births/);
});

test("a date a book covers gets that book, and says which years it has when it covers only part", () => {
  const k = F.keyBooks(BOOKS, F.bookNeeds(null, ["m"], [1915, 1925]));
  assert.equal(k.gaps.length, 0);
  assert.deepEqual(titles(k), ["Marriages (Vjenčani) 1881-1920 Deaths (Umrli) 1881-1920"]);
  assert.match(k.picks[0].why[0], /marriages 1915–1925 \(it has 1915–1920\)/);
});

test("one book that answers two needs is listed once, with both reasons", () => {
  const k = F.keyBooks(BOOKS, F.bookNeeds(null, ["m", "d"], [1900, 1910]));
  const both = k.picks.filter((p) => p.c.title.startsWith("Marriages (Vjenčani) 1881-1920"));
  assert.ok(both.length <= 1);
  assert.ok(k.picks.length <= 5);
});

test("a wide window does not guess a generation back", () => {
  const n = F.bookNeeds(null, ["b"], [1910, 1962]);
  assert.equal(n[0].back, false);
  assert.equal(F.keyBooks(BOOKS, n).picks.length, 0);
});

test("the card no longer offers «every volume»", () => assert.doesNotMatch(src("story-engine.js"), /"Every volume the Atlas lists for " \+/));

test("no dates, no list", () => assert.deepEqual(F.bookNeeds(null, ["b"], null), []));
