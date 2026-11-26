/* WHERE THE FAMILY NAMES ARE MOST COMMON. David: «in our plans/stories, show where these names feature most». The table is ranks only (DZS, Census 2021), so
   these hold the lookup to what the table can say, over the real table, and hold the browser's copy and the built pages' copy together. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { face, whereRanked, areaForPlace, ordinal } from "../src/lib/hr-surname-towns.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const F = load("story-engine.js", { summary: load("atlas-summary.js") });
const todo = (() => { const m = { exports: {} }; new Function("module", "window", src("story-todo.js"))(m, undefined); return m.exports; })();
const T = face();
const DREZNIK = { name: "Drežnik", lat: 45.2903, lon: 17.4697 };

test("the table reads whole: one country, every county, over five hundred towns and municipalities, and no placeholder as a surname", () => {
  const kind = (k) => T.areas.filter((a) => a.k === k).length;
  assert.equal(kind("country"), 1);
  assert.ok(kind("county") >= 20);
  assert.ok(kind("town") + kind("municipality") >= 550);
  assert.ok(T.areas.every((a) => a.s.length > 0 && a.s.length <= 10 && !a.s.includes("z")));
  assert.ok(T.areas.filter((a) => a.y != null).length > 530);
});

test("namesake municipalities sit in their own county", () => {
  const at = (n, c) => T.areas.find((a) => a.n === n && a.c.includes(c));
  assert.ok(at("Lovinac", "Lika").y > 44.3, "Lovinac in Lika, not its namesake nearer Zadar");
  assert.ok(at("Crnac", "Virovitica").x > 17.5);
  assert.ok(at("Dubrava", "Zagreb").x > 16.3);
});

test("a name is listed by rank, then by distance from the family's place", () => {
  const r = F.censusWhere(T, "Mihaljević", DREZNIK);
  assert.ok(r.areas.length >= 5);
  for (let i = 1; i < r.areas.length; i++) {
    const a = r.areas[i - 1], b = r.areas[i];
    assert.ok(a.rank < b.rank || (a.rank === b.rank && (a.km ?? 1e9) <= (b.km ?? 1e9)), `${a.n} before ${b.n}`);
  }
  assert.ok(r.areas.every((a) => a.km > 0));
});

test("a name in no list says so with the 2011 count, and nothing more", () => {
  const r = F.censusWhere(T, "Fratrović", DREZNIK);
  assert.deepEqual([r.areas, r.counties, r.country], [[], [], null]);
  assert.equal(r.counted, 13);
});

test("accents count; a name typed without them is shown as the lists spell it, and says so", () => {
  const r = F.censusWhere(T, "Mihaljevic", null);
  assert.equal(r.as, "Mihaljević");
  assert.ok(r.areas.length && r.areas.every((a) => a.km === null));
  assert.equal(F.censusWhere(T, "mihaljević", null).as, "");
});

test("the built pages' lookup agrees with the browser's", () => {
  for (const n of ["Horvat", "Mihaljević", "Dautović"]) {
    const a = whereRanked(n), b = F.censusWhere(T, n, null);
    assert.deepEqual(a.areas.map((x) => [x.area.name, x.rank]).sort(), b.areas.map((x) => [x.n, x.rank]).sort(), n);
    assert.equal(a.country, b.country, n);
    assert.equal(a.counties.length, b.counties.length, n);
  }
  assert.equal(whereRanked("Fratrović"), null);
});

test("a story with no Croatian place shows nothing; one with a Croatian place measures from it and lists the nearest towns", () => {
  const people = [{ surnameTyped: "Mihaljević" }, { surnameTyped: "Mihaljević", maiden: "Fratrović" }];
  assert.equal(F.censusFor(T, people, [], [{ cc: "SI" }]), null);
  const home = { name: "Drežnik", lat: DREZNIK.lat, lon: DREZNIK.lon, cc: "HR" };
  const c = F.censusFor(T, people, [{ info: home, role: "lived" }], [home]);
  assert.deepEqual(c.rows.map((r) => r.name), ["Mihaljević", "Fratrović"]);
  assert.equal(c.home.name, "Drežnik");
  assert.equal(c.around.length, 3);
  assert.equal(c.around[0].n, "Rešetari");
});

test("the plan carries a section on the names, with the source", () => {
  const home = { name: "Drežnik", lat: DREZNIK.lat, lon: DREZNIK.lon, cc: "HR", row: { i: "x" }, cols: [] };
  const people = [{ surnameTyped: "Mihaljević" }, { surnameTyped: "Fratrović" }];
  const census = F.censusFor(T, people, [{ info: home, role: "lived" }], [home]);
  const plan = todo.build({ facts: { route: [{ info: home, role: "lived" }], kin: [] }, names: { census }, people }, { base: "/" });
  const s = plan.sections.find((x) => x.key === "names");
  assert.ok(s, "a names section");
  assert.match(s.items[0].title, /^Mihaljević: ranks highest in /);
  assert.match(s.items[1].title, /in no town's ten most common/);
  assert.match(s.items[1].why, /13 people/);
  assert.match(s.items.at(-1).detail, /Census 2021/);
});

test("a place's page takes its own municipality's list, and never a namesake's", () => {
  const places = JSON.parse(fs.readFileSync(path.join(here, "../../data/places.json"), "utf8")).places;
  const cepin = areaForPlace(places.find((p) => p.id === "cepin"));
  assert.equal(cepin.area.name, "Čepin");
  assert.equal(areaForPlace({ id: "zz", country: "HR", admin: { adm1: "Split-Dalmatia", adm2: "Općina Otok" } }).area.countyEn, "Split-Dalmatia");
  assert.equal(areaForPlace({ id: "zz", country: "SI", admin: { adm2: "Čepin" } }), null);
  assert.deepEqual([1, 2, 3, 4, 11, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
});
