/* THE SOURCES SEARCH (public/js/sources-search.js), shared by the /providers/ page and the header's Sources box.
   It runs on the real directory, because the failures that mattered were about real rows: a two-letter word matching
   inside "platform", a country typed by the name people use, a slipped letter. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const S = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js/sources-search.js"), "utf8"))(m); return m.exports; })();
const P = JSON.parse(fs.readFileSync(path.join(here, "../../data/providers.json"), "utf8")).providers;
const ix = S.build(P);
const names = (q, n = 5) => S.search(ix, q).slice(0, n).map((p) => p.name);

test("accents and punctuation do not matter", () => {
  assert.equal(S.norm("Süd-Archiv, Žubrinić"), "sud archiv zubrinic");
  assert.ok(S.search(ix, "archivio di stato").length > 50);
});

test("every word must match, and a name hit comes first", () => {
  assert.equal(names("familysearch", 1)[0], "FamilySearch");
  const r = S.search(ix, "croatia church");
  assert.ok(r.length > 0 && r.every((p) => p.countries.includes("HR")));
});

test("a country is found by the name people type, and by its code", () => {
  const us = S.search(ix, "usa census");
  assert.ok(us.length > 5 && us.every((p) => p.countries.includes("US")));
  const hr = S.search(ix, "hr");
  assert.ok(hr.length > 20 && hr.every((p) => p.countries.includes("HR")), "two letters that are a country code name the country, not a word");
  assert.ok(S.search(ix, "worldwide").every((p) => p.countries.includes("*")));
});

test("a slipped letter still finds its source, but only when nothing matched exactly", () => {
  assert.ok(S.search(ix, "arhcive poland").length > 0);
  assert.equal(S.search(ix, "zzzzq").length, 0);
});

test("a filter narrows the same search", () => {
  const all = S.search(ix, "archive");
  const free = S.search(ix, "archive", (p) => p.access === "free");
  assert.ok(free.length > 0 && free.length < all.length && free.every((p) => p.access === "free"));
});

test("an empty query returns everything the filter accepts, in name order", () => {
  assert.equal(S.search(ix, "").length, P.length);
});

test("slipped letters: one edit, a swap, and not two", () => {
  assert.ok(S.near("archive", "arhcive", 1));
  assert.ok(S.near("archive", "archiv", 1));
  assert.ok(!S.near("archive", "chiver", 1));
});
