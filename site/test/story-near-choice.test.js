/* «X NEAR Y» (public/js/story-engine.js nearResolve) and what stands round the place chosen. David, 26 November 2026: «the story said Drežnik near Nova Gradiska. why
   arent we picking up the right one on that basis?» Every sentence here is made up. The gazetteer rows are real ones, as the shard g/dre.json holds them. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();
const T = (() => { const m = { exports: {} }; new Function("module", src("story-todo.js"))(m); return m.exports; })();

const SHARD = [
  ["Drežnik Brezovički", 45.7224, 15.8955, "HR", ["Dreznik"], "dreznik dreznik brezovicki"], ["Drežnik", 45.2903, 17.4697, "HR", [], "dreznik"],
  ["Drežnik Grad", 44.9492, 15.6742, "HR", ["Dreznik"], "dreznik dreznik grad"], ["Drežnik Podokićki", 45.7226, 15.7426, "HR", [], "dreznik podokicki"],
  ["Drežnik", 45.4608, 15.2039, "SI", [], "dreznik"], ["Drežnik", 45.5144, 14.8519, "SI", [], "dreznik"], ["Drežnik", 44.5347, 18.6379, "BA", [], "dreznik"], ["Drežnik", 43.7783, 19.9136, "RS", [], "dreznik"]];
const ZAGREB = { i: "dreznik", n: "Drežnik Brezovički", y: 45.72239, x: 15.89547, cc: "HR", c: 1 };
const NEW = { i: "drezniknovagradiska", n: "Drežnik (Nova Gradiška)", y: 45.2903, x: 17.4697, cc: "HR", c: 0 };
const NG = { i: "novagradiska", n: "Nova Gradiška", y: 45.25876, x: 17.37984, cc: "HR", c: 17 };
const countries = { HR: "Croatia", SI: "Slovenia", BA: "Bosnia and Herz.", RS: "Serbia" };

function read(text, opts = {}) {
  const rows = [ZAGREB, NG, ...(opts.shelf === false ? [] : [NEW])], given = A.buildGiven([]), map = A.buildMap(rows);
  F.aliasMerge(map, rows, { dreznik: opts.shelf === false ? ["dreznik"] : ["dreznik", "drezniknovagradiska"] }, given);
  for (const w of F.gazWants(text, map, given)) F.gazMerge(map, w, w.ph === "dreznik" ? (opts.shard || SHARD) : []);
  return F.parseStory(text, { map, given, skip: {}, countries, pick: opts.pick });
}
const SENT = "My grandfather was born in Dreznik near Nova Gradiska in 1900.";

test("the name before «near» is looked up in the gazetteer even though the Atlas holds one of that name", () => {
  const map = A.buildMap([ZAGREB, NG]);
  F.aliasMerge(map, [ZAGREB], { dreznik: ["dreznik"] }, A.buildGiven([]));
  const w = F.gazWants(SENT, map, A.buildGiven([])).filter((x) => x.near);
  assert.ok(w.some((x) => x.ph === "dreznik"));
  const before = JSON.stringify(map.dreznik);
  assert.equal(F.gazMerge(map, { ph: "dreznik", near: true }, SHARD), 7, "every row of that name or listing it");
  assert.equal(JSON.stringify(map.dreznik), before, "kept apart: no other reading changes");
});

test("born in Dreznik near Nova Gradiska is the Drežnik 8 km from Nova Gradiška, even when the Atlas holds only the other one", () => {
  const p = read(SENT, { shelf: false });
  assert.equal(p.stops[0].row.x, 17.4697);
  assert.equal(p.stops[0].role, "born");
  assert.equal(p.people[0].place.row.x, 17.4697, "the person's card reads the same place");
  const n = p.near[0];
  assert.equal(n.level, "clear");
  assert.ok(Math.round(n.options[0].km) >= 6 && Math.round(n.options[0].km) <= 10);
  const away = n.options.find((o) => o.row.i === "dreznik");
  assert.ok(away.km > 100 && away.km < 140, "Zagreb's is set aside with its distance");
});

test("with that village on the shelf, its own page is the one read", () => {
  const p = read(SENT);
  assert.equal(p.stops[0].row.i, "drezniknovagradiska");
  assert.equal(p.near[0].level, "clear");
});

test("the same story told backwards is read the same way", () => {
  for (const t of ["My grandfather was born near Nova Gradiska in a village called Dreznik.", "They lived in a small village near Nova Gradiska called Dreznik."]) assert.equal(read(t).stops[0].row.x, 17.4697, t);
});

test("without «near», the Atlas's usual reading is untouched and nothing is explained", () => {
  const p = read("My grandfather was born in Dreznik in 1900.");
  assert.equal(p.stops[0].row.i, "dreznik");
  assert.deepEqual(p.near, []);
});

test("the reader's own tap wins, and is said to be theirs", () => {
  const p = read(SENT, { pick: { dreznik: "dreznik" } });
  assert.equal(p.stops[0].row.i, "dreznik");
  assert.equal(p.near[0].byReader, true);
});

test("two places of the name near the town is doubtful, and says so", () => {
  const p = read(SENT, { shard: SHARD.concat([["Drežnik", 45.2, 17.3, "HR", [], "dreznik"]]) });
  assert.equal(p.near[0].level, "two");
  const w = words(p.near[0]);
  assert.ok(w.unsure); assert.match(w.head, /more than one/);
});

test("when none is near, the reading does not move and the page says none is", () => {
  const p = read(SENT, { shelf: false, shard: SHARD.filter((r) => r[2] !== 17.4697) });
  assert.equal(p.stops[0].row.i, "dreznik");
  assert.equal(p.near[0].level, "far");
  const w = words(p.near[0]);
  assert.ok(w.unsure); assert.match(w.say, /within 40 km of Nova Gradiška/); assert.match(w.say, /plan starts from Nova Gradiška/);
});

test("when the gazetteer could not be read, the words do not claim it was", () => {
  const rows = [ZAGREB, NG], given = A.buildGiven([]), map = A.buildMap(rows);
  F.aliasMerge(map, rows, { dreznik: ["dreznik"] }, given);
  const p = F.parseStory(SENT, { map, given, skip: {}, countries });
  assert.match(words(p.near[0]).say, /only the Atlas's own list/);
});

/* the gathered shape, as LD.gather hands it to the card, from the parsed record */
function gathered(n) {
  const info = (r) => ({ name: r.n, cc: r.cc, countryName: countries[r.cc], lat: r.y, lon: r.x, row: r, cols: r.c ? new Array(r.c).fill({}) : [], provs: [] });
  return { ...n, anchor: info(n.anchor), options: n.options.map((o) => ({ info: info(o.row), km: o.km, dir: o.dir })) };
}
const words = (n) => F.nearWords(gathered(n), countries);

