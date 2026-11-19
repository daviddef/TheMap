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

/* ---- named views and share links ---- */
const ARCH = { t: "archive", ref: "defranceski" };
const vplain = (n = 3) => ({ ...plain(n), look: "paper" });

test("a named view is a record of its own: the arrangement, a name and a look, with no name from the tree, and it is kept apart from the tree's last canvas", () => {
  const st = memStore(), v = W.makeView(ARCH, "Defranceski archive", vplain(), "  Nonna <b>and</b>\nher line ", Date.parse("2026-11-18T10:00:00Z"), "abc123");
  assert.equal(v.k, "v:abc123"); assert.equal(v.tk, "a:defranceski"); assert.equal(v.name, "Nonna and her line"); assert.equal(v.n, 3); assert.equal(v.w.look, "paper");
  const text = JSON.stringify(v); for (const n of NAMES) assert.equal(text.includes(n), false, n); assert.equal(text.includes("defranceski:"), false);
  assert.equal(W.putView(v, st), true);
  assert.equal(W.list(st).length, 0, "a view is not one of the trees' canvases");
  assert.equal(W.listViews(st).length, 1); assert.equal(W.listViews(st, "a:booyzen").length, 0); assert.equal(W.listViews(st, "a:defranceski")[0].name, v.name);
  const d = W.unpack(W.listViews(st)[0].w, "a:defranceski", known(), bridges()); assert.equal(d.cards.length, 3); assert.equal(d.look, "paper"); assert.deepEqual(d.view, { x: -50, y: 12, k: 0.8 });
  assert.equal(W.unpack(v.w, "a:booyzen", known(), bridges()).cards.length, 0, "another tree's key matches nobody");
  assert.equal(W.makeView({ t: "archive", ref: "nobody" }, "", vplain(), "x"), null); assert.equal(W.makeView(ARCH, "", { cards: [] }, "x"), null, "an empty canvas is not a view");
  assert.equal(W.pack(plain(), "a:x").look, undefined, "a tree's own record carries no look: it is unchanged");
  assert.equal(W.pack({ ...plain(), look: "evil" }, "a:x").look, undefined);
});

test("a tree keeps twelve views, forty in all; rename and delete work and a deletion is dated", () => {
  const st = memStore();
  for (let i = 0; i < 12; i++) assert.equal(W.putView(W.makeView(ARCH, "", vplain(), "v" + i, 1.7e12 + i * 1000, "id" + i), st), true);
  assert.equal(W.putView(W.makeView(ARCH, "", vplain(), "one too many", 1.8e12, "idx"), st), "full");
  const again = W.makeView(ARCH, "", vplain(), "v3 again", 1.8e12, "id3"); assert.equal(W.putView(again, st), true, "replacing one's own is fine"); assert.equal(W.listViews(st).length, 12);
  assert.equal(W.putView(W.makeView({ t: "archive", ref: "mazza" }, "", vplain(), "other tree", 1.8e12, "mz1"), st), true);
  assert.equal(W.renameView("v:id1", "  Renamed ", st, 1.9e12), true); assert.equal(W.get("v:id1", st).name, "Renamed"); assert.equal(W.listViews(st)[0].name, "Renamed", "the newest change is first");
  W.remove("v:id1", st, 2e12); assert.equal(W.get("v:id1", st), null); assert.ok(W.readStore(st).gone["v:id1"]);
  const many = memStore(); for (let i = 0; i < 4; i++) for (let j = 0; j < 12; j++) W.putView(W.makeView({ t: "link", ref: "https://x.example/t" + i }, "", vplain(), "n", 1.7e12 + i * 1e6 + j, "k" + i + "x" + j), many);
  assert.equal(W.listViews(many).length, 40, "forty views in all, the oldest dropped");
});

