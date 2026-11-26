/* «About the name» when the Research page reads several families: one row of name chips and one card open at a time, a «Show all» fold for many, every
 * family in its place at once with slow and failed cards saying so, and nothing the reader opened or focused lost on a redraw. Names here are invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fakeDom, fakeStore } from "./fakedom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");

function setup(narrow) {
  const doc = fakeDom(), host = doc.add("div", "mr-intro"), mod = { exports: {} };
  vm.runInNewContext(read("public/js/name-intro.js"), { module: mod, document: doc, localStorage: fakeStore(), setTimeout: f => f() });
  const N = mod.exports, v = N.view(host, "/", { narrow: () => !!narrow });
  const card = (name, over) => Object.assign(N.build(null), { name }, over);
  return { N, v, host, doc, card,
    chips: () => host.querySelectorAll("button.ni-chip"), panel: () => host.querySelector("div.ni-panel"), more: () => host.querySelector("button.ni-allbtn") };
}
const names = n => Array.from({ length: n }, (_, i) => "Zz" + String(i).padStart(2, "0"));

test("one family stays one shut line, as before", () => {
  const { v, host, card } = setup();
  v.set(["Zzaa"]);
  assert.equal(host.children.length, 1); assert.equal(host.children[0].tagName, "DETAILS");
  assert.match(host.textContent, /About the name Zzaa[\s\S]*loading/);
  v.put("Zzaa", card("Zzaa"));
  assert.equal(host.children.length, 1); assert.equal(host.children[0].tagName, "DETAILS"); assert.equal(host.children[0].open, false);
  assert.match(host.textContent, /no entry for this surname yet/);
});

test("several families are one row of chips, each in its place at once, and one card open at a time", () => {
  const { v, host, chips, panel, card } = setup();
  v.set(["Zzaa", "Zzbb", "Zzcc"]);
  assert.match(host.textContent, /^About the names/);
  assert.deepEqual(chips().map(c => c.children[0].textContent), ["Zzaa", "Zzbb", "Zzcc"]);
  assert.equal(host.querySelectorAll("section.ni").length, 0, "nothing is open until it is asked for");
  assert.equal(panel().hidden, true);
  for (const c of chips()) { assert.equal(c.getAttribute("aria-expanded"), "false"); assert.equal(c.getAttribute("aria-controls"), panel().id); assert.match(c.textContent, /\(loading\)/); }
  chips()[1].fire("click");
  assert.equal(panel().hidden, false); assert.match(panel().textContent, /Loading the card for Zzbb/);
  assert.equal(chips()[1].getAttribute("aria-expanded"), "true");
  v.put("Zzbb", card("Zzbb")); v.put("Zzaa", card("Zzaa"));
  assert.match(panel().textContent, /About the name Zzbb[\s\S]*no entry for this surname yet/, "the card arrives in the open panel");
  chips()[0].fire("click");
  assert.equal(panel().children.length, 1); assert.match(panel().textContent, /About the name Zzaa/);
  assert.equal(chips()[1].getAttribute("aria-expanded"), "false");
  chips()[0].fire("click"); assert.equal(panel().hidden, true, "pressing it again shuts it");
});

test("a card that could not be loaded says so, and a late real card replaces it", () => {
  const { v, chips, panel, card } = setup();
  v.set(["Zzaa", "Zzbb"]);
  v.put("Zzaa", card("Zzaa", { failed: true }));
  assert.match(chips()[0].textContent, /Zzaa \(not loaded\)/);
  chips()[0].fire("click"); assert.match(panel().textContent, /could not be loaded just now[\s\S]*nothing about the name/);
  assert.equal(v.done("Zzaa"), false, "asked again on the next redraw");
  v.put("Zzaa", card("Zzaa"));
  assert.doesNotMatch(chips()[0].textContent, /not loaded/); assert.match(panel().textContent, /no entry for this surname yet/); assert.equal(v.done("Zzaa"), true);
  v.put("Zzaa", card("Zzaa", { failed: true }));
  assert.doesNotMatch(chips()[0].textContent, /not loaded/, "a slow-request timer cannot undo a card that arrived");
});

test("a redraw keeps the open card, the very same elements and the focus", () => {
  const { v, doc, chips, panel, card } = setup();
  v.set(["Zzaa", "Zzcc"]); v.put("Zzaa", card("Zzaa")); chips()[0].fire("click"); chips()[0].focus();
  const chip = chips()[0], shownCard = panel().children[0];
  v.set(["Zzaa", "Zzbb", "Zzcc"]);
  assert.equal(chips()[0], chip); assert.equal(doc.activeElement, chip); assert.equal(panel().children[0], shownCard);
  assert.deepEqual(chips().map(c => c.children[0].textContent), ["Zzaa", "Zzbb", "Zzcc"], "the new one goes in its place");
  v.set(["Zzbb", "Zzcc"]);
  assert.equal(panel().hidden, true, "an unticked family takes its open card with it"); assert.equal(chips().length, 2);
});

test("Escape in an open card shuts it and returns to its chip", () => {
  const { v, doc, chips, panel, card } = setup();
  v.set(["Zzaa", "Zzbb"]); v.put("Zzaa", card("Zzaa")); chips()[0].fire("click");
  panel().fire("keydown", { key: "Escape" });
  assert.equal(panel().hidden, true); assert.equal(doc.activeElement, chips()[0]);
});

test("a family that is not a surname loses its place and stays gone", () => {
  const { v, host, chips } = setup();
  v.set(["Zzaa", "Zzbb"]); v.drop("Zzaa");
  assert.equal(chips().length, 1); assert.equal(v.done("Zzaa"), true);
  v.set(["Zzaa", "Zzbb"]); assert.equal(chips().length, 1);
  v.drop("Zzbb"); assert.equal(host.hidden, true);
});

test("ninety families fold to the first few, with Show all, and the open one is never folded away", () => {
  for (const narrow of [false, true]) {
    const { N, v, chips, more, host } = setup(narrow), limit = narrow ? N.FOLD_NARROW : N.FOLD, all = names(90);
    v.set(all);
    const visible = () => chips().filter(c => !c.hidden).length;
    assert.equal(chips().length, 90); assert.equal(visible(), limit);
    assert.equal(more().hidden, false); assert.equal(more().textContent, "Show all 90"); assert.equal(more().getAttribute("aria-expanded"), "false");
    more().fire("click");
    assert.equal(visible(), 90); assert.equal(more().textContent, "Show fewer"); assert.equal(more().getAttribute("aria-expanded"), "true");
    assert.equal(host.querySelector("div.ni-chips").classList.contains("is-all"), true, "the long list scrolls inside its own height");
    chips()[70].fire("click"); more().fire("click");
    assert.equal(visible(), limit + 1); assert.equal(chips()[70].hidden, false);
  }
  const few = setup(); few.v.set(names(few.N.FOLD + 1));
  assert.equal(few.more().hidden, true, "no button to show one more chip");
});

test("the page draws the row under the map", () => {
  const page = read("src/pages/my-research.astro");
  const at = id => page.indexOf('id="' + id + '"');
  assert.ok(at("mr-dots-hint") < at("mr-intro") && at("mr-intro") < at("mr-all"));
  assert.match(page, /N\.view\(host, base\)/);
  assert.match(read("public/styles.css"), /#mr-intro \.ni-chips\.is-all \{ max-height: min\(40vh, 260px\); overflow-y: auto/);
});
