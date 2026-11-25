/* THE STORY, AS A PLAN (public/js/story-todo.js): where to start, who to write to, what is next door, from the Atlas's own files and nothing else.
   The cases are the ones that failed in real use on 25 Nov 2026: «Dreznik near Nova Gradiska» read as a village 127 km away, Nova Gradiška filed under the
   Bosnian state archive, a plan with no neighbours, no letter and no cemeteries. The logic tests use small hand-built fixtures (they need no built data); the one
   test on the pasted story itself runs against the built public/ and is skipped without it. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..");
const T = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(SITE, "public/js/story-todo.js"), "utf8"))(m); return m.exports; })();

const COUNTRIES = { HR: "Croatia", BA: "Bosnia and Herz.", SI: "Slovenia", AU: "Australia" };
const REGIONS = { regions: [
  { id: "bosnia", label: "Bosnia and Herzegovina", ring: [[44.0, 15.5], [45.5, 15.5], [45.5, 19.5], [44.0, 19.5]], eras: [{ from: 1918, to: 1941, polity: "Kingdom of Yugoslavia", filedUnder: ["arhivbih"] }] },
  { id: "vojna-krajina", label: "The Military Frontier — Vojna krajina", ring: [[44.0, 15.0], [46.0, 15.0], [46.0, 19.5], [44.0, 19.5]], eras: [
    { from: 1881, to: 1918, polity: "Croatia-Slavonia, within Hungary", filedUnder: ["arhinet"], note: "Civil registration from 1895." },
    { from: 1918, to: 1941, polity: "Kingdom of Serbs, Croats and Slovenes; Yugoslavia", filedUnder: ["arhinet"], note: "The state registers of 1895 onward are held by the registry offices." },
    { from: 1941, to: 1945, polity: "Independent State of Croatia", filedUnder: ["arhinet"], note: "Records of these four years are scattered and incomplete." }] }] };
const ARCH = [
  { id: "arhinet", name: "ARHiNET — Croatian State Archives", kind: "national-archive", access: "catalogue", cc: "HR", lat: 45.81, lon: 15.97, url: "https://www.arhiv.hr/", email: "", post: "", tel: "" },
  { id: "dasb", name: "State Archives in Slavonski Brod", kind: "regional-archive", access: "unsurveyed", cc: "HR", lat: 45.1603, lon: 18.0156, url: "https://www.dasb.hr/", email: "", post: "", tel: "" },
  { id: "dazd", name: "Državni arhiv u Zadru", kind: "regional-archive", access: "onsite", cc: "HR", lat: 44.12, lon: 15.23, url: "https://www.dazd.hr/", email: "dazd@dazd.hr", post: "Ruđera Boškovića bb, 23000 Zadar", tel: "+385-23-211-530" }];
const NG = { name: "Nova Gradiška", cc: "HR", countryName: "Croatia", lat: 45.25876, lon: 17.37984, href: "/place/novagradiska/", row: { i: "novagradiska" },
  region: REGIONS.regions[0], p: { admin: { adm1: "Brod-Posavina", adm2: "Grad Nova Gradiška" } }, provs: [],
  cols: [{ provider: "familysearch", title: "Births (Rođeni) 1858-1886", kinds: ["b"], from: 1858, to: 1886, access: "account", url: "https://fs/1" },
    { provider: "familysearch", title: "Marriages (Vjenčani) 1881-1920", kinds: ["m"], from: 1881, to: 1920, access: "account", url: "https://fs/2" }] };
const DR = { name: "Drežnik", cc: "HR", countryName: "Croatia", lat: 45.72239, lon: 15.89547, href: "/place/dreznik/", row: { i: "dreznik" }, region: null, provs: [], cols: [] };
const story = (extra) => ({ facts: Object.assign({ name: "Ivan Mihaljević", route: [{ info: DR, role: "lived", nearInfo: NG, alts: [] }], kin: [{ label: "your grandmother", stops: [{ info: { name: "Slovenia", cc: "SI", lat: 46.25, lon: 15.07, row: { i: "slovenia" }, provs: [], cols: [] }, role: "move" }] }] }, extra || {}),
  people: [{ role: "grandmother", events: [{ type: "born", year: 1942 }] }], mort: { events: [] } });
const deps = (o) => Object.assign({ base: "/", countries: COUNTRIES, regions: REGIONS, archives: ARCH, rows: [], provById: Object.fromEntries(ARCH.map((a) => [a.id, a])), mort: { events: [] }, cemeteries: { osm: [], wd: [] } }, o || {});

test("the story pins one place to another, so the plan starts from the place it is pinned to", () => {
  const p = T.build(story(), deps());
  assert.equal(p.anchor.name, "Nova Gradiška");
  assert.match(p.notes[0], /near Nova Gradiška/);
  assert.match(p.notes[0], /127 km|12\d km/);
});

test("a nearby place that is within 40 km does not move the anchor", () => {
  const near = Object.assign({}, NG, { lat: DR.lat + 0.1, lon: DR.lon + 0.1 });
  const s = story(); s.facts.route[0].info = Object.assign({}, DR, { cols: NG.cols }); s.facts.route[0].nearInfo = near;
  assert.equal(T.build(s, deps()).anchor.name, "Drežnik");
});

test("a village beside the town with no books of its own: desk work starts from the town, burial grounds from the village, the letter names both", () => {
  const village = Object.assign({}, DR, { lat: NG.lat + 0.03, lon: NG.lon + 0.09 });
  const s = story(); s.facts.route[0].info = village; s.facts.route[0].alts = [{ n: "Drežnik", cc: "SI" }];
  const p = T.build(s, deps());
  assert.equal(p.anchor.name, "Nova Gradiška");
  assert.equal(p.anchor.ground.name, "Drežnik");
  assert.match(p.notes[0], /Drežnik is \d+ km from Nova Gradiška/);
  assert.ok(!p.notes.some((n) => /could also be/.test(n)), p.notes.join(" | "));
  const drafts = p.sections.flatMap((x) => x.items).filter((i) => i.draft);
  assert.match(drafts[0].draft.text, /Drežnik \(Nova Gradiška\)/);
});

test("a region ring that names another country is passed over when one that fits exists", () => {
  const r = T.pickRegion(NG, REGIONS, COUNTRIES);
  assert.equal(r.id, "vojna-krajina");
  /* and where only the foreign ring exists, it is kept: nothing better to say */
  assert.equal(T.pickRegion(NG, { regions: [REGIONS.regions[0]] }, COUNTRIES).id, "bosnia");
});

