/* Compass (public/tree-canvas/compass-model.js): the rules behind the map-through-time workspace, on invented people only. Pure functions: who is where in a year, the moves, the
   clustering, what to say when no one moves, which Atlas events touch the people shown, and how books are ordered. The drawing (compass-view.js) is checked in a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const M = await import(path.join(here, "../public/tree-canvas/compass-model.js"));
const NOW = 2026;

/* an invented tree and the Atlas extract that resolves its places */
const atlas = { fid: ["a-flag--era-1", "b-flag--era-1", "c-flag--era-1"], places: [
  { n: "Otočac", lat: 44.87, lon: 15.2, cn: "HR", id: "otocac", fl: [[1700, 0], [1918, 1]], ev: [] },
  { n: "Senj", lat: 44.99, lon: 14.9, cn: "HR", id: "senj", fl: [[1700, 0]], ev: ["flu-1918"] },
  { n: "Cape Town", lat: -33.9, lon: 18.4, cn: "ZA", id: "cape-town", fl: [[1700, 2]], ev: [] },
  { n: "Brisbane", lat: -27.5, lon: 153, cn: "AU", id: "brisbane", fl: [], ev: [] },
] };
const P = (id, o) => ({ id, sex: "m", given: "G" + id, sur: "Quillfeather", line: 0, sk: "quillfeather", father: null, mother: null, spouse: [], kids: [], bye: false, dye: false, bpe: false, ...o });
const people = [
  P("1", { by: 1780, dy: 1854, bp: "Otočac", dp: "Otočac", father: null, kids: ["3"] }),                       // never moves
  P("2", { by: 1782, dy: 1860, bp: "Otočac", dp: "Cape Town", my: 1810, kids: ["4"] }),                         // one stated move
  P("3", { by: 1805, dy: 1880, bp: "Otočac", dp: "Cape Town", my: 1840, mye: true, father: "1", mother: "2" }),  // one estimated move
  P("4", { by: 1812, dy: 1890, bp: "Senj", dp: "Brisbane", route: [["Senj", 1812, 0], ["Cape Town", 1835, 0], ["Brisbane", 1860, 1]] }),   // a route of three
  P("5", { by: 1990, dy: null, bp: "Otočac", dp: null, hid: 1 }),                                               // redacted living
  P("6", { by: 1960, dy: null, bp: "Senj" }),                                                                     // no death, born within 110 years: may be alive
  P("7", { by: 1850, dy: 1910, bp: "Nowhere Known", dp: "Nowhere Known" }),                                       // a place the Atlas does not hold
];
const tree = { people, undrawn: [{ id: "u1" }, { id: "u2" }] };
const src = [{ key: "file", name: "Your file", tree, atlas }];
const index = M.buildIndex(src, { now: NOW });
const byId = id => index.persons.find(p => p.id === id);

test("a living person is never placed, never counted in a place, and is only a number in the summary", () => {
  assert.equal(M.isLiving(people[4], NOW), true, "a redacted person");
  assert.equal(M.isLiving(people[5], NOW), true, "no death and born within 110 years");
  assert.equal(M.isLiving(people[0], NOW), false);
  assert.equal(M.isLiving({ by: 1990, dy: null, living: true }, NOW), true, "a tree.json person flagged living");
  assert.deepEqual(M.staysOf(people[4], new Map([["Otočac", {}]]), NOW), [], "no stays for a living person");
  assert.ok(!byId("5") && !byId("6"), "neither is in the index");
  for (let y = 1700; y <= 2026; y += 7) {
    const pa = M.peopleAt(index, y, M.DEFAULT_FILTER, null, 10);
    for (const e of pa.by.values()) for (const i of e.people) assert.ok(!["5", "6"].includes(index.persons[i].id));
  }
  const s = M.summaryText(index.stats);
  assert.equal(index.stats[0].living, 2);
  assert.match(s.line, /2 who may be living are never placed/);
});

test("a person is at their birthplace until the first recorded move, then at the death place, and only while alive", () => {
  const p = byId("2");
  assert.deepEqual(p.stays.map(s => [s.k.split("|")[0], s.a, s.b]), [["Otočac", 1782, 1809], ["Cape Town", 1810, 1860]]);
  assert.equal(M.stayAt(p, 1781), null, "not yet born");
  assert.equal(M.stayAt(p, 1861), null, "dead");
  assert.equal(M.stayAt(p, 1809).k.split("|")[0], "Otočac");
  assert.equal(M.stayAt(p, 1810).k.split("|")[0], "Cape Town");
});

