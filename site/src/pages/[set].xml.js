/* One sitemap per kind of page. */
import { SETS, urlsFor, base } from "./sitemap-index.xml.js";

export function getStaticPaths() {
  return SETS.map((s) => ({ params: { set: `sitemap-${s}` }, props: { set: s } }));
}

export async function GET({ props, site }) {
  const b = base(site);
  const today = new Date().toISOString().slice(0, 10);
  const rows = urlsFor(props.set)
    .map(([p, pri]) => `  <url><loc>${b}${p}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
