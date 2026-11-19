/* The neighbour-based "Likely" candidate (public/roots/js/likely.js): for a place text that could be several places, which candidate the people who use it, and their relatives, are firmly
   recorded nearest. A suggestion only. Everything here is invented: made-up ids and coordinates, no real file. */
import test from "node:test";
import assert from "node:assert/strict";
import { makeLikely, LIKELY, affinity, km } from "../public/roots/js/likely.js";
import { buildPlaceReview } from "../public/roots/js/placereview.js";
import { buildModel, visible, createState, copyActions, PLACES } from "../public/tree-canvas/fixlist.js";

const A = { n: 'Northville', k: 'XX', y: 40.0, x: -90.0, region: 'North' };
const B = { n: 'Northville', k: 'XX', y: 42.0, x: -72.0, region: 'East' };     // about 1,500 km from A
const nearA = i => ({ y: 40.05 + i * 0.01, x: -89.95, k: 'XX', region: 'North' });   // a few km from A
const nearB = i => ({ y: 42.05 + i * 0.01, x: -72.05, k: 'XX', region: 'East' });

/* a world: people ({ id, rel? }), each with events [raw, date]; firm: raw -> a firm place or absent (ambiguous) */
function world(people, firm, extra = {}) {
  const P = new Map(), byRaw = new Map();
  for (const p of people) P.set(p.id, { id: p.id, father: p.father || null, mother: p.mother || null, spouse: p.spouse || [], kids: p.kids || [] });
  for (const p of people) for (const [raw, date] of p.ev || []) {
    let g = byRaw.get(raw); if (!g) byRaw.set(raw, g = { count: 0, people: [] });
    g.count++; g.people.push({ id: p.id, date: date || '' });
  }
  return makeLikely({ P, byRaw, firm: raw => firm[raw] || null, ...extra });
}
/* n unrelated people who use X and have another, firmly placed, event near `where` */
const loners = (n, where, from = 0, date = '') => Array.from({ length: n }, (_, k) => ({ id: 'p' + (from + k), ev: [['X', date], ['home' + (from + k), date]] })).map((p, k) => (p.firmAt = where(from + k), p));
const firmOf = ps => Object.fromEntries(ps.flatMap(p => (p.firmAt ? [['home' + p.id.slice(1), p.firmAt]] : [])));

test('a clear winner: unrelated people who use the text are all firmly recorded near one candidate', () => {
  const ps = loners(4, nearA), L = world(ps, firmOf(ps)), r = L.likely('X', [B, A]);
  assert.equal(r.idx, 1, 'the index is into the candidates as given');
  assert.match(r.reason, /^4 of 4 people connected to this text/);
  assert.match(r.reason, /4 of the 4 have a record within 25 km of it\.$/);
  assert.doesNotMatch(r.reason, /Northville|p\d|North|East/, 'counts only: no name, no place');
  assert.equal(L.likely('X', [B, A]), r, 'remembered per text');
});

test('a tie or no margin gives no suggestion', () => {
  const ps = [...loners(2, nearA, 0), ...loners(2, nearB, 2)], L = world(ps, firmOf(ps));
  assert.deepEqual(L.likely('X', [A, B]).none, 'tied');
  const ps2 = [...loners(5, nearA, 0), ...loners(4, nearB, 5)], L2 = world(ps2, firmOf(ps2));   // 5 to 4 is below the margin
  assert.equal(L2.likely('X', [A, B]).none, 'tied');
  assert.equal(L2.likely('X', [A, B]).idx, undefined);
});

test('too few neighbours gives no suggestion', () => {
  const ps = loners(2, nearA), L = world(ps, firmOf(ps));
  assert.equal(L.likely('X', [A, B]).none, 'few');
  assert.equal(LIKELY.MIN_PEOPLE, 3);
  const none = world([{ id: 'p0', ev: [['X', '']] }], {});
  assert.equal(none.likely('X', [A, B]).none, 'few', 'nobody else recorded anywhere');
  assert.equal(none.likely('never used', [A, B]).none, 'few');
});

test('a neighbour whose place is itself ambiguous is never evidence, nor is the text being judged', () => {
  const ps = loners(5, nearA), L = world(ps, {});   // none of their other places is firm
  assert.equal(L.likely('X', [A, B]).none, 'few');
  const ps2 = loners(5, nearA), firm = firmOf(ps2); firm.X = nearA(0);   // the text itself appears firm: still not counted for itself
  const L2 = world(ps2.map(p => ({ ...p, ev: [['X', '']] })), firm);
  assert.equal(L2.likely('X', [A, B]).none, 'few');
  const some = loners(5, nearA), f3 = firmOf(some); delete f3.home0; delete f3.home1; delete f3.home2;   // 2 firm, 3 ambiguous: below the minimum
  assert.equal(world(some, f3).likely('X', [A, B]).none, 'few');
});

