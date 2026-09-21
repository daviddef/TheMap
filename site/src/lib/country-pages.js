/* WHICH COUNTRIES HAVE A PAGE — computed once, used by everything.
 *
 * The surname timeline links /country/<cc>/ for every country a name was
 * borne in, and Wikidata knows people born in Israel, Singapore, Algeria,
 * Taiwan, Vietnam and East Germany. This atlas has no collections, places
 * or providers for any of them, so those pages were never generated and
 * 14,027 links pointed at 404s — Israel alone had 1,185.
 *
 * Two copies of a derived set is how the shard keys came to disagree
 * between build and client, so there is exactly one here: country/[cc].astro
 * generates from it and every page that links asks it first. A country
 * without a page still gets its name printed; it just is not a link.
 */
import cols from "../data/collections-full.json";
import full from "../data/places-full.json";
import provs from "../../public/providers.json";

const set = new Set();
for (const c of cols.collections) for (const k of c.countries) if (k !== "*") set.add(k);
for (const p of full.places) if (p.country) set.add(p.country);
for (const p of provs.providers) for (const k of p.countries) if (k !== "*") set.add(k);

export const COUNTRY_PAGES = set;
export const hasCountryPage = (cc) => set.has(cc);
