/* WHAT TO LOOK FOR NEXT, PERSON BY PERSON (public/js/story-todo.js `recommend`) and EVERY BOOK BY GENERATION (story-engine.js `generationGroups`). The page showed
   one parents'-generation book and folded the rest away, and left the reader to work out what to look for. Each recommendation comes from the told facts and the
   books the Atlas lists, or says plainly there is none. The fixtures are hand-built and every name is made up; the tests on typed sentences need the built public/. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", fs.readFileSync(path.join(SITE, "public/js", f), "utf8"))(m); return m.exports; };
const T = load("story-todo.js");
const F = load("story-engine.js", { summary: load("atlas-summary.js") });
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
const opts = { skip: !BUILT && "needs the built public/ data" };

const book = (title, kinds, from, to) => ({ title, kinds, from, to, url: "https://example.org/" + from + "-" + to });
const OLD = [book("Births 1800-1857", ["b"], 1800, 1857), book("Marriages 1815-1857", ["m"], 1815, 1857), book("Births 1858-1889", ["b"], 1858, 1889), book("Deaths 1888-1916", ["d"], 1888, 1916)];
const town = (extra) => Object.assign({ name: "Testville", cc: "HR", cols: OLD, neigh: [{ km: 9.4, info: { name: "Nextville", cols: [book("Births 1890-1930", ["b"], 1890, 1930)] } }], provs: [] }, extra || {});
const person = (role, name, extra) => Object.assign({ role, name, events: [] }, extra || {});
const family = () => ({ facts: { born: 1928, route: [], siblings: [{ rel: "sister" }, { rel: "sister" }] },
  people: [person("self", "Vera Pavić", { bornText: "3 May 1928", rel: "grandmother", parentSide: "mother", place: "Testville" }),
    person("father", "Stjepan Pavić", { events: [{ type: "alive", year: 1979, approx: true }] }), person("mother", "Roza", { maiden: "Tomić", given: { typed: "Roza" } })] });
const plan = (g, an, text) => T.recommend(g, { text: text || "", year: 2026 }, an || { info: town() });
const card = (r, re) => r.people.find((c) => re.test(c.title));
const said = (c) => c.steps.map((s) => [s.title, s.why, s.detail].join(" ")).join(" | ");

test("every person told gets a card, in the order most likely to answer the question", () => {
  const r = plan(family());
  assert.deepEqual(r.people.map((c) => c.title.split(/[:(]/)[0].trim()), ["Vera Pavić", "The parents’ marriage", "Stjepan Pavić", "Roza Tomić", "The 2 sisters, not named"]);
});

test("a book that stops before the years is said plainly, with the neighbour that has one, and a lead is not called proof", () => {
  const c = card(plan(family()), /^Vera/);
  assert.match(c.steps[0].title, /3 May 1928$/);
  assert.match(c.steps[0].detail, /lists no birth or baptism book of Testville for 1928 \(they stop in 1889\)/);
  assert.match(c.steps[0].detail, /Nextville \(9 km\)/);
  assert.match(c.steps[0].detail, /lead, not proof/);
  assert.match(c.steps[0].detail, /until May 1946/);
});

test("margin notes and godparents are advised, each rule with its source", () => {
  const s = card(plan(family()), /^Vera/).steps[0];
  assert.match(s.detail, /margin/);
  assert.match(s.detail, /godparents and witnesses/);
  assert.ok(s.links.some((l) => /Ne temere/.test(l.t)) && s.links.every((l) => /^https:\/\//.test(l.href)));
});

test("the parents' marriage is before the child, in the mother's parish too, and her birth name is a search of its own", () => {
  const r = plan(family()), m = card(r, /parents’ marriage/);
  assert.match(m.steps[0].title, /1903–1928/);
  assert.match(m.steps[0].why, /mother’s own parish/);
  assert.match(said(card(r, /^Roza Tomić/)), /Search the birth name Tomić/);
});

test("someone alive at a date is searched for after it", () => {
  const c = card(plan(family()), /^Stjepan/), death = c.steps.find((s) => /^Death/.test(s.title));
  assert.match(death.title, /after 1979/);
  assert.match(death.why, /alive about 1979/);
});

test("unnamed sisters are shown, with a warning about living people, and DNA is named without a vendor", () => {
  const t = said(card(plan(family()), /sisters/));
  assert.match(t, /under the same parents/);
  assert.match(t, /DNA test/);
  assert.match(t, /may be alive/);
  assert.doesNotMatch(t, /Ancestry|23andMe|MyHeritage|FamilyTreeDNA/i);
});

test("what to check at home comes from the story, and the open questions each name a record", () => {
  const r = plan(family(), null, "A photograph taken around 1979 shows them.");
  assert.match(r.home[0].title, /photograph from about 1979/);
  assert.ok(r.home.some((x) => /Certificates/.test(x.title)) && r.home.some((x) => /memorial cards/.test(x.title)));
  assert.ok(r.open.some((x) => /mother|Roza/.test(x.title)));
  assert.ok(r.open.some((x) => /sisters called/.test(x.title)));
  assert.ok(r.open.every((x) => /^What would answer it: /.test(x.why)));
});

test("a village beside the town says whose books are named, and takes neighbours from both", () => {
  const village = { name: "Selce (Testville)", cc: "HR", cols: [], neigh: [{ km: 4, info: { name: "Dolnja", cols: [book("Births 1900-1935", ["b"], 1900, 1935)] } }] };
  const r = plan(family(), { info: town({ neigh: [] }), village }), c = card(r, /^Vera/);
  assert.match(c.why, /no books for Selce itself/);
  assert.match(c.steps[0].detail, /Dolnja \(4 km\)/);
});

test("no birth year: the plan asks for one instead of naming years", () => {
  const g = family(); delete g.facts.born; g.people[0].bornText = "";
  const r = plan(g);
  assert.match(card(r, /^Vera/).steps[0].why, /No birth year is told/);
  assert.ok(r.open.some((x) => /When was Vera/.test(x.title)));
});

test("a living-age person with no death told is not searched for in death books", () => {
  const g = family(); g.facts.born = 1950; g.people[0].bornText = "";
  assert.match(said(card(plan(g), /^Vera/)), /possibly living/);
});

/* David: «give Lucija and each named child their own next record». Years told in words count, and so do years one step from a told one; a place nobody told names no book. */
const decades = () => ({ facts: { born: null, route: [], siblings: [] }, people: [
  person("self", "Josip Pavić", { rel: "great-grandfather", events: [{ type: "told", text: "Born likely in the 1900s" }, { type: "told", text: "Married late 1920s" }] }),
  person("spouse", "Barbara", { key: "S", maiden: "Tomić", given: { typed: "Barbara" }, events: [{ type: "told", text: "Born likely in the 1900s" }] }),
  person("child", "Katica", { key: "K1", label: "daughter" }), person("child", "Stjepan", { key: "K2", label: "son" }), person("child", "", { key: "K3", unnamed: true }),
  person("line", "", { key: "GM", events: [{ type: "born", year: 1944 }] })] });

