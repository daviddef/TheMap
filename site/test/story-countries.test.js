/* A story that names a country, a county, a wife and some years: "from County Cork in Ireland in 1928. He moved to South Africa i 1942, and then to
   Johannesburg and then to Brisbane. He married a woman named Cheryl". It once read "county" as Iredell County, "Ireland" as a village in Canada, Cheryl as
   the grandfather, and no year as anyone's. Each of those is a thing a reader saw wrong. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();

const rows = [
  { i: "cork", n: "Cork", cc: "IE", c: 20, x: -8.47, y: 51.9 },
  { i: "dublin", n: "Dublin", cc: "IE", c: 30, x: -6.26, y: 53.35 },
  { i: "ireland-ca", n: "Ireland", cc: "CA", c: 0, v: 20, x: -80.1, y: 43.2 },
  { i: "iredell", n: "Iredell County", cc: "US", c: 0, v: 11031, x: -80.84, y: 35.67, q: "county iredell" },
  { i: "joburg", n: "Johannesburg", cc: "ZA", c: 6, x: 28.04, y: -26.2 },
  { i: "pretoria", n: "Pretoria", cc: "ZA", c: 4, x: 28.19, y: -25.75 },
  { i: "south-africa", n: "South Africa", cc: "ZA", c: 0, a: 1, x: 24.9, y: -29 },
  { i: "brisbane", n: "Brisbane", cc: "AU", c: 3, x: 153.02, y: -27.47 },
  { i: "sydney", n: "Sydney", cc: "AU", c: 9, x: 151.2, y: -33.87 },
];
const countries = { IE: "Ireland", ZA: "South Africa", AU: "Australia", CA: "Canada", US: "United States of America" };
const ctx = { map: A.buildMap(rows), given: A.buildGiven([{ canon: "Cheryl", id: "cheryl", langs: { english: [{ form: "Cheryl", status: "same" }] } }]), skip: {}, countries };
const STORY = "MY GRANDFATHER WAS A STONEMASON FROM COUNTY CORK IN IRELAND IN 1928. HE MOVED TO SOUTH AFRICA I 1942, AND THEN TO JOHANNESBURG AND THEN TO BRISBANE. HE MARRIED A WOMAN NAMED CHERYL AND THEY HAD 5 CHILDREN AND 12 GRANDCHILDREN.";

test("the word county is not a place, and Ireland written after Cork is the country", () => {
  const p = F.parseStory(STORY, ctx);
  assert.deepEqual(p.stops.map((s) => s.row.i), ["cork", "joburg", "brisbane"], "Cork, Johannesburg, Brisbane: no Iredell County, no village of Ireland in Canada");
  assert.equal(p.stops[0].role, "origin");
});

test("the years beside the places are theirs, and a typed I for in is read", () => {
  const p = F.parseStory(STORY, ctx);
  assert.equal(p.stops[0].year, 1928);
  assert.equal(p.stops[1].year, 1942, "moved to South Africa i 1942: the year goes to the first place in South Africa");
  assert.equal(p.stops[2].year, null, "Brisbane was given no year, and is given none");
  assert.equal(p.stops[0].yearTold, true);
});

test("a name given to a wife is not the name of the grandfather, and the wife is on the tree", () => {
  const p = F.parseStory(STORY, ctx);
  assert.equal(p.name, "");
  assert.equal(p.rel, "grandfather");
  const spouse = p.people.find((x) => x.role === "spouse");
  assert.equal(spouse.name, "Cheryl");
  const self = p.people.find((x) => x.role === "self");
  assert.equal(self.unnamed, true, "an unnamed grandfather is still on the tree");
});

test("a country the gazetteer has no place for is a stop at the middle of its places, and is plainly a country", () => {
  const p = F.parseStory("My grandfather came from Ireland to Brisbane in 1950", ctx);
  assert.equal(p.stops[0].row.country, true);
  assert.equal(p.stops[0].row.n, "Ireland");
  assert.equal(p.stops[0].row.cc, "IE");
  assert.ok(p.stops[0].row.x > -10 && p.stops[0].row.x < -6, "the middle of the Irish places, not Canada");
  assert.equal(p.stops[1].row.i, "brisbane");
  assert.equal(p.stops[1].year, 1950);
});

test("a country the gazetteer does hold a place for is that place", () => {
  const p = F.parseStory("My grandfather moved to South Africa in 1942", ctx);
  assert.equal(p.stops.length, 1);
  assert.equal(p.stops[0].row.i, "south-africa");
  assert.equal(p.stops[0].year, 1942);
});

test("a story with no countries or years reads as before", () => {
  const p = F.parseStory("My grandfather came from Cork to Brisbane", ctx);
  assert.deepEqual(p.stops.map((s) => s.row.i), ["cork", "brisbane"]);
  assert.equal(p.stops[0].year, null);
});
