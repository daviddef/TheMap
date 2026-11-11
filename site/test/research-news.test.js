import test from "node:test";
import assert from "node:assert/strict";
import { researchNews } from "../src/lib/research-news.js";

const data = {
  lines: { a: { name: "Alpha" }, b: { name: "Beta" } },
  marks: {
    "volume:W1": { t: "Births 1859-1896", where: "crikvenica", by: { a: { since: "2026-11-02", state: "found", done: [[1, 10], [20, 29]], note: "read for SOMEBODY'S baptism" } } },
    "source:matricula": { t: "Matricula Online", by: { a: { since: "2026-11-02" }, b: { since: "2026-11-03" } } },
    "antenati:x": { t: "Antenati register x", by: { b: { since: "2026-11-03" } } },
  },
};

test("counts books, pages, places and sources; names only surnames", () => {
  const r = researchNews(data);
  assert.equal(r.totals.books, 1);
  assert.equal(r.totals.pages, 20);
  assert.equal(r.totals.places, 1);
  assert.equal(r.totals.families, 2);
  assert.deepEqual(r.families.map((f) => f.name), ["Alpha", "Beta"]);
});

test("one entry per day, never carrying a note", () => {
  const r = researchNews(data);
  assert.equal(r.entries.length, 2);
  assert.ok(!JSON.stringify(r).includes("SOMEBODY"));
  const d2 = r.entries.find((e) => e.date === "2026-11-02");
  assert.match(d2.headline, /Alpha/);
  assert.match(d2.headline, /1 book read/);
  assert.match(d2.headline, /Matricula/);
});

test("a day names its families and lists the exact books and sources, still without notes", () => {
  const r = researchNews(data);
  const d2 = r.entries.find((e) => e.date === "2026-11-02");
  assert.equal(d2.detail.length, 1);
  assert.equal(d2.detail[0].family, "Alpha");
  assert.ok(d2.detail[0].rows.some((x) => x.kind === "book" && x.title === "Births 1859-1896" && x.pages === 20));
  assert.ok(d2.detail[0].rows.some((x) => x.kind === "source" && x.source === "Matricula Online"));
  assert.ok(!JSON.stringify(d2).includes("SOMEBODY"));
});

test("a film row shows its book title and written place when it has no atlas place", () => {
  const r = researchNews({ lines: { a: { name: "Alpha" } }, marks: {
    "film:007713384": { t: "Defunciones 1729-1833 (film 007713384)", whereText: "Montevideo cathedral", href: "https://www.familysearch.org/search/film/007713384", by: { a: { since: "2026-11-11", state: "found" } } },
  } });
  const row = r.entries[0].detail[0].rows[0];
  assert.match(row.title, /Defunciones 1729-1833/);
  assert.equal(row.where, "Montevideo cathedral");
  assert.equal(row.pages, 0);
});