test("a decade told in words is a birth year to search, and the wedding keeps its own years", () => {
  const c = card(plan(decades()), /^Josip/);
  assert.match(c.steps[0].title, /1900–1909$/);
  assert.doesNotMatch(said(c), /No birth year is told/);
  assert.match(c.steps.find((s) => /^Marriage/.test(s.title)).title, /with Barbara Tomić · 1926–1929$/);
});

test("the partner and each named child get their own next record, and the child the teller descends from comes before them", () => {
  const r = plan(decades());
  assert.deepEqual(r.people.map((c) => c.title), ["Josip Pavić (your great grandfather)", "Barbara Tomić (wife)", "Your grandmother (one of the children)", "Katica (daughter)", "Stjepan (son)"]);
  assert.match(said(card(r, /^Barbara/)), /Search the birth name Tomić/);
  const lived = decades(); lived.people[1].place = "Testville";
  const bar = card(plan(lived), /^Barbara/);
  assert.match(bar.steps[0].why, /does not say where they were born/);
  assert.doesNotMatch(bar.why, /from Testville/);
  const k = card(r, /^Katica/).steps[0];
  assert.match(k.title, /about 1926–1951$/);
  assert.match(k.why, /worked out from the parents’ marriage/);
  assert.match(k.why, /may be alive/);
  assert.match(card(r, /^Your grandmother/).steps[0].why, /proves your line/);
  assert.ok(r.open.some((x) => /child with no name/.test(x.title)));
  assert.ok(r.people.every((c) => c.why), "every card says what is told of the person");
});