test('relatives count: a person, a parent and a sibling firmly recorded near one candidate', () => {
  const ps = [
    { id: 'c', father: 'f', ev: [['X', ''], ['homec', '']] },
    { id: 'f', kids: ['c', 's'], ev: [['homef', '']] },
    { id: 's', father: 'f', ev: [['homes', '']] },
  ];
  const firm = { homec: nearA(0), homef: nearA(1), homes: nearA(2) };
  const r = world(ps, firm).likely('X', [A, B]);
  assert.equal(r.idx, 0); assert.match(r.reason, /^3 of 3 people/);
});

test('one big family does not outvote several others', () => {
  const kids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
  const fam = [{ id: 'dad', kids, ev: [['X', ''], ['homedad', '']] }, ...kids.map(k => ({ id: k, father: 'dad', ev: [['X', ''], ['home' + k, '']] }))];
  const firm = { homedad: nearB(0) }; kids.forEach((k, n) => { firm['home' + k] = nearB(n + 1); });
  const others = loners(3, nearA, 10); Object.assign(firm, firmOf(others));
  const r = world([...fam, ...others], firm).likely('X', [A, B]);
  assert.equal(r.idx, 0, 'three families, three voices: the seven in one family are one voice');
  const alone = world(fam, firm).likely('X', [A, B]);
  assert.equal(alone.idx, 1, 'the same family alone still says its own');
  const two = world([...fam, ...loners(1, nearA, 10)], { ...firm, ...firmOf(loners(1, nearA, 10)) }).likely('X', [A, B]);
  assert.equal(two.idx, undefined, 'one family against one person is no margin');
});

test('the ruler of the day breaks a close call only when the dated records clearly agree', () => {
  const C = { n: 'Midtown', k: 'XX', y: 45.0, x: 14.0, region: 'West' }, D = { n: 'Midtown', k: 'YY', y: 45.0, x: 15.5, region: 'East' };   // about 120 km apart
  const mid = i => ({ y: 45.0 + i * 0.001, x: 14.75, k: 'ZZ', region: 'Mid' });                                                              // between them, equally near both
  const dated = loners(4, mid, 0, '1850'), firm = firmOf(dated);
  const regime = (y, x, yr) => (x < 14.8 ? 'old-ruler' : 'new-ruler');
  assert.equal(world(dated, firm).likely('X', [C, D]).none, 'tied', 'no rulers given: nothing to break it');
  const r = world(dated, firm, { regime }).likely('X', [C, D]);
  assert.equal(r.idx, 0); assert.match(r.reason, /same country as theirs at the dates of their records \(4 records\)/);
  const undated = loners(4, mid, 0, ''), f2 = firmOf(undated);
  assert.equal(world(undated, f2, { regime }).likely('X', [C, D]).none, 'tied', 'no dates, no tie-break');
  const split = loners(4, mid, 0, '1850'), f3 = firmOf(split);
  assert.equal(world(split, f3, { regime: (y, x, yr) => 'same' }).likely('X', [C, D]).none, 'tied', 'a ruler who held both is no tie-break');
});

test('fewer than two candidates are not judged', () => {
  const ps = loners(4, nearA), L = world(ps, firmOf(ps));
  assert.equal(L.likely('X', [A]), null); assert.equal(L.likely('X', []), null); assert.equal(L.likely('X', null), null);
});

test('distances: the same spot is near, far away is nothing', () => {
  assert.equal(km(10, 10, 10, 10), 0);
  assert.equal(affinity({ y: 40, x: -90, k: 'XX' }, A), 1);
  assert.equal(affinity({ y: 40, x: -88.6, k: 'XX' }, A) > 0 && affinity({ y: 40, x: -88.6, k: 'XX' }, A) < 1, true);
  assert.equal(affinity({ y: 40, x: -60, k: 'XX' }, A), 0);
});

