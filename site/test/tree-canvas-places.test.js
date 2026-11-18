/* The Tree Canvas's Fix list, Places tab: the places the Atlas could not settle exactly, as a checklist (nothing is edited, chosen or drawn from it). Its rows, groups and ranks, the
   filters it shares with the People list, the decisions it keeps in the SAME store under the SAME keys as Roots & Routes' fix list, and the shape of the page. Everything in
   these fixtures is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create, hashKey } from "../public/roots/js/decisions.js";
import { buildPlaceReview, TIERS, NEEDS, PLACE_GROUPS, PEOPLE_CAP } from "../public/roots/js/placereview.js";
import { eventsByPlace } from "../public/roots/js/checklist.js";
import { buildModel, createState, tally, visible, hay, toOpen, arranged, PLACES, PLACE_PRIORITY, PLACE_LEVEL_AT, levelOf, rowSort, PAGE } from "../public/tree-canvas/fixlist.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const R = path.join(here, "../public/roots/");
const mod = { exports: {} };
new Function("module", read("public/js/research-file.js"))(mod);
const RF = mod.exports;
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };

const cand = (n, region, k, p, y, x) => ({ n, region, k, p, y, x });
const label = c => [c.n, c.region, c.k === "US" ? "United States" : c.k].filter(Boolean).join(", ");
const person = (id, name, liv) => ({ id, name, liv: !!liv });
/* the reader's resolutions for a few invented texts, and who uses each */
function env(living) {
  const res = new Map([
    ["Springfield", { tier: "ambiguous", cands: [cand("Springfield", "Illinois", "US", 114000, 39.8, -89.6), cand("Springfield", "Missouri", "US", 169000, 37.2, -93.3)] }],
    ["Xyzzyville, Nowhere", { tier: "not-found", cands: [] }],
    ["Dunmarrow", { tier: "review-other-country", iso: "GB", cands: [cand("Dunmarrow", null, "IE", 900, 53.1, -6.2)] }],
    ["Lonely Ford", { tier: "review-skipped-part", cands: [cand("Ford", "Kent", "GB", 5000, 51.2, 0.9)] }],
    ["Hartfield, Sussex", { tier: "parent-level", cands: [] }],
    ["Greenvale, Victoria", { tier: "region", cands: [] }],
    ["Kimberley, Northern Cape, South Africa", { tier: "confident", cands: [] }],
    ["Only Alive Lane", { tier: "ambiguous", cands: [cand("Alive", null, "US", 10, 40, -80)] }],
  ]);
  const mentions = new Map([...res.keys()].map((k, n) => [k, n + 2]));
  const ppl = (n, liv) => Array.from({ length: n }, (_, i) => ({ id: "I" + i, name: "Ann Test" + i, ev: "Birth", date: String(1800 + i) }));
  const events = new Map([
    ["Springfield", { count: 3, people: ppl(3) }], ["Xyzzyville, Nowhere", { count: 1, people: ppl(1) }], ["Dunmarrow", { count: 2, people: ppl(2) }],
    ["Lonely Ford", { count: 1, people: ppl(1) }], ["Hartfield, Sussex", { count: 1, people: ppl(1) }], ["Greenvale, Victoria", { count: 1, people: ppl(1) }],
    ["Kimberley, Northern Cape, South Africa", { count: 1, people: ppl(1) }],
    ...(living ? [["Only Alive Lane", { count: 1, people: ppl(1) }]] : []),   // a hidden living person's text has no kept events at all
  ]);
  return { mentions, res, events, living, label, enrich: o => { for (const s of o.sections) for (const i of s.items) i.info = [{ k: "Atlas", t: "help for " + i.raw }]; } };
}

