/* The page half of "What the Atlas holds on this": finding the places a line names, the era a year falls in, the events near a place. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js", f), "utf8"))(m); return m.exports; };
const A = load("atlas-summary.js");

const rows = [
  { i: "gracisce", n: "Gračišće", cc: "HR", c: 32, q: "gallignana" },
  { i: "g-gallignana-x", n: "Gallignana", cc: "IT", c: 0 },
  { i: "pazin", n: "Pazin", cc: "HR", c: 40, q: "mitterburg" },
  { i: "bronx", n: "Bronx", cc: "US", c: 9, q: "bronx the" },
];

test("fold turns Gračišće and Đakovo into plain letters", () => {
  assert.equal(A.fold("Gračišće"), "gracisce");
  assert.equal(A.fold("Đakovo"), "dakovo");
});

test("a year is read from the text, and only a plausible one", () => {
  assert.equal(A.yearIn("Die 3 martii 1863 baptizatus"), 1863);
  assert.equal(A.yearIn("folio 12345"), null);
  assert.equal(A.yearIn("no year here"), null);
});

test("an older name finds the place, and the Atlas's own place comes first", () => {
  const map = A.buildMap(rows);
  const c = A.candidates("baptizatus in parochia Gallignana", map, {});
  assert.equal(c.length, 1);
  assert.equal(c[0].rows[0].i, "gracisce");
  assert.equal(c[0].rows.length, 2);
});

test("register words are not taken for places, and short words are ignored", () => {
  const map = A.buildMap([{ i: "x", n: "Anno", cc: "IT", c: 1 }, { i: "y", n: "Die", cc: "DE", c: 1 }]);
  assert.equal(A.candidates("anno die", map, { anno: 1 }).length, 0);
});

test("a word from a long list of other names does not match", () => {
  const map = A.buildMap(rows);
  assert.equal(A.candidates("the", map, {}).length, 0);
});

test("the era holding a year starts on its own from-year", () => {
  const eras = [{ from: 1374, to: 1805 }, { from: 1805, to: 1815 }, { from: 1815, to: 1918 }];
  assert.equal(A.eraAt(eras, 1863), 2);
  assert.equal(A.eraAt(eras, 1805), 1);
  assert.equal(A.eraAt(eras, 1200), -1);
  assert.equal(A.eraAt(eras, null), -1);
});

test("volumes covering a year", () => {
  const cols = [{ from: 1785, to: 1851 }, { from: 1852, to: 1900 }];
  assert.equal(A.volumesCovering(cols, 1863).length, 1);
  assert.equal(A.volumesCovering(cols, null).length, 0);
});

test("an event is matched by place and years, and polygons are [lat, lon]", () => {
  const sq = [[[44, 13], [44, 15], [46, 15], [46, 13]]];
  const ev = [{ n: "in", f: 1860, t: 1866, poly: sq }, { n: "wrong years", f: 1700, t: 1710, poly: sq }, { n: "elsewhere", f: 1860, t: 1866, poly: [[[10, 10], [10, 12], [12, 12], [12, 10]]] }];
  const got = A.eventsAt(ev, 45.28, 14.02, 1863, 5);
  assert.deepEqual(got.map((e) => e.n), ["in"]);
  assert.deepEqual(A.eventsAt(ev, 45.28, 14.02, null, 5), []);
});

test("given names are found by any catalogued form", () => {
  const g = A.buildGiven([{ id: "giovanni", canon: "Giovanni", langs: { latin: [{ form: "Joannes" }], italian: [{ form: "Zuane" }] } }]);
  assert.equal(A.givenIn("filius Joannes", g, {}).length, 1);
  assert.equal(A.givenIn("filius Joannes Zuane", g, {}).length, 1);
});

test("the page script builds markup with textContent only", () => {
  const src = fs.readFileSync(path.join(here, "../public/js/atlas-summary.js"), "utf8");
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(src));
});

test("language is read from the register words in the line, never from the place", () => {
  const tl = { uxoris: "la", obiit: "la", filius: "la" };
  const r = A.languageIn("Joannes filius obiit, obiit again", tl);
  assert.equal(r.length, 1);
  assert.equal(r[0].lang, "la");
  assert.deepEqual(r[0].words, ["filius", "obiit"]);
  assert.deepEqual(A.languageIn("Gračišće 1863", tl), []);
});

test("the flag is the most specific era that holds the year, and the newest with no year", () => {
  const f = [[925, 1102, "a"], [1358, 1808, "b"], [1527, 1868, "c"], [1868, 1918, "d"]];
  assert.equal(A.flagAt(f, 1600), "c");
  assert.equal(A.flagAt(f, 1400), "b");
  assert.equal(A.flagAt(f, 1868), "d");
  assert.equal(A.flagAt(f, 1200), null);
  assert.equal(A.flagAt(f, null), "d");
  assert.equal(A.flagAt(undefined, 1600), null);
});

test("around a year: era starts and events inside the window, in date order, the first era not counted as a change", () => {
  const eras = [{ from: 1797, to: 1805, polity: "Austria" }, { from: 1805, to: 1813, polity: "France", note: "Illyrian" }, { from: 1813, to: 1918, polity: "Austria again" }];
  const ev = [{ f: 1855, t: 1855, n: "Cholera", ty: "epidemic" }, { f: 1700, t: 1710, n: "Too early", ty: "war" }];
  const a = A.aroundYear(eras, ev, 1810, 10);
  assert.deepEqual(a.map((x) => x.y), [1805, 1813]);
  assert.equal(a[0].title, "Under France");
  assert.deepEqual(A.aroundYear(eras, ev, 1850, 10).map((x) => x.title), ["Cholera"]);
  assert.deepEqual(A.aroundYear(eras, ev, null, 10), []);
});

test("a volume is marked by waypoint, else address, else title", () => {
  assert.equal(A.volumeId({ waypoint: "9RK1-T3F", url: "u", title: "t" }), "volume:9RK1-T3F");
  assert.equal(A.volumeId({ url: "https://x/?wc=9R2Q-MNB%3A1" }), "volume:https://x/?wc=9R2Q-MNB%3A1");
  assert.equal(A.volumeId({ title: "Births 1800" }), "volume:Births 1800");
});

test("the place called exactly what was typed comes before one that only lists it", () => {
  const m = A.buildMap([{ i: "launceston", n: "Launceston", cc: "AU", c: 1, q: "australia launceston, tasmania," }, { i: "tasmania", n: "Tasmania", cc: "AU", c: 0 }]);
  assert.equal(A.candidates("all from Tasmania", m, {})[0].rows[0].i, "tasmania");
});

test("a qualifier like Gornji (Upper) alone is not a place", () => {
  const map = A.buildMap([{ i: "gornjidraganec", n: "Gornji Draganec", cc: "HR", c: 8, q: "draganec gornji" }]);
  assert.deepEqual(A.candidates("born in Gornji Rukavac", map, {}), []);
  assert.deepEqual(A.candidates("born in Gornji Rukavac", A.buildMap([{ i: "kriz", n: "Križ", cc: "HR", c: 3, q: "gornji" }]), {}), [], "not even through another place's alternative name");
  assert.equal(A.candidates("born in Gornji Draganec", map, {})[0].rows[0].i, "gornjidraganec");
  assert.equal(A.candidates("born in Draganec", map, {})[0].rows[0].i, "gornjidraganec");
});
