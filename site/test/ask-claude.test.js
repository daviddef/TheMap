/* The page half of "Ask Claude": which cards a pasted line brings with it, and how a photo is shrunk. The Worker half is ai.test.js. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js", f), "utf8"))(m); return m.exports; };
const R = load("record-reader.js"), A = load("ask-claude.js");
const idx = R.index(JSON.parse(fs.readFileSync(path.join(here, "../../data/record-terms.json"), "utf8")).terms);

test("a pasted line brings the cards for its words, once each, and nothing for words no card knows", () => {
  const cards = A.cardsFor("Die 3 martii baptizatus est infans, uxoris eius, uxoris", idx, R);
  assert.ok(cards.length >= 2 && cards.length <= 12);
  assert.equal(new Set(cards.map((c) => c.term)).size, cards.length, "no card twice");
  assert.ok(cards.every((c) => c.term && c.meaning));
  assert.deepEqual(A.cardsFor("zzzxq qqqwx", idx, R), []);
  assert.deepEqual(A.cardsFor("", idx, R), []);
});

test("a photo is shrunk to 1600 on its longest edge and never enlarged", () => {
  assert.deepEqual(A.shrinkDims(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(A.shrinkDims(800, 600), { w: 800, h: 600 });
  assert.deepEqual(A.shrinkDims(0, 0), { w: 1, h: 1 });
});

test("the page uses the live service address and the site key, and puts server text in with textContent only", () => {
  const src = fs.readFileSync(path.join(here, "../public/js/ask-claude.js"), "utf8");
  assert.match(src, /https:\/\/ai\.recordatlas\.org/);
  assert.match(src, /0x4AAAAAAF2I0BQDrTvBa0pm/);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(src), "server text must never be parsed as HTML");
});

test("several pictures in one box are split on their own — Picture N — lines, and one entry stays one", () => {
  assert.deepEqual(A.splitSections("Die 3 martii\nbaptizatus"), ["Die 3 martii\nbaptizatus"]);
  assert.deepEqual(A.splitSections("one\n\n— Picture 2 —\ntwo\n\n--- picture 3 ---\nthree"), ["one", "two", "three"]);
  assert.deepEqual(A.splitSections("   \n— Picture 2 —\n  "), []);
  assert.deepEqual(A.splitSections("a line that says picture 2 in it"), ["a line that says picture 2 in it"]);
});

test("the consolidated view gives the year span, who recurs, and what was doubted, and joins nobody", () => {
  const entry = (n, text, roles, words) => ({ n, text, result: { result: { draft: "d" + n, roles, words: words || [] } } });
  const K = A.consolidate([
    entry(1, "1788 baptizatus Joannes", [{ w: "Joannes Kosina", role: "father" }, { w: "Maria", role: "godmother" }], [{ w: "baptizatus", gloss: "baptised", doubt: false }]),
    entry(2, "die 4 maii 1792 sepultus", [{ w: "joannes  kosina", role: "deceased" }], [{ w: "sepultus", gloss: "buried", doubt: true, why: "smudged" }]),
    entry(3, "undated", []),
  ]);
  assert.deepEqual(K.years, [1788, 1792]);
  assert.equal(K.names.length, 2, "the same spelling in different case and spacing is one name");
  assert.deepEqual(K.recurring.map((p) => p.inn), [[1, 2]]);
  assert.deepEqual(K.recurring[0].roles, ["1:father", "2:deceased"], "each role stays tied to its picture");
  assert.deepEqual(K.doubt, [{ w: "sepultus", why: "smudged", n: 2 }]);
  assert.equal(A.consolidate([entry(1, "no year", [])]).years, null);
});

test("a document sent for comparison drops its empty fields", () => {
  const d = A.compactDoc({ doc_type: "petition", issuer: "", persons: [{ name_as_written: "J", details: { age: "", born: "1902" } }], fields: [], ids: [{ kind: "no.", value: "2693" }], not_legible: [""], x: { y: "" } });
  assert.deepEqual(d, { doc_type: "petition", persons: [{ name_as_written: "J", details: { born: "1902" } }], ids: [{ kind: "no.", value: "2693" }] });
});