test("the Places rows are the places Roots & Routes' own tab lists: every tier that is not an exact match, grouped, each row keyed d|<text>", () => {
  const out = buildPlaceReview(env(true));
  assert.deepEqual(out.sections.map(s => s.key), TIERS.map(t => t[0]));
  assert.deepEqual(out.counts, { ambiguous: 2, "review-skipped-part": 1, "review-other-country": 1, "not-found": 1, "parent-level": 1, district: 0, region: 1, "country-only": 0 });
  assert.ok(!out.sections.flatMap(s => s.items).some(i => i.raw.startsWith("Kimberley")), "an exact match is not a place to review");
  for (const s of out.sections) for (const i of s.items) { assert.equal(i.key, "d|" + i.raw, "the key is the one the fix list's Choose-a-place row already uses for the same text"); assert.equal(i.tier, s.key); assert.ok(s.place); }
  assert.deepEqual(out.groups.map(g => g.key), PLACE_GROUPS.map(g => g.key));
  assert.deepEqual(out.groups.flatMap(g => g.sections).sort(), TIERS.map(t => t[0]).sort(), "every tier is in a group, once");
  const sp = out.sections[0].items.find(i => i.raw === "Springfield");
  assert.equal(sp.cands.length, 2); assert.equal(sp.cands[0].label, "Springfield, Illinois, United States", "each candidate carries the paste-ready text the fix list uses");
  assert.equal(sp.events, 3); assert.ok(sp.info.length && sp.next, "the Atlas's help and the next step are on the row");
});

test("living people: with them hidden, a text only they use is not listed, and the reader's own count is not leaked", () => {
  const shown = buildPlaceReview(env(true)), hidden = buildPlaceReview(env(false));
  assert.ok(shown.sections[0].items.some(i => i.raw === "Only Alive Lane"));
  assert.ok(!hidden.sections.flatMap(s => s.items).some(i => i.raw === "Only Alive Lane"));
  assert.equal(hidden.hidden, 1);
});

test("a place used by thousands of events lists a capped number of people and says how many events there are", () => {
  const e = env(true); e.events.set("Springfield", { count: 5000, people: Array.from({ length: 5000 }, (_, i) => ({ id: "I" + i, name: "N" + i, ev: "Birth", date: "1800" })) });
  const i = buildPlaceReview(e).sections[0].items.find(x => x.raw === "Springfield");
  assert.equal(i.people.length, PEOPLE_CAP); assert.equal(i.events, 5000);
});

test("the Places model: its own sections, groups and ranks; High to Low by the rank; the tab counts what a visitor can act on", () => {
  const model = buildModel(buildPlaceReview(env(true)), null, "", PLACES);
  assert.deepEqual(model.sections.map(s => s.key), TIERS.map(t => t[0]));
  assert.deepEqual(model.groups.map(g => g.key), ["choose", "find", "coarse"]);
  const ranks = Object.values(PLACE_PRIORITY).map(p => p.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1), "ranks are 1..N once each");
  assert.equal(Object.keys(PLACE_PRIORITY).length, TIERS.length, "every tier has a rank and a reason");
  for (const s of model.sections) { assert.ok(s.why.length > 20, s.key + " says why"); assert.equal(s.level, levelOf(s.rank, PLACE_LEVEL_AT)); }
  assert.equal(model.bySec.get("ambiguous").level, "High"); assert.equal(model.bySec.get("not-found").level, "Medium"); assert.equal(model.bySec.get("region").level, "Low");
  const t = tally(model, createState(null));
  assert.equal(NEEDS.reduce((n, k) => n + t.sec[k].open, 0), 5, "the badge: ambiguous, other country, skipped part and not found");
  assert.equal(t.total, 7);
  const lay = arranged(model, t, "priority"); assert.deepEqual(lay[0].g.key, "choose", "the places to choose come first");
});

