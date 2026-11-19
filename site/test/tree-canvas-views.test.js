/* The Tree Canvas's View button, the Trail band and the Fan. The pure parts (the direct line, the places of a life, the fan's geometry and colour) are cut out of the vendored canvas
   (scripts/roots/tree-canvas.template.html) and run in a VM, so what is tested is what ships; every person here is invented. */
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
const V = ctx.TCV, J = x => JSON.parse(JSON.stringify(x));   // objects from the VM are another realm's: compare their JSON
assert.ok(V && V.trailModel && V.fanSlots, "the template carries the View code (rebuild the Tree Canvas with --embed and vendor it)");

/* a small invented tree: a focus, both parents, three generations up the father's line and one up the mother's */
const P = [];
const add = (name, by, bp, f, m, x) => { const i = P.length; P.push(Object.assign({ i, key: "t:" + i, name, given: name.split(" ")[0], sur: name.split(" ")[1] || "", by, bp, f: f ?? -1, m: m ?? -1, fl: 0, living: false, ghost: false }, x || {})); return i; };
const gg = add("Old Example", 1820, "Town A"), g = add("Mid Example", 1850, "Town B", gg), gm = add("Maud Sample", 1855, "Town C");
const fa = add("Dad Example", 1880, "Town B", g, gm), mo = add("Mum Sample", 1885, "Town D"), me = add("Me Example", 1910, "Town E", fa, mo);
const M = { P, byKey: new Map(P.map(p => [p.key, p])) };

test("the Trail: the direct line is oldest first, ends at the focus, and defaults to the line with more known generations", () => {
  const T = V.trailModel(M, me, null, {});
  assert.equal(T.side, "f"); assert.deepEqual(J(T.anc.map(c => c.gen)), [-3, -2, -1]); assert.equal(T.focus.gen, 0);
  assert.equal(V.trailModel(M, me, "m", {}).anc.length, 1);
  assert.equal(V.genTag(-3), "GEN. −3"); assert.equal(V.genTag(0), "FOCUS");
});

test("the Trail and the Fan never show a living person's dates or places", () => {
  P[fa].living = true;
  const c = V.trailModel(M, me, "f", {}).anc.find(x => x.key === P[fa].key);
  assert.equal(c.year, null); assert.equal(c.place, ""); assert.ok(c.name);
  P[fa].living = false;
});

test("the View lens is kept only when it is not the default, and is cleaned", () => {
  assert.equal(V.lensIsDefault({ m: "canvas", g: 5, c: "side", t: 2 }), true);
  assert.equal(V.lensIsDefault({ m: "canvas", g: 5, c: "side", t: 0 }), false, "a folded strip is a choice");
  assert.deepEqual(J(V.cleanLens({ m: "spiral", g: 99, c: "evil", t: 7 })), { m: "canvas", g: 7, c: "side", t: 2, r: "" });
});

test("the canvas carries the View button, the Trail band and the Fan, and keeps the band at the very bottom", () => {
  assert.match(TPL, /id="bLens"[^>]*aria-label="View"/);
  assert.match(TPL, /<svg id="fan"|createElementNS\([^)]*'svg'\)[\s\S]{0,200}id = 'fan'|id="fan"/);
  assert.match(TPL, /#trail\{[^}]*bottom:0/, "the band is docked to the very bottom edge");
  assert.match(TPL, /\.dock\{bottom:calc\(16px \+ var\(--trail-h,0px\)\)\}/, "the search dock rides above it");
  assert.match(TPL, /data-tr="hide"[^>]*aria-expanded="true"/);
  assert.match(TPL, /class="trtab"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(TPL, /fetch\([^)]*trail/i, "no network from the band");
});
