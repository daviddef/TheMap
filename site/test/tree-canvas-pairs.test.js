/* Compare in pairs: the visitor's file beside one or several archives, a generation to a row.
   The pairing engine is cut out of the vendored canvas (scripts/roots/tree-canvas.template.html) and run in a VM, so what is tested is what ships. Every tree here is INVENTED:
   the example family from public/examples (the file) against small invented "archive" trees made from it. Also: what is kept of the visitor's choices (opaque ids only, strictly
   cleaned on the way into the six-word copy, inside its size caps) and how several archives are read (a few at a time, one failing never stops the others). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as W from "../public/tree-canvas/work.js";
import * as CS from "../public/tree-canvas/compare-set.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p), "utf8");
const load = f => { const m = { exports: {} }; new Function("module", read("../public/js/" + f))(m); return m.exports; };
const RF = load("research-file.js");

/* ---- the canvas's logic, cut out of the built page ---- */
const TPL = read("../../scripts/roots/tree-canvas.template.html");
const code = /<script>(\/\* logic\.js[\s\S]*?)<\/script>/.exec(TPL);
assert.ok(code, "the canvas template's logic block moved: this test cuts it out by its first comment");
const ctx = vm.createContext({ console }); ctx.window = ctx; vm.runInContext(code[1], ctx);
const { TC, TCF, TCP } = ctx;
assert.ok(TC && TCF && TCF.mergeAll && TCP && TCP.pair, "the template carries the pairing engine (rebuild the Tree Canvas with --embed and vendor it)");

/* ---- invented trees ---- */
const per = (id, sex, given, sur, by, bp, dy, dp, x) => Object.assign({ id, sex, given, sur, by, bp, dy, dp, spouse: [], kids: [] }, x || {});
const link = ppl => { const m = new Map(ppl.map(p => [p.id, p])); ppl.forEach(p => { [p.father, p.mother].forEach(q => { if (q && m.has(q) && !m.get(q).kids.includes(p.id)) m.get(q).kids.push(p.id); }); (p.spouse || []).forEach(s => { if (m.has(s) && !m.get(s).spouse.includes(p.id)) m.get(s).spouse.push(p.id); }); }); return ppl; };
const arch = (key, color, ppl) => TCF.corpus({ meta: { title: key }, people: link(ppl) }, { places: [] }, key, { key, name: key, host: key + ".example.org", color, graded: true });
const ex = JSON.parse(read("../public/examples/example-family.tree.json"));
const FILE = () => TCF.corpus(Object.assign({}, ex, { meta: Object.assign({}, ex.meta, { source: "tree.json" }) }), { places: [] });
const build = archs => TC.build(TCF.mergeAll([FILE()].concat(archs)));
const at = (M, key) => M.byKey.get(key).i;
const go = (M, fk, aks, o) => { const a = {}; Object.keys(aks).forEach(k => { a[M.archives.findIndex(x => x.k === k)] = at(M, k + ":" + aks[k]); }); return TCP.pair(M, { f: at(M, "you:" + fk), a }, o); };
const slotOf = (R, M, key) => R.owner.get(at(M, key));

const ONE = () => link([   /* archive one: the Marlowe line, with a grandfather the file lacks and Fenna's name spelt another way */
  per("x0", "m", "Josiah", "Marlowe", 1790, "Grahamstown", 1860, "Grahamstown"), per("x1", "m", "Ansel", "Marlowe", 1821, "Grahamstown", 1893, "Grahamstown", { father: "x0" }),
  per("x3", "m", "Corin", "Marlowe", 1850, "Port Elizabeth", 1921, "Port Elizabeth", { father: "x1", spouse: ["x4"] }), per("x4", "f", "Dilys", "Penhallow", 1853, "St Austell", 1929, "Port Elizabeth", { spouse: ["x3"] }),
  per("x5", "m", "Edric", "Marlowe", 1879, "Kimberley", 1944, "Kimberley", { father: "x3", mother: "x4", spouse: ["x6"] }), per("x6", "f", "Fenna", "Ostrovski", 1885, "Kraków", 1960, "Durban", { spouse: ["x5"] }),
  per("x7", "m", "Gideon", "Marlowe", 1911, "Durban", 1990, "Durban", { father: "x5", mother: "x6" }), per("x9", "f", "Ilse", "Marlowe", 1913, "Durban", 1980, "Durban", { father: "x5", mother: "x6" })]);