test("the same filters as the People list: still to do, done, left as is, search by place, person or candidate; rows by most events or A to Z", () => {
  const model = buildModel(buildPlaceReview(env(true)), null, "", PLACES), st = createState(null), s = model.bySec.get("ambiguous");
  assert.equal(visible(s, st, { mode: "open" }).length, 2);
  st.set("d|Springfield", "d", true); st.set("d|Only Alive Lane", "a", true);
  assert.deepEqual(visible(s, st, { mode: "open" }).map(i => i.raw), []);
  assert.deepEqual(visible(s, st, { mode: "done" }).map(i => i.raw), ["Springfield"]);
  assert.deepEqual(visible(s, st, { mode: "asis" }).map(i => i.raw), ["Only Alive Lane"]);
  assert.equal(visible(s, st, { mode: "all", q: "missouri" }).length, 1, "a candidate's region is searchable");
  assert.equal(visible(s, st, { mode: "all", q: "ann test1" }).length, 1, "a person on the row is searchable (only Springfield has a second person)");
  assert.equal(visible(s, st, { mode: "all", q: "zzz" }).length, 0);
  assert.deepEqual(rowSort(s, "useful").map(i => i.raw), ["Springfield", "Only Alive Lane"], "most events first");
  assert.deepEqual(rowSort(s, "name").map(i => i.raw), ["Only Alive Lane", "Springfield"]);
  assert.ok(hay(s, s.items.find(i => i.raw === "Springfield")).includes("illinois"));
  assert.equal(PAGE, 100, "paged 100 at a time, as the People list is");
});

test("Open next 10 people works on a Places group the same way: each person once, rows done or left as is skipped", () => {
  const model = buildModel(buildPlaceReview(env(true)), null, "", PLACES), st = createState(null);
  const secs = model.groups[0].sections.map(k => model.bySec.get(k));
  const all = toOpen(secs, st, {}); assert.equal(new Set(all.map(p => p.id)).size, all.length);
  st.set("d|Springfield", "d", true);
  assert.ok(toOpen(secs, st, {}).length < all.length);
});

test("one decision, one store: a tick on a Places row is the row Roots & Routes' fix list keeps under the same key, and the other list reads it", () => {
  const store = create(mem()); store.setOn(true);
  const places = buildModel(buildPlaceReview(env(true)), null, "", PLACES), stP = createState(store);
  stP.set("d|Springfield", "d", true); stP.flush();
  assert.ok(store.get("d|Springfield").d, "kept under d|<text>, hashed by the store, the key the fix list's Choose-a-place row has");
  assert.equal(Object.keys(store.rows()).length, 1);
  assert.ok(!JSON.stringify(store.rows()).includes("Springfield"), "no place text is written");
  /* the People list's row for the same text: key d|<text>, from the reader's checklist (checklist.js) */
  const peopleMsg = { sections: [{ key: "decide", title: "Places to decide", how: "x", items: [{ key: "d|Springfield", raw: "Springfield", tier: "ambiguous", count: 3, cands: ["Springfield, Illinois, United States"], people: [{ id: "I1", name: "Ann Test", ev: "Birth", date: "1800" }] }] }], groups: [{ key: "choose", title: "Choose a place", how: "x", sections: ["decide"] }], main: 1 };
  const people = buildModel(peopleMsg, null, ""), stR = createState(store);
  assert.equal(stR.load(people), 1); assert.ok(stR.isDone("d|Springfield"), "a decision made on the Places tab shows in the People list");
  stR.set("d|Springfield", "d", false); stR.flush();
  const stP2 = createState(store); stP2.load(places); assert.ok(!stP2.isDone("d|Springfield"), "and an untick there shows here (it travels as a tombstone)");
  assert.ok(RF.capDecisions(store.rows()), "the six-word copy carries these rows as it carries every other");
});

test("while keeping is off a Places tick writes nothing; turning it off forgets", () => {
  const m = mem(), store = create(m); store.setOn(false);
  const st = createState(store); st.set("d|Springfield", "d", true); assert.equal(st.flush(), false); assert.equal(m.getItem("ra-fix-decisions-v1"), null);
  store.setOn(true); st.set("d|Newport", "d", true); st.flush(); assert.equal(store.count(), 1);
  store.setOn(false); assert.equal(m.getItem("ra-fix-decisions-v1"), null, "off means nothing is kept");
});