test("a teller's own family: grandparents from their own place, no book for a place nobody told, and no search for the teller or their children", () => {
  const selce = { name: "Selce", cc: "HR", cols: [book("Births 1900-1935", ["b"], 1900, 1935)], neigh: [] };
  const g = { facts: { born: null, route: [], siblings: [], kin: [{ stops: [{ info: selce }] }] }, people: [
    person("self", "Peter Horvat", { key: "ME", me: true }), person("father", "Ivan Horvat", { key: "F", place: "Testville", events: [{ type: "born", year: 1951, place: "Testville" }] }),
    person("mother", "Anna Horvat", { key: "M", events: [{ type: "born", year: 1955 }] }), person("spouse", "Maria", { key: "S" }),
    person("grandfather", "Marko", { key: "FF", label: "your father's father", place: "Selce" }), person("grandmother", "Catherine Meyer", { key: "MM", label: "your mother's mother" }),
    person("child", "Luka", { key: "C1", label: "your child" })] };
  const r = plan(g), titles = r.people.map((c) => c.title).join(" | ");
  assert.doesNotMatch(titles, /Peter|Maria|Luka/);
  const ff = card(r, /^Marko/).steps[0];
  assert.match(ff.title, /about 1906–1934$/);
  assert.match(ff.why, /worked out from the birth of Ivan Horvat/);
  assert.match(ff.detail, /Births 1900-1935/);
  const mm = card(r, /^Catherine Meyer/).steps[0];
  assert.equal(mm.title, "Where and when they were born");
  assert.equal(mm.detail, "");
  assert.match(card(r, /^Ivan Horvat/).steps[0].title, /1951$/);
  assert.match(card(r, /parents’ marriage/).steps[0].title, /1972–1990$/);
  assert.ok(!r.open.some((x) => /When was Peter/.test(x.title)));
});

test("generation groups: the person, the parents and earlier generations, and no book disappears", () => {
  const cols = [book("Births 1700-1760", ["b"], 1700, 1760), ...OLD, book("Births 1890-1930", ["b"], 1890, 1930), book("Burials 1700-1750", ["d"], 1700, 1750)];
  const G = F.generationGroups(cols, 1928);
  assert.deepEqual(G.groups.slice(0, 3).map((x) => x.gen), [0, 1, 2]);
  assert.deepEqual(G.groups[1].born, [1883, 1910]);
  assert.deepEqual(G.groups[1].married, [1903, 1928]);
  assert.ok(G.groups[0].books.some((c) => c.from === 1890), "the person's own birth year");
  assert.ok(G.groups[1].books.some((c) => c.from === 1858) && G.groups[1].books.some((c) => c.from === 1890), "one book may serve more than one generation");
  assert.ok(G.groups.some((x) => x.gen >= 4 && x.books.some((c) => c.from === 1700)), "as far back as the books go");
  assert.ok(G.others.some((c) => /Burials/.test(c.title)));
  for (const c of cols) assert.ok(G.others.includes(c) || G.groups.some((x) => x.books.includes(c)), c.title);
  assert.equal(F.generationGroups(cols, null), null);
});

test("a parent named after «His father X and mother Y, née Z» is read, with her birth name", opts, async () => {
  const { read } = await import("./plan/harness.mjs");
  const { g } = await read("My grandfather Peter Novak was born in 1910 in Karlovac. His father Marko and mother Ana, née Babić, lived there.");
  const mo = g.people.find((x) => x.role === "mother");
  assert.equal(mo && mo.given && (mo.given.typed || mo.name), "Ana");
  assert.equal(mo.maiden, "Babić");
});

test("the plan carries the cards, names the village's own district and starts the family's moves in the village", opts, async () => {
  const { read } = await import("./plan/harness.mjs"), D = await import("./plan/deps.mjs");
  const text = "My grandfather Peter Novak was born in Drežnik near Nova Gradiška in 1910. His father Marko and mother Ana, née Babić, lived there. He moved to Argentina in 1930.";
  const { g } = await read(text), p = D.todo.build(g, Object.assign(D.deps(g), { text }));
  const by = (k) => (p.sections.find((s) => s.key === k) || { items: [] }).items;
  assert.ok(by("people").length >= 4);
  assert.ok(by("home").length && by("open").length);
  assert.match(by("near")[0].title, /^Today Drežnik is in Rešetari/);
  assert.ok(by("moves").some((i) => /Drežnik[^→]*1910 →/.test(i.title)), by("moves").map((i) => i.title).join(" | "));
  assert.match(D.todo.asText(p), /Birth or baptism entry/);
});
