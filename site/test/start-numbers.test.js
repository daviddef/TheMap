/* The numbers on /start/ and in the story tour are counted from the data, not typed (src/lib/start-data.js). This feeds the pure
 * functions a small fixture to prove the arithmetic, then runs them on the real files to prove that every example the tour uses
 * (the old name, the surname forms, the given names) exists in the catalogue it claims to come from. */
import test from "node:test";
import assert from "node:assert/strict";
import { computeStartNumbers, buildTour, loadInputs, EXAMPLES, fmt } from "../src/lib/start-data.js";
import { tourMarkup } from "../src/lib/start-tour-markup.js";

const fixture = () => ({
  places: [{ a: 0, v: 10 }, { a: 1, v: 5 }, { a: 2 }, { a: 2 }],           // free, index, unsurveyed, unsurveyed
  rank: ["free", "index", "unsurveyed"], countryNames: {},
  full: [{ id: "a", country: "HR", collections: [1, 2, 3] }, { id: "b", country: "HR", collections: [] }, { id: "c", country: "AU", collections: [1] },
    { id: "d", country: "IT", collections: [1], via: "geonames-admin" }],
  regions: [{ id: "r1", eras: [{}, {}, {}] }, { id: "r2", eras: [{}] }], regimes: {},
  providers: [{ access: "unsurveyed" }, { access: "free" }, { access: "free" }], declined: 7,
  flagPages: 245, flagIndex: { counts: { hubs: 34 } }, trove: 2018, terms: 51,
  givenFamilies: { counts: { families: 711, forms: 6041 } }, surnameFamilies: { counts: { families: 127 } },
  gazetteer: { all: 100, places: 40, names: 90 }, archives: 9, repo: "https://example.org/r",
});

test("counts come from the files, not from the page", () => {
  const n = computeStartNumbers(fixture());
  assert.equal(n.placesRaw, 4);
  assert.equal(n.volumesRaw, 15);
  assert.equal(n.regionsRaw, 2);
  assert.equal(n.erasRaw, 4);
  assert.equal(n.surveyedRaw, 2);
  assert.equal(n.unsurveyedPct, "50.0");
  assert.equal(n.walkedRaw, 2, "a place with volumes, not a bare admin-area guess");
  assert.equal(n.walkedCountries, "2");
  assert.equal(n.hrPlaces, "2");
  assert.equal(n.hrVolumes, "3");
  assert.equal(n.sources, "3");
  assert.equal(n.sourcesUnopened, "1");
  assert.equal(n.sourcesOpened, "2");
  assert.equal(n.declined, "7");
  assert.equal(n.altPlaces, "40");
  assert.equal(n.altNames, "90");
  assert.equal(n.archivesWord, "nine");
  assert.equal(n.countries, "3", "falls back to the countries that have a dot");
  assert.equal(computeStartNumbers(fixture(), { countriesKnown: 195 }).countries, "195");
});

test("when a harvest adds a place, the number moves with it", () => {
  const f = fixture(); f.places.push({ a: 0, v: 100 });
  const n = computeStartNumbers(f);
  assert.equal(n.placesRaw, 5); assert.equal(n.volumesRaw, 115); assert.equal(n.surveyedRaw, 3); assert.equal(n.unsurveyedPct, "40.0");
});

test("fmt groups thousands the way the rest of the site does", () => { assert.equal(fmt(3425991), "3,425,991"); });

let REAL;
try { REAL = loadInputs(); } catch (e) { REAL = null; }
const real = test.bind(null);

real("the real data gives the tour its example forms", { skip: !REAL && "generated data not built (npm run data)" }, () => {
  const n = computeStartNumbers(REAL);
  const { data, ex, sr } = buildTour(REAL, n);
  const sur = REAL.surnameFamilies.families.find((f) => f.id === EXAMPLES.surnameFamily);
  const members = new Set(sur.members.map((m) => m.form));
  for (const f of data.forms) assert.ok(members.has(f), `${f} is not a form in the ${sur.id} family`);
  const giv = REAL.givenFamilies.families.find((f) => f.id === EXAMPLES.givenFamily);
  const gm = new Set(giv.members.map((m) => m.form));
  for (const f of EXAMPLES.givenForms) assert.ok(gm.has(f), `${f} is not in the ${giv.id} given-name family`);
  for (const id of Object.values(EXAMPLES.placeIds)) assert.ok(REAL.placeNames.places.some((p) => p.id === id), `place-names.json has no ${id}`);
  assert.equal(sr.length, 13, "one screen-reader line per chapter");
  assert.ok(Array.isArray(ex.words) ? ex.words.length >= 3 : true);
});

real("the real markup carries the live numbers and no holes", { skip: !REAL && "generated data not built (npm run data)" }, () => {
  const n = computeStartNumbers(REAL, { countriesKnown: 195 });
  const html = tourMarkup(buildTour(REAL, n));
  for (const needle of [n.places, n.volumes, n.unsurveyedPct, n.newspapers, n.flagPages, n.hubs, n.givenForms]) assert.ok(html.includes(needle), `missing ${needle}`);
  assert.ok(!/undefined|\[object|NaN/.test(html), "a hole in the markup");
  assert.equal((html.match(/class="ch[ "]/g) || []).length >= 13 || /data-sr=/.test(html), true);
  const m = html.match(/<script type="application\/json" id="ra-tour-data">([\s\S]*?)<\/script>/);
  assert.ok(m, "no data script"); assert.doesNotThrow(() => JSON.parse(m[1]));
  assert.ok(/invented/i.test(html), "the staged grandmother must say she is invented");
});
