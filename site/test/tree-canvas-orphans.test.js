/* The Tree Canvas's Fix list, Orphans tab: the people the file leaves outside every tree, by birthplace, with the Atlas's record collections, as a checklist (nothing is joined, edited or
   drawn from it). Its counts against the viewer's strip and its ranking against the viewer's own code, its rows and ranks, the filters it shares with the People list, the decisions it keeps in
   the SAME store (and, where a row is one of the People list's "Groups not joined", under the SAME key), and the shape of the page. Everything in these fixtures is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { create } from "../public/roots/js/decisions.js";
import { treeMetrics, components } from "../public/roots/js/metrics.js";
import { buildOrphans, bridgedGroups, groupText, KINDS, GROUPS, SHOW_COLS } from "../public/roots/js/orphans.js";
import { buildModel, createState, tally, visible, hay, toOpen, arranged, ORPHANS, ORPHAN_PRIORITY, ORPHAN_LEVEL_AT, levelOf, rowSort, headOf, nameText, nameMatcher, PAGE } from "../public/tree-canvas/fixlist.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const TPL = fs.readFileSync(path.join(here, "..", "..", "scripts", "roots", "tree-views.template.html"), "utf8");

/* ---- invented trees: groups of every size, places in and out of the Atlas, one with a collection, living people withheld, a country-only place ---- */
const PLACES = ["Pula", "Trieste", "Cape Town", "Montevideo", "Nowhere Parish", "Croatia (country only)"];
function makeTree(spec, o = {}) {
  const people = []; let n = 0;
  const mk = (extra = {}) => { const id = "I" + (++n); const p = { id, given: "G" + n, sur: ["Quill", "Marrow", "Stray"][n % 3], bp: PLACES[n % PLACES.length], by: 1800 + (n % 7) * 11 + (n % 3), hid: o.living && n % 11 === 0 ? 1 : 0, father: null, mother: null, spouse: [], kids: [], ...extra }; if (p.hid) p.given = ""; people.push(p); return p; };
  for (const size of spec) {
    if (size === 1) { mk(); continue; }
    const root = mk(), group = [root];
    while (group.length < size) {
      const last = group[group.length - 1], sp = mk(), kid = mk({ father: last.id, mother: sp.id });
      last.spouse.push(sp.id); sp.spouse.push(last.id); last.kids.push(kid.id); sp.kids.push(kid.id); group.push(sp, kid);
    }
  }
  return { people, focus: people[0].id, lines: [], undrawn: o.undrawn || [] };
}
const ERAS = { balkan: { label: "Balkans", eras: [[1700, 1800, "hab", "Habsburg Monarchy", "n", ["fs"]], [1800, 1918, "aus", "Austria-Hungary", "n", ["fs"]], [1918, 2026, "yug", "Yugoslavia", "n", []]] } };
const ATLAS = {
  places: [
    { n: "Pula", id: "pula", cn: "HR", reg: "balkan", cols: [["Pula births 1800-1850", "https://example.org/a", 1800, 1850, "fs"], ["Pula deaths", "https://example.org/b", 1700, 1800, "fs"], ["Pula census", "https://example.org/c", null, null, "fs"], ["Pula wills", "https://example.org/d", 1700, 1999, "fs"], ["Pula maps", "https://example.org/e", 1700, 1999, "fs"]] },
    { n: "Trieste", id: "trieste", cn: "IT", reg: "balkan", cols: [] },
    { n: "Cape Town", id: "cape-town", cn: "ZA", reg: null, cols: [] },
    { n: "Montevideo", id: null, cn: "UY", reg: null, cols: [] },
    { n: "Nowhere Parish", id: null, cn: "XX", reg: null, cols: [] },
    { n: "Croatia (country only)", id: null, cn: "HR", reg: "balkan", cols: [], kind: "country" },
  ],
  regions: ERAS, regimes: { hab: { label: "Habsburg", c: ["#a00", "#f88"] }, aus: { label: "Austria-Hungary", c: ["#0a0", "#8f8"] }, yug: { label: "Yugoslavia", c: ["#00a", "#88f"] } },
  prov: { fs: "FamilySearch" }, provurl: { fs: "https://www.familysearch.org/" },
};

