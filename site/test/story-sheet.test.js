/* A RECORD COPIED OUT AS A LIST («Name: …», «Father: …», «From: …»), and the plan it gets. The record's own words are kept as the record's, the writer's readings as
   suggestions, a search already made as a search, and each event told abroad is looked for abroad. Every name, year and event here is invented.
   The first two groups need no built data; the last reads against the built public/ and is skipped without it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = (f, m) => { new Function("module", fs.readFileSync(path.join(SITE, "public/js", f), "utf8"))(m); return m.exports; };
const A = js("atlas-summary.js", { exports: {} }), F = js("story-engine.js", { exports: {}, deps: { summary: A } }), T = js("story-todo.js", { exports: {} });

const LIST = `Hello, I am looking for my ancestor.
• Name: Bartolomeu Ferri (probably Bartul / Bartolomeo Ferić)
• Father: Matteo (Mate)
• From: "Parrocchia di Selvazzo, circolo di Zara". The diocesan archive thinks this is Selve.
• Born: around 1841 (taken from a daughter's record, possibly inaccurate)
• In Uruguay by 1866, married Rosa Medina in 1871 in Salto, Uruguay, and died in 1905 in Salto, Uruguay.
No baptism was found for him in Selve for 1839–1842.
He was unable to sign his name.`;
const row = (i, n, cc, y, x) => ({ i, n, y, x, c: 0, cc });
const ctx = () => ({
  map: { selve: [row("selve", "Selve", "HR", 44.37, 14.69)], salto: [row("salto", "Salto", "UY", -31.38, -57.96)], uruguay: [] },
  given: {}, skip: {}, countries: { HR: "Croatia", UY: "Uruguay" } });

test("the record's name, the suggested readings, the father and the doubted birth year are each kept as what they are", () => {
  const p = F.parseStory(LIST, ctx()), sh = p.sheet;
  assert.equal(p.rel, "ancestor");
  assert.equal(p.name, "Bartolomeu Ferri");
  assert.deepEqual(sh.sugGiven, ["Bartul", "Bartolomeo"]);
  assert.deepEqual(sh.sugSurname, ["Ferić"]);
  assert.equal(p.born, 1841);
  assert.equal(p.bornApprox, true);
  assert.match(sh.born.doubt, /inaccurate/);
  assert.equal(sh.born.via, "daughter");
  const fa = p.people.find((x) => x.role === "father");
  assert.equal(fa.name, "Matteo");
  assert.equal(fa.presumed, true);
  assert.equal(p.people.find((x) => x.role === "spouse").name, "Rosa Medina");
  const child = p.people.find((x) => x.role === "child");
  assert.equal(child.unnamed, true);
});

test("the origin as written and the place believed are both kept; a search made is a search, not a date", () => {
  const p = F.parseStory(LIST, ctx()), o = p.sheet.origin;
  assert.match(o.written, /Parrocchia di Selvazzo/);
  assert.equal(o.parishWritten, "Selvazzo");
  assert.equal(o.believed, "Selve");
  assert.match(o.by, /diocesan archive/);
  assert.deepEqual(p.searched, [{ what: "baptism", place: "Selve", from: 1839, to: 1842 }]);
  assert.equal(p.sheet.literacy, true);
  assert.deepEqual(p.sheet.died, { year: 1905, place: "Salto, Uruguay" });
});

test("«I think it is …» is the writer's own suggestion, and a story in sentences is not read as a list", () => {
  const p = F.parseStory(LIST.replace("The diocesan archive thinks this is Selve.", "I think this is Selve."), ctx());
  assert.equal(p.sheet.origin.by, "");
  assert.equal(p.sheet.origin.believed, "Selve");
  assert.ok(!F.parseStory("My grandfather Ivan Ferić was born in Selve in 1900.", ctx()).sheet);
});

/* the plan, from hand-built facts: no data needed */
const info = (name, cc, extra) => Object.assign({ name, cc, row: { i: name.toLowerCase() }, cols: [], provs: [], eras: [], neigh: [] }, extra || {});
const HOME = info("Selve", "HR", { cols: [{ title: "Births 1820-1870", kinds: ["b"], from: 1820, to: 1870, url: "https://fs/b" }] });
const COUNTRIES = { HR: "Croatia", UY: "Uruguay", BR: "Brazil", PY: "Paraguay" };
function planFor(events, route, extra) {
  const facts = Object.assign({ born: 1841, bornApprox: true, route: [{ info: HOME, role: "origin" }].concat(route), searched: [], siblings: [] }, extra || {});
  const g = { facts, people: [{ role: "self", rel: "ancestor", name: "Bartolomeu Ferri", events }, { role: "spouse", name: "Rosa Medina", events: [] }] };
  return T.recommend(g, { countries: COUNTRIES, year: 2026, spansOf: undefined, text: "" }, { info: HOME }, [{ polity: "Austria" }]);
}
const all = (steps) => steps.map((s) => [s.title, s.why, s.detail].join(" ")).join("\n");

