/* Tell us who you're looking for: the pure half of the page (public/js/looking-for.js). It must only ever name what the data holds,
   and must say so when the data holds nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("looking-for.js"))(m); return m.exports; })();

const rows = [
  { i: "gracisce", n: "Gračišće", cc: "HR", c: 32, q: "gallignana" },
  { i: "gracac", n: "Gračac", cc: "HR", c: 3 },
  { i: "hamilton-oh", n: "Hamilton", cc: "US", c: 0, v: 5 },
  { i: "hamilton-ca", n: "Hamilton", cc: "CA", c: 0, v: 9 },
  { i: "pazin", n: "Pazin", cc: "HR", c: 40, q: "mitterburg" },
];

test("a year is four digits in range, else nothing", () => {
  assert.equal(F.toYear("1905"), 1905);
  assert.equal(F.toYear(" 1905 "), 1905);
  assert.equal(F.toYear("05"), null);
  assert.equal(F.toYear("1066"), null);
  assert.equal(F.toYear("2099"), null);
  assert.equal(F.toYear(""), null);
});

test("places are offered by name, by older name and by a word, the most held first", () => {
  assert.deepEqual(F.suggest(rows, "gra", 8).map((s) => s.r.i), ["gracisce", "gracac"]);
  const old = F.suggest(rows, "Gallignana", 8);
  assert.equal(old[0].r.i, "gracisce");
  assert.equal(old[0].via, "gallignana", "an older name says it matched on that name");
  assert.deepEqual(F.suggest(rows, "hamilton", 8).map((s) => s.r.i), ["hamilton-ca", "hamilton-oh"], "ties are broken by volumes held");
  assert.deepEqual(F.suggest(rows, "g", 8), [], "one letter offers nothing");
  assert.equal(F.suggest(rows, "gra", 1).length, 1);
});

test("the window of years is exact when the birth year is known and a flagged guess when it is not", () => {
  const known = F.windows(1905, 1880);
  assert.equal(known.guessed, false);
  assert.deepEqual(known.birth, [1879, 1881]);
  const guess = F.windows(1905, null);
  assert.equal(guess.guessed, true);
  assert.deepEqual(guess.birth, [1860, 1890]);
  assert.equal(F.windows(null, null), null);
  assert.ok(F.windows(2020, null).marriage[1] <= 2026, "never into the future");
});

test("volumes are chosen by kind and overlap, in date order", () => {
  const cols = [
    { title: "Births 1850-1880", kinds: ["b"], from: 1850, to: 1880 },
    { title: "Births 1700-1800", kinds: ["b"], from: 1700, to: 1800 },
    { title: "Marriages 1850-1900", kinds: ["m"], from: 1850, to: 1900 },
    { title: "Births 1881-1900", kinds: ["b"], from: 1881, to: 1900 },
  ];
  assert.deepEqual(F.volumesFor(cols, "b", [1860, 1890]).map((c) => c.title), ["Births 1850-1880", "Births 1881-1900"]);
  assert.deepEqual(F.volumesFor(cols, "m", null).map((c) => c.title), ["Marriages 1850-1900"]);
  assert.deepEqual(F.volumesFor(cols, "d", [1860, 1890]), []);
});

test("a volume's years are not repeated when the title already has them", () => {
  assert.equal(F.volLabel({ title: "Births 1841-1899", from: 1841, to: 1899 }), "Births 1841-1899");
  assert.equal(F.volLabel({ title: "Births (Rođeni)", from: 1841, to: 1899 }), "Births (Rođeni) (1841–1899)");
});

const eras = [
  { from: 1815, to: 1918, regime: "habsburg", polity: "Austria–Hungary — Küstenland", filedUnder: ["dapa", "anno"], note: "Parish registers to Pazin." },
  { from: 1918, to: 1943, regime: "italy", polity: "Italy — Provincia dell'Istria", filedUnder: ["familysearch"], note: "THE TRAP." },
];
const regimes = { habsburg: { label: "Habsburg" }, italy: { label: "Italy" } };

test("who held the ground: the era of the year, or an honest 'no table'", () => {
  const info = { name: "Gračišće", countryName: "Croatia", eras, regimes };
  assert.equal(F.captionAt(info, 1905).polity, "Austria–Hungary — Küstenland");
  assert.equal(F.captionAt(info, 1905).regime, "Habsburg");
  assert.deepEqual(F.captionAt(info, 1930).filedUnder, ["familysearch"]);
  assert.deepEqual(F.captionAt({ ...info, pname: { dapa: "State Archives in Pazin" } }, 1905).filedUnder, ["State Archives in Pazin", "anno"], "a source id is shown by its name when the catalogue has one");
  assert.equal(F.captionAt(info, 1918).polity, "Italy — Provincia dell'Istria", "an era ends where the next begins");
  const none = F.captionAt({ name: "Hamilton", countryName: "United States", eras: null, regimes: null }, 1905);
  assert.equal(none.tracked, false);
  assert.equal(none.polity, "United States");
  assert.match(none.note, /no era table/);
  assert.equal(F.captionAt(info, 1700).tracked, false, "before the table begins is not guessed");
});

test("the traveller waits, crosses over two years, then stays", () => {
  assert.equal(F.progress(1905, 1890), 0);
  assert.equal(F.progress(1905, 1904), 0);
  assert.equal(F.progress(1905, 1905), 0.5);
  assert.equal(F.progress(1905, 1906), 1);
  assert.equal(F.progress(1905, 1930), 1);
  assert.equal(F.progress(null, 1930), 0);
  assert.deepEqual(F.between([0, 0], [10, 20], 0.5), [5, 10]);
});

const given = [{ canon: "Giovanni", id: "giovanni", langs: { latin: [{ form: "Joannes", status: "rule" }, { form: "Zorzi", status: "lead" }], italian: [{ form: "Giovanni", status: "same" }, { form: "Zuane", status: "attested" }] } }];

test("only forms with positive evidence are offered as spellings", () => {
  assert.deepEqual(F.givenForms(given[0]), ["Giovanni", "Joannes", "Zuane"]);
});

const from = {
  name: "Gračišće", countryName: "Croatia", older: ["Gallignana"], eras, regimes, href: "/place/gracisce/",
  cols: [{ title: "Births 1850-1880", kinds: ["b"], from: 1850, to: 1880, held: "ŽU Gračišće", access: "onsite" }, { title: "Marriages 1860-1900", kinds: ["m"], from: 1860, to: 1900 }],
};

test("the plan is ordered, numbered, and every item with a link is from the data", () => {
  const plan = F.buildPlan({ holds: "photo", name: "Ivan Kosina", left: 1905, born: null, from, to: { name: "Hamilton", countryName: "United States", eras: null, regimes: null, lat: 0, lon: 0 },
    providers: [{ id: "x", name: "Z Archive", kind: "national-archive", access: "free", url: "https://z.example/" }, { id: "y", name: "A Index", kind: "index", access: "account", url: "https://a.example/" }],
    given: A.givenIn("Ivan", A.buildGiven([{ canon: "Ivan", id: "ivan", langs: { croatian: [{ form: "Ivan", status: "same" }, { form: "Joannes", status: "rule" }] } }]), null), base: "/" });
  assert.deepEqual(plan.map((s) => s.id), ["hold", "name", "place", "births", "family", "arrival", "neighbours", "keep"]);
  assert.deepEqual(plan.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  const births = plan.find((s) => s.id === "births");
  assert.match(births.items[0].text, /Births 1850-1880/);
  assert.match(births.not, /guess from the year/, "a guessed window is said to be a guess");
  assert.match(plan.find((s) => s.id === "place").items.map((i) => i.text).join(" "), /Gallignana/);
  assert.match(plan.find((s) => s.id === "place").items.map((i) => i.text).join(" "), /Austria–Hungary/);
  const arrival = plan.find((s) => s.id === "arrival").items.filter((i) => i.href).map((i) => i.href);
  assert.deepEqual(arrival, ["https://a.example/", "https://z.example/"], "sources are alphabetical, not by size");
  const external = plan.flatMap((s) => s.items).filter((i) => i.href && /^https?:/.test(i.href)).map((i) => i.href);
  assert.deepEqual(external.sort(), ["https://a.example/", "https://z.example/"], "no external link that the provider catalogue did not supply");
});

test("a gap is reported as a gap in the Atlas, never as 'there are none'", () => {
  const bare = { ...from, cols: [], older: [] };
  const plan = F.buildPlan({ holds: "story", name: "", left: 1905, born: 1880, from: bare, to: null, providers: [], given: [], base: "/" });
  const births = plan.find((s) => s.id === "births");
  assert.match(births.items[0].text, /lists no birth or baptism volume/);
  assert.match(births.items[0].text, /gap in the Atlas/);
  assert.equal(births.not.includes("guess"), false, "a known birth year is not described as a guess");
  assert.match(plan.find((s) => s.id === "arrival").items[0].text, /Choose where/);
});

test("with no origin place the plan asks for one rather than inventing a register", () => {
  const plan = F.buildPlan({ holds: "letter", name: "", left: null, born: null, from: null, to: null, providers: [], given: [], base: "/" });
  assert.deepEqual(plan.map((s) => s.id), ["hold", "name", "place", "arrival", "neighbours", "keep"]);
  assert.equal(plan.some((s) => s.id === "births"), false);
});

test("the page uses textContent only and never parses a place name or a note as markup", () => {
  const js = src("looking-for.js");
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(js), false);
});

test("nothing typed on the page is stored or sent", () => {
  const js = src("looking-for.js");
  assert.equal(/localStorage|sessionStorage|indexedDB|XMLHttpRequest|method:\s*["']POST|navigator\.sendBeacon/.test(js), false);
  assert.equal(/fetch\(BASE \+ path\)/.test(js), true, "the only fetches are the site's own files");
});

test("the page is in the sitemap and the menu and is linked from Start here", () => {
  const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
  assert.match(read("src/pages/sitemap-index.xml.js"), /\["looking-for\/"/);
  assert.match(read("src/lib/nav.js"), /"\/looking-for\/"/);
  assert.match(read("src/pages/start.astro"), /\/looking-for\//);
});
