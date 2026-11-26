/* ONE NUMBER PER PERSON, ON THE FAMILY AND ON THE NAMES. David: «could we number the people so e.g. names and spellings can easily be correlated?» And on the same
   screen the names panel offered «Zora» as a spelling worth trying for Zora. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const F = load("story-engine.js", { summary: load("atlas-summary.js") });

const josip = { n: "Josip" }, barbara = { n: "Barbara" }, katica = { n: "Katica" }, unnamed = { n: "" }, gran = { n: "" };

test("people are numbered in the order the family is drawn, and only those with a names box", () => {
  const got = F.numberPeople([josip, barbara, katica, unnamed, gran, undefined], [[josip], [barbara], [katica]]);
  assert.deepEqual(got.map((x) => x && x.no), [1, 2, 3, null, null, null]);
  assert.deepEqual(got.slice(0, 3).map((x) => x.box), [0, 1, 2]);
});

test("the number follows the family, whatever order the names came in; two people told in one box each keep a number", () => {
  const got = F.numberPeople([barbara, josip, katica], [[josip, katica], [barbara]]);
  assert.deepEqual(got, [{ no: 1, box: 1 }, { no: 2, box: 0 }, { no: 3, box: 0 }]);
});

test("the typed name is no lead for itself, and a language left with nothing is dropped", () => {
  const out = F.otherForms([{ lang: "hr", label: "Croatian", forms: [], leads: ["Zora"] }, { lang: "sl", label: "Slovene", forms: [], leads: ["ZORA", "Zorka"] }], "Zora");
  assert.deepEqual(out, [{ lang: "sl", label: "Slovene", forms: [], leads: ["Zorka"] }]);
});

test("an accented lead is a different spelling and stays; a recorded form under its language stays", () => {
  const out = F.otherForms([{ lang: "es", label: "Spanish", forms: [], leads: ["José"] }, { lang: "hr", label: "Croatian", forms: ["Barbara"], leads: ["Barbara"] }], "Jose");
  assert.deepEqual(out.map((x) => x.leads), [["José"], ["Barbara"]]);
});
