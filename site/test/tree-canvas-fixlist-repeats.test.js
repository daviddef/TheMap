/* The Fix list says a repeated line once. When every drawn row of a section carries the same explanatory line (the Atlas's "Next step", a note), it is shown once above the rows and
   dropped from them; one row that differs keeps every row's own lines. A generic rule over the drawn rows (fixlist-rows.js hoistRepeats), the same for People, Places and Orphans.
   Everything in these fixtures is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import { rowEl, hoistRepeats, stripRepeats, mk } from "../public/tree-canvas/fixlist-rows.js";
import { buildModel, createState, ORPHANS } from "../public/tree-canvas/fixlist.js";
import { buildOrphans } from "../public/roots/js/orphans.js";

class Fake {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.attrs = {}; this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} }; this.className = ""; this._t = ""; this.style = { setProperty() {} }; this._inner = ""; }
  set textContent(v) { this._t = v; } get textContent() { return this._t + this.childNodes.map(c => (c instanceof Fake ? c.textContent : c.text)).join(""); }
  set innerHTML(v) { this._inner = v; if (/<span><\/span>$/.test(v)) this.childNodes.push(new Fake("span")); } get innerHTML() { return this._inner; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1]; }
  append(...c) { for (const x of c) this.childNodes.push(typeof x === "string" ? { text: x } : x); }
  removeChild(c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  all(f, out = []) { for (const c of this.childNodes) if (c instanceof Fake) { if (f(c)) out.push(c); c.all(f, out); } return out; }
}
const doc = { createElement: t => new Fake(t) };
const cls = (row, c) => row.all(e => new RegExp("(^|\\s)" + c + "(\\s|$)").test(e.className));
/* a row as rowEl makes it: checkbox, then a body of lines */
function row(lines) {
  const r = mk(doc, "div", "fx-row"), b = mk(doc, "div", "fx-body"); b.append(mk(doc, "div", "fx-head", "head"));
  for (const [c, t] of lines) { const e = mk(doc, "p", c); if (c === "fx-next") e.append(mk(doc, "b", null, "Next step "), t); else e.textContent = t; b.append(e); }
  r.append(mk(doc, "input"), b); return r;
}
const NEXT = "Look in the collections below for one parent, spouse or child of these families who is not in your file.";

test("the same Next step on every row is said once, and dropped from the rows", () => {
  const rows = [1, 2, 3].map(n => row([["fx-evs", "Born 18" + n + "0"], ["fx-next", NEXT]]));
  const out = hoistRepeats(rows);
  assert.equal(out.lines.length, 1); assert.match(out.lines[0].textContent, /^Next step Look in the collections below/);
  for (const r of rows) assert.equal(cls(r, "fx-next").length, 0, "no row repeats it");
  for (const r of rows) assert.equal(cls(r, "fx-evs").length, 1, "the row-specific line stays");
});

test("one row that differs, or lacks the line, keeps every row's own lines", () => {
  const same = () => row([["fx-next", NEXT]]);
  const differ = [same(), same(), row([["fx-next", "Look at the Pula collections: a parent may be there."]])];
  assert.equal(hoistRepeats(differ).lines.length, 0); for (const r of differ) assert.equal(cls(r, "fx-next").length, 1);
  const lacks = [same(), same(), row([])];
  assert.equal(hoistRepeats(lacks).lines.length, 0); assert.equal(cls(lacks[0], "fx-next").length, 1);
});

test("two or more rows are needed; one row keeps its line", () => {
  const one = [row([["fx-next", NEXT]])]; assert.equal(hoistRepeats(one).lines.length, 0); assert.equal(cls(one[0], "fx-next").length, 1);
  assert.equal(hoistRepeats([]).lines.length, 0);
});

test("notes hoist the same way, by kind and text: a note and a next step with the same words are two lines", () => {
  const rows = [1, 2].map(() => row([["fx-note", "In this file there is no parent, spouse or child link from these people to anyone else. Built from tree.ged."], ["fx-next", "Same words."], ["fx-note", "Same words."]]));
  const out = hoistRepeats(rows); assert.equal(out.lines.length, 3);
  assert.deepEqual(out.sigs.map(g => g.split("|")[0]), ["fx-note", "fx-next", "fx-note"]);
});

