/* ONE NUMBER PER PERSON, ON THE FAMILY AND ON THE NAMES. David: «could we number the people so e.g. names and spellings can easily be correlated?» And on the same
   screen the names panel offered «Mila» as a spelling worth trying for Mila. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const F = load("story-engine.js", { summary: load("atlas-summary.js") });

const ivan = { n: "Ivan" }, lucija = { n: "Lucija" }, jana = { n: "Jana" }, unnamed = { n: "" }, gran = { n: "" };

test("people are numbered in the order the family is drawn, and only those with a names box", () => {
  const got = F.numberPeople([ivan, lucija, jana, unnamed, gran, undefined], [[ivan], [lucija], [jana]]);
  assert.deepEqual(got.map((x) => x && x.no), [1, 2, 3, null, null, null]);
  assert.deepEqual(got.slice(0, 3).map((x) => x.box), [0, 1, 2]);
});

test("the number follows the family, whatever order the names came in; two people told in one box each keep a number", () => {
  const got = F.numberPeople([lucija, ivan, jana], [[ivan, jana], [lucija]]);
  assert.deepEqual(got, [{ no: 1, box: 1 }, { no: 2, box: 0 }, { no: 3, box: 0 }]);
});

test("the typed name is no lead for itself, and a language left with nothing is dropped", () => {
  const out = F.otherForms([{ lang: "hr", label: "Croatian", forms: [], leads: ["Mila"] }, { lang: "sl", label: "Slovene", forms: [], leads: ["MILA", "Milka"] }], "Mila");
  assert.deepEqual(out, [{ lang: "sl", label: "Slovene", forms: [], leads: ["Milka"] }]);
});

test("an accented lead is a different spelling and stays; a recorded form under its language stays", () => {
  const out = F.otherForms([{ lang: "es", label: "Spanish", forms: [], leads: ["José"] }, { lang: "hr", label: "Croatian", forms: ["Lucija"], leads: ["Lucija"] }], "Jose");
  assert.deepEqual(out.map((x) => x.leads), [["José"], ["Lucija"]]);
});
