/* The tree-growing loading screen (public/js/load-tree.js): which reader message belongs to which stage, that it is wired into both pages that read a file, that the
   pages' policy did not widen, and that the script makes no request and keeps nothing: its people are invented, never from the visitor's file. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const src = read("../public/js/load-tree.js");
const mod = { exports: {} };
new Function("module", src)(mod);
const { stageOf, STAGES, WORLD } = mod.exports;

test("every message the reader says lands on its stage, and the places step reports how far it is", () => {
  const cases = [["Reading the file…", 0], ["Reading your file…", 0], ["Finding people and places…", 1], ["Reading the Atlas…", 2], ["Placing 412 different places…", 3], ["Building the tree…", 4], ["Putting 1,551 places on the map…", 5], ["Putting 1 place on the map…", 5], ["Tracing journeys (4,210 people moved)…", 6], ["Tracing journeys (1 person moved)…", 6], ["Tracing journeys (no moves found)…", 6], ["Drawing flags and regimes…", 7]];
  for (const [m, i] of cases) assert.equal(stageOf(m)?.i, i, m);
  const p = stageOf("Loading the IT places (30 of 65)…");
  assert.equal(p.i, 3); assert.ok(p.p > 0.4 && p.p < 0.5);
  assert.ok(stageOf("Loading the IT places (65 of 65)…").p <= 0.95, "the places step never reads as finished before the next message says so");
  for (const m of ["Hiding living people…", "Starting…", "Loaded from localhost. Read in this browser", "", "Putting the kettle on", "Tracing paper"]) assert.equal(stageOf(m), null, m);
});

test("the stages run in the order the reader does them, and each has a title and three jokes that cannot break markup", () => {
  const order = ["Reading the file…", "Finding people and places…", "Reading the Atlas…", "Placing 9 different places…", "Loading the IT places (1 of 2)…", "Building the tree…", "Putting 5 places on the map…", "Tracing journeys (2 people moved)…", "Drawing flags and regimes…"];
  const idx = order.map(m => stageOf(m).i);
  assert.deepEqual(idx, [0, 1, 2, 3, 3, 4, 5, 6, 7]);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), "never goes backwards");
  assert.equal(STAGES.length, 8);
  assert.deepEqual(STAGES.slice(4, 7).map(s => s.k), ["Crunching relationships", "Drawing the map", "Tracing the journeys"]);
  assert.match(src, /\/ STAGES\.length/, "the bar is worked out from the number of stages, not a fixed six");
  assert.ok(!/ \/ 6\b/.test(src), "no stage count of six is left in the maths");
  for (const s of STAGES) {
    assert.equal(s.j.length, 3, s.k + " has its three jokes");
    for (const t of [s.k, ...s.j]) assert.ok(t && !/["'<>&`\\]/.test(t), "no quotation mark, bracket or ampersand in: " + t);
  }
});

test("the pipeline still says the messages this maps (so a renamed step cannot silently stop the tree)", () => {
  const pipe = read("../public/roots/js/pipeline.js");
  for (const m of ["Reading the file", "Finding people and places", "Reading the Atlas", "Placing ", "Building the tree", "Putting ", "Tracing journeys (", "Drawing flags and regimes"]) assert.ok(pipe.includes(`'${m}`), m);
  assert.match(pipe, /'Loading the ' \+ cc \+ ' places \('/);
  assert.match(pipe, /' on the map'/);
  /* both the GEDCOM path and the tree.json path say the map and journey steps, between building the tree and drawing the flags */
  assert.equal(pipe.split("tellMap(this.progress, keep.size); tellMoves(this.progress,").length, 3);
});

test("the map and journey steps say only counts, from the people the reader built", async () => {
  const pipe = read("../public/roots/js/pipeline.js");
  const fn = pipe.slice(pipe.indexOf("const count ="), pipe.indexOf("const now ="));
  const { tellMap, tellMoves } = new Function(fn + "; return { tellMap, tellMoves };")();
  const said = []; const say = m => said.push(m);
  tellMap(say, 1551); tellMap(say, 1); tellMoves(say, []);
  tellMoves(say, [{ bp: "Aaa", dp: "Bbb" }, { bp: "Aaa", dp: "Aaa" }, { bp: "Aaa", dp: null }, { bp: "Aaa", dp: "Ccc", hid: 1 }, { living: true, bp: "A", dp: "B" }, { unplaced: true, bp: "A", dp: "B" }, { route: [["A", 1900, 0], ["B", 1910, 0]] }]);
  tellMoves(say, [{ bp: "A", dp: "B" }]);
  assert.deepEqual(said, ["Putting 1,551 places on the map", "Putting 1 place on the map", "Tracing journeys (no moves found)", "Tracing journeys (2 people moved)", "Tracing journeys (1 person moved)"]);
  for (const m of said) assert.ok(stageOf(m), m + " is a stage the loading screen knows");
  assert.ok(!said.join().match(/Aaa|Bbb|Ccc/), "no place name reaches a message");
});

