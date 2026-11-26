/* «Position doubtful» is the data gate's own rule (scripts/district_names.py `doubtful`, which scripts/build.py writes to place-doubt.json). Made-up places, except where
   the shelf itself is read. */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const py = (code, input) => JSON.parse(execFileSync("python3", ["-c", "import sys, json; sys.path.insert(0, 'scripts'); import district_names as dn\n" + code], { cwd: root, input: JSON.stringify(input || null), maxBuffer: 1 << 26 }).toString());
const doubtful = (places, checked = {}) => py("d = json.load(sys.stdin); print(json.dumps(dn.doubtful(d['places'], d['checked'])))", { places, checked });
/* one degree of latitude is 111.2 km */
const at = (id, name, km, more = {}) => ({ id, name, country: "HR", lat: 44 + km / 111.195, lon: 16, ...more });
const TOWN = at("town", "Grad", 0);

test("the limit is the gate's 60 km", () => {
  assert.equal(py("print(json.dumps(dn.LIMIT_KM))"), 60);
  const got = doubtful([TOWN, at("near", "Selo (Grad)", 59), at("far", "Polje (Grad)", 61)]);
  assert.deepEqual(got, { far: ["Grad", 61] });
});

test("a point a person has checked is not doubted, until the place moves", () => {
  const p = at("far", "Polje (Grad)", 65), ok = { far: { verdict: "correct", lat: p.lat, lon: p.lon, why: "made up" } };
  assert.deepEqual(doubtful([TOWN, p], ok), {});
  assert.deepEqual(Object.keys(doubtful([TOWN, at("far", "Polje (Grad)", 70)], ok)), ["far"]);
});

test("a name written again in another script is not a district", () => {
  const ua = (id, name, km) => at(id, name, km, { country: "UA" });
  const got = doubtful([ua("a", "Добромиль", 0), ua("b", "Dobromil (Добромиль)", 300), ua("c", "Давидківці", 10), ua("d", "Єзупіль (Давидківці)", 200),
    at("e", "Selo (Γρεβενά)", 200), at("f", "Γρεβενά", 0)]);
  assert.deepEqual(got, {});
});

test("an administrative area's middle is not measured from", () => {
  assert.deepEqual(doubtful([at("area", "Pokrajina", 0, { level: "region" }), at("v", "Selo (Pokrajina)", 200)]), {});
});

test("the shelf's own checked places are not doubted, and nothing the gate passes is", () => {
  const got = py("seen = json.load(open('data/geocode-checked.json', encoding='utf-8'))['checked']; P = json.load(open('data/places.json', encoding='utf-8'))['places']; print(json.dumps(dn.doubtful(P, seen)))");
  assert.deepEqual(got, {});
});
