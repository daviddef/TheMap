/* The Atlas page for a case on /read/: places, dates and people out of the documents, who held each place, the registers, the people as leads, name variants. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js/" + f), "utf8"))(m); return m.exports; };
const AS = load("atlas-summary.js");
const CA = load("case-atlas.js")(AS);
const H = load("handover.js");

const docs = [
  { n: 1, doc: { doc_type: "Census", date_on_document: "1 April 1950", places_named: ["Brooklyn, New York"], persons: [
    { name_as_written: "Ivan Slavich", role: "Head", details: { born: "1905", birthplace: "Senj, Yugoslavia", residence: "Brooklyn, New York" } },
    { name_as_written: "Maria Slavich", role: "Wife", details: {} }, { name_as_written: "Peter Slavich", role: "Son", details: {} }] } },
  { n: 2, doc: { doc_type: "Declaration of intention", date_on_document: "12 May 1938", persons: [
    { name_as_written: "John Slavich", role: "Declarant", details: { born: "1905", birthplace: "Senj" } }, { name_as_written: "A. Smith", role: "Witness", details: {} }] } },
];
const cf = { timeline: [
  { date: "1905", event: "born", place: "Senj, Yugoslavia", who: "the petitioner", source: "doc 1, 2", status: "documented" },
  { date: "1938", event: "declares intent", place: "New York", who: "the petitioner", source: "doc 2", status: "documented" },
  { date: "1950", event: "census", place: "Brooklyn, New York", who: "the petitioner", source: "doc 1", status: "documented" }] };

test("events come from the timeline and from each document's own fields", () => {
  const ev = CA.events(docs, cf);
  assert.ok(ev.some((e) => e.from === "timeline" && e.place === "Senj, Yugoslavia" && e.year === 1905 && e.docs.join() === "1,2"));
  assert.ok(ev.some((e) => e.from === "document" && /birthplace of Ivan Slavich/.test(e.what) && e.year === 1905));
  assert.ok(ev.some((e) => e.from === "document" && /residence of/.test(e.what) && e.year === 1950));
});

test("stops are one per place, in date order, and paths follow the timeline per person", () => {
  const st = CA.stops(CA.events(docs, cf));
  assert.deepEqual(st.map((s) => s.n), st.map((_, i) => i + 1));
  const names = st.map((s) => s.text.split(",")[0]);
  assert.ok(names.indexOf("Senj") < names.indexOf("Brooklyn"), "1905 before 1950");
  assert.equal(names.filter((n) => n === "Brooklyn").length, 1, "the same place named twice is one stop");
  const p = CA.paths(st);
  assert.equal(p.length, 1); assert.equal(p[0].who, "the petitioner"); assert.deepEqual(p[0].seq.map((q) => q.year), [1905, 1938, 1950]);
  const noTl = CA.paths(CA.stops(CA.events(docs, null)));
  assert.ok(noTl.length === 1 && noTl[0].fromDocuments, "without a timeline the dated stops are joined in date order and the path says so");
});

const rows = [{ i: "senj-hr", n: "Senj", cc: "HR", y: 44.99, x: 14.9, c: 10 }, { i: "senj-es", n: "Senj", cc: "ES", y: 40, x: -3, c: 1 },
  { i: "brooklyn", n: "Brooklyn", cc: "US", y: 40.65, x: -73.95, c: 0 }, { i: "port-x", n: "Port", cc: "US", y: 1, x: 1, c: 9 }, { i: "nyc", n: "New York", cc: "US", y: 40.7, x: -74, c: 5 }];
const map = AS.buildMap(rows), countries = { HR: "Croatia", US: "United States", ES: "Spain" };

test("a place text resolves to the leftmost known word, in the country it names, and general words are not places", () => {
  let r = CA.resolve("Senj, Croatia", map, {}, countries); assert.equal(r.row.i, "senj-hr");
  r = CA.resolve("Port of Brooklyn", map, {}, countries); assert.equal(r.row.i, "brooklyn", "'port' is a general word, not the place");
  r = CA.resolve("Senj", map, {}, countries); assert.equal(r.row.i, "senj-hr"); assert.ok(r.alts.some((a) => a.i === "senj-es"), "the other Senj is offered");
  r = CA.resolve("Zzzzz", map, {}, countries); assert.equal(r.row, null);
  assert.deepEqual(CA.countryHints("Brooklyn, U.S.A.", countries), ["US"]);
});

test("a place is read in the company of the words beside it, and the same place under two spellings is one stop", () => {
  const rs = [{ i: "pola-ph", n: "Pola", cc: "PH", y: 13, x: 121, c: 0, v: 5 }, { i: "pula", n: "Pula", q: "pola", cc: "HR", y: 44.87, x: 13.85, c: 4, v: 900 }, { i: "istria", n: "Istria", cc: "HR", y: 45.2, x: 13.9, c: 3, v: 800 },
    { i: "ny-ua", n: "New York", cc: "UA", y: 48, x: 37, c: 0, v: 3 }, { i: "nyc", n: "New York", cc: "US", y: 40.7, x: -74, c: 9, v: 90000 }, { i: "ohio", n: "Ohio", cc: "US", y: 40, x: -82, c: 2, v: 500 },
    { i: "ham-us", n: "Hamilton", cc: "US", y: 39.4, x: -84.5, c: 1, v: 300 }, { i: "ham-nz", n: "Hamilton", cc: "NZ", y: -37.8, x: 175.3, c: 0, v: 20 }];
  const m2 = AS.buildMap(rs), c2 = { HR: "Croatia", US: "United States", NZ: "New Zealand", PH: "Philippines", UA: "Ukraine" };
  assert.equal(CA.resolve("Pola, Istria", m2, {}, c2).row.i, "pula", "Istria is Croatian, so Pola is Pula, not the Philippines");
  assert.equal(CA.resolve("New York, N.Y.", m2, {}, c2).row.i, "nyc", "the one with the most volumes when nothing else says");
  assert.equal(CA.resolve("Hamilton, Butler County, Ohio", m2, {}, c2).row.i, "ham-us", "Ohio puts Hamilton in the United States");
  const rq = [{ i: "pula2", n: "Pula", q: "iulia pietas pola poula puola", cc: "HR", y: 44.8, x: 13.8, c: 86, v: 81 }, { i: "pola-ph2", n: "Pola", cc: "PH", y: 13, x: 123, c: 0, v: 11 },
    { i: "ham-oh", n: "Hamilton", q: "hamilton, ohio, states united", cc: "US", y: 39.2, x: -84.5, c: 1, v: 1089 }, { i: "ham-on", n: "Hamilton", q: "hamilton, ontario", cc: "CA", y: 43.2, x: -79.8, c: 1, v: 5000 }];
  const mq = AS.buildMap(rq), qm = CA.buildQMap(rq);
  assert.equal(CA.resolve("Pola", mq, {}, {}, qm).row.i, "pula2", "an older name finds the place that was called it, over a village of that name");
  assert.equal(CA.resolve("Hamilton, Ohio", mq, {}, {}, qm).row.i, "ham-oh", "the other words of the text are matched against a row's own names and qualifiers");
  const bare = CA.resolve("Croatia", m2, {}, c2); assert.equal(bare.row, null); assert.equal(bare.country, true, "a bare country is not a place to pin");
  const raw = CA.stops([{ place: "Hamilton, Ohio", year: 1950, what: "census", docs: [1], who: "", from: "document" }, { place: "Hamilton, Butler County, Ohio", year: 1924, what: "intent", docs: [2], who: "", from: "timeline" }, { place: "Pula", year: 1902, what: "born", docs: [3], who: "", from: "timeline" }]);
  raw.forEach((x) => { x.row = CA.resolve(x.text, m2, {}, c2).row; });
  const merged = CA.mergeStops(raw);
  assert.deepEqual(merged.map((x) => x.row.i), ["pula", "ham-us"], "two spellings of Hamilton are one stop, numbered in date order");
  assert.deepEqual(merged[1].years, [1924, 1950]); assert.deepEqual(merged[1].docs, [1, 2]); assert.equal(merged[1].raw.length, 2); assert.deepEqual(merged.map((x) => x.n), [1, 2]);
});

test("who held the ground: the era that holds the year, its flag, and what records are filed under", () => {
  const region = { eras: [{ from: 1848, to: 1918, regime: "hab", polity: "Habsburg", filedUnder: ["hda"], note: "n" }, { from: 1918, to: 1941, regime: "yu", polity: "Kingdom of Yugoslavia" }] };
  const g = CA.groundAt(region, { yu: { label: "Yugoslav" } }, 1938, [[1918, 1941, "yu-flag"]]);
  assert.equal(g.polity, "Kingdom of Yugoslavia"); assert.equal(g.regime, "Yugoslav"); assert.equal(g.flag, "yu-flag");
  assert.equal(CA.groundAt(region, {}, 1850, null).filedUnder[0], "hda");
  assert.equal(CA.groundAt(region, {}, 1700, null).none, true);
  assert.equal(CA.groundAt(null, {}, 1850, null), null);
});

test("what a place was called in the year of the record comes from the dated names", () => {
  const named = [{ n: "Fiume", t: 1945, k: "official" }, { n: "Reka", f: 1500, t: 1800 }, { n: "Rijeka", f: 1991 }];
  assert.deepEqual(CA.namesAt(named, 1902).map((x) => x.n), ["Fiume"]);
  assert.deepEqual(CA.namesAt(named, 1700).map((x) => x.n), ["Fiume", "Reka"]);
  assert.deepEqual(CA.namesAt(named, 2000).map((x) => x.n), ["Rijeka"]);
  assert.deepEqual(CA.namesAt(named, null), []);
});

test("registers: those covering the year, else the nearest in time; sources ranked by access then kind", () => {
  const cols = [{ title: "Births 1850-1870", from: 1850, to: 1870 }, { title: "Births 1900-1910", from: 1900, to: 1910 }];
  assert.equal(CA.volumesFor(cols, 1860).cover.length, 1);
  const none = CA.volumesFor(cols, 1895); assert.equal(none.cover.length, 0); assert.equal(none.near[0].title, "Births 1900-1910");
  const r = CA.rankSources([{ name: "B", access: "paid", kind: "national-archive" }, { name: "A", access: "free", kind: "library" }, { name: "C", access: "free", kind: "national-archive" }]);
  assert.deepEqual(r.map((x) => x.name), ["C", "A", "B"]);
  const so = CA.sourcesFor([{ id: "x", countries: ["HR"], name: "X" }, { id: "y", countries: ["HR"], name: "Y" }, { id: "z", countries: ["US"], name: "Z" }], "HR", ["x"]);
  assert.deepEqual(so.filed.map((p) => p.id), ["x"]); assert.deepEqual(so.country.map((p) => p.id), ["y"]);
  const near = CA.sourcesFor([{ id: "a", countries: ["IT"], name: "Archivio di Stato di Agrigento", access: "free" }, { id: "t", countries: ["IT"], name: "Archivio di Stato di Trieste", access: "paid" }], "IT", [], ["Trieste", "Ur"]);
  assert.equal(near.country[0].id, "t", "a source that names the place comes before one that is merely free"); assert.deepEqual(near.country[0].mentions, ["trieste"]);
});

test("the people: merged by name, each document's subject, relations by role", () => {
  const pe = CA.people(docs), t = CA.tree(pe);
  assert.equal(pe.length, 5);
  assert.ok(["Ivan Slavich", "John Slavich", "Maria Slavich", "Peter Slavich", "A. Smith"].every((n) => pe.some((p) => p.name === n)));
  assert.equal(t.spouse[0].name, "Maria Slavich"); assert.equal(t.children[0].name, "Peter Slavich"); assert.equal(t.others[0].name, "A. Smith");
  assert.deepEqual(t.focus.map((p) => p.name), ["Ivan Slavich", "John Slavich"], "each document names its own subject; the case file says whether they are one man");
  assert.deepEqual(CA.splitName("SLAVICH, John Peter"), { given: ["John", "Peter"], surname: "SLAVICH", guess: true });
  assert.equal(CA.splitName("Mrs. Maria Slavich").surname, "Slavich");
});

test("name variants come from the catalogues and carry their status; typography is not a spelling, an accent is", () => {
  const cat = [{ id: "lerena", name: "Lerena", m: [["Lerena", "same"], ["Serena", "attested"], ["Lereña", "same"]] }];
  const f = CA.surnameFamily("LERENA", cat);
  assert.deepEqual(f.forms.map((x) => x.form + ":" + x.status), ["Serena:attested", "Lereña:same"]);
  assert.equal(CA.surnameFamily("Zzz", cat), null);
  const g = CA.givenForms({ langs: { latin: [{ form: "Joannem", status: "rule", notNominative: "accusative" }], italian: [{ form: "Giovanni", status: "attested" }] } });
  assert.equal(g[0].form, "Giovanni"); assert.equal(g[1].declined, true, "a case form of the Latin comes last");
  assert.equal(CA.slugForSurname("Žubrinić"), "zubrinic");
});

test("highlighting finds whole words, longest first, never inside a longer word", () => {
  const layer = { stops: [{ n: 1, text: "Senj, Yugoslavia", place: { name: "Senj" } }], people: [{ name: "Ivan Slavich" }] };
  const spec = CA.highlightSpec(layer);
  const hits = CA.findNames("Ivan Slavich of Senj; the Slavichs; Senjska", spec);
  assert.deepEqual(hits.map((h) => h.item.kind + ":" + "Ivan Slavich of Senj; the Slavichs; Senjska".slice(h.start, h.end)), ["person:Ivan Slavich", "place:Senj"]);
  assert.equal(CA.findNames("slavich", spec)[0].item.kind, "surname", "case does not matter");
});

test("arcs bend across an ocean and stay in one piece across the date line", () => {
  const a = CA.arc([44.99, 14.9], [40.65, -73.95], 20);
  assert.equal(a.length, 21); assert.ok(Math.max.apply(null, a.map((p) => p[0])) > 50, "great circle rises north of both ends");
  const b = CA.arc([-33, 151], [37, -122], 20); for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i][1] - b[i - 1][1]) < 40);
});

test("the hand-over carries the Atlas page as text, and says what is a lead", () => {
  const st = CA.stops(CA.events(docs, cf));
  st.forEach((s) => { s.place = { name: s.text.split(",")[0], country: "X", older: ["Segna"] }; s.ground = [{ year: 1938, polity: "Kingdom of Yugoslavia", regime: "Yugoslav" }]; s.volumes = { cover: [{ title: "Births 1930-1940", from: 1930, to: 1940, held: "HDA" }], near: [] }; s.filed = []; });
  const layer = { stops: st, countries: [{ cc: "HR", name: "Croatia", total: 7, sources: [{ name: "ARHiNET", access: "free", url: "https://x" }] }], start: [{ title: "Open the births", from: "Atlas", how: "covers 1938" }],
    tree: CA.tree(CA.people(docs)), names: { surnames: [{ written: "Slavich", family: null }], given: [], places: [{ written: "Senj", atlas: "Senj", older: ["Segna"] }], reading: [] }, svg: "<svg/>" };
  const m = H.model("", {}, null, "", "2026-11-08", { docs, cf, layer });
  const md = H.toMarkdown(H.document(m, "ai", ""));
  for (const s of ["Where it happened, who held the ground, and where to look", "under Kingdom of Yugoslavia (Yugoslav)", "Births 1930-1940", "ARHiNET [free]", "Where to start", "not a proven tree", "not in a catalogued family yet", "also written Segna", "leads until a record is seen"]) assert.ok(md.includes(s), s);
  assert.ok(H.prompt(m, "ai", "").includes("Where it happened"), "the prompt carries it too");
  assert.ok(H.atlasBlocks(m).some((b) => b.svg), "the PDF gets the journey drawing");
  assert.deepEqual(H.atlasBlocks(H.model("", {}, null, "", "x", { docs })), [], "no layer, no section");
});