test("the dotted world and its pins are a fixed drawing: 38 rows of 100 dots, pins on the map, routes between pins that exist", () => {
  assert.equal(WORLD.mask.length, 38);
  for (const r of WORLD.mask) assert.match(r, /^[0-9a-f]{25}$/);
  const dots = WORLD.mask.join("").split("").reduce((n, h) => n + parseInt(h, 16).toString(2).replace(/0/g, "").length, 0);
  assert.ok(dots > 1000 && dots < 2000, "about a third of the map is land: " + dots);
  assert.ok(WORLD.pins.length >= 6 && WORLD.pins.every(([lo, la]) => lo >= -180 && lo <= 180 && la <= 80 && la >= -56));
  assert.ok(WORLD.arcs.length >= 4 && WORLD.arcs.every(([a, b]) => a !== b && WORLD.pins[a] && WORLD.pins[b]));
});

test("both pages that read a file load it, and send their progress to it", () => {
  assert.match(read("../src/pages/roots/index.astro"), /<script is:inline src="\/js\/load-tree\.js"><\/script>\s*<script is:inline src="js\/app\.js"/);
  assert.match(read("../src/pages/tree-canvas/index.astro"), /<script is:inline src="\/js\/load-tree\.js"><\/script>/);
  const r = read("../public/roots/js/app.js"), t = read("../public/tree-canvas/app.js");
  assert.match(r, /RALoad\.say\(m\.msg \+ '…'\)/); assert.match(r, /RALoad\.hide\(\)/); assert.match(r, /RALoad\.off\(\)/);
  assert.match(t, /L\.wants\(text\)\) \{ m\.hidden = true; L\.say\(text\)/); assert.match(t, /if \(isError\) L\.off\(\); else L\.hide\(\)/);
});

test("the pages' policy did not widen: scripts and styles stay 'self'", () => {
  for (const f of ["../src/pages/roots/index.astro", "../src/pages/tree-canvas/index.astro"]) {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(read(f))[1];
    assert.match(csp, /script-src 'self';/); assert.match(csp, /style-src 'self';/); assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  }
});

