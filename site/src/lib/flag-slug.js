/* WHICH FLAG-ATLAS PAGE A COUNTRY CODE BELONGS TO — in one place.
 *
 * This table used to live as an object literal inside RecordMap.astro's inline
 * script, which was fine while the map was the only thing that needed it. The
 * «who governed» table on a place page needs exactly the same answer, and a
 * second copy of a hand-corrected mapping is a second copy to get wrong: three
 * of these entries are corrections found by looking (BA and GB were pointing at
 * pages that do not exist, ES was missing entirely), and a duplicate would have
 * silently kept the old mistakes.
 *
 * FRANCE IS ABSENT ON PURPOSE. The flags atlas has no France page, which is an
 * upstream gap rather than a slug this file could guess; anything asking for FR
 * gets nothing and prints nothing, which is the honest outcome.
 */
export const FLAG_SLUG = {
  AR: "argentina", AT: "austria", AU: "australia", BA: "bosnia",
  BE: "belgium", BY: "belarus", CA: "canada", CZ: "czechia", DE: "germany",
  DK: "denmark", EE: "estonia", ES: "spain", FI: "finland",
  GB: "uk", HR: "croatia", HU: "hungary", IE: "ireland",
  IT: "italy", LT: "lithuania", LV: "latvia", NL: "netherlands",
  NO: "norway", PL: "poland", PT: "portugal", RO: "romania", RS: "serbia",
  RU: "russia", SE: "sweden", SI: "slovenia", SK: "slovakia", TR: "turkey",
  UA: "ukraine", US: "united-states", ZA: "south-africa"
};

/* The flag a state flew during a span, not the one it flies now — which is the
 * whole point. An era 1813–1918 must not be labelled with the modern Austrian
 * flag; this atlas keeps period and present apart everywhere else and the
 * «who governed» table is the last place to blur them.
 *
 * OVERLAP, NOT CONTAINMENT, and the same rule the map's own era flags use: a
 * flag adopted in 1861 and struck in 1946 covers 1918–1943 completely and
 * would be missed by any test asking for flags BEGINNING inside the span.
 * Where several overlap — most long eras — the one covering the most years of
 * it wins, because a row has room for one.
 */
export function flagForSpan(eras, cc, from, to) {
  const base = FLAG_SLUG[String(cc || "").toUpperCase()];
  if (!base) return null;
  const slug = base + "-flags";
  const NOW = new Date().getFullYear();
  let best = null, bestSpan = 0;
  for (const e of eras) {
    if (e.slug !== slug || !e.from) continue;
    const f = +e.from;
    const t = +e.to || (e.present === true ? NOW : f);
    const span = Math.min(t, to) - Math.max(f, from);
    if (span > 0 && span > bestSpan) { bestSpan = span; best = e; }
  }
  return best;
}