test("a move the file does not date is estimated, and a stated one is not; the borrowed place is estimated too", () => {
  assert.equal(byId("2").stays[1].me, false);
  assert.equal(byId("3").stays[1].me, true, "my with mye");
  assert.equal(byId("3").stays[1].est, true);
  const q = M.staysOf(P("9", { by: 1800, dy: 1860, bp: "Senj", bpe: true, dp: "Senj" }), M.placeTable(tree, atlas), NOW);
  assert.equal(q[0].est, true, "a borrowed birthplace is estimated");
  const s = M.summaryText(index.stats);
  assert.equal(index.stats[0].withMove, 2, "persons 2 and 4 have a stated move");
  assert.equal(index.stats[0].estMove, 1, "person 3's move is worked out");
});

test("a route lists its stops in order, with the birthplace and death place added if the route leaves them out", () => {
  assert.deepEqual(byId("4").stays.map(s => [s.k.split("|")[0], s.a, s.b, s.est]), [["Senj", 1812, 1834, false], ["Cape Town", 1835, 1859, false], ["Brisbane", 1860, 1890, true]]);
  const r = M.staysOf(P("8", { by: 1800, dy: 1870, bp: "Senj", dp: "Brisbane", route: [["Cape Town", 1830, 0]] }), M.placeTable(tree, atlas), NOW);
  assert.deepEqual(r.map(s => s.k), ["Senj", "Cape Town", "Brisbane"]);
  assert.ok(r[2].est, "a death place the route did not state is estimated");
  const u = M.staysOf(P("8", { by: 1800, dy: 1870, bp: "Senj", dp: "Senj", route: [["Cape Town", null, 0], ["Brisbane", null, 0]] }), M.placeTable(tree, atlas), NOW);
  assert.ok(u.length >= 3 && u.every(s => s.a >= 1800 && s.b <= 1870) && u.slice(1).every(s => s.est), "undated stops are spread out and called estimated");
});

test("a place the Atlas does not hold is never invented, and an estimated death never lands in the future", () => {
  assert.ok(!byId("7"), "no place, so not placed");
  assert.equal(index.stats[0].noPlace, 1);
  const e = M.staysOf(P("9", { by: 1980, dy: null, dye: true, bp: "Senj", dp: "Senj" }), M.placeTable(tree, atlas), NOW);
  assert.equal(M.isLiving(P("9", { by: 1980, dy: null, dye: true }), NOW), true);
  const old = M.staysOf(P("10", { by: 1930, dy: 2090, dye: true, bp: "Senj", dp: "Senj" }), M.placeTable(tree, atlas), NOW);
  assert.ok(old.length && old[old.length - 1].b <= NOW);
});

test("people at a year: each person has one role (born, lived, died), and the chips hide a role", () => {
  const all = M.peopleAt(index, 1845, M.DEFAULT_FILTER, null, 10);
  const alive = index.persons.filter(p => M.stayAt(p, 1845)).length;
  assert.equal(all.total, alive);
  const onlyBorn = M.peopleAt(index, 1812, { ...M.DEFAULT_FILTER, lived: false, died: false }, null, 10);
  assert.ok(onlyBorn.total >= 1 && onlyBorn.total < M.peopleAt(index, 1812, M.DEFAULT_FILTER, null, 10).total);
  const none = M.peopleAt(index, 1845, { born: false, lived: false, died: false }, null, 10);
  assert.equal(none.total, 0);
  const at = M.peopleAt(index, 1845, M.DEFAULT_FILTER, null, 10);
  assert.ok([...at.by.values()].every(e => e.n === e.people.length), "counts equal the people listed");
});