const TWO = () => link([   /* archive two: the same Corin, Edric and Gideon, and a different mother for Edric */
  per("y3", "m", "Corin", "Marlowe", 1850, "Port Elizabeth", 1921, "Port Elizabeth", { mother: "ym" }), per("ym", "f", "Hannah", "Pryce", 1851, "Bunbury", 1920, "Perth"),
  per("y5", "m", "Edric", "Marlowe", 1879, "Kimberley", 1944, "Kimberley", { father: "y3", mother: "ym" }), per("y7", "m", "Gideon", "Marlowe", 1911, "Durban", 1990, "Durban", { father: "y5" })]);

test("the file (the invented example) beside two archives: the walk pairs a person with a relative of the same kind, one row to a generation", () => {
  const M = build([arch("one", "#1B6E99", ONE()), arch("two", "#2E8B57", TWO())]);
  assert.equal(M.archives.length, 3); assert.deepEqual([...M.archives.map(a => a.k)], ["you", "one", "two"]);
  const R = go(M, "I5", { one: "x5", two: "y5" });
  const s = k => slotOf(R, M, k);
  assert.equal(s("you:I5").state, "same");
  assert.equal(s("you:I3").arch[1].i, at(M, "one:x3"), "Edric's father pairs with the archive's Corin");
  assert.equal(s("you:I7").arch[1].i, at(M, "one:x7"), "the child pairs with the child of the same couple");
  assert.ok(s("one:x0").f < 0 && s("one:x0").state === "only-b", "a grandfather only the archive has stands alone");
  assert.equal(s("you:I11").state, "only-a", "Fenna's parents are only in the file");
  assert.equal(s("one:x9").state, "only-b", "a sister only the archive has");
  /* a person in two archives: one slot, a chip for the second; archives that disagree about the mother are shown, not resolved */
  assert.ok(s("you:I3").arch[2] && s("you:I3").arch[2].i === at(M, "two:y3"), "archive two's Corin joins the same slot");
  const mum = s("you:I4"); assert.ok(mum.arch[2] && mum.arch[2].level === "differs" && mum.arch[1].level !== "differs" && mum.primary === 1, "archive two's different mother is in the mother slot, marked different; archive one stays primary");
  assert.ok(mum.chips.some(c => c.a === 2 && c.level === "differs"), "…and is a visible chip");
  /* edges join slots; layout gives every slot a place, parents above children */
  assert.ok(R.edges.every(e => R.bySlot.has(e.from) && R.bySlot.has(e.to)));
  const L = TCP.layout(R); assert.ok(R.slots.every(x => L.pos.has(x.id)));
  assert.ok(L.pos.get(s("you:I3").id).y < L.pos.get(s("you:I5").id).y && L.pos.get(s("you:I5").id).y < L.pos.get(s("you:I7").id).y);
  const st = TCP.layout(R, { stack: true }); assert.ok(st.off.dx === 0 && st.off.dy > 0 && st.cell < L.cell, "a phone stacks the pair");
});

test("never auto-joined: the other archive's Edric is a 'maybe' until accepted, rejecting it takes the offer away, accepting pairs it for real", () => {
  const M = build([arch("one", "#1B6E99", ONE()), arch("two", "#2E8B57", TWO())]);
  const R = go(M, "I5", { one: "x5" }), e = slotOf(R, M, "you:I5");
  assert.ok(!e.arch[2] && e.maybe.some(m => m.a === 2 && m.i === at(M, "two:y5") && m.level !== "same"), "offered, not joined, never shown as agreeing");
  const key = TCP.dkey(M, at(M, "you:I5"), at(M, "two:y5"));
  assert.ok(slotOf(go(M, "I5", { one: "x5" }, { decisions: new Map([[key, "y"]]) }), M, "you:I5").arch[2], "accepted: joined");
  assert.ok(!slotOf(go(M, "I5", { one: "x5" }, { decisions: new Map([[key, "n"]]) }), M, "you:I5").maybe.some(m => m.a === 2), "rejected: gone");
});

