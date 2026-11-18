/* The Tree Canvas's saved work: what is kept per tree, that it holds no name, that it passes through the research file and the six-word copy, and that the pages say so.
   Every id, name and address in these fixtures is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as W from "../public/tree-canvas/work.js";
import worker from "../../workers/sync/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p), "utf8");
const load = f => { const m = { exports: {} }; new Function("module", read("../public/js/" + f))(m); return m.exports; };
const RF = load("research-file.js"), SY = load("research-sync.js");

const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m }; };
const NAMES = ["Anna-Kosina-1890", "Petar-Marlowe-1860", "Ivan-Example-1901"];     // ids that spell a name, as an archive's slugs do
const plain = (n = 3) => ({
  v: 1, cards: NAMES.slice(0, n).map((k, i) => ["defranceski:" + k, 100 + i * 220, 40, i === 0 ? 1 : 0, 1, 0, 0, 0, i ? "defranceski:" + NAMES[0] : ""]),
  view: { x: -50.4, y: 12, k: 0.8 }, decisions: [["defranceski:" + NAMES[0] + "|booyzen:b1", "confirmed"]], opts: { stopAtNotProven: true, suggested: true, gens: false },
  path: ["defranceski:" + NAMES[0], "defranceski:" + NAMES[1]], filter: [0, 1],
});
const known = () => NAMES.map(k => "defranceski:" + k).concat(["defranceski:someone-else"]);
const bridges = () => ["defranceski:" + NAMES[0] + "|booyzen:b1"];
const LINK = "https://raw.githubusercontent.com/example/family/main/tree.json";

test("a tree is told apart by its link, its archive, or its file's name, size and people; the invented example has none", () => {
  assert.equal(W.treeKey({ t: "link", ref: LINK + "#frag" }), "l:" + LINK);
  assert.equal(W.treeKey({ t: "archive", ref: "booyzen" }), "a:booyzen");
  assert.equal(W.treeKey({ t: "file", ref: "family.ged", size: 1234, people: 56 }), "f:family.ged|1234|56");
  assert.notEqual(W.treeKey({ t: "file", ref: "family.ged", size: 1235, people: 56 }), W.treeKey({ t: "file", ref: "family.ged", size: 1234, people: 56 }), "a different file of the same name is another tree");
  for (const bad of [null, {}, { t: "link", ref: "http://example.com/x.json" }, { t: "link", ref: "javascript:alert(1)" }, { t: "archive", ref: "nobody" }, { t: "file", ref: "" }]) assert.equal(W.treeKey(bad), null);
});

test("a record holds the arrangement and the source, and no id, name or place from the tree", () => {
  const rec = W.makeRecord({ t: "link", ref: LINK }, W.linkLabel(LINK), plain(), Date.parse("2026-11-18T10:00:00Z"));
  const text = JSON.stringify(rec);
  for (const n of NAMES) assert.equal(text.includes(n), false, n);
  assert.equal(text.includes("defranceski"), false, "not even the archive prefix of an id");
  assert.equal(rec.k, "l:" + LINK); assert.equal(rec.n, 3); assert.equal(rec.upd, "2026-11-18T10:00:00.000Z");
  assert.equal(rec.label, "raw.githubusercontent.com / tree.json");
  assert.deepEqual(rec.w.c[0].slice(1, 4), [100, 40, 1]); assert.equal(rec.w.view.x, -50); assert.equal(rec.w.path.length, 2); assert.equal(rec.w.dec.length, 1);
  assert.ok(rec.w.c.every(r => /^[0-9a-z]{1,16}$/.test(r[0])));
});

test("the same tree brings its people back; another tree, or a file with other ids, brings nobody", () => {
  const key = "l:" + LINK, w = W.pack(plain(), key), back = W.unpack(w, key, known(), bridges());
  assert.deepEqual(back.cards.map(r => r[0]), NAMES.map(k => "defranceski:" + k));
  assert.equal(back.cards[2][8], "defranceski:" + NAMES[0]); assert.deepEqual(back.path, ["defranceski:" + NAMES[0], "defranceski:" + NAMES[1]]);
  assert.deepEqual(back.decisions, [["defranceski:" + NAMES[0] + "|booyzen:b1", "confirmed"]]); assert.equal(back.matched, 3); assert.equal(back.of, 3);
  assert.equal(W.unpack(w, "l:https://other.example/x.json", known(), bridges()).matched, 0, "the key salts the hashes: a record means nothing under another tree");
  assert.equal(W.unpack(w, key, ["defranceski:stranger"], []).matched, 0);
  assert.equal(W.unpack(w, key, known().slice(0, 2), bridges()).cards.length, 2, "people no longer in the file are dropped, the rest stay");
  assert.equal(W.unpack(null, key, known(), []), null); assert.equal(W.unpack({ v: 2 }, key, known(), []), null);
});

test("the store keeps a record per tree, newest first, twelve at most, and a removal is dated", () => {
  const st = memStore();
  assert.deepEqual(W.list(st), []);
  for (let i = 0; i < 14; i++) W.put(W.makeRecord({ t: "file", ref: "f" + i + ".ged", size: 10, people: 3 }, "f" + i, plain(), Date.parse("2026-11-01T00:00:00Z") + i * 1000), st);
  const l = W.list(st); assert.equal(l.length, 12); assert.equal(l[0].label, "f13"); assert.equal(l[11].label, "f2");
  const k = l[0].k; W.remove(k, st, Date.parse("2026-11-20T00:00:00Z"));
  assert.equal(W.get(k, st), null); assert.ok(JSON.parse(st.getItem(W.KEY)).gone[k]);
  W.put(W.makeRecord({ t: "file", ref: "f13.ged", size: 10, people: 3 }, "f13", plain(), Date.parse("2026-11-21T00:00:00Z")), st);
  assert.ok(W.get(k, st), "saving again after a removal brings it back and clears the tombstone"); assert.equal(JSON.parse(st.getItem(W.KEY)).gone[k], undefined);
  assert.equal(W.put({ k: "x" }, { getItem() { return null; }, setItem() { throw new Error("blocked"); } }), false, "blocked storage says so, and throws nothing");
  assert.deepEqual(W.list({ getItem() { throw new Error("blocked"); } }), []);
});

test("what this page writes is exactly what the research file accepts: no field is lost or invented", () => {
  const recs = [W.makeRecord({ t: "link", ref: LINK }, "a", plain(), 1.7e12), W.makeRecord({ t: "archive", ref: "mazza" }, "Mazza archive", plain(2), 1.7e12 + 1000), W.makeRecord({ t: "file", ref: "my family.ged", size: 99, people: 12 }, "my family.ged", plain(1), 1.7e12 + 2000)];
  const store = { v: 1, items: Object.fromEntries(recs.map(r => [r.k, r])), gone: {} };
  const clean = RF.cleanCanvas(JSON.parse(JSON.stringify(store)));
  assert.deepEqual(clean, store);
});

test("the research file carries the canvas, reads it back, counts it, and an older file with none is unchanged", () => {
  const rec = W.makeRecord({ t: "link", ref: LINK }, "x", plain(), 1.7e12), canvas = { v: 1, items: { [rec.k]: rec }, gone: {} };
  const prog = { v: 1, active: "k", lines: { k: { name: "K", where: "", made: "2026-10-01" } }, marks: { "volume:A": { t: "T", where: "W", by: { k: { done: [[1, 2]] } } } } };
  const f = RF.buildBackup(prog, {}, undefined, { canvas });
  assert.deepEqual(Object.keys(f.canvas.items), [rec.k]); assert.equal(RF.summary(f).canvases, 1);
  assert.deepEqual(RF.parseAny(JSON.stringify(f)).canvas.items[rec.k], rec);
  const none = RF.buildBackup(prog, {});
  assert.equal("canvas" in none, false); assert.equal(RF.parseAny(JSON.stringify(none)).canvas, null); assert.equal(RF.summary(none).canvases, 0);
  assert.equal("canvas" in RF.buildBackup(prog, {}, undefined, { canvas: { v: 1, items: {}, gone: {} } }), false);
  assert.ok(RF.parseAny(JSON.stringify({ ...none, canvas: "junk" })).canvas === null, "a damaged canvas section is ignored, the research still opens");
});

test("anything arriving from outside is checked: a wrong key, an insecure link, extra fields and odd numbers are dropped or cleaned", () => {
  const good = W.makeRecord({ t: "link", ref: LINK }, "x", plain(), 1.7e12), mk = o => ({ v: 1, items: { [o.k]: o }, gone: {} });
  const bad = [{ ...good, k: "l:https://other.example/x" }, { ...good, src: { t: "link", ref: "http://x.example/y" }, k: "l:http://x.example/y" }, { ...good, upd: "yesterday" },
    { ...good, w: { ...good.w, c: [["Anna Kosina", 1, 2, 0, 0, 0, 0, 0, ""]] } }, { ...good, src: { t: "link", ref: "https://x.example/<script>" }, k: "l:https://x.example/<script>" }];
  for (const b of bad) { const c = RF.cleanCanvas(mk(b)); assert.deepEqual(c.items, b === bad[3] ? { [good.k]: { ...good, n: 0, w: { ...good.w, c: [] } } } : {}, JSON.stringify(b).slice(0, 80)); }
  const odd = JSON.parse(JSON.stringify(good)); odd.w.c[0][1] = 1e12; odd.w.c[0][2] = "x"; odd.w.view.k = 999; odd.evil = { name: "Anna" }; odd.w.extra = "Anna";
  const c = RF.cleanCanvas(mk(odd)).items[good.k];
  assert.equal(c.w.c[0][1], 1e6); assert.equal(c.w.c[0][2], 0); assert.equal(c.w.view.k, 8); assert.equal("evil" in c, false); assert.equal("extra" in c.w, false);
  assert.equal(RF.cleanCanvas({ v: 2, items: {} }), null);
});

test("two devices merge by tree: the later save wins, a deletion is not undone by an older copy, the newest twelve stay", () => {
  const mk = (ref, ms) => W.makeRecord({ t: "link", ref: "https://x.example/" + ref }, ref, plain(), ms);
  const a = { v: 1, items: {}, gone: {} }, b = { v: 1, items: {}, gone: {} };
  const old = mk("a", 1.7e12), newer = mk("a", 1.7e12 + 5000), only = mk("b", 1.7e12 + 1);
  a.items[old.k] = old; b.items[newer.k] = newer; b.items[only.k] = only;
  const m = RF.mergeCanvas(a, b); assert.equal(m.items[old.k].upd, newer.upd); assert.ok(m.items[only.k]);
  assert.equal(RF.mergeCanvas(b, a).items[old.k].upd, newer.upd, "order does not matter");
  const del = { v: 1, items: {}, gone: { [newer.k]: new Date(1.7e12 + 9000).toISOString() } };
  const after = RF.mergeCanvas(m, del); assert.equal(after.items[newer.k], undefined); assert.ok(after.items[only.k]);
  assert.equal(RF.mergeCanvas(after, a).items[old.k], undefined, "the other device still has it, last changed before the deletion: it stays deleted");
  const many = { v: 1, items: {}, gone: {} }; for (let i = 0; i < 20; i++) { const r = mk("m" + i, 1.7e12 + i * 1000); many.items[r.k] = r; }
  assert.equal(Object.keys(RF.mergeCanvas(many, null).items).length, 12);
});

test("the six-word copy has a ceiling, so the canvas section is capped, newest first, and says what did not fit", () => {
  const big = { v: 1, items: {}, gone: {} };
  const manyNames = Array.from({ length: 3000 }, (_, i) => "defranceski:p" + i);
  for (let i = 0; i < 12; i++) { const p = { ...plain(), cards: manyNames.map((k, j) => [k, j * 3, i, 0, 1, 1, 0, 0, ""]), path: null, decisions: [] }; const r = W.makeRecord({ t: "link", ref: "https://x.example/t" + i }, "t" + i, p, 1.7e12 + i * 1000); big.items[r.k] = r; }
  const cap = RF.capCanvas(RF.cleanCanvas(big)), n = Object.keys(cap.items).length;
  assert.ok(n > 0 && n < 12, "some fit and some do not: " + n); assert.equal(cap.skipped.length, 12 - n);
  assert.ok(JSON.stringify(cap).length <= RF.CANVAS_TOTAL_CHARS + 2000);
  assert.ok(Object.keys(cap.items).every(k => !cap.skipped.includes(k)) && cap.items["l:https://x.example/t11"], "the newest is in, the oldest are the ones left out");
});

/* ---- through the real server code, in memory ---- */
function fakeR2() {
  const m = new Map(); let n = 0;
  const wrap = (key, v) => ({ key, size: v.bytes.length, uploaded: v.uploaded, customMetadata: v.customMetadata, httpMetadata: v.httpMetadata, arrayBuffer: async () => v.bytes.slice().buffer, json: async () => JSON.parse(new TextDecoder().decode(v.bytes)) });
  return { _m: m, async put(key, value, o) { if (o && o.onlyIf && o.onlyIf.etagDoesNotMatch === "*" && m.has(key)) return null; const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value); m.set(key, { bytes, uploaded: new Date(Date.now() + ++n), customMetadata: o && o.customMetadata, httpMetadata: o && o.httpMetadata }); return { key }; },
    async get(key) { return m.has(key) ? wrap(key, m.get(key)) : null; }, async delete(keys) { for (const k of [].concat(keys)) m.delete(k); },
    async list({ prefix = "", cursor, limit = 1000 } = {}) { const all = [...m.keys()].filter(k => k.startsWith(prefix)).sort(), start = cursor ? Number(cursor) : 0; return { objects: all.slice(start, start + limit).map(k => wrap(k, m.get(k))), truncated: start + limit < all.length, cursor: String(start + limit) }; } };
}
test("a canvas saved on one device comes back on another from the six words alone, and the server holds nothing readable", async () => {
  const env = { SYNC: fakeR2(), COPY: fakeR2(), ALLOW_ORIGINS: "https://recordatlas.org" };
  const opts = { base: "https://sync.test", fetch: async (url, init = {}) => worker.fetch(new Request(url, { ...init, headers: { Origin: "https://recordatlas.org", ...(init.headers || {}) } }), env) };
  const words = JSON.parse(read("../public/sync-words.json")).words, phrase = SY.makePassphrase(words), keys = await SY.deriveKeys(phrase, { iterations: 1000 });
  const rec = W.makeRecord({ t: "link", ref: LINK }, "x", plain(), 1.7e12), prog = { v: 1, active: "k", lines: { k: { name: "K", where: "", made: "2026-10-01" } }, marks: { "volume:A": { t: "T", where: "W", by: { k: { done: [[1, 2]] } } } } };
  const file = RF.buildBackup(prog, {}, undefined, { canvas: { v: 1, items: { [rec.k]: rec }, gone: {} } });
  await SY.push(keys, JSON.stringify(file), opts);
  for (const [, v] of env.SYNC._m) { const t = new TextDecoder("utf-8", { fatal: false }).decode(v.bytes); assert.equal(t.includes("raw.githubusercontent"), false); assert.equal(t.includes(NAMES[0]), false); }
  const got = await SY.pull(await SY.deriveKeys(phrase, { iterations: 1000 }), opts);
  const second = RF.parseAny(got.text).canvas;       // the other device merges it into an empty store
  const merged = RF.mergeCanvas({ v: 1, items: {}, gone: {} }, second);
  assert.deepEqual(merged.items[rec.k], rec);
  assert.equal(W.unpack(merged.items[rec.k].w, rec.k, known(), bridges()).matched, 3);
});

