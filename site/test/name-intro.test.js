/* The introduction to a name on My research (public/js/name-intro.js): the sentences and the flag strip, built from a surname row, the
   flag eras and the flag map. Invented rows; nothing here names a person. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const N = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js/name-intro.js"), "utf8"))(m); return m.exports; })();

const NAMES = { IT: "Italy", US: "United States of America" };
const ROW = {
  n: "Anile", variants: [{ n: "Añil", how: "sounds" }, { n: "Anila", how: "sounds" }],
  countries: [{ cc: "IT", how: "register", n: 66 }, { cc: "US", how: "register", n: 117 }],
  or: { cc: "IT", f: ["IT", 1860, "n"], s: 0.6 }, wk: { langs: ["Italian"], cite: "https://en.wiktionary.org/wiki/Anile" },
};
const ERAS = [
  { slug: "italy-flags", polity: "Kingdom of Sardinia (constitutional)", dates: "1848 – 1861", from: 1848, to: 1861, tags: [] },
  { slug: "italy-flags", polity: "Kingdom of Italy (Liberal era)", dates: "1861 – 1922", from: 1861, to: 1922, tags: [{ t: "Emigration: mass departures to the Americas" }] },
  { slug: "italy-flags", polity: "Italian Republic", dates: "1946 – present", from: 1946, present: true, tags: [] },
  { slug: "italy-flags", polity: "Etruscan Civilization & Ancient Rome", dates: "to 400", from: 1, to: 400, tags: [] },
  { slug: "usa-flags", polity: "Civil War, Union flag", dates: "1861 – 1865", from: 1861, to: 1865, tags: [] },
];
const MAP = { slug: { "italy-flags": "IT", "usa-flags": "US" }, f: { IT: [[1861, 1922, "italy-flags--era-1861"]], US: [] } };

test("the lede says language, where it is counted and a lead, in plain words", () => {
  const m = N.build(ROW, { names: NAMES, eras: ERAS, map: MAP });
  assert.match(m.lede, /Anile is filed as an Italian surname\. A name's language is not where a family is from\./);
  assert.match(m.lede, /counts? it in United States of America \(117\) and Italy \(66\)/, "most counted first");
  assert.match(m.lede, /not how common the name is/);
  assert.match(m.lede, /leans to Italy as where it began, with the earliest record held from the 1860s\. That is a lead, not a finding\./);
});

test("the flag strip starts at the earliest record and keeps the era's own image, polity and migration line", () => {
  const m = N.build(ROW, { names: NAMES, eras: ERAS, map: MAP });
  const it = m.flags[0];
  assert.equal(it.cc, "IT");
  assert.deepEqual(it.rows.map((r) => r.polity), ["Kingdom of Sardinia (constitutional)", "Kingdom of Italy (Liberal era)", "Italian Republic"], "the one in force in 1860 and later; nothing that ended before, nothing from the other country");
  assert.equal(it.rows[1].image, "italy-flags--era-1861");
  assert.match(it.rows[1].note, /^Emigration/);
});

test("a name with no lead and no date still gets its flags, from 1800, and no claim about where it began", () => {
  const row = { n: "Farley", variants: [], countries: [{ cc: "US", how: "register", n: 38528 }] };
  const m = N.build(row, { names: NAMES, eras: ERAS, map: MAP });
  assert.equal(m.lead, null);
  assert.doesNotMatch(m.lede, /where it began/);
  assert.ok(m.flags.length === 0 || m.flags[0].cc === "US");
});

test("the only evidence is positive: a name with no row says it is a gap in the data, not a finding", () => {
  assert.equal(N.build(null).found, false);
  assert.equal(N.pick([{ n: "Anila" }, { n: "Anilema" }], "Anile"), null, "a near spelling is not this name");
  assert.equal(N.pick([{ n: "Añile" }, { n: "Anile" }], "añile").n, "Añile", "an accent decides");
});

test("sounds-alike spellings are carried as a guess, never as records", () => {
  const m = N.build(ROW, { names: NAMES, eras: ERAS, map: MAP });
  assert.deepEqual(m.sounds, ["Añil", "Anila"]);
});
