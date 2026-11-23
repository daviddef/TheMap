/* Two families can be made one, and what the reader merged or removed is not brought back by the next publish of the family sessions. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "../public/js/progress-kit.js"), "utf8");
function boot(stored) {
  const store = { "ra-progress-v1": JSON.stringify(stored) }, events = [];
  const window = {}, localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const document = { dispatchEvent: (e) => events.push(e.type), addEventListener() {}, readyState: "complete", documentElement: { getAttribute: () => "/" } };
  class CustomEvent { constructor(type) { this.type = type; } }
  new Function("window", "localStorage", "document", "CustomEvent", "fetch", src)(window, localStorage, document, CustomEvent, () => new Promise(() => {}));
  return { P: window.raProgress, events, store };
}
const L = (name) => ({ name, where: "", made: "2026-01-01" });
const base = () => ({
  v: 2, noDefault: 1, active: "llerena",
  lines: { lerena: L("Lerena"), llerena: L("Llerena"), kosina: L("Kosina") },
  marks: {
    "volume:A": { t: "A", by: { lerena: { done: [[1, 10]], state: "searched", note: "first", since: "2026-02-01" }, llerena: { done: [[8, 20]], state: "found", note: "second", since: "2026-03-01" } } },
    "volume:B": { t: "B", by: { llerena: { done: [[1, 5]], since: "2026-03-02" } } },
    "volume:C": { t: "C", by: { kosina: { state: "planned" } } },
  },
});

test("merging puts the work of one family under the other, losing nothing", () => {
  const { P } = boot(base());
  const r = P.mergeLines("llerena", "lerena");
  assert.equal(r.moved, 2);
  assert.deepEqual(P.lines().map((l) => l.slug).sort(), ["kosina", "lerena"]);
  const a = P.raw("volume:A").by;
  assert.equal(a.llerena, undefined);
  assert.deepEqual(a.lerena.done, [[1, 20]], "pages are unioned");
  assert.equal(a.lerena.state, "found", "the state that is further along wins");
  assert.equal(a.lerena.note, "first · second");
  assert.equal(a.lerena.since, "2026-03-01");
  assert.deepEqual(P.raw("volume:B").by.lerena.done, [[1, 5]], "a book only the merged family had moves across");
  assert.equal(P.raw("volume:C").by.kosina.state, "planned", "another family is untouched");
});

test("the active family follows a merge, and a merge with itself or a stranger does nothing", () => {
  const { P } = boot(base());
  assert.equal(P.active(), "llerena");
  assert.equal(P.mergeLines("lerena", "lerena"), null);
  assert.equal(P.mergeLines("lerena", "nobody"), null);
  assert.equal(P.lines().length, 3);
  P.mergeLines("llerena", "lerena");
  assert.equal(P.active(), "lerena");
});

test("a family that was merged is folded into the target when the sessions are published again", () => {
  const { P } = boot(base());
  P.mergeLines("llerena", "lerena");
  const published = {
    v: 2, lines: { lerena: L("Lerena"), llerena: L("Llerena") },
    marks: { "volume:A": { t: "A", by: { llerena: { done: [[30, 40]], state: "found" } } }, "volume:Z": { t: "Z", by: { llerena: { state: "planned" } } } },
  };
  P.fromJSON(JSON.stringify(published), "merge");
  assert.deepEqual(P.lines().map((l) => l.slug).sort(), ["kosina", "lerena"], "no second family comes back");
  assert.deepEqual(P.raw("volume:A").by.lerena.done, [[1, 20], [30, 40]]);
  assert.equal(P.raw("volume:Z").by.lerena.state, "planned");
  assert.equal(P.raw("volume:A").by.llerena, undefined);
});

test("a family that was removed stays removed when the sessions are published again", () => {
  const { P } = boot(base());
  assert.ok(P.removeLine("kosina"));
  const published = { v: 2, lines: { kosina: L("Kosina") }, marks: { "volume:C": { t: "C", by: { kosina: { state: "found" } } }, "volume:D": { t: "D", by: { kosina: { state: "found" } } } } };
  P.fromJSON(JSON.stringify(published), "merge");
  assert.equal(P.lines().some((l) => l.slug === "kosina"), false);
  assert.equal(P.raw("volume:D"), null, "no empty mark is left behind");
});

test("making the family again, on purpose, brings it back", () => {
  const { P } = boot(base());
  P.removeLine("kosina");
  const slug = P.addLine("Kosina", "");
  assert.equal(slug, "kosina");
  P.fromJSON(JSON.stringify({ v: 2, lines: { kosina: L("Kosina") }, marks: { "volume:D": { t: "D", by: { kosina: { state: "found" } } } } }), "merge");
  assert.equal(P.raw("volume:D").by.kosina.state, "found");
});

test("a merge made on another machine arrives and merges the two here too", () => {
  const { P } = boot(base());
  const theirs = { ...base(), lines: { lerena: L("Lerena"), kosina: L("Kosina") }, alias: { llerena: "lerena" }, marks: { "volume:A": { t: "A", by: { lerena: { done: [[50, 60]] } } } } };
  P.fromJSON(JSON.stringify(theirs), "merge");
  assert.equal(P.lines().some((l) => l.slug === "llerena"), false);
  assert.deepEqual(P.raw("volume:A").by.lerena.done, [[1, 20], [50, 60]]);
});

test("the choice travels in the file, and a restore (replace) keeps what the file says", () => {
  const a = boot(base());
  a.P.mergeLines("llerena", "lerena");
  const file = JSON.parse(a.P.toJSON());
  assert.equal(file.alias.llerena, "lerena");
  const b = boot(base());
  b.P.fromJSON(JSON.stringify({ v: 2, lines: { llerena: L("Llerena") }, marks: { "volume:A": { t: "A", by: { llerena: { state: "found" } } } }, alias: { llerena: "lerena" } }), "replace");
  assert.ok(b.P.lines().some((l) => l.slug === "llerena"), "a restore is not rewritten");
});