test("the era table is the one for the story's years, filed under the right archive", () => {
  const p = T.build(story(), deps());
  const era = p.sections.find((s) => s.key === "era");
  assert.ok(era, "an era section");
  const titles = era.items.map((i) => i.title).join("|");
  assert.match(titles, /Kingdom of Serbs, Croats and Slovenes/);
  assert.match(titles, /Independent State of Croatia/);
  assert.ok(!/Bosnia|arhivbih|Eyalet/i.test(JSON.stringify(era)), "nothing from the Bosnian table");
  assert.match(JSON.stringify(era), /ARHiNET/);
});

test("volumes are ranked by what they cost and carry why they were chosen; a gap says so", () => {
  const p = T.build(story(), deps());
  const desk = p.sections.find((s) => s.key === "desk");
  assert.match(desk.items[0].title, /Nova Gradiška/);
  const vol = desk.items.find((i) => /Marriages/.test(i.title));
  assert.ok(vol && /Covers 19/.test(vol.why), "says which of the story's years it covers");
  assert.ok(desk.items.some((i) => i.gap && /stop at 1920/.test(i.title)), "says the online volumes stop at 1920");
});

test("an archive with no contact in the Atlas says so; one with a contact shows exactly that", () => {
  const p = T.build(story(), deps());
  const w = p.sections.find((s) => s.key === "write");
  const dasb = w.items.find((i) => /Slavonski Brod/.test(i.title));
  assert.ok(dasb, "the archive 51 km away is offered");
  assert.match(dasb.detail, /holds no address or email/);
  assert.match(dasb.detail, /5\d km away/);
  const near = Object.assign({}, ARCH[2], { id: "dazd2", lat: NG.lat + 0.2, lon: NG.lon });
  const w2 = T.build(story(), deps({ archives: [ARCH[0], near], provById: { arhinet: ARCH[0], dazd2: near } })).sections.find((s) => s.key === "write");
  const zadar = w2.items.find((i) => /Zadru/.test(i.title));
  assert.match(zadar.detail, /dazd@dazd\.hr/);
  assert.match(zadar.detail, /Ruđera Boškovića/);
});