test("views pass the six-word copy's cleaning and merge like canvases: later change wins, a deletion stays, extras are dropped, the tree's twelve are not crowded out", () => {
  const v = W.makeView(ARCH, "Defranceski archive", vplain(), "Line", 1.7e12, "abc"), mk = o => ({ v: 1, items: { [o.k]: o }, gone: {} });
  assert.deepEqual(RF.cleanCanvas(mk(v)).items[v.k], v, "a view made here passes unchanged");
  const odd = JSON.parse(JSON.stringify(v)); odd.name = "<img src=x>\u0000Line"; odd.evil = "Anna"; odd.w.look = "neon"; const c = RF.cleanCanvas(mk(odd)).items[v.k];
  assert.equal(c.name, "Line"); assert.equal("evil" in c, false); assert.equal("look" in c.w, false);
  for (const bad of [{ ...v, tk: "a:booyzen" }, { ...v, k: "v:UPPER" }, { ...v, tk: undefined }, { ...v, src: { t: "link", ref: "http://x.example/y" } }]) assert.deepEqual(RF.cleanCanvas(mk(bad)).items, {});
  const old = { ...v, upd: "2026-01-01T00:00:00.000Z" }, newer = { ...v, name: "Newer", upd: "2026-02-01T00:00:00.000Z" };
  assert.equal(RF.mergeCanvas(mk(old), mk(newer)).items[v.k].name, "Newer");
  const del = { v: 1, items: {}, gone: { [v.k]: "2026-03-01T00:00:00.000Z" } }; assert.equal(RF.mergeCanvas(mk(newer), del).items[v.k], undefined);
  const mix = { v: 1, items: {}, gone: {} };
  for (let i = 0; i < 12; i++) { const r = W.makeRecord({ t: "link", ref: "https://x.example/m" + i }, "m", plain(), 1.7e12 + i); mix.items[r.k] = r; }
  for (let i = 0; i < 45; i++) { const r = W.makeView({ t: "link", ref: "https://x.example/m" + (i % 12) }, "m", vplain(), "n", 1.8e12 + i, "q" + i); mix.items[r.k] = r; }
  const m = RF.mergeCanvas(mix, null), keys = Object.keys(m.items);
  assert.equal(keys.filter(k => k.startsWith("v:")).length, 40); assert.equal(keys.filter(k => !k.startsWith("v:")).length, 12, "views do not push the trees out");
});