test("a line that introduces a list (ends in a colon), a line with a link, and a line of another kind stay on their rows", () => {
  const withLink = () => { const r = row([["fx-note", "Open it"]]); const a = mk(doc, "a", null, "x"); const n = cls(r, "fx-note")[0]; n.append(a); return r; };
  const rows = [1, 2].map(() => row([["fx-note", "Where the Atlas says to look:"], ["fx-evs", "Born 1850"], ["fx-muted", "same"]]));
  assert.equal(hoistRepeats(rows).lines.length, 0); for (const r of rows) assert.equal(cls(r, "fx-note").length, 1);
  const links = [withLink(), withLink()]; assert.equal(hoistRepeats(links).lines.length, 0);
});

test("a row drawn again on its own (after a tick) drops the lines its section shows once", () => {
  const rows = [1, 2].map(() => row([["fx-next", NEXT], ["fx-evs", "e"]])), { sigs } = hoistRepeats(rows);
  const again = row([["fx-next", NEXT], ["fx-evs", "e"]]); stripRepeats(again, sigs);
  assert.equal(cls(again, "fx-next").length, 0); assert.equal(cls(again, "fx-evs").length, 1);
  const other = row([["fx-next", "Something else."]]); stripRepeats(other, sigs); assert.equal(cls(other, "fx-next").length, 1, "a different line is never dropped");
});

test("real Orphans rows: the section's one Next step is said once; the places, years, collections and people stay", () => {
  const P = (id, bp, by) => ({ id, given: "G" + id, sur: "Test" + id, bp, by, hid: 0, father: null, mother: null, spouse: [], kids: [] });
  const tree = { people: [P("I1", "Pula", 1850), P("I2", "Pula", 1851), P("I3", "Pula", 1852)] };
  const atlas = { places: [{ n: "Pula", id: "pula", cn: "HR", reg: null, cols: [["Pula births", "https://example.org/a", 1800, 1900, "fs"]] }], regions: {}, regimes: {}, prov: { fs: "FamilySearch" }, provurl: {} };
  const out = buildOrphans(tree, atlas), model = buildModel(out, null, "", ORPHANS), st = createState(null);
  const ctx = { st, links: { url: () => null }, onChange() {}, show() {} };
  for (const s of model.sections.filter(x => x.items.length > 1)) {
    const rows = s.items.map(i => rowEl(doc, ctx, s, i)), before = rows.map(r => cls(r, "fx-next").length);
    const out2 = hoistRepeats(rows);
    if (before.every(n => n === 1) && new Set(s.items.map(i => i.next)).size === 1) { assert.equal(out2.lines.length, 1); for (const r of rows) assert.equal(cls(r, "fx-next").length, 0); }
  }
  /* three one-person rows of different places get one next step between them */
  const tree2 = { people: [P("I1", "Pula", 1850), P("I2", "Trieste", 1851), P("I3", "Cape Town", 1852)] };
  const atlas2 = { ...atlas, places: [...atlas.places, { n: "Trieste", id: "trieste", cn: "IT", reg: null, cols: [] }, { n: "Cape Town", id: "cape-town", cn: "ZA", reg: null, cols: [] }] };
  const m2 = buildModel(buildOrphans(tree2, atlas2), null, "", ORPHANS), s2 = m2.bySec.get("orph"), rows2 = s2.items.map(i => rowEl(doc, ctx, s2, i));
  assert.equal(rows2.length, 3); assert.ok(rows2.every(r => cls(r, "fx-next").length === 1));
  const h = hoistRepeats(rows2); assert.equal(h.lines.length, 1); assert.match(h.lines[0].textContent, /^Next step /);
  for (const r of rows2) { assert.equal(cls(r, "fx-next").length, 0); assert.ok(cls(r, "fx-was").length >= 1, "the place stays"); assert.match(r.textContent, /Born 18/); }
});

test("the screen only: the list draws the shared lines once above its rows, and the exports are built from the model, which never sees this", async () => {
  const fs = await import("node:fs"), v = fs.readFileSync(new URL("../public/tree-canvas/fixlist-view.js", import.meta.url), "utf8");
  assert.match(v, /hoistRepeats\(rows\)/); assert.match(v, /stripRepeats\(rowEl\(/); assert.match(v, /'fx-hoist'/);
  const ck = fs.readFileSync(new URL("../public/roots/js/checklist.js", import.meta.url), "utf8"), fl = fs.readFileSync(new URL("../public/tree-canvas/fixlist.js", import.meta.url), "utf8");
  assert.doesNotMatch(ck + fl, /hoistRepeats|fx-hoist/, "the model and the exports know nothing of it");
});