test("namesakes, a person entered twice in the file, a cycle, a living person, an empty archive, a huge sibling set", () => {
  /* namesakes + the file's own duplicate */
  const f = TCF.corpus({ meta: { title: "Mine", source: "tree.json" }, people: link([
    per("p", "m", "Pat", "Lyle", 1900, "Perth", 1970, "Perth"),
    per("t1", "m", "Thomas", "Lyle", 1925, "Perth", 1990, "Perth", { father: "p" }), per("t2", "m", "Thomas", "Lyle", 1927, "Perth", 1999, "Perth", { father: "p" }),
    per("r1", "f", "Ruth", "Lyle", 1930, "Perth", 2001, "Perth", { father: "p" }), per("r2", "f", "Ruth", "Lyle", 1930, "Perth", 2001, "Perth", { father: "p" }),
    per("lv", "f", "Liv", "Lyle", null, null, null, null, { father: "p", living: true })]) }, { places: [] });
  const a = arch("a", "#1B6E99", [per("p", "m", "Pat", "Lyle", 1900, "Perth", 1970, "Perth"),
    per("ta", "m", "Thomas", "Lyle", 1927, "Perth", 1999, "Perth", { father: "p" }), per("tb", "m", "Thomas", "Lyle", 1925, "Perth", 1990, "Perth", { father: "p" }), per("r", "f", "Ruth", "Lyle", 1930, "Perth", 2001, "Perth", { father: "p" })]);
  const M = TC.build(TCF.mergeAll([f, a])), R = go(M, "p", { a: "p" }), s = k => slotOf(R, M, k);
  assert.equal(s("you:t1").arch[1].i, at(M, "a:tb"), "Thomas 1925 pairs with Thomas 1925");
  assert.equal(s("you:t2").arch[1].i, at(M, "a:ta"), "Thomas 1927 pairs with Thomas 1927");
  assert.notEqual(s("you:r1"), s("you:r2"), "two entries for one Ruth stay two slots");
  assert.equal([s("you:r1"), s("you:r2")].filter(x => x.arch[1]).length, 1, "the archive's Ruth is claimed once");
  const lone = [s("you:r1"), s("you:r2")].find(x => !x.arch[1]); assert.ok(lone.dup != null && lone.state === "only-a", "the other is alone, flagged as a possible duplicate, not merged");
  assert.ok(!R.owner.has(at(M, "you:lv")), "a living person is never paired or drawn");
  /* a cycle ends */
  const c = arch("loop", "#1B6E99", [per("p", "m", "Pat", "Lyle", 1900, "Perth", 1970, "Perth", { father: "t1" }), per("t1", "m", "Thomas", "Lyle", 1925, "Perth", 1990, "Perth", { father: "p" })]);
  const Mc = TC.build(TCF.mergeAll([f, c])), Rc = go(Mc, "p", { loop: "p" });
  assert.ok(Rc.slots.length < 12, "a cycle ends: " + Rc.slots.length);
  /* an empty archive */
  const Me = TC.build(TCF.mergeAll([f, arch("none", "#000000", [])])), Re = TCP.pair(Me, { f: at(Me, "you:p"), a: {} });
  assert.equal(Re.slots[0].state, "only-a");
  /* a huge sibling set is capped, and said */
  const kids = [per("p", "m", "Pat", "Lyle", 1900, "Perth", 1970, "Perth")];
  for (let i = 0; i < 700; i++) kids.push(per("k" + i, i % 2 ? "f" : "m", "Kid" + i, "Lyle", 1920 + (i % 40), "Perth", 1990, "Perth", { father: "p" }));
  const Mb = TC.build(TCF.mergeAll([f, arch("big", "#1B6E99", kids)])), t0 = Date.now(), Rb = go(Mb, "p", { big: "p" });
  assert.ok(Date.now() - t0 < 5000 && Rb.capped && Rb.slots.length <= 300 && Rb.skipped > 0, "capped at " + Rb.slots.length + ", " + Rb.skipped + " left out");
});