test("a draft letter is in the archive's language and names the place and the surname, on one archive only", () => {
  const p = T.build(story(), deps());
  const w = p.sections.find((s) => s.key === "write");
  const drafts = w.items.filter((i) => i.draft);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].draft.language, "Croatian");
  assert.match(drafts[0].draft.text, /Nova Gradiška/);
  assert.match(drafts[0].draft.text, /Mihaljević/);
  assert.equal(T.draft("XX", "Place", "", null).language, "English");
});

const ground = (cem) => T.build(story(), deps({ cemeteries: cem })).sections.find((s) => s.key === "ground").items;

test("no burial ground is invented: with none listed the plan says so, and that this is not proof", () => {
  const g = ground({ osm: [], wd: [], missing: 0, regions: 41 });
  assert.equal(g.length, 1);
  assert.ok(g[0].gap);
  assert.match(g[0].title, /lists no burial ground within 15 km of Nova Gradiška/);
  assert.match(g[0].why, /41 of its record regions.*not proof/);
});

test("lists that are loading, did not load, or partly arrived are never reported as «there is none»", () => {
  for (const cem of [null, { pending: true }, { failed: true }, { osm: [], wd: [], missing: 1, regions: 41 }]) {
    const g = ground(cem), all = JSON.stringify(g);
    assert.ok(g.every((i) => i.gap));
    assert.ok(!/lists no burial ground/.test(all), all);
  }
  assert.match(ground({ failed: true })[0].title, /not loaded/);
  const part = ground({ osm: [{ id: "w1", n: "Gradsko groblje", y: NG.lat + 0.02, x: NG.lon }], wd: [], missing: 1, regions: 41 });
  assert.ok(part.some((i) => i.gap && /did not load/.test(i.title) && /may be short/.test(i.why)));
});

test("burial grounds within 15 km are shown, named first by distance, once each, with their source", () => {
  const cem = { osm: [{ id: "n3", n: "Staro groblje", y: NG.lat + 0.09, x: NG.lon }, { id: "w1", n: "Gradsko groblje", y: NG.lat + 0.02, x: NG.lon }, { id: "w2", n: "Far", y: NG.lat + 0.5, x: NG.lon }], wd: [{ q: "Q9", n: "Gradsko groblje", y: NG.lat + 0.0201, x: NG.lon }], missing: 0, regions: 41 };
  const g = ground(cem), named = g.filter((i) => !i.gap);
  assert.deepEqual(named.map((i) => i.title), ["Gradsko groblje", "Staro groblje"], "the duplicate and the far one are not listed");
  assert.match(named[0].why, /2 km from Nova Gradiška, listed by OpenStreetMap/);
  assert.match(named[0].href, /openstreetmap\.org\/way\/1$/);
  const last = g[g.length - 1];
  assert.match(last.why, /positions are unchecked, and nothing here says who is buried where/);
});

test("grounds with no name get one line: how many, how near, and a link to the nearest", () => {
  const cem = { osm: [{ id: "w1", n: "Gradsko groblje", y: NG.lat + 0.01, x: NG.lon }, { id: "n5", n: "", y: NG.lat + 0.045, x: NG.lon }, { id: "w6", n: "", y: NG.lat + 0.1, x: NG.lon }, { id: "n7", n: "", y: NG.lat + 0.4, x: NG.lon }],
    wd: [{ q: "Q5", n: "", y: NG.lat + 0.0451, x: NG.lon }], missing: 0, regions: 41 };
  const line = ground(cem).find((i) => /no name/.test(i.title));
  assert.equal(line.title, "2 more burial grounds with no name on the map, nearest 5 km", "the far one is out; Wikidata's point on the same spot is not counted twice");
  assert.match(line.href, /openstreetmap\.org\/node\/5$/);
  const only = ground({ osm: [{ id: "n5", n: "", y: NG.lat + 0.045, x: NG.lon }], wd: [], missing: 0, regions: 41 });
  assert.equal(only[0].title, "1 burial ground with no name on the map, nearest 5 km");
});