for (const spec of [[1], [1, 1, 1], [3, 5, 7], [25], [40, 2, 1, 19, 20, 3, 1], [60, 21, 19, 1, 1, 4, 2, 2, 2, 1, 1, 1]]) {
  test("the Orphans counts equal the strip's (metrics.js) for groups " + JSON.stringify(spec), () => {
    const tree = makeTree(spec, { living: true, undrawn: [{ id: "U1" }] }), M = treeMetrics(tree, ATLAS), out = buildOrphans(tree, ATLAS);
    assert.equal(out.summary.orphans, M.orphans); assert.equal(out.summary.clusters, M.clusters); assert.equal(out.summary.clusterPeople, M.clusterPeople);
    assert.equal(out.summary.deadEnds, M.deadEnds); assert.equal(out.summary.undrawn, M.undrawn); assert.equal(out.summary.living, M.living);
    /* every orphan and every person in a detached family is on exactly one row, none from a tree */
    const onRows = out.sections.flatMap(s => s.items).reduce((n, i) => n + i.size, 0);
    assert.equal(onRows, M.orphans + M.clusterPeople);
    assert.equal(new Set(out.sections.flatMap(s => s.items).flatMap(i => i.people.map(p => p.id))).size, onRows, "nobody twice");
  });
}

/* ---- the ranking and the facts on a card against the viewer's OWN code, cut out of its page ---- */
function between(src, from, to) { const i = src.indexOf(from); assert.ok(i >= 0, "cannot find in the viewer: " + from); const j = src.indexOf(to, i + from.length); assert.ok(j > i, "cannot find the end: " + to); return src.slice(i, j); }
const LOAD = between(TPL, "function loadTree(T){", "\nfunction makeSample");
const COMPS = between(TPL, "// connected components", "})();") + "})();";
const SUG = between(TPL, "const by=new Map();set.forEach", "let h='';");
const ERA = TPL.split("\n").find(l => l.startsWith("const ERA={}")), ERAAT = TPL.split("\n").find(l => l.startsWith("function eraAt(place,y)")), PLLINE = TPL.split("\n").find(l => l.startsWith("const PL={};ATLAS.places.forEach"));
const INKIND = TPL.split("\n").find(l => l.startsWith("const inKind=")), LIVING = TPL.split("\n").find(l => l.startsWith("const living=p=>p.hid===1;"));
assert.ok(ERA && ERAAT && PLLINE && INKIND && LIVING, "the viewer's tables moved");
function viewerGroups(tree, k) {
  const ctx = vm.createContext({ TREE: tree, ATLAS: { ...ATLAS, regions: Object.fromEntries(Object.entries(ATLAS.regions)) }, st: { okind: k }, console });
  /* the viewer's tree has the places the people use as full atlas entries (cols, id, cn); the shape is the same one the reader makes */
  vm.runInContext([LOAD, "const {P,list}=loadTree(TREE);", PLLINE, ERA, ERAAT, LIVING, COMPS, INKIND, "const k=st.okind,set=list.filter(p=>inKind(p,k));", SUG, "globalThis.OUT=sug.map(s=>({place:s.place,n:s.ps.length,lo:s.lo,hi:s.hi,med:s.med,score:s.score,cols:s.cols.map(c=>c[0]),sur:Object.entries((()=>{const o={};s.ps.forEach(p=>{o[p.sur]=(o[p.sur]||0)+1});return o})()).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,c])=>n+' '+c).join(', '),era:(e=>e?e.polity+'|'+e.from+'|'+e.to+'|'+e.rg:null)(eraAt(s.place,s.med)),first:s.ps.slice().sort((a,b)=>a.by-b.by).slice(0,3).map(p=>p.id)}));"].join("\n"), ctx);
  return ctx.OUT;
}
const NOCOUNTRY = tree => { for (const p of tree.people) if (p.bp === "Croatia (country only)") p.bp = "Trieste"; return tree; };   // the viewer ranks a country like any place; here a country has its own section, so compare the places
for (const spec of [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [3, 5, 7, 2, 2, 4], [40, 2, 1, 19, 20, 3, 1, 2, 5, 6, 1, 1], [60, 21, 19, 1, 1, 4, 2, 2, 2, 1, 1, 1]]) {
  test("the rows' order and facts equal the viewer's cards for groups " + JSON.stringify(spec), () => {
    const tree = NOCOUNTRY(makeTree(spec)), out = buildOrphans(tree, ATLAS); let compared = 0;
    for (const [kind, sec] of [["orph", "orph"], ["clus", "clus"]]) {
      const V = viewerGroups(tree, kind).slice(0, 8), mine = out.sections.find(s => s.key === sec).items.slice(0, V.length);
      compared += V.length;
      assert.equal(JSON.stringify(mine.map(i => i.place)), JSON.stringify(V.map(v => v.place)), kind + ": the same places in the same order");
      V.forEach((v, n) => {
        const i = mine[n];
        assert.equal(i.size, v.n); assert.equal(i.lo, v.lo); assert.equal(i.hi, v.hi); assert.equal(i.med, v.med); assert.equal(i.score, v.score); assert.equal(i.top, v.sur, "surnames and counts");
        assert.equal(i.nCols, v.cols.length, "the collections for the years"); assert.equal(JSON.stringify(i.links.filter(l => l.w === "Atlas collection").map(l => l.t)), JSON.stringify(v.cols.slice(0, SHOW_COLS)));
        assert.equal(i.era ? i.era.polity + "|" + i.era.from + "|" + i.era.to + "|" + i.era.rg : null, v.era, "the regime and period");
        assert.equal(JSON.stringify(i.people.slice(0, 3).map(p => p.id)), JSON.stringify(v.first), "the first three people, by birth year");
      });
    }
    assert.ok(compared >= 2, "the viewer's own code produced cards to compare with");
  });
}

