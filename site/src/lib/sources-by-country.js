/* The national and regional sources covering a country, computed ONCE each.
 *
 * Both the place page and the surname page filter all 195 providers and sort
 * them, in their frontmatter, which Astro runs per page — 7,391 place pages
 * and ~3,500 surname pages against the same 95 countries. The answer depends
 * only on the country code, so it is worth exactly one computation per country
 * and was costing about 1.4 million.
 *
 * The worldwide services are excluded deliberately: covering everywhere is not
 * a fact about here, and listing FamilySearch under every country on earth
 * would bury the five sources that actually mean something. */
import provs from "../../public/providers.json";

const KIND = ["national-archive", "diocesan", "regional-archive", "library",
              "volunteer", "aggregator", "commercial"];
const RANK = ["free", "account", "index", "mixed", "paid", "catalogue", "onsite"];
const cache = new Map();

export const access = provs.access || {};

export function sourcesFor(cc) {
  if (!cc) return [];
  let hit = cache.get(cc);
  if (!hit) {
    hit = provs.providers
      .filter((p) => (p.countries || []).includes(cc))
      .sort((a, b) => (KIND.indexOf(a.kind) + 1 || 99) - (KIND.indexOf(b.kind) + 1 || 99)
                   || RANK.indexOf(a.access) - RANK.indexOf(b.access));
    cache.set(cc, hit);
  }
  return hit;
}
