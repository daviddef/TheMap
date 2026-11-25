/* An age told after a place belongs to that place; a place they came from is read from the birth year to the year they left. David's story: «my dad was born in 1951, moved to botswana
   when he was 3 years old, then he moved to Salisbury». The page gave the 3 to Salisbury (Harare), left Botswana with no age and every era open, and showed nothing for Croatia. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", fs.readFileSync(path.join(here, "../public/js/" + f), "utf8"))(m); return m.exports; };
const A = load("atlas-summary.js");
const F = load("story-engine.js", { summary: A });
const rows = [["Johannesburg", "ZA", 28, -26], ["Brisbane", "AU", 153, -27], ["Salisbury", "ZW", 31, -17.8], ["Harare", "ZW", 31, -17.8], ["Botswana", "BW", 24, -22], ["Zagreb", "HR", 16, 45.8]]
  .map(([n, cc, x, y], i) => ({ i: n.toLowerCase() + i, n, cc, c: 5, x, y }));
const ctx = { map: A.buildMap(rows), given: A.buildGiven([{ canon: "Ivan", id: "ivan", langs: { english: [{ form: "Ivan", status: "same" }] } }]), skip: {}, countries: { ZA: "South Africa", AU: "Australia", ZW: "Zimbabwe", BW: "Botswana", HR: "Croatia" } };
const stop = (p, w) => p.route.filter((s) => s.word === w)[0];

test("an age told right after a place is that place's: Botswana is age 3, 1954, and Salisbury no longer claims it", () => {
  const p = F.parseStory("my fathers name was ivan, he came from croatia via johannesburg and then moved to brisbane in 2019. my dad was born in 1951, moved to botswana when he was 3 years old, then he moved to Salisbury, rhodesia,. My father was born in 1951.", ctx, null);
  const bw = stop(p, "botswana"), sa = stop(p, "salisbury");
  assert.equal(bw.age, 3); assert.equal(bw.year, 1954);
  assert.equal(sa.approx, true, "Salisbury's age is only between its neighbours, not told");
});

test("the old order still holds: an age before the place, 'when he was 3 he moved to Salisbury', is Salisbury's", () => {
  const p = F.parseStory("My father was born in 1951 in Zagreb. When he was 3 he moved to Salisbury.", ctx, null);
  assert.equal(stop(p, "salisbury").age, 3); assert.equal(stop(p, "salisbury").year, 1954);
});

test("a later age after a later place goes to that place", () => {
  const p = F.parseStory("He was born in Zagreb in 1951 and moved to Botswana at age 3, then Harare when he was 10.", ctx, null);
  assert.equal(stop(p, "botswana").age, 3); assert.equal(stop(p, "harare").age, 10);
});

test("the story page reads the place they came from from the birth year to the year they left", () => {
  const src = fs.readFileSync(path.join(here, "../public/js/story-engine.js"), "utf8");
  assert.match(src, /x\.role === "origin" && y == null && f\.born != null/);
  assert.match(src, /"from birth, " \+ y/);
  assert.match(src, /hi = Math\.max\(hi, Math\.max\.apply\(null, ends\)\)/);
});
