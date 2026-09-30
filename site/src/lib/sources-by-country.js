/* The national and regional sources covering a country, computed ONCE each.
 *
 * Both the place page and the surname page filter all 195 providers and sort
 * them, in their frontmatter, which Astro runs per page — 7,391 place pages
 * and ~3,500 surname pages against the same 95 countries. The answer depends
 * only on the country code, so it is worth exactly one computation per country
 * and was costing about 1.4 million.
 *
 * THE WORLDWIDE SERVICES USED TO BE EXCLUDED, and the reason given was that
 * «covering everywhere is not a fact about here, and listing FamilySearch under
 * every country on earth would bury the five sources that actually mean
 * something». David would not accept that and was right not to; measured, the
 * justification does not hold:
 *
 *   - THERE ARE NO FIVE SOURCES TO BURY. The median country with any source of
 *     its own has ONE. 83 of the 103 have three or fewer; six have ten or more.
 *   - THE WEIGHT ARGUMENT WAS BORROWED FROM ANOTHER PROBLEM. All twelve
 *     worldwide rows together are 4.6 KB of JSON, 132 characters of prose each.
 *     The 89 KB that justified it was Italy's 126 provincial archives, and the
 *     distance narrowing below already fixed that.
 *   - ELEVEN OF THE TWELVE REACHED THE READER BY NO OTHER ROUTE. Only
 *     FamilySearch appears per place, because its collections and volumes ARE
 *     this atlas's corpus. Ancestry, MyHeritage, Geneanet, Geni, WikiTree, Find
 *     a Grave, BillionGraves, the Internet Archive, JewishGen, Arolsen and Yad
 *     Vashem were on no place page and in no panel, anywhere, for any country.
 *
 * And for the 134 countries with no provider of their own — Peru among them,
 * with 31 FamilySearch collections sitting in this same repository — the rule
 * produced a page that said nothing while the atlas held the evidence.
 *
 * So they are shown for every country now, marked `worldwide: true`, and the
 * pages list them in their own group BENEATH the local ones. Ordering does the
 * protecting that exclusion was doing, without withholding eleven real sources
 * from everybody to defend a median of one.
 *
 * WHY THERE IS A DISTANCE ARGUMENT. Italy has 126 providers, 120 of them
 * provincial state archives publishing through Antenati, and the country
 * filter alone put every one of them on every Italian place page. Teramo, in
 * Abruzzo, was being told to write to the state archive of Novara and of
 * Bassano del Grappa — five hundred kilometres north, holding nothing of
 * Teramo's. Each row carries its prose, so that list was 89 KB of a 105 KB
 * page, and across the Italian pages it was most of the reason the built site
 * stood at 1,215 MB against a 1,024 MB limit.
 *
 * A provincial archive is a claim over its province, so proximity is the
 * honest ranking for it. Country-wide bodies — the national archive, the
 * libraries, the aggregators — are kept whatever the distance, because they
 * really do cover the whole country. No other country has more than 12
 * providers, so everywhere else this changes nothing but the order. */
import provs from "../../public/providers.json";

const KIND = ["national-archive", "diocesan", "regional-archive", "library",
              "volunteer", "aggregator", "commercial"];
const RANK = ["free", "account", "index", "mixed", "paid", "catalogue", "onsite"];
const cache = new Map();

/* Kinds whose reach is the whole country, so distance says nothing about them. */
const COUNTRYWIDE = new Set(["national-archive", "library", "aggregator",
                             "volunteer", "commercial"]);

export const access = provs.access || {};

/* The twelve that declare `countries: ["*"]` — FamilySearch, Ancestry,
 * MyHeritage, Geneanet, Geni, WikiTree, Find a Grave, BillionGraves, the
 * Internet Archive, JewishGen, Arolsen and Yad Vashem. Computed once. */
const WORLDWIDE = provs.providers
  .filter((p) => (p.countries || []).includes("*"))
  .sort((a, b) => RANK.indexOf(a.access) - RANK.indexOf(b.access));

export function sourcesFor(cc) {
  if (!cc) return [];
  let hit = cache.get(cc);
  if (!hit) {
    hit = provs.providers
      .filter((p) => (p.countries || []).includes(cc))
      .sort((a, b) => (KIND.indexOf(a.kind) + 1 || 99) - (KIND.indexOf(b.kind) + 1 || 99)
                   || RANK.indexOf(a.access) - RANK.indexOf(b.access));
    /* AFTER the country's own, never instead of them, and marked so a page can
       say «these cover everywhere, including here» rather than implying a
       national archive. */
    hit = hit.concat(WORLDWIDE.map((p) => ({ ...p, worldwide: true })));
    cache.set(cc, hit);
  }
  return hit;
}

/* Straight-line km. Good enough to tell a province from a peninsula. */
function km(aLat, aLon, bLat, bLon) {
  const R = 6371, t = Math.PI / 180;
  const dLat = (bLat - aLat) * t, dLon = (bLon - aLon) * t;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* The sources for a country, with the local ones narrowed to those near this
 * place. Returns { shown, hidden } — hidden is a count, so the page can say
 * how many it is not listing rather than pretending they do not exist. */
export function sourcesNear(cc, lat, lon, limit = 10) {
  const every = sourcesFor(cc);
  if (!every.length) return { shown: [], hidden: 0, worldwide: [] };
  /* THE WORLDWIDE TWELVE ARE TAKEN OUT OF THE COMPETITION, NOT OUT OF THE
     PAGE. Nine of them are `aggregator`, `commercial` or `volunteer`, which
     COUNTRYWIDE below keeps whatever the distance — so leaving them in the
     same pool would spend the whole limit on them and show a reader in Abruzzo
     twelve global services and not one Italian archive. That is precisely the
     burying the old exclusion feared, arrived at from the other direction.
     They are returned separately, and the pages put them last. */
  const worldwide = every.filter((p) => p.worldwide);
  const all = every.filter((p) => !p.worldwide);
  if (!all.length) return { shown: [], hidden: 0, worldwide };
  if (lat == null || lon == null || all.length <= limit) {
    return { shown: all.slice(0, limit),
             hidden: Math.max(0, all.length - limit), worldwide };
  }
  const wide = all.filter((p) => COUNTRYWIDE.has(p.kind));
  const local = all.filter((p) => !COUNTRYWIDE.has(p.kind))
    .map((p) => {
      const at = p.at || {};
      const d = at.lat == null ? Infinity : km(lat, lon, at.lat, at.lon);
      return { p, d };
    })
    .sort((a, b) => a.d - b.d);
  const room = Math.max(0, limit - wide.length);
  const near = local.slice(0, room).map((r) => ({ ...r.p, km: Math.round(r.d) }));
  /* Country-wide first, then the nearest local ones: the reader wants the
     body that certainly covers them before the one that probably does. */
  const shown = [...wide, ...near];
  return { shown, hidden: all.length - shown.length, worldwide };
}
