/* TWO THINGS A STORY PAGE SAID THAT WERE WRONG (data/regions.json). A village of Gorski Kotar stood in the Rijeka region, so 1918-1943 read «Italy»; and the
   Military Frontier's notes sent a 1918-1945 birth to «state registers of 1895», which Croatia-Slavonia did not keep: its church registers were the official ones
   until May 1946 (State Archives in Varaždin, https://dav.hr/gradanske-maticne-knjige/). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data");
const regions = JSON.parse(fs.readFileSync(path.join(DATA, "regions.json"), "utf8")).regions;
const inside = (lat, lon, ring) => ring.reduce((hit, a, i) => {
  const b = ring[(i + 1) % ring.length];
  return (a[1] > lon) !== (b[1] > lon) && lat < ((b[0] - a[0]) * (lon - a[1])) / (b[1] - a[1]) + a[0] ? !hit : hit;
}, false);
/* the rule of scripts/geo.py region_for: the first ring that holds the point */
const regionAt = (lat, lon) => regions.find((r) => !(r.strict && !r.countries.includes("HR")) && inside(lat, lon, r.ring));
const eraAt = (r, y) => r.eras.find((e) => e.from <= y && y < e.to);

for (const [name, lat, lon] of [["Fužine", 45.305, 14.714], ["Lič", 45.279, 14.719], ["Delnice", 45.401, 14.8], ["Mrkopalj", 45.316, 14.855], ["Ravna Gora", 45.373, 14.935]]) {
  test(name + " was not Italian between the wars", () => {
    const r = regionAt(lat, lon);
    assert.equal(r.id, "gorski-kotar");
    assert.equal(eraAt(r, 1928).regime, "yugo");
    assert.match(eraAt(r, 1942).polity, /Divided/);
  });
}

test("Rijeka stays on the Italian side and Trsat, across the river, does not", () => {
  assert.equal(regionAt(45.327, 14.444).id, "kvarner");
  assert.equal(regionAt(45.334, 14.465).id, "senj-vinodol-coast");
  assert.equal(eraAt(regionAt(45.334, 14.465), 1928).regime, "yugo");
});

test("no Croatian note sends a birth to state registers of 1895, and the frontier's say when state registration began", () => {
  const frontier = regions.find((r) => r.id === "vojna-krajina");
  for (const y of [1890, 1928, 1950]) assert.match(eraAt(frontier, y).note, /1946/, String(y));
  assert.match(eraAt(frontier, 1928).note, /church \(parish\) registers remain the official registers/);
  for (const r of regions.filter((x) => x.countries.length === 1 && x.countries[0] === "HR"))
    for (const e of r.eras) assert.doesNotMatch(e.note || "", /state registers of 1895/i, r.id + " " + e.from);
});
