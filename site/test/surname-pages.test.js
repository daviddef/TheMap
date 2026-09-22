/* The rule that decides which surnames get a page.
 *
 * It has drifted twice: once between the page and the sitemap, which left
 * 17,961 pages live and 3,577 listed, and once — deliberately — into
 * build.py, which mirrors it in Python so the map can link without 404ing.
 * check-data.py compares those two over the real corpus. These tests pin
 * the rule itself, so a change to it has to be a decision rather than an
 * accident. */
import test from "node:test";
import assert from "node:assert/strict";
import { slugForSurname, earnsPage, surnamePageSlugs }
  from "../src/lib/surname-pages.js";

const withCountries = (n = 1, how = "register") =>
  Array.from({ length: n }, (_, i) => ({ cc: ["PL", "US", "FR", "DE"][i], how, n: 10 }));

test("slug: accents folded, punctuation collapsed, no stray dashes", () => {
  assert.equal(slugForSurname("Blažević"), "blazevic");
  assert.equal(slugForSurname("D'Arcy"), "d-arcy");
  assert.equal(slugForSurname("de Franceschi"), "de-franceschi");
  assert.equal(slugForSurname("  Kosina  "), "kosina");
  assert.equal(slugForSurname("O'Brien-Smith"), "o-brien-smith");
});

test("a name with no country never earns a page", () => {
  assert.equal(earnsPage({ countries: [], variants: [{ n: "x", how: "curated" }] }), false);
  assert.equal(earnsPage({ variants: [] }), false);
  assert.equal(earnsPage(null), false);
});

test("a curated variant earns a page on its own", () => {
  assert.equal(earnsPage({ countries: withCountries(1),
                           variants: [{ n: "Peters", how: "curated" }] }), true);
});

test("archive evidence earns a page on its own", () => {
  assert.equal(earnsPage({ countries: [{ cc: "HR", how: "archive" }],
                           variants: [] }), true);
});

test("spelling needs three COUNTED countries, not three of any kind", () => {
  const spelling = [{ n: "Kozina", how: "spelling" }];
  /* This is the clause Denmark broke: an uncounted register satisfying a
     threshold calibrated on counts took the page set from 16,138 to
     27,724, and only 207 of those were Danish names. */
  const threeUncounted = [{ cc: "DK", how: "register" },
                          { cc: "SE", how: "register" },
                          { cc: "NO", how: "register" }];
  assert.equal(earnsPage({ countries: threeUncounted, variants: spelling }), false,
    "three countries with no count must not earn a page");
  assert.equal(earnsPage({ countries: withCountries(3), variants: spelling }), true);
  assert.equal(earnsPage({ countries: withCountries(2), variants: spelling }), false);
});

test("a sounds-alike variant is never enough", () => {
  assert.equal(earnsPage({ countries: withCountries(4),
                           variants: [{ n: "Kosyna", how: "sounds" }] }), false);
});

test("slugs are deduplicated and only for names that earn one", () => {
  const out = surnamePageSlugs([
    { n: "Kosina", countries: withCountries(3), variants: [{ n: "Kozina", how: "spelling" }] },
    { n: "kosina", countries: withCountries(3), variants: [{ n: "Kozina", how: "spelling" }] },
    { n: "Nobody", countries: withCountries(1), variants: [] },
  ]);
  assert.deepEqual(out, ["kosina"]);
});
