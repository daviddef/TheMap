/* WHAT YEARS THE PAPER COVERS, PER COUNTRY — read once for the whole build.
 *
 * A surname page could say a name was attested in ten countries and could not
 * say WHEN. Its three dated sources are each the wrong shape for the question:
 * the Wikidata birth series is people notable enough for an encyclopaedia (22
 * of them for Defranceski, against ten attested countries), the national
 * registers are undated snapshots, and the archive attestation covers eight
 * archives. So the page told a reader where and never when, and a family's
 * movement across a century was the one thing it could not show.
 *
 * THIS DOES NOT ANSWER THAT QUESTION, AND MUST NOT LOOK AS IF IT DOES.
 * Nothing in this atlas knows when a family was somewhere: it maps where the
 * paper is, not what is inside it, and «a surname in a register's title is a
 * book's subject, not a person». What this answers is the question a
 * researcher actually acts on — where could I look, and for which years —
 * from the from/to carried on every one of 2.9 million volumes.
 *
 * The distinction is the whole point, so the wording on the page has to carry
 * it: «records covering 1660-1900», never «the name was there in 1660».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let DATA = { countries: {} };
try {
  /* From the working directory, not from import.meta.url: Vite bundles this
     into dist/chunks/, where a path relative to the source file resolves to
     nothing. surname-timeline.js learned that the hard way and its comment
     says so; this follows it rather than rediscovering it. */
  DATA = JSON.parse(readFileSync(resolve("public/coverage-by-country.json"), "utf8"));
} catch {
  try {
    DATA = JSON.parse(readFileSync(resolve("site/public/coverage-by-country.json"), "utf8"));
  } catch {
    DATA = { countries: {} };
  }
}

const C = DATA.countries || {};

/** What the holdings cover for one country, or null. */
export function coverageFor(cc) {
  return (cc && C[cc.toUpperCase()]) || null;
}

/**
 * One row per country a surname is attested in, earliest first, each with a
 * decade strip ready to draw. Countries with no dated holdings come back with
 * `covered: false` rather than being dropped — «attested here, and this atlas
 * holds nothing dated for it» is a true and useful thing to say.
 */
export function coverageRows(ccs, names = {}) {
  const rows = (ccs || []).map((cc) => {
    const c = coverageFor(cc);
    return {
      cc,
      name: names[cc] || cc,
      covered: !!c,
      from: c ? c.from : null,
      to: c ? c.to : null,
      volumes: c ? c.volumes : 0,
      places: c ? c.places : 0,
      kinds: c ? c.kinds || [] : [],
      decades: c ? c.decades || {} : {},
    };
  });
  rows.sort((a, b) => {
    if (a.covered !== b.covered) return a.covered ? -1 : 1;
    if (!a.covered) return a.name.localeCompare(b.name);
    return a.from - b.from;
  });
  return rows;
}

/** The span every row has to be drawn against, so the strips line up. */
export function span(rows) {
  const f = rows.filter((r) => r.covered);
  if (!f.length) return null;
  const lo = Math.floor(Math.min(...f.map((r) => r.from)) / 10) * 10;
  const hi = Math.ceil(Math.max(...f.map((r) => r.to)) / 10) * 10;
  return { from: lo, to: hi, decades: (hi - lo) / 10 };
}

export const countriesWithCoverage = Object.keys(C).length;
