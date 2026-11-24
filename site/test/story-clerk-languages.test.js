import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

/* clerkLanguages is pure: load the engine the way the other tests do */
const src = read("../public/js/story-engine.js");
const rd = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const x = { exports: {} }; new Function("module", rd("atlas-summary.js"))(x); return x.exports; })();
const m = { exports: {}, deps: { summary: A } };
new Function("module", src)(m);
const api = m.exports;

const senj = { name: "Senj", cc: "HR", eras: [
  { from: 1469, to: 1809, polity: "Habsburg", regime: "h" }, { from: 1813, to: 1918, polity: "Austria–Hungary", regime: "ah" },
  { from: 1918, to: 1943, polity: "Italy", regime: "it" }, { from: 1945, to: 1991, polity: "Yugoslavia", regime: "y" }, { from: 1991, to: 3000, polity: "Croatia", regime: "c" }] };
const sydney = { name: "Sydney", cc: "AU", eras: [] };

test("a person born in Senj in 1951 who left in 1954 is expected in Croatian, and in English in Sydney: not Latin, Italian or Hungarian", () => {
  const r = api.clerkLanguages([{ info: senj, from: 1951, to: 1954 }, { info: sydney, from: 1954, to: 1954 }]);
  assert.ok(r.keys.croatian && r.keys.english);
  for (const l of ["latin", "italian", "hungarian", "german", "venetian"]) assert.ok(!r.keys[l], l);
});

test("the same village under Austria-Hungary adds German and Hungarian, under Italy adds Italian, and Latin runs to the 1940s", () => {
  const a = api.clerkLanguages([{ info: senj, from: 1880, to: 1890 }]).keys;
  assert.ok(a.german && a.hungarian && a.latin && a.croatian);
  const b = api.clerkLanguages([{ info: senj, from: 1925, to: 1930 }]).keys;
  assert.ok(b.italian && b.latin);
  assert.ok(!api.clerkLanguages([{ info: senj, from: 1951, to: 1951 }]).keys.latin);
});

test("without a year the country's own language and Latin are expected, and nothing is invented for an unknown country", () => {
  const r = api.clerkLanguages([{ info: senj, from: null, to: null }]).keys;
  assert.ok(r.croatian && r.latin && !r.german);
  assert.equal(api.clerkLanguages([{ info: { name: "Nowhere", cc: "ZZ", eras: [] }, from: 1900, to: 1900 }]).keys.latin, 1);
  assert.equal(api.clerkLanguages([]), null);
});

test("the page folds the unexpected languages away and shows two name cards side by side and two event columns", () => {
  const page = read("../src/pages/read.astro");
  assert.match(src, /lf-otherlangs/);
  assert.match(src, /What the clerks wrote where and when they lived/);
  assert.match(src, /two people who share a first name and a surname/);
  assert.match(page, /\.sp \.lf-names \{ display: grid; grid-template-columns: repeat\(auto-fit/);
  assert.match(page, /\.sp \.lf-duo \{ display: grid; grid-template-columns: repeat\(2/);
});

test("Interpret a record is one box: dates, words and a whole line, with Claude offered only for a line", () => {
  const page = read("../src/pages/read.astro");
  assert.match(page, /id="tool-read"/);
  assert.doesNotMatch(page, /id="rr-d"|id="tool-date"|id="tool-word"|id="tool-ask"/);
  assert.match(page, /function runAll\(\) \{ run\(\); runDate\(\); nudge\(\); \}/);
  assert.match(page, /words < 5/);
});

test("the plan button carries the AI sparkle, the highlights are bright, and the section row is one scrolling line on a phone", () => {
  const page = read("../src/pages/read.astro");
  assert.match(page, /class="sp-btn sp-btn-ai" id="sp-ai-btn"><svg class="sp-spark"/);
  assert.match(page, /--hl-person: #ffd84d/);
  assert.match(page, /flex-wrap: nowrap; gap: 6px; overflow-x: auto/);
});