test("the loading screen makes no request, keeps nothing and uses no name from the file", () => {
  for (const bad of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB", "postMessage", "sendBeacon", "eval("]) assert.ok(!src.includes(bad), bad);
  assert.match(src, /var NM = \['Maria'/, "the names on the cards are a fixed list");
  const css = read("../public/js/load-tree.css");
  assert.ok(!/url\(/.test(css), "the stylesheet loads nothing else");
});

test("a reader who asks for less motion gets the words and the bar, not the drawing", () => {
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /if \(still\) cv\.hidden = true/);
  assert.match(src, /if \(still\) ss = stage;/, "no dwelling on a stage, so no map, no travelling suitcase and no waiting");
  assert.match(src, /if \(!still\) \{ ctx\.clearRect/, "nothing is drawn");
});

test("the stage on show never runs ahead of the real one, and the map belongs to the map and journey stages", () => {
  assert.match(src, /if \(ss < stage && tm - ssAt >= DWELL\) \{ ss\+\+;/);
  assert.match(src, /\(ss === 5 \|\| ss === 6 \? 1 : 0\)/);
  assert.equal(STAGES[5].s, "Map"); assert.equal(STAGES[6].s, "Moves");
});

test("the narrow panel keeps room for a two-line joke, and the small type stays readable on the dark card", () => {
  const css = read("../public/js/load-tree.css");
  assert.match(css, /@media \(max-width: 480px\)[^}]*\{[^}]*\.lt-joke \{[^}]*min-height: 40px/);
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const sel of [".lt-card", ".lt-joke", ".lt-real"]) {
    const rule = new RegExp("\\" + sel + " \\{[^}]*\\}").exec(css)[0], fg = /(?:^|[ ;{])color: (#[0-9A-Fa-f]{6})/.exec(rule)[1];
    assert.ok(ratio(fg, "#201C17") >= 4.5, sel + " " + fg + " on the card is " + ratio(fg, "#201C17").toFixed(1));
  }
  for (const c of ["#CFC6B4", "#7DD3C0", "#F2A65A", "#E0644E"]) assert.ok(ratio(c, "#201C17") >= 4.5, "counter " + c);
});

/* the whole reader on the invented sample, listening to what it says: every message lands on a stage, in order, and the map and journey steps are said once, before the flags */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const R = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/roots/");
const has = fs.existsSync(R + "data/atlas.json") && fs.existsSync(R + "data/adm.json") && fs.existsSync(R + "data/floor.json") && fs.existsSync(R + "data/g/ZA.json");
test("the reader says the map and journey steps between building the tree and drawing the flags", { skip: has ? false : "run python3 scripts/build-roots-data.py first" }, async () => {
  const { Session } = await import(R + "js/pipeline.js"); const { makeSample } = await import(R + "js/sample.js");
  const io = { json: async p => JSON.parse(fs.readFileSync(R + p, "utf8")), flag: async id => fs.readFileSync(R + "../fl/" + id + ".svg", "utf8") };
  const said = []; const out = await new Session(io, m => said.push(m)).load(new TextEncoder().encode(makeSample()));
  const steps = said.map(stageOf);
  assert.ok(steps.every(Boolean), "every message the reader says is one the loading screen knows: " + said.filter(m => !stageOf(m)).join("|"));
  const idx = steps.map(s => s.i);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), "the stages only ever go forwards");
  assert.deepEqual([...new Set(idx)], [0, 1, 2, 3, 4, 5, 6, 7], "all eight stages are reached");
  assert.equal(said.filter(m => /^Putting /.test(m)).length, 1); assert.equal(said.filter(m => /^Tracing journeys/.test(m)).length, 1);
  assert.equal(said.find(m => /^Putting /.test(m)), "Putting " + out.atlas.places.length.toLocaleString("en") + " places on the map", "the count is the places the map really has");
  assert.match(said.find(m => /^Tracing journeys/.test(m)), /^Tracing journeys \((no moves found|[\d,]+ (person|people) moved)\)$/);
  assert.ok(out.tree.people.some(p => p.bp && p.dp && p.bp !== p.dp), "the sample has people who moved");
  assert.match(said.find(m => /^Tracing journeys/.test(m)), /people moved|person moved/);
});

test("a tree.json says the same steps, and counts a route of several stops as a journey", { skip: has ? false : "run python3 scripts/build-roots-data.py first" }, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const io = { json: async p => JSON.parse(fs.readFileSync(R + p, "utf8")), flag: async id => fs.readFileSync(R + "../fl/" + id + ".svg", "utf8") };
  const tree = { meta: { title: "Invented" }, places: [{ n: "Grahamstown", lat: -33.31, lon: 26.52, cn: "ZA" }, { n: "Kimberley", lat: -28.74, lon: 24.77, cn: "ZA" }, { n: "Durban", lat: -29.86, lon: 31.03, cn: "ZA" }],
    people: [{ id: "a", given: "Aa", sur: "Bb", by: 1850, dy: 1910, bp: "Grahamstown", dp: "Grahamstown", route: [["Grahamstown", 1850, 0], ["Kimberley", 1880, 0], ["Durban", 1900, 0]] },
             { id: "b", given: "Cc", sur: "Dd", by: 1852, dy: 1920, bp: "Kimberley", dp: "Kimberley", route: [] },
             { id: "c", given: "Ee", sur: "Ff", by: 1855, dy: 1925, bp: "Kimberley", dp: "Durban", route: [] }] };
  const said = []; await new Session(io, m => said.push(m)).loadTree(new TextEncoder().encode(JSON.stringify(tree)));
  const idx = said.map(m => (stageOf(m) || { i: -1 }).i);
  assert.ok(idx.every(i => i >= 0) && idx.join() === [...idx].sort((a, b) => a - b).join(), "every message is a stage, in order: " + said.join(" | "));
  assert.ok(said.includes("Putting 3 places on the map"));
  assert.ok(said.includes("Tracing journeys (2 people moved)"), "the traveller with a route and the one who died elsewhere: " + said.join(" | "));
  assert.ok(idx.indexOf(5) < idx.indexOf(6) && idx.indexOf(6) < idx.indexOf(7));
});