test("a marriage and a death told abroad are looked for abroad, and the spouse is not sent to the home parish", () => {
  const br = info("Cáceres", "BR", { eras: [{ from: 1840, to: 1889, polity: "Province of Mato Grosso" }] });
  const rec = planFor([{ type: "married", year: 1871, place: "Cáceres", country: "Brazil" }, { type: "died", year: 1905, place: "Cáceres", country: "Brazil" }],
    [{ info: br, role: "lived", year: 1871 }]);
  const me = rec.people[0], wed = me.steps.find((s) => /^Marriage/.test(s.title)), gone = me.steps.find((s) => /^Death/.test(s.title));
  assert.match(wed.title, /Cáceres, Brazil/);
  assert.match(wed.detail, /Before 24 May 1890/);
  assert.match(wed.detail, /was then in Mato Grosso.*Cuiabá.*1910/);
  assert.match(wed.detail, /has not confirmed/);
  assert.match(gone.detail, /art\. 77/);
  assert.ok(wed.links.every((l) => /^https:\/\//.test(l.href)));
  const spouse = rec.people.find((c) => /Rosa Medina/.test(c.title));
  assert.match(spouse.steps[0].title, /Marriage entry · 1871 · Cáceres/);
  assert.doesNotMatch(all(spouse.steps), /parish of Selve/);
});

test("a search already made is gone past, not repeated, and an arrival is asked for in the country the story names", () => {
  const uy = info("Uruguay", "UY", { isCountry: true });
  const rec = planFor([], [{ info: uy, role: "lived", year: 1866 }], { searched: [{ what: "baptism", place: "Selve", from: 1839, to: 1842 }] });
  const steps = rec.people[0].steps, text = all(steps);
  assert.ok(steps.some((s) => s.title === "Birth or baptism entry · 1832–1838 and 1843–1849"));
  assert.ok(!steps.some((s) => /about 1839|· 1839/.test(s.title)));
  assert.match(text, /Arrival in Uruguay · by 1866/);
  assert.match(text, /1829–1872/);
  assert.ok(rec.open.some((q) => /baptised/.test(q.title)));
});

test("a family that never went overseas keeps the home plan, with no arrival step", () => {
  const rec = planFor([], []);
  assert.doesNotMatch(all(rec.people[0].steps), /Arrival in|leaving/);
  assert.match(rec.people[0].steps[0].title, /^Birth or baptism entry/);
});

/* the whole way through, against the built data */
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
test("a listed record about an emigrant reads into a route abroad, a «generations between» family and a plan per person", { skip: !BUILT && "needs the built public/ data" }, async () => {
  const { read } = await import("./plan/harness.mjs"), { todo, deps } = await import("./plan/deps.mjs");
  const text = LIST.replace(/Selvazzo/g, "Zlarino").replace(/Selve/g, "Zlarin"), { g } = await read(text);
  assert.deepEqual(g.facts.route.map((r) => [r.info.name.replace(/ \(.*/, ""), r.info.cc]), [["Zlarin", "HR"], ["Uruguay", "UY"], ["Salto", "UY"]]);
  const plan = todo.build(g, Object.assign(deps(g), { text })), people = plan.sections.find((s) => s.key === "people").items;
  assert.equal(plan.today[0].title, "Look for first");
  assert.ok(people[0].known.some((k) => /Name in the record: Bartolomeu Ferri \(suggested: .*Ferić/.test(k)));
  assert.ok(people[0].unknown.some((k) => /generations/.test(k)));
  assert.ok(people.some((c) => /daughter whose record gives the birth date/.test(c.title)));
  assert.match(todo.asText(plan), /Known: Searched, nothing found \(as told\): baptism in Zlarin, 1839–1842/);
});

test("the checker counts a suggested reading as read, and takes neither a list's labels nor a continent for a name", () => {
  const C = js("story-check.js", { exports: {} }), text = LIST.replace("my ancestor.", "my ancestor, who sailed to South America.");
  const found = C.check(text, F.parseStory(text, ctx()), { countries: ctx().countries, isPlace: (k) => !!ctx().map[k], isGiven: () => false }).problems.map((x) => x.words.join(" "));
  for (const w of ["Bartul", "Ferić", "Mate", "Name", "Father", "South", "America"]) assert.ok(!found.includes(w), w + " reported as lost");
});
