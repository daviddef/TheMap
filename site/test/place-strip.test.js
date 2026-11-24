/* The place header on My research (public/js/place-strip.js): the scale, which events reach a place, which books a period keeps, the four doors. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PS = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js/place-strip.js"), "utf8"))(m); return m.exports; })();

test("the scale: a table that starts before 1500 gives the years before 1650 only 14% of the width", () => {
  const a = PS.axis(1200);
  assert.equal(a.x(1200), 0); assert.equal(a.x(2026), 1);
  assert.ok(Math.abs(a.x(1650) - 0.14) < 1e-9);
  const b = PS.axis(1700);
  assert.equal(b.br, null); assert.ok(Math.abs(b.x(1863) - 0.5) < 1e-9);
});

test("an event reaches a place inside its outline or within a few miles of its edge, and not otherwise", () => {
  const sq = { poly: [[[10, 10], [10, 20], [20, 20], [20, 10]]], f: 1900, t: 1910, n: "x", ty: "war" };
  assert.equal(PS.mortHit(sq, 15, 15), true, "inside");
  assert.equal(PS.mortHit(sq, 20.2, 15), true, "just outside the edge");
  assert.equal(PS.mortHit(sq, 30, 15), false, "far away");
  assert.deepEqual(PS.eventsFor([sq], 15, 15, 1950), [], "an event that ended before the strip starts is left out");
  assert.equal(PS.eventsFor([sq], 15, 15, 1800).length, 1);
  assert.deepEqual(PS.eventsFor([sq], null, null, 1800), [], "a place with no coordinates has no events, which is not a claim");
});

test("years are read from a title, and a book with none is never hidden by a period", () => {
  assert.deepEqual(PS.yearsIn("Births (Rođeni) 1753-1893"), [1753, 1893]);
  assert.deepEqual(PS.yearsIn("Óbitos 1977, Abr-Ago"), [1977, 1977]);
  assert.equal(PS.yearsIn("Listas Eleitorais"), null);
  assert.equal(PS.keeps(1753, 1893, 1797, 1850), true, "a long book overlaps the period");
  assert.equal(PS.keeps(1977, 1977, 1797, 1850), false);
  assert.equal(PS.keeps(1850, 1850, 1797, 1850), true, "touching the end counts");
  assert.equal(PS.keeps(null, null, 1797, 1850), true);
  assert.equal(PS.span(1941, 1945), "1941–1945"); assert.equal(PS.span(1990, 2026), "1990–present"); assert.equal(PS.span(1914, 1914), "1914");
});

test("the flag of today and the flags page come from flag-map.json, and a country with none gets neither", () => {
  const map = { slug: { "croatia-flags": "HR" }, f: { HR: [[1945, 1991, "croatia-flags--era-1945"], [1991, null, "croatia-flags--era-1991"]] } };
  assert.deepEqual(PS.flagOf(map, "HR"), { slug: "croatia-flags", image: "croatia-flags--era-1991" });
  assert.deepEqual(PS.flagOf(map, "ZZ"), { slug: null, image: null });
});

test("the page wires it: the script is loaded, the card is decorated after each draw, rows carry their years, and a period only hides rows with years", () => {
  const page = fs.readFileSync(path.join(here, "../src/pages/my-research.astro"), "utf8");
  assert.match(page, /\/js\/place-strip\.js/);
  assert.match(page, /fill\(\);\s*decorate\(\);/);
  assert.match(page, /data-yf="/);
  assert.match(page, /rows with no years in the title stay|with no years in the title stay/);
  assert.match(page, /class = "mrcc"|className = "mrcc"/);
});
