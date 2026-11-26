/* THE HELP PEOPLE GIVE, WHICH THE PAGE DID NOT: ask in the village, recent records are not online, the diocese that holds the returned registers, today's parish.
   Nothing is said to exist that no source shows. The fixtures are hand-built and every name of a person is made up; the last test needs the built public/. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArchivesNear } from "../src/lib/archives-near.js";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(SITE, "public/js", f), "utf8"))(m); return m.exports; };
const T = load("story-todo.js"), A = load("atlas-summary.js");
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
const data = (f) => JSON.parse(fs.readFileSync(path.join(SITE, "..", "data", f), "utf8"));
const near = buildArchivesNear(data("providers.json"), data("provider-contacts.json"), data("provider-emails.json"));
const archives = near.rows.map((r) => Object.fromEntries(near.cols.map((c, i) => [c, r[i]])));
const diocese = archives.find((a) => a.id === "pozega-biskupija-povijesni-arhiv");
const place = (name, adm1, adm2, extra) => Object.assign({ name, cc: "HR", countryName: "Croatia", lat: 45.29, lon: 17.47, row: { i: name }, provs: [], cols: [], neigh: [], p: { admin: { adm1, adm2 } } }, extra || {});
const story = (info, year) => ({ facts: { name: "Vera Pavić", born: year, route: [{ info, role: "born", year }] }, people: [{ role: "self", name: "Vera Pavić", events: [] }], mort: { events: [] } });
const plan = (info, year, o) => T.build(story(info, year), Object.assign({ base: "/", countries: { HR: "Croatia", IT: "Italy" }, regions: { regions: [] }, archives, serves: A.serves, rows: [], provById: {}, cemeteries: { osm: [], wd: [] }, year: 2026 }, o || {}));
const items = (p, key) => (p.sections.find((s) => s.key === key) || { items: [] }).items;
const all = (list) => list.map((i) => [i.title, i.why, i.detail, ...(i.links || []).map((l) => l.t + " " + l.href)].join(" ")).join(" | ");
const village = () => place("Drežnik (Nova Gradiška)", "Brod-Posavina", "Rešetari", { cols: [{ title: "Births 1858-1896", kinds: ["b"], from: 1858, to: 1896 }] });

test("the diocesan archive keeps its own ground and no other", () => {
  assert.ok(diocese && diocese.serves);
  assert.ok(A.serves(diocese, village()));
  assert.ok(A.serves(diocese, place("Anywhere", "Požega-Slavonia", "Kaptol")));
  assert.ok(!A.serves(diocese, place("Slavonski Brod", "Brod-Posavina", "Grad Slavonski Brod")), "the east of that county is another diocese");
  assert.ok(!A.serves(diocese, place("Zagreb", "Zagreb", "")));
  assert.ok(!A.serves(diocese, { name: "Croatia" }), "no county, no guess");
  assert.ok(A.serves({}, place("Zagreb", "Zagreb", "")), "an archive with no ground named is for anywhere");
  assert.match(diocese.serves.source, /^https:\/\//);
});

test("it leads the letters for a place on its ground, with a draft, and is absent elsewhere", () => {
  const here = items(plan(village(), 1930), "write");
  assert.match(here[0].title, /Požeške biskupije/);
  assert.ok(here[0].draft);
  const far = items(plan(place("Duga Resa", "Karlovac", "Grad Duga Resa", { lat: 45.45, lon: 15.5 }), 1930), "write");
  assert.ok(!far.some((i) => /Požeške/.test(i.title)));
});

test("within living memory the plan says to ask in the village, by searches, claiming no society exists", () => {
  const v = items(plan(village(), 1940), "village"), t = all(v);
  assert.match(t, /KUD/);
  assert.match(t, /does not know whether there is/);
  assert.match(t, /heritage/i);
  assert.match(t, /facebook\.com\/search\/groups/);
  assert.match(t, /q=KUD%20Dre%C5%BEnik%20Re%C5%A1etari/);
  assert.match(t, /may be alive/);
  assert.ok(v.every((i) => (i.links || []).every((l) => /^https:\/\//.test(l.href) && !/Pavi/.test(decodeURIComponent(l.href)))), "no person's name goes into a search link");
});

test("recent records: where the books stop, that absence is not proof, and Croatia's access rule with its source", () => {
  const r = items(plan(village(), 1940), "village").find((i) => /Recent records/.test(i.title));
  assert.match(r.why, /stop in 1896/);
  assert.match(r.why, /not proof/);
  assert.match(r.detail, /legal interest/);
  assert.match(r.links[0].href, /zakon\.hr/);
});

test("outside Croatia no society type and no rule are stated", () => {
  const it = place("Borgonovo", "Friuli", "Tarcento", { cc: "IT", countryName: "Italy" }), t = all(items(plan(it, 1940), "village"));
  assert.doesNotMatch(t, /KUD|legal interest|matični/);
  assert.match(t, /local history/i);
});

test("a story long past living memory gets no such advice, and a town seat no village societies", () => {
  assert.deepEqual(items(plan(village(), 1840), "village"), []);
  const town = items(plan(place("Požega", "Požega-Slavonia", "Grad Požega"), 1940), "village");
  assert.equal(town.length, 1);
  assert.match(town[0].title, /Recent records/);
});

test("a parish is given as today's only, with the diocese's page and the year it was renewed", () => {
  const p = items(plan(village(), 1910), "near"), par = p.find((i) => /^Today’s parish for Drežnik/.test(i.title));
  assert.ok(par);
  assert.match(par.detail, /1966/);
  assert.match(par.detail, /need not be/);
  assert.match(par.href, /pozeska-biskupija\.hr/);
  assert.ok(p.some((i) => /nor which parish served a village in a past year/.test(i.why)));
  assert.ok(!items(plan(place("Duga Resa", "Karlovac", "Grad Duga Resa"), 1910), "near").some((i) => /parish for/.test(i.title)));
});

test("typed in a sentence, the village gets the archive, the parish and the village advice", { skip: !BUILT && "needs the built public/ data" }, async () => {
  const { read } = await import("./plan/harness.mjs"), D = await import("./plan/deps.mjs");
  const { g } = await read("My grandfather Peter Novak was born in Drežnik near Nova Gradiška in 1930."), p = D.todo.build(g, D.deps(g));
  assert.match(items(p, "write")[0].title, /Požeške biskupije/);
  assert.ok(items(p, "near").some((i) => /^Today’s parish for Drežnik/.test(i.title)));
  assert.match(all(items(p, "village")), /KUD Dre/);
});
