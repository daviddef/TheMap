/* The Tree Canvas's Fix list: the model (the reader's rows plus the Compare groups), the decisions kept under the existing store, last-write-wins across devices, the cap on
   what the six-word copy carries, and the shape of the page. Everything in these fixtures is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create, hashKey, mergeRows, wOf, fileTextOf, rowsFrom, parseRows } from "../public/roots/js/decisions.js";
import { issuesByPerson, GROUPS } from "../public/roots/js/checklist.js";
import { buildModel, rrView, createState, tally, visible, personIndex, peopleOf, toOpen, copyActions, cmpKey, cmpSections, hay, MAX_CMP, PAGE, BATCH, PRIORITY, levelOf, arranged, rowSort } from "../public/tree-canvas/fixlist.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const mod = { exports: {} };
new Function("module", read("public/js/research-file.js"))(mod);
const RF = mod.exports;
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };

/* a reader message like the worker's `checklist`: sections in group order, each row with its own key */
function fixture(n = 40) {
  const places = [], years = [], dates = [], dupes = [], names = [];
  for (let i = 0; i < n; i++) {
    places.push({ key: "p|Place " + i + ", Land", raw: "Place " + i + ", Land", to: "Plaace " + i + ", Land", count: 2, people: [{ id: "I" + i, name: "Ann Test" + i, ev: "Birth", date: "1800" }, { id: "I" + (i + 1), name: "Bo Test" + i, ev: "Death", date: "1850" }], next: "Paste it in." });
    years.push({ key: "y|I" + i, id: "I" + i, name: "Ann Test" + i, kind: "none", place: "", note: "No birth year" });
    dates.push({ key: "x|I" + i + "|Died before born", id: "I" + i, name: "Ann Test" + i, note: "Died (1700) before being born (1800)", born: 1800, died: 1700, with: "" });
    names.push({ key: "n|I" + i, id: "I" + i, name: "", kind: "none", note: "No name recorded", kin: "father Cy Test", born: 1801, place: "" });
  }
  dupes.push({ key: "m|I1|I2", a: "I1", b: "I2", an: "Ann Test1", bn: "Ann Test2", ay: 1800, by: 1801, ap: "", bp: "", strong: true, note: "Same name" });
  const sections = [
    { key: "places", title: "Fix these places", how: "x", items: places }, { key: "check", title: "Check these places", how: "x", items: [] }, { key: "decide", title: "Places to decide", how: "x", items: [] },
    { key: "years", title: "People without a birth year", how: "x", items: years }, { key: "names", title: "People without a full name", how: "x", items: names }, { key: "dates", title: "Dates that do not add up", how: "x", items: dates },
    { key: "dupes", title: "Maybe the same person", how: "x", items: dupes }, { key: "apart", title: "Groups not joined to the main tree", how: "x", items: [] },
  ];
  const groups = GROUPS.map(g => ({ key: g.key, title: g.title, how: g.how, sections: g.sections.filter(k => sections.some(s => s.key === k)) }));
  return { sections, groups, main: 100, counts: Object.fromEntries(sections.map(s => [s.key, s.items.length])) };
}

test("the model keeps the reader's sections, groups and counts exactly", () => {
  const m = fixture(), model = buildModel(m, null, "t");
  assert.deepEqual(model.sections.map(s => s.key), m.sections.map(s => s.key));
  assert.deepEqual(model.groups.map(g => g.key), GROUPS.map(g => g.key));
  const t = tally(model, createState(null));
  for (const s of m.sections) assert.equal(t.sec[s.key].total, m.counts[s.key], s.key);
  assert.equal(t.total, Object.values(m.counts).reduce((a, b) => a + b, 0));
  assert.equal(t.open, t.total, "nothing is done yet");
  assert.deepEqual(rrView(model).counts, m.counts, "the Roots & Routes functions see exactly its own sections");
  assert.equal(model.hasCmp, false);
  assert.equal(model.byKey.size, t.total, "every row has a key of its own");
});

test("a section a group does not name is kept under Other, and no reader message still gives an empty list", () => {
  const m = fixture(3); m.sections.push({ key: "newkind", title: "New", how: "", items: [{ key: "z|1", id: "I1", name: "X" }] });
  assert.equal(buildModel(m, null, "t").groups.at(-1).key, "other");
  assert.equal(buildModel(null, null, "").total, 0);
});