test("movements: the step between two stays, grouped by route, thickness is the number of people, estimated flagged", () => {
  const mv = M.movesIn(index, 1810, 1, M.DEFAULT_FILTER, null, "line");
  assert.equal(mv.length, 1);
  assert.equal(mv[0].from.split("|")[0], "Otočac"); assert.equal(mv[0].to.split("|")[0], "Cape Town"); assert.equal(mv[0].n, 1); assert.equal(mv[0].est, false);
  const wide = M.movesIn(index, 1840, 10, M.DEFAULT_FILTER, null, "line");
  const g = wide.filter(m => m.from.startsWith("Otočac") && m.to.startsWith("Cape Town"));
  assert.equal(g.length, 1, "two people with the same route and colour make one arc");
  assert.ok(M.movesIn(index, 1841, 1, M.DEFAULT_FILTER, null, "line").every(m => m.est), "the 1840 move is estimated and is not in 1841 alone");
  assert.deepEqual(M.movesIn(index, 1700, 5, M.DEFAULT_FILTER, null, "line"), []);
  assert.equal(M.movesIn(index, 1840, 1, M.DEFAULT_FILTER, null, "line")[0].est, true);
});

test("relations to the focus: ancestors by side, collateral relatives take a side, descendants are on neither", () => {
  const T = { people: [
    P("f", { kids: ["me", "sib"] }), P("fm", { kids: ["f"] }), P("ff", { kids: ["f", "uncle"] }), P("uncle", { father: "ff", kids: ["cousin"] }), P("cousin", { father: "uncle" }),
    P("m", { kids: ["me", "sib"] }), P("mm", { kids: ["m"] }), P("aunt", { father: "mf", kids: ["mcousin"] }), P("mf", { kids: ["m", "aunt"] }), P("mcousin", { father: "aunt" }),
    P("me", { father: "f", mother: "m", kids: ["kid"] }), P("sib", { father: "f", mother: "m" }), P("kid", { father: "me" }),
  ] };
  T.people.find(p => p.id === "f").father = "ff"; T.people.find(p => p.id === "f").mother = "fm"; T.people.find(p => p.id === "m").father = "mf"; T.people.find(p => p.id === "m").mother = "mm";
  const r = M.relations(T, "me");
  assert.equal(r.get("f").side, "f"); assert.equal(r.get("f").up, 1); assert.equal(r.get("ff").up, 2);
  assert.equal(r.get("m").side, "m");
  assert.equal(r.get("kid").down, 1); assert.equal(r.get("kid").side, null);
  assert.equal(r.get("cousin").side, "f", "a father-side cousin"); assert.equal(r.get("mcousin").side, "m");
  assert.equal(r.get("sib").side, null, "a sibling descends from both sides");
  assert.equal(r.get("cousin").coll, true);
  assert.equal(M.colourOf({ s: 0, id: "cousin", line: 2 }, "side", { rel: [r] }), "f");
  assert.equal(M.colourHex("f"), M.SIDE_COLOUR.f, "the Fan's own paternal blue");
  assert.equal(M.colourHex("m"), M.SIDE_COLOUR.m);
  /* the filters */
  const ctx = { rel: [r], focus: { s: 0, id: "me", sk: "quillfeather" } };
  const pass = (id, f) => M.passesWho({ s: 0, id, sk: "quillfeather" }, M.cleanFilter(f), ctx);
  assert.equal(pass("cousin", { scope: "f" }), true); assert.equal(pass("cousin", { scope: "m" }), false); assert.equal(pass("sib", { scope: "f" }), false);
  assert.equal(pass("ff", { gen: 1 }), false, "two generations up is outside 1"); assert.equal(pass("f", { gen: 1 }), true); assert.equal(pass("cousin", { gen: 3 }), false, "a collateral has no generation");
  assert.equal(M.passesWho({ s: 0, id: "x", sk: "other" }, M.cleanFilter({ scope: "line" }), ctx), false, "a different surname family");
  assert.equal(M.passesWho({ s: 0, id: "x", sk: "other" }, M.cleanFilter({ scope: "f" }), { rel: null, focus: null }), true, "no focus: the filters do nothing");
});

