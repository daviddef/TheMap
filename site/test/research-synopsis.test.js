import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const m = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/research-synopsis.js"), "utf8"))(m);
const syn = m.exports;

const lines = [
  { slug: "kosina", name: "Kosina", where: "Senj" },
  { slug: "blazevic", name: "Blažević", where: "" },
  { slug: "falco", name: "Falco", where: "Arienzo" },
];
const marks = {
  // a book two families have touched; Kosina has part-read it and Blažević plans it: ONE reading serves both
  "volume:W1": { t: "Births 1858-1900", where: "Senj", href: "/place/senj/", total: 174,
    by: { kosina: { done: [[1, 47]], state: "searched" }, blazevic: { state: "planned" } } },
  // a book only Kosina touched, and finished
  "volume:W2": { t: "Marriages 1858-1900", href: "/place/senj/", total: 80, by: { kosina: { done: [[1, 80]], state: "exhausted" } } },
  // another place, one family
  "volume:W3": { t: "Baptisms 1800-1860", href: "/place/arienzo/", total: 300, walked: [[1, 300]], by: { falco: { state: "found", done: [[5, 9]] } } },
  // a plan on a place, for two families
  "place:rovinj": { t: "Rovinj", href: "/place/rovinj/", by: { kosina: { state: "planned" }, falco: { state: "planned" } } },
  "source:matricula": { t: "Matricula", by: { blazevic: { state: "written" } } },
  "volume:W9": { t: "Not in scope", href: "/place/nowhere/", by: { other: { state: "planned" } } },
};
const places = { senj: { name: "Senj" }, arienzo: { name: "Arienzo" }, rovinj: { name: "Rovinj" } };

test("every family chosen by default; a place is shared when two families work it", () => {
  const s = syn.build({ lines, marks, places });
  assert.equal(s.totals.families, 3);
  assert.deepEqual(s.places.map((p) => p.name), ["Arienzo", "Rovinj", "Senj"]);          // the place-by-place list is alphabetical
  assert.deepEqual(s.sharedPlaces.map((p) => p.name).sort(), ["Rovinj", "Senj"]);
  assert.equal(s.places.find((p) => p.name === "Senj").sharedBooks.length, 1);            // W1 is touched by two; W2 only by Kosina
});

test("a book open for two families is one reading for both", () => {
  const s = syn.build({ lines, marks, places });
  const senj = s.places.find((p) => p.pid === "senj");
  assert.equal(senj.sameBookOpen.length, 1);
  assert.deepEqual(senj.sameBookOpen[0].open.sort(), ["blazevic", "kosina"]);
  assert.equal(s.totals.sameBookOpen, 1);
});

test("a finished book is not open work; a part-read one is", () => {
  const s = syn.build({ lines, marks, places, scope: ["kosina"] });
  const senj = s.places.find((p) => p.pid === "senj");
  const w2 = senj.books.find((r) => r.id === "volume:W2");
  assert.deepEqual(w2.open, []);
  assert.deepEqual(senj.books.find((r) => r.id === "volume:W1").open, ["kosina"]);
});

test("scope limits the families and leaves the others out entirely", () => {
  const s = syn.build({ lines, marks, places, scope: ["blazevic", "falco"] });
  assert.deepEqual(s.scope.map((l) => l.slug), ["blazevic", "falco"]);
  assert.ok(!s.places.some((p) => p.pid === "nowhere"));
  assert.equal(s.totals.pages, 5);                    // only Falco's own five pages; the walked book is shared, not Falco's work
});

test("the plan puts the places that cover the most families first", () => {
  const s = syn.build({ lines, marks, places });
  assert.equal(s.order[0].name, "Rovinj" === s.order[0].name ? "Rovinj" : "Senj");
  assert.equal(s.order[0].openFamilies.length, 2);
  assert.ok(s.order.every((p, i, a) => !i || a[i - 1].openFamilies.length >= p.openFamilies.length));
});

test("a letter out is listed as waiting, and not as a place", () => {
  const s = syn.build({ lines, marks, places });
  assert.equal(s.other.letters.length, 1);
  assert.ok(!s.places.some((p) => p.rows.some((r) => r.id === "source:matricula")));
});

test("the story says what was recorded and nothing about families with no marks", () => {
  const s = syn.build({ lines, marks, places });
  const t = syn.story(s, { date: "11 Nov 2026" });
  assert.match(t, /^# Research across Blažević, Falco and Kosina/);
  assert.match(t, /One reading serves Blažević and Kosina: Births 1858-1900/);
  assert.match(t, /Letter or request out/);
  assert.match(t, /has not been recorded there, which is not the same as having been looked/);
  assert.doesNotMatch(t, /Not in scope/);
});

test("no marks at all gives an empty, honest story", () => {
  const t = syn.story(syn.build({ lines: [{ slug: "a", name: "A" }], marks: {}, places: {} }));
  assert.match(t, /Nothing is marked as planned/);
});

test("the plain-text story links a blocked or waiting source when its address is known", () => {
  const out = syn.story(syn.build({ lines, marks: {
    "source:geni": { t: "Geni", href: "https://www.geni.com/", by: { kosina: { state: "blocked", note: "needs a login" } } },
    "source:archive": { t: "A State Archive", by: { falco: { state: "blocked" } } },
  }, scope: ["kosina", "falco"], places: {} }), { date: "2026-11-11" });
  assert.match(out, /- Blocked: \[Geni\]\(https:\/\/www\.geni\.com\/\)/);
  assert.match(out, /- Blocked: A State Archive \(/);
});
