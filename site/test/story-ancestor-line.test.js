/* A STORY ABOUT A NAMED GREAT-GRANDPARENT, TOLD WITH THEIR CHILDREN AND A GRANDMOTHER. The story below is invented; one of its shape was read wrong end to end:
   no highlighting at all, the great-grandparents missing from the tree, «West Macedonia» for Macedonia, Bosnia dropped, a list of names cut at the first comma
   («Their 5 kids are Katica»), and the grandmother's year and places put on the great-grandfather. Each assertion below is one of those. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const A = load("atlas-summary.js");
const F = load("story-engine.js", { summary: A });
const G = load("story-gaps.js");

let k = 0;
const P = (n, cc, x, y, extra) => Object.assign({ i: n.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + cc.toLowerCase() + "-" + (++k), n, cc, c: 5, x, y }, extra || {});
const rows = [
  P("Drežnik", "HR", 15.9, 45.72), P("Nova Gradiška", "HR", 17.38, 45.25), P("Zagreb", "HR", 15.98, 45.81), P("Vienna", "AT", 16.37, 48.21), P("Sarajevo", "BA", 18.41, 43.86),
  P("Skopje", "MK", 21.43, 42), P("West Macedonia", "GR", 21.5, 40.3, { c: 0 }), P("Macedonia", "US", -81.5, 41.3, { c: 0, v: 3 }),
];
const given = ["Josip", "Barbara", "Katica", "Zora", "Anica", "Stjepan"].map((n) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
const countries = { HR: "Croatia", AT: "Austria", SI: "Slovenia", BA: "Bosnia and Herz.", MK: "North Macedonia", GR: "Greece", US: "United States of America" };
const ctx = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries };

const STORY = "I am new here and need help with my family from Croatia. I live outside Croatia, so it is hard. I'm trying to track down my great grandparents and beyond. " +
  "My great grandfather is Josip PERKOVIĆ and his wife, my great grandmother is Barbara, born LONČAR. That is nearly all I know about them. They're born likely 1900s and Married late 1920s. " +
  "They had 5 children and one of them is my grandma born 1944. They lived in Dreznik near Nova Gradiska. I think one of their sons, Stjepan, moved away to Austria while my grandma went to Austria too, " +
  "then Bosnia and finally settling in Macedonia after she married. The 3 kids stayed in Croatia. If anyone recognises them, or has them in a tree, please say, as I cannot get further back. " +
  "And their 5 kids are Katica, Zora, Anica, Stjepan, and one unknown brother. I have put a picture of Barbara with two of her daughters beside her, Katica and Anica if that helps.";
const p = F.parseStory(STORY, ctx);
const byKey = (key) => (p.people || []).filter((x) => x.key === key)[0];

test("the story is about the great-grandfather, not the grandmother's year", () => {
  assert.equal(p.rel, "great-grandfather");
  assert.equal(p.name, "Josip Perković");
  assert.equal(p.born, null, "1944 is the grandmother's, and the great-grandfather's is told as a decade");
  assert.deepEqual(p.stops.map((s) => s.row.n), ["Drežnik"], "Nova Gradiška is where Drežnik is («near»), not a stop on a journey");
  assert.ok(p.kin.some((x) => x.key === "X" && x.stops.some((s) => s.row.n === "Nova Gradiška")), "kept as a place named in the story");
});

test("the wife is on the tree with her own family name, and the decades are kept as told", () => {
  const sp = p.people.filter((x) => x.role === "spouse")[0];
  assert.equal(sp.name, "Barbara");
  assert.equal(sp.surname, "Lončar");
  assert.ok(sp.events.some((e) => /Born Lončar/.test(e.text)));
  assert.ok(p.people[0].events.some((e) => /1900s/.test(e.text)) && p.people[0].events.some((e) => /1920s/.test(e.text)));
  assert.ok(!p.people.some((x) => x.role === "father" || x.role === "mother"), "«They married late 1920s» is the couple's wedding, not the teller's parents'");
});

test("the five children are the ones the list names, in its order, one of them unnamed", () => {
  const kids = p.people.filter((x) => x.role === "child" && x.ofSubject);
  assert.deepEqual(kids.map((x) => x.name), ["Katica", "Zora", "Anica", "Stjepan", ""]);
  assert.equal(kids[3].sex, "M", "«one of their sons, Stjepan»");
  assert.equal(kids[4].sex, "M", "«one unknown brother»");
  assert.equal(kids[0].sex, "F", "the photo says Katica and Anica are daughters");
  assert.ok(kids[0].events.some((e) => /photo with Barbara/.test(e.text)));
  assert.equal(kids[1].sex, "", "nothing says whether Zora is a son or a daughter, and none is guessed");
});

test("the grandmother is one of them, which one is not said, and her line is her own", () => {
  const g = byKey("GM");
  assert.ok(g && g.role === "line" && g.unnamed);
  assert.equal(g.events[0].year, 1944);
  const line = p.kin.filter((x) => x.key === "GM")[0];
  assert.deepEqual(line.stops.map((s) => s.row.cc), ["AT", "BA", "MK"], "Austria, Bosnia, then North Macedonia: not West Macedonia in Greece, not Macedonia in Ohio");
  const stjepan = p.kin.filter((x) => x.key === "K4")[0];
  assert.deepEqual(stjepan.stops.map((s) => s.row.cc), ["AT"], "Stjepan's own line is Austria alone");
  const stayed = p.kin.filter((x) => x.key === "KS")[0];
  assert.equal(stayed.stops[0].row.cc, "HR");
});

test("«Macedonia» alone and «Bosnia» alone are the countries, and Macedonia, Ohio stays a place", () => {
  const q = F.parseStory("My grandmother went to Austria, then Bosnia and finally settled in Macedonia.", ctx);
  assert.deepEqual(q.stops.map((s) => s.row.cc), ["AT", "BA", "MK"]);
  const o = F.parseStory("My grandfather moved to Macedonia, Ohio in 1950.", ctx);
  assert.ok(o.stops.some((s) => s.row.cc === "US"), "a US state written after it keeps the town");
});

test("a list of names told in one sentence is kept whole in «The person, as told»", () => {
  const items = p.life.groups.reduce((a, g) => a.concat(g.items), []);
  assert.ok(items.some((x) => /Katica, Zora, Anica, Stjepan, and one unknown brother/.test(x)), "not cut at the first comma: " + JSON.stringify(items));
});

test("every name and place in the words is marked, accents or not", () => {
  const marks = G.tokens(STORY, p).map((t) => t.word);
  ["Josip PERKOVIĆ", "Barbara", "LONČAR", "Dreznik", "Nova Gradiska", "Stjepan", "Austria", "Bosnia", "Macedonia", "Croatia", "Katica", "Zora", "Anica"].forEach((w) => assert.ok(marks.includes(w), w + " is marked: " + marks.join(" | ")));
  assert.equal(marks.filter((w) => w === "Austria").length, 2, "both mentions");
  const typed = G.tokens("My great grandfather Josip lived in Drežnik.", F.parseStory("My great grandfather Josip lived in Drežnik.", ctx)).map((t) => t.word);
  assert.ok(typed.includes("Drežnik"), "a place typed with its accent is found by the reader's folded name: " + typed.join(","));
});

test("a short, ordinary story still reads as before", () => {
  const q = F.parseStory("My grandfather Josip was born in Zagreb in 1900.", ctx);
  assert.equal(q.rel, "grandfather");
  assert.ok(!q.lineage, "no lineage step for a story that does not name a great-grandparent");
});