test("the words name the place, the distance, the direction and the ones set aside", () => {
  const w = words(read(SENT).near[0]);
  assert.equal(w.head, "Which Drežnik? The one near Nova Gradiška");
  assert.match(w.say, /^We took Drežnik, Croatia, \d+ km north-east of Nova Gradiška, because/);
  assert.ok(!w.unsure);
  assert.ok(w.others.some((x) => x.name === "Drežnik Brezovički, Croatia" && /12\d km north-west of Nova Gradiška/.test(x.where)));
});

test("the plan keeps a place the reader chose by hand, however far", () => {
  const nd = gathered(read(SENT, { pick: { dreznik: "dreznik" } }).near[0]), chosen = nd.options.find((o) => o.info.row.i === "dreznik").info;
  const a = T.anchorOf({ facts: { route: [{ info: chosen, role: "born", nearInfo: nd.anchor, alts: [] }], near: [nd] } });
  assert.equal(a.info.name, "Drežnik Brezovički");
  assert.match(a.note, /^You chose Drežnik Brezovički, 12\d km from Nova Gradiška/);
});

test("neighbours are the nearest and the ones with the most volumes, the town the story names among them", () => {
  const info = { lat: 45.2903, lon: 17.4697, cc: "HR", name: "Drežnik (Nova Gradiška)", row: { i: "here" } };
  const small = Array.from({ length: 9 }, (_, i) => ({ i: "s" + i, n: "Selo " + i, y: 45.29 + i * 0.004 + 0.004, x: 17.47, cc: "HR", c: 1 }));
  const big = { i: "pozega", n: "Požega", y: 45.33149, x: 17.67302, cc: "HR", c: 14 };
  const got = A.neighbours([NG, big, { i: "x", n: "Beyond", y: 46.2, x: 17.47, cc: "HR", c: 50 }, ...small], info);
  const ids = got.map((x) => x.row.i);
  assert.ok(ids.includes("novagradiska") && ids.includes("pozega"), ids.join());
  assert.ok(!ids.includes("x"), "past 25 km");
  assert.deepEqual(got.map((x) => x.km), got.map((x) => x.km).slice().sort((a, b) => a - b));
});

test("a neighbour whose name points somewhere else is said to be doubtful", () => {
  const rows = [{ i: "dubovac", n: "Dubovac (Karlovac)", y: 45.24111, x: 17.205, cc: "HR", c: 8 }, { i: "karlovac", n: "Karlovac", y: 45.4929, x: 15.5553, cc: "HR", c: 20 }, NG];
  const got = A.neighbours(rows, { lat: 45.2903, lon: 17.4697, cc: "HR", name: "Drežnik", row: { i: "here" } });
  const d = got.find((x) => x.row.i === "dubovac").doubt;
  assert.equal(d.of, "Karlovac"); assert.ok(d.km > 100);
  assert.equal(got.find((x) => x.row.i === "novagradiska").doubt, undefined);
});

test("one book written two ways is offered once", () => {
  const ark = "https://www.familysearch.org/ark:/61903/3:1:X";
  const info = { cols: [{ title: "Deaths 1903-1918", url: ark + "?cc=2040054&wc=AAAA-BBB%3A1%2C2", from: 1903, to: 1918 }], p: { volumes: [{ t: "Deaths 1903-1918", url: ark + "?wc=AAAA-BBB", from: 1903, to: 1918 }, { t: "Births 1900-1910", url: ark + "?wc=CCCC-DDD", from: 1900, to: 1910 }] } };
  assert.equal(A.pickVolumes(info, [1900, 1920], 5).length, 2);
});

test("the register links offered are the ones that meet the story's years, else the nearest in time", () => {
  const u = (n) => "https://www.familysearch.org/ark:/61903/3:1:" + n;
  const info = { cols: [{ title: "Births 1758-1800", url: u(1), from: 1758, to: 1800 }, { title: "Births 1878-1912", url: u(2), from: 1878, to: 1912 }, { title: "A catalogue card", url: "https://example.org/x", from: 1900, to: 1940 }], p: { volumes: [{ t: "Deaths 1908-1945", url: u(3), from: 1908, to: 1945 }] } };
  assert.deepEqual(A.pickVolumes(info, [1910, 1942], 3).map((v) => v.url), [u(3), u(2)]);
  const none = A.pickVolumes(info, [1990, 1995], 2);
  assert.ok(none.every((v) => !v.fits)); assert.equal(none[0].url, u(3));
});
