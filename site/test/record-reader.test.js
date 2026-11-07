/* Reading the record: the term finder, the date decoder and the terms file. Every example here is invented or is a plain
   date formula; no person from any register appears. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/record-reader.js"), "utf8"))(mod);
const R = mod.exports;
const data = JSON.parse(fs.readFileSync(path.join(here, "../../data/record-terms.json"), "utf8"));
const idx = R.index(data.terms);
const ids = q => R.find(idx, q).map(r => r.term.id);

test("spelling folds the way registers do", () => {
  assert.equal(R.norm("Iohannes"), R.norm("Johannes"));
  assert.equal(R.norm("Vxor"), R.norm("uxor"));
  assert.equal(R.norm("FILIAE"), R.norm("filie"));
  assert.equal(R.norm("  Sept. "), "sept");
});

test("a form, an abbreviation and another ending all reach the same card", () => {
  assert.equal(ids("uxoris")[0], "uxor");
  assert.equal(ids("uxorem")[0], "uxor");
  assert.equal(ids("filiabus")[0], "filia");
  assert.ok(ids("7bris").includes("september"));
  assert.ok(ids("xbris").includes("december"));
  assert.ok(ids("septembris").includes("september"));
});

test("English finds the Latin and a typo-free miss finds nothing", () => {
  assert.ok(ids("godfather").includes("patrinus"));
  assert.ok(ids("widow").includes("vidua"));
  assert.deepEqual(ids("zzzzqx"), []);
  assert.deepEqual(ids(""), []);
});

test("the event filter keeps the right record type and the words that serve all", () => {
  const r = R.find(idx, "filius", { events: ["marriage"] }).map(x => x.term.id);
  assert.ok(r.includes("filius"), "'all' terms stay");
  const b = R.find(idx, "obstetrix", { events: ["burial"] });
  assert.equal(b.length, 0, "a baptism term does not show under burials");
});

test("dates in words, numerals and the old month signs decode with their working", () => {
  const a = R.decodeDate("die 30 7bris 1671");
  assert.deepEqual([a.day, a.month, a.year, a.text, a.ok], [30, 9, 1671, "30 September 1671", true]);
  assert.ok(a.working.some(w => /September/.test(w)));
  const b = R.decodeDate("die undecima februarii anno millesimo septingentesimo quadragesimo sexto");
  assert.equal(b.text, "11 February 1746"); assert.equal(b.ok, true);
  const c = R.decodeDate("xxii Xbris 1802"); assert.equal(c.text, "22 December 1802");
  const d = R.decodeDate("die vigesima secunda augusti 1790"); assert.equal(d.text, "22 August 1790");
  const f = R.decodeDate("xvi martii 1801"); assert.equal(f.text, "16 March 1801");
  const e = R.decodeDate("9bris 14 1855"); assert.equal(e.month, 11); assert.equal(e.day, 14);
});

test("the decoder says what it did not read and refuses to invent", () => {
  const a = R.decodeDate("septembris"); assert.equal(a.ok, false); assert.ok(a.warnings.some(w => /year/.test(w)));
  const b = R.decodeDate("die 31 aprilis 1700"); assert.equal(b.ok, false); assert.ok(b.warnings.some(w => /no 31 April/i.test(w)));
  const c = R.decodeDate("29 februarii 1701"); assert.equal(c.ok, false);
  const d = R.decodeDate("gibberish"); assert.equal(d.ok, false); assert.equal(d.day, null);
  const e = R.decodeDate("12 martii 1500"); assert.ok(e.warnings.some(w => /Julian/.test(w)));
});

test("the terms file is sourced, ordered and holds no person", () => {
  const ids2 = data.terms.map(t => t.id);
  assert.equal(new Set(ids2).size, ids2.length, "term ids are unique");
  for (const t of data.terms) {
    assert.ok(t.src.length && t.src.every(s => data.sources[s]), `${t.id} cites a listed source`);
    assert.ok(t.forms.length && t.means, `${t.id} has forms and a meaning`);
    assert.doesNotMatch(JSON.stringify(t), /\b(David|Defranceski|Kosina|Luwinski)\b/, "no family names");
  }
  assert.ok(Object.values(data.sources).every(s => /^https:\/\//.test(s.url)), "every source has an address");
});

test("the script never leaves the browser", () => {
  const src = fs.readFileSync(path.join(here, "../public/js/record-reader.js"), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/);
});

test("the words around the people in an entry are findable in any of their endings: parentum, patre, matris", async () => {
  const fs = await import("node:fs"), path = await import("node:path"), { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url)), m = { exports: {} };
  new Function("module", fs.readFileSync(path.join(here, "../public/js/record-reader.js"), "utf8"))(m);
  const idx = m.exports.index(JSON.parse(fs.readFileSync(path.join(here, "../../data/record-terms.json"), "utf8")).terms);
  for (const [w, id] of [["parentum", "parentes"], ["parentibus", "parentes"], ["patre", "pater"], ["matris", "mater"]]) assert.equal(m.exports.find(idx, w, {})[0].term.id, id, w);
});

test("a heading of two words that no single card holds falls back to the cards for its words, and says so", async () => {
  const fs = await import("node:fs"), path = await import("node:path"), { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url)), m = { exports: {} };
  new Function("module", fs.readFileSync(path.join(here, "../public/js/record-reader.js"), "utf8"))(m);
  const idx = m.exports.index(JSON.parse(fs.readFileSync(path.join(here, "../../data/record-terms.json"), "utf8")).terms);
  assert.equal(m.exports.find(idx, "nomina", {})[0].term.id, "nomen");
  assert.equal(m.exports.find(idx, "nomina", {})[0].score, 100, "nomina is a written form, not a loose match");
  const r = m.exports.find(idx, "Nomina Parentum", {});
  assert.deepEqual(r.map((x) => x.term.id).sort(), ["nomen", "parentes"]);
  assert.equal(r.partial, true);
  assert.equal(m.exports.find(idx, "parentum", {}).partial, undefined, "a single word is never partial");
  assert.deepEqual(m.exports.find(idx, "zzzq qqqx", {}), []);
});