/* ---- the checklist and the Places tab carry it, and change nothing else ---- */
const resolved = (cands) => ({ tier: 'ambiguous', cands, place: null, iso: 'XX' });
function fixture() {
  const ps = [...loners(4, nearA)]; for (const p of ps) { p.given = 'G' + p.id; p.sur = 'S'; }
  const firm = firmOf(ps);
  const L = world(ps, firm);
  const mentions = new Map([['X', 4], ['Y', 2]]);
  const events = new Map([['X', { count: 4, people: ps.map(p => ({ id: p.id, name: p.given + ' ' + p.sur })) }], ['Y', { count: 2, people: [] }]]);
  return { ps, L, mentions, events };
}
test('the Places tab: a likely candidate on a row with several, a quiet line when the neighbours are silent, nothing on a single candidate; the order and counts do not change', () => {
  const { L, mentions, events } = fixture();
  const res = new Map([['X', resolved([B, A].map(c => ({ ...c, p: 0 })))], ['Y', resolved([A, B].map(c => ({ ...c, p: 0 })))]]);
  const env = { mentions, res, events, living: true, label: c => c.n, enrich: () => {} };
  const plain = buildPlaceReview(env), withL = buildPlaceReview({ ...env, likely: L });
  const sec = r => r.sections.find(s => s.key === 'ambiguous').items;
  assert.deepEqual(sec(withL).map(i => i.raw), sec(plain).map(i => i.raw), 'row order unchanged');
  assert.deepEqual(withL.counts, plain.counts);
  const x = sec(withL).find(i => i.raw === 'X'), y = sec(withL).find(i => i.raw === 'Y');
  assert.equal(x.likely.idx, 1); assert.ok(x.likely.reason);
  assert.equal(y.likely, undefined); assert.equal(y.noNeighbours, true, 'Y has no users with firm records: no clear neighbours');
  assert.deepEqual(x.cands.map(c => c.label), sec(plain).find(i => i.raw === 'X').cands.map(c => c.label), 'candidates stay in their order');
  const one = buildPlaceReview({ ...env, res: new Map([['X', resolved([A])]]), mentions: new Map([['X', 4]]), likely: L });
  assert.equal(sec(one)[0].likely, undefined); assert.equal(sec(one)[0].noNeighbours, undefined, 'a single candidate is unaffected');
  /* the filter and the copy order */
  const m = buildModel({ groups: withL.groups, sections: withL.sections }, null, '', PLACES), s = m.sections.find(q => q.key === 'ambiguous'), st = createState();
  st.load(m, {});
  assert.deepEqual(visible(s, st, { likely: true }).map(i => i.raw), ['X']);
  assert.equal(visible(s, st, {}).length, 2);
  const acts = copyActions({ key: 'decide' }, { cands: ['b', 'a', 'c'], likely: { idx: 1, reason: 'r' } });
  assert.deepEqual(acts.map(a => a.label), ['a', 'b', 'c']); assert.equal(acts[0].likely, true); assert.equal(acts.filter(a => a.likely).length, 1);
  assert.deepEqual(copyActions({ key: 'decide' }, { cands: ['b', 'a'] }).map(a => a.label), ['b', 'a']);
});

/* ---- from a real read of an invented family: Springfield (several places of that name) is used by one person whose relatives are firmly recorded in towns near one of them ---- */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const R = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/roots/");
const has = ["atlas.json", "adm.json", "floor.json", "g/ZA.json"].every(f => fs.existsSync(R + "data/" + f));
const need = { skip: has ? false : "run python3 scripts/build-roots-data.py first" };
const io = { json: async p => JSON.parse(fs.readFileSync(R + p, "utf8")), flag: async id => fs.readFileSync(path.join(R, "../fl/", id + ".svg"), "utf8") };
const person = (id, nm, ev, fam) => ["0 @I" + id + "@ INDI", "1 NAME " + nm, ...ev.flatMap(([t, d, p]) => ["1 " + t, "2 DATE " + d, "2 PLAC " + p]), ...fam];
const GED = ["0 HEAD", "1 CHAR UTF-8",
  ...person(1, "Ann /Fam/", [["BIRT", "1850", "Springfield"], ["DEAT", "1910", "Pekin, Illinois, USA"]], ["1 FAMC @F1@"]),
  ...person(2, "Bob /Fam/", [["BIRT", "1852", "Peoria, Illinois, USA"]], ["1 FAMC @F1@"]),
  ...person(3, "Dad /Fam/", [["BIRT", "1820", "Jacksonville, Illinois, USA"]], ["1 FAMS @F1@"]),
  ...person(4, "Mum /Fam/", [["BIRT", "1825", "Bloomington, Illinois, USA"]], ["1 FAMS @F1@"]),
  ...person(5, "Lone /Other/", [["BIRT", "1860", "Kingston"]], []),
  "0 @F1@ FAM", "1 HUSB @I3@", "1 WIFE @I4@", "1 CHIL @I1@", "1 CHIL @I2@", "0 TRLR", ""].join("\n");
test("from a real read: the Fix list's Choose-a-place row and the Places tab row carry the same suggestion, from relatives, and the reader is not changed", need, async () => {
  const { Session } = await import(R + "js/pipeline.js");
  const s = new Session(io); await s.load(new TextEncoder().encode(GED));
  const before = JSON.stringify([...s.res]), ov = s.overrides.size;
  const fix = s.checklist({ living: true }), out = s.places({ living: true });
  const d = fix.sections.find(x => x.key === "decide").items.find(i => i.raw === "Springfield"), p = out.sections.flatMap(x => x.items).find(i => i.raw === "Springfield");
  assert.ok(d.cands.length > 1); assert.equal(d.likely.idx, 2); assert.match(d.cands[d.likely.idx], /Illinois/);
  assert.equal(p.likely.idx, d.likely.idx); assert.equal(p.likely.reason, d.likely.reason);
  assert.match(d.likely.reason, /^3 of 3 people connected to this text/);
  const k = fix.sections.find(x => x.key === "decide").items.find(i => i.raw === "Kingston");
  if (k && k.cands.length > 1) assert.equal(k.noNeighbours, true, "a text nobody else is placed near has no clear neighbours");
  assert.equal(JSON.stringify([...s.res]), before); assert.equal(s.overrides.size, ov, "reading changes nothing; the suggestion is not a pick");
  assert.deepEqual(fix.sections.find(x => x.key === "decide").items.map(i => i.raw), [...fix.sections.find(x => x.key === "decide").items.map(i => i.raw)].sort((a, b) => a.localeCompare(b, "en")), "row order is still A to Z");
});
