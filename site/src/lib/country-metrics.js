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
import { atlas as idx } from "./atlas.js";
import { flagFor } from "./flags.js";
import { corpus } from "./surname-corpus.js";

let CACHE = null;

export function countryMetrics() {
  if (CACHE) return CACHE;
  const CN = idx.countries || {};
  const row = {};
  const at = (cc) => (row[cc] = row[cc] ||
    { cc, cols: 0, places: 0, arch: 0, reg: 0, arc: 0 });

  for (const c of cols.collections) for (const k of c.countries) at(k).cols++;
  for (const p of full.places) if (p.country) at(p.country).places++;
  for (const p of provs.providers) {
    for (const k of p.countries) if (k !== "*") at(k).arch++;
  }

  /* A name counts ONCE per country however many rows attest it — the question
     is «how many names does this country's register name», not «how many
     attestations are on file», and the second is a fact about our harvest
     shape rather than about the country. */
  for (const r of corpus().surnames || []) {
    const seen = new Set();
    for (const c of r.countries || []) {
      if (!c.cc || seen.has(c.cc)) continue;
      seen.add(c.cc);
      const t = at(c.cc);
      if (c.how === "register") t.reg++;
      else if (c.how === "archive" || c.how === "curated") t.arc++;
    }
  }

  CACHE = Object.values(row)
    .map((r) => ({
      ...r,
      name: CN[r.cc] || r.cc,
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
  };
}
