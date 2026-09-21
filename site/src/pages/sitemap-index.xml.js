/* The sitemap index. 5,924 URLs in one file works and tells you nothing —
   split by type, Search Console reports indexing per file, so «are the surname
   pages being indexed» becomes a question with an answer. */
import full from "../data/places-full.json";
import regions from "../../public/regions.json";
import provs from "../../public/providers.json";
import cols from "../data/collections-full.json";
import surn from "../data/surnames.json";
import { surnamePageSlugs } from "../lib/surname-pages.js";

export const SETS = ["pages", "places", "archives", "countries", "regions", "surnames"];

export function urlsFor(set) {
  const slug = (x) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (set === "pages")
    return [["", "1.0"], ["start/", "0.9"], ["about/", "0.6"], ["providers/", "0.9"],
            ["jurisdictions/", "0.9"], ["places/", "0.9"], ["countries/", "0.9"],
            ["surnames/", "0.9"], ["coverage/", "0.8"], ["changelog/", "0.4"],
            ["add/", "0.5"], ["privacy/", "0.3"]];
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
${SETS.map((s) => `  <sitemap><loc>${b}sitemap-${s}.xml</loc><lastmod>${today}</lastmod></sitemap>`).join("\n")}
</sitemapindex>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