test("more named grounds than the list holds are counted, not dropped in silence", () => {
  const osm = Array.from({ length: 13 }, (_, i) => ({ id: "n" + i, n: "Groblje " + i, y: NG.lat + 0.008 * i, x: NG.lon }));
  const g = ground({ osm, wd: [], missing: 0, regions: 41 });
  assert.equal(g.filter((i) => !i.gap && /^Groblje/.test(i.title)).length, 10);
  assert.ok(g.some((i) => i.title === "3 more named burial grounds within 15 km"));
});

test("only the squares around the place are asked for, across a border and in parts", async () => {
  const index = { sources: { osm: { regions: 41, cells: { "45_17": 2, "44_17": 1, "45_16": 1, "10_10": 4 }, parts: { "45_17": 2 } }, wd: { cells: { "45_18": 1 } } } };
  const mid = T.cellsFor(45.5, 17.5, index).map((f) => f.path);
  assert.deepEqual(mid, ["cem/osm/45_17.json", "cem/osm/45_17-1.json"], "mid-square: one square");
  const corner = T.cellsFor(45.01, 17.01, index).map((f) => f.path).sort();
  assert.deepEqual(corner, ["cem/osm/44_17.json", "cem/osm/45_16.json", "cem/osm/45_17-1.json", "cem/osm/45_17.json"], "the 15 km circle crosses two borders");
  assert.ok(T.cellsFor(45.5, 17.95, index).some((f) => f.path === "cem/wd/45_18.json"));
  assert.deepEqual(T.cellsFor(-16.5, 179.95, { sources: { osm: { cells: { "-17_-180": 1 } } } }).map((f) => f.path), ["cem/osm/-17_-180.json"], "across the date line");
  const asked = [], files = { "cem/index.json": index, "cem/osm/45_17.json": { rows: [[45.5, 17.5, "A", "n1"]] } };
  const got = await T.loadCemeteries(45.5, 17.5, async (f) => { asked.push(f); return files[f] || null; });
  assert.deepEqual(asked, ["cem/index.json", "cem/osm/45_17.json", "cem/osm/45_17-1.json"]);
  assert.equal(got.missing, 1);
  assert.deepEqual(got.osm, [{ y: 45.5, x: 17.5, n: "A", id: "n1" }]);
  assert.deepEqual(await T.loadCemeteries(45.5, 17.5, async () => null), { failed: true });
});

test("an event is shown only when the place lies inside its mapped area in the years the people were alive", () => {
  const ring = [[45.0, 17.0], [45.0, 18.0], [45.5, 18.0], [45.5, 17.0]];
  const inside = { n: "Test event", f: 1941, t: 1945, poly: [ring] }, wrongYears = { n: "Old event", f: 1600, t: 1650, poly: [ring] }, elsewhere = { n: "Elsewhere", f: 1941, t: 1945, poly: [[[10, 10], [10, 11], [11, 11], [11, 10]]] };
  const h = T.build(story(), deps({ mort: { events: [inside, wrongYears, elsewhere] } })).sections.find((s) => s.key === "happening");
  assert.equal(h.items.length, 1);
  assert.match(h.items[0].title, /Test event \(1941–1945\)/);
  assert.match(h.items[0].detail, /cannot say anyone in your family/);
  const none = T.build(story(), deps()).sections.find((s) => s.key === "happening");
  assert.ok(none.items[0].gap);
});

test("moves: a line that stays in the home country is not a move, and each leg names a source", () => {
  const s = story(); s.facts.kin.push({ label: "3 of the children stayed", stops: [{ info: Object.assign({}, DR), role: "lived" }] });
  const m = T.build(s, deps()).sections.find((x) => x.key === "moves");
  assert.equal(m.items.length, 1);
  assert.match(m.items[0].title, /Your grandmother: Nova Gradiška → Slovenia/);
});