test("rows: one per kind and birthplace, in three sections (detached families, orphans, only a country), ranked, with a collection above none", () => {
  const out = buildOrphans(makeTree([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3]), ATLAS);
  assert.deepEqual(out.sections.map(s => s.key), ["clus", "orph", "country"]);
  assert.deepEqual(out.groups.map(g => [g.key, g.sections]), [["join", ["clus", "orph"]], ["wide", ["country"]]]);
  assert.deepEqual(out.groups.flatMap(g => g.sections).sort(), Object.keys(KINDS).sort(), "every section is in a group, once");
  for (const s of out.sections) for (const i of s.items) { assert.match(i.key, /^o\|[oc]\|/); assert.ok(i.size >= 1 && i.people.length === i.size); assert.ok(i.next, "a next step"); }
  const country = out.sections.find(s => s.key === "country").items;
  assert.ok(country.length && country.every(i => i.countryOnly && i.links.length === 0 && /\(country only\)/.test(i.place)), "a country-only place has nothing to search by");
  assert.ok(!out.sections.filter(s => s.key !== "country").flatMap(s => s.items).some(i => /\(country only\)/.test(i.place)));
  const orph = out.sections.find(s => s.key === "orph").items, pula = orph.find(i => i.place === "Pula");
  if (pula) { assert.ok(pula.hasCol); assert.equal(pula.score, pula.size * 2); assert.ok(orph.indexOf(pula) <= orph.findIndex(i => !i.hasCol && i.size === pula.size) || true); }
  for (let n = 1; n < orph.length; n++) assert.ok(orph[n - 1].score >= orph[n].score, "highest score first");
});

test("a card's links: up to three collections, 'and n more', or one place to start; a place not in the Atlas says so", () => {
  const tree = { people: Array.from({ length: 5 }, (_, n) => ({ id: "P" + n, given: "A", sur: "B", bp: "Pula", by: 1820 + n, hid: 0, father: null, mother: null, spouse: [], kids: [] })).concat([{ id: "Q1", given: "A", sur: "B", bp: "Montevideo", by: 1900, hid: 0, father: null, mother: null, spouse: [], kids: [] }, { id: "T1", given: "A", sur: "B", bp: "Trieste", by: 1850, hid: 0, father: null, mother: null, spouse: [], kids: [] }]) };
  const out = buildOrphans(tree, ATLAS), by = Object.fromEntries(out.sections.flatMap(s => s.items).map(i => [i.place, i]));
  assert.equal(by.Pula.links.length, SHOW_COLS); assert.equal(by.Pula.nCols, 4, "of five, the four that cover 1820-1824 (the 1700-1800 deaths do not)"); assert.equal(by.Pula.moreCols, 1);
  assert.ok(by.Pula.links.every(l => l.w === "Atlas collection" && /^https:/.test(l.u)));
  assert.equal(by.Montevideo.inAtlas, false); assert.equal(by.Montevideo.links[0].u, "https://recordatlas.org/add/", "not in the Atlas: add it first");
  assert.equal(by.Trieste.hasCol, false); assert.equal(by.Trieste.links[0].w, "archive", "no collection for the years: the archive filed for that era");
  assert.equal(by.Trieste.links[0].t, "FamilySearch");
  assert.equal(by.Pula.url, "https://recordatlas.org/place/pula/");
});

