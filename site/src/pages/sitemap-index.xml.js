/* The sitemap index. 5,924 URLs in one file works and tells you nothing —
   split by type, Search Console reports indexing per file, so «are the surname
   pages being indexed» becomes a question with an answer. */
import full from "../data/places-full.json";
import regions from "../../public/regions.json";
import provs from "../../public/providers.json";
import cols from "../data/collections-full.json";
import { corpus } from "../lib/surname-corpus.js";
import { surnamePageSlugs } from "../lib/surname-pages.js";

/* Read once, off disk. This file and surname/[name].astro must agree on
   which names have pages — a sitemap listing URLs that were never built is
   the bug surnamePageSlugs exists to prevent — so they share both the rule
   and the corpus. */
const surn = corpus();

export const SETS = ["pages", "places", "archives", "countries", "regions", "surnames"];

/* A SITEMAP MAY HOLD 50,000 URLS, AND «places» HELD 56,582.
 *
 * The sitemaps.org limit is 50,000 URLs and 50 MB per file, and a file over
 * either is not truncated by Google — it is REJECTED. So the one sitemap that
 * mattered most, every place page on this atlas, was being thrown away whole,
 * and the number went past the limit quietly as the atlas grew: 46,000 places
 * was fine, 56,582 was not, and nothing said so.
 *
 * It matters more here than it would elsewhere, because there is almost no
 * link path to those pages. The front page is a map drawn in the browser, so
 * a crawler reading the HTML finds twenty-five links and not one /place/ URL;
 * the only route is /places/ then /places/2/ and so on, ninety-five pages
 * deep, which crawlers follow badly. The sitemap is what that depth is
 * supposed to be rescued by.
 *
 * 45,000 rather than 50,000, so this does not have to be revisited the week
 * the atlas crosses the line again. */
const PER_SITEMAP = 45000;

/* The sitemap files that actually get written: one per set, or several when a
   set is too big. A set that fits keeps its plain name, so sitemap-pages.xml
   stays sitemap-pages.xml and only the oversized ones are numbered. */
export function sitemapFiles() {
  const out = [];
  for (const set of SETS) {
    const n = urlsFor(set).length;
    const parts = Math.max(1, Math.ceil(n / PER_SITEMAP));
    if (parts === 1) out.push({ name: `sitemap-${set}`, set, part: 0 });
    else for (let i = 1; i <= parts; i++)
      out.push({ name: `sitemap-${set}-${i}`, set, part: i });
  }
  return out;
}

/* The slice of a set that one file carries. part 0 means «all of it». */
export function urlsForFile(set, part) {
  const all = urlsFor(set);
  if (!part) return all;
  return all.slice((part - 1) * PER_SITEMAP, part * PER_SITEMAP);
}

export function urlsFor(set) {
  const slug = (x) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (set === "pages") {
    /* The place index is paginated — /places/, /places/2/ and so on. Listing
       only the first page would leave the rest out of the sitemap, and the
       whole reason that index exists is that nothing it links to should be
       an orphan. PER_PAGE here must match the page's own. */
    const PER_PAGE = 600;
    const pages = Math.max(1, Math.ceil(full.places.length / PER_PAGE));
    const placeIndex = [["places/", "0.9"]];
    for (let i = 2; i <= pages; i++) placeIndex.push([`places/${i}/`, "0.4"]);
    return [["", "1.0"], ["start/", "0.9"], ["about/", "0.6"], ["providers/", "0.9"],
            ["jurisdictions/", "0.9"], ...placeIndex, ["countries/", "0.9"],
            ["surnames/", "0.9"], ["coverage/", "0.8"], ["changelog/", "0.4"],
            ["add/", "0.5"], ["data/", "0.7"], ["worklist/", "0.4"],
            /* The lookup that answers for the 922,645 names with no page of
               their own. One URL, not 922,645 doorways. */
            ["surname/", "0.8"],
            ["privacy/", "0.3"]];
  }
  if (set === "places") return full.places.map((p) => [`place/${p.id}/`, "0.6"]);
  if (set === "archives") return provs.providers.map((p) => [`archive/${p.id}/`, "0.7"]);
  if (set === "regions") return regions.regions.map((r) => [`region/${r.id}/`, "0.8"]);
  if (set === "countries") {
    const ccs = new Set([
      ...cols.collections.flatMap((c) => c.countries),
      ...full.places.map((p) => p.country).filter(Boolean),
      ...provs.providers.flatMap((p) => p.countries).filter((k) => k !== "*"),
    ]);
    return [...ccs].map((cc) => [`country/${cc.toLowerCase()}/`, "0.8"]);
  }
  if (set === "surnames") {
    /* THE SAME RULE THE PAGES ARE BUILT FROM, imported rather than copied.
       This file kept its own copy and it never followed: 17,961 surname
       pages were live and 3,577 were listed here. Kosina, Defranceschi and
       Luwinski all had pages and none of them were in the sitemap. */
    return surnamePageSlugs(surn.surnames).map((s) => [`surname/${s}/`, "0.5"]);
  }
  return [];
}

export function base(site) {
  const b = new URL(import.meta.env.BASE_URL, site || "https://daviddef.github.io");
  return b.href.replace(/\/?$/, "/");
}

export async function GET({ site }) {
  const b = base(site);
  const today = new Date().toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapFiles().map((f) => `  <sitemap><loc>${b}${f.name}.xml</loc><lastmod>${today}</lastmod></sitemap>`).join("\n")}
</sitemapindex>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