test("every item says why it was chosen", () => {
  const p = T.build(story(), deps({ rows: [{ i: "x", n: "Cernik", y: 45.27, x: 17.38, c: 13, cc: "HR" }] }));
  assert.ok(p.sections.length >= 5);
  for (const s of p.sections) for (const i of s.items) assert.ok(i.why && i.why.length > 10, s.key + ": " + i.title);
  assert.equal(p.today.length, 4);
});

test("look nearby lists the neighbours the place card holds, nearest first, each with registers that meet the story's years", () => {
  const A = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(SITE, "public/js/atlas-summary.js"), "utf8"))(m); return m.exports; })();
  const rows = [{ i: "a", n: "Cernik", y: 45.27, x: 17.38, c: 13, cc: "HR" }, { i: "b", n: "Far", y: 46.5, x: 17.38, c: 3, cc: "HR" }, { i: "c", n: "Abroad", y: 45.26, x: 17.39, c: 2, cc: "BA" }, { i: "d", n: "Medari", y: 45.30, x: 17.42, c: 0, cc: "HR" }];
  const url = "https://www.familysearch.org/ark:/61903/3:1:test";
  /* what the reader's gather() puts on the anchor: the neighbours, each with its own place file */
  const neigh = A.neighbours(rows, NG).map((x) => ({ km: x.km, books: x.books, info: { name: x.row.n, href: "/place/" + x.row.i + "/", cols: x.row.i === "a" ? [{ title: "Births 1900-1930", url, from: 1900, to: 1930 }] : [] } }));
  const s = story(); s.facts.route[0].nearInfo = Object.assign({}, NG, { neigh });
  const n = T.build(s, deps({ rows, pickVolumes: A.pickVolumes })).sections.find((x) => x.key === "near").items.filter((i) => !i.gap && /km/.test(i.tag || ""));
  assert.deepEqual(n.map((i) => i.title), ["Cernik", "Medari"]);
  assert.match(n[1].why, /lists no volumes/);
  assert.deepEqual(n[0].regs.map((r) => r.href), [url]);
  assert.ok(T.asText(T.build(s, deps({ rows, pickVolumes: A.pickVolumes }))).includes(url), "the register link is in the copied text");
});

test("a story with no place says what is missing and builds nothing", () => {
  const p = T.build({ facts: { route: [], kin: [] }, people: [] }, deps());
  assert.equal(p.sections.length, 0);
  assert.match(p.notes[0], /needs a place/);
});

test("the plan as text keeps the note, the four first moves and every why", () => {
  const t = T.asText(T.build(story(), deps()));
  assert.match(t, /PLAN FOR Nova Gradiška/);
  assert.match(t, /Note: The story puts Drežnik near Nova Gradiška/);
  assert.match(t, /1\. At your desk/);
});

test("archives-near: every row has a position and a url; a contact appears only where a file holds one", async () => {
  const { buildArchivesNear } = await import("../src/lib/archives-near.js");
  const providers = [
    { id: "a", name: "A", kind: "regional-archive", access: "free", countries: ["HR"], url: "https://a", at: { lat: 45.1, lon: 18.0 }, wikidata: "Q1" },
    { id: "b", name: "B", kind: "regional-archive", countries: ["HR"], url: "https://b", at: { lat: 45.2, lon: 18.1 }, wikidata: "Q2" },
    { id: "c", name: "C", kind: "regional-archive", countries: ["HR"], url: "https://c", at: null },
    { id: "d", name: "D", kind: "commercial", countries: ["HR"], url: "https://d", at: { lat: 1, lon: 1 } }];
  const out = buildArchivesNear(providers, { contacts: { Q1: { email: "x@y.hr", tel: "+385" } } });
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows.find((r) => r[0] === "a")[8], "x@y.hr");
  assert.equal(out.rows.find((r) => r[0] === "b")[8], "", "no contact inferred for B");
});