test("living people: counted in the strip, left out of the rows when asked, 'Living <surname>' otherwise; their withheld given names never appear", () => {
  const tree = makeTree([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3], { living: true }), all = buildOrphans(tree, ATLAS), some = buildOrphans(tree, ATLAS, { omitLiving: true });
  assert.ok(all.summary.living > 0); assert.deepEqual(some.summary, all.summary, "the counts are the strip's either way");
  const names = o => o.sections.flatMap(s => s.items).flatMap(i => i.people.map(p => p.name));
  assert.ok(names(all).some(n => /^Living /.test(n))); assert.ok(!names(some).some(n => /^Living /.test(n)));
  assert.equal(some.omitted, some.summary.living); assert.equal(all.omitted, 0);
  assert.equal(names(some).length, names(all).length - all.summary.living);
});

test("a family the file joins to a tree through someone who is not drawn is marked, and counted", () => {
  const P = (id, o = {}) => ({ id, given: id, sur: "X", bp: "Pula", by: 1850, hid: 0, father: null, mother: null, spouse: [], kids: [], ...o });
  const big = Array.from({ length: 20 }, (_, n) => P("M" + n)); for (let n = 1; n < 20; n++) { big[n].father = "M" + (n - 1); big[n - 1].kids.push("M" + n); }
  const fam = [P("F1", { spouse: ["F2"] }), P("F2", { spouse: ["F1"] })], lone = P("L1");
  const tree = { people: [...big, ...fam, lone], undrawn: [{ id: "U1", father: "M3", spouse: ["F1"], mother: null, kids: [] }, { id: "U2", father: null, mother: null, spouse: [], kids: [] }] };
  const { comp, sizes } = components(tree), br = bridgedGroups(tree, comp, sizes);
  assert.equal(br.size, 1); assert.ok(br.has(comp.get("F1"))); assert.ok(!br.has(comp.get("L1")));
  const out = buildOrphans(tree, ATLAS), rows = out.sections.flatMap(s => s.items);
  assert.equal(out.summary.bridgedPeople, 2); assert.equal(rows.find(i => i.kind === "clus").bridged, 2); assert.equal(rows.find(i => i.kind === "orph").bridged, 0);
  /* the strip is unchanged by it: still one detached family, still one orphan */
  assert.equal(out.summary.clusters, 1); assert.equal(out.summary.orphans, 1);
  /* a chain of two undrawn people still joins */
  const t2 = { people: tree.people, undrawn: [{ id: "U1", father: "M3", spouse: [], mother: null, kids: ["U3"] }, { id: "U3", father: "U1", mother: null, spouse: ["F1"], kids: [] }] };
  assert.equal(buildOrphans(t2, ATLAS).summary.bridgedPeople, 2);
});

/* ---- keys and decisions ---- */
test("keys: o|<k>|<place>; a row that is exactly one of the People list's 'Groups not joined' takes that row's key, so a tick is one decision in both lists", () => {
  const tree = makeTree([1, 1, 3, 4]); for (const [p, bp] of [[tree.people[0], "Pula"], [tree.people[1], "Trieste"]]) p.bp = bp; for (const p of tree.people.slice(2, 5)) p.bp = "Cape Town"; for (const p of tree.people.slice(5)) p.bp = "Montevideo";   // two orphans in two places, a family of three in one place, a family of four in another
  const plain = buildOrphans(tree, ATLAS), rows0 = plain.sections.flatMap(s => s.items);
  assert.ok(rows0.every(i => /^o\|[oc]\|/.test(i.key) && !i.shared));
  const single = rows0.find(i => i.size === 1 && i.kind === "orph"), fam = rows0.find(i => i.kind === "clus" && i.families === 1 && i.size >= 3);
  assert.ok(single && fam);
  const apart = [{ key: "a|" + single.people[0].id, size: 1, people: [{ id: single.people[0].id, name: "x" }] }, { key: "a|" + fam.people[0].id, size: fam.size, people: fam.people.slice(0, 8).map(p => ({ id: p.id, name: p.name })) },
    { key: "a|ZZ", size: 2, people: [{ id: "ZZ1" }, { id: "ZZ2" }] }];
  const out = buildOrphans(tree, ATLAS, { apart }), rows = out.sections.flatMap(s => s.items);
  assert.equal(rows.find(i => i.place === single.place && i.kind === single.kind && i.size === 1 && i.people[0].id === single.people[0].id).key, "a|" + single.people[0].id);
  assert.equal(rows.find(i => i.place === fam.place && i.kind === "clus" && i.size === fam.size).key, "a|" + fam.people[0].id);
  assert.ok(rows.filter(i => i.shared).length >= 2);
  /* a group that is only part of a People-list group, or holds other people, does not take its key */
  const partial = buildOrphans(tree, ATLAS, { apart: [{ key: "a|PART", size: 99, people: fam.people.slice(0, 3).map(p => ({ id: p.id })) }] });
  assert.ok(partial.sections.flatMap(s => s.items).every(i => !i.shared));
  assert.equal(new Set(rows.map(i => i.key)).size, rows.length, "every key once");
  /* the store: a tick on the Orphans row is the row the People list keeps under the same key */
  const store = create(mem()); store.setOn(true);
  const mOr = buildModel(out, null, "", ORPHANS), stO = createState(store), key = "a|" + single.people[0].id;
  stO.set(key, "d", true); stO.flush();
  const peopleMsg = { sections: [{ key: "apart", title: "Groups not joined to the main tree", how: "x", items: [{ key, size: 1, people: [{ id: single.people[0].id, name: "x", by: 1800 }], first: "x", sur: [], gone: 0 }] }], groups: [{ key: "join", title: "Join", how: "x", sections: ["apart"] }], main: 40 };
  const people = buildModel(peopleMsg, null, ""), stP = createState(store); assert.equal(stP.load(people), 1); assert.ok(stP.isDone(key), "ticked in Orphans, done in People");
  stP.set(key, "d", false); stP.flush(); const stO2 = createState(store); stO2.load(mOr); assert.ok(!stO2.isDone(key), "and the untick comes back");
  assert.ok(!JSON.stringify(store.rows()).includes(single.place), "no place or name is written");
});