/* ---- the pages ---- */
test("the opening page has the Keep your work button and it goes to Connection & Backup, with the site's own base", () => {
  const html = read("../src/pages/tree-canvas/index.astro");
  assert.match(html, /id="stKeepBtn"[^>]*href=\{u\("\/backup\/#canvas"\)\}/);
  assert.ok(html.includes("Keep your work") && html.includes('id="stKeepSt"') && html.includes('id="stWork"'));
  assert.equal(/href="https?:\/\/(www\.)?recordatlas\.org/.test(html.split("---")[2] || html), false, "no hard-coded host");
  assert.ok(html.includes('import { u } from "../../lib/url.js"'));
});

test("Connection & Backup explains the canvas: what is kept, what is not, the six words, and how to start fresh; and it counts them", () => {
  const b = read("../src/pages/backup.astro");
  assert.ok(b.includes('id="canvas"') && b.includes("Your Tree Canvas"));
  for (const t of ["What is kept", "What is not kept", "never uploaded", "same six words", "no email, no account", "whoever has the six words can open it", "Start fresh", "opened again"]) assert.ok(b.includes(t) || b.toLowerCase().includes(t.toLowerCase()), t);
  assert.ok(b.includes('id="bk-k-canvas"') && b.includes("sm.canvases"));
});

test("the page's security policy did not widen, the canvas's own did not change, and the canvas hands over its state in memory only", () => {
  const html = read("../src/pages/tree-canvas/index.astro"), csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https: https:\/\/archive\.defranceski\.com/);
  assert.equal(/unsafe/.test(csp), false);
  const py = fs.readFileSync(path.join(here, "../../scripts/build-roots-data.py"), "utf8");
  assert.ok(py.includes("script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; \"\n           \"font-src data:; connect-src 'self'; form-action 'none'; base-uri 'none'"));
  const canvas = read("../../scripts/roots/tree-canvas.template.html");
  assert.ok(canvas.includes("tcWork") && canvas.includes("tcRestored") && canvas.includes("Keep your work"));
  assert.equal(/fetch\([^)]*sync\.recordatlas/.test(canvas), false, "the canvas never talks to the sync server; the page around it does");
});