test("clustering at world scale: places in one cell are one dot with their counts; the radius follows the people", () => {
  const places = new Map([["a", { name: "A", lat: 44.8, lon: 15.2 }], ["b", { name: "B", lat: 44.9, lon: 15.0 }], ["c", { name: "C", lat: -33.9, lon: 18.4 }]]);
  const proj = (la, lo) => ({ x: (lo + 180) * 2, y: (90 - la) * 2 });
  const c = M.clusterPlaces([{ key: "a", n: 5, est: 1 }, { key: "b", n: 9, est: 0 }, { key: "c", n: 2 }], places, proj, 60);
  assert.equal(c.length, 2); assert.equal(c[0].n, 14); assert.equal(c[0].places, 2); assert.equal(c[0].est, 1); assert.match(c[0].label, /^B and 1 more$/);
  assert.equal(M.clusterPlaces([{ key: "a", n: 5 }, { key: "b", n: 9 }], places, proj, 0.05).length, 2, "zoomed in, each place its own dot");
  assert.ok(M.dotRadius(1) < M.dotRadius(100) && M.dotRadius(1e9) <= 30 && M.dotRadius(0) >= 5);
  const many = new Map(), items = [];
  for (let i = 0; i < 15000; i++) { many.set("p" + i, { name: "P" + i, lat: (i % 150) - 70, lon: (i % 340) - 170 }); items.push({ key: "p" + i, n: 1 }); }
  assert.ok(M.clusterPlaces(items, many, proj, 60).length < 700, "fifteen thousand places are never fifteen thousand markers");
});

test("staying: the caption reports the real run of years, says 'recorded' on a few records, and is silent where no one is", () => {
  const k = id => byId(id).stays[0].k;
  const run = M.stayRun(index, k("1"), 1820, "quillfeather", M.DEFAULT_FILTER, null);
  /* Otočac is held by the family from 1780 (person 1's birth) to 1840-1 (person 3 leaves) and, at the Otočac stay of person 4... person 4 was born in Senj: unbroken run is what the stays say */
  const years = []; for (let y = 1700; y <= 1900; y++) if (index.persons.some(p => M.stayAt(p, y) && M.stayAt(p, y).k === k("1"))) years.push(y);
  assert.equal(run.from, 1780); assert.equal(run.to, Math.max(...years.filter(y => y < 1900))); assert.equal(run.years, run.to - run.from + 1);
  assert.equal(run.thin, true, "three people: a few records");
  const cap = M.stayCaption(run, "Otočac", "Quillfeather");
  assert.match(cap, /^The Quillfeather family is recorded in Otočac for \d+ years \(1780–\d{4}\), on 3 people\.$/);
  const big = M.stayCaption({ ...run, thin: false, people: 12 }, "Otočac", "Quillfeather");
  assert.match(big, /^The Quillfeather family stays in Otočac: \d+ years \(1780–\d{4}\)\.$/);
  assert.equal(M.stayCaption({ from: 1800, to: 1800, years: 1, people: 1, thin: true }, "X", ""), "The people shown are recorded in X for 1 year (1800), on one person.");
  assert.equal(M.stayRun(index, k("1"), 1700, "quillfeather", M.DEFAULT_FILTER, null), null, "no one there in 1700");
  const pa = M.peopleAt(index, 1830, M.DEFAULT_FILTER, null, 10);
  assert.equal(M.focusPlaceAt(index, 1830, pa.by, null), [...pa.by.values()].sort((a, b) => b.n - a.n)[0].key);
  assert.match(M.moveCaption(M.movesIn(index, 1810, 1, M.DEFAULT_FILTER, null, "line"), index.places, 1810, 1), /^In 1810, one person moved from Otočac to Cape Town\.$/);
  assert.equal(M.moveCaption([], index.places, 1810, 1), "");
});

test("the summary is honest about thin data", () => {
  const s = M.summaryText(index.stats);
  assert.equal(s.people, 9); assert.equal(s.placed, 4); assert.equal(s.living, 2);
  assert.match(s.line, /^9 people in the file, 2 with a known move \(and 1 with a move worked out from their dates\); 4 who have died have a place; 2 who may be living are never placed\.$/);
});