test("mergeAll: several archives follow the file in order, and a two-corpus merge is the same thing", () => {
  const a = arch("one", "#111111", ONE()), b = arch("two", "#222222", TWO()), c = arch("three", "#333333", []);
  const m2 = TCF.merge(FILE(), a), m2b = TCF.mergeAll([FILE(), a]);
  assert.equal(JSON.stringify(m2), JSON.stringify(m2b));
  const m = TC.build(TCF.mergeAll([FILE(), a, b, c]));
  assert.deepEqual([...m.archives.map(x => x.k)], ["you", "one", "two", "three"]);
  assert.equal(m.P.filter(p => p.a === 1).length, 8); assert.equal(m.P.filter(p => p.a === 2).length, 4); assert.equal(m.P.filter(p => p.a === 3).length, 0);
  assert.ok(m.byKey.get("two:y5").f === at(m, "two:y3"), "relatives are re-pointed to the right archive's rows");
});

/* ---- what is kept ---- */
const KEYS = ["you:I5", "one:x5", "two:y5", "one:x3"];
test("the pairing choices are kept as opaque ids: no name, no date, no place, and only the choices", () => {
  const p = { on: true, ar: ["defranceski", "booyzen", "nonsense"], an: ["you:I5", "one:x5"], whole: 1, d: [["you:I3", "one:x3", "y"], ["you:I4", "two:ym", "n"], ["a", "b", "maybe"]] };
  const k = "l:https://x.example/tree.json", pr = W.packPairing(p, k);
  assert.deepEqual(pr.ar, ["defranceski", "booyzen"], "only the archives' public keys, and only real ones");
  assert.equal(pr.d.length, 2); assert.equal(pr.on, 1);
  const text = JSON.stringify(pr); assert.ok(!/Marlowe|Edric|I5|x5|you:|one:/.test(text), "no person key, and certainly no name, is in the record: " + text);
  const back = W.unpackPairing(pr, k, KEYS.concat(["you:I3", "one:x3", "you:I4", "two:ym"]));
  assert.deepEqual(back.an, ["you:I5", "one:x5"]); assert.equal(back.d.length, 2); assert.deepEqual(back.d[0], ["you:I3", "one:x3", "y"]); assert.equal(back.on, true);
  assert.deepEqual(W.unpackPairing(pr, k, ["unrelated:1"]).d, [], "a record made for another file brings nobody back");
  assert.equal(W.packPairing({ on: false, ar: ["booyzen"], an: [], d: [] }, k), null, "nothing chosen and not comparing: nothing kept");
  assert.equal(W.packPairing({ on: true, d: Array.from({ length: 900 }, (_, i) => ["a" + i, "b" + i, "y"]) }, k).d.length, W.MAX_PAIR_DEC, "capped (the newest are kept)");
});

