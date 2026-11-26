/* The family picker in the header: Select all, Clear, Read together and the archive buttons stay in a head above the scrolling list, are still there while
 * a search narrows it, and work from the keyboard (they act on click). Family and archive names here are invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fakeDom, fakeStore } from "./fakedom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");

function run() {
  const doc = fakeDom(), bar = doc.add("div", "bar"), sel = doc.createElement("select"); bar.append(sel);
  const arch = { id: "a", name: "The Quillon Archive", url: "https://example.invalid/" };
  const lines = ["Zzaa", "Zzbb", "Zzcc"].map((n, i) => ({ slug: n.toLowerCase(), name: n, where: "", marks: i, active: !i, archives: i < 2 ? [arch] : [], session: i < 2 }));
  const store = fakeStore(), scope = () => JSON.parse(store.getItem("ra-synopsis-scope") || "null");
  const P = { lines: () => lines, active: () => "zzaa", setActive() {} };
  doc.readyState = "complete";
  const window = { raProgress: P, __raLineUid: "bar", innerHeight: 600, addEventListener() {} };
  vm.runInNewContext(read("public/js/line-switcher.js"), { window, document: doc, localStorage: store, CustomEvent: class { constructor(t) { this.type = t; } }, setTimeout: () => 0 });
  const pop = bar.querySelector("div.ra-cb-pop");
  bar.querySelector("button.ra-cb-btn").fire("click");
  return { doc, bar, pop, scope, q: pop.querySelector("input.ra-cb-q"), head: pop.querySelector("div.ra-cb-head"), list: pop.querySelector("ul.ra-cb-list") };
}

test("the buttons that act on several families sit outside the scrolling list", () => {
  const { head, list, pop } = run();
  assert.deepEqual(pop.children.map(c => c.className.split(" ")[0]), ["ra-cb-q", "ra-cb-head", "ra-cb-list", "ra-cb-add"]);
  assert.equal(head.querySelectorAll("button.ra-cb-allbtn").length, 2);
  assert.equal(head.querySelectorAll("button.ra-cb-arcbtn").length, 1);
  assert.match(head.textContent, /Select all[\s\S]*Clear[\s\S]*Read together[\s\S]*Tick a whole archive[\s\S]*Quillon/);
  assert.equal(list.querySelectorAll("button").length, 0); assert.equal(list.querySelectorAll("li.ra-cb-opt").length, 3);
});

test("they stay while a search narrows the list, and Select all still means every family", () => {
  const { head, list, q, scope } = run();
  q.value = "zzcc"; q.fire("input");
  assert.equal(list.querySelectorAll("li.ra-cb-opt").length, 1);
  assert.equal(head.querySelectorAll("button").length, 3, "once each: a repaint does not stack them");
  head.querySelector("button.ra-cb-allbtn").fire("click");
  assert.equal(scope().all, true);
});

test("a press by keyboard (a click with no mouse press) ticks and unticks a whole archive", () => {
  const { head, scope } = run();
  const b = head.querySelector("button.ra-cb-arcbtn");
  b.fire("click");
  assert.deepEqual(scope().slugs.slice().sort(), ["zzaa", "zzbb"]);
  assert.equal(b.getAttribute("aria-pressed"), "true");
  b.fire("click");
  assert.deepEqual(scope().slugs, []); assert.equal(b.getAttribute("aria-pressed"), "false");
  head.querySelectorAll("button.ra-cb-allbtn")[1].fire("click");
  assert.deepEqual(scope(), { all: false, slugs: [] });
});

test("the panel is held inside a short window", () => {
  const { pop } = run();
  assert.equal(pop.style.maxHeight, "492px");
  const css = read("public/styles.css");
  assert.match(css, /\.ra-cb-pop > \.ra-cb-list \{[^}]*min-height: 8\.5rem/);
  assert.match(css, /@media \(max-height: 700px\) \{ \.ra-cb-arcs \{ flex-wrap: nowrap; overflow-x: auto/);
});