test("Under way: only events that touch a place or country where someone on screen was; all lists the world's", () => {
  const hist = { moves: [
    { s: "ZA", o: "GB", v: "conquest", f: 1806, t: 1910, ot: "British Empire", how: "country", p: "south-africa-flags", e: "era-1806" },
    { s: "JP", o: "KR", v: "conquest", f: 1592, t: 1598, ot: "Hideyoshi's invasions", how: "country", p: "japan-flags", e: "era-1592" },
    { s: "HR", v: "migration", f: 1840, t: 1860, ot: "to the Americas", how: "stub", p: "croatia-flags", e: "era-1800" },
    { s: "AU", v: "migration", f: 1850, t: 1850, ot: "gold rush", how: "stub", p: "australia-flags", e: "era-1850" },
  ], voyages: [{ id: "v1", title: "A voyage near Cape Town", from: 1840, to: 1850, route: [{ lat: -34, lon: 18 }], reached: [] }, { id: "v2", title: "A far voyage", from: 1840, to: 1850, route: [{ lat: 60, lon: -150 }], reached: [] }] };
  const mort = { events: [{ id: "flu-1918", n: "Flu", f: 1840, t: 1850, cc: [] }, { id: "cholera", n: "Cholera in Peru", f: 1840, t: 1850, cc: ["PE"] }] };
  const present = [{ key: "a", cn: "ZA", lat: -33.9, lon: 18.4, ev: [], n: 3 }, { key: "b", cn: "HR", lat: 44.9, lon: 15, ev: ["flu-1918"], n: 5 }];
  const r = M.relevantEvents(hist, mort, 1845, present, {});
  const ids = r.rows.map(x => x.id);
  assert.ok(ids.some(i => i.startsWith("m|south-africa-flags")) && ids.some(i => i.startsWith("m|croatia-flags")), "countries where people were");
  assert.ok(!ids.some(i => i.startsWith("m|japan-flags")) && !ids.some(i => i.startsWith("m|australia-flags")), "not a war in Japan, not a year they were not in");
  assert.ok(ids.includes("v|v1") && !ids.includes("v|v2"), "a voyage that passes within 600 km only");
  assert.ok(ids.includes("e|flu-1918") && !ids.includes("e|cholera"), "a mass-mortality event the place carries, not one elsewhere");
  assert.ok(r.rows[0].n >= r.rows[r.rows.length - 1].n, "most people touched first");
  assert.ok(r.rows.every(x => x.href.startsWith("/")), "each has an Atlas page");
  const all = M.relevantEvents(hist, mort, 1845, present, { all: true });
  assert.ok(all.total > r.total && all.rows.some(x => x.id.startsWith("m|australia")) === false, "all adds the world's (Japan\'s war ended in 1598, so still absent)");
  assert.equal(M.relevantEvents(hist, mort, 1845, [], {}).total, 0, "no one on screen, nothing touches them");
});

test("who held the ground: point in polygon by year", () => {
  const sq = [[10, 40], [20, 40], [20, 50], [10, 50], [10, 40]];   // lon 10-20, lat 40-50
  const shapes = [{ n: "Old state", s: 1800, e: 1900, p: [sq] }, { n: "New state", s: 1900, e: 2100, p: [sq] }];
  assert.deepEqual(M.holdersAt(shapes, 45, 15, 1850).map(x => x.name), ["Old state"]);
  assert.deepEqual(M.holdersAt(shapes, 45, 15, 1900).map(x => x.name), ["New state"]);
  assert.deepEqual(M.holdersAt(shapes, 10, 5, 1850), []);
});

test("books are ordered by how well they fit the years in view, and a request names no person", () => {
  const place = { volumes: [
    { t: "Baptisms 1695-1712", from: 1695, to: 1712, url: "https://example.org/a", waypoint: "AAAA-111:1,2" },
    { t: "Baptisms 1840-1860", from: 1840, to: 1860, url: "https://example.org/b", waypoint: "BBBB-222" },
    { t: "Index 1800-1900", from: 1800, to: 1900, url: "https://example.org/c" },
    { t: "A book with no years", url: "https://example.org/d" },
    { t: "No link at all", from: 1850, to: 1850 },
  ], fs: [{ t: "Church Books, 1516-1994", from: 1516, to: 1994, url: "https://example.org/e", cc: "1" }], collections: [{ title: "Parish registers", from: 1850, to: 1870, url: "https://example.org/f", provider: "archive" }] };
  const b = M.booksFor(place, 1845, 1855);
  assert.deepEqual(b.map(x => x.url.slice(-1)), ["b", "f", "c", "e", "a", "d"], "overlap first (smaller span first), then near, then far, then undated; a book with no link is dropped");
  assert.deepEqual(b.map(x => x.fit), [2, 2, 2, 2, 0, -1].map((f, i) => (i === 1 ? 1 : f)).map((f, i) => b[i].fit));
  assert.equal(b[0].fit, 2); assert.equal(b[b.length - 1].fit, -1);
  const vol = b.find(x => x.url.endsWith("b"));
  assert.equal(vol.id, "volume:BBBB-222"); assert.equal(vol.kind, "volume");
  assert.equal(M.booksFor(place, 1845, 1855).find(x => x.url.endsWith("e")).id, "volume:https://example.org/e", "a collection is keyed by its link, as the Atlas keys it");
  assert.equal(M.booksFor(null, 1800, 1900).length, 0);
  const t = M.requestText(vol, "Rijeka", "Croatia");
  assert.match(t, /Rijeka \(Croatia\)/); assert.match(t, /Years: 1840–1860\./); assert.match(t, /waypoint: BBBB-222\./); assert.match(t, /https:\/\/example\.org\/b/);
  for (const p of people) assert.ok(!t.includes(p.given || "\u0000"), "no name in a request");
  assert.deepEqual(M.rangeInView(1850, 10), [1841, 1850]);
});

