/* data/place-fixes.json: corrections to shelf places, each with its evidence. places.json must keep carrying them, whatever script last wrote it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const data = (f) => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data", f), "utf8"));
const places = new Map(data("places.json").places.map((p) => [p.id, p]));
const fixes = data("place-fixes.json");

test("every correction is still on the shelf", () => {
  for (const f of fixes.fixes) {
    const p = places.get(f.id);
    assert.ok(p, f.id);
    assert.ok(f.evidence && f.evidence.length > 40, f.id + " states its evidence");
    for (const [k, v] of Object.entries(f.set)) {
      if (k === "names") for (const n of v) assert.ok((p.names || []).some((x) => x.n === n.n), f.id + " keeps the name " + n.n);
      else assert.deepEqual(p[k], v, f.id + "." + k);
    }
  }
});

test("every place added by hand is still on the shelf, where it was put", () => {
  for (const a of fixes.add) {
    const p = places.get(a.id);
    assert.ok(p, a.id);
    assert.deepEqual([p.name, p.lat, p.lon], [a.name, a.lat, a.lon]);
  }
});

test("the two Drežniks are two places, and the old address still names the Zagreb one", () => {
  assert.equal(places.get("dreznik").name, "Drežnik Brezovički");
  assert.match(places.get("drezniknovagradiska").name, /^Drežnik \(Nova Gradiška\)$/);
  assert.match(places.get("dreznik").question, /Not established/);
});
