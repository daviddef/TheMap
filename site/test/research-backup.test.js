/* The research file (backup and share packs) and the fix-it decisions: what is kept, what is left out, and that nothing is lost on the way.
   Every name, place and person in these fixtures is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create, hashKey, mergeRows } from "../public/roots/js/decisions.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/research-file.js"), "utf8"))(mod);   // a classic script: no import, so evaluated
const RF = mod.exports;

const progress = () => ({
  v: 1, active: "kosina-senj",
  lines: { "kosina-senj": { name: "Kosina", where: "Senj", made: "2026-10-01" }, "lerena-x": { name: "Lerena", where: "", made: "2026-10-02" } },
  marks: {
    "volume:AAA-111": { t: "Births 1858-1900", where: "Senj", href: "/place/senj/", total: 174, walked: [[1, 20]],
      by: { "kosina-senj": { done: [[1, 47]], state: "found", note: "Mother was Anna Example, see image 12", since: "2026-10-03" }, "lerena-x": { done: [[60, 72]], state: "searched" } } },
    "volume:BBB-222": { t: "Marriages 1700-1760", where: "Trsat", by: { "lerena-x": { done: [[1, 5]], note: "a private note" } } },
    "volume:CCC-333": { t: "Deaths", where: "Krk", walked: [[1, 9]], by: {} },
  },
});

test("a backup keeps every line and mark, and the decisions when there are some", () => {
  const f = RF.buildBackup(progress(), { h1: { a: 1, t: "2026-11-01" } }, Date.parse("2026-11-05T10:00:00Z"));
  assert.equal(f.v, 2); assert.equal(f.exported, "2026-11-05"); assert.equal(Object.keys(f.marks).length, 3); assert.equal(Object.keys(f.lines).length, 2);
  assert.deepEqual(f.decisions, { h1: { a: 1, t: "2026-11-01" } });
  assert.equal(f.marks["volume:AAA-111"].by["kosina-senj"].note.includes("Anna"), true, "a backup keeps the owner's notes");
  assert.equal("decisions" in RF.buildBackup(progress(), {}), false);
});

test("a pack for one line holds that line's marks and the shared walks, and nothing of the other line", () => {
  const p = RF.buildPack(progress(), { line: "kosina-senj" }, Date.parse("2026-11-05T10:00:00Z"));
  assert.deepEqual(Object.keys(p.lines), ["kosina-senj"]);
  assert.deepEqual(Object.keys(p.marks).sort(), ["volume:AAA-111", "volume:CCC-333"]);
  assert.deepEqual(Object.keys(p.marks["volume:AAA-111"].by), ["kosina-senj"]);
  assert.deepEqual(p.marks["volume:AAA-111"].walked, [[1, 20]]);
  assert.equal(p.pack.scope, "line"); assert.match(p.pack.says, /not checked/);
});

test("a pack leaves notes and decisions out unless notes are asked for", () => {
  const without = JSON.stringify(RF.buildPack(progress(), {}));
  assert.doesNotMatch(without, /Anna Example|private note|"note"/);
  assert.doesNotMatch(without, /decisions/);
  const withNotes = JSON.stringify(RF.buildPack(progress(), { notes: true }));
  assert.match(withNotes, /Anna Example/);
  assert.throws(() => RF.buildPack(progress(), { line: "nobody" }), /No such family line/);
});

test("every kind of file reads back: export, pack, old v1 export, and a raw copy of browser storage", () => {
  const exp = RF.parseAny(JSON.stringify(RF.buildBackup(progress(), { h1: { d: 1, t: "2026-11-01" } })));
  assert.equal(exp.kind, "record-atlas-research"); assert.deepEqual(exp.decisions, { h1: { d: 1, t: "2026-11-01" } });
  assert.equal(RF.parseAny(JSON.stringify(RF.buildPack(progress(), {}))).kind, "record-atlas-pack");
  assert.equal(RF.parseAny(JSON.stringify({ v: 1, marks: { "volume:X": { done: [[1, 2]] } } })).kind, "old export");
  const raw = { origin: "https://daviddef.github.io", data: { "ra-progress-v1": JSON.stringify(progress()), "ra-fix-decisions-v1": JSON.stringify({ v: 1, on: true, rows: { h2: { a: 1 } } }) } };
  const got = RF.parseAny(JSON.stringify(raw));
  assert.equal(Object.keys(got.progress.marks).length, 3); assert.deepEqual(got.decisions, { h2: { a: 1 } });
  assert.throws(() => RF.parseAny(JSON.stringify({ nothing: 1 })), /not a Record Atlas research file/);
});

test("the backup status nudges on the reader's own changes, and never on the folded-in sessions", () => {
  const day = 86400000, now = Date.parse("2026-11-05T12:00:00Z"), at = n => new Date(now - n * day).toISOString();
  assert.equal(RF.status(null, null, false, now).level, "ok", "no marks: nothing to back up");
  assert.equal(RF.status(null, { first: at(0), last: at(0) }, true, now).level, "ok", "never backed up, but only today");
  assert.equal(RF.status(null, { first: at(2), last: at(0) }, true, now).level, "nudge");
  assert.equal(RF.status(null, { first: at(9), last: at(0) }, true, now).level, "urgent");
  assert.equal(RF.status({ at: at(40) }, { first: at(60), last: at(50) }, true, now).level, "ok", "unchanged since the backup, however old");
  assert.equal(RF.status({ at: at(3) }, { first: at(60), last: at(1) }, true, now).level, "ok", "changed but recent: no nag yet");
  assert.equal(RF.status({ at: at(9) }, { first: at(60), last: at(1) }, true, now).level, "nudge");
  assert.equal(RF.status({ at: at(40) }, { first: at(60), last: at(1) }, true, now).level, "urgent");
  assert.equal(RF.status(null, null, true, now).level, "nudge", "marks, no record of who made them: say so on the page");
});

test("the fingerprint changes with the work and not with key order", () => {
  const a = progress(), b = progress();
  assert.equal(RF.sigOf(a, {}), RF.sigOf(b, {}));
  const c = JSON.parse(JSON.stringify(a)); c.marks["volume:AAA-111"].by["kosina-senj"].done = [[1, 48]];
  assert.notEqual(RF.sigOf(a, {}), RF.sigOf(c, {}));
  const reordered = { marks: a.marks, lines: a.lines, active: a.active };
  assert.equal(RF.sigOf(a, {}), RF.sigOf(reordered, {}));
});

test("a pack link round-trips and says when it is too big for an address", async () => {
  const p = RF.buildPack(progress(), {});
  const link = await RF.encodeLink(p);
  assert.match(link, /^(z|p)\./); assert.match(link, /^[A-Za-z0-9._-]+$/, "safe in an address");
  assert.deepEqual(JSON.parse(await RF.decodeLink(link)), p);
  await assert.rejects(RF.decodeLink("x.abc"), /Not a Record Atlas pack link/);
  assert.ok(link.length < RF.LINK_MAX, "a small pack fits in a link");
});

/* ---- fix-it decisions ----------------------------------------------------------------------------------------------- */
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };

test("decisions are not kept until the visitor asks, and asking is remembered", () => {
  const s = mem(), d = create(s);
  assert.equal(d.put("p|Senj, Croatia", "a", true), false); assert.equal(s._m.size, 0, "nothing is written while it is off");
  d.setOn(true); assert.equal(d.isOn(), true);
  assert.equal(d.put("p|Senj, Croatia", "a", true, "2026-11-05"), true);
  assert.deepEqual(d.get("p|Senj, Croatia"), { a: 1, t: "2026-11-05" });
  assert.equal(create(s).get("p|Senj, Croatia").a, 1, "a fresh store on the same storage finds it again");
});

test("what is stored holds no place text and no person id", () => {
  const s = mem(), d = create(s); d.setOn(true);
  d.put("p|Senj, Croatia", "a", true); d.put("s|@I123@|age+place", "d", true); d.put("n|I77", "d", true);
  const raw = s.getItem("ra-fix-decisions-v1");
  assert.doesNotMatch(raw, /Senj|Croatia|I123|I77|age\+place/);
  assert.equal(d.count(), 3);
});

test("undoing a decision removes the row, and turning it off forgets everything", () => {
  const s = mem(), d = create(s); d.setOn(true);
  d.put("k", "a", true); d.put("k", "d", true); d.put("k", "a", false); assert.equal(d.get("k").d, 1); assert.equal(d.get("k").a, undefined);
  d.put("k", "d", false); assert.equal(d.get("k"), null); assert.equal(d.count(), 0);
  d.put("j", "a", true); d.setOn(false); assert.equal(s._m.size, 0); assert.equal(d.get("j"), null); assert.equal(d.isOn(), false);
});

test("a decisions file moves between devices and merges without losing either side", () => {
  const a = create(mem()), b = create(mem()); a.setOn(true); b.setOn(true);
  a.put("x", "a", true, "2026-11-01"); b.put("y", "d", true, "2026-11-02"); b.put("x", "d", true, "2026-11-04");
  assert.equal(a.load(b.fileText()), 2);
  assert.deepEqual(a.get("x"), { a: 1, d: 1, t: "2026-11-04" }); assert.equal(a.get("y").d, 1);
  assert.throws(() => a.load(JSON.stringify({ hello: 1 })), /not a decisions file/);
  assert.deepEqual(mergeRows({ h: { a: 1, t: "2026-01-01" } }, { h: { a: 1, t: "2026-02-02" }, g: { d: 1 } }), { h: { a: 1, t: "2026-02-02" }, g: { d: 1 } });
  assert.equal(hashKey("same"), hashKey("same")); assert.notEqual(hashKey("a"), hashKey("b"));
});

test("a browser with no storage still works, and forgetting keeps the switch on", () => {
  const d = create(null); assert.equal(d.available(), false); assert.equal(d.put("k", "a", true), false); assert.equal(d.get("k"), null);
  const s = mem(), e = create(s); e.setOn(true); e.put("k", "a", true); e.forget(); assert.equal(e.isOn(), true); assert.equal(e.count(), 0);
});

test("the research file feeds the progress kit what it already reads", () => {
  const kit = fs.readFileSync(path.join(here, "../public/js/progress-kit.js"), "utf8");
  assert.match(kit, /fromJSON: function \(text, mode\)/, "the importer the file relies on is still there");
  const rf = fs.readFileSync(path.join(here, "../public/js/research-file.js"), "utf8");
  assert.doesNotMatch(rf, /fetch\(|XMLHttpRequest|sendBeacon|document\.cookie/, "the research file never leaves the browser");
});
