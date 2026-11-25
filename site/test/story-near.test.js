/* «DREŽNIK NEAR NOVA GRADIŠKA» IS THE DREŽNIK BESIDE THAT TOWN. The Atlas held one Drežnik with a register, 127 km away near Zagreb, and the story reader
   took it: wrong card, wrong ground, wrong books. The one the worldwide gazetteer places 8 km from Nova Gradiška is the one told. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const A = load("atlas-summary.js"), F = load("story-engine.js", { summary: A });

const rows = [
  { i: "dreznik", n: "Drežnik", cc: "HR", c: 1, v: 1, y: 45.72239, x: 15.89547 },
  { i: "novagradiska", n: "Nova Gradiška", cc: "HR", c: 17, v: 17, y: 45.25876, x: 17.37984 },
  { i: "zagreb", n: "Zagreb", cc: "HR", c: 40, v: 40, y: 45.81, x: 15.98 }];
/* [name, lat, lon, country, other names], as a gazetteer shard holds them */
const SHARD = [["Drežnik Brezovički", 45.7224, 15.8955, "HR", ["Dreznik"]], ["Drežnik", 45.2903, 17.4697, "HR", []], ["Drežnik", 45.4608, 15.2039, "SI", []], ["Drežnik", 44.5347, 18.6379, "BA", []]];
function read(text) {
  const c = { map: A.buildMap(rows), given: A.buildGiven([]), skip: {}, countries: { HR: "Croatia", SI: "Slovenia", BA: "Bosnia and Herzegovina" } };
  for (const w of F.gazWants(text, c.map, c.given)) if (w.ph === "dreznik") F.gazMerge(c.map, w, SHARD);
  return F.parseStory(text, c);
}
const lived = (p) => (p.places || p.route || []).find((s) => s.word === "dreznik");

test("the gazetteer is asked for a place told as near another, though the Atlas holds one of that name", () => {
  const w = F.gazWants("They lived in Dreznik near Nova Gradiska.", A.buildMap(rows), {}).find((x) => x.ph === "dreznik");
  assert.ok(w && w.near && w.more);
});

test("the namesake beside the told town is chosen", () => {
  const s = lived(read("My great grandfather was Ivan. They lived in Dreznik near Nova Gradiska."));
  assert.equal(s.row.cc, "HR");
  assert.ok(Math.abs(s.row.y - 45.2903) < 0.001, JSON.stringify(s.row));
  assert.equal(s.nearTo.row.i, "novagradiska");
  assert.equal(s.alts.length, 0, "the story says which one");
});

test("the namesake already beside the told town is kept", () => {
  const s = lived(read("They lived in Dreznik near Zagreb."));
  assert.equal(s.row.i, "dreznik");
});

test("a place told alone is read as before", () => {
  const s = lived(read("They lived in Dreznik."));
  assert.equal(s.row.i, "dreznik");
});