test("saving the choices leaves the canvas arrangement alone, makes a record when there is none, and survives the six-word copy's strict cleaning unchanged", () => {
  const m = new Map(), st = { getItem: x => (m.has(x) ? m.get(x) : null), setItem: (x, v) => { m.set(x, String(v)); } };
  const src = { t: "link", ref: "https://x.example/tree.json" }, key = W.treeKey(src);
  assert.ok(W.savePairing(src, "tree.json", { on: true, ar: ["booyzen"], an: ["you:I5"], d: [["you:I3", "one:x3", "y"]] }, st, 1.7e12));
  let rec = W.get(key, st); assert.ok(rec && rec.w.pr && rec.n === 0 && rec.w.c.length === 0, "a record with the choices and no cards");
  const plain = { v: 1, cards: [["you:I5", 10, 20, 0, 0, 0, 0, 0, ""]], view: { x: 0, y: 0, k: 1 }, decisions: [], opts: {}, filter: [0] };
  const withCards = W.makeRecord(src, "tree.json", plain, 1.7e12 + 1000); withCards.w.pr = rec.w.pr; assert.ok(W.put(withCards, st));
  assert.ok(W.savePairing(src, "tree.json", { on: false, ar: ["booyzen"], an: [], d: [["you:I3", "one:x3", "y"]] }, st, 1.7e12 + 2000));
  rec = W.get(key, st); assert.equal(rec.w.c.length, 1, "the cards stay as they were"); assert.equal(rec.w.pr.on, 0, "stopped comparing; the choice itself stays");
  assert.ok(W.savePairing(src, "tree.json", { on: false, d: [] }, st, 1.7e12 + 3000)); assert.equal(W.get(key, st).w.pr, undefined, "no choices left: the field goes");
  /* through the research file: the same record comes out unchanged, a bad one loses the bad part */
  W.savePairing(src, "tree.json", { on: true, ar: ["booyzen", "luwinski"], an: ["you:I5", "one:x5"], whole: 1, d: [["you:I3", "one:x3", "y"], ["you:I4", "two:ym", "n"]] }, st, 1.7e12 + 4000);
  const rec2 = W.get(key, st), clean = RF.cleanCanvas({ v: 1, items: { [key]: rec2 }, gone: {} });
  assert.deepEqual(clean.items[key].w.pr, rec2.w.pr, "a record made here passes the strict check unchanged");
  const dirty = JSON.parse(JSON.stringify(rec2)); dirty.w.pr.d.push(["Edric Marlowe", "x", "y"], ["ab", "cd", "maybe"]); dirty.w.pr.an.push("<script>"); dirty.w.pr.ar.push("evil.example", "booyzen");
  const cl = RF.cleanCanvas({ v: 1, items: { [key]: dirty }, gone: {} }).items[key].w.pr;
  assert.equal(cl.d.length, 2, "names and unknown answers are dropped"); assert.deepEqual(cl.ar, ["booyzen", "luwinski"], "unknown and repeated archives are dropped"); assert.equal(cl.an.length, 2);
  const huge = JSON.parse(JSON.stringify(rec2)); huge.w.pr.d = Array.from({ length: 5000 }, (_, i) => [("a" + i).slice(0, 16), ("b" + i).slice(0, 16), "y"]);
  assert.equal(RF.cleanCanvas({ v: 1, items: { [key]: huge }, gone: {} }).items[key].w.pr.d.length, 400, "at most 400 choices");
  /* the whole record, at the caps, is far inside the item and total limits (the six-word copy refuses more than 2 MB) */
  assert.ok(JSON.stringify(RF.cleanCanvas({ v: 1, items: { [key]: huge }, gone: {} })).length < 40000);
  assert.equal(RF.mergeCanvas({ v: 1, items: { [key]: rec2 }, gone: {} }, null).items[key].w.pr.on, 1, "it merges between devices with the rest of the record");
});

