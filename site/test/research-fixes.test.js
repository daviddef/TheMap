/* My research has no tab row any more. The saved tree fixes are one line with the number left and a link to the Fix list, with the saved list in a shut fold,
 * nothing at all when there is nothing to fix, and every old tab address still lands somewhere. File names and places here are invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fakeDom, fakeStore } from "./fakedom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const KEY = "ra-gedcom-fixes-v1";

const saved = (over = {}) => JSON.stringify({ v: 1, trees: { "invented.ged": Object.assign({ saved: "2026-11-20",
  sections: [{ group: "Dates", title: "Dates to check", total: 10, done: 3, asis: 1 }, { group: "Places", title: "Places to choose", total: 2, done: 0, asis: 0 }],
  places: [{ t: "Nowhereville", s: "o" }] }, over) } });

function run(stored, hash = "") {
  const doc = fakeDom(), box = doc.add("div", "mr-fixes"), stories = doc.add("div", "mr-stories"), win = {};
  box.hidden = true;
  doc.currentScript = { getAttribute: () => "/" };
  const store = fakeStore(stored ? { [KEY]: stored } : {}), location = { hash };
  vm.runInNewContext(read("public/js/research-fixes.js"), { document: doc, localStorage: store, location, setTimeout: f => f(),
    window: { addEventListener: (t, f) => { win[t] = f; } } });
  return { doc, box, stories, store, location, win };
}

test("saved fixes are one line with the count, a link to the Fix list, and the saved list in a shut fold", () => {
  const { box } = run(saved());
  assert.equal(box.hidden, false);
  assert.match(box.querySelector("p.mr-fixline").textContent, /^8 fixes left in your tree file\./);
  assert.equal(box.querySelector("p.mr-fixline").querySelector("a").href, "/tree-canvas/?resume=1&to=fix");
  const fold = box.querySelector("details.mr-fixsaved");
  assert.equal(fold.open, false, "shut until it is asked for");
  assert.match(fold.textContent, /invented\.ged[\s\S]*Dates to check[\s\S]*6 of 10 left[\s\S]*Nowhereville[\s\S]*Forget this list/);
});

test("nothing is shown when there is nothing to fix", () => {
  for (const stored of [null, "not json", JSON.stringify({ v: 1, trees: {} }), saved({ sections: [{ title: "Dates", total: 4, done: 3, asis: 1 }], places: [] })]) {
    const { box } = run(stored);
    assert.equal(box.hidden, true); assert.equal(box.textContent, "");
  }
});

test("forgetting the last list takes the line away", () => {
  const { box, store } = run(saved());
  box.querySelector("button").fire("click");
  assert.equal(store.getItem(KEY), null); assert.equal(box.hidden, true);
});

test("the old addresses still land somewhere", () => {
  let r = run(saved(), "#fixes");
  assert.equal(r.box.querySelector("details.mr-fixsaved").open, true, "#fixes opens the saved list");
  assert.equal(r.box.scrolled, 1);
  r = run(null, "#fixes"); assert.equal(r.box.scrolled, 0, "nothing saved: the reader stays at the top of the research view");
  for (const h of ["#story", "#story/abc"]) { r = run(saved(), h); assert.equal(r.stories.scrolled, 1, h); }
  for (const h of ["#all", "#sessions", ""]) { r = run(saved(), h); assert.equal(r.stories.scrolled + r.box.scrolled, 0, h); }
  r = run(saved(), ""); r.location.hash = "#fixes"; r.win.hashchange(); assert.equal(r.box.querySelector("details.mr-fixsaved").open, true, "followed from the same page too");
});

test("the page has no tab row, keeps the research view, and the Tree Canvas can be asked to open on its Fix list", () => {
  const page = read("src/pages/my-research.astro");
  assert.doesNotMatch(page, /role="tab(list|panel)?"|mr-t-fixes|mr-t-sessions|mr-p-fixes|mr-p-sessions|id="mr-sess"|GEDCOM to fix|Other names/);
  assert.match(page, /class="rs-panel mr-panel" id="mr-p-families"/);
  assert.match(page, /id="mr-fixes"[^>]*hidden/); assert.match(page, /research-fixes\.js/);
  assert.match(read("public/tree-canvas/app.js"), /get\('to'\) === 'fix' \? 'fix' : null/);
  assert.match(read("src/pages/tree-canvas/index.astro"), /\/my-research\/#fixes/);
});

test("a landing follows its target while the page above is still being drawn, and lets go once the reader moves", () => {
  const doc = fakeDom(), box = doc.add("div", "mr-fixes"), stories = doc.add("div", "mr-stories"), win = {}, queue = [];
  doc.currentScript = { getAttribute: () => "/" };
  let top = 100; stories.getBoundingClientRect = () => ({ top });
  vm.runInNewContext(read("public/js/research-fixes.js"), { document: doc, localStorage: fakeStore(), location: { hash: "#story" }, setTimeout: f => queue.push(f),
    window: { addEventListener: (t, f) => { win[t] = f; } } });
  const tick = () => queue.shift()();
  tick(); tick(); assert.equal(stories.scrolled, 1, "still where it was: left alone");
  top = 900; tick(); assert.equal(stories.scrolled, 2, "pushed down: followed");
  win.wheel(); top = 1500; tick(); assert.equal(stories.scrolled, 2); assert.equal(queue.length, 0);
});
