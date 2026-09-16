/* Every page, for the crawlers. Written from the same data the pages are, so
   it cannot drift out of step with what actually exists. */
import full from "../data/places-full.json";
import regions from "../../public/regions.json";
import provs from "../../public/providers.json";
import cols from "../data/collections-full.json";

export async function GET({ site }) {
  const base = new URL(import.meta.env.BASE_URL, site || "https://daviddef.github.io");
  const url = (p) => new URL(p.replace(/^\//, ""), base.href.replace(/\/?$/, "/")).href;
  const today = new Date().toISOString().slice(0, 10);

  const pages = [
    ["", "1.0"], ["about/", "0.6"], ["providers/", "0.9"], ["jurisdictions/", "0.9"],
    ["places/", "0.9"], ["countries/", "0.9"], ["surnames/", "0.9"], ["coverage/", "0.8"], ["add/", "0.5"], ["privacy/", "0.3"],
    ...[...new Set([
      ...cols.collections.flatMap((c) => c.countries),
      ...full.places.map((p) => p.country).filter(Boolean),
      ...provs.providers.flatMap((p) => p.countries).filter((k) => k !== "*"),
    ])].map((cc) => [`country/${cc.toLowerCase()}/`, "0.8"]),
    ...regions.regions.map((r) => [`region/${r.id}/`, "0.8"]),
    ...provs.providers.map((p) => [`archive/${p.id}/`, "0.7"]),
    ...full.places.map((p) => [`place/${p.id}/`, "0.6"]),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([p, pri]) =>
  `  <url><loc>${url("/" + p)}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`
).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