test("a share link carries the layout, the name and the source and nothing from the tree, survives the round trip, and refuses anything damaged or oversize", async () => {
  const v = W.makeView(ARCH, "Defranceski archive", vplain(), "Our line", 1.7e12, "abc"), code = await W.shareEncode(v);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/, "safe in a #fragment"); for (const n of NAMES) assert.equal(code.includes(n), false);
  const back = await W.shareDecode(code); assert.equal(back.name, "Our line"); assert.equal(back.tk, "a:defranceski"); assert.deepEqual(back.src, ARCH); assert.deepEqual(back.w, v.w);
  assert.equal(W.unpack(back.w, back.tk, known(), bridges()).cards.length, 3, "the person on the other side, with the same tree, gets the same people");
  assert.equal(W.unpack(back.w, back.tk, ["defranceski:not-in-the-tree"], []).cards.length, 0);
  const plainCode = "j" + Buffer.from(JSON.stringify({ v: 1, n: "x", s: ARCH, w: v.w })).toString("base64url"); assert.equal((await W.shareDecode(plainCode)).name, "x", "an uncompressed link is read too");
  for (const bad of ["", "z", "x123", "zAAAA", "j" + Buffer.from("{}").toString("base64url"), "j" + Buffer.from(JSON.stringify({ v: 1, n: "x", s: { t: "link", ref: "http://x.example/y" }, w: v.w })).toString("base64url"),
    "j" + Buffer.from(JSON.stringify({ v: 1, n: "x", s: ARCH, w: { v: 1, c: [] } })).toString("base64url"), "j" + "A".repeat(10), 5, null, "z" + "A".repeat(500000)]) assert.equal(await W.shareDecode(bad), null, String(bad).slice(0, 30));
  const odd = JSON.parse(JSON.stringify(v.w)); odd.c[0][1] = 1e12; odd.view.k = 999; odd.look = "evil"; odd.zz = "Anna";
  const o = await W.shareDecode("j" + Buffer.from(JSON.stringify({ v: 1, n: "<b>Hi</b>", s: ARCH, w: odd })).toString("base64url"));
  assert.equal(o.w.c[0][1], 1e6); assert.equal(o.w.view.k, 8); assert.equal("look" in o.w, false); assert.equal("zz" in o.w, false); assert.equal(o.name, "Hi");
  const bomb = Buffer.from(await new Response(new Blob(["A".repeat(2e6)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()).toString("base64url");
  assert.equal(await W.shareDecode("z" + bomb), null, "a link that unpacks to more than the limit is refused");
});

test("the page hands the canvas the views API, takes a shared link out of the address bar, and never writes a shared view over the visitor's own canvas", () => {
  const app = read("../public/tree-canvas/app.js");
  assert.match(app, /views: viewsApi/); assert.match(app, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  assert.match(app, /if \(cur\.paused \|\| cur\.shared\) return;/); assert.match(app, /c\.paused \|\| c\.shared/);
  assert.match(app, /Nothing has been fetched: press Open link/, "a link tree is not fetched without a press, as before");
  const cv = read("../../scripts/roots/tree-canvas.template.html");
  assert.match(cv, /id="bViews"/); assert.match(cv, /if \(d && d\.look\) setTheme\(d\.look\)/);
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
  assert.ok(html.includes("Keep your work") && html.includes('id="stKeepSt"') && html.includes('id="stRecent"') && !html.includes('id="stWork"'), "one list of trees: the saved views are nested under their tree, not a list of their own");
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
  assert.match(csp, /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:\/\/server\.arcgisonline\.com; connect-src 'self' https: https:\/\/archive\.defranceski\.com/);   // Compass's map tiles are the one widening: the tile host, for images only
  assert.equal(/unsafe/.test(csp), false);
  const py = fs.readFileSync(path.join(here, "../../scripts/build-roots-data.py"), "utf8");
  assert.ok(py.includes("script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; \"\n           \"font-src data:; connect-src 'self'; form-action 'none'; base-uri 'none'"));
  const canvas = read("../../scripts/roots/tree-canvas.template.html");
  assert.ok(canvas.includes("tcWork") && canvas.includes("tcRestored") && canvas.includes("Keep your work"));
  assert.equal(/fetch\([^)]*sync\.recordatlas/.test(canvas), false, "the canvas never talks to the sync server; the page around it does");
});

test("the opening page's list: a card per tree, its views nested under it, a view can be renamed and noted", async () => {
  const st = memStore(), F = { t: "file", ref: "family.ged", size: 900, people: 3 }, L = { t: "link", ref: "https://x.example/t.ged#frag" };
  W.put(W.makeRecord(F, "family.ged", plain(), 1.7e12 + 5), st);
  W.putView(W.makeView(F, "", vplain(), "Mum's side", 1.7e12 + 9, "v1"), st); W.putView(W.makeView(F, "", vplain(), "Dad's side", 1.7e12 + 7, "v2"), st);
  W.putView(W.makeView(ARCH, "Defranceski archive", vplain(), "Line", 1.7e12 + 8, "v3"), st);
  W.putView(W.makeView(L, "", vplain(), "Linked", 1.7e12 + 2, "v4"), st);
  const kept = [{ name: "family.ged", when: 1.7e12 + 6, people: 3 }, { name: "t.ged", url: "https://x.example/t.ged#frag", when: 1.7e12 + 1 }, { name: "lonely.ged", when: 1.7e12 }];
  const g = W.groupTrees(kept, W.list(st), W.listViews(st)), by = id => g.find(x => x.id === id);
  assert.deepEqual(g.map(x => x.id), ["file:family.ged", "archive:defranceski", "link:https://x.example/t.ged", "file:lonely.ged"], "newest first: the file's newest work was a view at +9");
  assert.deepEqual(by("file:family.ged").views.map(v => v.name), ["Mum's side", "Dad's side"], "its views, newest first, under the kept file");
  assert.ok(by("file:family.ged").kept && by("file:family.ged").canvas, "the kept file and its last canvas are one card");
  assert.equal(by("archive:defranceski").kept, null); assert.equal(by("archive:defranceski").label, "Defranceski archive");
  assert.equal(by("link:https://x.example/t.ged").kept.name, "t.ged", "a file fetched from a link is that link's card, with its views");
  assert.equal(by("link:https://x.example/t.ged").views.length, 1);
  assert.equal(by("file:lonely.ged").views.length, 0);
  assert.equal(W.groupTrees([], [], []).length, 0);
  assert.equal(W.groupTrees(kept, [], W.listViews(st)).find(x => x.id === "file:family.ged").canvas, null, "no canvas is fine");
  /* rename and note */
  assert.equal(W.editView("v:v1", { name: " Mum's  side ", note: "<b>Tennessee</b> branch only" }, st, 1.9e12), true);
  const v = W.get("v:v1", st); assert.equal(v.name, "Mum's side"); assert.equal(v.note, "Tennessee branch only"); assert.equal(v.upd, new Date(1.9e12).toISOString());
  assert.equal(W.editView("v:v1", { note: "" }, st, 1.9e12 + 1), true); assert.equal("note" in W.get("v:v1", st), false, "an empty note clears it");
  assert.equal(W.editView("v:v1", { name: "   " }, st), true); assert.equal(W.get("v:v1", st).name, "Mum's side", "an empty name keeps the old one");
  assert.equal(W.editView("v:nope", { name: "x" }, st), false); assert.equal(W.editView(W.listViews(st)[0].src.ref, { name: "x" }, st), false);
  assert.equal(W.cleanNote("x".repeat(300)).length, 120);
  /* the note rides the six-word copy, cleaned, and is never in a shared link */
  const w = W.get("v:v2", st); W.editView(w.k, { note: "For Aunt Ann" }, st, 1.9e12 + 2);
  const n = W.get(w.k, st), cleaned = RF.cleanCanvas({ v: 1, items: { [n.k]: n }, gone: {} }).items[n.k];
  assert.equal(cleaned.note, "For Aunt Ann"); assert.deepEqual(cleaned, n, "a view with a note passes the cleaning unchanged");
  assert.equal(JSON.stringify(await W.shareDecode(await W.shareEncode(n))).includes("Aunt Ann"), false, "a shared link carries the view's name, never the note");
  const odd = JSON.parse(JSON.stringify(n)); odd.note = "<i>x</i>\u0000y"; assert.equal(RF.cleanCanvas({ v: 1, items: { [odd.k]: odd }, gone: {} }).items[odd.k].note, "x y");
});

test("the View button's choice rides in the tree's record as `vw`: only when it is not the default, the centre as a hash, nothing about anyone", () => {
  const src = { t: "link", ref: LINK }, mk = lens => W.makeRecord(src, W.linkLabel(LINK), { ...plain(), lens }, 1.7e12);
  for (const l of [undefined, null, { m: "canvas", g: 5, c: "side", t: 2 }, { m: "canvas" }, "fan", 7]) assert.equal("vw" in mk(l).w, false, "the default view adds nothing to the record: " + JSON.stringify(l));
  const fan = mk({ m: "fan", g: 6, c: "place", t: 1, r: "defranceski:" + NAMES[1] }), text = JSON.stringify(fan);
  assert.deepEqual({ ...fan.w.vw, r: undefined }, { m: "fan", g: 6, c: "place", t: 1, r: undefined });
  assert.match(fan.w.vw.r, /^[0-9a-z]{1,16}$/);
  for (const n of NAMES) assert.equal(text.includes(n), false, n);
  assert.equal(text.includes("defranceski"), false);
  /* the strip folded is a choice worth keeping on its own */
  assert.deepEqual(mk({ m: "canvas", g: 5, c: "side", t: 0 }).w.vw, { m: "canvas", g: 5, c: "side", t: 0 });
  /* and it comes back: the centre is found again among the tree's own people, and is dropped if that person is no longer in the tree */
  const back = W.unpack(fan.w, fan.k, known(), bridges());
  assert.deepEqual(back.lens, { m: "fan", g: 6, c: "place", t: 1, r: "defranceski:" + NAMES[1] });
  assert.equal(W.unpack(fan.w, fan.k, known().filter(k => !k.includes(NAMES[1])), bridges()).lens.r, "");
  assert.equal("lens" in W.unpack(W.makeRecord(src, "x", plain(), 1.7e12).w, "l:" + LINK, known(), bridges()), false, "a record without a View comes back without one, as before");
  /* the six-word copy keeps it unchanged, and cleans anything odd */
  assert.deepEqual(RF.cleanCanvas({ v: 1, items: { [fan.k]: fan }, gone: {} }).items[fan.k], fan);
  const odd = JSON.parse(JSON.stringify(fan)); odd.w.vw = { m: "spiral", g: 99, c: "evil", t: 7, r: "Anna Example", zz: "Anna" };
  assert.deepEqual(RF.cleanCanvas({ v: 1, items: { [odd.k]: odd }, gone: {} }).items[odd.k].w.vw, { m: "canvas", g: 7, c: "side", t: 2 });
  odd.w.vw = "fan"; assert.equal("vw" in RF.cleanCanvas({ v: 1, items: { [odd.k]: odd }, gone: {} }).items[odd.k].w, false);
});

test("the Backup page says the chosen View is kept", () => {
  assert.match(read("../src/pages/backup.astro"), /<b>View<\/b> you chose/);
});
