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

test("My research reads every ticked family: one name card each, and the bar names the whole set", () => {
  const page = fs.readFileSync(path.join(here, "../src/pages/my-research.astro"), "utf8");
  const bar = fs.readFileSync(path.join(here, "../public/js/line-switcher.js"), "utf8");
  assert.match(page, /SY\.scopeOf\(lines, me && me\.slug, stored\)/, "the cards read the same set as the map and the lists");
  assert.match(page, /Promise\.all\(list\.map\(cardFor\)\)/, "one card per family");
  assert.match(page, /addEventListener\("ra-scope-changed", draw\)/, "ticking a family redraws the cards");
  assert.match(bar, /Reading " \+ \(set\.length > 1 \? set\.length \+ " families together" : "this family only"\)/, "the bar says which families are being read, even when it is one that is not the family you mark under");
  assert.match(bar, /Your marks go under/, "and which one the marks go under");
  assert.match(fs.readFileSync(path.join(here, "../public/js/name-intro.js"), "utf8"), /"About the name" \+ \(m\.name \? " " \+ m\.name : ""\)/, "a card for a name with no entry still says whose it is");
});

test("the family picker ticks a whole archive at once, and finds its families by the archive's name", () => {
  const bar = fs.readFileSync(path.join(here, "../public/js/line-switcher.js"), "utf8");
  assert.match(bar, /Tick a whole archive/);
  assert.match(bar, /setMany\(slugs, !slugs\.every\(inScope\)\)/, "one press ticks them all, or unticks them when all are ticked");
  assert.match(bar, /\(l\.archives \|\| \[\]\)\.map\(archName\)\.join/, "the search box matches an archive's name");
  assert.match(bar, /names = Object\.keys\(byArch\)\.sort\(function \(a, b\) \{ return a\.localeCompare\(b\); \}\)/, "the archives are alphabetical, not by size");
});

test("My research place cards say which book was found in and for whom, a next step, and how each item is done", () => {
  const page = fs.readFileSync(path.join(here, "../src/pages/my-research.astro"), "utf8");
  assert.match(page, /Found something in:/);
  assert.match(page, /class="mrnextstep"><b>Next:<\/b>/);
  assert.match(page, /function howOf\(id\)/);
  for (const [cls, say] of [["desk", "At your desk"], ["visit", "In person"], ["mail", "By email or letter"]]) assert.ok(page.includes(`mrhow mrhow-${cls}">${say}`), cls + " is explained in the key");
  assert.match(page, /a === "onsite"[\s\S]{0,120}"In person"/, "an archive whose paper is in the building is an in-person visit");
  assert.match(page, /else out\.push\(\["unknown", "Not checked yet"/, "an archive nobody has surveyed says so and is not guessed at");
  assert.match(page, /howHtml\("volume:" \+ id\)/, "the unmarked books carry the tag too");
});

test("My research can be shared: the address carries who is read and any period, and a link opens the same view", () => {
  const page = fs.readFileSync(path.join(here, "../src/pages/my-research.astro"), "utf8");
  assert.match(page, /id="mr-share-url"/);
  assert.match(page, /q\.set\("f", all \? "all" : v\.slugs\.join\(","\)\)/, "who is read goes in f");
  assert.match(page, /k \+ "~" \+ PERIOD\[k\]\[0\] \+ "-" \+ PERIOD\[k\]\[1\]/, "a pressed period goes in per");
  assert.match(page, /if \(VIEW\.want && !VIEW\.applied\) return;/, "the address is not overwritten before a link has been applied");
  assert.match(page, /is not in this browser|not in this browser \(/, "a family the browser does not have is said so");
  assert.doesNotMatch(page.slice(page.indexOf("function applyView"), page.indexOf("var shareBtn")), /setActive/, "opening a link never changes the family your marks go under");
  assert.match(page, /location\.pathname \+ location\.search \+ \(n === "families"/, "changing tab keeps the query");
});