/* ---- the Compare groups ---- */
const CMP = {
  missing: [{ ak: "booyzen:P1", name: "Anna Example", yrs: "1790–1850", place: "Senj", archive: "Booyzen", url: "https://booyzen.defranceski.com/people/anna/", rel: "father", relName: "Ann Test1", relId: "I1", text: "Name: Anna Example" },
    { ak: "", name: "no key: dropped" }, null, "junk"],
  differs: [{ fid: "I1", fkey: "you:I1", fname: "Ann Test1", ak: "booyzen:P2", aname: "Ann Test1", archive: "Booyzen", url: "javascript:alert(1)", reason: "died 1859 against 1854" }, { fid: "", ak: "x", reason: "no file person: dropped" }],
};
test("Compare rows are cleaned, keyed, and put in a group of their own", () => {
  const model = buildModel(fixture(3), CMP, "tree-key");
  assert.equal(model.hasCmp, true); assert.equal(model.groups.at(-1).key, "compare");
  const [miss, diff] = [model.bySec.get("cmpmiss"), model.bySec.get("cmpdiff")];
  assert.equal(miss.items.length, 1); assert.equal(diff.items.length, 1);
  assert.equal(diff.items[0].url, "", "an address that is not https is dropped");
  assert.match(miss.items[0].key, /^cmp\|m\|[0-9a-z]+$/); assert.match(diff.items[0].key, /^cmp\|d\|[0-9a-z]+$/);
  assert.deepEqual(rrView(model).sections.map(s => s.key).filter(k => k.startsWith("cmp")), [], "the Roots & Routes exports never carry them");
  assert.deepEqual(peopleOf(diff, diff.items[0]), [{ id: "I1", name: "Ann Test1" }]);
  assert.equal(peopleOf(miss, miss.items[0])[0].via, true, "the file person a missing person hangs from is marked as the relation, not a row's own person");
});
test("a Compare key names no one and nothing, and is stable for the same tree and different for another", () => {
  const a = cmpKey("f:my-file.ged|1000|50", "m", "booyzen:P1"), b = cmpKey("f:my-file.ged|1000|50", "m", "booyzen:P1"), c = cmpKey("f:other.ged|1000|50", "m", "booyzen:P1");
  assert.equal(a, b); assert.notEqual(a, c);
  assert.doesNotMatch(a, /booyzen|P1|my-file/);
  const s = mem(), d = create(s); d.setOn(true); d.put(a, "d", true);
  assert.doesNotMatch(s.getItem("ra-fix-decisions-v1"), /booyzen|my-file|Anna|Ann Test|1859/, "the store holds a hash of a hash");
  assert.notEqual(cmpKey("t", "d", "I1", "a:1", "died 1859 against 1854"), cmpKey("t", "d", "I1", "a:1", "born 1700 against 1701"), "a different disagreement is a different row");
});
test("Compare rows are capped", () => {
  const many = { missing: Array.from({ length: MAX_CMP + 50 }, (_, i) => ({ ak: "a:" + i, name: "N" + i })), differs: [] };
  assert.equal(cmpSections(many, "t")[0].items.length, MAX_CMP);
});