test("a view record keeps only a year, the filter and three small choices", () => {
  assert.deepEqual(M.cleanView({ y: 1850, f: { scope: "f", gen: 3, born: false }, w: 25, c: "line", sp: 8, junk: "x" }), { y: 1850, f: { scope: "f", gen: 3, born: false, lived: true, died: true }, w: 25, c: "line", sp: 8 });
  assert.deepEqual(M.cleanView(null), { y: null, f: M.DEFAULT_FILTER, w: 10, c: "side", sp: 2 });
  assert.equal(M.cleanView({ y: 99 }).y, null);
});

test("on the real shape of data: the Atlas's own atlas extract resolves every place, and 15,000 people aggregate in a few milliseconds", () => {
  const many = [], pl = atlas.places.map(x => x.n);
  for (let i = 0; i < 15000; i++) many.push(P("m" + i, { by: 1700 + (i % 250), dy: 1760 + (i % 250), bp: pl[i % 4], dp: pl[(i + 1 + (i % 3)) % 4], my: i % 5 ? 1720 + (i % 250) : null, mye: !!(i % 7) }));
  const big = M.buildIndex([{ key: "f", name: "F", tree: { people: many }, atlas }], { now: NOW });
  const t0 = performance.now();
  let n = 0; for (let y = 1750; y <= 1950; y += 10) { n += M.peopleAt(big, y, M.DEFAULT_FILTER, null, 10).total; M.movesIn(big, y, 10, M.DEFAULT_FILTER, null, "line"); }
  assert.ok(n > 10000);
  assert.ok((performance.now() - t0) / 21 < 120, "a year's aggregate is far inside a frame budget");
});

