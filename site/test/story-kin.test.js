/* A STORY TOLD THE WAY A POST TELLS IT. David's own words:
     «my father ivan comes from senj, croatia. he married my mother in 1980. he was born in 1951 to ivan and hedviga. hedvga was from senj, but ivan was from crikvenica.
      my grandfather ivan was born in 1925.»
   The page read «to ivan» as a village, made the writer's mother "Ivan (Poreč)", lost both grandparents and gave the father his grandfather's birth year.
   story-kin.js says who is whose parent in the explicit words the reader already handles; these hold the rewrite, and the reader's answer on it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const K = (() => { const m = { exports: {} }; new Function("module", src("story-kin.js"))(m); return m.exports; })();
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();

const GIVEN = /^(?:ivan|hedviga|maria|josip|anna|marija)$/i;
const isGiven = (w) => GIVEN.test(w);
const POST = "my father ivan comes from senj, croatia. he married my mother in 1980. he was born in 1951 to ivan and hedviga. hedvga was from senj, but ivan was from crikvenica. my grandfather ivan was born in 1925.";

test("the post: parents named in «born to», what is said of each joined to them, the grandfather not a third Ivan", () => {
  const r = K.rewrite(POST, isGiven);
  assert.equal(r.changed, true);
  assert.match(r.text, /he was born in 1951\./);
  assert.match(r.text, /his father Ivan was from crikvenica and was born in 1925\./);
  assert.match(r.text, /his mother Hedviga was from senj\./);
  assert.doesNotMatch(r.text, /to ivan and hedviga/i);
  assert.equal((r.text.match(/his father Ivan/g) || []).length, 1, "one grandfather Ivan, not two");
  assert.ok(r.notes.length >= 3, "the page says what it understood");
});

test("«he married my mother», said of my father, is «his wife» (the reader took «my mother» as the teller's own line and dropped the father's journey)", () => {
  assert.match(K.rewrite("my father ivan comes from senj. he married my mother in 1980.", isGiven).text, /he married his wife in 1980/);
  assert.match(K.rewrite("my mother maria was born in Senj. she married my father in 1950.", isGiven).text, /she married her husband in 1950/);
});

test("the writer's own parents: «I was born in 1980 to ivan and marija» -> my father, my mother", () => {
  const r = K.rewrite("I was born in 1980 to Ivan and Marija.", isGiven);
  assert.match(r.text, /my father is Ivan/);
  assert.match(r.text, /my mother is Marija/);
});

test("a mother's parents are hers: «my mother Maria was born in 1955 to Josip and Anna»", () => {
  const r = K.rewrite("My mother Maria was born in 1955 to Josip and Anna. Anna was from Zagreb.", isGiven);
  assert.match(r.text, /her father is Josip/);
  assert.match(r.text, /her mother Anna was from zagreb/i);
});

test("one slipped letter in a name is typing, not a spelling", () => {
  assert.equal(K.same("hedvga", "Hedviga"), true);
  assert.equal(K.same("Ivan", "Ivo"), false);
  assert.equal(K.same("Marko", "Marka"), false, "short names must match exactly");
});

test("a sentence that is not about parents is left exactly as written", () => {
  for (const t of ["I want to go to ivan and see him.", "He was born to go places.", "my grandfather came from Senj in 1905 and married Anna."]) {
    const r = K.rewrite(t, isGiven);
    assert.equal(r.changed, false, t);
    assert.equal(r.text, t);
  }
});

test("the reader, on the rewritten post: father from Senj born 1951, grandparents with their towns, nobody from a village called Ivan", () => {
  let n = 0;
  const P = (nm, cc, x, y) => ({ i: nm.toLowerCase() + "-" + cc.toLowerCase() + "-" + (++n), n: nm, cc, c: 5, x, y });
  const rows = [P("Senj", "HR", 14.9, 45), P("Crikvenica", "HR", 14.69, 45.17), P("Poreč", "HR", 13.6, 45.23), P("Ivan", "HR", 15.5, 45.3)];
  const given = ["Ivan", "Hedviga"].map((n) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
  const ctx = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries: { HR: "Croatia" } };
  const t = K.rewrite(POST, isGiven).text;
  const p = F.parseStory(t, ctx, null);
  assert.equal(p.rel, "father");
  assert.equal(p.born, 1951, "the father's year, not his father's 1925 and not a guess");
  assert.deepEqual(p.stops.map((s) => s.row.n), ["Senj"]);
  const kin = Object.fromEntries((p.kin || []).map((k) => [k.key, k]));
  assert.equal(kin.FF && kin.FF.name, "Ivan");
  assert.equal(kin.FF.stops[0].row.n, "Crikvenica");
  assert.equal(kin.FM && kin.FM.name, "Hedviga");
  assert.equal(kin.FM.stops[0].row.n, "Senj");
  const all = [].concat(p.stops.map((s) => s.row.n), (p.kin || []).flatMap((k) => k.stops.map((s) => s.row.n)), (p.people || []).map((x) => x.place && x.place.row.n));
  assert.ok(!all.includes("Poreč") && !all.includes("Ivan"), "no invented place");
  assert.ok(!(p.people || []).some((x) => /wife|spouse/.test(x.role) && /^his$/i.test(x.name || "")), "the wife is not called «His»");
});

test("a married sentence does not hide a year the story told: «he married in 1980» before «born in 1951»", () => {
  const rows = [{ i: "senj-hr-1", n: "Senj", cc: "HR", c: 5, x: 14.9, y: 45 }];
  const given = [{ canon: "Ivan", id: "ivan", langs: { english: [{ form: "Ivan", status: "same" }] } }];
  const ctx = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries: { HR: "Croatia" } };
  const p = F.parseStory(K.rewrite("my father ivan comes from senj, croatia. he married my mother in 1980. he was born in 1951.", isGiven).text, ctx, null);
  assert.equal(p.born, 1951);
  assert.deepEqual(p.stops.map((s) => s.row.n), ["Senj"]);
});
