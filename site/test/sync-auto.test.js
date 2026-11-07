/* Always-on sync: what counts as a change, and what to do after looking at the online copy. The network half is sync.test.js. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js/sync-auto.js"), "utf8"))(m);
const { fingerprint, plan, WATCH } = m.exports;

test("the fingerprint changes when any watched value changes, and not otherwise", () => {
  const a = fingerprint(["{\"marks\":1}", null, "x"]);
  assert.equal(a, fingerprint(["{\"marks\":1}", null, "x"]));
  assert.notEqual(a, fingerprint(["{\"marks\":2}", null, "x"]));
  assert.notEqual(a, fingerprint(["{\"marks\":1}", "d", "x"]), "a decision appearing is a change");
  assert.notEqual(fingerprint(["ab", "c"]), fingerprint(["a", "bc"]), "the boundary between values counts");
});

test("everything research-file.js backs up is watched, so a changed link or decision is saved too", () => {
  const rf = fs.readFileSync(path.join(here, "../public/js/research-file.js"), "utf8");
  for (const k of ["ra-fix-decisions-v1", "ra-areas-v1", "ra-gedcom-names-v1", "recordatlas.roots.myheritage-link", "recordatlas.roots.ancestry-site", "recordatlas.roots.myheritage-trees"]) {
    assert.ok(rf.includes(k) && WATCH.includes(k), k);
  }
  assert.ok(WATCH.includes("ra-progress-v1"));
});

test("plan: merge when another device is newer, save when anything differs, do nothing when nothing changed", () => {
  const st = { saved: "2026-11-07T10:00:00.000Z" };
  assert.deepEqual(plan(st, { saved: "2026-11-07T10:00:00.000Z" }, "f1", "f1"), { merge: false, push: false }, "nothing changed");
  assert.deepEqual(plan(st, { saved: "2026-11-07T10:00:00.500Z" }, "f1", "f1"), { merge: false, push: false }, "under a second apart is our own save");
  assert.deepEqual(plan(st, { saved: "2026-11-07T11:00:00.000Z" }, "f1", "f1"), { merge: true, push: true }, "another device saved: merge, then save the union");
  assert.deepEqual(plan(st, { saved: "2026-11-07T10:00:00.000Z" }, "f2", "f1"), { merge: false, push: true }, "a local change");
  assert.deepEqual(plan({}, null, "f1", null), { merge: false, push: true }, "first save");
  assert.deepEqual(plan(st, null, "f1", null), { merge: false, push: true }, "no stored fingerprint yet (synced before this existed): save once");
});

test("conn.js loads it only when the six words are present, and nothing in this file touches the network except through research-sync.js", () => {
  const c = fs.readFileSync(path.join(here, "../public/js/conn.js"), "utf8");
  assert.match(c, /get\(\)\.synced/);
  const s = fs.readFileSync(path.join(here, "../public/js/sync-auto.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(s));
});