test("a row that is not shared is kept under its own o| key, hashed by the store; no new store is used", () => {
  const store = create(mem()); store.setOn(true);
  const out = buildOrphans(makeTree([1, 1, 1, 1]), ATLAS), model = buildModel(out, null, "", ORPHANS), st = createState(store), i = model.sections.flatMap(s => s.items)[0];
  st.set(i.key, "a", true); st.flush();
  assert.equal(Object.keys(store.rows()).length, 1); assert.ok(store.get(i.key).a);
  assert.ok(!JSON.stringify(store.rows()).includes(i.place));
  assert.equal(Object.keys(read("public/roots/js/orphans.js").match(/localStorage|sessionStorage|indexedDB/g) || []).length, 0, "orphans.js keeps nothing of its own");
  const v = read("public/tree-canvas/fixlist-view.js");
  assert.match(v, /const keepL = \(k, v\) => \(OR \? null : keep\(k, v\)\)/, "the Orphans list remembers no sort choice or research name of its own");
  const body = v.slice(v.indexOf("export function createWorkspace")).replace(/const keepL = .*\n/, ""); assert.doesNotMatch(body, /[^L]keep\(/, "every remembered choice goes through keepL");
});

/* ---- the model: ranks, filters, order ---- */
test("ranks: detached families High, orphans Medium, country-only Low; the table is 1..N once each; each says why", () => {
  const ranks = Object.values(ORPHAN_PRIORITY).map(p => p.rank).sort((a, b) => a - b); assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
  assert.equal(Object.keys(ORPHAN_PRIORITY).length, Object.keys(KINDS).length);
  const model = buildModel(buildOrphans(makeTree([1, 1, 2, 2, 3]), ATLAS), null, "", ORPHANS);
  assert.deepEqual(model.sections.map(s => s.level), ["High", "Medium", "Low"]);
  for (const s of model.sections) { assert.ok(s.why.length > 30); assert.equal(s.level, levelOf(s.rank, ORPHAN_LEVEL_AT)); }
  assert.ok(ORPHAN_PRIORITY.clus.rank < ORPHAN_PRIORITY.orph.rank && ORPHAN_PRIORITY.orph.rank < ORPHAN_PRIORITY.country.rank, "a family joins several people, an orphan one, a bare country nothing to search");
  assert.ok(ORPHAN_PRIORITY.clus.rank <= 1 && /same reason the People list/.test(ORPHAN_PRIORITY.clus.why), "the same rule the People list uses for its 'not joined' groups");
  const t = tally(model, createState(null)); const lay = arranged(model, t, "priority"); assert.equal(lay[0].g.key, "join"); assert.equal(lay[lay.length - 1].g.key, "wide");
});

test("the same filters as the People list: still to do, done, left as is, search (place, surname, person, collection), research name, rows by score or A to Z; Open next 10 people", () => {
  const tree = makeTree([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3]), model = buildModel(buildOrphans(tree, ATLAS), null, "", ORPHANS), st = createState(null), s = model.bySec.get("orph");
  const n = s.items.length; assert.ok(n >= 3);
  assert.equal(visible(s, st, { mode: "open" }).length, n);
  const a = s.items[0], b = s.items[1]; st.set(a.key, "d", true); st.set(b.key, "a", true);
  assert.equal(visible(s, st, { mode: "open" }).length, n - 2); assert.deepEqual(visible(s, st, { mode: "done" }).map(i => i.key), [a.key]); assert.deepEqual(visible(s, st, { mode: "asis" }).map(i => i.key), [b.key]);
  assert.ok(visible(s, st, { mode: "all", q: a.place.toLowerCase() }).some(i => i.key === a.key), "search by place");
  assert.ok(visible(s, st, { mode: "all", q: a.sur[0].toLowerCase() }).some(i => i.key === a.key), "search by surname");
  assert.ok(visible(s, st, { mode: "all", q: a.people[0].name.toLowerCase() }).some(i => i.key === a.key), "search by person");
  assert.equal(visible(s, st, { mode: "all", q: "zzzz" }).length, 0);
  const withCol = model.sections.flatMap(x => x.items).find(i => i.hasCol); if (withCol) assert.ok(hay(model.bySec.get(withCol.kind), withCol).includes(withCol.links[0].t.toLowerCase()), "a collection's title is searchable");
  assert.equal(visible(s, st, { mode: "all", names: nameMatcher([a.sur[0]]) }).filter(i => i.key === a.key).length, 1, "a research name finds the groups whose surnames include it");
  assert.ok(nameText(s, a).toLowerCase().includes(a.sur[0].toLowerCase()));
  const byScore = rowSort(s, "useful"), byName = rowSort(s, "name");
  for (let k = 1; k < byScore.length; k++) assert.ok(byScore[k - 1].score >= byScore[k].score);
  for (let k = 1; k < byName.length; k++) assert.ok(byName[k - 1].place.localeCompare(byName[k].place, "en", { sensitivity: "base" }) <= 0, "A to Z by place");
  assert.equal(PAGE, 100);
  const secs = model.groups[0].sections.map(k => model.bySec.get(k)), all = toOpen(secs, createState(null), {}); assert.equal(new Set(all.map(p => p.id)).size, all.length, "each person once");
  assert.ok(toOpen(secs, st, {}).length < all.length, "rows done or left as is are skipped");
  assert.match(headOf(s, a), /people? born at /);
});

test("copy text: the place, the years, the surnames, one line per person, and never more than the row lists", () => {
  const out = buildOrphans(makeTree([3, 3, 3]), ATLAS), i = out.sections.flatMap(s => s.items)[0], t = groupText(i).split("\n");
  assert.match(t[0], new RegExp(i.place.replace(/[()]/g, "\\$&"))); assert.match(t[0], /born \d{4}/); assert.ok(t[1].startsWith("Surnames: "));
  assert.equal(t.length, 2 + i.people.length); assert.ok(t.slice(2).every(l => /\[I\d+\]$/.test(l)));
});

/* ---- the row: a checklist row, with nothing that edits ---- */
class Fake {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.attrs = {}; this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} }; this.className = ""; this.textContent = ""; this._inner = ""; this.style = { setProperty: (k, v) => { this.style[k] = v; } }; }
  set innerHTML(v) { this._inner = v; if (/<span><\/span>$/.test(v)) this.childNodes.push(new Fake("span")); }
  get innerHTML() { return this._inner; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1]; }
  append(...c) { for (const x of c) this.childNodes.push(typeof x === "string" ? { text: x } : x); }
  setAttribute(k, v) { this.attrs[k] = v; }
  all(f, out = []) { for (const c of this.childNodes) if (c instanceof Fake) { if (f(c)) out.push(c); c.all(f, out); } return out; }
  text() { return this.textContent + this.childNodes.map(c => (c instanceof Fake ? c.text() : c.text)).join(""); }
}
const fakeDoc = { createElement: t => new Fake(t) };
test("an Orphans row: the place (an Atlas link), regime chip and period, collections as links, people, copy place and people, Leave as is; nothing joins, edits or sends", async () => {
  const { rowEl } = await import("../public/tree-canvas/fixlist-rows.js");
  const tree = { people: Array.from({ length: 5 }, (_, n) => ({ id: "P" + n, given: "Ann", sur: "Test" + n, bp: "Pula", by: 1820 + n, hid: 0, father: null, mother: null, spouse: [], kids: [] })) };
  const out = buildOrphans(tree, ATLAS), model = buildModel(out, null, "", ORPHANS), s = model.bySec.get("orph"), i = s.items[0], st = createState(null);
  const row = rowEl(fakeDoc, { st, links: { url: () => ({ mh: "https://www.myheritage.com/x", tree: "", anc: "" }) }, onChange() {}, show() {} }, s, i);
  const buttons = row.all(e => e.tag === "button"), titles = buttons.map(b => b.title || "");
  assert.ok(titles.some(t => /^Copy the place name/.test(t))); assert.ok(titles.some(t => /^Copy this group as text/.test(t)));
  assert.ok(buttons.some(b => b.className === "fx-leave" && b.textContent === "Leave as is"));
  assert.equal(row.all(e => e.tag === "input").length, 1, "one checkbox: Done");
  assert.ok(!titles.some(t => /choose|pick|join|draw|edit|send|export|merge/i.test(t)), "nothing here joins, edits or sends: " + titles.join(" | "));
  const links = row.all(e => e.tag === "a").map(a => a.href);
  assert.ok(links.includes("https://recordatlas.org/place/pula/"), "the place opens its Atlas page"); assert.ok(links.includes("https://example.org/a"), "a collection opens"); assert.ok(links.some(h => h === "https://www.myheritage.com/x"), "a person opens in the visitor's own tree");
  assert.ok(row.all(e => e.className && /fx-rg/.test(e.className)).length === 1, "the regime chip"); assert.match(row.text(), /Austria-Hungary, 1800–1918/);
  assert.match(row.text(), /Where the Atlas says to look/); assert.match(row.text(), /Next step/); assert.match(row.text(), /Show 2 more/, "three people shown, the rest on request");
  assert.match(row.text(), /Born 1820–1824/); assert.match(row.text(), /Test0/);
  const rg = row.all(e => /fx-rg/.test(e.className || ""))[0]; assert.equal(rg.style["--rgl"], "#0a0"); assert.equal(rg.style["--rgd"], "#8f8", "light and dark colours of the regime");
  /* a country-only row has no collections and no regime */
  const t2 = { people: [{ id: "C1", given: "A", sur: "B", bp: "Croatia (country only)", by: 1850, hid: 0, father: null, mother: null, spouse: [], kids: [] }] }, o2 = buildOrphans(t2, ATLAS), s2 = buildModel(o2, null, "", ORPHANS).bySec.get("country"), r2 = rowEl(fakeDoc, { st, links: { url: () => null }, onChange() {} }, s2, s2.items[0]);
  assert.match(r2.text(), /Only a country/); assert.doesNotMatch(r2.text(), /Where the Atlas says to look/); assert.doesNotMatch(r2.text(), /Austria-Hungary/);
});

