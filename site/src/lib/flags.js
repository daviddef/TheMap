/* THE FLAG FOR A COUNTRY CODE — computed once, used by everything.
 *
 * The flags atlas holds 210 drawn flags, every one of them already published
 * in flag-index.json and already fetched by the map. Until now they appeared
 * on exactly one of this site's four indexes: the flags atlas itself. The
 * countries table, the places directory and the surname pages — all of which
 * name countries constantly — showed none of them.
 *
 * WHY THIS IS NOT A ONE-LINER. The flags atlas names countries in its own
 * words and this site names them in the ISO table's, so «Cape Verde» has to
 * find «Cabo Verde» and «São Tomé & Príncipe» has to find «São Tomé and
 * Principe». That table of 22 aliases already exists inside build.py, where
 * it was written after hub totals came out silently short; it is mirrored
 * here rather than re-derived, and the two should be kept in step.
 *
 * THE HOME NATIONS ARE THE AWKWARD ONES. The flags atlas draws England,
 * Scotland, Wales and Northern Ireland separately, and all four alias to the
 * United Kingdom. A flag beside «United Kingdom» should be the Union Flag, so
 * an exact name match always wins over an alias, and the aliases only fill
 * what the exact pass left empty.
 */
import fi from "../../public/flag-index.json";
import { atlas as idx } from "./atlas.js";

/* Mirrors _ALIAS in scripts/build.py: the flags atlas's name -> the ISO one. */
const ALIAS = {
  "Antigua and Barbuda": "Antigua and Barb.",
  "Bosnia & Herzegovina": "Bosnia and Herz.",
  "Cape Verde": "Cabo Verde",
  "Central African Republic": "Central African Rep.",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Republic of the Congo": "Congo",
  "Dominican Republic": "Dominican Rep.",
  "Equatorial Guinea": "Eq. Guinea",
  "Eswatini": "eSwatini",
  "Marshall Islands": "Marshall Is.",
  "Saint Kitts and Nevis": "St. Kitts and Nevis",
  "Saint Vincent and the Grenadines": "St. Vin. and Gren.",
  "Solomon Islands": "Solomon Is.",
  "South Sudan": "S. Sudan",
  "São Tomé & Príncipe": "São Tomé and Principe",
  "The Gambia": "Gambia",
  "United States": "United States of America",
  "Vatican City": "Vatican",
  "Scotland": "United Kingdom",
  "Wales": "United Kingdom",
  "Northern Ireland": "United Kingdom",
  "England": "United Kingdom",
};

const fold = (s) =>
  (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* the ISO name -> cc, from the same table the rest of the site reads */
const nameToCc = {};
for (const [cc, name] of Object.entries(idx.countries || {})) nameToCc[fold(name)] = cc;

const byCc = {};
/* Exact names first, so «United Kingdom» claims GB before Scotland can. */
for (const c of fi.countries || []) {
  const cc = nameToCc[fold(c.name)];
  if (cc && !byCc[cc]) byCc[cc] = c;
}
for (const c of fi.countries || []) {
  const cc = nameToCc[fold(ALIAS[c.name] || "")];
  if (cc && !byCc[cc]) byCc[cc] = c;
}

/** The flags-atlas record for a country code, or null. */
export function flagFor(cc) {
  return (cc && byCc[cc.toUpperCase()]) || null;
}

/** Inner SVG for a country's flag, or null. Wrap in <svg viewBox="0 0 300 200">. */
export function flagSvg(cc) {
  const f = flagFor(cc);
  return f && f.flag ? f.flag : null;
}

/** Path to that country's page in the flags atlas, or null. */
export function flagPage(cc) {
  const f = flagFor(cc);
  return f && f.url ? "/" + f.url : null;
}

/** How many of the site's countries found a flag — for the gates to assert on. */
export const matched = Object.keys(byCc).length;
export const drawn = (fi.countries || []).length;
