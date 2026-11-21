/* ONE SET OF COUNTRY NUMBERS, COMPUTED ONCE.

   David: «every country can just move to "places"? surely and summarise the
   same numbers there?» — and he was right that they were the same numbers.
   /countries/ counted collections, archives and places in a sortable table;
   /places/ counted places again in a text grid; /surnames/ counted nothing and
   showed no countries at all. Three pages describing one set of facts, each
   with its own arithmetic, which is how two of them come to disagree.

   THE SURNAME NUMBER IS NOT LIKE THE OTHERS, AND IS SPLIT SO IT CANNOT LIE.
   Places and archives are honest counts of what this atlas holds. A surname
   count looks like the same kind of number and is not: it measures which
   NATIONAL REGISTERS have been harvested, not where names are. Denmark shows
   290,156 and Croatia 141, and that gap is entirely about register coverage.
   So a country is in exactly one of three states, and the page says which:

     register   a national register has been harvested — the count is real,
                and a small one (Croatia, 141) is a thin harvest, which is a
                finding rather than a blank
     archive    names known only because a family archive names them; no
                register, so no count worth printing
     none       nothing at all, which is 116 of 152 countries and is the
                worklist — David: «countries that have no surnames is
                something we want to see! ie a country card with "0" is
                something we need to sort out»
*/
import cols from "../data/collections-full.json";
import full from "../data/places-full.json";
import provs from "../../public/providers.json";
import regions from "../../public/regions.json";
import { atlas as idx } from "./atlas.js";
import { flagFor } from "./flags.js";
import { corpus } from "./surname-corpus.js";
import fs from "node:fs";

/* A COLLECTION «REACHES A PLACE» WHEN IT IS CATALOGUED UNDER A TOWN, COUNTY OR PROVINCE RATHER THAN UNDER THE COUNTRY.
   Moved here from /coverage/, which counted it for its own table; the country cards now say the same thing, from the same
   rule, so the two cannot disagree. */
const LOCAL = new Set(["CITY","TOWN","COMMUNE","HAMLET","VILLAGE","PARISH","MUNICIPALITY",
                       "BOROUGH","SUBURB","CIVIL_PARISH","TOWNSHIP","COUNTY","BR_COUNTY",
                       "PROVINCE","DEPARTMENT","DISTRICT","SHIRE","CANTON"]);
function worldArchives() {
  for (const f of ["../data/world-archives.json", "data/world-archives.json"]) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")).archives || []; } catch { /* next */ }
  }
  return [];
}

let CACHE = null;

export function countryMetrics() {
  if (CACHE) return CACHE;
  const CN = idx.countries || {};
  const row = {};
  const at = (cc) => (row[cc] = row[cc] ||
    { cc, cols: 0, local: 0, places: 0, walked: 0, divs: 0, arch: 0, nat: 0, reg: 0, arc: 0 });

  for (const c of cols.collections) {
    const isLocal = (c.places || []).some((p) => LOCAL.has(p.type));
    for (const k of c.countries) { at(k).cols++; if (isLocal) at(k).local++; }
  }
  /* A DRAWN DOT IS NOT A WALKED PLACE: a GeoNames district nobody has read counts as a dot, never as walked. */
  for (const p of full.places) if (p.country) {
    const r = at(p.country);
    r.places++;
    if (p.via === "geonames-admin") r.divs++;
    else if ((p.collections || []).length) r.walked++;
  }
  /* A COUNTRY THE ATLAS KNOWS ONLY THROUGH A RECORD REGION IS STILL A COUNTRY. /coverage/ counted these (237) and this list did not
     (212), so the Gaps tab and the Countries tab disagreed about how many countries there are. */
  for (const r of regions.regions) for (const cc of (r.countries || [])) at(cc);
  for (const p of provs.providers) {
    for (const k of p.countries) if (k !== "*") at(k).arch++;
  }
  /* A NATIONAL ARCHIVE NAMES A COUNTRY'S ARCHIVE; IT DOES NOT MAKE THE COUNTRY (same rule as /coverage/). */
  for (const a of worldArchives()) if (row[a.cc]) row[a.cc].nat++;

  /* SURNAME COUNTS ARE ADDED LAST AND NEVER MAKE A COUNTRY: a country is a country because it has collections, places, archives or
     a record region, which is the rule /coverage/ counts by, so the two pages give one number. */
  /* A name counts ONCE per country however many rows attest it — the question
     is «how many names does this country's register name», not «how many
     attestations are on file», and the second is a fact about our harvest
     shape rather than about the country. */
  for (const r of corpus().surnames || []) {
    const seen = new Set();
    for (const c of r.countries || []) {
      if (!c.cc || seen.has(c.cc)) continue;
      seen.add(c.cc);
      const t = row[c.cc];
      if (!t) continue;
      if (c.how === "register") t.reg++;
      else if (c.how === "archive" || c.how === "curated") t.arc++;
    }
  }

  CACHE = Object.values(row)
    .map((r) => ({
      ...r,
      name: CN[r.cc] || r.cc,
      reach: r.cols ? Math.round((100 * r.local) / r.cols) : 0,
      flag: flagFor(r.cc),
      /* The three states above, decided here so no page has to re-derive it
         and get a different answer. */
      names: r.reg > 0 ? "register" : r.arc > 0 ? "archive" : "none",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return CACHE;
}

export function countryTotals() {
  const l = countryMetrics();
  return {
    countries: l.length,
    walked: l.filter((r) => r.places > 0).length,
    withRegister: l.filter((r) => r.names === "register").length,
    archiveOnly: l.filter((r) => r.names === "archive").length,
    noNames: l.filter((r) => r.names === "none").length,
    withFlag: l.filter((r) => r.flag).length,
    withWalked: l.filter((r) => r.walked > 0).length,
    withNational: l.filter((r) => r.nat > 0).length,
  };
}