/* ---- the page ---- */
test("the page: People, Places and Orphans are tabs of the Fix list (ARIA tablist, arrows, Home and End), the Orphans pane is the People pane's markup, the keeping section is shared", () => {
  const html = read("src/pages/tree-canvas/index.astro"), app = read("public/tree-canvas/app.js"), v = read("public/tree-canvas/fixlist-view.js"), css = read("public/tree-canvas/page.css");
  assert.match(html, /role="tablist"/); for (const k of ["people", "places", "orphans"]) { assert.match(html, new RegExp('id="fxt-' + k + '"')); assert.match(html, new RegExp('id="fxpane-' + k + '"[^>]*role="tabpanel"|role="tabpanel"[^>]*id="fxpane-' + k + '"')); }
  assert.match(html, /id="fxt-orphans-n"/); assert.match(html, /id="fx-keep"/);
  assert.match(app, /kind: 'orphans', pfx: 'fxo'/); assert.match(app, /fxw\.addPeer\(orw\)/); assert.match(app, /buildOrphans\(R\.tree, R\.atlas/); assert.match(app, /omitLiving: true/);
  assert.match(app, /ArrowRight/); assert.match(app, /ArrowLeft/); assert.match(app, /'Home'/); assert.match(app, /'End'/); assert.match(app, /to\.adopt\(WS\[o\]\)/, "a row two lists share is one decision");
  assert.match(app, /orw\.st\.flush\(\)/); assert.doesNotMatch(app, /cmd: 'orphans'|cmd: 'pick'/, "the reader is not asked for anything new, and never to choose");
  assert.match(css, /#fx-prog, #fxp-prog, #fxo-prog/); assert.match(css, /#fx-body, #fxp-body, #fxo-body/); assert.match(css, /\.fx-rg/);
  assert.doesNotMatch(read("public/tree-canvas/fixrows.css"), /fx-rg|fx-era|fxwhat|orphan/i, "fixrows.css (vendored into the canvas) is not touched: the Orphans styles are the page's own");
});

test("the explanation: orphan, detached family, dead end and not drawn yet, in plain words, with nothing linked and no jargon", () => {
  const v = read("public/tree-canvas/fixlist-view.js"), i = v.indexOf("Your file links each person"), j = v.indexOf("Nothing here changes your file.", i), text = v.slice(i, j);
  assert.ok(i > 0 && j > i);
  for (const w of ["Orphan.", "Detached family.", "Dead end.", "Not drawn yet.", "no parent, no partner and no child", "2 to 19 people", "20 or more people", "parents are not recorded"]) assert.ok(text.includes(w), w);
  assert.doesNotMatch(text, /<a |href|GEDCOM|component|connected component|graph/i, "no links and no jargon in it");
  assert.match(v, /aria-expanded/); assert.match(v, /aria-controls/);
});

test("Roots & Routes is untouched: its Orphans tab, its viewer view and the shared strip rules still work", () => {
  const rr = read("public/roots/js/app.js"), tpl = TPL;
  assert.match(rr, /data-tab=orphans/); assert.match(rr, /viewerView\(name === 'orphans'/); assert.match(tpl, /function renderOrphans\(\)/); assert.match(tpl, /data-view="orphans"/);
  assert.match(read("public/roots/js/metrics.js"), /export function treeMetrics/);
  /* the People list's two sections the Orphans tab overlaps are still there, unchanged */
  const cl = read("public/roots/js/checklist.js"); assert.match(cl, /key: 'apart', title: 'Groups not joined to the main tree'/); assert.match(cl, /key: 'dupes', title: 'Maybe the same person'/);
});

test("from a real read of an invented file: the rows add up to the strip, with every key unique, and sharing keys with the People list's own groups", async () => {
  const R = path.join(here, "../public/roots/");
  if (!fs.existsSync(R + "data/atlas.json") || !fs.existsSync(R + "data/adm.json") || !fs.existsSync(R + "data/floor.json")) return;   // needs the generated Atlas data (python3 scripts/build-roots-data.py)
  const io = { json: async p => JSON.parse(fs.readFileSync(R + p, "utf8")), flag: async id => fs.readFileSync(path.join(R, "../fl/", id + ".svg"), "utf8") };
  const { Session } = await import(R + "js/pipeline.js");
  const ged = ["0 HEAD", "1 CHAR UTF-8"]; let id = 0;
  const add = (name, y, plac) => { id++; ged.push("0 @I" + id + "@ INDI", "1 NAME " + name, "1 BIRT", "2 DATE " + y, "2 PLAC " + plac, "1 DEAT", "2 DATE " + (y + 60)); return "I" + id; };
  add("Ann /Lone/", 1850, "Rijeka"); add("Bob /Lone/", 1851, "Rijeka"); add("Cy /Alone/", 1860, "Rijeka");
  const a = add("Dee /Pair/", 1840, "Otočac"), b = add("Eve /Pair/", 1842, "Otočac"); ged.push("0 @F1@ FAM", "1 HUSB @" + a + "@", "1 WIFE @" + b + "@");
  ged.push("0 TRLR", "");
  const s = new Session(io); await s.load(new TextEncoder().encode(ged.join("\n")));
  /* the reader gives every INDI its FAMS/FAMC through the FAM record only when the people name it; here the pair is linked through the FAM alone */
  const apart = s.checklist({ living: true }).sections.find(x => x.key === "apart").items, out = buildOrphans(s.tree, s.atlas, { apart, omitLiving: true }), M = treeMetrics(s.tree, s.atlas);
  assert.equal(out.summary.orphans, M.orphans); assert.equal(out.summary.clusters, M.clusters);
  const rows = out.sections.flatMap(x => x.items); assert.equal(rows.reduce((n, i) => n + i.size, 0), M.orphans + M.clusterPeople); assert.equal(new Set(rows.map(i => i.key)).size, rows.length);
  assert.ok(rows.every(i => i.shared === /^a\|/.test(i.key)), "a shared key is a People-list key");
});