/* ---- decisions: the same store, the same keys as Roots & Routes ---- */
test("a tick is kept under the Roots & Routes row's own key, so the two pages agree", () => {
  const s = mem(), store = create(s); store.setOn(true);
  const model = buildModel(fixture(5), null, "t"), key = model.sections[0].items[2].key;
  store.put(key, "d", true);                       // what /roots/ does when its checkbox is ticked
  const st = createState(store); st.load(model);
  assert.equal(st.isDone(key), true); assert.equal(st.ticked.size, 1);
  const k2 = model.sections[3].items[1].key; st.set(k2, "a", true); st.flush();   // what the canvas does
  assert.equal(create(s).get(k2).a, 1, "and /roots/ finds it");
});
test("decisions round trip: tick, leave as is, take back, reload", () => {
  const s = mem(), store = create(s); store.setOn(true);
  const model = buildModel(fixture(5), null, "t"), st = createState(store), items = model.sections[0].items;
  st.set(items[0].key, "d", true); st.set(items[1].key, "a", true); st.setMany([items[2].key, items[3].key], "d", true); st.flush();
  st.set(items[2].key, "d", false); st.flush();
  const again = createState(create(s)); assert.equal(again.load(model), 3);
  assert.deepEqual([...again.ticked].sort(), [items[0].key, items[3].key].sort()); assert.deepEqual([...again.asIs], [items[1].key]);
  assert.equal(again.isOpen(items[2].key), true, "a taken-back tick is open again");
  const t = tally(model, again); assert.equal(t.done, 2); assert.equal(t.asis, 1); assert.equal(t.handled, 3); assert.equal(t.open, t.total - 3);
});
test("while keeping is off nothing is written, and the page says so by returning false", () => {
  const s = mem(), store = create(s), st = createState(store), model = buildModel(fixture(2), null, "t");
  st.set(model.sections[0].items[0].key, "d", true); assert.equal(st.flush(), false); assert.equal(s._m.size, 0);
  assert.equal(st.isDone(model.sections[0].items[0].key), true, "it still counts on this page");
});
test("a decisions file from before this change still applies, and rows from a file apply without being kept", () => {
  const model = buildModel(fixture(3), null, "t"), key = model.sections[0].items[0].key;
  const old = { [hashKey(key)]: { d: 1, t: "2026-11-01" } };          // no `w`: made by Roots & Routes before
  const st = createState(create(mem())); assert.equal(st.load(model, old), 1); assert.equal(st.isDone(key), true);
  assert.deepEqual(parseRows(fileTextOf(rowsFrom(new Set(), new Set([key])))), rowsFrom(new Set(), new Set([key])));
});
test("a store from before Compare was added reads: rows without `w`, and an extra tombstone, are fine to old code", () => {
  const s = mem(), a = create(s); a.setOn(true); a.put("k", "d", true, "2026-11-01"); assert.deepEqual(a.get("k"), { d: 1, t: "2026-11-01" });
  const rows = JSON.parse(s.getItem("ra-fix-decisions-v1")).rows; assert.equal("w" in Object.values(rows)[0], false, "a row written with an explicit day carries no stamp");
});

/* ---- last write wins ---- */
test("an untick on one device is an untick on the other", () => {
  const a = create(mem()), b = create(mem()); a.setOn(true); b.setOn(true);
  a.put("x", "d", true); const w1 = wOf(JSON.parse(a.fileText()).rows[hashKey("x")]);
  b.load(a.fileText()); assert.equal(b.get("x").d, 1);
  const later = Date.now() + 5; const realNow = Date.now; Date.now = () => later;
  try { b.put("x", "d", false); } finally { Date.now = realNow; }
  assert.equal(b.get("x"), null, "b took it back");
  a.load(b.fileText()); assert.equal(a.get("x"), null, "and a follows");
  assert.equal(a.count(), 0); assert.ok(wOf(JSON.parse(a.fileText()).rows[hashKey("x")]) > w1);
});
test("an older copy never undoes a newer decision, and an old client's rows still merge the old way", () => {
  assert.deepEqual(mergeRows({ h: { d: 1, t: "2026-11-05", w: 2000 } }, { h: { d: 1, a: 1, t: "2026-11-01", w: 1000 } }), { h: { d: 1, t: "2026-11-05", w: 2000 } });
  assert.deepEqual(mergeRows({ h: { t: "2026-11-05", w: 2000 } }, { h: { d: 1, t: "2026-11-05", w: 1000 } }), { h: { t: "2026-11-05", w: 2000 } }, "the later tombstone beats the older tick");
  assert.deepEqual(mergeRows({ h: { a: 1, t: "2026-01-01" } }, { h: { d: 1, t: "2026-02-02" } }), { h: { a: 1, d: 1, t: "2026-02-02" } }, "neither has a stamp: both stay, as before");
  assert.deepEqual(mergeRows({ h: { d: 1, w: 1000, t: "2026-11-05" } }, { h: { a: 1, w: 1000, t: "2026-11-05" } }).h.a, 1, "the same moment keeps both");
  assert.equal(wOf({ t: "2026-11-05" }), Date.parse("2026-11-05")); assert.equal(wOf(null), 0);
});
test("the six-word file merges the same way, and caps what it carries", () => {
  assert.deepEqual(RF.mergeDecisions({ h: { d: 1, t: "2026-11-05", w: 2000 } }, { h: { t: "2026-11-06", w: 3000 } }), { h: { t: "2026-11-06", w: 3000 } });
  assert.deepEqual(RF.mergeDecisions({ h: { a: 1, t: "2026-01-01" } }, { h: { d: 1, t: "2026-02-02" } }), { h: { a: 1, d: 1, t: "2026-02-02" } });
  const prog = { v: 1, active: null, lines: {}, marks: {} }, few = { h1: { a: 1, t: "2026-11-01" } };
  assert.deepEqual(RF.buildBackup(prog, few).decisions, few, "under the cap the file is exactly what it was");
  const big = {}; for (let i = 0; i < RF.MAX_DECISIONS + 500; i++) big["h" + i] = i < 100 ? { t: "2026-11-01", w: 1e12 + i } : { d: 1, t: "2026-11-01", w: 1e12 + i };
  const out = RF.buildBackup(prog, big).decisions;
  assert.equal(Object.keys(out).length, RF.MAX_DECISIONS); assert.equal(Object.keys(big).length, RF.MAX_DECISIONS + 500, "the device keeps them all");
  assert.equal(Object.keys(out).filter(k => !out[k].d && !out[k].a).length, 0, "tombstones go first");
  assert.ok(JSON.stringify(out).length < 1.2e6, "well under the server's 2 MB");
});