const BUILT = fs.existsSync(path.join(SITE, "public/index.json")) && fs.existsSync(path.join(SITE, "public/regions.json")) && fs.existsSync(path.join(SITE, "public/cem/index.json"));
test("the pasted Ivan and Lucija story: Drežnik by Nova Gradiška, the right era, a letter, neighbours, named burial grounds", { skip: !BUILT && "needs the built public/ data" }, async () => {
  const { read } = await import("./plan/harness.mjs"), { deps: realDeps, todo } = await import("./plan/deps.mjs");
  const text = fs.readFileSync(path.join(__dirname, "plan/drezhik-story.txt"), "utf8").trim();
  const { g } = await read(text), plan = todo.build(g, realDeps(g));
  assert.equal(plan.anchor.name, "Nova Gradiška");
  assert.match(plan.anchor.region, /Military Frontier/);
  assert.ok(plan.notes.some((n) => /Drežnik is \d km from Nova Gradiška/.test(n)), "the Drežnik beside the town, not the one near Zagreb");
  assert.ok(Math.abs(plan.anchor.ground.lat - 45.29) < 0.02);
  const near = plan.sections.find((s) => s.key === "near").items;
  const ng = near.find((i) => i.title === "Nova Gradiška");
  assert.ok(ng && ng.regs.length && ng.regs.every((r) => /familysearch\.org\/ark:/.test(r.href)), "the town the story names is a neighbour, with register links");
  assert.ok(near.some((i) => i.title === "Požega"), "and the larger town further out");
  assert.ok(!/Bosnia and Herzegovina|Eyalet/.test(JSON.stringify(plan.sections.find((s) => s.key === "era"))), "no Bosnian era table");
  const w = plan.sections.find((s) => s.key === "write");
  assert.ok(w.items.some((i) => /Slavonski Brod/.test(i.title) && i.draft && i.draft.language === "Croatian"));
  assert.ok(plan.sections.find((s) => s.key === "near").items.filter((i) => /km/.test(i.tag || "")).length >= 3, "neighbouring places");
  const gr = plan.sections.find((s) => s.key === "ground").items;
  assert.ok(gr.some((i) => i.title === "Gradsko groblje" && /km from Drežnik/.test(i.why) && /openstreetmap\.org\/way\//.test(i.href)), "a named ground near Drežnik");
  assert.ok(gr.some((i) => /more burial grounds with no name on the map/.test(i.title)));
  assert.ok(!/lists no burial ground|not loaded/.test(JSON.stringify(gr)));
  const mv = plan.sections.find((s) => s.key === "moves").items.map((i) => i.title).join("|");
  assert.match(mv, /Slovenia → Bosnia and Herz\. → North Macedonia/);
  for (const s of plan.sections) for (const i of s.items) assert.ok(i.why, s.key + ": " + i.title);
});

test("the contacts read off an archive's own page reach the plan: how to write, how to ring, and the branch in town", () => {
  const arch = ARCH.map((a) => a.id !== "dasb" ? a : Object.assign({}, a, { form: "https://dasb.hr/kontakt/", tel: "+385 35 446 573", post: "Augusta Cesarca 1, HR-35000 Slavonski Brod", branches: [{ name: "Collection centre in Nova Gradiška", tel: "+385 35 361 053" }] }))
    .map((a) => a.id !== "arhinet" ? a : Object.assign({}, a, { email: "info@arhiv.hr", state: "listed" }));
  const p = T.build(story(), deps({ archives: arch }));
  const w = p.sections.find((s) => s.key === "write");
  const dasb = w.items.find((i) => /Slavonski Brod/.test(i.title));
  assert.match(dasb.detail, /\+385 35 446 573/);
  assert.match(dasb.detail, /Collection centre in Nova Gradiška \+385 35 361 053/);
  assert.deepEqual(dasb.links.map((l) => l.href), ["https://dasb.hr/kontakt/", "tel:+38535446573"]);
  const hda = w.items.find((i) => /ARHiNET/.test(i.title));
  assert.match(hda.detail, /info@arhiv\.hr \(published by the institution\)/);
  assert.equal(hda.links[0].href, "mailto:info@arhiv.hr");
  /* the regional archive the draft is for leads «write», even though only the capital's has an email */
  assert.match(p.today[1].text, /Slavonski Brod \(use its contact form, or call \+385 35 446 573\)/);
  assert.match(p.today[3].text, /collection centre in Nova Gradiška \(\+385 35 361 053\).*ask what it holds/);
});