/* ---- the row: a checklist row, with nothing that edits ---- */
class Fake {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.attrs = {}; this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} }; this.className = ""; this.textContent = ""; this._inner = ""; }
  set innerHTML(v) { this._inner = v; if (/<span><\/span>$/.test(v)) this.childNodes.push(new Fake("span")); }
  get innerHTML() { return this._inner; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1]; }
  append(...c) { for (const x of c) this.childNodes.push(typeof x === "string" ? { text: x } : x); }
  setAttribute(k, v) { this.attrs[k] = v; }
  all(f, out = []) { for (const c of this.childNodes) if (c instanceof Fake) { if (f(c)) out.push(c); c.all(f, out); } return out; }
  text() { return this.textContent + this.childNodes.map(c => (c instanceof Fake ? c.text() : c.text)).join(""); }
}
const fakeDoc = { createElement: t => new Fake(t) };
test("a Places row: the text, a copy button for the text and for each candidate, the people, Leave as is; no button chooses, edits or sends anything", async () => {
  const { rowEl } = await import("../public/tree-canvas/fixlist-rows.js");
  const model = buildModel(buildPlaceReview(env(true)), null, "", PLACES), st = createState(null), s = model.bySec.get("ambiguous"), i = s.items.find(x => x.raw === "Springfield");
  const row = rowEl(fakeDoc, { st, links: { url: () => null }, onChange() {} }, s, i);
  const buttons = row.all(e => e.tag === "button"), titles = buttons.map(b => b.title || "");
  assert.ok(titles.some(t => /Copy the place text/.test(t)), "copy the text as the file writes it");
  for (const c of i.cands) assert.ok(titles.includes("Copy “" + c.label + "”"), "copy " + c.label);
  assert.ok(buttons.some(b => b.className === "fx-leave" && b.textContent === "Leave as is"));
  assert.ok(row.all(e => e.tag === "input").length === 1, "one checkbox: Done");
  assert.ok(!titles.some(t => /choose|pick|draw|edit|send|export/i.test(t)), "nothing here chooses, edits or sends: " + titles.join(" | "));
  assert.match(row.text(), /Ann Test0/, "the people who use the text are listed");
  const nf = model.bySec.get("not-found").items[0], r2 = rowEl(fakeDoc, { st, links: { url: () => null }, onChange() {}, suggest() {} }, model.bySec.get("not-found"), nf);
  assert.ok(r2.all(e => e.tag === "button").some(b => b.textContent === "Try a nearby spelling"), "a text that was not found offers a nearby spelling (to copy), as Roots & Routes does");
});