/* ---- filters, people, open all, paste-ready ---- */
test("filters: still to do, done, left as is, search, one person", () => {
  const model = buildModel(fixture(10), null, "t"), st = createState(null), s = model.bySec.get("years");
  st.ticked.add(s.items[0].key); st.asIs.add(s.items[1].key);
  assert.equal(visible(s, st, {}).length, 8); assert.equal(visible(s, st, { mode: "done" }).length, 1); assert.equal(visible(s, st, { mode: "asis" }).length, 1); assert.equal(visible(s, st, { mode: "all" }).length, 10);
  assert.equal(visible(s, st, { mode: "all", q: "ann test3" }).length, 1);
  assert.equal(visible(model.bySec.get("places"), st, { mode: "all", personId: "I3" }).length, 2, "a place row names its people: I3 is on rows 2 and 3");
  assert.equal(hay(s, s.items[0]).includes("ann test0"), true);
  const idx = personIndex(model); assert.ok(idx.get("I3").some(x => x.s.key === "years") && idx.get("I3").some(x => x.s.key === "dates"));
});
test("Open all: ten people at a time, each person once, rows ticked or left as is skipped", () => {
  const model = buildModel(fixture(30), null, "t"), st = createState(null), secs = [model.bySec.get("years"), model.bySec.get("dates")];
  const all = toOpen(secs, st); assert.equal(all.length, 30, "a person on two rows is one tab");
  st.ticked.add(secs[0].items[0].key); assert.equal(toOpen(secs, st).length, 30, "still on the other row");
  st.ticked.add(secs[1].items[0].key); assert.equal(toOpen(secs, st).length, 29);
  assert.equal(BATCH, 10); assert.equal(PAGE, 100);
  const cm = buildModel(null, CMP, "t"); assert.equal(toOpen([cm.bySec.get("cmpmiss")], st).length, 0, "the relation of a missing person is not opened for them");
});
test("paste-ready lines: new and old text, and each candidate", () => {
  const model = buildModel(fixture(2), null, "t"), p = model.bySec.get("places").items[0];
  assert.deepEqual(copyActions({ key: "places" }, p).map(a => a.text), [p.to, p.raw]);
  assert.deepEqual(copyActions({ key: "decide" }, { cands: ["A, X", "B, Y"] }).map(a => a.text), ["A, X", "B, Y"]);
  assert.deepEqual(copyActions({ key: "years" }, {}), []);
});

/* ---- the per-person list and the "!" marks ---- */
test("issuesByPerson carries each row's key and section, so a mark can follow the decision", () => {
  const m = fixture(4), F = issuesByPerson({ ...m, groups: m.groups }), one = F.byId.I1;
  assert.ok(one.length >= 3 && one.every(x => typeof x.key === "string" && x.key && x.sk && x.k === x.sk));
  const st = createState(null); st.ticked.add(one[0].key);
  assert.equal(one.filter(x => st.isOpen(x.key)).length, one.length - 1);
});