/* ---- reading several archives ---- */
test("several archives are read a few at a time; one failing, or taking too long, never stops the others, and is named", async () => {
  let live = 0, peak = 0; const asked = [];
  const readOne = async (k) => { asked.push(k); live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 15)); live--; if (k === "luwinski") throw new Error("HTTP 503"); if (k === "falco") await new Promise(() => {}); return { key: k }; };
  const cache = new Map(), done = [];
  const r = await CS.loadSet(["mazza", "defranceski", "luwinski", "falco", "booyzen", "nonsense", "defranceski"], readOne, { concurrency: 3, timeoutMs: 120, cache, onProgress: (d, n) => done.push([d, n]) });
  assert.deepEqual(r.ok.map(x => x.key), ["defranceski", "booyzen", "mazza"], "the archives' own order, once each, only real ones");
  assert.deepEqual(r.failed.map(x => [x.key, x.why]), [["luwinski", "HTTP 503"], ["falco", "took too long"]], "each failure is named with its reason; none is reported as empty");
  assert.ok(peak <= 3, "at most three at once (" + peak + ")"); assert.equal(done.length, 5); assert.deepEqual(done[done.length - 1], [5, 5]);
  assert.deepEqual([...cache.keys()].sort(), ["booyzen", "defranceski", "mazza"], "only what was read is remembered");
  asked.length = 0; const r2 = await CS.loadSet(["defranceski", "booyzen"], readOne, { cache });
  assert.equal(asked.length, 0, "an archive already read this visit is not read again"); assert.ok(r2.ok.every(x => x.cached));
  const none = await CS.loadSet(["luwinski"], async () => { throw new Error("offline"); }, {}); assert.equal(none.ok.length, 0); assert.equal(none.failed[0].why, "offline");
  const empty = await CS.loadSet([], readOne, {}); assert.deepEqual([empty.ok, empty.failed], [[], []]);
});

test("the Compare page code does not widen what leaves the browser", () => {
  const app = read("../public/tree-canvas/app.js"), pairsUi = TPL;
  assert.ok(!/fetch\([^)]*(tree|people|gedcom)/i.test(app.split("async function compareWith")[1].split("addEventListener('message'")[0]), "compareWith sends nothing about the file");
  assert.ok(/credentials: 'omit', referrerPolicy: 'no-referrer', signal/.test(app), "archives are still read with no credentials and no referrer");
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(pairsUi.slice(pairsUi.indexOf("const PAIRFILE"), pairsUi.indexOf("const PAIRFILE") + 30000).split("function prBoot")[0]), "the pairing UI keeps nothing itself: the page around it does, hashed");
  assert.ok(/connect-src 'self'; form-action/.test(read("../../scripts/build-roots-data.py")), "the canvas frame's CSP is unchanged: it reads this site only");
});

test("compare: a living archive person of the same name is named in the empty place, never compared", () => {
  const i = TPL.indexOf("const prLivingTwin"), j = TPL.indexOf("};\n", i) + 3;
  assert.ok(i > 0, "the helper is in the page");
  const fold = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const M = { P: [{ a: 0, name: "David Ivan Defranceski" }, { a: 1, name: "David Defranceski", living: true }, { a: 1, name: "David Smith", living: true }, { a: 2, name: "Anna Kalanj" }] };
  const twin = new Function("TC", "M", TPL.slice(i, j) + "; return prLivingTwin;")({ fold }, M);
  assert.equal(twin(M.P[0]), M.P[1], "first name and surname match a living archive entry");
  assert.equal(twin(M.P[3]), null, "no living entry of that name");
  assert.equal(twin({ name: "David" }), null, "a single word is not enough to name anyone");
  assert.match(TPL, /a living person of this name is in the archive: not compared/);
});

test("compare: a start of two generations back, a Back choice, and Arrange that brings back only the cards still on the canvas", () => {
  const M = build([arch("one", "#1B6E99", ONE()), arch("two", "#2E8B57", TWO())]);
  const all = go(M, "I5", { one: "x5", two: "y5" }), one = go(M, "I5", { one: "x5", two: "y5" }, { up: 1 });
  assert.ok(one.slots.every(s => s.gen >= -1), "up: 1 stops at the parents");
  assert.ok(all.slots.some(s => s.gen <= -2) && one.slots.length < all.slots.length, "the default walk goes further back than one generation");
  assert.match(TPL, /whole: false, up: 2,/, "Compare starts two generations back");
  assert.match(TPL, /data-pr-up="\$\{n\}"/, "the Back choices are buttons");
  assert.match(TPL, /prDraw\(\{ fit: true, keep: keep\.size \? keep : null \}\)/, "Arrange keeps to the cards on the canvas");
  assert.match(TPL, /\(!keep \|\| keep\.has\(M\.P\[s\.f\]\.key\)\)/, "each side is drawn only if its card is still there");
});