test("the page: People and Places are tabs of the Fix list (ARIA tablist), the Places pane is the People pane's markup, the keeping section is shared, and Cleaned is gone from Your file", () => {
  const html = read("src/pages/tree-canvas/index.astro"), app = read("public/tree-canvas/app.js"), v = read("public/tree-canvas/fixlist-view.js"), css = read("public/tree-canvas/page.css");
  assert.match(html, /role="tablist"/); assert.match(html, /id="fxt-people"[^>]*role="tab"|role="tab"[^>]*id="fxt-people"/); assert.match(html, /id="fxt-places"/);
  assert.match(html, /id="fxpane-places"[^>]*role="tabpanel"/); assert.match(html, /id="fx-keep"/);
  assert.match(app, /kind: 'places', pfx: 'fxp'/); assert.match(app, /fxw\.addPeer\(pw\)/); assert.match(app, /cmd: 'places'/); assert.match(app, /m\.type === 'places'/);
  assert.match(app, /ArrowRight/); assert.match(app, /aria-selected/);
  assert.match(v, /keepRoot/); assert.match(v, /ra-fixp-order/); assert.doesNotMatch(v, /cmd: 'pick'/, "the Places tab never asks the reader to choose a place");
  assert.doesNotMatch(app, /cmd: 'pick'/); assert.doesNotMatch(app, /cmd: 'redraw'/);
  assert.match(css, /\.fxtab\[aria-selected="true"\]/); assert.match(css, /#fx-prog, #fxp-prog/);
  assert.doesNotMatch(html, /value="cleaned"/, "the Cleaned export is not offered here: with no places picked in the canvas it would equal Enriched");
  assert.doesNotMatch(html, /Places are picked on the Places to review screen/);
  assert.match(html, /value="enriched" checked/); assert.match(html, /value="shareable"/); assert.match(html, /value="faithful"/);
});

test("Roots & Routes keeps working: its Places to review tab and its session-only picks are untouched", () => {
  const rr = read("public/roots/js/app.js"), w = read("public/roots/js/worker.js"), pl = read("public/roots/js/pipeline.js");
  assert.match(rr, /function drawReview\(items, q\)/); assert.match(rr, /worker\.postMessage\(\{ cmd: 'pick', raw, cand \}\)/);
  assert.match(w, /m\.cmd === 'pick' && session/); assert.match(w, /session\.pick\(m\.raw, m\.cand\)/); assert.match(pl, /cleaned: \{ coords: true, apply: true \}/);   // the session still knows the mode; no page offers it
});

/* ---- from a real read of an invented file (needs the data the roots tests need) ---- */
const has = fs.existsSync(R + "data/atlas.json") && fs.existsSync(R + "data/adm.json") && fs.existsSync(R + "data/floor.json") && fs.existsSync(R + "data/g/ZA.json");
const need = { skip: has ? false : "run python3 scripts/build-roots-data.py first" };
const enc = s => new TextEncoder().encode(s);
const io = { json: async p => JSON.parse(fs.readFileSync(R + p, "utf8")), flag: async id => fs.readFileSync(path.join(R, "../fl/", id + ".svg"), "utf8") };
const GED = ["0 HEAD", "1 CHAR UTF-8",
  "0 @I1@ INDI", "1 NAME Dead /Person/", "1 BIRT", "2 DATE 1850", "2 PLAC Xyzzyville, Nowhere", "1 DEAT", "2 DATE 1910", "2 PLAC Springfield",
  "0 @I2@ INDI", "1 NAME Alive /Person/", "1 BIRT", "2 DATE 1990", "2 PLAC Hidden Lane, Qwertyland",
  "0 @I3@ INDI", "1 NAME Third /Person/", "1 BIRT", "2 DATE 1860", "2 PLAC Kimberley, Northern Cape, South Africa", "1 DEAT", "2 DATE 1900", "2 PLAC Springfield",
  "0 TRLR", ""].join("\n");
test("from a real read: the Places rows are exactly the rows the fix list's Choose-a-place section has (same keys, same people), the reader is not changed, and nothing is picked", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(GED));
  const overridesBefore = s.overrides.size, resBefore = JSON.stringify([...s.res]);
  const out = s.places({ living: true }), fix = s.checklist({ living: true });
  assert.equal(s.overrides.size, overridesBefore); assert.equal(JSON.stringify([...s.res]), resBefore, "reading the Places rows changes nothing in the reader");
  const decide = fix.sections.find(x => x.key === "decide").items, rows = out.sections.filter(x => NEEDS.includes(x.key)).flatMap(x => x.items);
  assert.deepEqual(rows.map(i => i.key).sort(), decide.map(i => i.key).sort(), "the four kinds of text a visitor can act on are the Choose-a-place rows");
  for (const r of rows) assert.deepEqual(r.people.map(p => p.id).sort(), decide.find(d => d.key === r.key).people.map(p => p.id).sort(), r.raw);
  const sp = rows.find(r => r.raw === "Springfield"); assert.ok(sp && sp.cands.length > 1); assert.ok(sp.cands[0].label.includes(","), "a paste-ready candidate");
  assert.ok(!rows.some(r => r.raw === "Kimberley, Northern Cape, South Africa"));
  const noLive = s.places({ living: false });
  assert.ok(!noLive.sections.flatMap(x => x.items).some(r => r.raw === "Hidden Lane, Qwertyland"), "a text only a living person uses is left out when living people are hidden");
});
test("eventsByPlace is the walk the fix list uses: the same counts per text", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(enc(GED));
  const by = eventsByPlace(s.parsed, s.P, p => p.id, () => true);
  assert.equal(by.get("Springfield").count, 2); assert.equal(by.get("Springfield").people.length, 2);
});