/* ---- big lists ---- */
test("a very large list is counted, filtered and indexed in well under a second", () => {
  const t0 = Date.now(), m = fixture(2500), model = buildModel(m, null, "t"), st = createState(null);
  for (const s of model.sections) s.items.forEach((i, k) => { if (k % 3 === 0) st.ticked.add(i.key); });
  const t = tally(model, st), v = visible(model.bySec.get("years"), st, { q: "ann test12" }), idx = personIndex(model);
  assert.ok(t.total > 9000 && t.done > 3000 && v.length > 0 && idx.size > 2000);
  assert.ok(Date.now() - t0 < 1500, "took " + (Date.now() - t0) + " ms");
});

/* ---- the page ---- */
const app = read("public/tree-canvas/app.js"), html = read("src/pages/tree-canvas/index.astro"), rows = read("public/tree-canvas/fixlist-rows.js"), css = read("public/tree-canvas/fixrows.css");
test("the page: a workspace like Your file, with ARIA, Esc, inert, a progress bar, and the Settings hint", () => {
  assert.match(html, /<main id="fx" hidden aria-labelledby="fxTitle">/); assert.match(html, /role="progressbar"/); assert.match(html, /id="fx-q"/); assert.match(html, /id="fx-keepon"/);
  assert.match(html, /href="\/tree-canvas\/fixrows\.css"/); assert.doesNotMatch(html, /<style/, "the page's CSP allows no inline style");
  assert.match(app, /key === 'Escape' && !\$\('#fx'\)\.hidden && \$\('#sg'\)\.hidden/, "Esc closes the Fix list unless Settings is over it");
  assert.match(app, /\$\('#fx'\)\.inert = true/, "Settings makes the Fix list inert while it is over it");
  assert.match(app, /tcFixList/); assert.match(app, /tcFixCompare/); assert.match(app, /tcShow/); assert.match(app, /dec\.autoOn\(\)/);
});
test("the Compare status is a ❓ with its meaning in a tooltip and label, never the word check, and never a button", () => {
  assert.match(rows, /'❓'/); assert.match(rows, /setAttribute\('aria-label', t\)/); assert.match(rows, /e\.title = t/);
  assert.doesNotMatch(rows.slice(rows.indexOf("export function qMark"), rows.indexOf("export function rowEl")), /'button'|>check</i);
});
test("the row CSS in the canvas build is the page's, and the canvas has the Fix button and the messages", () => {
  const tpl = read("../scripts/roots/tree-canvas.template.html");
  assert.ok(tpl.includes(css.trim()), "fixrows.css is inside the vendored canvas (rebuild the canvas if this fails)");
  assert.match(tpl, /id="bFix"/); assert.match(tpl, /tcFixList/); assert.match(tpl, /tcFixCompare/); assert.match(tpl, /Open the full Fix list/); assert.match(tpl, /Nothing to fix for /);
  assert.doesNotMatch(tpl, /FIX_SHOW|fixAllHTML/, "the right pane no longer holds the whole list");
});
test("the Roots & Routes page's own Fix tab is untouched", () => {
  const rr = read("public/roots/js/app.js"); assert.match(rr, /function fixRow\(s, i\)/); assert.match(rr, /function drawFix\(\)/); assert.match(rr, /openAllBar/); assert.match(rr, /dec\.put\(i\.key, 'a', true\)/);
});

