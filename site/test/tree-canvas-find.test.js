/* The Tree Canvas's Find: the search lives in the side panel's first tab, and in the middle of the canvas while it is empty. The pure parts (the results model, the archive menu,
   when the centred box shows, the "/" key, where a drag may drop) are cut out of the vendored canvas (scripts/roots/tree-canvas.template.html) and run in a VM, so what is tested
   is what ships; the page's wiring is checked as text. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TPL = fs.readFileSync(path.join(here, "../../scripts/roots/tree-canvas.template.html"), "utf8");
const code = /<script>(\/\* logic\.js[\s\S]*?)<\/script>/.exec(TPL);
assert.ok(code, "the canvas template's logic block moved: this test cuts it out by its first comment");
const ctx = vm.createContext({ console }); ctx.window = ctx; vm.runInContext(code[1], ctx);
const F = ctx.TCFIND, J = x => JSON.parse(JSON.stringify(x));
assert.ok(F && F.resultsModel && F.slashPlan, "the template carries Find (rebuild the Tree Canvas with --embed and vendor it)");

test("the page has no search dock any more: Find is the pane's first tab, with a centred search for an empty canvas", () => {
  assert.ok(!/id="bShelf"|id="shelf"|class="srow"/.test(TPL), "the old dock search is gone");
  assert.ok(/id="start"/.test(TPL) && /id="stBox"/.test(TPL), "the centred search is there");
  assert.ok(/id="bFind"/.test(TPL), "a toolbar button opens Find");
  assert.ok(/tabs = \[\['find', 'Find'\], \['person', 'Person'\]/.test(TPL), "Find is the first tab");
  assert.ok(/role="tablist"/.test(TPL) && /role="tab"/.test(TPL) && /aria-selected=/.test(TPL) && /role="tabpanel"/.test(TPL), "the tabs have their roles");
  assert.ok(/role="listbox"/.test(TPL) && /role="status" aria-live="polite"/.test(TPL), "results are a listbox, with a live region");
  assert.ok(/id="rz"/.test(TPL), "the relate slots are still there for a drop");
});

test("the results say how many, and why none", () => {
  const per = [0, 0, 0];
  assert.equal(F.resultsModel("", { list: [], total: 0, perArchive: per }, 3, 3).kind, "idle");
  assert.equal(F.resultsModel("x", { list: [], total: 0, perArchive: per }, 0, 3).kind, "noarch");
  const m = F.resultsModel("lerena", { list: new Array(80).fill({ i: 1 }), total: 467, perArchive: per }, 3, 3);
  assert.equal(m.say, "467 people found, showing the first 80");
});

test("the archive menu: one button, a tick for each archive, All and None", () => {
  const A = [{ name: "A", color: "#111", n: 3 }, { name: "B", color: "#222", n: 4 }];
  assert.equal(F.archMenu(A, F.archAll(2)).label, "2 of 2 archives");
  assert.deepEqual([...F.archToggle(F.archAll(2), 0, 2)], [1]);
  assert.equal(J(F.archMenu(A, F.archNone())).none, true);
});

test("the centred search shows only on an empty canvas, and '/' goes where it should", () => {
  assert.equal(F.startShown({ cards: 0 }), true); assert.equal(F.startShown({ cards: 2 }), false); assert.equal(F.startShown({ cards: 0, fan: true }), false);
  assert.equal(F.slashPlan({ key: "/", start: true }), "start"); assert.equal(F.slashPlan({ key: "/" }), "pane"); assert.equal(F.slashPlan({ key: "/", typing: true }), null);
});

test("a dragged result is dropped on the canvas or into the slots, and cancelled over a panel", () => {
  const r = (l, t, rr, b) => ({ left: l, top: t, right: rr, bottom: b });
  assert.equal(F.dropZone({ x: 10, y: 10 }), "canvas");
  assert.equal(F.dropZone({ x: 900, y: 10, info: r(860, 0, 1200, 800) }), "none");
  assert.equal(F.dropZone({ x: 300, y: 770, rz: r(200, 750, 600, 790) }), "rz");
});