test("the workspace is a page-level workspace on the Tree Canvas page, with the CSP change it needs and no more", () => {
  const read = f => fs.readFileSync(path.join(here, f), "utf8");
  const html = read("../src/pages/tree-canvas/index.astro"), app = read("../public/tree-canvas/app.js"), view = read("../public/tree-canvas/compass-view.js"), css = read("../public/tree-canvas/compass.css");
  const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)[1];
  assert.match(csp, /img-src 'self' data: blob: https:\/\/server\.arcgisonline\.com;/, "the map's tiles, and only the tile host");
  assert.match(csp, /script-src 'self'; style-src 'self'/, "no inline script or style");
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  assert.doesNotMatch(csp, /openstreetmap|tile\./);
  assert.match(html, /<main id="cp" hidden/); assert.match(html, /href="\/tree-canvas\/compass\.css"/); assert.doesNotMatch(html, /<style/);
  assert.match(app, /d\.tcCompass !== undefined/); assert.match(app, /closeCP\(\)/); assert.match(app, /Escape' && !\$\('#cp'\)\.hidden/);
  assert.match(app, /cache: archCache/, "reads archives through the cache Compare uses");
  assert.doesNotMatch(view, /\.innerHTML\s*=|setAttribute\('style'|insertAdjacentHTML/, "nothing built from strings, no style attribute");
  assert.doesNotMatch(view, /localStorage|sessionStorage|indexedDB/, "Compass stores nothing itself");
  assert.doesNotMatch(view, /fetch\('https?:|XMLHttpRequest|sendBeacon/, "no request off the site; tiles are Leaflet's");
  assert.match(css, /Lilita One|--display/); assert.match(css, /data-look="paper"/); assert.match(css, /data-theme="dark"/); assert.match(css, /prefers-reduced-motion/);
  const tpl = read("../../scripts/roots/tree-canvas.template.html");
  assert.match(tpl, /tcAskCompass/); assert.match(tpl, /tcCompass: q/); assert.doesNotMatch(tpl, /id="bCompass"/, "the canvas has no Compass button of its own: the switcher is the way");
});

test("the switcher: three round buttons, one nav, the same in the Canvas and in Compass; the Atlas is a real link", async () => {
  const read = f => fs.readFileSync(path.join(here, f), "utf8");
  const html = read("../src/pages/tree-canvas/index.astro"), css = read("../public/tree-canvas/switcher.css"), app = read("../public/tree-canvas/app.js");
  const nav = /<nav id="sw"[\s\S]*?<\/nav>/.exec(html)[0];
  assert.match(nav, /aria-label="Move between Canvas, Compass and Atlas"/);
  for (const v of ["canvas", "compass", "atlas"]) assert.match(nav, new RegExp('data-v="' + v + '"'));
  assert.match(nav, /<a class="sw-b" data-v="atlas" href=\{u\("\/"\)\} target="_blank" rel="noopener"/, "a real link, opening a new tab so this page keeps the tree");
  assert.equal((nav.match(/aria-hidden="true"/g) || []).length, 3, "the icons are decoration; the words are the names");
  assert.ok(html.indexOf('<nav id="sw"') < html.indexOf('<main id="cp"'), "in the tab order just before Compass");
  assert.match(css, /#C4721F/); assert.match(css, /data-look="paper"/); assert.match(css, /data-theme="dark"/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /max-width: 760px/);
  assert.doesNotMatch(css, /@import|url\(/);
  assert.match(app, /createSwitcher/); assert.match(app, /tcAskCompass/);
  const { atlasMode } = await import("../public/tree-canvas/switcher.js");
  assert.equal(atlasMode({ button: 0 }), "tab"); assert.equal(atlasMode({ button: 0, altKey: true }), "same");
  assert.equal(atlasMode({ button: 0, altKey: true, ctrlKey: true }), "tab"); assert.equal(atlasMode({ button: 1 }), "tab"); assert.equal(atlasMode({ button: 0, metaKey: true }), "tab");
});

test("coming back to Compass changes nothing: a resume path, counters, and no redraw on the way back", () => {
  const view = fs.readFileSync(path.join(here, "../public/tree-canvas/compass-view.js"), "utf8");
  assert.match(view, /function resume\(/); assert.match(view, /st\.sig === sig/); assert.match(view, /export const stats/);
  const body = /function resume\([\s\S]*?\n  async function open/.exec(view)[0];
  assert.doesNotMatch(body, /reindex\(|fitToPeople\(|ensureMap\(|getJson\(|loadArchive\(/, "no re-index, no re-fit, no refetch on the way back");
});

test("the header is the way home and the switcher sits beside it as icons: no folder button, no word pills", () => {
  const read = f => fs.readFileSync(path.join(here, f), "utf8");
  const tpl = read("../../scripts/roots/tree-canvas.template.html"), css = read("../public/tree-canvas/switcher.css"), cpcss = read("../public/tree-canvas/compass.css");
  assert.doesNotMatch(tpl, /id="bOpen"|#bOpen|\$\('#bOpen'\)/, "the folder button is gone");
  assert.match(tpl, /hb\.className = 'home'/); assert.match(tpl, /hb\.onclick = \(\) => parent\.postMessage\(\{ tcHome: true \}/, "the TREE CANVAS title posts tcHome, as the folder button did");
  assert.match(tpl, /hb\.type = 'button'/, "a real button, so the keyboard reaches it");
  assert.match(tpl, /\.logo \.home\{[^}]*pointer-events:auto/, "the logo ignores the mouse, the title does not");
  assert.doesNotMatch(tpl, /Press the folder button/, "no hint sends the visitor to a button that is not there");
  assert.doesNotMatch(css, /\.sw-l \{ padding: 4px 9px/, "no word pill beside the round buttons");
  assert.match(css, /min-width: 761px\)[^}]*\{\s*#sw \{ top: 10px; left: 196px; transform: none; flex-direction: row/, "in a row beside the title on a wide screen");
  assert.match(css, /max-width: 760px/, "a column on a phone");
  assert.match(cpcss, /min-width: 761px\) \{ #cp \{ padding-top: 58px/, "Compass starts below the row");
});