/* ---- priority and order ---- */
test("every section the reader or Compare can make has a rank, and the ranks are 1..N once each", () => {
  const keys = ["places", "check", "decide", "years", "names", "leads", "dates", "suspect", "ages", "dupes", "apart", "cmpmiss", "cmpdiff"];
  for (const k of keys) assert.ok(PRIORITY[k] && PRIORITY[k].why.length > 20, k + " has a rank and a reason");
  assert.deepEqual(Object.values(PRIORITY).map(p => p.rank).sort((a, b) => a - b), keys.map((_, i) => i + 1));
});
test("the rule: orphans and duplicates first, a birth year above today's country on an older date, High / Medium / Low from the rank", () => {
  const r = k => PRIORITY[k].rank;
  assert.ok(r("apart") < r("dupes") && r("dupes") < r("years"));
  assert.ok(r("years") < r("ages") && r("years") < r("places") && r("years") < r("decide"));
  assert.ok(r("ages") === Math.max(...Object.values(PRIORITY).map(p => p.rank)), "country on an older date is last");
  assert.equal(levelOf(r("apart")), "High"); assert.equal(levelOf(r("years")), "High"); assert.equal(levelOf(r("dates")), "Medium"); assert.equal(levelOf(r("ages")), "Low");
  const m = buildModel(fixture(3), null, "t"); for (const s of m.sections) assert.ok(s.rank && s.level && s.why, s.key + " carries its priority");
});
test("order: priority puts the groups by their best section and keeps each group together; list order is Roots & Routes'; most-to-do follows the counts", () => {
  const m = buildModel(fixture(5), null, "t"), st = createState(null), tl = tally(m, st);
  const keysOf = o => arranged(m, tl, o).map(x => x.g.key);
  assert.deepEqual(keysOf("list"), m.groups.filter(g => g.sections.length).map(g => g.key), "list order is the reader's");
  const pr = arranged(m, tl, "priority");
  assert.equal(pr[0].g.key, "join", "orphans and duplicates (Merge or connect people) come first");
  assert.ok(keysOf("priority").indexOf("find") < keysOf("priority").indexOf("place"), "a missing birth year before a place correction");
  for (const x of pr) assert.deepEqual(x.secs.map(s => s.rank), [...x.secs.map(s => s.rank)].sort((a, b) => a - b), x.g.key + " sections run by rank");
  assert.equal(pr.flatMap(x => x.secs).length, m.sections.filter(s => m.groups.some(g => g.sections.includes(s.key))).length, "no section is lost or repeated");
  const most = arranged(m, tl, "most"); assert.equal(most[0].g.key, "find", "birth years and names: 10 rows, the most"); assert.deepEqual(most[0].secs.map(x => x.key), ["years", "names"]);
  const a = m.sections.find(s => s.key === "dupes"); st.setMany(a.items.map(i => i.key), "d", true);
  assert.equal(arranged(m, tally(m, st), "priority")[0].g.key, "join", "ticking rows does not move a section: the rank is fixed");
});
test("the order inside a section: most events first, oldest birth first, branch size, name, or as listed; rows without the value go last", () => {
  const items = [{ key: "a", raw: "B", count: 1 }, { key: "b", raw: "A", count: 7 }, { key: "c", raw: "C", count: 3 }];
  assert.deepEqual(rowSort({ key: "places", items }, "useful").map(i => i.key), ["b", "c", "a"]);
  assert.deepEqual(rowSort({ key: "places", items }, "name").map(i => i.raw), ["A", "B", "C"]);
  assert.deepEqual(rowSort({ key: "places", items }, "list").map(i => i.key), ["a", "b", "c"]);
  const ppl = [{ key: "1", name: "X", born: null }, { key: "2", name: "Y", born: 1850 }, { key: "3", name: "Z", born: 1700 }];
  assert.deepEqual(rowSort({ key: "names", items: ppl }, "useful").map(i => i.key), ["3", "2", "1"]);
  const apart = [{ key: "s", size: 2, first: "S" }, { key: "t", size: 9, first: "T" }];
  assert.deepEqual(rowSort({ key: "apart", items: apart }, "useful").map(i => i.key), ["t", "s"]);
  assert.deepEqual(rowSort({ key: "dupes", items: [{ key: "q", ay: 1900, by: 1899 }, { key: "r", ay: 1800, by: null }] }, "useful").map(i => i.key), ["r", "q"]);
  const m = buildModel(fixture(150), null, "t"), s = m.bySec.get("years"), st = createState(null);
  assert.equal(visible(s, st, { mode: "all", rows: "name" }).length, 150, "sorting never drops a row");
  assert.equal(visible(s, st, { mode: "open" }).length, 150);
});
test("the page: the Order and Rows controls, remembered in localStorage inside a try, and one aligned line per section", () => {
  assert.match(html, /id="fx-order"/); assert.match(html, /id="fx-rows"/);
  const v = read("public/tree-canvas/fixlist-view.js"); assert.match(v, /try \{[^}]*localStorage/); assert.match(v, /ra-fix-order/); assert.match(v, /ra-fix-rows/);
  assert.match(v, /fx-gact[^']*'[^]*head\.append\(h\); if \(x\.total && g\.key !== 'compare'\) head\.append\(openAllBar/, "the Open next control sits in the group's own header line");
  const css = read("public/tree-canvas/page.css"); assert.match(css, /\.fx-sec > summary \{[^}]*grid-template-columns/); assert.doesNotMatch(css, /\.fx-sec \{[^}]*border: 2px/);
});
