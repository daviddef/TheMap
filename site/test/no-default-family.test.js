/* No family is chosen for the reader: with none picked, a mark writes nothing and the page is told to ask which family it is for. */
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
const two = { v: 2, active: "", marks: {}, lines: { babic: { name: "Babic", where: "", made: "2026-01-01" }, kosina: { name: "Kosina", where: "", made: "2026-01-02" } } };

test("nothing is selected until the reader picks a family", () => {
  const { P } = boot(two);
  assert.equal(P.active(), "");
  assert.equal(P.lines().filter((l) => l.active).length, 0);
});

test("a mark with no family chosen writes nothing and asks which family", () => {
  const { P, events, store } = boot(two);
  assert.equal(P.setState("volume:ABC", "found"), null);
  assert.ok(events.includes("ra-need-family"));
  assert.equal(JSON.parse(store["ra-progress-v1"]).marks["volume:ABC"], undefined, "Babic did not get it");
});

test("once a family is picked the mark goes to that family only", () => {
  const { P } = boot(two);
  P.setActive("kosina"); P.setState("volume:ABC", "found");
  assert.equal(P.raw("volume:ABC").by.kosina.state, "found");
  assert.equal(P.raw("volume:ABC").by.babic, undefined);
});

test("a family the old default had selected is cleared once, and a later pick is kept", () => {
  const { P, store } = boot({ ...two, active: "babic" });
  assert.equal(P.active(), "");
  P.setActive("kosina");
  assert.equal(JSON.parse(store["ra-progress-v1"]).active, "kosina");
});
