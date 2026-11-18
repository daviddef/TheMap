/* The Tree Canvas's "Your file" page shows the numbers the Roots & Routes tree views show, and the import report Roots & Routes shows, without a second copy of either.
   1. metrics.js is checked against the viewer's OWN code: the component rules and renderMetrics() are cut out of scripts/roots/tree-views.template.html and run
      over the same trees, so if the viewer's rules change and metrics.js does not (or the reverse) this fails.
   2. report-view.js draws the GEDCOM report with the headings it always had, at the heading level asked for, and gives a tree.json its own short account. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { treeMetrics, metricTiles } from "../public/roots/js/metrics.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = fs.readFileSync(path.join(HERE, "..", "..", "scripts", "roots", "tree-views.template.html"), "utf8");

/* ---- the viewer's code, cut out of its page ---- */
function between(src, from, to, what) {
  const i = src.indexOf(from); assert.ok(i >= 0, "cannot find " + what + " in the viewer: has it been renamed? " + from);
  const j = src.indexOf(to, i + from.length); assert.ok(j > i, "cannot find the end of " + what);
  return src.slice(i, j);
}
const LOAD = between(TPL, "function loadTree(T){", "\nfunction makeSample", "loadTree");
const COMPS = between(TPL, "// connected components", "})();", "the connected-components rule") + "})();";
const METRICS = between(TPL, "function renderMetrics(){", "\nfunction renderUndrawn", "renderMetrics");
const PLLINE = TPL.split("\n").find(l => l.startsWith("const PL={};ATLAS.places.forEach"));
const LIVING = TPL.split("\n").find(l => l.startsWith("const living=p=>p.hid===1;"));
assert.ok(PLLINE && LIVING, "the viewer's place table or living rule moved");

function viewerNumbers(tree, atlas) {
  const out = {}, SHN = {};
  const ctx = vm.createContext({ SHN, OUT: out, TREE: tree, ATLAS: atlas, console });
  vm.runInContext([LOAD, "const {P,list}=loadTree(TREE);", PLLINE, LIVING, COMPS,
    "const $=sel=>({set innerHTML(v){OUT.html=v}});", METRICS, "renderMetrics();"].join("\n"), ctx);
  const tiles = [...out.html.matchAll(/<b>([^<]*)<\/b><span>([^<]*)<\/span><small>([^<]*)<\/small>/g)].map(m => [m[1], m[2], m[3]]);
  return { tiles, orph: SHN.orph, clus: SHN.clus };
}

/* ---- invented trees: groups of every size, dead ends, living people withheld, places in and out of the Atlas ---- */
function makeTree(spec) {
  const people = []; let n = 0;
  const places = ["Pula", "Trieste", "Cape Town", "Montevideo", "Nowhere Parish", null];
  const mk = (extra = {}) => { const id = "I" + (++n); const p = { id, bp: places[n % places.length] || "Pula", by: 1800 + n, hid: n % 11 === 0 ? 1 : 0, father: null, mother: null, spouse: [], kids: [], ...extra }; people.push(p); return p; };
  for (const size of spec) {
    if (size === 1) { mk(); continue; }
    const root = mk(), group = [root];   // a chain of couples and children, `size` people in all
    while (group.length < size) {
      const last = group[group.length - 1], sp = mk(), kid = mk({ father: last.id, mother: sp.id });
      last.spouse.push(sp.id); sp.spouse.push(last.id); last.kids.push(kid.id); sp.kids.push(kid.id); group.push(sp, kid);
    }
  }
  return { people, focus: people[0].id, lines: [] };
}
const ATLAS = { places: [{ n: "Pula", id: 101 }, { n: "Trieste", id: 102 }, { n: "Cape Town", id: 103 }, { n: "Montevideo" }, { n: "Nowhere Parish" }] };   // the viewer needs every place a person uses to be in its table; "no id" is a place the Atlas does not have

for (const spec of [[1], [1, 1, 1], [3, 5, 7], [25], [40, 2, 1, 19, 20, 3, 1], [60, 21, 19, 1, 1, 4, 2]]) {
  test("the file page's numbers equal the tree views' for groups " + JSON.stringify(spec), () => {
    const tree = makeTree(spec), V = viewerNumbers(tree, ATLAS), M = treeMetrics(tree, ATLAS);
    const mine = metricTiles(M).map(t => [t[0].toLocaleString("en"), t[1], t[2]]);
    assert.deepEqual(mine, V.tiles);
    assert.equal(M.orphans, V.orph); assert.equal(M.clusters, V.clus);
  });
}

