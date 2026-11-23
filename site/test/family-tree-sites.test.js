/* The family-tree and genealogy sites (FamilySearch, Ancestry, MyHeritage, Geni, ...) are offered on every place card, ranked, with the regional ones
   only where they reach, and the specialist worldwide sources are not swept in. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(here, "../../data/providers.json"), "utf8")).providers;
const map = fs.readFileSync(path.join(here, "../src/components/RecordMap.astro"), "utf8");
const flagged = P.filter((p) => p.family_tree).sort((a, b) => a.family_tree - b.family_tree);

test("a dozen sites carry a rank, each rank once, and every one is a real provider with a web address", () => {
  assert.equal(flagged.length, 12);
  assert.deepEqual(flagged.map((p) => p.family_tree), flagged.map((_, i) => i + 1));
  for (const p of flagged) assert.match(p.url, /^https:\/\//, p.id);
  for (const id of ["familysearch", "ancestry", "myheritage", "geni", "findmypast", "wikitree", "geneanet", "findagrave", "billiongraves"]) assert.ok(flagged.some((p) => p.id === id), id + " is in the group");
});

test("the specialist worldwide sources are not in the group", () => {
  const ids = new Set(flagged.map((p) => p.id));
  for (const id of ["jewishgen", "yadvashem", "geonames", "david-rumsey-map-collection", "twgpp", "aircrew-remembered", "fold3"]) assert.equal(ids.has(id), false, id);
});

test("a regional site is scoped to the countries it reaches, a global one to everywhere", () => {
  const by = Object.fromEntries(flagged.map((p) => [p.id, p.countries || []]));
  assert.ok(by.findmypast.includes("AU") && !by.findmypast.includes("*"));
  assert.deepEqual(by.genealogybank, ["US"]);
  assert.ok(by.ancestry.includes("*") && by.myheritage.includes("*") && by.geni.includes("*"));
});

test("the place card draws the group after the country's own sources, from the directory's flag", () => {
  assert.match(map, /function familyTreeSites\(cc\)/);
  assert.match(map, /p\.family_tree && \(c\.indexOf\("\*"\) > -1 \|\| \(cc && c\.indexOf\(cc\) > -1\)\)/);
  const solo = map.slice(map.indexOf("function areaRenderSolo(R)"));
  assert.ok(solo.indexOf("familyTreeSites(d.country)") > solo.indexOf("areaCountrySources(R)"), "after the country groups");
  assert.ok(solo.indexOf("familyTreeSites(d.country)") < solo.indexOf("areaGovStates(d)"), "before the governing states");
});

test("a name attested in several countries lists the worldwide sources once, after the last country that has sources", () => {
  assert.match(map, /var withSrc = order\.filter\(function \(cc\) \{ return cc && natProviders\(cc\)\.length; \}\);/);
  assert.match(map, /undefined, undefined, null, i < withSrc\.length - 1\)\);/);
});

test("a search that does not name the open place lets go of it: the address, and the shelf's memory of it", () => {
  assert.match(map, /setQ\("at", ""\); if \(window\.raShelfForget\) window\.raShelfForget\(\);/);
  assert.match(map, /window\.raShelfForget = function \(\) \{ SH\.lastPl = null;/);
});

test("the years typed after a name are not part of the name that is looked up", () => {
  assert.match(map, /elsewhere\(yearsIn\(qbox\.value\)\.text \|\| qbox\.value\.trim\(\)\);/);
});