test("a tree the archive says has people it could not draw gets the extra tile, in the viewer's place", () => {
  const tree = makeTree([30, 4, 1]); tree.undrawn = [{ id: "u1", name: "x", why: "year" }, { id: "u2", name: "y", why: "place" }];
  const V = viewerNumbers(tree, ATLAS), M = treeMetrics(tree, ATLAS);
  assert.equal(V.tiles.length, 6);
  assert.deepEqual(metricTiles(M).map(t => [t[0].toLocaleString("en"), t[1], t[2]]), V.tiles);
});

test("an empty tree, and a relative who is not in the file, do not throw", () => {
  const M0 = treeMetrics({ people: [] }, null); assert.equal(M0.total, 0); assert.equal(M0.places, 0);
  const t = { people: [{ id: "a", father: "ghost", mother: null, spouse: [], kids: [], bp: "Pula", hid: 0 }] };
  const M1 = treeMetrics(t, ATLAS); assert.equal(M1.orphans, 1);
  assert.equal(treeMetrics({ people: [{ id: "b", spouse: [], kids: [], bp: "Somewhere the Atlas slice lacks" }] }, ATLAS).placesInAtlas, 0);   // the viewer would stop here; the page just counts it as not in the Atlas
  assert.doesNotThrow(() => treeMetrics(null, null));
});

test("every figure is a count of the tree: nothing is invented, so the totals add up", () => {
  const tree = makeTree([60, 21, 19, 1, 1, 4, 2]), M = treeMetrics(tree, ATLAS);
  assert.equal(M.treePeople + M.clusterPeople + M.orphans, M.total);
  assert.ok(M.placesInAtlas <= M.places);
});

/* ---- the import report ---- */
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.className = ""; this._t = ""; this.style = {}; }
  set textContent(v) { this._t = String(v); this.children = []; } get textContent() { return this._t + this.children.map(c => (typeof c === "string" ? c : c.textContent)).join(""); }
  append(...a) { for (const x of a) this.children.push(x); }
  all(tag) { return this.children.flatMap(c => (typeof c === "string" ? [] : [...(c.tagName === tag.toUpperCase() ? [c] : []), ...c.all(tag)])); }
}
globalThis.document = { createElement: t => new Node(t) };
const { reportInto } = await import("../public/roots/js/report-view.js");

const GEDREPORT = {
  report: { file: { version: "5.5.1", eol: "LF", bom: false, used: "UTF-8", declared: "UTF-8", relinedLines: 0, invalidBytes: 0, lines: 1200, records: 90, conc: 4, cont: 2, junkLines: 0 },
    people: { individuals: 80, drawn: 70, living: 6, livingRedacted: 6, livingShown: 0, undatedNotDrawn: 3, noPlaceNotDrawn: 7, placeBorrowedFromRelative: 5, birthYearEstimated: 9, deathYearEstimated: 12 },
    places: { distinct: 20, mentions: 100, placeNameMentions: 90, realOfNamedPct: 0.8, realPct: 0.7, drawablePct: 0.9, byTier: { confident: 12, ambiguous: 3 }, mentionsByTier: { confident: 70, ambiguous: 10 }, countriesLoaded: 4 } },
  timings: { parse: 10, model: 20, atlasLoad: 30, resolve: 40, tree: 50, atlas: 60 },
};

test("a GEDCOM report keeps its four sections and the sentences about estimates, at the heading level asked for", () => {
  const box = new Node("div"); reportInto(GEDREPORT, box);
  assert.deepEqual(box.all("h2").map(h => h.textContent), ["The file", "The people", "The places", "How long it took"]);
  const under = new Node("div"); reportInto(GEDREPORT, under, { h: "h3" });
  assert.deepEqual(under.all("h3").map(h => h.textContent), ["The file", "The people", "The places", "How long it took"]);
  assert.equal(under.all("h2").length, 0);
  assert.match(box.textContent, /9 birth years and 12 death years are estimates, shown as “c\.” in the views/);
  assert.match(box.textContent, /6 are drawn without a name/);
});

test("a tree.json gets its own short account, not a half-empty GEDCOM one", () => {
  const box = new Node("div");
  reportInto({ kind: "tree", say: ["14 links without a person were dropped"], report: { people: { individuals: 11, drawn: 10, living: 0 }, file: {} }, timings: {} }, box, { h: "h3" });
  assert.deepEqual(box.all("h3").map(h => h.textContent), ["The file", "The people"]);
  const t = box.textContent;
  assert.match(t, /tree\.json \(our own format\)/);
  assert.match(t, /14 links without a person were dropped/);
  assert.doesNotMatch(t, /GEDCOM|line endings|How long it took/);
});
